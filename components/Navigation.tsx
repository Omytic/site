'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import Logo from './Logo'

const links = [
  { href: '#kumaslar', label: 'Kumaşlar' },
  { href: '#nasil-calisiyoruz', label: 'Nasıl çalışıyoruz' },
  { href: '#markalarimiz', label: 'Markalarımız' },
  { href: '#iletisim', label: 'İletişim' },
]

export default function Navigation({ whatsappHref }: { whatsappHref: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8 lg:px-12">
        <a href="#ana-sayfa" aria-label="OMY Ticaret ana sayfa">
          <Logo size="sm" />
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm font-medium text-stone transition-colors hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-soft sm:inline-flex"
          >
            Teklif al
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="-mr-2 p-2 text-ink md:hidden"
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="border-t border-line bg-paper px-4 pb-4 md:hidden">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-3.5 font-medium text-ink">
                {l.label}
              </a>
            </li>
          ))}
          <li className="pt-4">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="block rounded-full bg-ink py-3 text-center font-semibold text-white">
              WhatsApp'tan teklif al
            </a>
          </li>
        </ul>
      )}
    </header>
  )
}
