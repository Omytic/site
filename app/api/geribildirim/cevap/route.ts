import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { answerTrendyolQuestion } from '@/lib/integrations/feedback'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'

/** Trendyol sorusuna panelden cevap gönderir. */
export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })
  const { id, text } = await req.json().catch(() => ({}))
  const { data: f } = await db.from('customer_feedback').select('id,source,status').eq('id', String(id ?? '')).maybeSingle()
  if (!f) return NextResponse.json({ message: 'Kayıt bulunamadı' }, { status: 404 })
  if (f.source !== 'trendyol_soru') return NextResponse.json({ message: 'Bu kayda panelden cevap gönderilemiyor' }, { status: 400 })
  try {
    await answerTrendyolQuestion(f.id.split(':')[1], String(text ?? ''))
    const now = new Date().toISOString()
    const { error } = await db.from('customer_feedback').update({ answer: String(text).trim(), answered_at: now, status: 'cevaplandi', external_status: 'WAITING_FOR_APPROVE', handled_by: auth.userId }).eq('id', f.id)
    if (error) throw new Error(`Cevap Trendyol'a gitti ama panele yazılamadı: ${error.message}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 502 })
  }
}
