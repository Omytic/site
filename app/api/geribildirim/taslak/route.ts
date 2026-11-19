import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { BRAND_FACTS, claude } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const preferredRegion = 'fra1'

const SYSTEM = `Sen OMY Ticaret'in müşteri hizmetleri yazarısın. Pazaryerlerinde (Trendyol, Amazon, Hepsiburada) müşteri sorularına ve geri bildirimlerine marka adına cevap taslağı yazıyorsun.

${BRAND_FACTS}

KURALLAR
- Türkçe, sıcak ama ölçülü, kısa (genelde 2–4 cümle). "Merhaba," ile başla, teşekkür ya da iyi dileklerle bitir.
- Sadece yukarıdaki bilgilerden ve sorudan çıkan bilgileri kullan. Bilmediğin bir şeyi (stok tarihi, kargo süresi, içerik listesi, tıbbi iddia) uydurma; emin değilsen "ürün sayfasındaki bilgilere bakabilirsiniz" ya da "mesaj yoluyla iletebilirsiniz" gibi güvenli yönlendir.
- Tıbbi tavsiye ya da tedavi vaadi verme (ör. "topuk dikenini iyileştirir" deme; "topuk bölgesini destekler" de).
- Trendyol kuralları: telefon, e-posta, web adresi, sosyal medya hesabı ve başka satış kanalı yazma; başka pazaryerine yönlendirme. En az 10, en fazla 2000 karakter.
- Olumsuz geri bildirimde savunmaya geçme: özür dile, çözüm öner (değişim/iade süreci pazaryeri üzerinden), müşteriyi suçlama.
- Numara sorularında: tabanlıkların çift numara aralıklarında geldiğini (36-37'den 43-45'e kadar) söyle; kesin ölçü önerisi uydurma.
- Sadece cevap metnini yaz; açıklama, başlık ya da tırnak ekleme.`

export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })
  const { id, hint } = await req.json().catch(() => ({}))
  const { data: f } = await db.from('customer_feedback').select('*').eq('id', String(id ?? '')).maybeSingle()
  if (!f) return NextResponse.json({ message: 'Kayıt bulunamadı' }, { status: 404 })
  const where = f.source.startsWith('trendyol') ? 'Trendyol' : f.source.startsWith('amazon') ? 'Amazon' : f.source.startsWith('hepsiburada') ? 'Hepsiburada' : 'doğrudan'
  const prompt = [
    `Kanal: ${where} · Tür: ${f.kind === 'soru' ? 'ürün sorusu' : f.kind === 'geribildirim' ? 'satıcı geri bildirimi' : 'ürün yorumu'}`,
    f.product_name ? `Ürün: ${f.product_name}` : '',
    f.rating ? `Puan: ${f.rating}/5` : '',
    `Müşterinin yazdığı: """${f.text}"""`,
    hint ? `Ekibin notu (cevaba yansıt): ${String(hint).slice(0, 500)}` : '',
  ].filter(Boolean).join('\n')
  try {
    let draft = await claude(SYSTEM, prompt, 800)
    draft = draft.replace(/^["“]|["”]$/g, '').trim().slice(0, 2000)
    await db.from('customer_feedback').update({ draft }).eq('id', f.id)
    return NextResponse.json({ draft })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 502 })
  }
}
