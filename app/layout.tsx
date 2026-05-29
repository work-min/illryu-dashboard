import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '일류 손익 대시보드',
  description: '일류기획 손익 보고 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  )
}
