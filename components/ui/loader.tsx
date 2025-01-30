'use client';

import { cn } from "@/lib/utils";

export function HashLoader({ className }: { className?: string }) {
  return (
    <div className={cn("w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin", className)} />
  );
} 