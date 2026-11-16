const tryFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
const tryFmt2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const compactFmt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })

/*
 * Görüntüleme para birimi: panelin üstündeki ₺ / $ / € düğmesi. Kayıtlar her zaman TL saklanır;
 * $ ya da € seçilince tutarlar son TCMB kuruyla çevrilerek gösterilir.
 */
export type DisplayCurrency = 'TRY' | 'USD' | 'EUR'
let display: { cur: DisplayCurrency; rate: number } = { cur: 'TRY', rate: 1 }
const fxFmt: Record<string, Intl.NumberFormat> = {}
const fmtFor = (cur: string, exact: boolean) =>
  (fxFmt[cur + exact] ??= new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, minimumFractionDigits: exact ? 2 : 0, maximumFractionDigits: exact ? 2 : 0 }))
export const setDisplayCurrency = (cur: DisplayCurrency, rate: number) => {
  display = cur === 'TRY' || !(rate > 0) ? { cur: 'TRY', rate: 1 } : { cur, rate }
}
export const displayCurrency = () => display.cur
/** Grafik eksenleri için: TL tutarı seçili para birimine çevirir (TL seçiliyse aynen döner). */
export const toDisplay = (v: number) => (display.cur === 'TRY' ? v : v / display.rate)
export const displaySym = () => (display.cur === 'USD' ? '$' : display.cur === 'EUR' ? '€' : '')

export const tl = (v: number | null | undefined, exact = false) =>
  display.cur === 'TRY' ? (exact ? tryFmt2 : tryFmt).format(Number(v ?? 0)) : fmtFor(display.cur, exact || Math.abs(Number(v ?? 0) / display.rate) < 100).format(Number(v ?? 0) / display.rate)

/** Belirli bir para biriminde, çevirmeden yaz (ör. "$4,20"). */
export const money = (v: number | null | undefined, cur: string, exact = true) => (cur === 'TRY' ? (exact ? tryFmt2 : tryFmt) : fmtFor(cur, exact)).format(Number(v ?? 0))
export const num = (v: number | null | undefined) => numFmt.format(Number(v ?? 0))
export const compact = (v: number) => compactFmt.format(v)
export const pct = (v: number) => `%${numFmt.format(Math.round(v * 10) / 10)}`

export const today = () => toISODate(new Date())
export const toISODate = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const monthKey = (iso: string) => iso.slice(0, 7)
export const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split('-').map(Number)
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`
}
/** Son n ayın anahtarları, eskiden yeniye (2026-11 dahil). */
export const lastMonths = (n: number, from = today()) => {
  const [y, m] = from.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
export const firstOfMonth = (key: string) => `${key}-01`

export const dateTR = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}
export const dateTimeTR = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const relTime = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'az önce'
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün önce`
  return dateTR(iso)
}

export const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0)
export const groupSum = <T,>(arr: T[], key: (x: T) => string, val: (x: T) => number) => {
  const m = new Map<string, number>()
  arr.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + (Number(val(x)) || 0)))
  return m
}

/** Türkçe karakterleri bozmadan arama. */
export const norm = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '')
