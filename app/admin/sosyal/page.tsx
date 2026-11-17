'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Heart, MessageCircle, RefreshCw, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS_WITH_GENEL } from '@/lib/panel/constants'
import { invalidate, must, useQuery, write } from '@/lib/panel/data'
import { dateTR, num, pct, relTime, sum } from '@/lib/panel/format'
import { BarChart, LineChart } from '@/components/panel/charts'
import { Button, Card, cx, Empty, PageHeader, Segmented, Select, Skeleton, Stat, Table, useUi } from '@/components/panel/ui'

interface Account { id: string; platform: 'instagram' | 'facebook'; username: string | null; name: string | null; picture: string | null; brand: string; followers: number | null; following: number | null; posts: number | null; updated_at: string }
interface Daily { account_id: string; day: string; followers: number | null; reach: number | null; views: number | null; interactions: number | null; accounts_engaged: number | null; profile_taps: number | null; follows: number | null; unfollows: number | null }
interface Post { id: string; account_id: string; posted_at: string; kind: string | null; caption: string | null; permalink: string | null; thumb: string | null; likes: number; comments: number; saves: number | null; shares: number | null; reach: number | null; views: number | null; interactions: number | null }

const DAY = 86_400_000
const KIND: Record<string, string> = { REELS: 'Reels', IMAGE: 'Fotoğraf', CAROUSEL_ALBUM: 'Kaydırmalı', VIDEO: 'Video', STORY: 'Hikâye' }

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export default function SocialPage() {
  const { toast } = useUi()
  const [range, setRange] = useState<'30' | '90'>('30')
  const since = new Date(Date.now() - Number(range) * DAY).toISOString().slice(0, 10)
  const accounts = useQuery('social_accounts', () => must<Account[]>(supabase.from('social_accounts').select('*').order('platform').order('followers', { ascending: false })))
  const daily = useQuery(`social_daily:${range}`, () => must<Daily[]>(supabase.from('social_daily').select('*').gte('day', since).order('day')))
  const posts = useQuery(`social_posts:${range}`, () => must<Post[]>(supabase.from('social_posts').select('*').gte('posted_at', since).order('posted_at', { ascending: false })))
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)

  const ig = (accounts.data ?? []).filter((a) => a.platform === 'instagram')
  const acc = ig.find((a) => a.id === sel) ?? ig[0]

  const syncNow = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/sync/meta?part=instagram', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b.ok === false) throw new Error(b.message ?? 'Güncellenemedi')
      toast('Instagram verileri güncellendi.')
      invalidate('social_accounts', `social_daily:${range}`, `social_posts:${range}`)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const setBrand = async (a: Account, brand: string) => {
    try {
      await write(supabase.from('social_accounts').update({ brand }).eq('id', a.id))
      invalidate('social_accounts')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  /** Bir hesabın n gün önceki takipçi sayısı (o güne en yakın kayıt) */
  const followersAgo = (id: string, days: number) => {
    const target = new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
    const rows = (daily.data ?? []).filter((d) => d.account_id === id && d.followers != null && d.day <= target)
    return rows.length ? rows[rows.length - 1].followers : null
  }

  const d = useMemo(() => (daily.data ?? []).filter((x) => acc && x.account_id === acc.id), [daily.data, acc])
  const p = useMemo(() => (posts.data ?? []).filter((x) => acc && x.account_id === acc.id), [posts.data, acc])
  const withRate = useMemo(
    () =>
      p.map((x) => {
        const inter = x.interactions ?? x.likes + x.comments + (x.saves ?? 0) + (x.shares ?? 0)
        return { ...x, inter, rate: x.reach ? inter / x.reach : null }
      }),
    [p],
  )
  const byKind = useMemo(() => {
    const m = new Map<string, { n: number; inter: number; reach: number }>()
    withRate.forEach((x) => {
      const k = x.kind ?? 'IMAGE'
      const e = m.get(k) ?? { n: 0, inter: 0, reach: 0 }
      e.n++
      e.inter += x.inter
      e.reach += x.reach ?? 0
      m.set(k, e)
    })
    return Array.from(m.entries()).sort((a, b) => b[1].inter / b[1].n - a[1].inter / a[1].n)
  }, [withRate])

  const loading = accounts.loading || daily.loading
  const followerDays = d.filter((x) => x.followers != null)
  const statDays = d.filter((x) => x.reach != null || x.interactions != null)
  const gained = sum(statDays, (x) => x.follows ?? 0)
  const lost = sum(statDays, (x) => x.unfollows ?? 0)

  return (
    <>
      <PageHeader
        title="Sosyal medya"
        subtitle="Instagram ve Facebook hesaplarınız Meta’dan her gün otomatik gelir: takipçi, erişim, gönderi etkileşimi."
        actions={
          <>
            <Segmented value={range} onChange={setRange} options={[{ id: '30', label: '30 gün' }, { id: '90', label: '90 gün' }]} />
            <Button variant="ghost" onClick={syncNow} loading={busy} icon={<RefreshCw className="h-4 w-4" />}>
              Şimdi güncelle
            </Button>
          </>
        }
      />
      {loading ? (
        <Skeleton className="h-96" />
      ) : !(accounts.data ?? []).length ? (
        <Empty title="Henüz hesap gelmedi" text="Meta anahtarı (META_ACCESS_TOKEN) Vercel’e girildikten sonra “Şimdi güncelle”ye basın. Hesaplar Business Suite’te sistem kullanıcısına atanmış olmalı." />
      ) : (
        <>
          {/* Hesaplar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(accounts.data ?? []).map((a) => {
              const w = followersAgo(a.id, 7)
              const m = followersAgo(a.id, 30)
              const active = a.id === acc?.id
              return (
                <div
                  key={a.id}
                  role={a.platform === 'instagram' ? 'button' : undefined}
                  tabIndex={a.platform === 'instagram' ? 0 : undefined}
                  onClick={() => a.platform === 'instagram' && setSel(a.id)}
                  className={cx('rounded-2xl bg-white p-4 ring-1 transition', active ? 'ring-2 ring-thread' : 'ring-black/[0.06]', a.platform === 'instagram' && 'cursor-pointer hover:ring-black/20')}
                >
                  <div className="flex items-center gap-3">
                    {a.picture ? <img src={a.picture} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-sm font-black">{(a.username ?? a.name ?? '?').slice(0, 1).toUpperCase()}</div>}
                    <div className="min-w-0">
                      <b className="block truncate">{a.username ? `@${a.username}` : a.name}</b>
                      <span className="text-xs text-ink-soft/60">{a.platform === 'instagram' ? 'Instagram' : 'Facebook sayfası'}</span>
                    </div>
                  </div>
                  <p className="mt-3 font-display text-3xl font-black tabular-nums">{a.followers != null ? num(a.followers) : '—'}</p>
                  <p className="text-xs text-ink-soft/60">
                    takipçi
                    {w != null && a.followers != null && <span className={cx('ml-1 font-bold', a.followers - w >= 0 ? 'text-[#0a7d0a]' : 'text-[#b83030]')}>{a.followers - w >= 0 ? '+' : ''}{num(a.followers - w)} bu hafta</span>}
                    {m != null && a.followers != null && m !== w && <span className="ml-1">· {a.followers - m >= 0 ? '+' : ''}{num(a.followers - m)} 30 günde</span>}
                  </p>
                  <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-ink-soft/60">Marka</span>
                    <Select value={a.brand} onChange={(e) => setBrand(a, e.target.value)} className="!h-8 !py-0 text-xs">
                      {BRANDS_WITH_GENEL.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-ink-soft/55">Son güncelleme {relTime((accounts.data ?? [])[0].updated_at)}. Takipçi grafiği bağlantının kurulduğu günden itibaren dolmaya başlar.</p>

          {acc && (
            <>
              <h2 className="mb-3 mt-8 font-display text-xl font-black">@{acc.username}</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Erişim" value={num(sum(statDays, (x) => x.reach ?? 0))} sub="günlük erişimlerin toplamı" tone="dark" icon={<Users className="h-4 w-4" />} />
                <Stat label="Görüntülenme" value={num(sum(statDays, (x) => x.views ?? 0))} />
                <Stat label="Etkileşim" value={num(sum(statDays, (x) => x.interactions ?? 0))} sub={`${num(sum(statDays, (x) => x.accounts_engaged ?? 0))} kişi etkileşti`} />
                <Stat label="Takip / bırakma" value={`+${num(gained)} / −${num(lost)}`} sub={gained || lost ? `net ${gained - lost >= 0 ? '+' : ''}${num(gained - lost)}` : 'veri birikiyor'} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card title="Takipçi">
                  {followerDays.length > 1 ? (
                    <LineChart labels={followerDays.map((x) => dateTR(x.day).slice(0, 6))} series={[{ id: 'f', label: 'Takipçi', color: '#c2559d', values: followerDays.map((x) => Number(x.followers)) }]} format={(v) => num(v)} />
                  ) : (
                    <p className="py-10 text-center text-sm text-ink-soft/55">Takipçi sayısı her gün kaydedilir; birkaç gün sonra grafik oluşur.</p>
                  )}
                </Card>
                <Card title="Günlük erişim ve etkileşim">
                  {statDays.length > 1 ? (
                    <BarChart
                      labels={statDays.map((x) => dateTR(x.day).slice(0, 6))}
                      series={[{ id: 'r', label: 'Erişim', color: '#2a78d6', values: statDays.map((x) => x.reach ?? 0) }]}
                      line={{ id: 'i', label: 'Etkileşim', color: '#E3AB3B', values: statDays.map((x) => x.interactions ?? 0) }}
                      format={(v) => num(v)}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-ink-soft/55">Veri birikiyor.</p>
                  )}
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Card title="Hangi tür daha çok etkileşim alıyor?">
                  {byKind.length ? (
                    <ul className="space-y-3">
                      {byKind.map(([k, v]) => (
                        <li key={k} className="flex items-center justify-between gap-3 text-sm">
                          <span>
                            <b>{KIND[k] ?? k}</b> <span className="text-ink-soft/55">· {num(v.n)} gönderi</span>
                          </span>
                          <span className="text-right tabular-nums">
                            <b>{num(Math.round(v.inter / v.n))}</b> <span className="text-xs text-ink-soft/55">ort. etkileşim</span>
                            {v.reach > 0 && <span className="block text-xs text-ink-soft/55">erişimin {pct((v.inter / v.reach) * 100)}’i</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-soft/55">Bu dönemde gönderi yok.</p>
                  )}
                </Card>
                <Card title="Gönderiler (en çok etkileşim alan üstte)" className="lg:col-span-2" pad={false}>
                  {withRate.length ? (
                    <Table
                      head={
                        <tr>
                          <th>Gönderi</th>
                          <th className="text-right">Erişim</th>
                          <th className="text-right">Beğeni · yorum</th>
                          <th className="text-right">Kayıt · paylaşım</th>
                          <th className="text-right">Etkileşim oranı</th>
                        </tr>
                      }
                    >
                      {[...withRate]
                        .sort((a, b) => b.inter - a.inter)
                        .map((x) => (
                          <tr key={x.id}>
                            <td>
                              <div className="flex items-center gap-3">
                                {x.thumb ? <img src={x.thumb} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <div className="h-11 w-11 shrink-0 rounded-lg bg-black/5" />}
                                <div className="min-w-0">
                                  <span className="line-clamp-1 text-sm">{x.caption || '(açıklama yok)'}</span>
                                  <span className="text-xs text-ink-soft/55">
                                    {KIND[x.kind ?? ''] ?? x.kind} · {dateTR(x.posted_at.slice(0, 10))}
                                    {x.permalink && (
                                      <a href={x.permalink} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-ink-soft hover:text-ink">
                                        aç <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="text-right tabular-nums">{x.reach != null ? num(x.reach) : '—'}</td>
                            <td className="whitespace-nowrap text-right tabular-nums">
                              <Heart className="mr-0.5 inline h-3.5 w-3.5 text-[#d03b3b]" />
                              {num(x.likes)} · <MessageCircle className="mr-0.5 inline h-3.5 w-3.5" />
                              {num(x.comments)}
                            </td>
                            <td className="text-right tabular-nums">{x.saves != null ? `${num(x.saves)} · ${num(x.shares ?? 0)}` : '—'}</td>
                            <td className="text-right font-bold tabular-nums">{x.rate != null ? pct(x.rate * 100) : '—'}</td>
                          </tr>
                        ))}
                    </Table>
                  ) : (
                    <p className="p-5 text-sm text-ink-soft/55">Bu dönemde gönderi yok.</p>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
