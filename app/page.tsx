// app/page.tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { X } from 'lucide-react';

type StockDetails = {
  marketCap?: number
  peRatio?: number
  forwardPE?: number
  dividendYield?: number
  volume?: number
  avgVolume?: number
  high52Week?: number
  low52Week?: number
  beta?: number
  priceToBook?: number
  earningsGrowth?: number
  revenueGrowth?: number
  profitMargin?: number
}

type StockData = {
  price: number
  change: number
  changePercent: number
  chartData: Array<{
    timestamp: string
    price: number
  }>
  details: StockDetails
}

type Article = {
  headline: string
  sentimentScore: number
  url?: string
}

type StockSentiment = {
  stock: string
  sentimentScore: number
  stockData: StockData | null
  articles: Article[]
  count: number
}

type TimeRange = '1d' | '5d' | '1mo' | '1y'
type FormatterValue = string | number;

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']

export default function Home() {
  const [stocks, setStocks] = useState<StockSentiment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customTicker, setCustomTicker] = useState('')
  const [customTickers, setCustomTickers] = useState<string[]>([])
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1d')
  const [selectedStock, setSelectedStock] = useState<StockSentiment | null>(null)
  const [apiCallTime, setApiCallTime] = useState<number | null>(null)
  const [remainingCalls, setRemainingCalls] = useState<number>(5)
  const [hasNewTickers, setHasNewTickers] = useState(false)

  useEffect(() => {
    // Check if there are new tickers to analyze
    const lastAnalysis = localStorage.getItem('lastAnalysis')
    const existingStocks = lastAnalysis ? JSON.parse(lastAnalysis) : []
    const existingTickers = existingStocks.map((s: StockSentiment) => s.stock)
    const newTickers = [...DEFAULT_TICKERS, ...customTickers].filter(ticker => !existingTickers.includes(ticker))
    setHasNewTickers(newTickers.length > 0)
  }, [customTickers])

  useEffect(() => {
    const stored = localStorage.getItem('remainingCalls')
    const lastReset = localStorage.getItem('lastResetDate')
    const today = new Date().toDateString()
    const lastAnalysis = localStorage.getItem('lastAnalysis')
    
    // Reset if it's a new day
    if (lastReset !== today) {
      localStorage.setItem('remainingCalls', '5')
      localStorage.setItem('lastResetDate', today)
      setRemainingCalls(5)
    } else if (stored) {
      setRemainingCalls(parseInt(stored))
      // Load last analysis if no refreshes left
      if (parseInt(stored) === 0 && lastAnalysis) {
        setStocks(JSON.parse(lastAnalysis))
      }
    }
  }, [])

  const updateRemainingCalls = (count: number) => {
    setRemainingCalls(count)
    localStorage.setItem('remainingCalls', count.toString())
    localStorage.setItem('lastResetDate', new Date().toDateString())
  }

  const addCustomTicker = () => {
    if (customTicker && !customTickers.includes(customTicker.toUpperCase())) {
      const newTickers = [...customTickers, customTicker.toUpperCase()]
      setCustomTickers(newTickers)
      localStorage.setItem('customTickers', JSON.stringify(newTickers))
      setCustomTicker('')
    }
  }

  const removeCustomTicker = (ticker: string) => {
    const newTickers = customTickers.filter(t => t !== ticker)
    setCustomTickers(newTickers)
    localStorage.setItem('customTickers', JSON.stringify(newTickers))
    
    // Remove the stock from display and localStorage
    const updatedStocks = stocks.filter(s => s.stock !== ticker || DEFAULT_TICKERS.includes(s.stock))
    setStocks(updatedStocks)
    localStorage.setItem('lastAnalysis', JSON.stringify(updatedStocks))
    
    // Close modal if the removed stock was selected
    if (selectedStock?.stock === ticker) {
      setSelectedStock(null)
    }
  }

  const updateGraphs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (customTickers.length > 0) {
        params.append('tickers', customTickers.join(','))
      }
      params.append('range', selectedRange)
      params.append('graphsOnly', 'true')
      
      const response = await fetch(`/api/stocks?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }
      const result = await response.json()
      if (result.error) {
        throw new Error(result.error)
      }
      
      // Update only the chart data for existing stocks
      setStocks(prevStocks => 
        prevStocks.map(stock => {
          const updatedStock = result.data.find(s => s.ticker === stock.stock)
          if (updatedStock?.stockData) {
            return {
              ...stock,
              stockData: stock.stockData ? {
                ...stock.stockData,
                chartData: updatedStock.stockData.chartData
              } : updatedStock.stockData
            }
          }
          return stock
        })
      )
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedRange, customTickers])

  // Update graphs when timeframe changes
  useEffect(() => {
    if (stocks.length > 0) {
      updateGraphs()
    }
  }, [selectedRange])

  const fetchStocks = useCallback(async () => {
    const currentRemaining = parseInt(localStorage.getItem('remainingCalls') || '5')
    
    if (currentRemaining === 0) {
      setError('No refreshes left today. Showing last analysis.')
      const lastAnalysis = localStorage.getItem('lastAnalysis')
      if (lastAnalysis) {
        setStocks(JSON.parse(lastAnalysis))
      }
      return
    }

    setLoading(true)
    setError('')
    setApiCallTime(null) // Reset API call time
    const startTime = Date.now()
    try {
      // Get existing analysis from localStorage
      const lastAnalysis = localStorage.getItem('lastAnalysis')
      const existingStocks = lastAnalysis ? JSON.parse(lastAnalysis) : []
      
      // Find tickers that need analysis (not in existing data)
      const existingTickers = existingStocks.map((s: StockSentiment) => s.stock)
      const tickersToAnalyze = [...DEFAULT_TICKERS, ...customTickers].filter(ticker => !existingTickers.includes(ticker))
      
      if (tickersToAnalyze.length === 0) {
        // If no new tickers, just update the state with existing data
        setStocks(existingStocks)
        setLoading(false)
        return
      }

      const params = new URLSearchParams()
      params.append('tickers', tickersToAnalyze.join(','))
      params.append('range', selectedRange)
      
      const response = await fetch(`/api/stocks?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }
      const result = await response.json()
      if (result.error) {
        throw new Error(result.error)
      }

      // Combine new analysis with existing data
      const updatedStocks = [
        ...existingStocks.filter((s: StockSentiment) => customTickers.includes(s.stock)),
        ...result.data
      ]

      setStocks(updatedStocks)
      localStorage.setItem('lastAnalysis', JSON.stringify(updatedStocks))
      localStorage.setItem('analysisTimestamp', new Date().toDateString())
      updateRemainingCalls(result.remaining)
      setApiCallTime(Date.now() - startTime)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
      setApiCallTime(null)
    } finally {
      setLoading(false)
    }
  }, [customTickers, selectedRange])

  // Load initial data
  useEffect(() => {
    setLoading(true) // Set loading state immediately
    const lastAnalysis = localStorage.getItem('lastAnalysis')
    const storedCustomTickers = localStorage.getItem('customTickers')
    const analysisTimestamp = localStorage.getItem('analysisTimestamp')
    const today = new Date().toDateString()
    
    if (storedCustomTickers) {
      setCustomTickers(JSON.parse(storedCustomTickers))
    }
    
    // Check if analysis is from a previous day
    if (lastAnalysis && analysisTimestamp && analysisTimestamp === today) {
      setStocks(JSON.parse(lastAnalysis))
      setLoading(false)
    } else {
      // If no stored analysis or it's old, fetch all tickers
      const allTickers = [...DEFAULT_TICKERS, ...(storedCustomTickers ? JSON.parse(storedCustomTickers) : [])]
      const params = new URLSearchParams()
      params.append('tickers', allTickers.join(','))
      params.append('range', selectedRange)
      
      fetch(`/api/stocks?${params}`)
        .then(response => response.json())
        .then(result => {
          if (!result.error) {
            setStocks(result.data)
            localStorage.setItem('lastAnalysis', JSON.stringify(result.data))
            localStorage.setItem('analysisTimestamp', today)
            updateRemainingCalls(result.remaining)
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [])

  const formatNumber = (num: number | undefined, decimals: number = 2) => {
    if (num === undefined) return 'N/A'
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals })
  }

  const formatLargeNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A'
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    return formatNumber(num)
  }

  const formatPercentage = (num: number | undefined) => {
    if (num === undefined) return 'N/A'
    return `${(num * 100).toFixed(2)}%`
  }

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-6 w-20 bg-gray-700" />
            <Skeleton className="h-6 w-32 bg-gray-700" />
          </div>
          <Skeleton className="h-32 w-full bg-gray-700 mb-4" />
          <Skeleton className="h-10 w-full bg-gray-700" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex-1">
      <div className="container mx-auto p-4 sm:p-8 relative">
        <Card className="mb-8 bg-gray-900/50 backdrop-blur-sm border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-jetbrains text-white">Stock Sentiment Analyzer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 mb-4 font-jetbrains text-sm sm:text-base">
              This tool uses OpenAI to analyze market sentiment for various stocks and displays the top stocks to consider based on sentiment.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4">
              <Input
                placeholder="Add custom ticker (e.g., MSFT)"
                value={customTicker}
                onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && addCustomTicker()}
                className="w-full sm:max-w-xs bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-400 placeholder:font-jetbrains focus:border-gray-600 focus:ring-gray-600"
              />
              <Button 
                onClick={addCustomTicker} 
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-jetbrains"
              >
                Add Ticker
              </Button>
            </div>
            {customTickers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {customTickers.map(ticker => (
                  <Button
                    key={ticker}
                    variant="outline"
                    onClick={() => {
                      removeCustomTicker(ticker)
                      if (selectedStock?.stock === ticker) {
                        setSelectedStock(null)
                      }
                    }}
                    className="bg-gray-800/50 border-gray-700 text-white hover:bg-gray-700 hover:text-white font-jetbrains"
                  >
                    {ticker}
                    <span className="ml-2 text-xs">×</span>
                  </Button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
              <Select value={selectedRange} onValueChange={(value: TimeRange) => setSelectedRange(value)}>
                <SelectTrigger className="w-full sm:w-[180px] bg-gray-800 border-gray-700 text-white font-jetbrains">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="1d" className="text-white hover:bg-gray-700">1 Day</SelectItem>
                  <SelectItem value="5d" className="text-white hover:bg-gray-700">5 Days</SelectItem>
                  <SelectItem value="1mo" className="text-white hover:bg-gray-700">1 Month</SelectItem>
                  <SelectItem value="1y" className="text-white hover:bg-gray-700">1 Year</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Button 
                  onClick={fetchStocks} 
                  disabled={loading || !hasNewTickers || remainingCalls === 0}
                  className="w-full sm:w-auto font-jetbrains bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:hover:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {loading ? 'Analyzing...' : hasNewTickers ? 'Refresh Analysis' : 'No New Tickers'}
                </Button>
                <div className="flex items-center text-gray-400 text-xs sm:text-sm font-jetbrains whitespace-nowrap">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {remainingCalls} left
                </div>
                {apiCallTime && (
                  <div className="hidden sm:flex items-center text-gray-400 text-sm font-jetbrains">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {(apiCallTime / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="text-red-500 mb-4 font-jetbrains text-sm sm:text-base">{error}</div>
        )}

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stocks.map((stock) => (
              <Card 
                key={stock.stock} 
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow bg-gray-900/50 backdrop-blur-sm border-gray-700 hover:border-gray-600"
                onClick={() => setSelectedStock(stock)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg sm:text-xl text-white font-jetbrains">{stock.stock}</CardTitle>
                    {stock.stockData && (
                      <div className={`text-xs sm:text-sm font-jetbrains ${stock.stockData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${stock.stockData.price.toFixed(2)}
                        <span className="ml-1 sm:ml-2">
                          {stock.stockData.change >= 0 ? '▲' : '▼'} 
                          {Math.abs(stock.stockData.changePercent).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {stock.stockData && (
                    <div className="h-32 mb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stock.stockData.chartData}>
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke={stock.stockData.change >= 0 ? '#4ade80' : '#f87171'}
                            dot={false}
                          />
                          <XAxis
                            dataKey="timestamp"
                            hide
                          />
                          <YAxis domain={['auto', 'auto']} hide />
                          <Tooltip
                            formatter={(value: FormatterValue) => [`$${value}`, 'Price']}
                            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '0.375rem' }}
                            itemStyle={{ color: '#e5e7eb' }}
                            labelStyle={{ color: '#e5e7eb' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className={`text-center p-2 rounded-md font-jetbrains ${
                    !stock.articles?.length || stock.sentimentScore === 0 ? 'bg-gray-800/50' :
                    stock.sentimentScore > 0 ? 'bg-green-900/50' : 'bg-red-900/50'
                  }`}>
                    <span className={`font-semibold ${
                      !stock.articles?.length || stock.sentimentScore === 0 ? 'text-gray-400' :
                      stock.sentimentScore > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {!stock.articles?.length || stock.sentimentScore === 0 ? 
                        'Not enough data' : 
                        `Sentiment Score: ${stock.sentimentScore.toFixed(2)}`
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedStock} onOpenChange={() => setSelectedStock(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 text-white border-gray-700">
            {selectedStock && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl sm:text-2xl flex items-center justify-between font-jetbrains">
                    <div className="flex items-center gap-4">
                      <span>{selectedStock.stock}</span>
                      {customTickers.includes(selectedStock.stock) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeCustomTicker(selectedStock.stock)
                            setSelectedStock(null)
                          }}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          <span className="sr-only">Remove Ticker</span>
                        </Button>
                      )}
                    </div>
                    {selectedStock.stockData && (
                      <span className={`text-base sm:text-lg ${selectedStock.stockData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${selectedStock.stockData.price.toFixed(2)}
                        <span className="ml-1 sm:ml-2">
                          {selectedStock.stockData.change >= 0 ? '▲' : '▼'} 
                          {Math.abs(selectedStock.stockData.changePercent).toFixed(2)}%
                        </span>
                      </span>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2 font-jetbrains">Key Statistics</h3>
                    {selectedStock.stockData?.details && (
                      <div className="grid grid-cols-2 gap-2 text-sm font-jetbrains">
                        <div className="text-gray-400">Market Cap</div>
                        <div className="text-right text-gray-200">{formatLargeNumber(selectedStock.stockData.details.marketCap)}</div>
                        <div className="text-gray-400">P/E Ratio</div>
                        <div className="text-right text-gray-200">{formatNumber(selectedStock.stockData.details.peRatio)}</div>
                        <div className="text-gray-400">Forward P/E</div>
                        <div className="text-right text-gray-200">{formatNumber(selectedStock.stockData.details.forwardPE)}</div>
                        <div className="text-gray-400">Dividend Yield</div>
                        <div className="text-right text-gray-200">{formatPercentage(selectedStock.stockData.details.dividendYield)}</div>
                        <div className="text-gray-400">Beta</div>
                        <div className="text-right text-gray-200">{formatNumber(selectedStock.stockData.details.beta)}</div>
                        <div className="text-gray-400">52 Week High</div>
                        <div className="text-right text-gray-200">${formatNumber(selectedStock.stockData.details.high52Week)}</div>
                        <div className="text-gray-400">52 Week Low</div>
                        <div className="text-right text-gray-200">${formatNumber(selectedStock.stockData.details.low52Week)}</div>
                        <div className="text-gray-400">Price to Book</div>
                        <div className="text-right text-gray-200">{formatNumber(selectedStock.stockData.details.priceToBook)}</div>
                        <div className="text-gray-400">Profit Margin</div>
                        <div className="text-right text-gray-200">{formatPercentage(selectedStock.stockData.details.profitMargin)}</div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2 font-jetbrains">Growth & Volume</h3>
                    {selectedStock.stockData?.details && (
                      <div className="grid grid-cols-2 gap-2 text-sm font-jetbrains">
                        <div className="text-gray-400">Volume</div>
                        <div className="text-right text-gray-200">{formatLargeNumber(selectedStock.stockData.details.volume)}</div>
                        <div className="text-gray-400">Avg Volume</div>
                        <div className="text-right text-gray-200">{formatLargeNumber(selectedStock.stockData.details.avgVolume)}</div>
                        <div className="text-gray-400">Earnings Growth</div>
                        <div className="text-right text-gray-200">{formatPercentage(selectedStock.stockData.details.earningsGrowth)}</div>
                        <div className="text-gray-400">Revenue Growth</div>
                        <div className="text-right text-gray-200">{formatPercentage(selectedStock.stockData.details.revenueGrowth)}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-4 text-center font-jetbrains">
                    Sentiment Analysis ({selectedStock.count} Articles)
                  </h3>
                  <div className={`text-center p-2 rounded-md font-jetbrains ${
                    selectedStock.sentimentScore === 0 ? 'bg-gray-800/50' :
                    selectedStock.sentimentScore > 0 ? 'bg-green-900/50' : 'bg-red-900/50'
                  }`}>
                    <span className={`font-semibold ${
                      selectedStock.sentimentScore === 0 ? 'text-gray-400' :
                      selectedStock.sentimentScore > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {selectedStock.sentimentScore === 0 ? 
                        'Not enough data' : 
                        `Overall Sentiment Score: ${selectedStock.sentimentScore.toFixed(2)}`
                      }
                    </span>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="text-gray-300 font-jetbrains">Headline</TableHead>
                          <TableHead className="w-32 text-right text-gray-300 font-jetbrains">Sentiment</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedStock.articles?.map((article: Article, index: number) => (
                          <TableRow key={index} className="border-gray-700 hover:bg-gray-800/50">
                            <TableCell className="font-jetbrains">
                              {article.url ? (
                                <a 
                                  href={article.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="hover:underline text-blue-400"
                                >
                                  {article.headline}
                                </a>
                              ) : (
                                article.headline
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-jetbrains ${
                              article.sentimentScore === 0 ? 'text-gray-400' :
                              article.sentimentScore > 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {article.sentimentScore.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}