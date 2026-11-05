'use client'

import { useMemo, useRef } from 'react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { ArrowUpRight, Check } from 'lucide-react'
import { FORMSTEP, SERYN, type StoreLink } from '@/lib/brands'
import { EASE, Reveal, WordsReveal } from './motion'

function Stores({ stores, brand, tone }: { stores: StoreLink[]; brand: string; tone: 'formstep' | 'seryn' }) {
  const cls =
    tone === 'formstep'
      ? 'rounded-2xl bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/[0.12] hover:ring-fs-sky/40'
      : 'rounded-full bg-seryn-ink hover:bg-black'
  return (
    <ul className="grid grid-cols-3 gap-2">
      {stores.map((s, i) => (
        <motion.li
          key={s.key}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease: EASE }}
        >
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${brand} ürünleri ${s.label}'da`}
            className={`flex h-12 items-center justify-center px-3 transition-all duration-300 hover:-translate-y-1 ${cls}`}
          >
            <img src={s.logo} alt={s.label} className="h-[18px] w-auto max-w-full object-contain" loading="lazy" />
          </a>
        </motion.li>
      ))}
    </ul>
  )
}

/* ---------------- FormStep ---------------- */

const FS_MODELS = [
  { id: 'M100', text: 'Günlük kullanım', img: '/images/brands/formstep-m100.webp' },
  { id: 'M300', text: 'İçe ya da dışa basma', img: '/images/brands/formstep-m300.webp' },
  { id: 'M900', text: 'Topuk desteği', img: '/images/brands/formstep-m900.webp' },
]

function FormStepPanel() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  // Panel ekrana girerken tabanlıklar üst üste dururken yelpaze gibi açılır
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 24 })
  const leftX = useTransform(p, [0, 1], ['0%', '-42%'])
  const rightX = useTransform(p, [0, 1], ['0%', '40%'])
  const rightY = useTransform(p, [0, 1], ['0%', '6%'])
  const midY = useTransform(p, [0, 1], ['4%', '-6%'])
  const glow = useTransform(p, [0, 1], [0.2, 0.75])

  return (
    <div ref={ref} className="relative overflow-hidden rounded-[36px] bg-fs-night text-white sm:rounded-[44px]">
      {/* Mavi ışık + basınç ızgarası */}
      <motion.div aria-hidden style={{ opacity: glow }} className="absolute right-[-10%] top-[10%] h-[620px] w-[620px] rounded-full bg-fs-blue/50 blur-[140px]" />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(78,161,225,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(78,161,225,0.12) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 70% 50%, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 70% 50%, black 20%, transparent 70%)',
        }}
      />

      <div className="relative grid gap-8 p-7 sm:p-12 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-4 lg:p-16">
        <div className="relative z-10">
          <img src="/images/brands/formstep-logo-white.png" alt="FormStep" className="h-9 w-auto sm:h-10" />
          <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#f1c26d]/30 bg-[#f1c26d]/10 px-3.5 py-1.5 text-sm font-semibold text-[#f6d99a]">
            <span aria-hidden>★</span> Amazon Türkiye'nin en çok satan tabanlığı
          </p>
          <h3 className="mt-5 font-display text-4xl font-black leading-[0.98] sm:text-5xl lg:text-6xl">
            <WordsReveal text="Her adımda" className="block" />
            <WordsReveal text="daha fazla" className="block" delay={0.1} />
            <WordsReveal text="konfor." className="block" delay={0.2} wordClassName="text-fs-sky" />
          </h3>
          <Reveal delay={0.2}>
            <p className="mt-5 max-w-sm text-lg leading-relaxed text-white/65">
              İki katmanlı hafızalı köpük tabanlık. Ayağınıza göre üç model.
            </p>
          </Reveal>

          <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {FS_MODELS.map((m, i) => (
              <motion.li
                key={m.id}
                initial={reduce ? false : { opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.7, ease: EASE }}
                className="group flex items-center gap-5 py-3.5"
              >
                <span className="w-16 font-display text-xl font-black text-fs-sky transition-transform duration-300 group-hover:translate-x-1">{m.id}</span>
                <span className="text-white/75">{m.text}</span>
              </motion.li>
            ))}
          </ul>

          <div className="mt-8 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <a
              href={FORMSTEP.site}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fs-blue px-6 font-bold shadow-[0_10px_40px_-10px_rgba(36,119,234,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#1d6ad8]"
            >
              {FORMSTEP.siteLabel}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <Stores stores={FORMSTEP.stores} brand="FormStep" tone="formstep" />
          </div>
        </div>

        {/* Tabanlık sahnesi */}
        <div className="relative order-first h-[300px] sm:h-[440px] lg:order-none lg:h-[560px]">
          <div aria-hidden className="absolute bottom-[8%] left-1/2 h-10 w-[70%] -translate-x-1/2 rounded-[50%] bg-black/60 blur-2xl" />
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-[8%]">
            <motion.img
              src={FS_MODELS[0].img}
              alt="FormStep M100"
              style={reduce ? { x: '-42%' } : { x: leftX }}
              className="h-[76%] w-auto drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
          <div className="absolute inset-0 z-20 flex items-start justify-center pt-[8%]">
            <motion.img
              src={FS_MODELS[1].img}
              alt="FormStep M300"
              style={reduce ? { y: '-6%' } : { y: midY }}
              className="h-[82%] w-auto drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-[8%]">
            <motion.img
              src={FS_MODELS[2].img}
              alt="FormStep M900"
              style={reduce ? { x: '40%', y: '6%' } : { x: rightX, y: rightY }}
              className="h-[76%] w-auto drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- SERYN ---------------- */

function ShieldParticles() {
  const reduce = useReducedMotion()
  const items = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (i * 37) % 100,
        y: 40 + ((i * 53) % 55),
        size: 12 + ((i * 7) % 18),
        dur: 7 + (i % 5) * 1.6,
        delay: (i * 0.7) % 6,
        rot: i % 2 ? 25 : -25,
      })),
    [],
  )
  if (reduce) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((p, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B85C4E"
          strokeWidth="1.2"
          style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -180], opacity: [0, 0.55, 0.55, 0], rotate: [0, p.rot] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M12 2L3 7v6c0 5 4 9 9 10 5-1 9-5 9-10V7L12 2z" />
        </motion.svg>
      ))}
    </div>
  )
}

function SerynPanel() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const rot = useTransform(scrollYProgress, [0, 1], [-10, 8])
  const lift = useTransform(scrollYProgress, [0, 1], [60, -60])

  return (
    <div ref={ref} className="relative overflow-hidden rounded-[36px] bg-[#f0c4b8] font-seryn text-seryn-ink shadow-[0_40px_90px_-48px_rgba(154,72,60,0.7)] sm:rounded-[44px]">
      <div aria-hidden className="absolute -left-20 top-1/2 h-[540px] w-[540px] -translate-y-1/2 rounded-full bg-[#e39b8c] blur-3xl" />
      <div aria-hidden className="absolute -right-10 -top-16 h-80 w-80 rounded-full bg-[#fff4ef] blur-2xl" />
      <ShieldParticles />
      <div className="relative grid gap-6 p-7 sm:p-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:p-16">
        {/* Ürün sahnesi */}
        <div className="relative h-[340px] sm:h-[460px] lg:h-[540px]">
          <div aria-hidden className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: EASE }}
              className="h-[78%] rounded-full bg-[#fff6f2]"
              style={{ aspectRatio: '1 / 1' }}
            />
          </div>
          <motion.div
            style={reduce ? undefined : { y: lift, rotate: rot }}
            className="absolute inset-0 z-10 flex items-end justify-center gap-6 pb-[8%] sm:gap-8"
          >
            <motion.img
              src="/images/brands/seryn-stick.webp"
              alt="SERYN Barrier Care Stick 18 g"
              animate={reduce ? undefined : { y: [-8, 8, -8] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="h-[72%] w-auto drop-shadow-[0_30px_30px_rgba(58,58,58,0.35)]"
            />
            <motion.img
              src="/images/brands/seryn-stick-10g.webp"
              alt="SERYN 10 g seyahat boyu"
              animate={reduce ? undefined : { y: [6, -6, 6] }}
              transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
              className="h-[34%] w-auto drop-shadow-[0_20px_24px_rgba(58,58,58,0.3)]"
            />
          </motion.div>
        </div>

        <div className="relative z-10">
          <Reveal>
            <img src="/images/brands/seryn-logo.webp" alt="SERYN" className="h-16 w-auto sm:h-20" />
          </Reveal>
          <h3 className="mt-6 text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: '"Montserrat Variable", Montserrat, sans-serif' }}>
            <WordsReveal text="Her adımda" className="block" />
            <span className="relative inline-block">
              <WordsReveal text="konfor." delay={0.15} wordClassName="italic text-seryn-terra" />
              <motion.span
                aria-hidden
                initial={reduce ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.8, ease: EASE }}
                className="absolute -bottom-1 left-0 h-[5px] w-full origin-left rounded-full bg-seryn-terra/70"
              />
            </span>
          </h3>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-seryn-gray">
              Sürtünme başlamadan önce sürülen bariyer bakım stick'i. Koşuda, uzun yürüyüşte, hac ve umrede, sıcak günlerde.
            </p>
          </Reveal>
          <ul className="mt-6 flex flex-wrap gap-2">
            {['Alkol içermez', 'Dermatolojik olarak test edildi', 'Kokusuz'].map((t, i) => (
              <motion.li
                key={t}
                initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.25 + i * 0.08, duration: 0.5, ease: EASE }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold shadow-sm ring-1 ring-seryn-terra/15"
              >
                <Check className="h-4 w-4 text-seryn-terra" />
                {t}
              </motion.li>
            ))}
          </ul>
          <p className="mt-5 text-sm font-semibold text-seryn-gray">18 g günlük boy ve 10 g seyahat boyu</p>

          <div className="mt-8 space-y-3">
            <a
              href={SERYN.site}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-b from-[#c97362] to-seryn-terra px-6 font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_40px_-12px_rgba(184,92,78,0.8)] transition-transform hover:-translate-y-0.5"
            >
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <span className="relative">{SERYN.siteLabel}</span>
              <ArrowUpRight className="relative h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <Stores stores={SERYN.stores} brand="SERYN" tone="seryn" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Brands() {
  return (
    <section id="markalar" className="relative bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12">
        <div className="mb-12 grid gap-6 px-1 lg:mb-16 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <h2 className="font-display text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
            <WordsReveal text="Markalarımız" className="block" />
          </h2>
          <Reveal delay={0.15} className="lg:justify-self-end">
            <p className="max-w-md text-lg leading-relaxed text-ink-soft/80">
              Kumaşın yanında iki markamızla doğrudan son kullanıcıya ulaşıyoruz. İkisini de kendi sitelerinden ve pazaryerlerinden alabilirsiniz.
            </p>
          </Reveal>
        </div>
        <div className="space-y-5 sm:space-y-6">
          <Reveal y={60}>
            <FormStepPanel />
          </Reveal>
          <Reveal y={60}>
            <SerynPanel />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
