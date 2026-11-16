import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate } from './server'

/*
 * TCMB gösterge kurları (anahtar gerektirmez): https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
 * TCMB her iş günü 15.30'da bülten yayımlar; bu kur ERTESİ iş günü geçerlidir.
 * Bu yüzden D günündeki bir işlem için D'den ÖNCEKİ son bülten kullanılır (hafta sonu / tatil atlanır).
 */
export type FxCurrency = 'USD' | 'EUR'
export interface Bulletin {
  date: string // bülten (ilan) tarihi, YYYY-MM-DD
  bulletin: string | null
  rates: Record<FxCurrency, { buying: number; selling: number }>
}

const pad = (n: number) => String(n).padStart(2, '0')
const shift = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function parse(xml: string, date: string): Bulletin | null {
  const pick = (code: FxCurrency) => {
    const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`))?.[1]
    if (!block) return null
    const val = (tag: string) => Number((block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '').trim())
    const unit = val('Unit') || 1
    const buying = val('ForexBuying') / unit
    const selling = val('ForexSelling') / unit
    return selling > 0 ? { buying: buying || selling, selling } : null
  }
  const usd = pick('USD')
  const eur = pick('EUR')
  if (!usd || !eur) return null
  return { date, bulletin: xml.match(/Bulten_No="([^"]*)"/)?.[1] ?? null, rates: { USD: usd, EUR: eur } }
}

/** Belirli bir günün bülteni (yoksa — hafta sonu, tatil, henüz yayımlanmamış — null). */
export async function fetchBulletin(date: string): Promise<Bulletin | null> {
  const [y, m, d] = date.split('-')
  const base = process.env.TCMB_BASE_URL || 'https://www.tcmb.gov.tr/kurlar'
  const url = `${base}/${y}${m}/${d}${m}${y}.xml`
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/xml' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`TCMB yanıt vermedi (${res.status})`)
  return parse(await res.text(), date)
}

async function cached(db: SupabaseClient, date: string): Promise<Bulletin | null> {
  const { data } = await db.from('fx_rates').select('*').eq('rate_date', date)
  if (!data || data.length < 2) return null
  const r = (c: FxCurrency) => data.find((x) => x.currency === c)!
  return { date, bulletin: data[0].bulletin, rates: { USD: { buying: Number(r('USD').buying), selling: Number(r('USD').selling) }, EUR: { buying: Number(r('EUR').buying), selling: Number(r('EUR').selling) } } }
}

async function store(db: SupabaseClient, b: Bulletin) {
  await db.from('fx_rates').upsert(
    (['USD', 'EUR'] as FxCurrency[]).map((c) => ({ rate_date: b.date, currency: c, buying: b.rates[c].buying, selling: b.rates[c].selling, bulletin: b.bulletin })),
    { onConflict: 'rate_date,currency' },
  )
}

/** Bir bülten tarihini önbellekten ya da TCMB'den getir. */
export async function bulletinOn(db: SupabaseClient, date: string): Promise<Bulletin | null> {
  const c = await cached(db, date)
  if (c) return c
  const b = await fetchBulletin(date)
  if (b) await store(db, b)
  return b
}

/** D günü yapılan işlem için geçerli kur: D'den önceki son TCMB bülteni. */
export async function rateFor(db: SupabaseClient, txDate: string): Promise<Bulletin | null> {
  const todayTR = istanbulDate(Date.now())
  // Gelecek tarih için en fazla bugünün bülteni kullanılabilir
  let day = shift(txDate > todayTR ? shift(todayTR, 1) : txDate, -1)
  for (let i = 0; i < 12; i++, day = shift(day, -1)) {
    const b = await bulletinOn(db, day)
    if (b) return b
  }
  return null
}

export const _test = { parse, shift, pad }
