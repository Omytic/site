import type { SupabaseClient } from '@supabase/supabase-js'
import { rateFor } from './tcmb'

/** Reklam platformlarının ortak kayıt kuralları (Meta, Google Ads, Amazon Ads). */

export type AdPlatform = 'meta' | 'google' | 'amazon_ads'

/** Kampanya adından marka tahmini: adında SERYN / FormStep / kumaş geçiyorsa o marka, yoksa genel. */
export function brandOf(name: string | null | undefined) {
  const n = (name ?? '').toLocaleLowerCase('tr')
  if (/seryn|balm|stick|sürtünme|surtunme/.test(n)) return 'seryn'
  if (/formstep|form step|taban|insole|ortopedik/.test(n)) return 'formstep'
  if (/kumaş|kumas|fabric|döşeme|doseme|alcantara|welsoft|airfile/.test(n)) return 'kumas'
  return 'genel'
}

/** Döviz tutarını o günün TCMB kuruyla TL'ye çevirir (reklam harcaması: döviz satış). Kurlar çalıştırma boyunca önbellekte. */
export function fxConverter(db: SupabaseClient) {
  const cache = new Map<string, number | null>()
  return async (currency: string, day: string): Promise<number | null> => {
    const cur = (currency || 'TRY').toUpperCase()
    if (cur === 'TRY') return 1
    if (cur !== 'USD' && cur !== 'EUR') throw new Error(`Reklam hesabı ${cur} para biriminde; panel şimdilik TL, USD ve EUR çevirebiliyor.`)
    const k = `${cur}|${day}`
    if (!cache.has(k)) {
      try {
        const b = await rateFor(db, day)
        cache.set(k, b ? b.rates[cur].selling : null)
      } catch (e: any) {
        throw new Error(`TCMB kuru alınamadı (${e?.message ?? e}); dövizli reklam harcaması TL'ye çevrilemedi, bir sonraki çalıştırmada tekrar denenecek.`)
      }
    }
    return cache.get(k) ?? null
  }
}

export interface InsightRow {
  day: string
  campaign_id: string
  campaign_name: string | null
  account_id?: string | null
  currency: string
  spend: number // hesabın para biriminde
  impressions: number
  reach?: number | null
  clicks: number
  link_clicks?: number | null
  conversions: number
  conv_value: number // hesabın para biriminde
  extra?: Record<string, unknown> | null
}

/**
 * Kampanya × gün satırlarını yazar:
 *  - ad_insights (performans, TL'ye çevrilmiş)
 *  - ad_spend    (Reklam sayfası ve kâr hesapları; aynı gün/kampanya iki kez yazılmaz, sonradan düzelen harcama güncellenir)
 */
export async function saveInsights(db: SupabaseClient, platform: AdPlatform, rows: InsightRow[]) {
  const toTRY = fxConverter(db)
  const out: Record<string, unknown>[] = []
  for (const r of rows) {
    const rate = await toTRY(r.currency, r.day)
    if (rate == null) throw new Error(`${r.day} için TCMB kuru bulunamadı; biraz sonra tekrar denenecek.`)
    out.push({
      platform,
      day: r.day,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      account_id: r.account_id ?? null,
      brand: brandOf(r.campaign_name),
      currency: r.currency.toUpperCase(),
      fx_rate: rate === 1 ? null : rate,
      spend: Math.round(r.spend * rate * 100) / 100,
      spend_fx: rate === 1 ? null : Math.round(r.spend * 100) / 100,
      impressions: Math.round(r.impressions),
      reach: r.reach ?? null,
      clicks: Math.round(r.clicks),
      link_clicks: r.link_clicks ?? null,
      conversions: Math.round(r.conversions * 100) / 100,
      conv_value: Math.round(r.conv_value * rate * 100) / 100,
      extra: r.extra ?? null,
      synced_at: new Date().toISOString(),
    })
  }
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await db.from('ad_insights').upsert(out.slice(i, i + 500), { onConflict: 'platform,day,campaign_id' })
    if (error) throw new Error(error.message)
  }
  // Reklam harcaması: harcaması olan her gün/kampanya bir satır
  const spend = out
    .filter((x) => Number(x.spend) > 0)
    .map((x) => ({
      external_source: platform,
      external_ref: `${x.day}|${x.campaign_id}`,
      spend_date: x.day,
      platform,
      brand: x.brand,
      amount: x.spend,
      campaign: x.campaign_name,
      note: 'Otomatik (reklam hesabından)',
      created_by: null,
    }))
  for (let i = 0; i < spend.length; i += 500) {
    const { error } = await db.from('ad_spend').upsert(spend.slice(i, i + 500), { onConflict: 'external_source,external_ref' })
    if (error) throw new Error(error.message)
  }
  // Harcaması sonradan sıfıra düzelen gün/kampanya (iade, geçersiz tıklama) reklam gideri olarak kalmasın
  const zero = out.filter((x) => !(Number(x.spend) > 0)).map((x) => `${x.day}|${x.campaign_id}`)
  for (let i = 0; i < zero.length; i += 200) {
    await db.from('ad_spend').delete().eq('external_source', platform).in('external_ref', zero.slice(i, i + 200))
  }
  return out.length
}

/** Son başarılı senkrondan birkaç gün geri (platformlar dünkü rakamı birkaç gün düzeltebilir); ilk seferde 90 gün. */
export async function adsFrom(db: SupabaseClient, channel: string, days?: number) {
  const DAY = 86_400_000
  const now = Date.now()
  if (days) return now - days * DAY
  const { data: last } = await db.from('sync_runs').select('started_at').eq('channel', channel).eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
  return last ? new Date(last.started_at).getTime() - 7 * DAY : now - 90 * DAY
}
