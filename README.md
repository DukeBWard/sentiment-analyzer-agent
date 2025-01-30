# Stock Sentiment Analyzer 📈

An AI-powered financial analysis platform that combines real-time market data, SEC filings, and sentiment analysis to provide deep insights into major tech stocks.

## Features

- 🤖 **AI Chat Interface**
  - Natural language queries about company financials
  - Context-aware responses from latest 10-K filings
  - Real-time financial data integration

- 📊 **Market Analysis**
  - Real-time stock data and interactive charts
  - Automated sentiment analysis of market news
  - Custom stock tracking and watchlists

- 📈 **SEC Filing Analysis**
  - Automated ingestion of 10-K reports
  - Vector-based semantic search
  - Intelligent document parsing and chunking

## Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, shadcn/ui
- **AI/ML**: OpenAI GPT-4o-mini, LangChain
- **Vector DB**: Pinecone
- **Data Sources**: SEC EDGAR, Yahoo Finance API

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/stock-sentiment-analyzer
   cd stock-sentiment-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Required variables:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=your_pinecone_environment
   PINECONE_INDEX=your_pinecone_index
   ```

4. **Ingest SEC filings**
   ```bash
   npm run ingest
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

## Usage

1. Select a stock from the dropdown (AAPL, MSFT, GOOGL, AMZN, META)
2. View real-time market data and sentiment analysis
3. Use the chat interface to ask questions about the company:
   - Financial performance
   - Business operations
   - Risk factors
   - Corporate strategy
   - Market position

## License

MIT License - Feel free to use this project for your own purposes.

---
Made with ❤️ by [Luke Ward](https://github.com/DukeBWard)
