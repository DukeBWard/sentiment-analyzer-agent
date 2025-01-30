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

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 400;

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

async function fetchCompanyDocs(ticker: string): Promise<string> {
  try {
    // Add delay to respect rate limits (10 requests per second)
    await sleep(200); // Reduced delay to 200ms

    // First, get the company's CIK number from the SEC API
    const companiesResponse = await secClient.get('https://www.sec.gov/files/company_tickers.json');
    const companies: Record<string, CompanyInfo> = companiesResponse.data;
    
    const company = Object.values(companies).find(c => c.ticker.toUpperCase() === ticker.toUpperCase());
    if (!company) {
      throw new Error(`Company with ticker ${ticker} not found`);
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
      throw new Error(`No 10-K filing found for ${ticker}`);
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

async function processDocument(html: string): Promise<string> {
  const $ = cheerio.load(html);
  // Extract text from the document, excluding scripts and styles
  return $('body').contents().not('script, style').text();
}

async function createPineconeIndex() {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!
  });

  return pinecone.Index(process.env.PINECONE_INDEX!);
}

async function processCompany(symbol: string, vectorStore: PineconeStore) {
  try {
    console.log(`Processing documents for ${symbol}...`);
    
    // Fetch and process the document
    const html = await fetchCompanyDocs(symbol);
    const text = await processDocument(html);
    console.log(`Extracted ${text.length} characters of text for ${symbol}`);

    // Split text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });
    const docs = await textSplitter.createDocuments([text]);
    console.log(`Split into ${docs.length} chunks for ${symbol}`);

    // Add metadata to documents
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
    // Store documents in Pinecone
    await vectorStore.addDocuments(docsWithMetadata);
    console.log(`Successfully processed and stored documents for ${symbol}`);
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error);
  }
}

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

async function getCustomTickers(): Promise<string[]> {
  try {
    const configPath = './config.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.customTickers || [];
    }
  } catch (error) {
    console.warn('Error reading custom tickers:', error);
  }
  return [];
}

async function main() {
  // Check for required environment variables
  const requiredEnvVars = [
    'PINECONE_API_KEY',
    'PINECONE_INDEX',
    'OPENAI_API_KEY'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Initialize embeddings
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-3-small"
  });

  // Initialize Pinecone
  const index = await createPineconeIndex();
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { 
    pineconeIndex: index as any 
  });

  // Get custom tickers from config file
  const customTickers = await getCustomTickers();
  
  // Combine default and custom tickers, removing duplicates
  const allTickers = [...new Set([...DEFAULT_TICKERS, ...customTickers])];
  console.log(`Processing documents for tickers: ${allTickers.join(', ')}`);

  // Process companies in parallel with a concurrency limit of 2
  await Promise.all(
    allTickers.map(symbol => processCompany(symbol, vectorStore))
  );
}

// Run the script
main().catch(console.error); 