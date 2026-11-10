'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Megaphone, Pencil, Target, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { AD_PLATFORMS, BRANDS_WITH_GENEL, colorOf, label, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, write, type AdBudget, type AdSpend } from '@/lib/panel/data'
import { dateTR, lastMonths, monthKey, monthLabel, num, tl, today } from '@/lib/panel/format'
import { BarChart, Legend, Meter } from '@/components/panel/charts'
import { useOpenFromQuery } from '@/components/panel/forms'
import { Badge, Button, Card, Drawer, Empty, ErrorNote, Field, Input, PageHeader, Select, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useUi } from '@/components/panel/ui'

const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AdsPage() {
  const budgets = Q.adBudgets()
  const spend = Q.adSpend()
  const lines = Q.saleLines()
  const { byId } = useAuth()
  const { toast, confirm } = useUi()
  const [month, setMonth] = useState(monthKey(today()))
  const [spendForm, setSpendForm] = useState<AdSpend | 'new' | null>(null)
  const [budgetForm, setBudgetForm] = useState<AdBudget | 'new' | null>(null)
  useOpenFromQuery(() => setSpendForm('new'))

  const mSpend = (spend.data ?? []).filter((s) => monthKey(s.spend_date) === month)
  const mBudgets = (budgets.data ?? []).filter((b) => monthKey(b.month) === month)
  const totalBudget = mBudgets.reduce((a, b) => a + Number(b.budget), 0)
  const totalSpend = mSpend.reduce((a, s) => a + Number(s.amount), 0)
  const revenue = (lines.data ?? []).filter((l) => l.status === 'tamamlandi' && monthKey(l.sale_date) === month).reduce((a, l) => a + Number(l.revenue), 0)

  // Bütçe kartları: bütçesi olan ya da harcaması olan her platform × marka
  const pairs = useMemo(() => {
    const keys = new Set<string>()
    mBudgets.forEach((b) => keys.add(`${b.platform}|${b.brand}`))
    mSpend.forEach((s) => keys.add(`${s.platform}|${s.brand}`))
    return Array.from(keys).map((k) => {
      const [platform, brand] = k.split('|')
      const b = mBudgets.find((x) => x.platform === platform && x.brand === brand)
      const used = mSpend.filter((s) => s.platform === platform && s.brand === brand).reduce((a, s) => a + Number(s.amount), 0)
      return { platform, brand: brand as BrandOrGenel, budget: b, used }
    }).sort((a, b) => b.used - a.used)
  }, [mBudgets, mSpend])

  const months = lastMonths(12)
  const series = AD_PLATFORMS.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    values: months.map((m) => (spend.data ?? []).filter((s) => s.platform === p.id && monthKey(s.spend_date) === m).reduce((a, s) => a + Number(s.amount), 0)),
  })).filter((s) => s.values.some((v) => v > 0))

  const removeSpend = async (s: AdSpend) => {
    if (!(await confirm('Harcama silinsin mi?'))) return
    try {
      await write(supabase.from('ad_spend').delete().eq('id', s.id))
      invalidate(...AFTER.ads)
      toast('Silindi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Reklam"
        subtitle="Aylık bütçe ve harcamalar. Harcamalar finans defterine otomatik gider olarak düşer."
        actions={
          <>
            <Button variant="secondary" icon={<Target className="h-4 w-4" />} onClick={() => setBudgetForm('new')}>
              Bütçe belirle
            </Button>
            <Button variant="gold" icon={<Megaphone className="h-4 w-4" />} onClick={() => setSpendForm('new')}>
              Harcama ekle
            </Button>
          </>
        }
      />
      <ErrorNote message={spend.error || budgets.error} />

      <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-line">
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Önceki ay">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[120px] text-center font-bold">{monthLabel(month, true)}</span>
        <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Sonraki ay">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Harcanan" value={tl(totalSpend)} sub={totalBudget ? `bütçenin %${Math.round((totalSpend / totalBudget) * 100)}'i` : 'bütçe belirlenmedi'} />
        <Stat label="Bütçe" value={tl(totalBudget)} sub={`kalan ${tl(Math.max(0, totalBudget - totalSpend))}`} />
        <Stat label="Bu ayki ciro" value={tl(revenue)} />
        <Stat label="Reklama 1 ₺ başına ciro" value={totalSpend ? `${num(Math.round((revenue / totalSpend) * 10) / 10)} ₺` : '—'} sub="tüm kanallar dahil, kaba gösterge" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Card title="Bütçe doluluğu" action={<span className="text-xs text-ink-soft/60">{monthLabel(month, true)}</span>}>
          {pairs.length === 0 ? (
            <Empty title="Bu ay bütçe ya da harcama yok" text="Platform ve marka bazında aylık bütçe belirleyin; harcadıkça burada dolar." action={<Button onClick={() => setBudgetForm('new')}>Bütçe belirle</Button>} />
          ) : (
            <ul className="space-y-4">
              {pairs.map((p) => {
                const b = Number(p.budget?.budget ?? 0)
                const r = b ? p.used / b : 0
                return (
                  <li key={`${p.platform}-${p.brand}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: colorOf(AD_PLATFORMS, p.platform) }} />
                        <span className="truncate text-sm font-semibold">{label(AD_PLATFORMS, p.platform)}</span>
                        <Badge color={colorOf(BRANDS_WITH_GENEL, p.brand)}>{label(BRANDS_WITH_GENEL, p.brand)}</Badge>
                      </div>
                      <button onClick={() => setBudgetForm(p.budget ?? 'new')} className="shrink-0 text-sm tabular-nums text-ink-soft hover:text-ink" title="Bütçeyi düzenle">
                        <b className="text-ink">{tl(p.used)}</b> / {b ? tl(b) : 'bütçe yok'}
                      </button>
                    </div>
                    {b ? <Meter value={p.used} max={b} color={colorOf(AD_PLATFORMS, p.platform)} /> : <div className="h-2.5 rounded-full bg-black/[0.04]" />}
                    {r > 1 ? (
                      <p className="mt-1"><StatusPill tone="critical">Bütçe {tl(p.used - b)} aşıldı</StatusPill></p>
                    ) : r >= 0.9 ? (
                      <p className="mt-1"><StatusPill tone="warning">Bütçenin %{Math.round(r * 100)}'i harcandı</StatusPill></p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card title="Aylık reklam harcaması" action={<Legend items={series} />}>
          {spend.loading ? <Skeleton className="h-[260px]" /> : <BarChart labels={months.map((m) => monthLabel(m))} tooltipLabels={months.map((m) => monthLabel(m, true))} series={series} stacked format={(v) => tl(v)} />}
        </Card>
      </div>

      <Card className="mt-4" title="Harcamalar" pad={false}>
        <div className="pt-3">
          {mSpend.length === 0 ? (
            <div className="p-5">
              <Empty title={`${monthLabel(month, true)} için harcama yok`} action={<Button onClick={() => setSpendForm('new')}>Harcama ekle</Button>} />
            </div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Tarih</th>
                  <th>Platform</th>
                  <th>Marka</th>
                  <th>Kampanya</th>
                  <th className="text-right">Tutar</th>
                  <th>Giren</th>
                  <th />
                </tr>
              }
            >
              {mSpend.map((s) => {
                const u = byId(s.created_by)
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap text-ink-soft">{dateTR(s.spend_date)}</td>
                    <td>
                      <Badge color={colorOf(AD_PLATFORMS, s.platform)}>{label(AD_PLATFORMS, s.platform)}</Badge>
                    </td>
                    <td>{label(BRANDS_WITH_GENEL, s.brand)}</td>
                    <td className="max-w-[260px] truncate text-ink-soft">{s.campaign || s.note || '—'}</td>
                    <td className="text-right font-bold tabular-nums">{tl(s.amount, true)}</td>
                    <td>
                      <UserDot name={u?.full_name} color={u?.color} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSpendForm(s)} aria-label="Düzenle">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeSpend(s)} aria-label="Sil">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      {spendForm && <SpendForm spend={spendForm === 'new' ? null : spendForm} onClose={() => setSpendForm(null)} />}
      {budgetForm && <BudgetForm budget={budgetForm === 'new' ? null : budgetForm} month={month} onClose={() => setBudgetForm(null)} />}
    </>
  )
}

function SpendForm({ spend, onClose }: { spend: AdSpend | null; onClose: () => void }) {
  const { toast } = useUi()
  const [f, setF] = useState({
    spend_date: spend?.spend_date ?? today(),
    platform: spend?.platform ?? 'meta',
    brand: (spend?.brand ?? 'seryn') as BrandOrGenel,
    amount: spend ? String(spend.amount) : '',
    campaign: spend?.campaign ?? '',
    note: spend?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const row = { ...f, amount: Number(f.amount), campaign: f.campaign || null, note: f.note || null }
    try {
      await write(spend ? supabase.from('ad_spend').update(row).eq('id', spend.id) : supabase.from('ad_spend').insert(row))
      invalidate(...AFTER.ads)
      toast('Harcama kaydedildi.')
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
      title={spend ? 'Harcamayı düzenle' : 'Reklam harcaması'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="spend-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="spend-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={f.platform} onChange={(e) => set({ platform: e.target.value })}>
              {AD_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
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
          <Field label="Tutar (₺)">
            <Input type="number" min="0.01" step="any" required value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Tarih">
            <Input type="date" required value={f.spend_date} onChange={(e) => set({ spend_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Kampanya">
          <Input value={f.campaign} onChange={(e) => set({ campaign: e.target.value })} placeholder="Ör. Kasım Reels tanıtımı" />
        </Field>
        <Field label="Not">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}

function BudgetForm({ budget, month, onClose }: { budget: AdBudget | null; month: string; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    month: budget ? monthKey(budget.month) : month,
    platform: budget?.platform ?? 'meta',
    brand: (budget?.brand ?? 'seryn') as BrandOrGenel,
    budget: budget ? String(budget.budget) : '',
    note: budget?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const row = { month: `${f.month}-01`, platform: f.platform, brand: f.brand, budget: Number(f.budget) || 0, note: f.note || null }
    try {
      await write(
        budget
          ? supabase.from('ad_budgets').update(row).eq('id', budget.id)
          : supabase.from('ad_budgets').upsert(row, { onConflict: 'month,platform,brand' }),
      )
      invalidate(...AFTER.ads)
      toast('Bütçe kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!budget || !(await confirm('Bütçe silinsin mi?'))) return
    try {
      await write(supabase.from('ad_budgets').delete().eq('id', budget.id))
      invalidate(...AFTER.ads)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title="Aylık reklam bütçesi"
      footer={
        <>
          {budget && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="budget-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ay">
            <Input type="month" required value={f.month} onChange={(e) => set({ month: e.target.value })} />
          </Field>
          <Field label="Bütçe (₺)">
            <Input type="number" min="0" step="any" required value={f.budget} onChange={(e) => set({ budget: e.target.value })} />
          </Field>
          <Field label="Platform">
            <Select value={f.platform} onChange={(e) => set({ platform: e.target.value })}>
              {AD_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
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
        <Field label="Not">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
