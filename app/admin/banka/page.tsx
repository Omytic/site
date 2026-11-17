'use client'

import { useMemo, useState } from 'react'
import { ClipboardPaste, EyeOff, Landmark, Link2, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_LABEL, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/panel/constants'
import { AFTER, invalidate, must, Q, useQuery, write } from '@/lib/panel/data'
import { dateTR, num, relTime, sum, tl } from '@/lib/panel/format'
import { Button, Card, cx, Drawer, Empty, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat, StatusPill, Table, Textarea, useUi } from '@/components/panel/ui'

interface Account { id: string; bank: string; name: string; iban: string | null; currency: string; balance: number | null; balance_at: string | null }
interface BankTx { id: string; account_id: string; tx_at: string; amount: number; balance: number | null; description: string | null; channel: string | null; source: string; transaction_id: string | null; ignored: boolean; note: string | null }

/* ---------------- Ekstre çözümleme (internet şubesinden kopyala-yapıştır ya da CSV) ---------------- */

const trNum = (s: string) => {
  const t = s.replace(/[^\d,.\-+]/g, '')
  if (!t) return NaN
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.')
  const norm = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  return Number(norm)
}
const trDate = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '12').padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}+03:00`
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? '12'}:${iso[5] ?? '00'}:00+03:00`
  return null
}
interface Parsed { tx_at: string; amount: number; balance: number | null; description: string }
function parseStatement(text: string): { rows: Parsed[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim())
  if (!lines.length) return { rows: [] }
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines[0].includes(';') ? ';' : ','
  const cells = lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()))
  const hi = cells.findIndex((r) => r.some((c) => /tarih/i.test(c)) && r.some((c) => /tutar|borç|borc|alacak/i.test(c)))
  if (hi < 0) return { rows: [], error: 'Başlık satırı bulunamadı. İnternet şubesindeki tabloyu başlıklarıyla (Tarih, Açıklama, Tutar, Bakiye) birlikte kopyalayın.' }
  const head = cells[hi].map((c) => c.toLocaleLowerCase('tr'))
  const col = (re: RegExp) => head.findIndex((c) => re.test(c))
  const cDate = col(/işlem tarihi|islem tarihi|^tarih/)
  const cDesc = col(/açıklama|aciklama|işlem açıklaması/)
  const cAmt = col(/tutar/)
  const cDebit = col(/borç|borc|çıkan/)
  const cCredit = col(/alacak|giren/)
  const cBal = col(/bakiye/)
  const rows: Parsed[] = []
  for (const r of cells.slice(hi + 1)) {
    const at = trDate(r[cDate] ?? '')
    if (!at) continue
    let amount = NaN
    if (cAmt >= 0) amount = trNum(r[cAmt] ?? '')
    if ((isNaN(amount) || amount === 0) && (cDebit >= 0 || cCredit >= 0)) {
      const d = cDebit >= 0 ? Math.abs(trNum(r[cDebit] ?? '') || 0) : 0
      const c = cCredit >= 0 ? Math.abs(trNum(r[cCredit] ?? '') || 0) : 0
      amount = c - d
    }
    if (isNaN(amount) || amount === 0) continue
    const bal = cBal >= 0 ? trNum(r[cBal] ?? '') : NaN
    rows.push({ tx_at: new Date(at).toISOString(), amount: Math.round(amount * 100) / 100, balance: isNaN(bal) ? null : bal, description: (cDesc >= 0 ? r[cDesc] : '') ?? '' })
  }
  return { rows }
}
async function hashOf(r: Parsed) {
  const s = `${r.tx_at}|${r.amount.toFixed(2)}|${r.description.trim().toLocaleLowerCase('tr')}|${r.balance == null ? '' : r.balance.toFixed(2)}`
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export default function BankPage() {
  const { toast } = useUi()
  const accounts = useQuery('bank_accounts', () => must<Account[]>(supabase.from('bank_accounts').select('*').order('id')))
  const txs = useQuery('bank_transactions', () => must<BankTx[]>(supabase.from('bank_transactions').select('*').order('tx_at', { ascending: false }).limit(2000)))
  const ledger = Q.transactions()
  const [filter, setFilter] = useState<'acik' | 'hepsi'>('acik')
  const [paste, setPaste] = useState(false)
  const [book, setBook] = useState<BankTx | null>(null)
  const [busy, setBusy] = useState(false)

  const acc = (accounts.data ?? [])[0]
  const list = (txs.data ?? []).filter((t) => filter === 'hepsi' || (!t.transaction_id && !t.ignored))
  const month = new Date().toISOString().slice(0, 7)
  const thisMonth = (txs.data ?? []).filter((t) => t.tx_at.slice(0, 7) === month)
  const open = (txs.data ?? []).filter((t) => !t.transaction_id && !t.ignored)

  /** Aynı tutar (±1 ₺), ±4 gün içinde, henüz bankaya bağlanmamış Finans kaydı */
  const linkedIds = new Set((txs.data ?? []).map((t) => t.transaction_id).filter(Boolean))
  const suggest = (t: BankTx) =>
    (ledger.data ?? []).find(
      (l) =>
        !linkedIds.has(l.id) &&
        Math.abs(Number(l.amount) - Math.abs(Number(t.amount))) <= 1 &&
        (l.direction === 'gider') === Number(t.amount) < 0 &&
        Math.abs(new Date(l.tx_date).getTime() - new Date(t.tx_at).getTime()) <= 4 * 86_400_000,
    )

  const syncNow = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/sync/banka', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b.ok === false) throw new Error(b.message ?? 'Banka güncellenemedi')
      toast(`${num(b.imported ?? 0)} hareket alındı.`)
      invalidate('bank_transactions', 'bank_accounts')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const link = async (t: BankTx, txId: string) => {
    try {
      await write(supabase.from('bank_transactions').update({ transaction_id: txId }).eq('id', t.id))
      invalidate('bank_transactions')
      toast('Finans kaydına bağlandı.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const ignore = async (t: BankTx) => {
    try {
      await write(supabase.from('bank_transactions').update({ ignored: !t.ignored }).eq('id', t.id))
      invalidate('bank_transactions')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Banka"
        subtitle="Ziraat Katılım hesap hareketleri. Banka API erişimi açılınca her gün kendiliğinden gelir; o zamana kadar internet şubesinden kopyalayıp yapıştırın. Her hareketi Finans’taki bir kayda bağlayın ya da oradan gelir/gider yazın."
        actions={
          <>
            <Button variant="ghost" onClick={syncNow} loading={busy} icon={<RefreshCw className="h-4 w-4" />}>
              Bankadan çek
            </Button>
            <Button onClick={() => setPaste(true)} icon={<ClipboardPaste className="h-4 w-4" />}>
              Ekstre yapıştır
            </Button>
          </>
        }
      />
      {accounts.loading || txs.loading ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={acc?.name ?? 'Hesap'} value={acc?.balance != null ? tl(acc.balance) : '—'} sub={acc?.balance_at ? `bakiye · ${relTime(acc.balance_at)}` : 'bakiye ilk aktarımla gelir'} tone="dark" icon={<Landmark className="h-4 w-4" />} />
            <Stat label="Bu ay giren" value={tl(sum(thisMonth.filter((t) => t.amount > 0), (t) => t.amount))} />
            <Stat label="Bu ay çıkan" value={tl(-sum(thisMonth.filter((t) => t.amount < 0), (t) => t.amount))} />
            <Stat label="Bağlanmamış hareket" value={num(open.length)} sub={open.length ? 'Finans’a işlenmemiş' : 'hepsi işlenmiş'} />
          </div>

          <div className="mb-3 mt-6 flex items-center justify-between gap-3">
            <Segmented value={filter} onChange={setFilter} options={[{ id: 'acik', label: `Bağlanmamış (${open.length})` }, { id: 'hepsi', label: 'Hepsi' }]} />
          </div>
          <Card pad={false}>
            {!list.length ? (
              <Empty title={filter === 'acik' ? 'Bağlanmamış hareket yok' : 'Henüz hareket yok'} text="İnternet şubesinde Hesap Hareketleri tablosunu seçip kopyalayın, “Ekstre yapıştır”a yapıştırın." />
            ) : (
              <Table
                head={
                  <tr>
                    <th>Tarih</th>
                    <th>Açıklama</th>
                    <th className="text-right">Tutar</th>
                    <th className="text-right">Bakiye</th>
                    <th>Finans</th>
                    <th></th>
                  </tr>
                }
              >
                {list.map((t) => {
                  const s = !t.transaction_id && !t.ignored ? suggest(t) : undefined
                  const linked = t.transaction_id ? (ledger.data ?? []).find((l) => l.id === t.transaction_id) : undefined
                  return (
                    <tr key={t.id} className={cx(t.ignored && 'opacity-50')}>
                      <td className="whitespace-nowrap">{dateTR(t.tx_at.slice(0, 10))}</td>
                      <td className="max-w-[360px]">
                        <span className="line-clamp-2 text-sm">{t.description || '—'}</span>
                        {t.channel && <span className="text-xs text-ink-soft/55">{t.channel}</span>}
                      </td>
                      <td className={cx('whitespace-nowrap text-right font-bold tabular-nums', t.amount < 0 ? 'text-[#b83030]' : 'text-[#0a7d0a]')}>{t.amount > 0 ? '+' : ''}{tl(t.amount)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums text-ink-soft/70">{t.balance != null ? tl(t.balance) : '—'}</td>
                      <td>
                        {linked ? (
                          <StatusPill tone="good">{CATEGORY_LABEL[linked.category] ?? linked.category}</StatusPill>
                        ) : t.ignored ? (
                          <StatusPill tone="neutral">yok sayıldı</StatusPill>
                        ) : s ? (
                          <button onClick={() => link(t, s.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#EAF3FF] px-2 py-1 text-xs font-semibold text-[#1d5fb0] hover:bg-[#dbeaff]">
                            <Link2 className="h-3.5 w-3.5" /> {CATEGORY_LABEL[s.category] ?? s.category} · {dateTR(s.tx_date)} ile eşleştir
                          </button>
                        ) : (
                          <span className="text-xs text-ink-soft/50">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {!t.transaction_id && !t.ignored && (
                          <Button size="sm" variant="ghost" onClick={() => setBook(t)} icon={<Plus className="h-3.5 w-3.5" />}>
                            {t.amount < 0 ? 'Gider yaz' : 'Gelir yaz'}
                          </Button>
                        )}
                        {!t.transaction_id && (
                          <button onClick={() => ignore(t)} title={t.ignored ? 'Geri al' : 'Yok say (kendi hesaplar arası, iade vb.)'} className="ml-1 rounded-lg p-1.5 text-ink-soft/50 hover:bg-black/5 hover:text-ink">
                            <EyeOff className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </Card>
        </>
      )}
      <PasteDrawer open={paste} onClose={() => setPaste(false)} accountId={acc?.id ?? 'ziraat-katilim-tl'} />
      <BookDrawer t={book} onClose={() => setBook(null)} />
    </>
  )
}

function PasteDrawer({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const { toast } = useUi()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseStatement(text), [text])
  const save = async () => {
    if (!parsed.rows.length) return
    setBusy(true)
    try {
      const rows = await Promise.all(parsed.rows.map(async (r) => ({ account_id: accountId, ...r, hash: await hashOf(r), source: 'ekstre' })))
      const { error, count } = await supabase.from('bank_transactions').upsert(rows, { onConflict: 'account_id,hash', ignoreDuplicates: true, count: 'exact' })
      if (error) throw new Error(error.message)
      const latest = parsed.rows.reduce((a, r) => (r.tx_at > a.tx_at ? r : a))
      if (latest.balance != null) await supabase.from('bank_accounts').update({ balance: latest.balance, balance_at: latest.tx_at }).eq('id', accountId)
      toast(`${num(count ?? rows.length)} yeni hareket eklendi${count != null && count < rows.length ? `, ${rows.length - count} tanesi zaten vardı` : ''}.`)
      invalidate('bank_transactions', 'bank_accounts')
      setText('')
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ekstre yapıştır"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy} disabled={!parsed.rows.length}>
            {parsed.rows.length ? `${num(parsed.rows.length)} hareketi ekle` : 'Ekle'}
          </Button>
        </div>
      }
    >
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>Ziraat Katılım internet şubesi → Hesaplar → Hesap Hareketleri; tarih aralığını seçin.</li>
        <li>Tabloyu başlık satırıyla birlikte seçip kopyalayın (ya da Excel’e aktarıp oradan kopyalayın).</li>
        <li>Buraya yapıştırın. Aynı hareket ikinci kez eklenmez.</li>
      </ol>
      <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Tarih\tAçıklama\tTutar\tBakiye\n17.11.2026 10:42\tGelen EFT Trendyol\t12.450,00\t84.210,55'} className="font-mono text-xs" />
      {parsed.error && <p className="mt-2 text-sm font-semibold text-[#b83030]">{parsed.error}</p>}
      {parsed.rows.length > 0 && (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
          <p className="mb-2 text-sm">
            <b>{num(parsed.rows.length)} hareket</b> okundu · giren {tl(sum(parsed.rows.filter((r) => r.amount > 0), (r) => r.amount))} · çıkan {tl(-sum(parsed.rows.filter((r) => r.amount < 0), (r) => r.amount))}
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {parsed.rows.slice(0, 30).map((r, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">
                  {dateTR(r.tx_at.slice(0, 10))} · {r.description}
                </span>
                <b className={r.amount < 0 ? 'text-[#b83030]' : 'text-[#0a7d0a]'}>{tl(r.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  )
}

function BookDrawer({ t, onClose }: { t: BankTx | null; onClose: () => void }) {
  const { toast } = useUi()
  const out = (t?.amount ?? 0) < 0
  const [category, setCategory] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = out ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  const save = async () => {
    if (!t) return
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          tx_date: t.tx_at.slice(0, 10),
          direction: out ? 'gider' : 'gelir',
          category: category || cats[cats.length - 1].id,
          amount: Math.abs(Number(t.amount)),
          brand: 'genel',
          counterparty: counterparty || null,
          payment_status: 'odendi',
          note: `Banka: ${t.description ?? ''}`.slice(0, 300),
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      await write(supabase.from('bank_transactions').update({ transaction_id: data.id }).eq('id', t.id))
      invalidate('bank_transactions', ...AFTER.money)
      toast(out ? 'Gider yazıldı.' : 'Gelir yazıldı.')
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open={!!t}
      onClose={onClose}
      title={out ? 'Gider olarak yaz' : 'Gelir olarak yaz'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy}>
            Kaydet
          </Button>
        </div>
      }
    >
      {t && (
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <p className={cx('font-display text-2xl font-black', out ? 'text-[#b83030]' : 'text-[#0a7d0a]')}>{tl(Math.abs(t.amount))}</p>
            <p className="text-sm text-ink-soft">
              {dateTR(t.tx_at.slice(0, 10))} · {t.description}
            </p>
          </div>
          <Field label="Kalem">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Seçin…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={out ? 'Kime ödendi' : 'Kimden geldi'}>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Firma ya da kişi" />
          </Field>
        </div>
      )}
    </Drawer>
  )
}
