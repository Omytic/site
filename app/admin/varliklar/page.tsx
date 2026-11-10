'use client'

import { useState } from 'react'
import { ExternalLink, Globe, Pencil, Plus, ShoppingCart, TrendingUp, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { ASSET_KINDS, BRANDS_WITH_GENEL, label, SERIES, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, write, type Asset, type AssetMetric } from '@/lib/panel/data'
import { addDays, dateTR, lastMonths, monthLabel, num, today } from '@/lib/panel/format'
import { Legend, LineChart, Sparkline } from '@/components/panel/charts'
import { useOpenFromQuery } from '@/components/panel/forms'
import { Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, Select, Skeleton, Stat, Textarea, UserDot, useUi } from '@/components/panel/ui'

const SOCIAL = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin']

function KindIcon({ kind }: { kind: string }) {
  if (kind === 'site') return <Globe className="h-5 w-5" />
  if (kind === 'pazaryeri') return <ShoppingCart className="h-5 w-5" />
  return <Users className="h-5 w-5" />
}

export default function AssetsPage() {
  const assets = Q.assets()
  const metrics = Q.assetMetrics()
  const { byId } = useAuth()
  const [form, setForm] = useState<Asset | 'new' | null>(null)
  const [metricFor, setMetricFor] = useState<Asset | null>(null)
  useOpenFromQuery(() => setForm('new'))

  const all = assets.data ?? []
  const social = all.filter((a) => SOCIAL.includes(a.kind))
  const mOf = (id: string) => (metrics.data ?? []).filter((m) => m.asset_id === id)
  const totalFollowers = social.reduce((a, s) => a + (s.followers ?? 0), 0)
  const growth30 = social.reduce((a, s) => {
    const ms = mOf(s.id)
    if (ms.length < 2) return a
    const old = [...ms].reverse().find((m) => m.metric_date <= addDays(today(), -30)) ?? ms[0]
    return a + ((s.followers ?? 0) - old.followers)
  }, 0)

  const firstMetric = (metrics.data ?? [])[0]?.metric_date?.slice(0, 7)
  const months = lastMonths(12).filter((m) => !firstMetric || m >= firstMetric)
  const tracked = social.filter((s) => mOf(s.id).length > 0).slice(0, 6)
  const series = tracked.map((s, i) => ({
    id: s.id,
    label: s.handle || s.name,
    color: SERIES[i],
    values: months.map((m) => {
      const upto = mOf(s.id).filter((x) => x.metric_date.slice(0, 7) <= m)
      return upto.length ? upto[upto.length - 1].followers : 0
    }),
  }))

  return (
    <>
      <PageHeader
        title="Dijital varlıklar"
        subtitle="Siteler, sosyal medya hesapları ve pazaryeri mağazaları tek yerde. Şifre burada tutulmaz."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm('new')}>
            Varlık ekle
          </Button>
        }
      />
      <ErrorNote message={assets.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Toplam takipçi" value={num(totalFollowers)} sub={`${social.length} sosyal hesap`} />
        <Stat label="Son 30 gün büyüme" value={`${growth30 >= 0 ? '+' : ''}${num(growth30)}`} sub="takipçi" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Web sitesi" value={all.filter((a) => a.kind === 'site').length} />
        <Stat label="Pazaryeri mağazası" value={all.filter((a) => a.kind === 'pazaryeri').length} />
      </div>

      {series.length > 0 && (
        <Card className="mt-4" title="Takipçi gelişimi" action={<Legend items={series} />}>
          <LineChart labels={months.map((m) => monthLabel(m))} tooltipLabels={months.map((m) => monthLabel(m, true))} series={series} area={false} format={(v) => `${num(v)} takipçi`} />
        </Card>
      )}

      {assets.loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="mt-4">
          <Empty title="Henüz varlık yok" action={<Button onClick={() => setForm('new')}>Varlık ekle</Button>} />
        </div>
      ) : (
        BRANDS_WITH_GENEL.filter((b) => all.some((a) => a.brand === b.id)).map((b) => (
          <section key={b.id} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-black">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
              {b.id === 'genel' ? 'OMY Ticaret' : b.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {all
                .filter((a) => a.brand === b.id)
                .map((a) => {
                  const ms = mOf(a.id)
                  const owner = byId(a.owner)
                  const prev = ms.length > 1 ? ms[ms.length - 2].followers : null
                  const isSocial = SOCIAL.includes(a.kind)
                  return (
                    <article key={a.id} className="group relative overflow-hidden rounded-2xl bg-white p-5 ring-1 ring-black/[0.06] transition hover:-translate-y-0.5 hover:shadow-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: b.color }}>
                            <KindIcon kind={a.kind} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">{a.name}</p>
                            <p className="truncate text-xs text-ink-soft/60">
                              {label(ASSET_KINDS, a.kind)}
                              {a.handle ? ` · ${a.handle}` : ''}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => setForm(a)} className="rounded-lg p-1.5 text-ink-soft/40 opacity-0 transition hover:bg-black/5 hover:text-ink group-hover:opacity-100" aria-label="Düzenle">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                      {isSocial && (
                        <div className="mt-4 flex items-end justify-between">
                          <div>
                            <p className="font-display text-3xl font-black leading-none">{a.followers !== null ? num(a.followers) : '—'}</p>
                            <p className="mt-1 text-xs text-ink-soft/60">
                              takipçi
                              {prev !== null && a.followers !== null && (
                                <b className={cx('ml-1.5', a.followers >= prev ? 'text-[#0a7d0a]' : 'text-[#b83030]')}>
                                  {a.followers >= prev ? '+' : ''}
                                  {num(a.followers - prev)}
                                </b>
                              )}
                            </p>
                          </div>
                          <Sparkline values={ms.map((m) => m.followers)} color={b.color} />
                        </div>
                      )}
                      {a.note && <p className="mt-3 line-clamp-2 text-sm text-ink-soft/70">{a.note}</p>}
                      <div className="mt-4 flex items-center gap-2 border-t border-black/[0.05] pt-3">
                        {a.url && (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-thread-deep">
                            Aç <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {isSocial && (
                          <button onClick={() => setMetricFor(a)} className="text-sm font-semibold text-ink-soft hover:text-ink">
                            + Takipçi gir
                          </button>
                        )}
                        <span className="ml-auto">{owner ? <UserDot name={owner.full_name} color={owner.color} /> : <span className="text-xs text-ink-soft/40">sorumlu yok</span>}</span>
                      </div>
                    </article>
                  )
                })}
            </div>
          </section>
        ))
      )}

      {form && <AssetForm asset={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {metricFor && <MetricForm asset={metricFor} metrics={mOf(metricFor.id)} onClose={() => setMetricFor(null)} />}
    </>
  )
}

function AssetForm({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const { profiles } = useAuth()
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    kind: asset?.kind ?? 'instagram',
    name: asset?.name ?? '',
    url: asset?.url ?? '',
    handle: asset?.handle ?? '',
    brand: (asset?.brand ?? 'seryn') as BrandOrGenel,
    owner: asset?.owner ?? '',
    note: asset?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const row = { ...f, url: f.url || null, handle: f.handle || null, owner: f.owner || null, note: f.note || null }
    try {
      await write(asset ? supabase.from('assets').update(row).eq('id', asset.id) : supabase.from('assets').insert(row))
      invalidate(...AFTER.assets)
      toast('Kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!asset || !(await confirm('Varlık silinsin mi?', 'Takipçi geçmişi de silinir.'))) return
    try {
      await write(supabase.from('assets').delete().eq('id', asset.id))
      invalidate(...AFTER.assets)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={asset ? 'Varlığı düzenle' : 'Yeni dijital varlık'}
      footer={
        <>
          {asset && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="asset-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tür">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {ASSET_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as BrandOrGenel })}>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id === 'genel' ? 'OMY Ticaret' : b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Ad">
          <Input required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="FormStep Instagram" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kullanıcı adı">
            <Input value={f.handle} onChange={(e) => set({ handle: e.target.value })} placeholder="@formstep.tr" />
          </Field>
          <Field label="Sorumlu">
            <Select value={f.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Adres (URL)">
          <Input type="url" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Not" hint="Hangi e-postaya bağlı, kim yönetiyor gibi bilgiler. Şifre yazmayın.">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}

function MetricForm({ asset, metrics, onClose }: { asset: Asset; metrics: AssetMetric[]; onClose: () => void }) {
  const { toast } = useUi()
  const [followers, setFollowers] = useState(asset.followers ? String(asset.followers) : '')
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await write(supabase.from('asset_metrics').insert({ asset_id: asset.id, followers: Math.round(Number(followers)), metric_date: date }))
      invalidate(...AFTER.assets)
      toast('Takipçi sayısı kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${asset.name}: takipçi`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="metric-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="metric-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Takipçi sayısı">
            <Input type="number" min="0" required autoFocus value={followers} onChange={(e) => setFollowers(e.target.value)} />
          </Field>
          <Field label="Tarih">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-ink-soft/70">Ayda bir ya da haftada bir girmeniz yeterli; büyüme grafiği bu ölçümlerden çizilir.</p>
        {metrics.length > 0 && (
          <ul className="divide-y divide-black/[0.05] rounded-2xl bg-white ring-1 ring-line">
            {[...metrics].reverse().slice(0, 10).map((m) => (
              <li key={m.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-ink-soft">{dateTR(m.metric_date)}</span>
                <b className="tabular-nums">{num(m.followers)}</b>
              </li>
            ))}
          </ul>
        )}
      </form>
    </Drawer>
  )
}
