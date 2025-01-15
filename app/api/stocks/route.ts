// app/api/stocks/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import axios from 'axios'
import yahooFinance from 'yahoo-finance2'

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type TimeRange = '1d' | '5d' | '1mo' | '1y'
const VALID_TIME_RANGES: TimeRange[] = ['1d', '5d', '1mo', '1y']

type NewsItem = {
  stock: string
  headline: string
  url?: string
  individualSentiment?: number
}

type SentimentItem = {
  stock: string
  headline: string
  sentimentScore: number
}

type ChartData = { 
  timestamp: string
  price: number | null 
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: number[];
        }>;
      };
    }>;
  };
}

type StockDataResult = {
  price: number;
  change: number;
  changePercent: number;
  chartData: ChartData[];
  details: {
    marketCap?: number;
    peRatio?: number;
    forwardPE?: number;
    dividendYield?: number;
    volume?: number;
    avgVolume?: number;
    high52Week?: number;
    low52Week?: number;
    beta?: number;
    priceToBook?: number;
    earningsGrowth?: number;
    revenueGrowth?: number;
    profitMargin?: number;
  };
};

type CombinedSentiment = {
  stock: string
  headline: string
  sentimentScore: number
  articles?: Array<{
    headline: string
    sentimentScore: number
    url?: string
  }>
  count?: number
  totalSentiment?: number
  stockData: StockDataResult | null
}

type StockResult = {
  ticker: string
  stockData: StockDataResult | null
  news: NewsItem[]
}

async function getStockData(ticker: string, range: TimeRange = '1d'): Promise<StockDataResult | null> {
  try {
    const quote = await yahooFinance.quote(ticker);
    const quoteSummaryResult = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
    });

    if (!quote) {
      throw new Error('Failed to fetch quote data');
    }

    const interval = range === '1d' ? '5m' : '1d';
    
    const chartResponse = await axios.get<YahooChartResponse>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      {
        params: {
          interval,
          range,
          includePrePost: false
        },
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 5000
      }
    ).catch(() => null) as { data: YahooChartResponse } | null;

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
    console.error(`Error fetching stock data for ${ticker}:`, error);
    return null;
  }
}

async function scrapeStockNews(tickers: string[]): Promise<NewsItem[]> {
  const allTickers = [...new Set([...DEFAULT_TICKERS, ...tickers])];
  const headlines: NewsItem[] = [];

  try {
    for (const ticker of allTickers) {
      try {
        const quote = await yahooFinance.quote(ticker);
        const news = await yahooFinance.search(ticker, { newsCount: 3 });

        if (quote) {
          headlines.push({
            stock: ticker,
            headline: `${ticker} trading at $${quote.regularMarketPrice?.toFixed(2)} with ${quote.regularMarketChangePercent?.toFixed(2)}% change`,
            url: `https://finance.yahoo.com/quote/${ticker}`
          });
        }

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

        if (!headlines.some(h => h.stock === ticker)) {
          headlines.push({
            stock: ticker,
            headline: `Market analysis for ${ticker}`,
            url: `https://finance.yahoo.com/quote/${ticker}`
          });
        }

        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        headlines.push({
          stock: ticker,
          headline: `Market analysis for ${ticker}`,
          url: `https://finance.yahoo.com/quote/${ticker}`
        });
      }
    }

    return headlines;
  } catch (error) {
    console.error('Error in scrapeStockNews:', error);
    return allTickers.map(ticker => ({
      stock: ticker,
      headline: `Market analysis for ${ticker}`,
      url: `https://finance.yahoo.com/quote/${ticker}`
    }));
  }
}

export async function POST(req: Request) {
  try {
    const { tickers, range } = await req.json()
    
    // Sequential processing
    const stockNews = await scrapeStockNews(tickers);
    const stockDataResults: (StockDataResult | null)[] = [];
    for (const ticker of tickers) {
      const data = await getStockData(ticker, range);
      stockDataResults.push(data);
    }
    
    return NextResponse.json({
      tickers,
      articles: stockNews,
      stockData: stockDataResults
    })
  } catch (error) {
    console.error('Error in sentiment analysis:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze sentiment' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request): Promise<NextResponse> {
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
    // Process all tickers in parallel
    const allTickers = [...new Set([...DEFAULT_TICKERS, ...customTickers])]
    
    // Create a function to process a single ticker
    const processStock = async (ticker: string) => {
      try {
        const [stockData, news] = await Promise.all([
          getStockData(ticker, range),
          yahooFinance.search(ticker, { newsCount: 3 })
            .then(result => ({
              stock: ticker,
              news: result.news || []
            }))
            .catch(() => ({
              stock: ticker,
              news: []
            }))
        ]);

        return {
          ticker,
          stockData,
          news: news.news.map(item => ({
            stock: ticker,
            headline: item.title,
            url: item.link || `https://finance.yahoo.com/quote/${ticker}`
          }))
        };
      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        return {
          ticker,
          stockData: null,
          news: [{
            stock: ticker,
            headline: `Market analysis for ${ticker}`,
            url: `https://finance.yahoo.com/quote/${ticker}`
          }]
        };
      }
    };

    // Process all stocks in parallel with a small delay between each to avoid rate limits
    const stockResults = await Promise.all(
      allTickers.map((ticker, index) => 
        new Promise<StockResult>(resolve => 
          setTimeout(() => resolve(processStock(ticker)), index * 200)
        )
      )
    );

    // Combine all news items
    const stockNews = stockResults.flatMap(result => result.news);
    
    if (stockNews.length === 0) {
      throw new Error('No headlines found')
    }

    // Get sentiment analysis from OpenAI
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

    // Parse and validate the response
    let sentimentData = []
    try {
      const parsedContent = JSON.parse(content)
      if (!parsedContent.headlines || !Array.isArray(parsedContent.headlines)) {
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

    // Combine sentiments with stock data
    const combinedSentiments = sentimentData.reduce((acc: CombinedSentiment[], curr: SentimentItem) => {
      const existing = acc.find(item => item.stock === curr.stock)
      const stockResult = stockResults.find(r => r.ticker === curr.stock)
      const stockData = stockResult?.stockData || null
      
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
        if (!existing.stockData) existing.stockData = stockData
      } else {
        acc.push({
          ...curr,
          articles: [{
            headline: curr.headline,
            sentimentScore: curr.sentimentScore,
            url: stockNews.find(n => n.headline === curr.headline)?.url
          }],
          count: 1,
          stockData
        })
      }
      return acc
    }, [])

    // Sort stocks by sentimentScore descending
    combinedSentiments.sort((a: any, b: any) => b.sentimentScore - a.sentimentScore)

    // Keep any custom tickers + top others
    const customTickerResults = combinedSentiments.filter((item: any) =>
      customTickers.includes(item.stock)
    )
    const otherResults = combinedSentiments
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

