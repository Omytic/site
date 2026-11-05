'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Mail, Phone, Send } from 'lucide-react'
import { EASE, Reveal, WhatsAppIcon, WordsReveal } from './motion'
import { OmyMark } from './Nav'

export function Contact({ waGeneral, phone, email }: { waGeneral: string; phone: string; email: string }) {
  const reduce = useReducedMotion()
  const [sent, setSent] = useState(false)

  return (
    <section id="iletisim" className="relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div aria-hidden className="weave absolute inset-0" />
      <div aria-hidden className="absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-thread/15 blur-[150px]" />
      <div aria-hidden className="absolute -bottom-40 left-1/4 h-[420px] w-[420px] rounded-full bg-[#25D366]/10 blur-[150px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <h2 className="max-w-4xl font-display text-5xl font-black leading-[0.95] sm:text-7xl lg:text-8xl">
          <WordsReveal text="Kumaş mı" className="block" />
          <WordsReveal text="arıyorsunuz?" className="block" delay={0.1} wordClassName="text-gold-thread" />
        </h2>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65 sm:text-xl">
            Kumaşı özenle seçiyor, siparişinizi doğru ve hızlı ulaştırmak için her adımı takip ediyoruz. Yazın, toptan fiyatı iletelim.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* WhatsApp: büyük kart */}
          <motion.a
            href={waGeneral}
            target="_blank"
            rel="noopener noreferrer"
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.9, ease: EASE }}
            className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[32px] bg-gradient-to-br from-[#1FB855] to-[#0E8A3D] p-7 sm:p-10"
          >
            <div aria-hidden className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-2xl transition-transform duration-700 group-hover:scale-125" />
            <WhatsAppIcon className="absolute -bottom-10 -right-6 h-56 w-56 text-white/10 transition-transform duration-700 group-hover:-rotate-12 group-hover:scale-110" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <WhatsAppIcon className="h-7 w-7" />
            </span>
            <div className="relative">
              <p className="text-white/80">En hızlı yol</p>
              <p className="mt-1 font-display text-4xl font-black leading-tight sm:text-5xl">WhatsApp'tan yazın</p>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-bold text-[#0E8A3D] transition-transform group-hover:translate-x-1">
                Sohbeti başlat
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          </motion.a>

          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                { href: `tel:${phone.replace(/\s/g, '')}`, icon: Phone, label: 'Telefon', value: phone },
                { href: `mailto:${email}`, icon: Mail, label: 'E-posta', value: email },
              ].map((c, i) => (
                <motion.a
                  key={c.label}
                  href={c.href}
                  initial={reduce ? false : { opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: EASE }}
                  className="group rounded-[26px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-thread/40 hover:bg-white/[0.07]"
                >
                  <c.icon className="h-6 w-6 text-thread transition-transform duration-500 group-hover:-rotate-12" />
                  <p className="mt-6 text-sm text-white/55">{c.label}</p>
                  <p className="mt-1 break-all font-semibold sm:text-lg">{c.value}</p>
                </motion.a>
              ))}
            </div>

            <motion.form
              initial={reduce ? false : { opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
              onSubmit={(e) => {
                e.preventDefault()
                const f = e.currentTarget
                const name = (f.elements.namedItem('name') as HTMLInputElement).value
                const message = (f.elements.namedItem('message') as HTMLTextAreaElement).value
                const subject = encodeURIComponent('Toptan kumaş talebi - OMY Ticaret')
                const body = encodeURIComponent(`Ad-Soyad: ${name}\n\nMesaj:\n${message}`)
                window.location.href = `mailto:${email}?subject=${subject}&body=${body}`
                setSent(true)
              }}
              className="space-y-3 rounded-[26px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
            >
              <label htmlFor="name" className="sr-only">Ad soyad</label>
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                placeholder="Ad soyad"
                className="h-12 w-full rounded-2xl border border-white/10 bg-night/60 px-4 text-white outline-none transition placeholder:text-white/40 focus:border-thread"
              />
              <label htmlFor="message" className="sr-only">Mesajınız</label>
              <textarea
                id="message"
                name="message"
                required
                rows={3}
                placeholder="Hangi kumaş, hangi renk, yaklaşık ne kadar?"
                className="w-full resize-none rounded-2xl border border-white/10 bg-night/60 px-4 py-3 text-white outline-none transition placeholder:text-white/40 focus:border-thread"
              />
              <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white font-bold text-night transition-colors hover:bg-thread">
                <Send className="h-4 w-4" />
                {sent ? 'E-posta uygulamanız açıldı' : 'E-postayla gönder'}
              </button>
            </motion.form>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-night text-white">
      <div className="mx-auto max-w-7xl border-t border-white/10 px-5 pt-12 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <OmyMark className="text-lg" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/50">Toptan kumaş ticareti. FormStep ve SERYN markalarının çatısı.</p>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-white/60">
            <li><a href="#kumaslar" className="hover:text-white">Kumaşlar</a></li>
            <li><a href="#surec" className="hover:text-white">Süreç</a></li>
            <li><a href="https://formstep.tr" target="_blank" rel="noopener noreferrer" className="hover:text-white">FormStep</a></li>
            <li><a href="https://seryn.com.tr" target="_blank" rel="noopener noreferrer" className="hover:text-white">SERYN</a></li>
            <li><a href="#iletisim" className="hover:text-white">İletişim</a></li>
          </ul>
        </div>
        <p
          aria-hidden
          className="pointer-events-none mt-10 select-none text-center font-display text-[30vw] font-black leading-[0.75] tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.12)] lg:text-[22rem]"
        >
          OMY
        </p>
        <div className="flex flex-col gap-2 border-t border-white/10 py-6 text-xs text-white/40 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} OMY TEKSTİL TURİZM GIDA SANAYİ TİCARET LİMİTED ŞİRKETİ. Tüm hakları saklıdır.</p>
          <a href="#ana-sayfa" className="hover:text-white/70">Başa dön</a>
        </div>
      </div>
    </footer>
  )
}
