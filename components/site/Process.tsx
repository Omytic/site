'use client'

import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import { MessageSquareText, Receipt, Truck } from 'lucide-react'
import { EASE, Reveal, WordsReveal } from './motion'

const STEPS = [
  {
    icon: MessageSquareText,
    title: 'İhtiyacınızı yazın',
    text: 'Kumaş türünü, rengi ve yaklaşık miktarı WhatsApp ya da e-postayla iletin. Fotoğraf ya da numune görseli de gönderebilirsiniz.',
  },
  {
    icon: Receipt,
    title: 'Fiyat ve termin alın',
    text: 'Stok durumuna göre size özel toptan fiyatı ve teslim süresini net olarak bildirelim.',
  },
  {
    icon: Truck,
    title: 'Sevkiyat',
    text: 'Onayınızın ardından siparişiniz hazırlanır ve en kısa sürede yola çıkar.',
  },
]

export default function Process() {
  const ref = useRef<HTMLOListElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] })
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  return (
    <section id="surec" className="relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div aria-hidden className="weave absolute inset-0" />
      <div aria-hidden className="absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-thread/10 blur-[140px]" />

      <div className="relative mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:gap-20 lg:px-12">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <h2 className="font-display text-5xl font-black leading-[0.95] sm:text-6xl">
            <WordsReveal text="Toptan sipariş" className="block" />
            <WordsReveal text="üç adımda." className="block" delay={0.15} wordClassName="text-gold-thread" />
          </h2>
          <Reveal delay={0.25}>
            <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/65">
              Karmaşık formlar yok. Bir mesajla başlıyor, kumaşınız yola çıkana kadar yanınızdayız.
            </p>
          </Reveal>
        </div>

        <ol ref={ref} className="relative space-y-6 pl-10 sm:pl-14">
          {/* İplik: arka plan + kaydırdıkça dolan altın çizgi */}
          <span aria-hidden className="absolute bottom-6 left-[15px] top-6 w-px bg-white/10 sm:left-[23px]" />
          <motion.span
            aria-hidden
            style={reduce ? undefined : { scaleY }}
            className="absolute bottom-6 left-[15px] top-6 w-px origin-top bg-gradient-to-b from-thread-soft via-thread to-thread-deep shadow-[0_0_12px_rgba(227,171,59,0.8)] sm:left-[23px]"
          />
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              initial={reduce ? false : { opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-25% 0px' }}
              transition={{ duration: 0.9, ease: EASE }}
              className="group relative rounded-[26px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-colors duration-500 hover:border-thread/40 hover:bg-white/[0.06] sm:p-8"
            >
              <motion.span
                aria-hidden
                initial={reduce ? false : { scale: 0.4, backgroundColor: '#141E36' }}
                whileInView={{ scale: 1, backgroundColor: '#E3AB3B' }}
                viewport={{ once: true, margin: '-35% 0px' }}
                transition={{ duration: 0.6, ease: EASE }}
                className="absolute -left-10 top-8 flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-black text-night ring-4 ring-night sm:-left-14 sm:h-12 sm:w-12 sm:text-lg"
              >
                {i + 1}
              </motion.span>
              <div className="flex items-start gap-5">
                <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-thread/10 text-thread ring-1 ring-thread/20 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110 sm:flex">
                  <s.icon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-white/65">{s.text}</p>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}
