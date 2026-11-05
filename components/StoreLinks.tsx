import type { StoreLink } from '@/lib/brands'

interface Props {
  stores: StoreLink[]
  brand: string
  tone: 'formstep' | 'seryn'
}

// Pazaryeri logoları beyaz (Amazon, Trendyol) ve turuncu (Hepsiburada),
// bu yüzden her iki markada da koyu zeminli kutucuklar.
const tones = {
  formstep: 'bg-white/[0.07] ring-1 ring-white/15 hover:bg-white/[0.14] rounded-xl',
  seryn: 'bg-seryn-ink hover:bg-black rounded-full',
}

export default function StoreLinks({ stores, brand, tone }: Props) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {stores.map((s) => (
        <li key={s.key}>
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${brand} ürünleri ${s.label}'da`}
            className={`flex h-12 items-center justify-center px-3 transition-colors ${tones[tone]}`}
          >
            <img src={s.logo} alt={s.label} className="h-[18px] w-auto max-w-full object-contain" loading="lazy" />
          </a>
        </li>
      ))}
    </ul>
  )
}
