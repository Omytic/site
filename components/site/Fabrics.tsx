'use client'

import { useRef } from 'react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { EASE, Reveal, WhatsAppIcon, WordsReveal } from './motion'

export interface Fabric {
  id: string
  name: string
  description: string | null
  image_url: string | null
  category: 'kumaş' | 'diğer'
  amazon_link: string | null
  features: string[] | null
}

/** Altın yıldızlarla ayrılmış, sonsuz kayan kumaş isimleri. */
export function FabricMarquee({ names }: { names: string[] }) {
  const list = names.length ? names : ['Toptan kumaş', 'Hızlı tedarik', 'Size özel teklif']
  const row = [...list, ...list, ...list, ...list]
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-night py-6 text-white" aria-hidden>
      <div className="flex w-max animate-marquee items-center">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {row.map((n, i) => (
              <span key={`${k}-${i}`} className="flex items-center">
                <span className={`px-8 font-display text-3xl font-black tracking-tight sm:text-5xl ${i % 2 ? 'text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.35)]' : 'text-white'}`}>
                  {n}
                </span>
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-thread" fill="currentColor">
                  <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-night" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-night" />
    </div>
  )
}

function FabricCard({
  fabric,
  index,
  quoteHref,
  onOpen,
}: {
  fabric: Fabric
  index: number
  quoteHref: string
  onOpen: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rx = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(px, [0, 1], [-7, 7]), { stiffness: 200, damping: 20 })
  const glareX = useTransform(px, (v) => `${v * 100}%`)
  const glareY = useTransform(py, (v) => `${v * 100}%`)
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX} ${glareY}, rgba(255,255,255,0.22), transparent 45%)`

  return (
    <motion.li
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.9, delay: (index % 4) * 0.09, ease: EASE }}
      style={{ perspective: 1000 }}
    >
      <motion.div
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          px.set((e.clientX - r.left) / r.width)
          py.set((e.clientY - r.top) / r.height)
        }}
        onMouseLeave={() => {
          px.set(0.5)
          py.set(0.5)
        }}
        style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="group relative aspect-[4/5] overflow-hidden rounded-[22px] bg-ink shadow-[0_30px_60px_-30px_rgba(14,21,39,0.55)]"
      >
        <button type="button" onClick={onOpen} className="absolute inset-0 z-10" aria-label={`${fabric.name} detaylarını gör`} />
        {fabric.image_url ? (
          <img
            src={fabric.image_url}
            alt={fabric.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">Görsel yakında</div>
        )}
        {/* Parlama */}
        <motion.div
          aria-hidden
          style={{ background: glare }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/90 via-night/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/10 transition duration-500 group-hover:ring-thread/60" />

        <div className="absolute inset-x-0 bottom-0 z-20 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">{fabric.name}</h3>
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-all duration-500 group-hover:rotate-45 group-hover:bg-thread group-hover:text-night sm:flex">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="grid transition-all duration-500 ease-out sm:grid-rows-[0fr] sm:opacity-0 sm:group-hover:grid-rows-[1fr] sm:group-hover:opacity-100">
            <div className="overflow-hidden">
              <a
                href={quoteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-30 mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-thread px-4 text-sm font-bold text-night"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Teklif iste
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.li>
  )
}

export default function Fabrics({
  fabrics,
  loading,
  error,
  waGeneral,
  quoteHref,
  onOpen,
}: {
  fabrics: Fabric[]
  loading: boolean
  error: string | null
  waGeneral: string
  quoteHref: (name: string) => string
  onOpen: (f: Fabric) => void
}) {
  return (
    <section id="kumaslar" className="relative z-10 -mt-8 rounded-t-[40px] bg-paper py-20 text-ink sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <h2 className="font-display text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
            <WordsReveal text="Kumaş" className="block" />
            <WordsReveal text="vitrinimiz" className="block" delay={0.1} />
          </h2>
          <Reveal delay={0.2} className="lg:justify-self-end">
            <p className="max-w-md text-lg leading-relaxed text-ink-soft/80">
              Toptan tedarik ettiğimiz kumaşlardan bir seçki. Detay için kumaşa dokunun, fiyat için tek tıkla teklif isteyin.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="aspect-[4/5] animate-pulse rounded-[22px] bg-line" />
            ))}
          </ul>
        ) : error || fabrics.length === 0 ? (
          <Reveal>
            <div className="rounded-[28px] border border-line bg-white p-10 text-center">
              <p className="text-lg text-ink">
                {error ?? 'Vitrin şu an güncelleniyor.'} Stoktaki kumaşları sormak için bize yazın.
              </p>
              <a href={waGeneral} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-bold text-white">
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp'tan sor
              </a>
            </div>
          </Reveal>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {fabrics.map((f, i) => (
              <FabricCard key={f.id} fabric={f} index={i} quoteHref={quoteHref(f.name)} onOpen={() => onOpen(f)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
