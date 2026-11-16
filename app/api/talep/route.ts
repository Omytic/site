import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/integrations/server'

export const dynamic = 'force-dynamic'

/*
 * Sitedeki formlar (toptan teklif, bayilik, kumaş numunesi) → panelde Talepler.
 * Herkese açık uç: botlara karşı gizli alan + süre kontrolü + IP başına sınır; alanlar kısaltılır.
 */
const hits = new Map<string, number[]>()
const LIMIT = 5
const WINDOW = 10 * 60_000

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'yerel'
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (recent.length >= LIMIT) return NextResponse.json({ message: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin ya da WhatsApp’tan yazın.' }, { status: 429 })

  let b: Record<string, unknown>
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ message: 'Geçersiz istek.' }, { status: 400 })
  }
  // Gizli alan doldurulduysa ya da form 3 saniyeden kısa sürede gönderildiyse bot say: sessizce "tamam" de
  if (b.website || (typeof b.t === 'number' && now - b.t < 3000)) return NextResponse.json({ ok: true })

  const kind = ['toptan', 'bayi', 'numune'].includes(String(b.kind)) ? String(b.kind) : 'toptan'
  const brand = ['kumas', 'formstep', 'seryn'].includes(String(b.brand)) ? String(b.brand) : kind === 'numune' ? 'kumas' : null
  const name = str(b.name, 120)
  const phone = str(b.phone, 40)
  const email = str(b.email, 160)
  if (!name) return NextResponse.json({ message: 'Adınızı yazın.' }, { status: 400 })
  if (!phone && !email) return NextResponse.json({ message: 'Size ulaşabilmemiz için telefon ya da e-posta yazın.' }, { status: 400 })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: 'E-posta adresi geçersiz görünüyor.' }, { status: 400 })

  let db
  try {
    db = adminClient()
  } catch {
    return NextResponse.json({ message: 'Form şu an çalışmıyor. Lütfen WhatsApp’tan yazın.' }, { status: 503 })
  }

  // Numune: sadece aktif kumaşlar, en çok 8 renk, her birinden 1–3
  let samples: { item_id: string; qty: number }[] = []
  if (Array.isArray(b.samples) && b.samples.length) {
    const wanted = (b.samples as { item_id?: unknown; qty?: unknown }[])
      .map((s) => ({ item_id: String(s?.item_id ?? ''), qty: Math.min(3, Math.max(1, Math.round(Number(s?.qty) || 1))) }))
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s.item_id))
      .slice(0, 8)
    if (wanted.length) {
      const { data } = await db.from('items').select('id').eq('brand', 'kumas').eq('active', true).in('id', wanted.map((w) => w.item_id))
      const ok = new Set((data ?? []).map((d) => d.id))
      samples = wanted.filter((w) => ok.has(w.item_id))
    }
  }

  const extra = [str(b.products, 300) && `İlgilendiği ürünler: ${str(b.products, 300)}`, str(b.quantity, 120) && `Miktar: ${str(b.quantity, 120)}`].filter(Boolean).join('\n')
  const message = [extra, str(b.message, 2000)].filter(Boolean).join('\n\n') || null

  const { data: lead, error } = await db
    .from('leads')
    .insert({ source: 'site', kind, brand, name, company: str(b.company, 160), phone, email, city: str(b.city, 80), address: str(b.address, 400), message, status: 'yeni' })
    .select('id')
    .single()
  if (error || !lead) return NextResponse.json({ message: 'Kaydedilemedi. Lütfen WhatsApp’tan yazın.' }, { status: 500 })
  if (samples.length) await db.from('lead_items').insert(samples.map((s) => ({ lead_id: lead.id, item_id: s.item_id, qty: s.qty })))

  hits.set(ip, [...recent, now])
  return NextResponse.json({ ok: true })
}
