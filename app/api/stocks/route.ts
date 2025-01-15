// app/api/stocks/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'
import yahooFinance from 'yahoo-finance2'
import FuzzySet from 'fuzzyset.js'
import http from 'http'
import https from 'https'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC', 'CRM', 'NFLX']

type TimeRange = '1d' | '5d' | '1mo' | '1y'
const VALID_TIME_RANGES: TimeRange[] = ['1d', '5d', '1mo', '1y']
type NewsItem = {
  stock: string;
  headline: string;
  url?: string;
  individualSentiment?: number;
}

type SentimentItem = {
  stock: string;
  headline: string;
  sentimentScore: number;
}

type YahooSummaryDetail = {
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  volume?: number;
  averageVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  beta?: number;
}

type YahooKeyStats = {
  priceToBook?: number;
}

type YahooFinancialData = {
  earningsGrowth?: number;
  revenueGrowth?: number;
  profitMargins?: number;
}

type NewsSource = {
  url: string;
  selectors: {
    article: string;
    headline: string;
    link: string;
  };
  baseUrl?: string;
}

type ChartData = { timestamp: string; price: number | null }

// Add custom axios instance with proper config
const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  },
  maxRedirects: 5,
  timeout: 15000,
  decompress: true,
  maxContentLength: 10 * 1024 * 1024, // 10MB
  maxBodyLength: 10 * 1024 * 1024, // 10MB
  validateStatus: (status) => status === 200,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});

// Add rate limiting utility
const rateLimiter = {
  queue: [] as (() => Promise<any>)[],
  processing: false,
  delay: 2000,

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  },

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }
    this.processing = false;
  }
};

async function getStockData(ticker: string, range: TimeRange = '1d') {
  const retryDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add delay between retries
      if (attempt > 0) {
        await retryDelay(2000 * attempt);
      }

      const [quote, quoteSummaryResult] = await Promise.all([
        yahooFinance.quote(ticker).catch(() => null),
        yahooFinance.quoteSummary(ticker, {
          modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
        }).catch(() => null)
      ]);

      if (!quote) {
        throw new Error('Failed to fetch quote data');
      }

      // Configure interval based on range
      const interval = range === '1d' ? '5m' : 
                      range === '5d' ? '15m' :
                      range === '1mo' ? '1d' : 
                      '1d';
      
      const chartResponse = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
        {
          params: {
            interval,
            range,
            includePrePost: range === '1d'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        }
      ).catch(() => null);

      if (!chartResponse?.data?.chart?.result?.[0]) {
        console.warn(`No chart data available for ${ticker}`);
      }

      const chartData = chartResponse?.data?.chart?.result?.[0] || { timestamp: [], indicators: { quote: [{ close: [] }] } };
      const timestamps = chartData.timestamp || [];
      const prices = chartData.indicators.quote[0].close || [];
      
      const validChartData = timestamps
        .map((timestamp: number, index: number) => ({
          timestamp: new Date(timestamp * 1000).toISOString(),
          price: prices[index] || null
        }))
        .filter((data: ChartData) => data.price !== null);

      const summaryDetail = (quoteSummaryResult as any)?.summaryDetail || {};
      const defaultKeyStatistics = (quoteSummaryResult as any)?.defaultKeyStatistics || {};
      const financialData = (quoteSummaryResult as any)?.financialData || {};

      return {
        price: quote.regularMarketPrice || 0,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        chartData: validChartData,
        details: {
          marketCap: summaryDetail?.marketCap,
          peRatio: summaryDetail?.trailingPE,
          forwardPE: summaryDetail?.forwardPE,
          dividendYield: summaryDetail?.dividendYield,
          volume: summaryDetail?.volume,
          avgVolume: summaryDetail?.averageVolume,
          high52Week: summaryDetail?.fiftyTwoWeekHigh,
          low52Week: summaryDetail?.fiftyTwoWeekLow,
          beta: summaryDetail?.beta,
          priceToBook: defaultKeyStatistics?.priceToBook,
          earningsGrowth: financialData?.earningsGrowth,
          revenueGrowth: financialData?.revenueGrowth,
          profitMargin: financialData?.profitMargins
        }
      };
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error(`Error fetching stock data for ${ticker} after ${maxRetries} attempts:`, error);
        return null;
      }
      console.warn(`Retry ${attempt + 1} for ${ticker} after error:`, error);
    }
  }
  return null;
}

// Add new types
type CompanyInfo = {
  ticker: string;
  name: string;
  shortName?: string;
  industry?: string;
  sector?: string;
  keywords: string[];
}

// Add before scrapeStockNews function
async function getCompanyInfo(ticker: string): Promise<CompanyInfo | null> {
  try {
    const quote = await yahooFinance.quote(ticker)
    const results = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryProfile', 'quoteType']
    })
    
    const profile = (results as any).summaryProfile || {}
    const quoteType = (results as any).quoteType || {}
    
    // Generate keywords from company info
    const keywords = new Set<string>()
    keywords.add(ticker.toLowerCase())
    
    if (quoteType.shortName) {
      keywords.add(quoteType.shortName.toLowerCase())
      // Add variations without common company terms
      keywords.add(quoteType.shortName.toLowerCase().replace(/\s*(inc\.?|corp\.?|corporation|company|co\.?)$/i, ''))
    }
    
    if (quoteType.longName) {
      keywords.add(quoteType.longName.toLowerCase())
      keywords.add(quoteType.longName.toLowerCase().replace(/\s*(inc\.?|corp\.?|corporation|company|co\.?)$/i, ''))
    }
    
    if (profile.industry) {
      keywords.add(profile.industry.toLowerCase())
    }
    
    // Add common variations
    const mainName = quoteType.shortName || quoteType.longName || ''
    if (mainName) {
      // Add without legal entities
      const cleanName = mainName.replace(/\s*(Inc\.|Corp\.|Corporation|Company|Co\.)$/i, '').trim()
      keywords.add(cleanName.toLowerCase())
      
      // Add first word (often the main brand)
      const firstWord = cleanName.split(' ')[0]
      if (firstWord.length > 2) { // Avoid too short words
        keywords.add(firstWord.toLowerCase())
      }
    }

    return {
      ticker,
      name: quoteType.longName || quoteType.shortName || ticker,
      shortName: quoteType.shortName,
      industry: profile.industry,
      sector: profile.sector,
      keywords: [...keywords]
    }
  } catch (error) {
    console.error(`Error fetching company info for ${ticker}:`, error)
    return null
  }
}

const NEWS_SOURCES: NewsSource[] = [
  {
    url: 'https://www.marketwatch.com/investing/stock/{ticker}',
    selectors: {
      article: 'div.article__content',
      headline: 'h3.article__headline',
      link: 'h3.article__headline a'
    },
    baseUrl: 'https://www.marketwatch.com'
  }
];

async function scrapeStockNews(tickers: string[]): Promise<NewsItem[]> {
  const allTickers = [...new Set([...DEFAULT_TICKERS, ...tickers])];
  const headlines: NewsItem[] = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };

  try {
    // Process tickers in parallel
    await Promise.all(allTickers.map(async (ticker) => {
      try {
        // 1. Get Yahoo Finance API data first (fast and reliable)
        const [quote, news] = await Promise.all([
          yahooFinance.quote(ticker),
          yahooFinance.search(ticker, { newsCount: 3 })
        ]);

        // Add price movement headline
        if (quote) {
          headlines.push({
            stock: ticker,
            headline: `${ticker} trading at $${quote.regularMarketPrice?.toFixed(2)} with ${quote.regularMarketChangePercent?.toFixed(2)}% change`,
            url: `https://finance.yahoo.com/quote/${ticker}`
          });
        }

        // Add Yahoo Finance news headlines
        if (news.news && news.news.length > 0) {
          news.news.forEach(item => {
            if (item.title) {
              headlines.push({
                stock: ticker,
                headline: item.title,
                url: item.link || `https://finance.yahoo.com/quote/${ticker}`
              });
            }
          });
        }

        // 2. Try web scraping if we don't have enough headlines
        if (headlines.filter(h => h.stock === ticker).length < 3) {
          for (const source of NEWS_SOURCES) {
            try {
              const url = source.url.replace('{ticker}', ticker.toLowerCase());
              const response = await axios.get(url, {
                headers,
                timeout: 5000,
                maxRedirects: 3
              });

              if (response.status === 200) {
                const $ = cheerio.load(response.data);
                $(source.selectors.article).slice(0, 3).each((_, element) => {
                  const headline = $(element).find(source.selectors.headline).text().trim();
                  let url = $(element).find(source.selectors.link).attr('href');
                  
                  if (headline && url) {
                    if (!url.startsWith('http')) {
                      url = source.baseUrl + (url.startsWith('/') ? '' : '/') + url;
                    }
                    
                    // Only add if we don't already have this headline
                    if (!headlines.some(h => h.stock === ticker && h.headline === headline)) {
                      headlines.push({
                        stock: ticker,
                        headline,
                        url
                      });
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`Error scraping ${source.url} for ${ticker}:`, error);
              continue;
            }
          }
        }

        // Add default headline if we still don't have any
        if (!headlines.some(h => h.stock === ticker)) {
          headlines.push({
            stock: ticker,
            headline: `Analyzing market trends for ${ticker}`,
            url: `https://finance.yahoo.com/quote/${ticker}`
          });
        }
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        headlines.push({
          stock: ticker,
          headline: `Market analysis for ${ticker} based on recent performance`,
          url: `https://finance.yahoo.com/quote/${ticker}`
        });
      }
    }));

    return headlines;
  } catch (error) {
    console.error('Error in scrapeStockNews:', error);
    return allTickers.map(ticker => ({
      stock: ticker,
      headline: `Market analysis for ${ticker} based on recent performance`,
      url: `https://finance.yahoo.com/quote/${ticker}`
    }));
  }
}

export async function POST(req: Request) {
  try {
    const { tickers, range } = await req.json()
    const stockNews = await scrapeStockNews(tickers)
    
    return NextResponse.json({
      tickers,
      articles: stockNews
    })
  } catch (error) {
    console.error('Error in sentiment analysis:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze sentiment' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const customTickers = searchParams.get('tickers')?.split(',') || []
  const range = (searchParams.get('range') || '1d') as TimeRange
  
  if (!VALID_TIME_RANGES.includes(range)) {
    return NextResponse.json(
      { error: `Invalid range. Must be one of: ${VALID_TIME_RANGES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const stockNews = await scrapeStockNews(customTickers)
    
    if (stockNews.length === 0) {
      throw new Error('No headlines found')
    }

    // Format the prompt to ensure valid JSON response
    const prompt = `Analyze these stock headlines and provide sentiment scores between -1.0 (most negative) and 1.0 (most positive). Return your analysis in a JSON object with a 'headlines' array.

Return ONLY a JSON object in this exact format:
{
  "headlines": [
    {
      "stock": "TICKER",
      "headline": "HEADLINE_TEXT",
      "sentimentScore": SCORE
    }
  ]
}

For each headline, copy the exact stock symbol and headline text, and add an appropriate sentiment score.

Headlines to analyze:
${stockNews.map((n: NewsItem) => `${n.stock}: ${n.headline}`).join('\n')}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content received from OpenAI')
    }

    // Parse the response carefully
    let sentimentData = []
    try {
      const parsedContent = JSON.parse(content)
      if (!parsedContent.headlines || !Array.isArray(parsedContent.headlines)) {
        console.error('Unexpected OpenAI response format:', content)
        throw new Error('Invalid response format')
      }
      sentimentData = parsedContent.headlines
    } catch (err) {
      console.error('Error parsing JSON from OpenAI:', err, 'Raw content:', content)
      throw new Error('Failed to parse sentiment data')
    }

    // Validate each sentiment item
    sentimentData = sentimentData.filter((item: unknown): item is SentimentItem => {
      const i = item as Record<string, unknown>;
      return (
        !!item &&
        typeof i === 'object' &&
        typeof i.stock === 'string' &&
        typeof i.headline === 'string' &&
        typeof i.sentimentScore === 'number' &&
        i.sentimentScore >= -1 &&
        i.sentimentScore <= 1
      )
    });

    if (sentimentData.length === 0) {
      throw new Error('No valid sentiment data after filtering')
    }

    // Combine sentiments per ticker
    const combinedSentiments = sentimentData.reduce((acc: any[], curr: any) => {
      const existing = acc.find(item => item.stock === curr.stock)
      if (existing) {
        if (!existing.articles) existing.articles = [existing]
        existing.articles.push({
          headline: curr.headline,
          sentimentScore: curr.sentimentScore,
          url: stockNews.find(n => n.headline === curr.headline)?.url
        })
        existing.count = existing.articles.length
        existing.totalSentiment = existing.articles.reduce(
          (sum: number, article: any) => sum + article.sentimentScore,
          0
        )
        existing.sentimentScore = existing.totalSentiment / existing.count
      } else {
        acc.push({
          ...curr,
          articles: [{
            headline: curr.headline,
            sentimentScore: curr.sentimentScore,
            url: stockNews.find(n => n.headline === curr.headline)?.url
          }],
          count: 1
        })
      }
      return acc
    }, [])

    // STEP 3: Get stock data for each ticker
    const stockDataPromises = combinedSentiments.map(async (item: any) => {
      const stockData = await getStockData(item.stock, range)
      return {
        ...item,
        stockData
      }
    })

    const enrichedData = await Promise.all(stockDataPromises)

    // STEP 4: Sort stocks by sentimentScore descending
    enrichedData.sort((a: any, b: any) => b.sentimentScore - a.sentimentScore)

    // STEP 5: Keep any custom tickers + top others
    const customTickerResults = enrichedData.filter((item: any) =>
      customTickers.includes(item.stock)
    )
    const otherResults = enrichedData
      .filter((item: any) => !customTickers.includes(item.stock))
      .slice(0, 10 - customTickerResults.length)

    const finalResults = [...customTickerResults, ...otherResults]

    return NextResponse.json(finalResults)
  } catch (error: any) {
    console.error('Error in sentiment analysis:', error)
    const statusCode = error.status || 500
    const message = error.response?.data?.error?.message || error.message || 'Failed to analyze sentiment'
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}
