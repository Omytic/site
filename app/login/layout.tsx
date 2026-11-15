import type { Metadata } from 'next'

// Giriş sayfası arama motorlarında görünmesin
export const metadata: Metadata = {
  title: 'Giriş',
  robots: { index: false, follow: false },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
