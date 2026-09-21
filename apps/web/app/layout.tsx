import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppNav } from '@/components/app-nav';
import { Providers } from '@/components/providers';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'ACME Salary',
  description: 'HR salary management for ACME',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <Providers>
          <AppNav />
          <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
