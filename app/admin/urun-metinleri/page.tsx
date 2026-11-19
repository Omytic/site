'use client'

import { useMemo, useState } from 'react'
import { FileText, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS, label } from '@/lib/panel/constants'
import { groupModels, invalidate, modelTitle, must, useItemsWithStock, useQuery, write } from '@/lib/panel/data'
import { dateTimeTR } from '@/lib/panel/format'
import { CopyBtn, runAiJob, type AiReport } from '@/components/panel/aiJob'
import { Button, Card, cx, Empty, Field, PageHeader, Select, Skeleton, Textarea, useUi } from '@/components/panel/ui'

const MARKETS = ['Amazon', 'Trendyol', 'Hepsiburada']

function Block({ title, text, limit }: { title: string; text?: string | null; limit?: number }) {
  if (!text) return null
  return (
    <div className="rounded-xl bg-black/[0.03] p-3.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft/60">
          {title}
          {limit ? <span className={cx('ml-2 normal-case tracking-normal', text.length > limit ? 'text-[#b83030]' : 'text-ink-soft/40')}>{text.length}/{limit}</span> : null}
        </p>
        <CopyBtn text={text} />
      </div>
      <p className="whitespace-pre-line text-[15px] text-ink [overflow-wrap:anywhere]">{text}</p>
    </div>
  )
}

export default function ListingCopyPage() {
  const { toast, confirm } = useUi()
  const { data: items } = useItemsWithStock()
  const reports = useQuery('ai:urun_metni', () => must<AiReport[]>(supabase.from('ai_reports').select('*').eq('kind', 'urun_metni').order('created_at', { ascending: false }).limit(30)))
  const models = useMemo(() => groupModels((items ?? []).filter((i) => i.active && i.brand !== 'diger')), [items])
  const [model, setModel] = useState('')
  const [markets, setMarkets] = useState<string[]>(['Amazon', 'Trendyol'])
  const [current, setCurrent] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)

  const list = reports.data ?? []
  const r = list.find((x) => x.id === sel) ?? list[0] ?? null
  const res = r?.result ?? null

  const generate = async () => {
    const m = models.find((x) => x.key === model)
    if (!m) return toast('Ürün seçin', 'error')
    setBusy(true)
    try {
      const id = await runAiJob({ kind: 'urun_metni', brand: m.brand, model: m.name, marketplaces: markets, current, notes })
      invalidate('ai:urun_metni')
      setSel(id)
      toast('Metinler hazır.')
    } catch (e: any) {
      toast(e.message, 'error')
      invalidate('ai:urun_metni')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (x: AiReport) => {
    if (!(await confirm('Silinsin mi?'))) return
    await write(supabase.from('ai_reports').delete().eq('id', x.id))
    invalidate('ai:urun_metni')
  }

  return (
    <>
      <PageHeader
        title="Ürün sayfası metinleri"
        subtitle="Amazon, Trendyol ve Hepsiburada için başlık, madde işaretleri, açıklama ve arama terimleri. Amazon'daki ziyaret–dönüşüm verisine ve müşteri sorularına bakılarak yazılır."
      />
      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Yeni metin">
            <div className="space-y-4">
              <Field label="Ürün">
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Seçin</option>
                  {BRANDS.filter((b) => b.id !== 'diger').map((b) => (
                    <optgroup key={b.id} label={b.label}>
                      {models
                        .filter((m) => m.brand === b.id)
                        .map((m) => (
                          <option key={m.key} value={m.key}>
                            {modelTitle(m)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Pazaryerleri">
                <div className="flex flex-wrap gap-1.5">
                  {MARKETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMarkets((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))}
                      className={cx('rounded-full px-3 py-1.5 text-xs font-bold ring-1', markets.includes(m) ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Şu anki sayfa metni (isteğe bağlı)" hint="Amazon/Trendyol'daki mevcut başlık ve açıklamayı yapıştırın; neyin değiştiğini de söyler">
                <Textarea rows={5} value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
              <Field label="Not (isteğe bağlı)">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ör. 'iki katmanlı' vurgulansın, kampanya yok" />
              </Field>
              <Button className="w-full" variant="gold" icon={<Sparkles className="h-4 w-4" />} loading={busy} onClick={generate} disabled={!model || !markets.length}>
                Metinleri yaz
              </Button>
              {busy && <p className="text-xs text-ink-soft/60">Rakip başlıklara bakılıyor ve yazılıyor, 1–2 dakika sürer.</p>}
            </div>
          </Card>
          {list.length > 0 && (
            <Card title="Önceki metinler">
              <ul className="-my-1 divide-y divide-line">
                {list.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 py-2">
                    <button type="button" onClick={() => setSel(x.id)} className={cx('min-w-0 flex-1 text-left text-sm', x.id === r?.id ? 'font-bold text-ink' : 'text-ink-soft hover:text-ink')}>
                      {x.subject} <span className="text-xs font-normal text-ink-soft/50">· {label(BRANDS, x.brand ?? '')} · {dateTimeTR(x.created_at)}</span>
                      {x.status !== 'hazir' && <span className="ml-1 text-xs text-[#b83030]">{x.status === 'hata' ? '(hata)' : '(sürüyor)'}</span>}
                    </button>
                    <button type="button" onClick={() => remove(x)} className="text-ink-soft/40 hover:text-[#b83030]" aria-label="Sil">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="min-w-0">
          {reports.loading ? (
            <Skeleton className="h-96" />
          ) : !r ? (
            <Empty icon={<FileText className="h-6 w-6" />} title="Henüz metin yok" text="Soldan ürünü ve pazaryerlerini seçip “Metinleri yaz”a basın. Bir metin yaklaşık 5–10 TL tutar." />
          ) : r.status === 'hata' ? (
            <Card>
              <p className="text-sm text-[#b83030]">{r.error}</p>
            </Card>
          ) : !res ? (
            <Card>
              <p className="whitespace-pre-line text-sm text-ink">{r.text ?? 'Hazırlanıyor…'}</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card title={`${r.subject} · analiz`}>
                <p className="text-[15px] leading-relaxed text-ink">{res.analiz}</p>
                {!!res.anahtar_kelimeler?.length && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {res.anahtar_kelimeler.map((k: string) => (
                      <span key={k} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-soft">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
              {res.amazon?.baslik && (
                <Card title="Amazon">
                  <div className="space-y-3">
                    <Block title="Başlık" text={res.amazon.baslik} limit={200} />
                    {!!res.amazon.maddeler?.length && (
                      <div className="rounded-xl bg-black/[0.03] p-3.5">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft/60">Madde işaretleri</p>
                          <CopyBtn text={res.amazon.maddeler.join('\n')} label="Hepsini kopyala" />
                        </div>
                        <ul className="space-y-2">
                          {res.amazon.maddeler.map((m: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-[15px] text-ink">
                              <span className="mt-0.5 text-ink-soft/40">•</span>
                              <span className="flex-1">{m}</span>
                              <CopyBtn text={m} label="" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Block title="Açıklama" text={res.amazon.aciklama} />
                    <Block title="Arama terimleri (arka plan)" text={res.amazon.arama_terimleri} limit={250} />
                  </div>
                </Card>
              )}
              {res.trendyol?.baslik && (
                <Card title="Trendyol / Hepsiburada">
                  <div className="space-y-3">
                    <Block title="Başlık" text={res.trendyol.baslik} limit={100} />
                    <Block title="Açıklama" text={res.trendyol.aciklama} />
                  </div>
                </Card>
              )}
              {(res.gorsel_onerileri?.length || res.dogrulanacaklar?.length) && (
                <Card title="Görsel önerileri ve kontrol listesi">
                  {!!res.gorsel_onerileri?.length && (
                    <ul className="space-y-1 text-sm text-ink">
                      {res.gorsel_onerileri.map((g: string, i: number) => (
                        <li key={i}>• {g}</li>
                      ))}
                    </ul>
                  )}
                  {!!res.dogrulanacaklar?.length && (
                    <div className="mt-3 rounded-xl bg-[#fff8e6] p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#8a5a00]">Yayınlamadan önce kontrol edin</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-ink">
                        {res.dogrulanacaklar.map((g: string, i: number) => (
                          <li key={i}>• {g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
