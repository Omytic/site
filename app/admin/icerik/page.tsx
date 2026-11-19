'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Lightbulb, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { invalidate, must, useQuery, write } from '@/lib/panel/data'
import { dateTimeTR, relTime } from '@/lib/panel/format'
import { CopyBtn, runAiJob, type AiReport } from '@/components/panel/aiJob'
import { Badge, Button, Card, cx, Empty, PageHeader, Segmented, Skeleton, StatusPill, useUi } from '@/components/panel/ui'

type Brand = 'seryn' | 'formstep' | 'kumas'
const FORMAT: Record<string, string> = { reels: 'Reels', carousel: 'Carousel', story: 'Story', post: 'Gönderi' }
const LEVEL: Record<string, 'good' | 'warning' | 'critical'> = { kolay: 'good', orta: 'warning', zor: 'critical' }

export default function ContentIdeasPage() {
  const { toast, confirm } = useUi()
  const [brand, setBrand] = useState<Brand>('seryn')
  const reports = useQuery(`ai:icerik:${brand}`, () => must<AiReport[]>(supabase.from('ai_reports').select('*').eq('kind', 'icerik').eq('brand', brand).order('created_at', { ascending: false }).limit(10)))
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  useEffect(() => setSel(null), [brand])

  const list = reports.data ?? []
  const r = list.find((x) => x.id === sel) ?? list.find((x) => x.status === 'hazir') ?? null
  const res = r?.result ?? null

  const generate = async () => {
    setBusy(true)
    try {
      const id = await runAiJob({ kind: 'icerik', brand }, setStep)
      invalidate(`ai:icerik:${brand}`)
      setSel(id)
      toast('İçerik raporu hazır.')
    } catch (e: any) {
      toast(e.message, 'error')
      invalidate(`ai:icerik:${brand}`)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (x: AiReport) => {
    if (!(await confirm('Bu rapor silinsin mi?'))) return
    await write(supabase.from('ai_reports').delete().eq('id', x.id))
    invalidate(`ai:icerik:${brand}`)
  }

  return (
    <>
      <PageHeader
        title="İçerik fikirleri"
        subtitle="Yurt dışındaki benzer markaların neler yaptığı ve sizin Instagram'da en iyi giden gönderileriniz birleştirilir; çekilmeye hazır içerik fikirleri çıkar."
        actions={
          <Button variant="gold" icon={<Sparkles className="h-4 w-4" />} loading={busy} onClick={generate}>
            Yeni rapor hazırla
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Brand>
          value={brand}
          onChange={setBrand}
          options={[
            { id: 'seryn', label: 'SERYN' },
            { id: 'formstep', label: 'FormStep' },
            { id: 'kumas', label: 'Kumaş' },
          ]}
        />
        {busy && (
          <p className="text-sm text-ink-soft/70">
            Araştırılıyor{['', '.', '..', '...'][step % 4]} Web araması ve analiz 1–3 dakika sürer, sayfadan ayrılmayın.
          </p>
        )}
      </div>

      {reports.loading ? (
        <Skeleton className="h-96" />
      ) : !r ? (
        <Empty
          icon={<Lightbulb className="h-6 w-6" />}
          title="Henüz rapor yok"
          text="“Yeni rapor hazırla”ya basın. Yapay zekâ global markaları araştırır, sizin gönderilerinizin verisine bakar ve 10 içerik fikri çıkarır. Bir rapor yaklaşık 10–20 TL tutar."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {res ? (
              <>
                <Card title="Özet">
                  <p className="text-[15px] leading-relaxed text-ink">{res.ozet}</p>
                  {res.kendi_icerik && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-[#e9f6ef] p-3.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#0a6e3a]">Sizde iyi gidenler</p>
                        <p className="mt-1 text-sm text-ink">{res.kendi_icerik.iyi_gidenler}</p>
                      </div>
                      <div className="rounded-xl bg-[#fff8e6] p-3.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#8a5a00]">Zayıf kalanlar</p>
                        <p className="mt-1 text-sm text-ink">{res.kendi_icerik.zayif_gidenler}</p>
                      </div>
                      {!!res.kendi_icerik.oneriler?.length && (
                        <ul className="space-y-1 text-sm text-ink md:col-span-2">
                          {res.kendi_icerik.oneriler.map((o: string, i: number) => (
                            <li key={i}>• {o}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>

                <div>
                  <p className="mb-2 font-display text-xl font-black text-ink">Fikirler</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(res.fikirler ?? []).map((f: any, i: number) => (
                      <Card key={i} className="flex flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-night text-white">{FORMAT[f.format] ?? f.format}</Badge>
                          {f.zorluk && <StatusPill tone={LEVEL[f.zorluk] ?? 'neutral'}>{f.zorluk}</StatusPill>}
                        </div>
                        <p className="mt-2 font-bold text-ink">{f.baslik}</p>
                        {f.kanca && (
                          <p className="mt-2 rounded-lg bg-[#fff8e6] px-3 py-2 text-sm text-ink">
                            <b>İlk 2 saniye:</b> {f.kanca}
                          </p>
                        )}
                        {!!f.akis?.length && (
                          <ol className="mt-2 space-y-0.5 text-sm text-ink-soft">
                            {f.akis.map((s: string, j: number) => (
                              <li key={j}>
                                <span className="font-semibold text-ink">{j + 1}.</span> {s}
                              </li>
                            ))}
                          </ol>
                        )}
                        {f.neden && <p className="mt-2 text-xs text-ink-soft/70">Neden: {f.neden}</p>}
                        {f.aciklama_metni && (
                          <div className="mt-auto pt-3">
                            <div className="rounded-lg bg-black/[0.03] p-2.5 text-xs leading-relaxed text-ink-soft whitespace-pre-line">{f.aciklama_metni}</div>
                            <CopyBtn text={f.aciklama_metni} label="Açıklamayı kopyala" className="mt-1" />
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>

                {!!res.trendler?.length && (
                  <Card title="Global örnekler ve trendler">
                    <ul className="-my-2 divide-y divide-line">
                      {res.trendler.map((t: any, i: number) => (
                        <li key={i} className="py-3">
                          <p className="font-semibold text-ink">{t.baslik}</p>
                          <p className="mt-0.5 text-sm text-ink-soft">{t.aciklama}</p>
                          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft/60">
                            {t.ornek && <span>Örnek: {t.ornek}</span>}
                            {t.kaynak && /^https?:\/\//.test(t.kaynak) && (
                              <a href={t.kaynak} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#1d5fb0] hover:underline">
                                Kaynak <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <p className="whitespace-pre-line text-sm text-ink">{r.text}</p>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card title="Önceki raporlar">
              <ul className="-my-1 divide-y divide-line">
                {list.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 py-2">
                    <button type="button" onClick={() => setSel(x.id)} className={cx('min-w-0 flex-1 text-left text-sm', x.id === r.id ? 'font-bold text-ink' : 'text-ink-soft hover:text-ink')}>
                      {dateTimeTR(x.created_at)}
                      {x.status !== 'hazir' && <span className="ml-1 text-xs text-[#b83030]">{x.status === 'hata' ? '(hata)' : '(sürüyor)'}</span>}
                    </button>
                    <button type="button" onClick={() => remove(x)} className="text-ink-soft/40 hover:text-[#b83030]" aria-label="Raporu sil">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            {!!r.sources?.length && (
              <Card title="Bakılan kaynaklar">
                <ul className="space-y-1.5 text-xs">
                  {r.sources.slice(0, 15).map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[#1d5fb0] hover:underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <p className="px-1 text-xs text-ink-soft/50">Hazırlandı: {relTime(r.created_at)}</p>
          </div>
        </div>
      )}
    </>
  )
}
