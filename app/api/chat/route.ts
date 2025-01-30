import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { PineconeStore } from '@langchain/pinecone';
import { PromptTemplate } from "@langchain/core/prompts";

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API Key');
}

if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_INDEX) {
  throw new Error('Missing Pinecone configuration');
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

export async function POST(req: Request) {
  try {
    const { messages, ticker } = await req.json();
    
    if (!ticker) {
      return NextResponse.json(
        { error: 'Please select a ticker to analyze' },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1].content;

    // Get Pinecone index
    const index = pinecone.Index(process.env.PINECONE_INDEX!);

    // Create vector store with metadata filter for specific ticker
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings(),
      { 
        pineconeIndex: index,
        filter: { symbol: ticker.toUpperCase() }
      }
    );

    // Create chain
    const model = new ChatOpenAI({
      temperature: 0,
      modelName: 'gpt-4o-mini',
      streaming: true,
    });

    const prompt = PromptTemplate.fromTemplate(`Do not use markdown. If no specific year is mentioned in the question, assume it refers to the current year (${new Date().getFullYear()}). Answer the following question about ${ticker.toUpperCase()} based on the provided context:

Context: {context}
Question: {input}

Answer: `);

    const documentChain = await createStuffDocumentsChain({
      llm: model,
      prompt,
    });

    const retriever = vectorStore.asRetriever(50);
    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever,
    });

    // Generate context-aware response
    const response = await retrievalChain.invoke({
      input: lastMessage,
    });

    return NextResponse.json({
      content: response.answer,
      sources: response.context,
    });
  } catch (error) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 