import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OMY Ticaret | Toptan Kumaş Ticareti',
  description:
    'OMY Ticaret: toptan kumaş ticareti, geniş kumaş yelpazesi ve hızlı tedarik. FormStep ve SERYN markalarının da çatısı.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}
