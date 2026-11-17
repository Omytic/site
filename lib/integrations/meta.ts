import type { SupabaseClient } from '@supabase/supabase-js'
import { adsFrom, brandOf, saveInsights, type InsightRow } from './ads'
import { istanbulDate, sleep } from './server'
import type { SyncResult } from './importer'

/*
 * Meta (Graph API v25.0)
 *  - Reklam: GET /act_{id}/insights  (kampanya × gün)          izin: ads_read
 *  - Instagram: hesap (takipçi), günlük hesap istatistiği, gönderiler ve gönderi etkileşimi
 *               izin: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement
 *  - Facebook sayfası: takipçi sayısı
 * Anahtar: Meta Business Suite → Ayarlar → Sistem kullanıcıları → "Token oluştur" (süresiz).
 *   META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (act_ ile ya da sadece rakam; birden çoksa virgülle)
 */

const GRAPH = process.env.META_GRAPH_URL || 'https://graph.facebook.com/v25.0'
const DAY = 86_400_000

export const metaConfigured = () => !!process.env.META_ACCESS_TOKEN
export const metaAdsConfigured = () => !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)

class MetaError extends Error {
  code?: number
  constructor(msg: string, code?: number) {
    super(msg)
    this.code = code
  }
}

async function g(pathOrUrl: string, params: Record<string, string> = {}) {
  const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(`${GRAPH}/${pathOrUrl.replace(/^\//, '')}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN!)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return body
    const e = body?.error ?? {}
    // 4 / 17 / 32 / 613: istek sınırı → biraz bekleyip tekrar
    if ([4, 17, 32, 613, 80000, 80004].includes(e.code) && attempt < 3) {
      await sleep(4000 * (attempt + 1))
      continue
    }
    if (e.code === 190) throw new MetaError('Meta anahtarı geçersiz ya da süresi dolmuş (190). Business Suite’te sistem kullanıcısı için yeni token oluşturup META_ACCESS_TOKEN’a yazın.', 190)
    if (e.code === 10 || e.code === 200 || (e.code === 100 && /permission/i.test(e.message ?? ''))) throw new MetaError(`Meta izin vermedi: ${e.message} (Token’a ads_read, instagram_basic, instagram_manage_insights, pages_read_engagement izinleri verilmeli.)`, e.code)
    throw new MetaError(`Meta ${res.status}: ${e.message ?? 'bilinmeyen hata'}`, e.code)
  }
}

/** Bir sonraki sayfa da dahil hepsini getir */
async function pages<T>(path: string, params: Record<string, string>, max = 50): Promise<T[]> {
  const out: T[] = []
  let body = await g(path, params)
  for (let i = 0; i < max; i++) {
    out.push(...((body.data ?? []) as T[]))
    if (!body.paging?.next) break
    body = await g(body.paging.next)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Reklam                                                              */
/* ------------------------------------------------------------------ */

const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase', 'onsite_conversion.purchase']
const pick = (list: { action_type: string; value: string }[] | undefined) => {
  for (const t of PURCHASE) {
    const hit = list?.find((a) => a.action_type === t)
    if (hit) return Number(hit.value) || 0
  }
  return 0
}

export async function syncMetaAds(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!metaAdsConfigured()) throw new Error('Meta reklam anahtarları tanımlı değil (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID).')
  const from = await adsFrom(db, 'meta_reklam', opts.days)
  const since = istanbulDate(from)
  const until = istanbulDate(Date.now())
  const accounts = String(process.env.META_AD_ACCOUNT_ID)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith('act_') ? x : `act_${x}`))
  const rows: InsightRow[] = []
  for (const acc of accounts) {
    const list = await pages<any>(`${acc}/insights`, {
      level: 'campaign',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_id,campaign_name,account_currency,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,date_start',
      limit: '500',
    })
    for (const x of list) {
      rows.push({
        day: x.date_start,
        campaign_id: String(x.campaign_id),
        campaign_name: x.campaign_name ?? null,
        account_id: acc,
        currency: x.account_currency ?? 'TRY',
        spend: Number(x.spend ?? 0),
        impressions: Number(x.impressions ?? 0),
        reach: x.reach != null ? Number(x.reach) : null,
        clicks: Number(x.clicks ?? 0),
        link_clicks: x.inline_link_clicks != null ? Number(x.inline_link_clicks) : null,
        conversions: pick(x.actions),
        conv_value: pick(x.action_values),
      })
    }
  }
  const n = await saveInsights(db, 'meta', rows)
  return { fetched: rows.length, imported: n, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date().toISOString() }
}

/* ------------------------------------------------------------------ */
/* Instagram ve Facebook sayfası                                       */
/* ------------------------------------------------------------------ */

interface IgAccount { id: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number; follows_count?: number; media_count?: number }

async function discover(): Promise<{ ig: IgAccount[]; pages: { id: string; name: string; followers_count?: number; fan_count?: number; picture?: string }[] }> {
  const fields = 'id,name,followers_count,fan_count,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count}'
  const list = await pages<any>('me/accounts', { fields, limit: '100' }, 5)
  const ig: IgAccount[] = list.map((p) => p.instagram_business_account).filter(Boolean)
  // Sayfaya bağlı olmayan ya da elle verilen Instagram hesapları
  const extra = String(process.env.META_IG_USER_IDS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && !ig.some((a) => a.id === x))
  for (const id of extra) ig.push(await g(id, { fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count' }))
  return { ig, pages: list.map((p) => ({ id: p.id, name: p.name, followers_count: p.followers_count, fan_count: p.fan_count, picture: p.picture?.data?.url })) }
}

/** Metrikleri birlikte ister; biri desteklenmiyorsa tek tek dener (Meta zaman zaman metrik kaldırıyor). */
async function insightsTotal(id: string, metrics: string[], params: Record<string, string>) {
  const out: Record<string, number> = {}
  const read = (body: any) => {
    for (const m of body.data ?? []) {
      const v = m.total_value?.value ?? m.values?.[m.values.length - 1]?.value
      if (typeof v === 'number') out[m.name] = v
      // follows_and_unfollows: follow_type kırılımı
      for (const b of m.total_value?.breakdowns ?? []) for (const r of b.results ?? []) out[`${m.name}:${(r.dimension_values ?? []).join('|')}`] = Number(r.value) || 0
    }
  }
  try {
    read(await g(`${id}/insights`, { metric: metrics.join(','), ...params }))
  } catch (e) {
    if (e instanceof MetaError && (e.code === 190 || e.code === 10 || e.code === 200)) throw e
    for (const m of metrics) {
      try {
        read(await g(`${id}/insights`, { metric: m, ...params }))
      } catch {
        /* bu metrik bu hesap/gönderi için yok */
      }
    }
  }
  return out
}

export async function syncInstagram(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!metaConfigured()) throw new Error('Meta anahtarı tanımlı değil (META_ACCESS_TOKEN).')
  const now = Date.now()
  const deadline = now + 50_000
  const today = istanbulDate(now)
  const { ig, pages: fbPages } = await discover()
  if (!ig.length && !fbPages.length) throw new Error('Token hiçbir Facebook sayfası ya da Instagram hesabı görmüyor. Business Suite’te sistem kullanıcısına sayfaları ve Instagram hesaplarını “varlık” olarak atayın.')

  // Panelde markası daha önce seçilmiş hesaplar korunur
  const { data: known } = await db.from('social_accounts').select('id,brand')
  const brandOfAcc = new Map((known ?? []).map((k) => [k.id, k.brand]))
  const accRows = [
    ...ig.map((a) => ({ id: a.id, platform: 'instagram', username: a.username ?? null, name: a.name ?? null, picture: a.profile_picture_url ?? null, brand: brandOfAcc.get(a.id) ?? brandOf(`${a.username} ${a.name}`), followers: a.followers_count ?? null, following: a.follows_count ?? null, posts: a.media_count ?? null, updated_at: new Date().toISOString() })),
    ...fbPages.map((p) => ({ id: p.id, platform: 'facebook', username: null, name: p.name, picture: p.picture ?? null, brand: brandOfAcc.get(p.id) ?? brandOf(p.name), followers: p.followers_count ?? p.fan_count ?? null, following: null, posts: null, updated_at: new Date().toISOString() })),
  ]
  const { error: e1 } = await db.from('social_accounts').upsert(accRows, { onConflict: 'id' })
  if (e1) throw new Error(e1.message)
  // Bugünün takipçi sayısı (her gün bir satır; grafik buradan çizilir)
  const { error: e2 } = await db.from('social_daily').upsert(
    accRows.map((a) => ({ account_id: a.id, day: today, followers: a.followers, following: a.following, posts: a.posts })),
    { onConflict: 'account_id,day' },
  )
  if (e2) throw new Error(e2.message)

  let fetched = accRows.length
  let posts = 0
  for (const a of ig) {
    if (Date.now() > deadline) break
    // Dünün ve önceki günlerin hesap istatistiği (Meta günlük toplamı ertesi gün kesinleşir)
    const back = Math.min(28, opts.days ?? 3)
    for (let d = back; d >= 1; d--) {
      if (Date.now() > deadline) break
      const dayStart = Math.floor(new Date(`${istanbulDate(now - d * DAY)}T00:00:00+03:00`).getTime() / 1000)
      const p = { period: 'day', metric_type: 'total_value', since: String(dayStart), until: String(dayStart + 86_400) }
      const m = await insightsTotal(a.id, ['reach', 'views', 'accounts_engaged', 'total_interactions', 'profile_links_taps'], p)
      const fu = await insightsTotal(a.id, ['follows_and_unfollows'], { ...p, breakdown: 'follow_type' })
      const day = istanbulDate(now - d * DAY)
      const { error } = await db.from('social_daily').upsert(
        {
          account_id: a.id,
          day,
          reach: m.reach ?? null,
          views: m.views ?? null,
          accounts_engaged: m.accounts_engaged ?? null,
          interactions: m.total_interactions ?? null,
          profile_taps: m.profile_links_taps ?? null,
          follows: fu['follows_and_unfollows:FOLLOWER'] ?? null,
          unfollows: fu['follows_and_unfollows:NON_FOLLOWER'] ?? null,
        },
        { onConflict: 'account_id,day', ignoreDuplicates: false },
      )
      if (error) throw new Error(error.message)
    }

    // Gönderiler: ilk seferde son 200, sonra son 50; son 60 günün gönderilerinin etkileşimi güncellenir
    const { count } = await db.from('social_posts').select('id', { count: 'exact', head: true }).eq('account_id', a.id)
    const media = await pages<any>(`${a.id}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url', limit: '50' }, count ? 1 : 4)
    fetched += media.length
    const rows: Record<string, unknown>[] = []
    for (const x of media) {
      const young = now - new Date(x.timestamp).getTime() < 60 * DAY
      let ins: Record<string, number> = {}
      if (young && Date.now() < deadline) ins = await insightsTotal(x.id, ['reach', 'views', 'saved', 'shares', 'total_interactions'], {})
      rows.push({
        id: x.id,
        account_id: a.id,
        posted_at: x.timestamp,
        kind: x.media_product_type === 'REELS' ? 'REELS' : x.media_type,
        caption: x.caption ? String(x.caption).slice(0, 1000) : null,
        permalink: x.permalink ?? null,
        thumb: x.thumbnail_url ?? (x.media_type === 'VIDEO' ? null : x.media_url) ?? null,
        likes: Number(x.like_count ?? 0),
        comments: Number(x.comments_count ?? 0),
        ...(young
          ? { saves: ins.saved ?? null, shares: ins.shares ?? null, reach: ins.reach ?? null, views: ins.views ?? null, interactions: ins.total_interactions ?? null }
          : {}),
        updated_at: new Date().toISOString(),
      })
    }
    if (rows.length) {
      const { error } = await db.from('social_posts').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error(error.message)
      posts += rows.length
    }
  }
  return { fetched, imported: posts, updated: accRows.length, linked: 0, skipped: 0, unmatched: [], from: new Date(now - DAY).toISOString(), to: new Date().toISOString(), more: Date.now() > deadline }
}
