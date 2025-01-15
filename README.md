# Stock Sentiment Analyzer

A real-time stock analysis tool that combines market data with AI-powered sentiment analysis to provide comprehensive insights into stock performance and market sentiment.

## Features

### Real-Time Market Data
- Live stock price tracking
- Historical price charts with multiple timeframes (1 day, 5 days, 1 month, 1 year)
- Key financial metrics including market cap, P/E ratio, volume, and more
- Support for custom stock tickers

### AI-Powered Sentiment Analysis
- Real-time news sentiment analysis using OpenAI's GPT-3.5
- Aggregated sentiment scores for each stock
- News headlines with individual sentiment ratings
- Automatic tracking of major tech stocks (AAPL, MSFT, GOOGL, AMZN, META)

### Interactive UI
- Responsive design that works on all devices
- Interactive stock charts
- Easy-to-read sentiment indicators
- One-click addition of custom stocks to track

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality UI components
- **Recharts** - Composable charting library

### Backend
- **Next.js API Routes** - Serverless backend functionality
- **Yahoo Finance API** - Real-time market data
- **OpenAI GPT-3.5** - Natural language processing for sentiment analysis
- **Axios** - HTTP client for API requests

### Data Processing
- **TypeScript** - Type-safe code
- **Server-side data fetching** - Optimized for performance
- **Real-time data aggregation** - Combines multiple data sources

## How It Works

1. **Data Collection**
   - Fetches real-time stock data from Yahoo Finance
   - Gathers latest news headlines for each stock
   - Combines default and user-selected stocks

2. **Sentiment Analysis**
   - Processes news headlines through OpenAI's GPT-3.5
   - Generates sentiment scores (-1.0 to 1.0)
   - Aggregates multiple headlines for overall sentiment

3. **Data Presentation**
   - Displays interactive price charts
   - Shows key financial metrics
   - Presents sentiment analysis with color-coded indicators
   - Lists relevant news with individual sentiment scores

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key for sentiment analysis

## Limitations

- API calls are optimized for Vercel's serverless environment (10s timeout)
- Free tier rate limits apply for Yahoo Finance API
- OpenAI API usage costs apply for sentiment analysis

## License

MIT License - feel free to use this project for your own purposes

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
