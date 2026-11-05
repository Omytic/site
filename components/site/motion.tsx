'use client'

import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import type { ReactNode } from 'react'

export const EASE = [0.16, 1, 0.3, 1] as const

/** Görünüme girince yumuşakça beliren blok. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** Başlıkları kelime kelime, bulanıktan nete açar. */
export function WordsReveal({
  text,
  className = '',
  delay = 0,
  stagger = 0.07,
  onView = true,
  wordClassName = '',
}: {
  text: string
  wordClassName?: string
  className?: string
  delay?: number
  stagger?: number
  onView?: boolean
}) {
  const reduce = useReducedMotion()
  const words = text.split(' ')
  const anim = { opacity: 1, y: '0%', filter: 'blur(0px)' }
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className={`inline-block ${wordClassName}`}
            initial={reduce ? false : { opacity: 0, y: '70%', filter: 'blur(10px)' }}
            {...(onView ? { whileInView: anim, viewport: { once: true, margin: '-60px' } } : { animate: anim })}
            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/** Sayfanın en üstünde altın iplik gibi ilerleme çubuğu. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 })
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-[2px] origin-left bg-gradient-to-r from-thread-deep via-thread to-thread-soft"
    />
  )
}

/** Altın, parlayan ana buton (WhatsApp vb.). */
export function ShineButton({
  href,
  children,
  external = true,
  className = '',
}: {
  href: string
  children: ReactNode
  external?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`group relative inline-flex h-14 items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-b from-thread-soft to-thread px-7 font-bold text-night shadow-[0_10px_40px_-8px_rgba(227,171,59,0.6)] transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
      <span className="relative inline-flex items-center gap-2.5">{children}</span>
    </a>
  )
}

export function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.44-9.44 2.52 0 4.89.99 6.67 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.44 9.43M20.08 3.92A11.3 11.3 0 0 0 12.05.6C5.8.6.7 5.7.7 11.95c0 2 .52 3.95 1.52 5.67L.6 23.4l5.92-1.55a11.3 11.3 0 0 0 5.52 1.4h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  )
}
