import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * Uzun süren yapay zekâ işleri (web aramalı raporlar).
 * Vercel bir isteği ~60 sn'de keser; iş adım adım ilerler, kaldığı yer ai_reports.messages'ta saklanır,
 * panel "devam" isteğiyle bitene kadar sürdürür.
 */

const API = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
export const WEB_SEARCH = (maxUses = 6) => ({ type: process.env.ANTHROPIC_WEB_SEARCH_TOOL || 'web_search_20250305', name: 'web_search', max_uses: maxUses })

export interface JobSpec {
  system: string
  prompt: string
  web?: number // web araması sayısı (0 = kapalı)
  maxTokens?: number
}

export async function startJob(db: SupabaseClient, row: { kind: string; brand?: string | null; subject?: string | null; input?: object; created_by?: string | null }, spec: JobSpec) {
  const { data, error } = await db
    .from('ai_reports')
    .insert({ ...row, input: { ...(row.input ?? {}), spec: { system: spec.system, web: spec.web ?? 0, maxTokens: spec.maxTokens ?? 6000 } }, messages: [{ role: 'user', content: spec.prompt }] })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/** İşi süre yettiğince ilerletir. done=true ise sonuç hazır. */
export async function stepJob(db: SupabaseClient, id: string, deadline: number) {
  const { data: job, error } = await db.from('ai_reports').select('*').eq('id', id).single()
  if (error || !job) throw new Error('İş bulunamadı')
  if (job.status !== 'calisiyor') return { done: true, status: job.status }
  const spec = job.input?.spec ?? {}
  let messages: any[] = job.messages ?? []
  let steps = job.steps ?? 0
  try {
    while (Date.now() + 5_000 < deadline && steps < 12) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(5_000, deadline - Date.now() - 2_000))
      let res: Response
      try {
        res = await fetch(API, {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODEL(), max_tokens: spec.maxTokens ?? 6000, system: spec.system, messages, ...(spec.web ? { tools: [WEB_SEARCH(spec.web)] } : {}) }),
          cache: 'no-store',
          signal: controller.signal,
        })
      } catch (e: any) {
        // Süre doldu: bir sonraki "devam" isteğinde aynı yerden yeniden denenir
        if (e?.name === 'AbortError') break
        throw e
      } finally {
        clearTimeout(timer)
      }
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`Claude ${res.status}: ${b.error?.message ?? 'cevap alınamadı'}`)
      steps++
      const content = b.content ?? []
      if (b.stop_reason === 'pause_turn') {
        messages = [...messages, { role: 'assistant', content }]
        continue
      }
      // Bitti: önceki duraklatılmış parçalar + son cevap
      const all = [...messages.filter((m) => m.role === 'assistant').flatMap((m) => (Array.isArray(m.content) ? m.content : [])), ...content]
      const text = all
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
        .trim()
      const sources = new Map<string, string>()
      for (const c of all) {
        if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) c.content.forEach((r: any) => r.url && sources.set(r.url, r.title ?? r.url))
        ;(c.citations ?? []).forEach((ct: any) => ct.url && sources.set(ct.url, ct.title ?? ct.url))
      }
      const result = extractJson(text)
      await db
        .from('ai_reports')
        .update({ status: 'hazir', messages: null, steps, text: result ? text.replace(/```json[\s\S]*?```/g, '').trim() : text, result, sources: [...sources.entries()].slice(0, 30).map(([url, title]) => ({ url, title })) })
        .eq('id', id)
      return { done: true, status: 'hazir' }
    }
    await db.from('ai_reports').update({ messages, steps }).eq('id', id)
    if (steps >= 12) throw new Error('Rapor çok uzun sürdü, tekrar deneyin.')
    return { done: false, status: 'calisiyor' }
  } catch (e: any) {
    await db.from('ai_reports').update({ status: 'hata', error: String(e.message).slice(0, 500), messages: null, steps }).eq('id', id)
    return { done: true, status: 'hata', error: e.message as string }
  }
}

/** Metnin içindeki ```json … ``` bloğunu (yoksa ilk { … } bloğunu) çözer. */
export function extractJson(text: string): any {
  const block = text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0]
  if (!block) return null
  try {
    return JSON.parse(block)
  } catch {
    return null
  }
}
