import { NextResponse } from 'next/server';
import * as fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { customTickers } = await req.json();
    
    // Validate input
    if (!Array.isArray(customTickers)) {
      return NextResponse.json(
        { error: 'Invalid input: customTickers must be an array' },
        { status: 400 }
      );
    }

    // Ensure all tickers are strings
    const validTickers = customTickers.filter(ticker => typeof ticker === 'string');
    
    // Write to config file
    const configPath = path.join(process.cwd(), 'config.json');
    const config = {
      customTickers: validTickers
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error syncing tickers:', error);
    return NextResponse.json(
      { error: 'Failed to sync tickers' },
      { status: 500 }
    );
  }
} 