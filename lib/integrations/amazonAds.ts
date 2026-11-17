import { gunzipSync } from 'zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveInsights, type InsightRow } from './ads'
import { istanbulDate, sleep } from './server'
import type { SyncResult } from './importer'

/*
 * Amazon Ads API — Sponsored Products / Brands / Display kampanya × gün raporu (Reporting v3, eşzamansız).
 *  - Satıcı (SP-API) anahtarından AYRI bir uygulama: Amazon Ads API'ye kabul edilmiş LWA uygulaması gerekir.
 *    AMAZON_ADS_CLIENT_ID / AMAZON_ADS_CLIENT_SECRET / AMAZON_ADS_REFRESH_TOKEN
 *  - Profil: AMAZON_ADS_PROFILE_ID (boşsa Türkiye profili otomatik seçilir)
 *  - Rapor istenir, birkaç dakika içinde hazırlanır; bu çalıştırmada hazır olmazsa bir sonrakinde indirilir.
 */

const ADS = process.env.AMAZON_ADS_ENDPOINT || 'https://advertising-api-eu.amazon.com'
const LWA = process.env.AMAZON_ADS_LWA_URL || 'https://api.amazon.com/auth/o2/token'
const DAY = 86_400_000

export const amazonAdsConfigured = () => !!(process.env.AMAZON_ADS_CLIENT_ID && process.env.AMAZON_ADS_CLIENT_SECRET && process.env.AMAZON_ADS_REFRESH_TOKEN)

const PRODUCTS = [
  { key: 'ADS_SP', adProduct: 'SPONSORED_PRODUCTS', reportTypeId: 'spCampaigns', purchases: 'purchases7d', sales: 'sales7d', tag: 'SP' },
  { key: 'ADS_SB', adProduct: 'SPONSORED_BRANDS', reportTypeId: 'sbCampaigns', purchases: 'purchases', sales: 'sales', tag: 'SB' },
  { key: 'ADS_SD', adProduct: 'SPONSORED_DISPLAY', reportTypeId: 'sdCampaigns', purchases: 'purchases', sales: 'sales', tag: 'SD' },
] as const

async function token() {
  const res = await fetch(LWA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.AMAZON_ADS_REFRESH_TOKEN!, client_id: process.env.AMAZON_ADS_CLIENT_ID!, client_secret: process.env.AMAZON_ADS_CLIENT_SECRET! }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok || !b.access_token) throw new Error(`Amazon Ads girişi başarısız: ${b.error_description || b.error || res.status}`)
  return b.access_token as string
}

export async function syncAmazonAds(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!amazonAdsConfigured()) throw new Error('Amazon Ads anahtarları tanımlı değil (AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET, AMAZON_ADS_REFRESH_TOKEN).')
  const now = Date.now()
  const deadline = now + 50_000
  const t = await token()
  const base: Record<string, string> = { Authorization: `Bearer ${t}`, 'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!, Accept: 'application/json' }

  // Profil (reklam hesabı) ve para birimi
  let profileId = process.env.AMAZON_ADS_PROFILE_ID
  let currency = 'TRY'
  {
    const res = await fetch(`${ADS}/v2/profiles`, { headers: base, cache: 'no-store' })
    if (res.status === 401 || res.status === 403) throw new Error('Amazon Ads erişimi reddetti: uygulama Amazon Ads API için onaylı olmalı ve refresh token reklam hesabının sahibiyle oluşturulmalı.')
    const list: any[] = (await res.json().catch(() => [])) ?? []
    const p = profileId ? list.find((x) => String(x.profileId) === String(profileId)) : list.find((x) => x.countryCode === 'TR' && x.accountInfo?.type === 'seller') ?? list.find((x) => x.countryCode === 'TR') ?? list[0]
    if (!p) throw new Error('Amazon Ads hesabında reklam profili bulunamadı.')
    profileId = String(p.profileId)
    currency = p.currencyCode ?? 'TRY'
  }
  const h = { ...base, 'Amazon-Advertising-API-Scope': profileId! }

  const result: SyncResult = { fetched: 0, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(now - (opts.days ?? 30) * DAY).toISOString(), to: new Date(now).toISOString() }

  const download = async (row: { report_id: string; report_type: string }, url: string) => {
    const prod = PRODUCTS.find((p) => p.key === row.report_type)!
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Amazon Ads rapor dosyası indirilemedi (${res.status})`)
    const data: any[] = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'))
    const rows: InsightRow[] = data.map((r) => ({
      day: String(r.date).slice(0, 10),
      campaign_id: `${prod.tag}:${r.campaignId}`,
      campaign_name: r.campaignName ? `${r.campaignName}` : null,
      account_id: profileId,
      currency: r.campaignBudgetCurrencyCode ?? currency,
      spend: Number(r.cost ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      conversions: Number(r[prod.purchases] ?? 0),
      conv_value: Number(r[prod.sales] ?? 0),
      extra: { adProduct: prod.adProduct },
    }))
    result.fetched += rows.length
    result.imported += await saveInsights(db, 'amazon_ads', rows)
    await db.from('amazon_reports').update({ status: 'DONE', done_at: new Date().toISOString() }).eq('report_id', row.report_id)
  }

  const check = async (row: { report_id: string; report_type: string }) => {
    const res = await fetch(`${ADS}/reporting/reports/${encodeURIComponent(row.report_id)}`, { headers: h, cache: 'no-store' })
    if (res.status === 404) {
      await db.from('amazon_reports').update({ status: 'FATAL', error: 'bulunamadı', done_at: new Date().toISOString() }).eq('report_id', row.report_id)
      return 'gone'
    }
    const b = await res.json().catch(() => ({}))
    if (b.status === 'COMPLETED' && b.url) {
      await download(row, b.url)
      return 'done'
    }
    if (b.status === 'FAILED') {
      await db.from('amazon_reports').update({ status: 'FATAL', error: String(b.failureReason ?? '').slice(0, 300), done_at: new Date().toISOString() }).eq('report_id', row.report_id)
      return 'gone'
    }
    return 'wait'
  }

  // 1) Bekleyen raporlar
  const { data: pending } = await db.from('amazon_reports').select('report_id,report_type,requested_at').like('report_type', 'ADS_%').in('status', ['IN_QUEUE', 'IN_PROGRESS', 'PENDING', 'PROCESSING'])
  for (const p of pending ?? []) {
    if (Date.now() > deadline) break
    await check(p)
  }

  // 2) Yeni rapor: son senkrondan (ya da ilk seferde 60 gün) bugüne; Amazon günlük raporda en fazla 31 gün verir
  const { data: last } = await db.from('sync_runs').select('started_at').eq('channel', 'amazon_ads').eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
  const start = opts.days ? now - opts.days * DAY : last ? new Date(last.started_at).getTime() - 3 * DAY : now - 60 * DAY
  const created: { report_id: string; report_type: string }[] = []
  const stillPending = new Set((pending ?? []).map((p) => p.report_type))
  for (const prod of PRODUCTS) {
    if (stillPending.has(prod.key)) continue // aynı türden bekleyen varsa yenisini isteme
    for (let a = start; a < now; a += 31 * DAY) {
      const b = Math.min(now, a + 30 * DAY)
      const body = {
        name: `OMY ${prod.tag} ${istanbulDate(a)}`,
        startDate: istanbulDate(a),
        endDate: istanbulDate(b),
        configuration: {
          adProduct: prod.adProduct,
          groupBy: ['campaign'],
          columns: ['date', 'campaignId', 'campaignName', 'campaignBudgetCurrencyCode', 'cost', 'impressions', 'clicks', prod.purchases, prod.sales],
          reportTypeId: prod.reportTypeId,
          timeUnit: 'DAILY',
          format: 'GZIP_JSON',
        },
      }
      const res = await fetch(`${ADS}/reporting/reports`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' }, body: JSON.stringify(body), cache: 'no-store' })
      const b2 = await res.json().catch(() => ({}))
      // 425: aynı rapor zaten istenmiş; numarası açıklamada gelir
      const id = b2.reportId ?? String(b2.detail ?? '').match(/[0-9a-f-]{36}/i)?.[0]
      if (!res.ok && !id) {
        // Bu reklam türü hesapta yoksa (ör. Sponsored Brands kullanılmıyor) sessizce geçilir
        if (res.status === 400 || res.status === 403) {
          result.skipped++
          break
        }
        throw new Error(`Amazon Ads ${res.status}: ${b2.message ?? b2.detail ?? 'rapor istenemedi'}`)
      }
      await db.from('amazon_reports').upsert({ report_id: id, report_type: prod.key, data_start: istanbulDate(a), data_end: istanbulDate(b), status: 'IN_PROGRESS' }, { onConflict: 'report_id' })
      created.push({ report_id: id, report_type: prod.key })
    }
  }

  // 3) Yeni raporlar genelde 1-3 dakikada hazır olur; süre yettiğince bekle
  let waiting = created
  while (waiting.length && Date.now() + 12_000 < deadline) {
    await sleep(8_000)
    const next: typeof waiting = []
    for (const c of waiting) if ((await check(c)) === 'wait') next.push(c)
    waiting = next
  }
  result.more = waiting.length > 0
  return result
}
