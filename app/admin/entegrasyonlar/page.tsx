'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Link2, Package, Plug, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AFTER, invalidate, useItemsWithStock, useQuery, write, type ItemWithStock } from '@/lib/panel/data'
import { dateTimeTR, num, relTime } from '@/lib/panel/format'
import { ItemSelect } from '@/components/panel/forms'
import { Button, Card, cx, Empty, ErrorNote, Input, PageHeader, Select, Skeleton, StatusPill, Table, useUi } from '@/components/panel/ui'

const RULES: [string, string][] = [
  ['Aynı sipariş iki kez sayılmaz.', 'Senkron her siparişi pazaryerinin sipariş/paket numarasıyla işaretler; tekrar çalıştığında aynısını yeniden eklemez.'],
  ['Elle girdiğiniz siparişe dokunmaz.', 'Bir pazaryeri siparişini panelden kendiniz girdiyseniz, senkron aynı sipariş numarasını görünce yeni satış açmaz, sizin kaydınıza bağlanır.'],
  ['Otomatik gelen siparişi elle tekrar giremezsiniz.', 'Aynı kanal ve sipariş numarasıyla ikinci kayıt engellenir; kimin, hangi tarihte girdiği uyarıda yazar.'],
  ['Düzenlemeleriniz ezilmez.', 'Otomatik gelen satışı düzenleyebilirsiniz. Senkron yalnızca pazaryerinde durum değişirse (iptal, iade) durumu günceller.'],
  ['Sildiğiniz geri gelmez.', 'Otomatik gelen bir satışı silerseniz stok geri eklenir ve o paket bir daha içe aktarılmaz.'],
  ['Amazon’a özel:', 'FBA siparişleri Amazon FBA stoğundan, kendi kargonuzla gönderdikleriniz depodan düşer. Komisyon ve kargo Stok → Kanal maliyetleri’ndeki tanımdan otomatik hesaplanır; iadeler bu bağlantıyla gelmez, elle girilir.'],
  ['Kim ne yaptı görünür.', 'Satışlarda "Giren" sütunu kişiyi ya da "Otomatik · Amazon / Trendyol"u, son düzenleyeni de altında gösterir. Her değişiklik Düzenleme geçmişi’nde.'],
]

interface SyncRun {
  id: number
  channel: string
  started_at: string
  finished_at: string | null
  status: 'calisiyor' | 'tamam' | 'hata'
  fetched: number
  imported: number
  updated: number
  skipped: number
  message: string | null
}
interface Unmatched {
  channel: string
  external_code: string
  title: string | null
  sample_order: string | null
  last_seen: string
}
interface Listing {
  id: string
  channel: string
  external_code: string
  item_id: string
  title: string | null
  components?: { item_id: string; qty: number }[] | null
}

const CHANNELS = [
  { id: 'trendyol', name: 'Trendyol', ready: true, how: 'Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri', env: ['TRENDYOL_SELLER_ID', 'TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET'] },
  { id: 'hepsiburada', name: 'Hepsiburada', ready: false, how: 'Merchant paneli → Entegrasyon bilgileri', env: ['HEPSIBURADA_MERCHANT_ID', 'HEPSIBURADA_USERNAME', 'HEPSIBURADA_PASSWORD'] },
  { id: 'amazon', name: 'Amazon', ready: true, how: 'Solution Provider Portal → uygulama → LWA credentials ve Authorize', env: ['AMAZON_SP_CLIENT_ID', 'AMAZON_SP_CLIENT_SECRET', 'AMAZON_SP_REFRESH_TOKEN'] },
] as const

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export default function IntegrationsPage() {
  const { toast, confirm } = useUi()
  const { data: items } = useItemsWithStock()
  const [status, setStatus] = useState<Record<string, boolean> | null>(null)
  const [statusErr, setStatusErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, Comp[]>>({})
  const [newBundle, setNewBundle] = useState<{ channel: string; code: string; title: string; comps: Comp[] } | null>(null)

  const runs = useQuery('sync_runs', async () => {
    const { data, error } = await supabase.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(20)
    if (error) throw new Error(error.message)
    return data as SyncRun[]
  })
  const unmatched = useQuery('sync_unmatched', async () => {
    const { data, error } = await supabase.from('sync_unmatched').select('*').order('last_seen', { ascending: false })
    if (error) throw new Error(error.message)
    return data as Unmatched[]
  })
  const listings = useQuery('channel_listings', async () => {
    const { data, error } = await supabase.from('channel_listings').select('*').order('channel').order('external_code')
    if (error) throw new Error(error.message)
    return data as Listing[]
  })

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/integrations/status', { headers: { Authorization: `Bearer ${await token()}` } })
        if (!res.ok) throw new Error((await res.json()).message ?? 'Durum alınamadı')
        setStatus(await res.json())
      } catch (e: any) {
        setStatusErr(e.message)
      }
    })()
  }, [])

  const sync = async (channel: string, days?: number) => {
    setBusy(channel)
    try {
      // Amazon'un istek sınırı düşük: süre yetmezse "devamı var" döner, kaldığı yerden birkaç tur daha çalıştırılır.
      const sum = { fetched: 0, imported: 0, updated: 0, linked: 0, unmatched: 0 }
      let body: any
      let first = true
      for (let round = 0; round < 8; round++) {
        const q = first && days ? `?days=${days}` : ''
        first = false
        const res = await fetch(`/api/sync/${channel}${q}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
        body = await res.json()
        if (!body.ok) throw new Error(body.message)
        sum.fetched += body.fetched
        sum.imported += body.imported
        sum.updated += body.updated
        sum.linked += body.linked ?? 0
        sum.unmatched = Math.max(sum.unmatched, body.unmatched?.length ?? 0)
        if (!body.more) break
        invalidate('sync_runs')
      }
      toast(`${sum.fetched} sipariş okundu: ${sum.imported} yeni satış, ${sum.updated} durum güncellemesi${sum.linked ? `, ${sum.linked} elle girilmiş satışa bağlandı` : ''}${sum.unmatched ? `, ${sum.unmatched} eşleşmeyen ürün` : ''}${body?.more ? '. Devamı var, tekrar basın.' : '.'}`)
      invalidate('sync_runs', 'sync_unmatched', ...AFTER.sale)
    } catch (e: any) {
      toast(e.message, 'error')
      invalidate('sync_runs')
    } finally {
      setBusy(null)
    }
  }

  const match = async (u: Unmatched) => {
    const comps = (pick[u.channel + u.external_code] ?? []).filter((c) => c.item_id && c.qty > 0)
    if (!comps.length) return toast('Önce panel ürününü seçin.', 'error')
    const bundle = comps.length > 1 || comps[0].qty !== 1
    try {
      await write(supabase.from('channel_listings').insert({ channel: u.channel, external_code: u.external_code, item_id: comps[0].item_id, title: u.title, components: bundle ? comps : null }))
      await write(supabase.from('sync_unmatched').delete().eq('channel', u.channel).eq('external_code', u.external_code))
      invalidate('sync_unmatched', 'channel_listings')
      toast('Eşleştirildi. Bir sonraki senkronda bu ürünün son 60 günlük siparişleri de gelir.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const unlink = async (l: Listing) => {
    if (!(await confirm('Eşleştirme kaldırılsın mı?', 'Daha önce aktarılan satışlar silinmez.', 'Kaldır'))) return
    try {
      await write(supabase.from('channel_listings').delete().eq('id', l.id))
      invalidate('channel_listings')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const lastRun = (ch: string) => runs.data?.find((r) => r.channel === ch)
  const itemLabel = (id: string) => items?.find((i) => i.id === id)?.label ?? '…'
  const listingLabel = (l: Listing) =>
    Array.isArray(l.components) && l.components.length ? l.components.map((c) => `${c.qty}× ${itemLabel(c.item_id)}`).join(' + ') : itemLabel(l.item_id)
  const addBundle = async () => {
    if (!newBundle) return
    const comps = newBundle.comps.filter((c) => c.item_id && c.qty > 0)
    if (!newBundle.code.trim() || !comps.length) return toast('Pazaryeri barkodunu ve içindeki ürünleri girin.', 'error')
    try {
      await write(
        supabase.from('channel_listings').insert({
          channel: newBundle.channel,
          external_code: newBundle.code.trim(),
          item_id: comps[0].item_id,
          title: newBundle.title || null,
          components: comps.length > 1 || comps[0].qty !== 1 ? comps : null,
        }),
      )
      await supabase.from('sync_unmatched').delete().eq('channel', newBundle.channel).eq('external_code', newBundle.code.trim())
      invalidate('sync_unmatched', 'channel_listings')
      setNewBundle(null)
      toast('Kaydedildi. Bu barkodla gelen siparişler içindeki ürünlere bölünerek stoktan düşer.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Entegrasyonlar"
        subtitle="Pazaryeri siparişleri her sabah otomatik çekilir, satış olarak yazılır ve stok kendiliğinden düşer. API anahtarları yalnızca sunucuda (Vercel) durur, panelde görünmez."
      />
      <ErrorNote message={statusErr ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-3">
        {CHANNELS.map((c) => {
          const configured = status?.[c.id]
          const run = lastRun(c.id)
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-black">{c.name}</p>
                  <p className="mt-1 text-xs text-ink-soft/60">{c.how}</p>
                </div>
                {status === null ? (
                  <Skeleton className="h-6 w-20" />
                ) : !c.ready ? (
                  <StatusPill tone="neutral">Yakında</StatusPill>
                ) : configured ? (
                  <StatusPill tone="good">Bağlı</StatusPill>
                ) : (
                  <StatusPill tone="warning">Anahtar bekleniyor</StatusPill>
                )}
              </div>
              {c.ready && configured ? (
                <>
                  <div className="mt-4 rounded-xl bg-[#F7F6F2] p-3 text-sm">
                    {run ? (
                      <p className="flex items-center gap-2">
                        {run.status === 'tamam' ? <CheckCircle2 className="h-4 w-4 text-[#0a7d0a]" /> : run.status === 'hata' ? <XCircle className="h-4 w-4 text-[#b83030]" /> : <Clock className="h-4 w-4" />}
                        Son senkron {relTime(run.started_at)}
                        {run.status === 'tamam' && <span className="text-ink-soft/60">· {run.imported} yeni</span>}
                      </p>
                    ) : (
                      <p className="text-ink-soft/70">Henüz senkron yapılmadı. İlk senkron son 60 günü çeker.</p>
                    )}
                    {run?.status === 'hata' && <p className="mt-1 text-xs text-[#a32a2a]">{run.message}</p>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" loading={busy === c.id} icon={<RefreshCw className="h-4 w-4" />} onClick={() => sync(c.id)}>
                      Şimdi senkronla
                    </Button>
                    <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => sync(c.id, 90)}>
                      Son 90 günü tara
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4 text-sm text-ink-soft">
                  <p className="mb-2 text-xs font-semibold text-ink-soft/60">Vercel → Settings → Environment Variables:</p>
                  <ul className="space-y-1">
                    {c.env.map((e) => (
                      <li key={e}>
                        <code className="rounded-md bg-[#F4F3EF] px-1.5 py-0.5 text-xs">{e}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {status && !status.serviceRole && (
        <p className="mt-3 rounded-xl bg-[#fab219]/15 px-4 py-3 text-sm text-[#8a5a00]">
          ▲ Sunucuda <code>SUPABASE_SERVICE_ROLE_KEY</code> tanımlı değil. Senkron satış yazabilmek için buna ihtiyaç duyar (Supabase → Project Settings → API → service_role).
        </p>
      )}

      <Card className="mt-4" title="Otomatik senkron ile elle giriş nasıl birlikte çalışır?">
        <ul className="grid gap-x-8 gap-y-3 text-sm text-ink-soft md:grid-cols-2">
          {RULES.map(([title, text]) => (
            <li key={title} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1baf7a]" />
              <span>
                <b className="text-ink">{title}</b> {text}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4" title="Eşleşmeyen ürünler" action={<span className="text-xs text-ink-soft/60">Barkodu panel ürününe bağlayın</span>}>
        {unmatched.loading ? (
          <Skeleton className="h-24" />
        ) : !unmatched.data?.length ? (
          <p className="py-6 text-center text-sm text-ink-soft/50">Eşleşmeyen ürün yok. Pazaryerindeki barkod ya da stok kodu, panel ürününün SKU'suyla aynıysa otomatik eşleşir.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {unmatched.data.map((u) => (
              <li key={u.channel + u.external_code} className="grid gap-3 py-3 lg:grid-cols-[1fr_minmax(300px,440px)_auto] lg:items-start">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{u.title || u.external_code}</p>
                  <p className="text-xs text-ink-soft/60">
                    {u.channel} · <code>{u.external_code}</code>
                    {u.sample_order ? ` · örnek sipariş ${u.sample_order}` : ''}
                  </p>
                </div>
                {items && <BundlePicker items={items} value={pick[u.channel + u.external_code] ?? [{ item_id: '', qty: 1 }]} onChange={(v) => setPick((p) => ({ ...p, [u.channel + u.external_code]: v }))} />}
                <Button size="sm" icon={<Link2 className="h-4 w-4" />} onClick={() => match(u)}>
                  Eşleştir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Senkron geçmişi" pad={false}>
          <div className="pt-2">
            {!runs.data?.length ? (
              <div className="p-5">
                <Empty icon={<Plug className="h-5 w-5" />} title="Henüz senkron yok" />
              </div>
            ) : (
              <Table
                head={
                  <tr>
                    <th>Zaman</th>
                    <th>Kanal</th>
                    <th className="text-right">Okunan</th>
                    <th className="text-right">Yeni</th>
                    <th>Durum</th>
                  </tr>
                }
              >
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-ink-soft">{dateTimeTR(r.started_at)}</td>
                    <td className="capitalize">{r.channel}</td>
                    <td className="text-right tabular-nums">{num(r.fetched)}</td>
                    <td className="text-right font-bold tabular-nums">{num(r.imported)}</td>
                    <td className="max-w-[260px]">
                      <StatusPill tone={r.status === 'tamam' ? 'good' : r.status === 'hata' ? 'critical' : 'info'}>{r.status === 'tamam' ? 'Tamam' : r.status === 'hata' ? 'Hata' : 'Çalışıyor'}</StatusPill>
                      {r.message && <p className={cx('mt-1 truncate text-xs', r.status === 'hata' ? 'text-[#a32a2a]' : 'text-ink-soft/60')}>{r.message}</p>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
        <Card
          title="Eşleştirilmiş ürün kodları"
          pad={false}
          action={
            <Button size="sm" variant="secondary" icon={<Package className="h-4 w-4" />} onClick={() => setNewBundle({ channel: 'trendyol', code: '', title: '', comps: [{ item_id: '', qty: 2 }] })}>
              Paket ürün tanımla
            </Button>
          }
        >
          {newBundle && items && (
            <div className="mx-5 mb-3 space-y-3 rounded-2xl bg-[#F7F6F2] p-4">
              <p className="text-sm font-semibold">Paket (ikili, üçlü, karma) ilan</p>
              <p className="text-xs text-ink-soft/70">Pazaryerindeki paket ilanın barkodunu girin, içinde hangi üründen kaç adet olduğunu seçin. Satış gelince fiyat ürünlere bölünür, stoktan her biri ayrı düşer.</p>
              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <Select value={newBundle.channel} onChange={(e) => setNewBundle({ ...newBundle, channel: e.target.value })}>
                  <option value="trendyol">Trendyol</option>
                  <option value="hepsiburada">Hepsiburada</option>
                  <option value="amazon">Amazon</option>
                </Select>
                <Input value={newBundle.code} onChange={(e) => setNewBundle({ ...newBundle, code: e.target.value })} placeholder="Barkod / stok kodu / SKU" />
              </div>
              <Input value={newBundle.title} onChange={(e) => setNewBundle({ ...newBundle, title: e.target.value })} placeholder="İlan adı (isteğe bağlı), ör. SERYN 18g 2'li" />
              <BundlePicker items={items} value={newBundle.comps} onChange={(comps) => setNewBundle({ ...newBundle, comps })} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setNewBundle(null)}>Vazgeç</Button>
                <Button size="sm" onClick={addBundle}>Kaydet</Button>
              </div>
            </div>
          )}
          <div className="pt-2">
            {!listings.data?.length ? (
              <p className="p-5 text-sm text-ink-soft/50">Henüz elle eşleştirme yok.</p>
            ) : (
              <Table
                head={
                  <tr>
                    <th>Kanal</th>
                    <th>Pazaryeri kodu</th>
                    <th>Panel ürünü</th>
                    <th />
                  </tr>
                }
              >
                {listings.data.map((l) => (
                  <tr key={l.id}>
                    <td className="capitalize">{l.channel}</td>
                    <td>
                      <code className="text-xs">{l.external_code}</code>
                    </td>
                    <td className="font-medium">
                      {Array.isArray(l.components) && l.components.length > 0 && <Package className="mr-1 inline h-3.5 w-3.5 text-thread-deep" />}
                      {listingLabel(l)}
                    </td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => unlink(l)} aria-label="Kaldır">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

type Comp = { item_id: string; qty: number }

/** Bir pazaryeri kodunun içindeki ürün(ler): tek ürün, aynı üründen 2'li/3'lü ya da karma paket. */
function BundlePicker({ items, value, onChange }: { items: ItemWithStock[]; value: Comp[]; onChange: (v: Comp[]) => void }) {
  const rows = value.length ? value : [{ item_id: '', qty: 1 }]
  const set = (i: number, p: Partial<Comp>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_72px_auto] items-center gap-2">
          <ItemSelect items={items} value={r.item_id} onChange={(id) => set(i, { item_id: id })} />
          <div className="relative">
            <Input inputMode="numeric" aria-label="Adet" value={String(r.qty)} onChange={(e) => set(i, { qty: Math.max(1, Number(e.target.value) || 1) })} className="pr-6 text-right" />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft/50">×</span>
          </div>
          {rows.length > 1 ? (
            <button type="button" aria-label="Kaldır" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-lg p-1 text-ink-soft/40 hover:text-[#b83030]">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-6" />
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { item_id: '', qty: 1 }])} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft/60 hover:text-ink">
        <Plus className="h-3.5 w-3.5" /> Pakette başka ürün de var (karma paket)
      </button>
      {(rows.length > 1 || rows[0].qty > 1) && <p className="text-[11px] font-semibold text-thread-deep">Paket: satış gelince içindeki ürünlere bölünür.</p>}
    </div>
  )
}
