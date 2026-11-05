'use client'

import { useRef } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import { ArrowDown, Heart } from 'lucide-react'
import { EASE, ShineButton, WhatsAppIcon, WordsReveal } from './motion'

export interface Swatch {
  name: string
  image: string
}

function Column({ items, dir, className = '' }: { items: Swatch[]; dir: 'up' | 'down'; className?: string }) {
  // Sonsuz döngü için liste iki kez arka arkaya
  const loop = [...items, ...items]
  return (
    <div className={`relative h-full overflow-hidden ${className}`}>
      <div className={`flex flex-col gap-4 ${dir === 'up' ? 'animate-col-up' : 'animate-col-down'}`}>
        {loop.map((s, i) => (
          <figure key={i} className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
            <img src={s.image} alt="" className="h-full w-full object-cover" loading={i < 3 ? 'eager' : 'lazy'} />
            <figcaption className="absolute bottom-3 left-3 rounded-full bg-night/60 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
              {s.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

export default function Hero({ swatches, whatsappHref }: { swatches: Swatch[]; whatsappHref: string }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  // Fareyi izleyen altın ışık
  const mx = useMotionValue(70)
  const my = useMotionValue(40)
  const sx = useSpring(mx, { stiffness: 60, damping: 20 })
  const sy = useSpring(my, { stiffness: 60, damping: 20 })
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${sx}% ${sy}%, rgba(227,171,59,0.16), transparent 60%)`

  // Kaydırınca içerik yukarı süzülür, kumaş duvarı yavaşça büyür
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -120])
  const contentO = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const wallScale = useTransform(scrollYProgress, [0, 1], [1, 1.15])
  const wallY = useTransform(scrollYProgress, [0, 1], [0, 80])

  // Sütunlara farklı sıralarla dağıt
  const a = swatches
  const b = [...swatches.slice(1), swatches[0]]
  const c = [...swatches.slice(2), ...swatches.slice(0, 2)]

  return (
    <section
      ref={ref}
      id="ana-sayfa"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set(((e.clientX - r.left) / r.width) * 100)
        my.set(((e.clientY - r.top) / r.height) * 100)
      }}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-night text-white"
    >
      <p
        aria-hidden
        className="pointer-events-none absolute right-4 top-[5.4rem] z-20 flex items-center gap-1 text-[11px] font-medium tracking-wide text-white/20 sm:right-6 xl:top-5 xl:right-8"
      >
        <span className="font-display">F</span>
        <Heart className="h-2.5 w-2.5 fill-current" strokeWidth={1.5} />
      </p>
      {/* Kumaş duvarı */}
      <motion.div
        aria-hidden
        style={reduce ? undefined : { scale: wallScale, y: wallY }}
        className="absolute inset-y-[-10%] right-[-12%] -z-10 w-[95%] sm:right-[-6%] sm:w-[75%] lg:right-[-4%] lg:w-[58%]"
      >
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: EASE }}
          className="grid h-full rotate-[-8deg] grid-cols-2 gap-4 sm:grid-cols-3"
        >
          <Column items={a} dir="up" />
          <Column items={b} dir="down" className="mt-[-30%]" />
          <Column items={c} dir="up" className="hidden sm:block" />
        </motion.div>
      </motion.div>

      {/* Duvarı karartan katmanlar */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-night via-night/85 to-night/10" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-transparent to-night/70" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-night/70 sm:hidden" />
      <div aria-hidden className="weave absolute inset-0 -z-10" />
      <motion.div aria-hidden style={{ background: spotlight }} className="absolute inset-0 -z-10" />

      {/* Altın iplik */}
      <svg aria-hidden viewBox="0 0 1440 900" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
        <defs>
          <linearGradient id="thread" x1="0" x2="1">
            <stop offset="0" stopColor="#E3AB3B" stopOpacity="0" />
            <stop offset="0.35" stopColor="#F4D48A" />
            <stop offset="1" stopColor="#E3AB3B" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <motion.path
          d="M-40 690 C 220 610, 360 820, 620 700 S 980 470, 1180 560 S 1420 700, 1500 600"
          fill="none"
          stroke="url(#thread)"
          strokeWidth="1.6"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.6, delay: 0.6, ease: [0.65, 0, 0.35, 1] }}
        />
        <motion.path
          d="M-40 735 C 240 650, 380 860, 640 740 S 1000 510, 1200 600 S 1430 740, 1500 650"
          fill="none"
          stroke="url(#thread)"
          strokeWidth="0.8"
          strokeOpacity="0.5"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 3, delay: 0.9, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>

      <motion.div
        style={reduce ? undefined : { y: contentY, opacity: contentO }}
        className="mx-auto w-full max-w-7xl px-5 pb-24 pt-32 sm:px-8 lg:px-12"
      >
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="inline-flex items-center gap-2.5 rounded-full border border-thread/30 bg-thread/10 py-1.5 pl-2.5 pr-4 text-sm font-semibold text-thread-soft backdrop-blur"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-thread" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-thread" />
          </span>
          Toptan kumaş tedariki
        </motion.p>

        <h1 className="mt-7 max-w-[54rem] font-display text-[3.2rem] font-black leading-[0.98] sm:text-7xl lg:text-[5.6rem]">
          <WordsReveal text="Toptan kumaşta" onView={false} delay={0.3} className="block" />
          <WordsReveal text="kalite, hız" onView={false} delay={0.5} className="block" />
          <WordsReveal text="ve güven." onView={false} delay={0.7} className="block" wordClassName="text-gold-thread" />
        </h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1, ease: EASE }}
          className="mt-7 max-w-lg text-lg leading-relaxed text-white/70 sm:text-xl"
        >
          Geniş kumaş yelpazemizi üreticilere, atölyelere ve mağazalara toptan fiyatla ulaştırıyoruz. Siz ihtiyacınızı yazın, gerisini biz halledelim.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.15, ease: EASE }}
          className="mt-10 flex flex-col gap-3 sm:flex-row"
        >
          <ShineButton href={whatsappHref}>
            <WhatsAppIcon />
            WhatsApp'tan teklif al
          </ShineButton>
          <a
            href="#kumaslar"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 font-semibold text-white backdrop-blur transition-colors hover:border-white/40 hover:bg-white/[0.08]"
          >
            Kumaşları keşfet
            <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
          </a>
        </motion.div>
      </motion.div>

      {/* Kaydır göstergesi */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 1 }}
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold tracking-wide text-white/40 sm:flex"
      >
        Kaydır
        <span className="relative h-10 w-px overflow-hidden bg-white/15">
          <motion.span
            className="absolute inset-x-0 top-0 h-4 bg-thread"
            animate={reduce ? undefined : { y: [-16, 40] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </span>
      </motion.div>
    </section>
  )
}
