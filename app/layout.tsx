import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: '早间电台 · 今日新闻',
  description: '为通勤准备好的今日新闻播单',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: '早间电台',
    statusBarStyle: 'black-translucent',
  },
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
