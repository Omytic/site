import type { SupabaseClient } from '@supabase/supabase-js'
import { adsFrom, saveInsights, type InsightRow } from './ads'
import { istanbulDate } from './server'
import type { SyncResult } from './importer'

/*
 * Google Ads API (REST, v25) — kampanya × gün performansı.
 *  - Eylül 2026'dan beri geliştirici anahtarı (developer token) gerekmiyor; erişim Google Cloud projesine bağlı.
 *    Eski hesaplar için GOOGLE_ADS_DEVELOPER_TOKEN tanımlıysa yine gönderilir.
 *  - OAuth: GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN
 *  - Hesap: GOOGLE_ADS_CUSTOMER_ID (tiresiz, birden çoksa virgülle); yönetici (MCC) hesabı üzerinden ise GOOGLE_ADS_LOGIN_CUSTOMER_ID
 */

const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25'
const API = process.env.GOOGLE_ADS_API_URL || 'https://googleads.googleapis.com'
const TOKEN_URL = process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token'

export const googleAdsConfigured = () =>
  !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REFRESH_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID)

const digits = (s: string) => s.replace(/\D/g, '')

async function accessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok || !b.access_token) {
    if (b.error === 'invalid_grant') throw new Error('Google refresh token geçersiz ya da iptal edilmiş; OAuth adımını tekrarlayıp yeni GOOGLE_ADS_REFRESH_TOKEN yazın.')
    throw new Error(`Google girişi başarısız: ${b.error_description || b.error || res.status}`)
  }
  return b.access_token as string
}

export async function syncGoogleAds(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!googleAdsConfigured()) throw new Error('Google Ads anahtarları tanımlı değil (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID).')
  const from = await adsFrom(db, 'google_ads', opts.days)
  const since = istanbulDate(from)
  const until = istanbulDate(Date.now())
  const token = await accessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)

  const query = `SELECT customer.currency_code, campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.impressions > 0`
  const rows: InsightRow[] = []
  for (const cid of String(process.env.GOOGLE_ADS_CUSTOMER_ID).split(',').map(digits).filter(Boolean)) {
    const res = await fetch(`${API}/${VERSION}/customers/${cid}/googleAds:searchStream`, { method: 'POST', headers, body: JSON.stringify({ query }), cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = (Array.isArray(body) ? body[0] : body)?.error
      const detail = JSON.stringify(err?.details ?? '')
      if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|DEVELOPER_TOKEN_NOT_APPROVED|ACTION_NOT_PERMITTED/.test(detail))
        throw new Error('Google Cloud projesinin Google Ads API erişimi henüz canlı hesaplar için onaylı değil. Cloud Console → Google Ads API → erişim başvurusu (Explorer/Basic) yapılmalı.')
      if (/USER_PERMISSION_DENIED/.test(detail)) throw new Error(`Google hesabının ${cid} reklam hesabına erişimi yok (yönetici hesabı üzerinden bağlıysa GOOGLE_ADS_LOGIN_CUSTOMER_ID yazın).`)
      throw new Error(`Google Ads ${res.status}: ${err?.message ?? 'bilinmeyen hata'}`)
    }
    for (const batch of (Array.isArray(body) ? body : [body]) as any[]) {
      for (const r of batch?.results ?? []) {
        rows.push({
          day: r.segments?.date,
          campaign_id: String(r.campaign?.id),
          campaign_name: r.campaign?.name ?? null,
          account_id: cid,
          currency: r.customer?.currencyCode ?? 'TRY',
          spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
          impressions: Number(r.metrics?.impressions ?? 0),
          clicks: Number(r.metrics?.clicks ?? 0),
          conversions: Number(r.metrics?.conversions ?? 0),
          conv_value: Number(r.metrics?.conversionsValue ?? 0),
        })
      }
    }
  }
  const n = await saveInsights(db, 'google', rows)
  return { fetched: rows.length, imported: n, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date().toISOString() }
}
