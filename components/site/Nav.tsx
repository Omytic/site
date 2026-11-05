'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { EASE, WhatsAppIcon } from './motion'

const LINKS = [
  { id: 'kumaslar', label: 'Kumaşlar' },
  { id: 'surec', label: 'Süreç' },
  { id: 'markalar', label: 'Markalarımız' },
  { id: 'iletisim', label: 'İletişim' },
]

export function OmyMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 leading-none ${className}`}>
      <span className="font-display text-[1.45em] font-black tracking-[-0.04em]">OMY</span>
      <span aria-hidden className="h-[0.32em] w-[0.32em] translate-y-[-0.05em] rounded-full bg-thread" />
      <span className="text-[0.82em] font-semibold tracking-wide opacity-70">Ticaret</span>
    </span>
  )
}

export default function Nav({ whatsappHref }: { whatsappHref: string }) {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 40))

  // Hangi bölümdeyiz?
  useEffect(() => {
    const els = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id))
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const pill = hovered ?? active

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.1, ease: EASE }}
        className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-4"
      >
        <nav
          className={`flex w-full max-w-6xl items-center justify-between rounded-full border px-3 py-2 pl-5 text-white transition-all duration-500 sm:pl-6 ${
            scrolled
              ? 'border-white/10 bg-night/90 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl'
              : 'border-white/[0.06] bg-white/[0.03] backdrop-blur-md'
          }`}
          aria-label="Ana menü"
        >
          <a href="#ana-sayfa" className="text-[15px]" aria-label="OMY Ticaret ana sayfa">
            <OmyMark />
          </a>

          <ul className="hidden items-center md:flex" onMouseLeave={() => setHovered(null)}>
            {LINKS.map((l) => (
              <li key={l.id} className="relative">
                <a
                  href={`#${l.id}`}
                  onMouseEnter={() => setHovered(l.id)}
                  className={`relative z-10 block px-4 py-2 text-sm font-semibold transition-colors ${
                    pill === l.id ? 'text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {l.label}
                </a>
                {pill === l.id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.08] ring-1 ring-white/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative hidden h-11 items-center gap-2 overflow-hidden rounded-full bg-thread px-5 text-sm font-bold text-night transition-transform hover:-translate-y-px sm:inline-flex"
            >
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              <WhatsAppIcon className="relative h-4 w-4" />
              <span className="relative">Teklif al</span>
            </a>
            <button
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] md:hidden"
              aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
              aria-expanded={open}
            >
              <span className="relative block h-3 w-5">
                <span className={`absolute left-0 h-0.5 w-5 rounded bg-white transition-all duration-300 ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
                <span className={`absolute left-0 top-1.5 h-0.5 w-5 rounded bg-white transition-opacity ${open ? 'opacity-0' : ''}`} />
                <span className={`absolute left-0 h-0.5 w-5 rounded bg-white transition-all duration-300 ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
              </span>
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ clipPath: 'circle(0% at 92% 4%)' }}
            animate={{ clipPath: 'circle(150% at 92% 4%)' }}
            exit={{ clipPath: 'circle(0% at 92% 4%)' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="fixed inset-0 z-40 flex flex-col bg-night px-6 pb-10 pt-28 text-white md:hidden"
          >
            <div aria-hidden className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-thread/20 blur-[100px]" />
            <ul className="relative space-y-2">
              {LINKS.map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease: EASE }}
                >
                  <a
                    href={`#${l.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between border-b border-white/10 py-4 font-display text-4xl font-extrabold tracking-tight"
                  >
                    {l.label}
                    <span aria-hidden className={`h-2 w-2 rounded-full ${active === l.id ? 'bg-thread' : 'bg-white/15'}`} />
                  </a>
                </motion.li>
              ))}
            </ul>
            <motion.a
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6, ease: EASE }}
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="relative mt-auto flex h-14 items-center justify-center gap-2 rounded-full bg-thread font-bold text-night"
            >
              <WhatsAppIcon />
              WhatsApp'tan teklif al
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
