import { gunzipSync } from 'zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { headers as tyHeaders, TRENDYOL_BASE, trendyolConfigured } from './trendyol'
import { amazonConfigured, TR_MARKETPLACE } from './amazon'
import { sp } from './amazonPlus'
import { sleep } from './server'
import type { SyncResult } from './importer'

/*
 * Müşteri sesi:
 *  - Trendyol müşteri soruları  → GET {base}/integration/qna/sellers/{id}/questions/filter (en fazla 2 haftalık aralık, sayfa 50)
 *    Cevap: POST …/questions/{id}/answers  { text } (10–2000 karakter, yalnızca WAITING_FOR_ANSWER)
 *  - Amazon satıcı geri bildirimi → Reports API, GET_SELLER_FEEDBACK_DATA (1–5 puan, yorum, sipariş no)
 * Trendyol ve Amazon ürün yorumları için resmi API yok (Amazon'un yorum API'si Türkiye'de açık değil).
 */

const DAY = 86_400_000
const FEEDBACK_REPORT = 'GET_SELLER_FEEDBACK_DATA'

export const brandOfText = (s: string | null | undefined) =>
  /form\s*step|tabanl[ıi]k|\bm(100|300|900)\b/i.test(s ?? '') ? 'formstep' : /seryn|balm|s[üu]rt[üu]nme|stick/i.test(s ?? '') ? 'seryn' : /kuma[şs]|alcantara|welsoft|airfile/i.test(s ?? '') ? 'kumas' : null

const empty = (from: number, to: number): SyncResult => ({ fetched: 0, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(to).toISOString() })

/* ------------------------------------------------------------------ */
/* Trendyol müşteri soruları                                           */
/* ------------------------------------------------------------------ */

const TY_STATUS: Record<string, 'bekliyor' | 'cevaplandi' | 'kapandi'> = {
  WAITING_FOR_ANSWER: 'bekliyor',
  WAITING_FOR_APPROVE: 'cevaplandi',
  ANSWERED: 'cevaplandi',
  REPORTED: 'kapandi',
  REJECTED: 'kapandi',
  UNANSWERED: 'kapandi',
}

export async function syncTrendyolQuestions(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!trendyolConfigured()) throw new Error('Trendyol anahtarları tanımlı değil.')
  const now = Date.now()
  const deadline = now + 45_000
  const { data: last } = await db.from('sync_runs').select('started_at').eq('channel', 'trendyol_soru').eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
  // İlk seferde 4 hafta; sonra son çalıştırmadan 2 gün öncesine kadar (cevap durumu değişenler de güncellensin)
  const from = opts.days ? now - opts.days * DAY : last ? new Date(last.started_at).getTime() - 2 * DAY : now - 28 * DAY
  const r = empty(from, now)
  const seller = process.env.TRENDYOL_SELLER_ID!

  for (let a = from; a < now; a += 14 * DAY) {
    const b = Math.min(now, a + 14 * DAY - 1)
    for (let page = 0; page < 40; page++) {
      if (Date.now() > deadline) {
        r.more = true
        return r
      }
      const q = new URLSearchParams({ supplierId: seller, startDate: String(a), endDate: String(b), page: String(page), size: '50', orderByField: 'CreatedDate', orderByDirection: 'DESC' })
      const res = await fetch(`${TRENDYOL_BASE}/integration/qna/sellers/${seller}/questions/filter?${q}`, { headers: tyHeaders(), cache: 'no-store' })
      if (res.status === 429) {
        await sleep(3_000)
        page--
        continue
      }
      if (res.status === 401) throw new Error('Trendyol API anahtarı hatalı (401).')
      if (!res.ok) throw new Error(`Trendyol soruları ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const body = await res.json()
      const list: any[] = body.content ?? []
      r.fetched += list.length
      if (list.length) {
        const rows = list.map((x) => ({
          id: `trendyol_soru:${x.id}`,
          source: 'trendyol_soru',
          kind: 'soru',
          brand: brandOfText(x.productName),
          posted_at: new Date(Number(x.creationDate)).toISOString(),
          product_name: x.productName ?? null,
          product_url: x.webUrl || null,
          image_url: x.imageUrl || null,
          customer: x.showUserName === false ? null : x.userName ?? null,
          text: String(x.text ?? '').trim() || '(boş soru)',
          answer: x.answer?.text ?? null,
          answered_at: x.answer?.creationDate ? new Date(Number(x.answer.creationDate)).toISOString() : null,
          status: TY_STATUS[x.status] ?? 'bekliyor',
          external_status: x.status ?? null,
          raw: { rejectedAnswer: x.rejectedAnswer ?? null, reason: x.reason ?? null, productMainId: x.productMainId ?? null },
          synced_at: new Date().toISOString(),
        }))
        const { error } = await db.from('customer_feedback').upsert(rows, { onConflict: 'id' })
        if (error) throw new Error(error.message)
        r.imported += rows.length
      }
      if (page + 1 >= Number(body.totalPages ?? 1) || list.length < 50) break
      await sleep(250)
    }
  }
  return r
}

export async function answerTrendyolQuestion(questionId: string, text: string) {
  const t = text.trim()
  if (t.length < 10) throw new Error('Cevap en az 10 karakter olmalı.')
  if (t.length > 2000) throw new Error('Cevap en fazla 2000 karakter olabilir.')
  const seller = process.env.TRENDYOL_SELLER_ID!
  const res = await fetch(`${TRENDYOL_BASE}/integration/qna/sellers/${seller}/questions/${encodeURIComponent(questionId)}/answers`, {
    method: 'POST',
    headers: { ...tyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Trendyol cevabı kabul etmedi (${res.status}): ${b.errors?.[0]?.message ?? b.message ?? 'bilinmeyen hata'}`)
  return b.answerId as number | undefined
}

/* ------------------------------------------------------------------ */
/* Amazon satıcı geri bildirimi                                        */
/* ------------------------------------------------------------------ */

/** 19.11.2026 · 19/11/26 · 11/19/26 · 2026-11-19 → YYYY-MM-DD */
function parseDate(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!m) return null
  let [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 100) y += 2000
  // Türkiye pazaryeri gün.ay; ilk sayı 12'den büyükse kesin gün, ikinci 12'den büyükse ay/gün
  let d = a,
    mo = b
  if (b > 12 && a <= 12) {
    d = b
    mo = a
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseFeedbackTsv(tsv: string) {
  const lines = tsv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = lines[0].split('\t').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const col = (...keys: RegExp[]) => head.findIndex((h) => keys.some((k) => k.test(h)))
  const iDate = col(/^date$/, /tarih/)
  const iRating = col(/rating/, /puan/, /derecelendirme/)
  const iComment = col(/comment/, /yorum/)
  const iResponse = col(/response/, /yan[ıi]t/)
  const iOrder = col(/order/, /sipari/)
  return lines.slice(1).flatMap((l) => {
    const c = l.split('\t').map((x) => x.trim().replace(/^"|"$/g, ''))
    const order = iOrder >= 0 ? c[iOrder] : ''
    const day = iDate >= 0 ? parseDate(c[iDate] ?? '') : null
    const rating = iRating >= 0 ? Number(c[iRating]) : NaN
    if (!order || !day || !(rating >= 1 && rating <= 5)) return []
    return [{ order, day, rating, comment: iComment >= 0 ? c[iComment] : '', response: iResponse >= 0 ? c[iResponse] : '' }]
  })
}

export async function syncAmazonFeedback(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!amazonConfigured()) throw new Error('Amazon anahtarları tanımlı değil.')
  const now = Date.now()
  const deadline = now + 45_000
  const back = opts.days ?? 90
  const r = empty(now - back * DAY, now)

  const handle = async (reportId: string): Promise<'done' | 'wait' | 'gone'> => {
    const rep = await sp(`/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`, {}, 'Selling Partner Insights', deadline)
    if (!rep) return 'wait'
    if (['FATAL', 'CANCELLED'].includes(rep.processingStatus)) {
      await db.from('amazon_reports').update({ status: rep.processingStatus, done_at: new Date().toISOString() }).eq('report_id', reportId)
      return 'gone'
    }
    if (rep.processingStatus !== 'DONE' || !rep.reportDocumentId) return 'wait'
    const doc = await sp(`/reports/2021-06-30/documents/${encodeURIComponent(rep.reportDocumentId)}`, {}, 'Selling Partner Insights', deadline)
    if (!doc?.url) return 'wait'
    const res = await fetch(doc.url, { cache: 'no-store' })
    let buf = Buffer.from(await res.arrayBuffer())
    if (doc.compressionAlgorithm === 'GZIP') buf = gunzipSync(buf)
    // Amazon raporları çoğunlukla UTF-8; Avrupa pazaryerlerinde bazen Windows-1254/1252 gelir
    let text = buf.toString('utf8')
    if (text.includes('�')) text = new TextDecoder('windows-1254').decode(buf)
    const rows = parseFeedbackTsv(text)
    r.fetched += rows.length
    if (rows.length) {
      const { error } = await db.from('customer_feedback').upsert(
        rows.map((x) => ({
          id: `amazon_geribildirim:${x.order}`,
          source: 'amazon_geribildirim',
          kind: 'geribildirim',
          brand: brandOfText(x.comment),
          posted_at: `${x.day}T12:00:00+03:00`,
          rating: x.rating,
          text: x.comment || '(yorum yazılmamış)',
          answer: x.response || null,
          status: x.rating <= 3 && !x.response ? 'bekliyor' : 'kapandi',
          order_id: x.order,
          sentiment: x.rating <= 2 ? 'olumsuz' : x.rating === 3 ? 'notr' : 'olumlu',
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      )
      if (error) throw new Error(error.message)
      r.imported += rows.length
    }
    await db.from('amazon_reports').update({ status: 'DONE', done_at: new Date().toISOString() }).eq('report_id', reportId)
    return 'done'
  }

  // Bekleyen rapor varsa onu bitir, yoksa yenisini iste
  const { data: pending } = await db.from('amazon_reports').select('report_id').eq('report_type', FEEDBACK_REPORT).in('status', ['IN_QUEUE', 'IN_PROGRESS']).order('requested_at', { ascending: false }).limit(3)
  let ids = (pending ?? []).map((p) => p.report_id as string)
  if (!ids.length) {
    const body = await sp('/reports/2021-06-30/reports', {}, 'Selling Partner Insights', deadline, {
      method: 'POST',
      body: JSON.stringify({ reportType: FEEDBACK_REPORT, marketplaceIds: [TR_MARKETPLACE], dataStartTime: new Date(now - back * DAY).toISOString(), dataEndTime: new Date(now).toISOString() }),
    })
    if (!body?.reportId) {
      r.more = true
      return r
    }
    await db.from('amazon_reports').insert({ report_id: body.reportId, report_type: FEEDBACK_REPORT, data_start: new Date(now - back * DAY).toISOString().slice(0, 10), data_end: new Date(now).toISOString().slice(0, 10) })
    ids = [body.reportId]
  }
  // Rapor genelde 1–2 dakikada hazırlanır; süre yettiğince bekle, olmazsa bir sonraki çalıştırmada indirilir
  while (ids.length && Date.now() + 10_000 < deadline) {
    const next: string[] = []
    for (const id of ids) if ((await handle(id)) === 'wait') next.push(id)
    ids = next
    if (ids.length) await sleep(8_000)
  }
  r.more = ids.length > 0
  return r
}
