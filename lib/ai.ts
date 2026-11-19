/*
 * Claude'a basit istek (tek tur, araçsız). ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
 */
const API = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY

export async function claude(system: string, user: string, maxTokens = 1200) {
  if (!aiConfigured()) throw new Error('ANTHROPIC_API_KEY tanımlı değil (Vercel → Environment Variables).')
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Claude ${res.status}: ${b.error?.message ?? 'cevap alınamadı'}`)
  return (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim() as string
}

/** Markalar hakkında yapay zekânın bilmesi gerekenler (cevap taslakları, ürün metinleri, içerik). */
export const BRAND_FACTS = `OMY Ticaret üç işi yürütür:
- FormStep: hafızalı köpük (memory foam) tabanlık, iki katmanlı. Modeller: M100 günlük kullanım; M300 içe/dışa basma (pronasyon/supinasyon) için destek; M900 topuk dikeni ve topuk desteği için en iyisi. Numaralar: 36-37, 37-38, 38-39, 39-40, 40-41, 41-42, 42-43, 43-45. Fiyat yaklaşık 200 TL. Amazon, Trendyol ve Hepsiburada'da satılır; Amazon Türkiye'de çok satan. Türkiye distribütörü OMY Ticaret.
- SERYN: sürtünmeyi önleyen balm (anti-chafe), stick formunda. Sürtünme başlamadan önce sürülen koruyucu; tedavi kremi (Bepanthol tipi) değildir. 18 g (standart) ve 10 g (seyahat boy); 18 g'nin lansman versiyonu da var. Kullananlar: koşucu, bisikletçi, motokurye gibi sporcular; kilolu bireyler; hac ve umre yolcuları (ihramda sürtünme); günlük konfor. seryn.com.tr, Amazon, Trendyol ve Hepsiburada'da satılır. Instagram: @seryncare.
- Kumaş: toptan döşemelik kumaş ticareti (Alcantara, Welsoft, Airfile gibi), metre ile satış. omytic.com.`
