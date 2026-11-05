import { ArrowUpRight } from 'lucide-react'
import StoreLinks from './StoreLinks'
import { FORMSTEP, SERYN } from '@/lib/brands'

// "Markalarımız": her marka kendi renkleri, fontu ve ürün görseliyle.
export default function OtherVentures() {
  return (
    <section id="markalarimiz" className="bg-paper py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12">
        <div className="mb-10 grid gap-4 sm:mb-14 lg:grid-cols-[1fr_1fr] lg:items-end">
          <h2 className="stretch-wide text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
            Markalarımız
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-stone lg:justify-self-end">
            Kumaşın yanında iki markamızla doğrudan son kullanıcıya ulaşıyoruz. İkisini de kendi sitelerinden ve pazaryerlerinden alabilirsiniz.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:gap-5">
          {/* FormStep */}
          <article className="relative flex flex-col overflow-hidden rounded-[28px] bg-fs-navy text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-fs-blue/40 blur-[90px]"
            />
            <div className="relative p-7 sm:p-10">
              <img src="/images/brands/formstep-logo-white.png" alt="FormStep" className="h-8 w-auto sm:h-9" />
              <p className="mt-6 max-w-sm text-2xl font-extrabold leading-tight stretch-semi sm:text-3xl">
                Hafızalı köpük tabanlık. Her ayak için bir model.
              </p>
            </div>

            <div className="relative flex flex-1 items-center justify-center px-7 py-4 sm:px-10">
              <img
                src="/images/brands/formstep-m900.webp"
                alt="FormStep M900 tabanlık"
                className="w-full max-w-[540px] drop-shadow-[0_28px_36px_rgba(0,0,0,0.5)]"
                loading="lazy"
              />
            </div>

            <dl className="relative grid grid-cols-3 gap-px border-t border-white/10 bg-white/10">
              {[
                ['M100', 'Günlük kullanım'],
                ['M300', 'İçe ya da dışa basma'],
                ['M900', 'Topuk desteği'],
              ].map(([m, d]) => (
                <div key={m} className="bg-fs-navy px-4 py-5 sm:px-7">
                  <dt className="text-lg font-extrabold text-fs-sky stretch-semi">{m}</dt>
                  <dd className="mt-1 text-sm leading-snug text-white/70">{d}</dd>
                </div>
              ))}
            </dl>

            <div className="relative border-t border-white/10 p-7 sm:px-10">
              <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
                <a
                  href={FORMSTEP.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-fs-blue px-6 font-semibold transition-colors hover:bg-[#1d6ad8]"
                >
                  {FORMSTEP.siteLabel}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <StoreLinks stores={FORMSTEP.stores} brand="FormStep" tone="formstep" />
              </div>
            </div>
          </article>

          {/* SERYN */}
          <article className="relative flex flex-col overflow-hidden rounded-[28px] bg-seryn-tan font-seryn text-seryn-ink">
            <div className="p-7 sm:p-10">
              <img src="/images/brands/seryn-logo.webp" alt="SERYN" className="h-16 w-auto sm:h-20" />
              <p className="mt-6 max-w-xs text-xl font-semibold leading-snug sm:text-2xl">
                Sürtünme başlamadan önce sürülen bariyer bakım stick'i.
              </p>
              <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-seryn-gray">
                Koşu, uzun yürüyüş, hac ve umre, sıcak günler. Alkol içermez, kokusuzdur.
              </p>
            </div>

            <div className="relative flex flex-1 items-end justify-center px-7">
              <div aria-hidden className="absolute bottom-0 left-1/2 h-48 w-[85%] -translate-x-1/2 rounded-t-full bg-seryn-mint" />
              <img
                src="/images/brands/seryn-stick.webp"
                alt="SERYN Barrier Care Stick"
                className="relative h-60 w-auto drop-shadow-[0_20px_24px_rgba(58,58,58,0.25)] sm:h-72"
                loading="lazy"
              />
            </div>

            <div className="space-y-3 bg-seryn-tanAlt p-7 sm:px-10">
              <a
                href={SERYN.site}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-seryn-terra px-6 font-semibold text-white transition-colors hover:bg-[#a34f42]"
              >
                {SERYN.siteLabel}
                <ArrowUpRight className="h-4 w-4" />
              </a>
              <StoreLinks stores={SERYN.stores} brand="SERYN" tone="seryn" />
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
