import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate } from './server'
import type { SyncResult } from './importer'

/*
 * Ziraat Katılım API portalı — Hesap Hareketleri (GetAccountActivities).
 *  POST {ZIRAAT_API_URL}/GetAccountActivities  { startDate, endDate, customerNo, accountBranchId, accountSuffix }
 *  Yanıt: activityList[] { amount, branchCode, channel, currencyCode, date, debtOrCredit, explanation, remainingBalance, transactionCode }
 * Yetki: OAuth (banka canlı ortam için müşteriye özel uygulama bilgisi verir). Bankanın verdiği bilgiler:
 *  ZIRAAT_API_URL, ZIRAAT_TOKEN_URL, ZIRAAT_CLIENT_ID, ZIRAAT_CLIENT_SECRET, ZIRAAT_REFRESH_TOKEN (ya da client_credentials ise boş)
 *  ZIRAAT_CUSTOMER_NO, ZIRAAT_BRANCH_ID, ZIRAAT_ACCOUNT_SUFFIX
 * Bu bilgiler gelene kadar Banka sayfasından internet şubesi ekstresi yapıştırılarak aynı tabloya aktarılır.
 */

export const ziraatConfigured = () =>
  !!(process.env.ZIRAAT_API_URL && process.env.ZIRAAT_TOKEN_URL && process.env.ZIRAAT_CLIENT_ID && process.env.ZIRAAT_CLIENT_SECRET && process.env.ZIRAAT_CUSTOMER_NO && process.env.ZIRAAT_BRANCH_ID && process.env.ZIRAAT_ACCOUNT_SUFFIX)

const ACCOUNT = 'ziraat-katilim-tl'
const DAY = 86_400_000

/** Aynı hareketi tanımak için: hesap + zaman + tutar + açıklama + bakiye */
export function txHash(at: string, amount: number, description: string, balance: number | null) {
  return createHash('sha1').update(`${at}|${amount.toFixed(2)}|${description.trim().toLocaleLowerCase('tr')}|${balance == null ? '' : balance.toFixed(2)}`).digest('hex')
}

async function token() {
  const refresh = process.env.ZIRAAT_REFRESH_TOKEN
  const res = await fetch(process.env.ZIRAAT_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: refresh ? 'refresh_token' : 'client_credentials',
      ...(refresh ? { refresh_token: refresh } : {}),
      client_id: process.env.ZIRAAT_CLIENT_ID!,
      client_secret: process.env.ZIRAAT_CLIENT_SECRET!,
      ...(process.env.ZIRAAT_SCOPE ? { scope: process.env.ZIRAAT_SCOPE } : {}),
    }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok || !b.access_token) throw new Error(`Ziraat Katılım girişi başarısız: ${b.error_description || b.error || res.status}`)
  return b.access_token as string
}

export async function syncZiraat(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!ziraatConfigured()) throw new Error('Ziraat Katılım API bilgileri tanımlı değil. Banka API erişimi verene kadar Banka sayfasından ekstre yapıştırabilirsiniz.')
  const now = Date.now()
  const { data: last } = await db.from('sync_runs').select('started_at').eq('channel', 'ziraat').eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
  const from = opts.days ? now - opts.days * DAY : last ? new Date(last.started_at).getTime() - 2 * DAY : now - 90 * DAY
  const t = await token()
  const res = await fetch(`${process.env.ZIRAAT_API_URL!.replace(/\/$/, '')}/GetAccountActivities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      startDate: istanbulDate(from),
      endDate: istanbulDate(now),
      customerNo: Number(process.env.ZIRAAT_CUSTOMER_NO),
      accountBranchId: Number(process.env.ZIRAAT_BRANCH_ID),
      accountSuffix: Number(process.env.ZIRAAT_ACCOUNT_SUFFIX),
    }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Ziraat Katılım ${res.status}: ${b.message ?? b.error ?? 'hesap hareketleri alınamadı'}`)
  const list: any[] = b.activityList ?? b.data?.activityList ?? b.result?.activityList ?? []
  const rows = list.map((a) => {
    const raw = Math.abs(Number(a.amount ?? 0))
    // debtOrCredit: B (borç, çıkan) / A (alacak, giren); bazı yanıtlarda D/C
    const out = /^(b|d|debt|borç|borc)/i.test(String(a.debtOrCredit ?? ''))
    const amount = out ? -raw : raw
    const at = new Date(a.date).toISOString()
    const description = String(a.explanation ?? '').trim()
    const balance = a.remainingBalance != null ? Number(a.remainingBalance) : null
    return { account_id: ACCOUNT, tx_at: at, amount, balance, description, channel: a.channel ?? null, code: a.transactionCode ?? null, hash: txHash(at, amount, description, balance), source: 'api', created_by: null }
  })
  if (rows.length) {
    const { error } = await db.from('bank_transactions').upsert(rows, { onConflict: 'account_id,hash', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    const latest = rows.reduce((a, r) => (r.tx_at > a.tx_at ? r : a))
    if (latest.balance != null) await db.from('bank_accounts').update({ balance: latest.balance, balance_at: latest.tx_at }).eq('id', ACCOUNT)
  }
  return { fetched: list.length, imported: rows.length, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(now).toISOString() }
}
