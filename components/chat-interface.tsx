'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HashLoader } from '@/components/ui/loader';
import { Trash2, Send, HelpCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const EXAMPLE_QUESTIONS = [
  "What's the latest news about this stock?",
  "What are the key risks for this company?",
  "How does this compare to competitors?",
  "What's the growth potential?",
  "Should I consider investing in this stock?"
];

// Add a helper function for consistent time formatting
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function ChatInterface({ stocks }: { stocks: Array<{ stock: string }> }) {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize messages after component mounts
  useEffect(() => {
    setMounted(true);
    setMessages([{
      role: 'system',
      content: 'Welcome! Select a stock and ask me anything about it. I can help you analyze market sentiment, news, and financial data.',
      timestamp: new Date()
    }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Don't render anything until after mounting
  if (!mounted) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedTicker) return;

    const userMessage = { 
      role: 'user' as const, 
      content: input,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          ticker: selectedTicker
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      setMessages((prev) => [...prev, { 
        role: 'assistant', 
        content: data.content,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: 'Sorry, there was an error processing your request.',
          timestamp: new Date()
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'system',
      content: 'Welcome! Select a stock and ask me anything about it. I can help you analyze market sentiment, news, and financial data.',
      timestamp: new Date()
    }]);
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  return (
    <Card className="w-full max-w-5xl mx-auto p-4 sm:p-6 h-[600px] sm:h-[800px] flex flex-col bg-gray-900/50 backdrop-blur-sm border-gray-700">
      <div className="mb-4 sm:mb-6 flex items-center justify-between">
        <Select value={selectedTicker} onValueChange={setSelectedTicker}>
          <SelectTrigger className="w-full bg-gray-800/50 border-gray-700 text-white">
            <SelectValue placeholder="Select a stock to analyze" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            {stocks.map((stock) => (
              <SelectItem key={stock.stock} value={stock.stock} className="text-white hover:bg-gray-700">
                {stock.stock}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={clearChat}
          className="ml-2 text-gray-400 hover:text-red-400 hover:bg-gray-800/50"
          title="Clear chat (Ctrl + Backspace)"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div 
        className="flex-1 overflow-y-auto mb-4 sm:mb-6 space-y-4 pr-4 [&::-webkit-scrollbar]:w-2 
          [&::-webkit-scrollbar-track]:bg-gray-800/20 
          [&::-webkit-scrollbar-thumb]:bg-gray-700 
          [&::-webkit-scrollbar-thumb]:rounded-full 
          [&::-webkit-scrollbar-thumb]:border-2
          [&::-webkit-scrollbar-thumb]:border-transparent
          [&::-webkit-scrollbar-thumb]:bg-clip-padding
          [&::-webkit-scrollbar-thumb]:hover:bg-gray-600
          hover:[&::-webkit-scrollbar-thumb]:bg-gray-600
          [&::-webkit-scrollbar-corner]:transparent"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              message.role === 'user'
                ? 'items-end'
                : message.role === 'system'
                ? 'items-center'
                : 'items-start'
            }`}
          >
            <div
              className={`p-3 sm:p-4 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600/50 text-white ml-auto max-w-[80%] hover:bg-blue-700/50'
                  : message.role === 'system'
                  ? 'bg-gray-800/50 text-gray-200 text-center max-w-[90%] hover:bg-gray-900/50'
                  : 'bg-gray-800/50 text-gray-100 mr-auto max-w-[80%] hover:bg-gray-900/50'
              }`}
            >
              <div className="text-sm sm:text-base">{message.content}</div>
            </div>
            <span className="text-xs text-gray-400 mt-1 px-1">
              {formatTime(message.timestamp)}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
        {isLoading && (
          <div className="flex justify-center items-center py-2">
            <HashLoader className="text-blue-500" />
          </div>
        )}
      </div>
      {messages.length === 1 && (
        <div className="mb-4 p-4 bg-gray-800/50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-200 mb-2">
            <HelpCircle className="h-4 w-4" />
            <span>Example questions:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((question, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleExampleClick(question)}
                className="bg-gray-800/50 text-gray-200 border-gray-700 hover:bg-gray-900 hover:border-gray-600 hover:text-white transition-colors disabled:text-gray-500"
                disabled={!selectedTicker}
              >
                {question}
              </Button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={selectedTicker ? `Ask about ${selectedTicker}... (Ctrl + K to focus)` : "Select a stock first..."}
          disabled={isLoading || !selectedTicker}
          className="flex-1 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-400 focus:border-gray-600 focus:ring-gray-600"
        />
        <Button 
          type="submit" 
          disabled={isLoading || !selectedTicker}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700"
        >
          {isLoading ? (
            <HashLoader className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}