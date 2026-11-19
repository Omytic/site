import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { aiConfigured } from '@/lib/ai'
import { extractJson } from '@/lib/aiJobs'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'
export const maxDuration = 60

const API = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'

const SYSTEM = `Türk faturalarından (e-Fatura, e-Arşiv, kâğıt fatura fotoğrafı, UBL XML) bilgi çıkaran bir muhasebe asistanısın.
Bizim şirketimiz: OMY Ticaret (unvanında "OMY" geçer). Satıcı biz isek fatura bizim kestiğimiz SATIŞ faturasıdır; satıcı başkasıysa ALIŞ (mal) ya da GİDER (hizmet: kira, kargo, reklam, yazılım, muhasebe vb.) faturasıdır. Faturada "İADE" yazıyorsa tür iade'dir.
Sadece belgede yazanı al, tahmin etme; okunamayan alanı null bırak. Tutarlar sayı olsun (nokta ondalık, binlik ayırıcı yok).
Cevap olarak SADECE şu JSON'u ver:
{"tarih":"YYYY-MM-DD","fatura_no":"...","satici":{"unvan":"...","vkn":"..."},"alici":{"unvan":"...","vkn":"..."},"matrah":0,"kdv":0,"toplam":0,"para_birimi":"TRY","tur":"satis|alis|gider|iade","kesen_sistem":"belgede görünen e-fatura sağlayıcısı ya da pazaryeri, yoksa null","kalemler":[{"ad":"...","adet":0,"birim_fiyat":0,"tutar":0}],"marka":"formstep|seryn|kumas|null"}`

export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })
  if (!aiConfigured()) return NextResponse.json({ message: 'Fatura okuma için ANTHROPIC_API_KEY tanımlı değil.' }, { status: 503 })

  const { name, type, data } = await req.json().catch(() => ({}))
  if (!data || typeof data !== 'string') return NextResponse.json({ message: 'Dosya gelmedi' }, { status: 400 })
  if (data.length > 4_000_000) return NextResponse.json({ message: 'Dosya çok büyük (en fazla ~3 MB).' }, { status: 413 })
  const t = String(type || '').toLowerCase()
  const n = String(name || '').toLowerCase()
  let block: any
  if (t === 'application/pdf' || n.endsWith('.pdf')) block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  else if (/^image\/(jpeg|png|gif|webp)$/.test(t)) block = { type: 'image', source: { type: 'base64', media_type: t, data } }
  else if (/xml|html|text/.test(t) || /\.(xml|html?|txt)$/.test(n)) {
    // UBL XML'de gömülü PDF/base64 alanları çok uzun olur; atılır
    const text = Buffer.from(data, 'base64').toString('utf8').replace(/<cbc:EmbeddedDocumentBinaryObject[\s\S]*?<\/cbc:EmbeddedDocumentBinaryObject>/g, '').replace(/<[^>]*(script|style)[\s\S]*?<\/(script|style)>/gi, '').slice(0, 60_000)
    block = { type: 'text', text: `Fatura dosyası (${name}):\n${text}` }
  } else return NextResponse.json({ message: 'Bu dosya türü okunamıyor. PDF, fotoğraf ya da e-fatura XML yükleyin.' }, { status: 415 })

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Bu faturanın bilgilerini çıkar.' }] }],
      }),
      cache: 'no-store',
    })
    const b = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Claude ${res.status}: ${b.error?.message ?? 'okunamadı'}`)
    const text = (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const out = extractJson(text)
    if (!out) throw new Error('Faturadan bilgi çıkarılamadı.')
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 502 })
  }
}
