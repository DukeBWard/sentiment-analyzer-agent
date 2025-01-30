import { NextResponse } from 'next/server';
import { createIngestor } from '@/scripts/ingest-docs';

// Initialize environment variables check
if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API Key');
}

if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_INDEX) {
  throw new Error('Missing Pinecone configuration');
}

// Function to get a formatted timestamp
function getTimestamp() {
  return new Date().toISOString();
}

export async function GET(req: Request) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Get custom tickers from URL params and update config
  const { searchParams } = new URL(req.url);
  const customTickers = searchParams.get('tickers')?.split(',').filter(Boolean) || [];
  
  console.log(`[${getTimestamp()}] [${requestId}] Ingest API called`);
  
  try {
    // Initialize the document ingestor
    const ingestor = await createIngestor();
    
    // Update custom tickers if provided
    if (customTickers.length > 0) {
      await ingestor.updateCustomTickers(customTickers);
    }
    
    // Get all tickers to process
    const tickersToProcess = await ingestor.getAllTickers();
    console.log(`[${getTimestamp()}] [${requestId}] Processing tickers:`, tickersToProcess);

    // Process each company in parallel
    const results = await Promise.allSettled(
      tickersToProcess.map(async (symbol) => {
        console.log(`[${getTimestamp()}] [${requestId}] Checking ${symbol}`);
        const hasRecentDocs = await ingestor.checkExistingDocument(symbol);
        if (hasRecentDocs) {
          return `Skipped ${symbol} (recently processed)`;
        }
        await ingestor.processCompany(symbol);
        return `Processed ${symbol}`;
      })
    );

    // Collect results
    const processedResults = results.map((result, index) => ({
      symbol: tickersToProcess[index],
      status: result.status,
      result: result.status === 'fulfilled' ? result.value : result.reason
    }));

    const duration = Date.now() - startTime;
    console.log(`[${getTimestamp()}] [${requestId}] Ingest API completed in ${duration}ms`, {
      results: processedResults
    });

    return NextResponse.json({ 
      message: 'Document ingestion complete',
      requestId,
      duration,
      results: processedResults
    });
  } catch (error) {
    console.error(`[${getTimestamp()}] [${requestId}] Error in ingest route:`, error);
    return NextResponse.json(
      { error: 'Internal server error during ingestion' },
      { status: 500 }
    );
  }
} 