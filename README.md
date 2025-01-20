# Stock Sentiment Analyzer 📈

AI-powered stock analysis tool that combines real-time market data with sentiment analysis.

## ✨ Features

- 🔄 Real-time stock data and charts
- 🤖 AI-powered news sentiment analysis
- 📱 Responsive, modern UI
- 📊 Interactive stock charts
- 🎯 Custom stock tracking
- 📰 News aggregation and scoring

## 🛠️ Built With

- [Next.js 14](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [OpenAI GPT-4o-mini](https://openai.com/) - Sentiment analysis
- [Yahoo Finance API](https://finance.yahoo.com/) - Market data

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/stock-sentiment-analyzer

# Install dependencies
npm install

# Add environment variables
cp .env.example .env
# Add your OpenAI API key to .env

# Run the development server
npm run dev
```

## 📝 Environment Variables

```env
OPENAI_API_KEY=your_openai_api_key
```

## 📊 Usage

1. View default tech stock analysis (AAPL, MSFT, GOOGL, etc.)
2. Add custom stocks to track
3. Select different timeframes (1d, 5d, 1mo, 1y)
4. Click on cards for detailed analysis

## ⚠️ Notes

- Free tier has rate limits
- Vercel deployment has 10s timeout
- OpenAI API costs apply

## 📄 License

MIT

---
Made with ❤️ by [Luke Ward](https://github.com/DukeBWard)
