// app/api/stocks/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'
import yahooFinance from 'yahoo-finance2'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC', 'CRM', 'NFLX']

// Add at the top with other types
type TimeRange = '1d' | '5d' | '1mo' | '1y'

// Add types at the top
type NewsItem = {
  stock: string;
  headline: string;
  url?: string;
  individualSentiment?: number;
}

// Add at the top with other types
type YahooValue = {
  raw: number;
  fmt: string;
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

type YahooQuoteSummary = {
  summaryDetail?: YahooSummaryDetail;
  defaultKeyStatistics?: YahooKeyStats;
  financialData?: YahooFinancialData;
}

// Add new types
type NewsSource = {
  url: string;
  selectors: {
    article: string;
    headline: string;
    link: string;
  };
  baseUrl?: string;
}

const NEWS_SOURCES: NewsSource[] = [
  {
    url: 'https://finance.yahoo.com/news',
    selectors: {
      article: 'li.js-stream-content',
      headline: 'h3',
      link: 'a'
    },
    baseUrl: 'https://finance.yahoo.com'
  },
  {
    url: 'https://www.marketwatch.com/latest-news',
    selectors: {
      article: 'div.article__content',
      headline: 'h3 a',
      link: 'h3 a'
    },
    baseUrl: 'https://www.marketwatch.com'
  }
]

async function getStockData(ticker: string, range: TimeRange = '1d') {
  try {
    const quote = await yahooFinance.quote(ticker)
    const quoteSummaryResult = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
    })
    
    // Add detailed logging
    console.log('Quote Result:', JSON.stringify(quote, null, 2))
    console.log('Summary Result:', JSON.stringify(quoteSummaryResult, null, 2))
    
    // Configure interval based on range
    const interval = range === '1d' ? '5m' : 
                    range === '5d' ? '15m' :
                    range === '1mo' ? '1d' : 
                    '1d'
    
    // Fetch intraday data using v8 API with proper headers
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
        params: {
          interval,
          range,
          includePrePost: range === '1d'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    )
    
    if (!response.data.chart?.result?.[0]) {
      throw new Error('No chart data available')
    }

    const chartData = response.data.chart.result[0]
    const timestamps = chartData.timestamp || []
    const prices = chartData.indicators.quote[0].close || []
    
    const validChartData = timestamps
      .map((timestamp: number, index: number) => ({
        timestamp: new Date(timestamp * 1000).toISOString(),
        price: prices[index] || null
      }))
      .filter((data: any) => data.price !== null)

    // Access the correct data structure from quoteSummary
    const summaryDetail = (quoteSummaryResult as any).summaryDetail as YahooSummaryDetail || {}
    const defaultKeyStatistics = (quoteSummaryResult as any).defaultKeyStatistics as YahooKeyStats || {}
    const financialData = (quoteSummaryResult as any).financialData as YahooFinancialData || {}

    // Log the raw data structures
    console.log('Raw Summary Detail:', JSON.stringify(summaryDetail, null, 2))
    console.log('Raw Key Stats:', JSON.stringify(defaultKeyStatistics, null, 2))
    console.log('Raw Financial Data:', JSON.stringify(financialData, null, 2))

    const details = {
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

    // Log the final details object
    console.log('Final Details Object:', details)

    return {
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      chartData: validChartData,
      details
    }
  } catch (error) {
    console.error(`Error fetching stock data for ${ticker}:`, error)
    return null
  }
}

async function scrapeNewsSource(source: NewsSource, allTickers: string[], headers: any): Promise<NewsItem[]> {
  try {
    const headlines: NewsItem[] = []
    const response = await axios.get(source.url, { 
      headers: {
        ...headers,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      },
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: (status) => status < 500
    })

    if (response.status !== 200) {
      console.warn(`Warning: ${source.url} returned status ${response.status}`)
      return []
    }

    const $ = cheerio.load(response.data)

    $(source.selectors.article).each((_, element) => {
      const $element = $(element)
      let headline = source.selectors.headline ? 
        $element.find(source.selectors.headline).text().trim() :
        $element.text().trim()
      
      let url = source.selectors.link ? 
        $element.find(source.selectors.link).attr('href') || 
        $element.attr('href') : ''

      if (url && source.baseUrl && !url.startsWith('http')) {
        url = source.baseUrl + (url.startsWith('/') ? '' : '/') + url
      }
      
      if (headline && url) {
        // Extract stock ticker if present in headline
        const tickers = headline.match(/\b[A-Z]{1,5}\b/g) || []
        const relevantTicker = tickers.find(ticker => allTickers.includes(ticker))
        
        if (relevantTicker && !headlines.some(h => h.headline === headline)) {
          headlines.push({
            stock: relevantTicker,
            headline,
            url
          })
        } else {
          // Check for company names in headline
          const headlineLower = headline.toLowerCase()
          let stock = ''
          
          const companyMap: Record<string, string> = {
            'apple': 'AAPL', 'iphone': 'AAPL', 'macbook': 'AAPL', 'ipad': 'AAPL',
            'microsoft': 'MSFT', 'windows': 'MSFT', 'azure': 'MSFT',
            'google': 'GOOGL', 'alphabet': 'GOOGL', 'android': 'GOOGL',
            'amazon': 'AMZN', 'aws': 'AMZN',
            'meta': 'META', 'facebook': 'META', 'instagram': 'META', 'whatsapp': 'META',
            'tesla': 'TSLA', 'musk': 'TSLA',
            'nvidia': 'NVDA', 'geforce': 'NVDA',
            'amd': 'AMD', 'ryzen': 'AMD',
            'intel': 'INTC',
            'salesforce': 'CRM',
            'netflix': 'NFLX'
          }

          for (const [company, ticker] of Object.entries(companyMap)) {
            if (headlineLower.includes(company) && allTickers.includes(ticker)) {
              stock = ticker
              break
            }
          }
          
          if (stock && !headlines.some(h => h.headline === headline)) {
            headlines.push({ stock, headline, url })
          }
        }
      }
    })

    return headlines
  } catch (error) {
    console.error(`Error scraping ${source.url}:`, error)
    return []
  }
}

async function scrapeYahooFinanceNews(customTickers: string[] = []): Promise<NewsItem[]> {
  const allTickers: string[] = [...new Set([...DEFAULT_TICKERS, ...customTickers])]
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
  }

  try {
    // Scrape all news sources in parallel
    const allHeadlinesPromises = NEWS_SOURCES.map(source => 
      scrapeNewsSource(source, allTickers, headers)
    )
    
    const allHeadlinesArrays = await Promise.all(allHeadlinesPromises)
    const headlines = allHeadlinesArrays.flat()

    // Add default headlines for stocks that don't have any news
    for (const ticker of allTickers) {
      if (!headlines.some((news: NewsItem) => news.stock === ticker)) {
        headlines.push({
          stock: ticker,
          headline: `Market analysis for ${ticker} based on recent performance`
        })
      }
    }

    return headlines
  } catch (error) {
    console.error('Error scraping news sources:', error)
    // Fallback: return default headlines for all tickers
    return allTickers.map((ticker: string) => ({
      stock: ticker,
      headline: `Market analysis for ${ticker} based on recent performance`
    }))
  }
}

export async function GET(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    )
  }

  // Get custom tickers and range from query params
  const { searchParams } = new URL(request.url)
  const customTickers = searchParams.get('tickers')?.split(',') || []
  const range = (searchParams.get('range') || '1d') as TimeRange
  
  try {
    // STEP 1: Fetch real headlines with custom tickers
    const stockNews = await scrapeYahooFinanceNews(customTickers)
    
    if (stockNews.length === 0) {
      throw new Error('No headlines found')
    }

    // Add custom tickers to the news list with a neutral headline
    for (const ticker of customTickers) {
      const upperTicker = ticker.toUpperCase()
      if (!stockNews.some(news => news.stock === upperTicker)) {
        stockNews.push({
          stock: upperTicker,
          headline: `Analyzing market sentiment for ${upperTicker}`
        })
      }
    }

    // STEP 2: Use OpenAI to rank each stock by sentiment
    const prompt = `Analyze these stock headlines and return ONLY a JSON array (no other text) with sentiment scores between -1.0 (most negative) and 1.0 (most positive). Each headline should have its own sentiment score. Use this exact format:
[
  { 
    "stock": "<ticker>",
    "headline": "<full headline text>",
    "sentimentScore": <number between -1.0 and 1.0>
  }
]

Headlines to analyze:
${stockNews.map((n: NewsItem) => `${n.stock}: ${n.headline}`).join('\n')}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ 
        role: 'user', 
        content: `Analyze these stock headlines and return ONLY a JSON array (no other text) with sentiment scores between -1.0 (most negative) and 1.0 (most positive). Each headline should have its own sentiment score. Use this exact format:
[
  { 
    "stock": "<ticker>",
    "headline": "<full headline text>",
    "sentimentScore": <number between -1.0 and 1.0>
  }
]

Headlines to analyze:
${stockNews.map((n: NewsItem) => `${n.stock}: ${n.headline}`).join('\n')}
`
      }],
      temperature: 0.7,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content received from OpenAI')
    }

    // Parse the response carefully
    let sentimentData = []
    try {
      sentimentData = JSON.parse(content)
    } catch (err) {
      console.error('Error parsing JSON from OpenAI:', err)
      throw new Error('Failed to parse sentiment data')
    }

    // Validate the data structure
    if (!Array.isArray(sentimentData) || sentimentData.length === 0) {
      throw new Error('Invalid sentiment data format')
    }

    // Update the combining logic to keep track of articles
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
        existing.totalSentiment = existing.articles.reduce((sum: number, article: any) => sum + article.sentimentScore, 0)
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

    // STEP 5: Get top results (including all custom tickers)
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
    return NextResponse.json(
      { error: error.message || 'Failed to analyze sentiment' },
      { status: 500 }
    )
  }
}

