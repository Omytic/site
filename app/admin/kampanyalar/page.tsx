'use client'

import { useMemo, useState } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AD_PLATFORMS, BRANDS_WITH_GENEL, label } from '@/lib/panel/constants'
import { invalidate, must, useQuery } from '@/lib/panel/data'
import { dateTR, num, pct, sum, tl } from '@/lib/panel/format'
import { BarChart } from '@/components/panel/charts'
import { Button, Card, cx, Empty, PageHeader, Segmented, Skeleton, Stat, Table, useUi } from '@/components/panel/ui'

interface Row { platform: string; day: string; campaign_id: string; campaign_name: string | null; brand: string; currency: string; spend: number; spend_fx: number | null; impressions: number; reach: number | null; clicks: number; link_clicks: number | null; conversions: number; conv_value: number }

const DAY = 86_400_000
const SYNC: Record<string, string> = { meta: '/api/sync/meta?part=reklam', google: '/api/sync/google-ads', amazon_ads: '/api/sync/amazon-ads' }

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export default function CampaignsPage() {
  const { toast } = useUi()
  const [range, setRange] = useState<'7' | '30' | '90'>('30')
  const [platform, setPlatform] = useState<string>('hepsi')
  const since = new Date(Date.now() - Number(range) * DAY).toISOString().slice(0, 10)
  const q = useQuery(`ad_insights:${range}`, () => must<Row[]>(supabase.from('ad_insights').select('*').gte('day', since).order('day')))
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => (q.data ?? []).filter((r) => platform === 'hepsi' || r.platform === platform), [q.data, platform])
  const platforms = Array.from(new Set((q.data ?? []).map((r) => r.platform)))

  const syncNow = async () => {
    setBusy(true)
    try {
      const list = platform === 'hepsi' ? platforms.length ? platforms : Object.keys(SYNC) : [platform]
      const t = await token()
      const res = await Promise.all(list.map((p) => fetch(SYNC[p], { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json().catch(() => ({})))))
      const bad = res.find((b) => b.ok === false)
      if (bad) throw new Error(bad.message ?? 'Bir platform güncellenemedi')
      toast('Reklam verileri güncellendi.')
      invalidate(`ad_insights:${range}`, 'ad_spend')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const tot = useMemo(() => {
    const spend = sum(rows, (r) => r.spend)
    const value = sum(rows, (r) => r.conv_value)
    const clicks = sum(rows, (r) => r.link_clicks ?? r.clicks)
    const imp = sum(rows, (r) => r.impressions)
    const conv = sum(rows, (r) => r.conversions)
    return { spend, value, clicks, imp, conv, roas: spend ? value / spend : null, cpc: clicks ? spend / clicks : null, ctr: imp ? clicks / imp : null, cpa: conv ? spend / conv : null }
  }, [rows])

  const days = useMemo(() => {
    const ds = Array.from(new Set(rows.map((r) => r.day))).sort()
    return ds
  }, [rows])
  const series = useMemo(
    () =>
      AD_PLATFORMS.filter((p) => rows.some((r) => r.platform === p.id)).map((p) => ({
        id: p.id,
        label: p.label,
        color: p.color,
        values: days.map((d) => sum(rows.filter((r) => r.platform === p.id && r.day === d), (r) => r.spend)),
      })),
    [rows, days],
  )

  const campaigns = useMemo(() => {
    const m = new Map<string, { platform: string; name: string; brand: string; spend: number; imp: number; clicks: number; conv: number; value: number; last: string }>()
    for (const r of rows) {
      const k = `${r.platform}|${r.campaign_id}`
      const e = m.get(k) ?? { platform: r.platform, name: r.campaign_name ?? r.campaign_id, brand: r.brand, spend: 0, imp: 0, clicks: 0, conv: 0, value: 0, last: r.day }
      e.spend += Number(r.spend)
      e.imp += Number(r.impressions)
      e.clicks += Number(r.link_clicks ?? r.clicks)
      e.conv += Number(r.conversions)
      e.value += Number(r.conv_value)
      if (r.day > e.last) e.last = r.day
      m.set(k, e)
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ k, ...v, roas: v.spend ? v.value / v.spend : null, cpc: v.clicks ? v.spend / v.clicks : null, cpa: v.conv ? v.spend / v.conv : null }))
      .sort((a, b) => b.spend - a.spend)
  }, [rows])

  return (
    <>
      <PageHeader
        title="Kampanyalar"
        subtitle="Meta, Google ve Amazon reklam hesaplarından her gün otomatik gelir. Harcama ayrıca Reklam sayfasına ve kâr hesabına yazılır; dövizli hesaplar o günün TCMB kuruyla TL’ye çevrilir."
        actions={
          <Button variant="ghost" onClick={syncNow} loading={busy} icon={<RefreshCw className="h-4 w-4" />}>
            Şimdi güncelle
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented value={range} onChange={setRange} options={[{ id: '7', label: '7 gün' }, { id: '30', label: '30 gün' }, { id: '90', label: '90 gün' }]} />
        <Segmented value={platform} onChange={setPlatform} options={[{ id: 'hepsi', label: 'Hepsi' }, ...AD_PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => ({ id: p.id, label: p.label.split(' (')[0] }))]} />
      </div>

      {q.loading ? (
        <Skeleton className="h-96" />
      ) : !rows.length ? (
        <Empty title="Henüz reklam verisi yok" text="Meta, Google Ads ya da Amazon Ads anahtarları Vercel’e girildikten sonra “Şimdi güncelle”ye basın. İlk seferde son 90 gün gelir." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Harcama" value={tl(tot.spend)} sub={`${num(tot.imp)} gösterim`} tone="dark" />
            <Stat label="Reklamdan gelen satış" value={tl(tot.value)} sub={tot.roas != null ? `harcanan 1 ₺ → ${tl(tot.roas, true)}` : 'dönüşüm ölçülmüyor'} />
            <Stat label="Tıklama" value={num(tot.clicks)} sub={tot.cpc != null ? `tıklama başı ${tl(tot.cpc, true)} · TO ${pct((tot.ctr ?? 0) * 100)}` : undefined} />
            <Stat label="Satın alma" value={num(tot.conv)} sub={tot.cpa != null ? `satış başı reklam ${tl(tot.cpa)}` : undefined} />
          </div>
          <Card className="mt-4" title="Günlük harcama">
            <BarChart labels={days.map((d) => dateTR(d).slice(0, 6))} tooltipLabels={days.map((d) => dateTR(d))} series={series} stacked format={(v) => tl(v)} />
          </Card>
          <Card className="mt-4" pad={false} title="Kampanya kampanya">
            <Table
              head={
                <tr>
                  <th>Kampanya</th>
                  <th className="text-right">Harcama</th>
                  <th className="text-right">Tıklama</th>
                  <th className="text-right">Tıklama başı</th>
                  <th className="text-right">Satış</th>
                  <th className="text-right">Getiri (ROAS)</th>
                </tr>
              }
            >
              {campaigns.map((c) => (
                <tr key={c.k}>
                  <td>
                    <b className="block">{c.name}</b>
                    <span className="text-xs text-ink-soft/55">
                      {label(AD_PLATFORMS, c.platform).split(' (')[0]} · {label(BRANDS_WITH_GENEL, c.brand)} · son {dateTR(c.last)}
                    </span>
                  </td>
                  <td className="text-right font-bold tabular-nums">{tl(c.spend)}</td>
                  <td className="text-right tabular-nums">{num(c.clicks)}</td>
                  <td className="text-right tabular-nums">{c.cpc != null ? tl(c.cpc, true) : '—'}</td>
                  <td className="text-right tabular-nums">{c.conv ? `${num(c.conv)} · ${tl(c.value)}` : '—'}</td>
                  <td className={cx('text-right font-bold tabular-nums', c.roas != null && (c.roas >= 3 ? 'text-[#0a7d0a]' : c.roas < 1 ? 'text-[#b83030]' : ''))}>
                    {c.roas != null ? `${c.roas.toFixed(2).replace('.', ',')}×` : '—'}
                  </td>
                </tr>
              ))}
            </Table>
            <p className="flex items-start gap-2 px-5 py-3 text-xs text-ink-soft/60">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Getiri (ROAS) = reklamın getirdiği satış ÷ harcama. 3× üstü yeşil, 1× altı (harcadığından az satış) kırmızı. Platformların kendi ölçtüğü satıştır; ürün maliyeti ve komisyon düşülmemiştir.
            </p>
          </Card>
        </>
      )}
    </>
  )
}
