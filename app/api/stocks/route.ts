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

type TimeRange = '1d' | '5d' | '1mo' | '1y'
type NewsItem = {
  stock: string;
  headline: string;
  url?: string;
  individualSentiment?: number;
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

const NEWS_SOURCES: NewsSource[] = [
  {
    url: 'https://finance.yahoo.com/news',
    selectors: {
      article: 'div.Cf',
      headline: 'h3.Mb\\(5px\\)',
      link: 'a'
    },
    baseUrl: 'https://finance.yahoo.com'
  },
  {
    url: 'https://www.marketwatch.com/latest-news',
    selectors: {
      article: 'div.article__content',
      headline: 'a.link',
      link: 'a.link'
    },
    baseUrl: 'https://www.marketwatch.com'
  },
  {
    url: 'https://www.investing.com/news/stock-market-news',
    selectors: {
      article: 'div.largeTitle article',
      headline: 'a.title',
      link: 'a.title'
    },
    baseUrl: 'https://www.investing.com'
  },
  {
    url: 'https://www.zacks.com/stock-news',
    selectors: {
      article: '.news_items_container .news_item',
      headline: '.news_link',
      link: '.news_link'
    },
    baseUrl: 'https://www.zacks.com'
  },
  {
    url: 'https://www.nasdaq.com/news-and-insights/topic/markets',
    selectors: {
      article: 'article.content-feed-card',
      headline: 'h3.content-feed-card__headline',
      link: 'a.content-feed-card__headline-link'
    },
    baseUrl: 'https://www.nasdaq.com'
  },
  {
    url: 'https://www.barrons.com/topics/markets',
    selectors: {
      article: 'article.BarronsTheme--article-card',
      headline: '.BarronsTheme--headline',
      link: 'a.BarronsTheme--headline-link'
    },
    baseUrl: 'https://www.barrons.com'
  },
  {
    url: 'https://www.thestreet.com/markets',
    selectors: {
      article: 'article.news-list__item',
      headline: '.news-list__headline',
      link: 'a.news-list__url'
    },
    baseUrl: 'https://www.thestreet.com'
  }
]

async function getStockData(ticker: string, range: TimeRange = '1d') {
  try {
    const quote = await yahooFinance.quote(ticker)
    const quoteSummaryResult = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
    })
    
    // Configure interval based on range
    const interval =
      range === '1d' ? '5m'
      : range === '5d' ? '15m'
      : range === '1mo' ? '1d'
      : '1d'
    
    // Fetch intraday data using v8 API
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
        params: {
          interval,
          range,
          includePrePost: range === '1d'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0'
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
      .map((ts: number, i: number) => ({
        timestamp: new Date(ts * 1000).toISOString(),
        price: prices[i] || null
      }))
      .filter((d: any) => d.price !== null)

    // Extract data
    const summaryDetail = (quoteSummaryResult as any).summaryDetail as YahooSummaryDetail || {}
    const defaultKeyStatistics = (quoteSummaryResult as any).defaultKeyStatistics as YahooKeyStats || {}
    const financialData = (quoteSummaryResult as any).financialData as YahooFinancialData || {}

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

/**
 * Scrapes headlines from multiple news sources.
 * Any headline that contains the ticker (case-insensitive) will be pushed to that ticker’s array.
 */
async function scrapeStockNews(tickers: string[]): Promise<NewsItem[]> {
  // Merge user-provided tickers with defaults
  const allTickers: string[] = [...new Set([...DEFAULT_TICKERS, ...tickers])]
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br'
  }

  try {
    // Scrape all news sources in parallel
    const allHeadlinesPromises = NEWS_SOURCES.map(async (source) => {
      try {
        const response = await axios.get(source.url, { 
          headers,
          maxRedirects: 5,
          timeout: 15000
        }).catch(async (error) => {
          console.error(`Failed to fetch ${source.url}:`, error.message)
          if (error.response?.status === 429 || error.code === 'ECONNABORTED') {
            console.log(`Retrying ${source.url} after timeout...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
            return axios.get(source.url, { headers })
          }
          throw error
        })

        if (response.status !== 200) {
          console.warn(`Warning: ${source.url} returned status ${response.status}`)
          return []
        }

        const $ = cheerio.load(response.data)
        const headlines: NewsItem[] = []

        $(source.selectors.article).each((_, element) => {
          const $element = $(element)
          const headline = source.selectors.headline 
            ? $element.find(source.selectors.headline).text().trim()
            : $element.text().trim()

          let url = source.selectors.link 
            ? $element.find(source.selectors.link).attr('href') || $element.attr('href')
            : ''

          if (url && source.baseUrl && !url.startsWith('http')) {
            // Make absolute URL
            url = source.baseUrl + (url.startsWith('/') ? '' : '/') + url
          }

          // For each ticker, check if the headline mentions it
          if (headline && url) {
            const headlineLower = headline.toLowerCase()

            for (const ticker of allTickers) {
              if (
                // Simple substring check
                headlineLower.includes(ticker.toLowerCase()) &&
                // Avoid duplicates
                !headlines.some(h => h.headline === headline)
              ) {
                headlines.push({
                  stock: ticker,
                  headline,
                  url
                })
                break
              }
            }
          }
        })

        return headlines
      } catch (error) {
        console.error(`Error scraping ${source.url}:`, error)
        return []
      }
    })
    
    const allHeadlinesArrays = await Promise.all(allHeadlinesPromises)
    const headlines = allHeadlinesArrays.flat()

    // If a ticker wasn't mentioned at all, give it a default headline
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

  // Get custom tickers and range from query params
  const { searchParams } = new URL(request.url)
  const customTickers = searchParams.get('tickers')?.split(',') || []
  const range = (searchParams.get('range') || '1d') as TimeRange
  
  try {
    // STEP 1: Fetch real headlines with custom tickers
    const stockNews = await scrapeStockNews(customTickers)
    
    if (stockNews.length === 0) {
      throw new Error('No headlines found')
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
${stockNews.map((n: NewsItem) => `${n.stock}: ${n.headline}`).join('\n')}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
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
    return NextResponse.json(
      { error: error.message || 'Failed to analyze sentiment' },
      { status: 500 }
    )
  }
}
