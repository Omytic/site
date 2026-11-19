import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, authorize, istanbulDate } from '@/lib/integrations/server'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'
export const maxDuration = 60

/*
 * "Sor" kutusu: panel kullanıcısının sorusunu Claude'a iletir; Claude panel verisini
 * salt-okur SQL ile (kullanıcının kendi yetkisiyle, panel_query) okuyup Türkçe cevap verir.
 *  ANTHROPIC_API_KEY (zorunlu), ANTHROPIC_MODEL (varsayılan claude-sonnet-5-5)
 */

const API = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

// Soruların çoğu bu tablolarla cevaplanır; şema kısa tutulur
const TABLES = [
  'sale_lines', 'sales', 'sale_items', 'items', 'stock_levels', 'stock_movements', 'purchases', 'purchase_items',
  'parties', 'party_summary', 'party_notes', 'party_agreements', 'invoices', 'transactions', 'ledger', 'leads',
  'shipments', 'shipment_items', 'ad_insights', 'ad_spend', 'ad_budgets', 'amazon_inventory', 'amazon_traffic_daily',
  'amazon_traffic_asin', 'amazon_transactions', 'social_accounts', 'social_daily', 'social_posts', 'fairs', 'tasks',
  'channel_costs', 'collaborations', 'bank_transactions', 'fx_rates',
]

let schemaCache: { at: number; text: string } | null = null

async function schema(db: SupabaseClient) {
  if (schemaCache && Date.now() - schemaCache.at < 10 * 60_000) return schemaCache.text
  const { data, error } = await db.rpc('panel_query', {
    q: `select table_name t, string_agg(column_name || ' ' || case when data_type = 'USER-DEFINED' then udt_name when data_type like 'timestamp%' then 'timestamptz' when data_type = 'character varying' then 'text' else data_type end, ', ' order by ordinal_position) c
        from information_schema.columns where table_schema = 'public' and table_name in (${TABLES.map((t) => `'${t}'`).join(',')})
        group by table_name order by table_name`,
  })
  if (error) throw new Error(error.message)
  const text = (data as { t: string; c: string }[]).map((r) => `${r.t}(${r.c})`).join('\n')
  schemaCache = { at: Date.now(), text }
  return text
}

const system = (today: string, sch: string) => `Sen OMY Ticaret'in iç panelindeki asistansın. Ekip (Ömer, Yunus, Yusuf, Eymen) sana işle ilgili sorular soruyor; cevabı panel veritabanından bakarak veriyorsun.

Bugün: ${today} (İstanbul). Para birimi TL. Tarih sütunları İstanbul gününe göre.

İŞ BİLGİSİ
- Markalar (items.brand): formstep = hafızalı köpük tabanlık (Amazon ağırlıklı), seryn = sürtünme önleyici balm (kozmetik), kumas = döşemelik kumaş (toptan, metre ile), diger.
- Satış kanalları (sales.channel): amazon, trendyol, hepsiburada, seryn_site (seryn.com.tr), toptan, fuar, diger.
- sale_lines görünümü: her satış kalemi tek satır. revenue = adet × birim fiyat (müşterinin ödediği, KDV dahil). cogs = adet × birim maliyet. Sadece status = 'tamamlandi' olanlar satış sayılır ('iade', 'iptal' sayılmaz).
- Satış ödemesi: sales.payment_status 'odendi' | 'bekliyor', sales.due_date vade. Alacak = tamamlanmış ve bekleyen satışlar + transactions'ta direction='gelir' ve payment_status='bekliyor'.
- Cariler (müşteri/tedarikçi firmalar): parties; satış, alım, fatura, gelir/gider ve talepler party_id ile bağlı. party_summary görünümü: firma başına ciro, son satış, alacak, borç. Firma adı ararken ILIKE kullan; satışlarda firma adı sales.customer'da da yazılı olabilir.
- Stok: stock_levels (item_id, location_id: depo | yolda | amazon, qty). Ürün adı items.name + items.variant/color.
- Muhasebe: ledger görünümü bütün gelir ve giderleri (satış, alım, sevkiyat, reklam, elle girilen) tek yerde toplar.
- Reklam: ad_insights (platform meta | google | amazon_ads; günlük kampanya harcama/tıklama/dönüşüm), ad_spend (aylık harcama kayıtları).
- Amazon: amazon_traffic_daily (oturum, dönüşüm, buy box), amazon_inventory (FBA stoğu), amazon_transactions (Amazon'un kestiği ücretler).
- Sosyal medya: social_accounts, social_daily (takipçi, erişim), social_posts.
- Talepler (müşteri adayları): leads.

VERİTABANI (tablo(sütun tip, …))
${sch}

NASIL ÇALIŞIRSIN
- Cevaptan önce mutlaka run_sql ile veriye bak; sayıları asla tahmin etme. Gerekirse birkaç sorgu çalıştır.
- Sorgular PostgreSQL, sadece tek SELECT/WITH; en fazla 500 satır döner, gerektiğinde topla (sum, count, group by).
- Soru belirsizse en makul anlamı seç ve cevapta hangi dönemi/tanımı kullandığını kısaca söyle ("son 30 gün", "KDV dahil ciro" gibi).
- Veri yoksa ya da eksikse bunu açıkça söyle.

CEVAP
- Türkçe, kısa ve net; önce doğrudan cevap, sonra gerekiyorsa birkaç madde.
- Tutarlar "₺12.345" biçiminde, sayılar Türkçe binlik ayırıcıyla.
- Karşılaştırma ya da liste için küçük bir markdown tablo kullanabilirsin (en fazla 10 satır).
- SQL'i ya da tablo adlarını cevapta gösterme.`

const TOOLS = [
  {
    name: 'run_sql',
    description: 'Panel veritabanında salt-okur bir PostgreSQL SELECT sorgusu çalıştırır, sonucu JSON satırları olarak döndürür (en fazla 500 satır).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tek bir SELECT ya da WITH sorgusu, noktalı virgülsüz.' },
        purpose: { type: 'string', description: 'Bu sorguyla neye baktığın, kısa Türkçe (ör. "Gezer\'e son 3 aydaki satışlar").' },
      },
      required: ['query', 'purpose'],
    },
  },
]

type Msg = { role: 'user' | 'assistant'; content: any }

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ message: 'Sor kutusu için ANTHROPIC_API_KEY tanımlı değil (Vercel → Environment Variables).' }, { status: 503 })
  let admin
  try {
    admin = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, admin)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })

  // Sorgular kullanıcının kendi oturumuyla çalışır (RLS geçerli)
  const userDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('authorization')! } },
  })

  const body = await req.json().catch(() => ({}))
  const history: { role: 'user' | 'assistant'; text: string }[] = Array.isArray(body.history) ? body.history.slice(-8) : []
  const question = String(body.question ?? '').trim().slice(0, 2000)
  if (!question) return NextResponse.json({ message: 'Soru boş' }, { status: 400 })

  try {
    const sys = system(istanbulDate(Date.now()), await schema(userDb))
    const messages: Msg[] = [...history.filter((h) => h.text).map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: question }]
    const steps: { purpose: string; rows: number | null; error?: string }[] = []
    const deadline = Date.now() + 52_000

    for (let i = 0; i < 8; i++) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: sys, tools: TOOLS, messages }),
        cache: 'no-store',
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`Claude ${res.status}: ${b.error?.message ?? 'cevap alınamadı'}`)
      messages.push({ role: 'assistant', content: b.content })
      const calls = (b.content ?? []).filter((c: any) => c.type === 'tool_use')
      if (b.stop_reason !== 'tool_use' || !calls.length || Date.now() > deadline) {
        const answer = (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
        return NextResponse.json({ answer: answer || 'Bu soruya cevap bulamadım, biraz farklı sorar mısınız?', steps })
      }
      const results = []
      for (const c of calls) {
        const { data, error } = await userDb.rpc('panel_query', { q: String(c.input?.query ?? '') })
        const rows = Array.isArray(data) ? data : []
        steps.push({ purpose: String(c.input?.purpose ?? 'Veriye bakıldı'), rows: error ? null : rows.length, error: error?.message })
        results.push({
          type: 'tool_result',
          tool_use_id: c.id,
          is_error: !!error,
          content: error ? `Hata: ${error.message}` : JSON.stringify(rows).slice(0, 60_000),
        })
      }
      messages.push({ role: 'user', content: results })
    }
    return NextResponse.json({ answer: 'Soru çok adım gerektirdi, biraz daha daraltarak sorar mısınız?', steps })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 502 })
  }
}
