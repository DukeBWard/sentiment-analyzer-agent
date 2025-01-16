import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Footer from "./footer";
import { Analytics } from "@vercel/analytics/react"
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Stock Sentiment Analyzer",
  description: "Analyze market sentiment for stocks using OpenAI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body className={`${jetbrains.className} min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900`}>
        <div className="fixed inset-0 w-full h-full bg-[radial-gradient(#ffffff33_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)] pointer-events-none" />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
