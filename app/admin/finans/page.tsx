'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Pencil, Trash2, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  BRANDS,
  BRANDS_WITH_GENEL,
  CATEGORY_LABEL,
  CHANNELS,
  colorOf,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  label,
  SERIES,
  type BrandOrGenel,
} from '@/lib/panel/constants'
import { AFTER, invalidate, Q, write, type LedgerRow, type Transaction } from '@/lib/panel/data'
import { addDays, daysBetween, dateTR, lastMonths, monthKey, monthLabel, norm, tl, today } from '@/lib/panel/format'
import { BarChart, HBars, Legend, ShareBar, Waterfall } from '@/components/panel/charts'
import { useOpenFromQuery } from '@/components/panel/forms'
import { Badge, Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, SearchBox, Segmented, Select, ShowMore, Skeleton, Stat, StatusPill, Table, Textarea, useShowMore, useUi } from '@/components/panel/ui'

type Period = 'ay' | '3ay' | 'yil' | '12ay' | 'tumu'
const SOURCE = { satis: 'Satış', alim: 'Alım', sevkiyat: 'Sevkiyat', reklam: 'Reklam', manuel: 'Elle' } as const
const SOURCE_HREF = { satis: '/admin/satislar', alim: '/admin/alimlar', sevkiyat: '/admin/sevkiyat', reklam: '/admin/reklam', manuel: '' } as const

function periodStart(p: Period) {
  const t = today()
  if (p === 'ay') return `${monthKey(t)}-01`
  if (p === '3ay') return `${lastMonths(3)[0]}-01`
  if (p === 'yil') return `${t.slice(0, 4)}-01-01`
  if (p === '12ay') return `${lastMonths(12)[0]}-01`
  return '0000-01-01'
}

export default function FinancePage() {
  const ledger = Q.ledger()
  const lines = Q.saleLines()
  const txs = Q.transactions()
  const { toast, confirm } = useUi()
  const [period, setPeriod] = useState<Period>('12ay')
  const [dir, setDir] = useState<'all' | 'gelir' | 'gider'>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const page = useShowMore(50)
  useOpenFromQuery(() => setEditing('new'))

  const from = periodStart(period)
  const rows = useMemo(() => (ledger.data ?? []).filter((r) => r.tx_date >= from), [ledger.data, from])
  const inc = rows.filter((r) => r.direction === 'gelir').reduce((a, r) => a + Number(r.amount), 0)
  const exp = rows.filter((r) => r.direction === 'gider').reduce((a, r) => a + Number(r.amount), 0)

  // Kâr: ciro − satılan malın maliyeti − (mal alımı hariç) giderler + diğer gelirler
  const sl = (lines.data ?? []).filter((l) => l.status === 'tamamlandi' && l.sale_date >= from)
  const revenue = sl.reduce((a, l) => a + Number(l.revenue), 0)
  const cogs = sl.reduce((a, l) => a + Number(l.cogs), 0)
  const catSum = (c: string) => rows.filter((r) => r.direction === 'gider' && r.category === c).reduce((a, r) => a + Number(r.amount), 0)
  const commission = catSum('komisyon')
  const shipping = catSum('kargo')
  const ads = catSum('reklam')
  const otherExp = rows.filter((r) => r.direction === 'gider' && !['komisyon', 'kargo', 'reklam', 'mal_alimi'].includes(r.category)).reduce((a, r) => a + Number(r.amount), 0)
  const otherInc = rows.filter((r) => r.direction === 'gelir' && r.source === 'manuel').reduce((a, r) => a + Number(r.amount), 0)
  const profit = revenue - cogs - commission - shipping - ads - otherExp + otherInc

  const months = lastMonths(12)
  const mIn = months.map((m) => (ledger.data ?? []).filter((r) => r.direction === 'gelir' && monthKey(r.tx_date) === m).reduce((a, r) => a + Number(r.amount), 0))
  const mOut = months.map((m) => (ledger.data ?? []).filter((r) => r.direction === 'gider' && monthKey(r.tx_date) === m).reduce((a, r) => a + Number(r.amount), 0))

  const expByCat = useMemo(() => {
    const m = new Map<string, number>()
    rows.filter((r) => r.direction === 'gider').forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount)))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  const pending = (ledger.data ?? []).filter((r) => r.payment_status === 'bekliyor').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const receivable = pending.filter((r) => r.direction === 'gelir')
  const payable = pending.filter((r) => r.direction === 'gider')

  const list = rows.filter(
    (r) => (dir === 'all' || r.direction === dir) && (!q || norm(`${r.counterparty ?? ''} ${r.note ?? ''} ${CATEGORY_LABEL[r.category] ?? r.category}`).includes(norm(q))),
  )

  const markPaid = async (r: LedgerRow) => {
    const table = r.source === 'satis' ? 'sales' : r.source === 'alim' ? 'purchases' : r.source === 'manuel' ? 'transactions' : null
    if (!table) return
    try {
      await write(supabase.from(table).update({ payment_status: 'odendi' }).eq('id', r.ref_id))
      invalidate(...AFTER.money, 'sales', 'purchases')
      toast(r.direction === 'gelir' ? 'Tahsil edildi olarak işaretlendi.' : 'Ödendi olarak işaretlendi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const remove = async (t: Transaction) => {
    if (!(await confirm('Kayıt silinsin mi?'))) return
    try {
      await write(supabase.from('transactions').delete().eq('id', t.id))
      invalidate(...AFTER.money)
      toast('Kayıt silindi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Finans"
        subtitle="Satış, alım, kargo, komisyon ve reklam kendiliğinden deftere düşer. Kira, ambalaj gibi diğer kalemleri elle ekleyin."
        actions={
          <Button variant="gold" icon={<Wallet className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Gelir / gider ekle
          </Button>
        }
      />
      <ErrorNote message={ledger.error} />
      <div className="mb-4">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { id: 'ay', label: 'Bu ay' },
            { id: '3ay', label: 'Son 3 ay' },
            { id: 'yil', label: 'Bu yıl' },
            { id: '12ay', label: 'Son 12 ay' },
            { id: 'tumu', label: 'Tümü' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Net kâr" value={tl(profit)} sub={revenue ? `ciro üzerinden %${Math.round((profit / revenue) * 100)}` : 'satış yok'} />
        <Stat label="Ciro" value={tl(revenue)} sub={`satılan malın maliyeti ${tl(cogs)}`} />
        <Stat label="Kasaya giren" value={tl(inc)} icon={<ArrowDownLeft className="h-4 w-4" />} />
        <Stat label="Kasadan çıkan" value={tl(exp)} sub={`nakit akışı ${tl(inc - exp)}`} icon={<ArrowUpRight className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card
          title="Aylık giren / çıkan"
          action={
            <Legend
              items={[
                { label: 'Giren', color: SERIES[0] },
                { label: 'Çıkan', color: SERIES[1] },
                { label: 'Fark', color: '#0E1527', dashed: true },
              ]}
            />
          }
        >
          {ledger.loading ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <BarChart
              labels={months.map((m) => monthLabel(m))}
              tooltipLabels={months.map((m) => monthLabel(m, true))}
              series={[
                { id: 'in', label: 'Giren', color: SERIES[0], values: mIn },
                { id: 'out', label: 'Çıkan', color: SERIES[1], values: mOut },
              ]}
              line={{ id: 'net', label: 'Fark', color: '#0E1527', values: mIn.map((v, i) => v - mOut[i]), dashed: true }}
              format={(v) => tl(v)}
            />
          )}
        </Card>
        <Card title="Ciro nereye gidiyor?">
          {lines.loading ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <Waterfall
              steps={[
                { label: 'Ciro', value: revenue, kind: 'start' },
                { label: 'Maliyet', value: cogs, kind: 'minus' },
                { label: 'Komisyon', value: commission, kind: 'minus' },
                { label: 'Kargo', value: shipping, kind: 'minus' },
                { label: 'Reklam', value: ads, kind: 'minus' },
                { label: 'Diğer', value: otherExp - otherInc, kind: otherExp - otherInc >= 0 ? 'minus' : 'plus' },
                { label: 'Net kâr', value: 0, kind: 'total' },
              ]}
              format={(v) => tl(v)}
            />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Giderler, kalem kalem">
          <HBars rows={expByCat.map(([c, v]) => ({ id: c, label: CATEGORY_LABEL[c] ?? c, value: v, color: SERIES[1] }))} format={(v) => tl(v)} />
        </Card>
        <Card title="Ciro, marka bazında">
          <ShareBar parts={BRANDS.map((b) => ({ id: b.id, label: b.label, color: b.color, value: sl.filter((l) => l.brand === b.id).reduce((a, l) => a + Number(l.revenue), 0) }))} format={(v) => tl(v)} />
        </Card>
        <Card title="Ciro, kanal bazında">
          <ShareBar parts={CHANNELS.map((c) => ({ id: c.id, label: c.label, color: c.color, value: sl.filter((l) => l.channel === c.id).reduce((a, l) => a + Number(l.revenue), 0) }))} format={(v) => tl(v)} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PendingList title="Alacaklar" tone="gelir" rows={receivable} onPaid={markPaid} />
        <PendingList title="Borçlar" tone="gider" rows={payable} onPaid={markPaid} />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-bold text-ink">Defter</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={dir} onChange={setDir} size="sm" options={[{ id: 'all', label: 'Hepsi' }, { id: 'gelir', label: 'Giren' }, { id: 'gider', label: 'Çıkan' }]} />
            <SearchBox value={q} onChange={setQ} placeholder="Kişi, firma, not…" />
          </div>
        </div>
        <div className="pt-3">
          {ledger.loading ? (
            <Skeleton className="m-5 h-40" />
          ) : list.length === 0 ? (
            <div className="p-5">
              <Empty title="Bu dönemde kayıt yok" />
            </div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Tarih</th>
                  <th>Kalem</th>
                  <th>Kim / nereden</th>
                  <th>Marka</th>
                  <th className="text-right">Tutar</th>
                  <th>Durum</th>
                  <th />
                </tr>
              }
            >
              {list.slice(0, page.n).map((r, idx) => {
                const tx = r.source === 'manuel' ? txs.data?.find((t) => t.id === r.ref_id) : null
                return (
                  <tr key={`${r.source}-${r.ref_id}-${r.category}-${idx}`}>
                    <td className="whitespace-nowrap text-ink-soft">{dateTR(r.tx_date)}</td>
                    <td>
                      <p className="font-semibold text-ink">{CATEGORY_LABEL[r.category] ?? r.category}</p>
                      <p className="text-xs text-ink-soft/50">
                        {SOURCE[r.source]}
                        {r.channel ? ` · ${label(CHANNELS, r.channel)}` : ''}
                      </p>
                    </td>
                    <td className="max-w-[220px] truncate text-ink-soft">{r.counterparty || r.note || '—'}</td>
                    <td>
                      <Badge color={colorOf(BRANDS_WITH_GENEL, r.brand)}>{label(BRANDS_WITH_GENEL, r.brand)}</Badge>
                    </td>
                    <td className={cx('whitespace-nowrap text-right font-bold tabular-nums', r.direction === 'gelir' ? 'text-[#0a6e0a]' : 'text-ink')}>
                      {r.direction === 'gelir' ? '+' : '−'}
                      {tl(r.amount, true)}
                    </td>
                    <td>{r.payment_status === 'bekliyor' ? <StatusPill tone="warning">Bekliyor</StatusPill> : <StatusPill tone="good">Tamam</StatusPill>}</td>
                    <td className="whitespace-nowrap text-right">
                      {tx ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(tx)} aria-label="Düzenle">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(tx)} aria-label="Sil">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        SOURCE_HREF[r.source] && (
                          <Link href={SOURCE_HREF[r.source]} className="text-xs font-semibold text-ink-soft/60 hover:text-ink">
                            Kaynağa git →
                          </Link>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
          <ShowMore shown={Math.min(page.n, list.length)} total={list.length} onMore={page.more} />
        </div>
      </Card>

      {editing && <TxForm tx={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function PendingList({ title, tone, rows, onPaid }: { title: string; tone: 'gelir' | 'gider'; rows: LedgerRow[]; onPaid: (r: LedgerRow) => void }) {
  const total = rows.reduce((a, r) => a + Number(r.amount), 0)
  const t = today()
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {title}
          <span className="text-sm font-normal text-ink-soft/60">{tl(total)}</span>
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft/50">{tone === 'gelir' ? 'Bekleyen tahsilat yok' : 'Bekleyen ödeme yok'}</p>
      ) : (
        <ul className="divide-y divide-black/[0.05]">
          {rows.slice(0, 8).map((r, i) => {
            const overdue = r.due_date && r.due_date < t
            const soon = r.due_date && !overdue && daysBetween(t, r.due_date) <= 7
            return (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.counterparty || CATEGORY_LABEL[r.category] || r.category}</p>
                  <p className="text-xs text-ink-soft/60">
                    {CATEGORY_LABEL[r.category] ?? r.category} · {r.due_date ? `vade ${dateTR(r.due_date)}` : 'vade yok'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {overdue ? <StatusPill tone="critical">Gecikti</StatusPill> : soon ? <StatusPill tone="warning">Bu hafta</StatusPill> : null}
                  <span className="font-bold tabular-nums">{tl(r.amount)}</span>
                  {r.source !== 'sevkiyat' && r.source !== 'reklam' && (
                    <button onClick={() => onPaid(r)} className="rounded-lg p-1.5 text-ink-soft/40 hover:bg-[#0ca30c]/10 hover:text-[#0a7d0a]" title={tone === 'gelir' ? 'Tahsil edildi' : 'Ödendi'}>
                      <CheckCircle2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function TxForm({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const { toast } = useUi()
  const [f, setF] = useState({
    tx_date: tx?.tx_date ?? today(),
    direction: tx?.direction ?? 'gider',
    category: tx?.category ?? 'ambalaj',
    amount: tx ? String(tx.amount) : '',
    brand: (tx?.brand ?? 'genel') as BrandOrGenel,
    counterparty: tx?.counterparty ?? '',
    payment_status: tx?.payment_status ?? 'odendi',
    due_date: tx?.due_date ?? addDays(today(), 30),
    note: tx?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const cats = f.direction === 'gelir' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES.filter((c) => c.id !== 'mal_alimi' || f.category === 'mal_alimi')
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!(Number(f.amount) > 0)) return toast('Tutar girin.', 'error')
    setBusy(true)
    const row = {
      ...f,
      amount: Number(f.amount),
      counterparty: f.counterparty || null,
      note: f.note || null,
      due_date: f.payment_status === 'bekliyor' ? f.due_date || null : null,
    }
    try {
      await write(tx ? supabase.from('transactions').update(row).eq('id', tx.id) : supabase.from('transactions').insert(row))
      invalidate(...AFTER.money)
      toast('Kaydedildi.')
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
      title={tx ? 'Kaydı düzenle' : 'Gelir / gider ekle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="tx-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={save} className="space-y-4">
        <Segmented
          value={f.direction}
          onChange={(d) => set({ direction: d, category: d === 'gelir' ? 'diger_gelir' : 'ambalaj' })}
          options={[
            { id: 'gider', label: '− Gider' },
            { id: 'gelir', label: '+ Gelir' },
          ]}
        />
        <p className="text-xs text-ink-soft/60">Satış, mal alımı ve reklam harcamaları kendi sayfalarından girilince buraya otomatik gelir; burada tekrar girmeyin.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kalem">
            <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tutar (₺)">
            <Input type="number" min="0.01" step="any" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Tarih">
            <Input type="date" required value={f.tx_date} onChange={(e) => set({ tx_date: e.target.value })} />
          </Field>
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as BrandOrGenel })}>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={f.direction === 'gelir' ? 'Kimden' : 'Kime'}>
          <Input value={f.counterparty} onChange={(e) => set({ counterparty: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durum">
            <Select value={f.payment_status} onChange={(e) => set({ payment_status: e.target.value as any })}>
              <option value="odendi">{f.direction === 'gelir' ? 'Tahsil edildi' : 'Ödendi'}</option>
              <option value="bekliyor">{f.direction === 'gelir' ? 'Alacak (bekliyor)' : 'Borç (ödenecek)'}</option>
            </Select>
          </Field>
          {f.payment_status === 'bekliyor' && (
            <Field label="Vade">
              <Input type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Not">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
