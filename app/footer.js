'use client';

import React from 'react';
import Link from 'next/link';
import { Github, Coffee } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="py-4 mt-12 bg-gradient-to-r from-slate-700 via-slate-500 to-blue-500">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-white ">
              © {new Date().getFullYear()}{' '}
              <Link
                href="https://github.com/DukeBWard"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white hover:underline"
              >
                Luke Ward
              </Link>
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="https://github.com/DukeBWard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-blue-300 transition-colors"
            >
              <Github size={20} />
              <span className="sr-only">GitHub</span>
            </Link>
            <Link
              href="https://buymeacoffee.com/lukeward"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-blue-300 transition-colors"
            >
              <Coffee size={20} />
              <span className="sr-only">Buy Me a Coffee</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
