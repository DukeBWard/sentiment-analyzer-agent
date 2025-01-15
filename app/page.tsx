// app/page.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
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

  const fetchStocks = async () => {
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
  }

  useEffect(() => {
    fetchStocks()
  }, [customTickers, selectedRange])

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
    <main className="container mx-auto p-8">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-2xl">Stock Sentiment Analyzer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            This tool uses OpenAI to analyze market sentiment for various stocks and displays the top stocks to consider based on sentiment.
          </p>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Add custom ticker (e.g., MSFT)"
              value={customTicker}
              onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && addCustomTicker()}
              className="max-w-xs"
            />
            <Button onClick={addCustomTicker}>Add Ticker</Button>
          </div>
          {customTickers.length > 0 && (
            <div className="flex gap-2 mb-4">
              {customTickers.map(ticker => (
                <Button
                  key={ticker}
                  variant="outline"
                  onClick={() => removeCustomTicker(ticker)}
                  className="gap-2"
                >
                  {ticker}
                  <span className="text-xs">×</span>
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-4 items-center">
            <Select value={selectedRange} onValueChange={(value: TimeRange) => setSelectedRange(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">1 Day</SelectItem>
                <SelectItem value="5d">5 Days</SelectItem>
                <SelectItem value="1mo">1 Month</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={fetchStocks} disabled={loading}>
              {loading ? 'Analyzing...' : 'Refresh Analysis'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map((stock) => (
          <Card 
            key={stock.stock} 
            className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setSelectedStock(stock)}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>{stock.stock}</CardTitle>
                {stock.stockData && (
                  <div className={`text-sm ${stock.stockData.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
                        stroke={stock.stockData.change >= 0 ? '#22c55e' : '#ef4444'}
                        dot={false}
                      />
                      <XAxis
                        dataKey="timestamp"
                        hide
                      />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip
                        formatter={(value: any) => [`$${value}`, 'Price']}
                        labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className={`text-center p-2 rounded-md ${
                stock.sentimentScore >= 0 ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <span className={`font-semibold ${
                  stock.sentimentScore >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  Sentiment Score: {stock.sentimentScore.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedStock} onOpenChange={() => setSelectedStock(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedStock && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center justify-between">
                  <span>{selectedStock.stock}</span>
                  {selectedStock.stockData && (
                    <span className={`text-lg ${selectedStock.stockData.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
                      <div>Market Cap</div>
                      <div className="text-right">{formatLargeNumber(selectedStock.stockData.details.marketCap)}</div>
                      <div>P/E Ratio</div>
                      <div className="text-right">{formatNumber(selectedStock.stockData.details.peRatio)}</div>
                      <div>Forward P/E</div>
                      <div className="text-right">{formatNumber(selectedStock.stockData.details.forwardPE)}</div>
                      <div>Dividend Yield</div>
                      <div className="text-right">{formatPercentage(selectedStock.stockData.details.dividendYield)}</div>
                      <div>Beta</div>
                      <div className="text-right">{formatNumber(selectedStock.stockData.details.beta)}</div>
                      <div>52 Week High</div>
                      <div className="text-right">${formatNumber(selectedStock.stockData.details.high52Week)}</div>
                      <div>52 Week Low</div>
                      <div className="text-right">${formatNumber(selectedStock.stockData.details.low52Week)}</div>
                      <div>Price to Book</div>
                      <div className="text-right">{formatNumber(selectedStock.stockData.details.priceToBook)}</div>
                      <div>Profit Margin</div>
                      <div className="text-right">{formatPercentage(selectedStock.stockData.details.profitMargin)}</div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Growth & Volume</h3>
                  {selectedStock.stockData?.details && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Volume</div>
                      <div className="text-right">{formatLargeNumber(selectedStock.stockData.details.volume)}</div>
                      <div>Avg Volume</div>
                      <div className="text-right">{formatLargeNumber(selectedStock.stockData.details.avgVolume)}</div>
                      <div>Earnings Growth</div>
                      <div className="text-right">{formatPercentage(selectedStock.stockData.details.earningsGrowth)}</div>
                      <div>Revenue Growth</div>
                      <div className="text-right">{formatPercentage(selectedStock.stockData.details.revenueGrowth)}</div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">
                  Sentiment Analysis ({selectedStock.count} Articles)
                </h3>
                <div className="mb-4">
                  <div className={`text-center p-2 rounded-md ${
                    selectedStock.sentimentScore >= 0 ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <span className={`font-semibold ${
                      selectedStock.sentimentScore >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      Overall Sentiment Score: {selectedStock.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Headline</TableHead>
                        <TableHead className="w-32 text-right">Sentiment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedStock.articles.map((article, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {article.url ? (
                              <a 
                                href={article.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {article.headline}
                              </a>
                            ) : (
                              article.headline
                            )}
                          </TableCell>
                          <TableCell className={`text-right ${
                            article.sentimentScore >= 0 ? 'text-green-600' : 'text-red-600'
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
    </main>
  )
}
