import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as cheerio from 'cheerio';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { sleep } from 'openai/core';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key');
}

export const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

interface CompanyInfo {
  cik_str: string;
  ticker: string;
  title: string;
}

// Create an axios instance with SEC-compliant headers
const createSECClient = (host: string = 'www.sec.gov'): AxiosInstance => {
  return axios.create({
    headers: {
      'User-Agent': 'Stock-Sentiment-Analyzer 1.0.0 (Contact: duke402mc@gmail.com)',
      'Accept-Encoding': 'gzip, deflate',
      'Host': host
    },
    timeout: 10000
  });
};

const secClient = createSECClient();
const secDataClient = createSECClient('data.sec.gov');

class DocumentIngestor {
  private readonly CHUNK_SIZE = 2000;
  private readonly CHUNK_OVERLAP = 400;
  private vectorStore: PineconeStore;

  constructor(vectorStore: PineconeStore) {
    this.vectorStore = vectorStore;
  }

  private async processDocument(html: string): Promise<string> {
    const $ = cheerio.load(html);
    return $('body').contents().not('script, style').text();
  }

  private async fetchCompanyDocs(symbol: string): Promise<string> {
    try {
      // Add delay to respect rate limits (10 requests per second)
      await sleep(200); // Reduced delay to 200ms

      // First, get the company's CIK number from the SEC API
      const companiesResponse = await secClient.get('https://www.sec.gov/files/company_tickers.json');
      const companies: Record<string, CompanyInfo> = companiesResponse.data;
      
      const company = Object.values(companies).find(c => c.ticker.toUpperCase() === symbol.toUpperCase());
      if (!company) {
        throw new Error(`Company with ticker ${symbol} not found`);
      }

      // Add delay between requests
      await sleep(200);

      // Get the company's latest filings using the EDGAR API
      const cik = String(company.cik_str).padStart(10, '0');
      const filingsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
      console.log(`Fetching filings from: ${filingsUrl}`);
      const filingsResponse = await secDataClient.get(filingsUrl);
      
      // Find the most recent 10-K filing
      const filings = filingsResponse.data.filings.recent;
      const latestTenKIndex = filings.form.findIndex((form: string) => form === '10-K');
      
      if (latestTenKIndex === -1) {
        throw new Error(`No 10-K filing found for ${symbol}`);
      }

      // Add delay between requests
      await sleep(200);

      // Get the document URL using the EDGAR API
      const accessionNumber = filings.accessionNumber[latestTenKIndex].replace(/-/g, '');
      const primaryDocument = filings.primaryDocument[latestTenKIndex];
      const documentUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber}/${primaryDocument}`;
      console.log(`Fetching document from: ${documentUrl}`);
      
      // Fetch the document
      const documentResponse = await secClient.get(documentUrl);
      return documentResponse.data;
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.error('SEC API rate limit exceeded or access denied. Please wait and try again.');
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  async checkExistingDocument(symbol: string): Promise<boolean> {
    try {
      const embeddings = new OpenAIEmbeddings();
      const queryEmbedding = await embeddings.embedQuery("company");
      const index = (this.vectorStore as any).pineconeIndex;
      const queryResponse = await index.query({
        vector: queryEmbedding,
        filter: {
          symbol: { $eq: symbol.toUpperCase() }
        },
        topK: 1,
        includeMetadata: true
      });

      if (queryResponse.matches.length > 0) {
        const metadata = queryResponse.matches[0].metadata;
        const documentDate = new Date(metadata.timestamp);
        const daysSinceProcessed = (new Date().getTime() - documentDate.getTime()) / (1000 * 3600 * 24);
        
        if (daysSinceProcessed < 90) {
          console.log(`Skipping ${symbol}: Document was processed ${Math.floor(daysSinceProcessed)} days ago`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error(`Error checking existing document for ${symbol}:`, error);
      return false;
    }
  }

  async processCompany(symbol: string): Promise<void> {
    try {
      console.log(`Checking existing documents for ${symbol}...`);
      const hasRecentDocs = await this.checkExistingDocument(symbol);
      if (hasRecentDocs) return;

      console.log(`Processing documents for ${symbol}...`);
      const html = await this.fetchCompanyDocs(symbol);
      const text = await this.processDocument(html);
      console.log(`Extracted ${text.length} characters of text for ${symbol}`);

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.CHUNK_SIZE,
        chunkOverlap: this.CHUNK_OVERLAP,
      });
      const docs = await textSplitter.createDocuments([text]);
      console.log(`Split into ${docs.length} chunks for ${symbol}`);

      const docsWithMetadata = docs.map(doc => {
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            symbol: symbol,
            source: '10-K',
            timestamp: new Date().toISOString()
          }
        });
      });

      console.log(`Generating embeddings and storing ${docsWithMetadata.length} documents for ${symbol}...`);
      await this.vectorStore.addDocuments(docsWithMetadata);
      console.log(`Successfully processed and stored documents for ${symbol}`);
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);
    }
  }

  async getAllTickers(): Promise<string[]> {
    try {
      const configPath = './config.json';
      let customTickers: string[] = [];
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        customTickers = config.customTickers || [];
      }

      return [...new Set([...DEFAULT_TICKERS, ...customTickers])];
    } catch (error) {
      console.warn('Error reading custom tickers:', error);
      return DEFAULT_TICKERS;
    }
  }

  async updateCustomTickers(tickers: string[]): Promise<void> {
    try {
      const configPath = './config.json';
      const config = fs.existsSync(configPath) 
        ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
        : {};
      
      config.customTickers = tickers;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error updating custom tickers:', error);
      throw error;
    }
  }
}

export async function createIngestor(): Promise<DocumentIngestor> {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!
  });
  const index = pinecone.Index(process.env.PINECONE_INDEX!);
  const embeddings = new OpenAIEmbeddings();
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { 
    pineconeIndex: index
  });
  
  return new DocumentIngestor(vectorStore);
} 