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

export default function Home() {
  const [stocks, setStocks] = useState<StockSentiment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customTicker, setCustomTicker] = useState('')
  const [customTickers, setCustomTickers] = useState<string[]>([])
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1d')
  const [selectedStock, setSelectedStock] = useState<StockSentiment | null>(null)

  const addCustomTicker = () => {
    if (customTicker && !customTickers.includes(customTicker.toUpperCase())) {
      setCustomTickers([...customTickers, customTicker.toUpperCase()])
      setCustomTicker('')
    }
  }

  const removeCustomTicker = (ticker: string) => {
    setCustomTickers(customTickers.filter(t => t !== ticker))
  }

  const fetchStocks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (customTickers.length > 0) {
        params.append('tickers', customTickers.join(','))
      }
      params.append('range', selectedRange)
      
      const response = await fetch(`/api/stocks?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }
      const data: StockSentiment[] = await response.json()
      setStocks(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [customTickers, selectedRange])

  useEffect(() => {
    fetchStocks()
  }, [fetchStocks])

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
      {/* Gradient Dot Background */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(#ffffff33_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)]" />
      
      <div className="container mx-auto p-8 relative">
        <Card className="mb-8 bg-gray-900/50 backdrop-blur-sm border-gray-700">
          <CardHeader>
            <CardTitle className="text-3xl font-jetbrains text-white">Stock Sentiment Analyzer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 mb-4 font-jetbrains">
              This tool uses OpenAI to analyze market sentiment for various stocks and displays the top stocks to consider based on sentiment.
            </p>
            <div className="flex gap-4 mb-4">
              <Input
                placeholder="Add custom ticker (e.g., MSFT)"
                value={customTicker}
                onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && addCustomTicker()}
                className="max-w-xs bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-400 focus:border-gray-600 focus:ring-gray-600"
              />
              <Button 
                onClick={addCustomTicker} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-jetbrains"
              >
                Add Ticker
              </Button>
            </div>
            {customTickers.length > 0 && (
              <div className="flex gap-2 mb-4">
                {customTickers.map(ticker => (
                  <Button
                    key={ticker}
                    variant="outline"
                    onClick={() => removeCustomTicker(ticker)}
                    className="bg-gray-800/50 border-gray-700 text-white hover:bg-gray-700 hover:text-white font-jetbrains"
                  >
                    {ticker}
                    <span className="ml-2 text-xs">×</span>
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-4 items-center">
              <Select value={selectedRange} onValueChange={(value: TimeRange) => setSelectedRange(value)}>
                <SelectTrigger className="w-[180px] bg-gray-800 border-gray-700 text-white font-jetbrains">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="1d" className="text-white hover:bg-gray-700">1 Day</SelectItem>
                  <SelectItem value="5d" className="text-white hover:bg-gray-700">5 Days</SelectItem>
                  <SelectItem value="1mo" className="text-white hover:bg-gray-700">1 Month</SelectItem>
                  <SelectItem value="1y" className="text-white hover:bg-gray-700">1 Year</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={fetchStocks} 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 font-jetbrains"
              >
                {loading ? 'Analyzing...' : 'Refresh Analysis'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="text-red-500 mb-4 font-jetbrains">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stocks.map((stock) => (
            <Card 
              key={stock.stock} 
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow bg-gray-900/50 backdrop-blur-sm border-gray-700 hover:border-gray-600"
              onClick={() => setSelectedStock(stock)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-white font-jetbrains">{stock.stock}</CardTitle>
                  {stock.stockData && (
                    <div className={`text-sm font-jetbrains ${stock.stockData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${stock.stockData.price.toFixed(2)}
                      <span className="ml-2">
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

        <Dialog open={!!selectedStock} onOpenChange={() => setSelectedStock(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 text-white border-gray-700 font-jetbrains">
            {selectedStock && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl flex items-center justify-between">
                    <span>{selectedStock.stock}</span>
                    {selectedStock.stockData && (
                      <span className={`text-lg ${selectedStock.stockData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${selectedStock.stockData.price.toFixed(2)}
                        <span className="ml-2">
                          {selectedStock.stockData.change >= 0 ? '▲' : '▼'} 
                          {Math.abs(selectedStock.stockData.changePercent).toFixed(2)}%
                        </span>
                      </span>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Key Statistics</h3>
                    {selectedStock.stockData?.details && (
                      <div className="grid grid-cols-2 gap-2 text-sm">
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
                    <h3 className="text-lg font-semibold mb-2">Growth & Volume</h3>
                    {selectedStock.stockData?.details && (
                      <div className="grid grid-cols-2 gap-2 text-sm">
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
                  <h3 className="text-xl font-semibold mb-4 text-center">
                    Sentiment Analysis ({selectedStock.count} Articles)
                  </h3>
                  <div className={`text-center p-2 rounded-md ${
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

                  <div className="max-h-[300px] overflow-y-auto mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="text-gray-300">Headline</TableHead>
                          <TableHead className="w-32 text-right text-gray-300">Sentiment</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedStock.articles.map((article, index) => (
                          <TableRow key={index} className="border-gray-700">
                            <TableCell>
                              {article.url ? (
                                <a 
                                  href={article.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 hover:underline"
                                >
                                  {article.headline}
                                </a>
                              ) : (
                                article.headline
                              )}
                            </TableCell>
                            <TableCell className={`text-right ${
                              article.sentimentScore >= 0 ? 'text-green-400' : 'text-red-400'
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
    </main>
  )
}
