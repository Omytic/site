'use client'

import { useMemo, useState } from 'react'
import { History, Minus, Pencil, Plus } from 'lucide-react'
import { useAuth } from '@/lib/panel/auth'
import { TABLE_LABELS } from '@/lib/panel/constants'
import { Q, type AuditRow } from '@/lib/panel/data'
import { addDays, dateTR, today } from '@/lib/panel/format'
import { changes, fmtValue, summarize, VERB } from '@/components/panel/audit'
import { HBars } from '@/components/panel/charts'
import { Card, cx, Empty, ErrorNote, PageHeader, Segmented, Select, Skeleton } from '@/components/panel/ui'

const ICON = { INSERT: Plus, UPDATE: Pencil, DELETE: Minus }
const TONE = { INSERT: 'bg-[#0ca30c]/12 text-[#0a6e0a]', UPDATE: 'bg-[#2a78d6]/12 text-[#1c5cab]', DELETE: 'bg-[#d03b3b]/12 text-[#a32a2a]' }

export default function HistoryPage() {
  const [limit, setLimit] = useState(300)
  const audit = Q.audit(limit)
  const items = Q.items()
  const { profiles, byId } = useAuth()
  const [user, setUser] = useState('all')
  const [table, setTable] = useState('all')
  const [action, setAction] = useState<'all' | AuditRow['action']>('all')
  const ctx = { items: items.data ?? [], profiles }

  // Satır tabloları (sale_items vb.) üst kayıtla birlikte değiştiği için varsayılan olarak gizli
  const list = useMemo(
    () =>
      (audit.data ?? []).filter(
        (r) =>
          (user === 'all' || r.user_id === user) &&
          (action === 'all' || r.action === action) &&
          (table === 'all' ? !r.table_name.endsWith('_items') : r.table_name === table),
      ),
    [audit.data, user, table, action],
  )
  const groups = useMemo(() => {
    const m = new Map<string, AuditRow[]>()
    list.forEach((r) => {
      const d = r.at.slice(0, 10)
      m.set(d, [...(m.get(d) ?? []), r])
    })
    return Array.from(m.entries())
  }, [list])

  const last30 = (audit.data ?? []).filter((r) => r.at.slice(0, 10) >= addDays(today(), -30))

  return (
    <>
      <PageHeader title="Düzenleme geçmişi" subtitle="Panelde yapılan her ekleme, düzenleme ve silme, kimin yaptığıyla birlikte burada." />
      <ErrorNote message={audit.error} />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={user} onChange={setUser} options={[{ id: 'all', label: 'Herkes' }, ...profiles.map((p) => ({ id: p.id, label: p.full_name }))]} />
            <Segmented
              value={action}
              onChange={setAction}
              size="sm"
              options={[
                { id: 'all', label: 'Hepsi' },
                { id: 'INSERT', label: 'Ekleme' },
                { id: 'UPDATE', label: 'Düzenleme' },
                { id: 'DELETE', label: 'Silme' },
              ]}
            />
            <div className="w-52">
            <Select value={table} onChange={(e) => setTable(e.target.value)} className="h-9 text-sm">
              <option value="all">Tüm kayıtlar</option>
              {Object.entries(TABLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            </div>
          </div>

          {audit.loading ? (
            <Skeleton className="h-64" />
          ) : groups.length === 0 ? (
            <Empty icon={<History className="h-5 w-5" />} title="Kayıt yok" text="Panelde bir şey eklendikçe ya da değiştikçe burada görünür." />
          ) : (
            <div className="space-y-6">
              {groups.map(([day, rows]) => (
                <section key={day}>
                  <p className="mb-2 text-sm font-bold text-ink-soft">{day === today() ? 'Bugün' : day === addDays(today(), -1) ? 'Dün' : dateTR(day)}</p>
                  <Card pad={false}>
                    <ul className="divide-y divide-black/[0.05]">
                      {rows.map((r) => {
                        const u = byId(r.user_id)
                        const Icon = ICON[r.action]
                        const diff = changes(r)
                        return (
                          <li key={r.id} className="flex gap-3 px-5 py-3.5">
                            <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE[r.action])}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-ink">
                                <b style={{ color: u ? undefined : '#7A8090' }}>{u?.full_name ?? (['sales', 'sale_items'].includes(r.table_name) ? 'Otomatik senkron' : 'Sistem')}</b> {(TABLE_LABELS[r.table_name] ?? r.table_name).toLocaleLowerCase('tr-TR')} {VERB[r.action]}:{' '}
                                <span className="font-semibold">{summarize(r, ctx)}</span>
                              </p>
                              {diff.length > 0 && (
                                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                  {diff.slice(0, 6).map((c) => (
                                    <li key={c.key} className="rounded-lg bg-[#F4F3EF] px-2 py-1 text-xs text-ink-soft">
                                      <b className="text-ink">{c.label}:</b> <s className="opacity-60">{fmtValue(c.key, c.from, ctx)}</s> → {fmtValue(c.key, c.to, ctx)}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <time className="shrink-0 text-xs text-ink-soft/50" dateTime={r.at}>
                              {new Date(r.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                </section>
              ))}
              {(audit.data?.length ?? 0) >= limit && (
                <button onClick={() => setLimit(limit + 500)} className="w-full rounded-xl py-3 text-sm font-semibold text-ink-soft hover:bg-black/5">
                  Daha eski kayıtları yükle
                </button>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Son 30 günde kim ne kadar işlem yaptı?">
            <HBars rows={profiles.map((p) => ({ id: p.id, label: p.full_name, value: last30.filter((r) => r.user_id === p.id).length, color: p.color }))} format={(v) => `${v} işlem`} />
          </Card>
        </div>
      </div>
    </>
  )
}
