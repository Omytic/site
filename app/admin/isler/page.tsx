'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS_WITH_GENEL, colorOf, label, TASK_PRIORITY, TASK_STATUS, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, write, type Task } from '@/lib/panel/data'
import { addDays, daysBetween, dateTR, today } from '@/lib/panel/format'
import { HBars } from '@/components/panel/charts'
import { useOpenFromQuery } from '@/components/panel/forms'
import { Badge, Button, Card, cx, Drawer, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat, StatusPill, Textarea, useUi } from '@/components/panel/ui'

const ORDER = ['yapilacak', 'devam', 'bitti'] as const

export default function TasksPage() {
  const tasks = Q.tasks()
  const { me, profiles, byId } = useAuth()
  const { toast } = useUi()
  const [who, setWho] = useState<string>('all')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [newStatus, setNewStatus] = useState<Task['status']>('yapilacak')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  useOpenFromQuery(() => setEditing('new'))

  const t = today()
  const list = useMemo(() => (tasks.data ?? []).filter((x) => who === 'all' || x.assignee === who), [tasks.data, who])
  const open = (tasks.data ?? []).filter((x) => x.status !== 'bitti')
  const late = open.filter((x) => x.due_date && x.due_date < t)
  const done30 = (tasks.data ?? []).filter((x) => x.status === 'bitti' && x.completed_at && x.completed_at.slice(0, 10) >= addDays(t, -30))

  const move = async (task: Task, status: Task['status']) => {
    if (task.status === status) return
    try {
      await write(supabase.from('tasks').update({ status }).eq('id', task.id))
      invalidate(...AFTER.tasks)
      if (status === 'bitti') toast(`"${task.title}" bitti 🎉`)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="İşler"
        subtitle="Kim ne yapıyor, ne bitti, ne gecikti. Kartları sürükleyerek ya da oklarla taşıyabilirsiniz."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => (setNewStatus('yapilacak'), setEditing('new'))}>
            İş ekle
          </Button>
        }
      />
      <ErrorNote message={tasks.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Açık iş" value={open.length} sub={`${open.filter((x) => x.assignee === me.id).length} tanesi sende`} />
        <Stat label="Geciken" value={late.length} sub={late.length ? 'tarihi geçmiş' : 'gecikme yok'} />
        <Stat label="Son 30 günde biten" value={done30.length} />
        <Stat label="Bu hafta teslim" value={open.filter((x) => x.due_date && x.due_date >= t && daysBetween(t, x.due_date) <= 7).length} />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <Segmented
          value={who}
          onChange={setWho}
          options={[{ id: 'all', label: 'Herkes' }, ...profiles.map((p) => ({ id: p.id, label: p.id === me.id ? `${p.full_name} (ben)` : p.full_name }))]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((col, ci) => {
          const items = list
            .filter((x) => x.status === col)
            .sort((a, b) => {
              if (col === 'bitti') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
              const pr = { yuksek: 0, normal: 1, dusuk: 2 }
              return pr[a.priority] - pr[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
            })
            .slice(0, col === 'bitti' ? 15 : 200)
          return (
            <div
              key={col}
              onDragOver={(e) => (e.preventDefault(), setOver(col))}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                const task = tasks.data?.find((x) => x.id === dragId)
                if (task) move(task, col)
                setDragId(null)
                setOver(null)
              }}
              className={cx('rounded-2xl bg-black/[0.035] p-3 transition-colors', over === col && 'bg-thread/15 ring-2 ring-thread/40')}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="font-bold text-ink">{label(TASK_STATUS, col)}</p>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold ring-1 ring-line">{list.filter((x) => x.status === col).length}</span>
                  {col !== 'bitti' && (
                    <button onClick={() => (setNewStatus(col), setEditing('new'))} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft/60 hover:bg-white hover:text-ink" aria-label="Bu sütuna iş ekle">
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {tasks.loading ? (
                <Skeleton className="h-24" />
              ) : (
                <ul className="min-h-[80px] space-y-2">
                  <AnimatePresence initial={false}>
                    {items.map((task) => {
                      const u = byId(task.assignee)
                      const lateTask = task.status !== 'bitti' && task.due_date && task.due_date < t
                      return (
                        <motion.li
                          layout
                          key={task.id}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          draggable
                          onDragStart={() => setDragId(task.id)}
                          onDragEnd={() => setDragId(null)}
                          className={cx(
                            'group cursor-grab rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-black/[0.05] active:cursor-grabbing',
                            task.status === 'bitti' && 'opacity-70',
                            dragId === task.id && 'opacity-40',
                          )}
                        >
                          <button onClick={() => setEditing(task)} className="block w-full text-left">
                            <p className={cx('font-semibold text-ink', task.status === 'bitti' && 'line-through decoration-ink/30')}>{task.title}</p>
                            {task.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft/70">{task.description}</p>}
                          </button>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {task.priority === 'yuksek' && <StatusPill tone="critical">Acil</StatusPill>}
                            {task.brand && task.brand !== 'genel' && <Badge color={colorOf(BRANDS_WITH_GENEL, task.brand)}>{label(BRANDS_WITH_GENEL, task.brand)}</Badge>}
                            {task.due_date && (
                              <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', lateTask ? 'text-[#b83030]' : 'text-ink-soft/60')}>
                                <CalendarDays className="h-3.5 w-3.5" />
                                {lateTask ? 'Gecikti · ' : ''}
                                {dateTR(task.due_date)}
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-1">
                              {ci > 0 && (
                                <button onClick={() => move(task, ORDER[ci - 1])} className="rounded-md p-1 text-ink-soft/40 opacity-0 transition hover:bg-black/5 hover:text-ink group-hover:opacity-100" aria-label="Geri al">
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                              )}
                              {ci < 2 && (
                                <button onClick={() => move(task, ORDER[ci + 1])} className="rounded-md p-1 text-ink-soft/40 opacity-0 transition hover:bg-black/5 hover:text-ink group-hover:opacity-100" aria-label="İlerlet">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              )}
                              {u ? (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-night" style={{ backgroundColor: u.color }} title={u.full_name}>
                                  {u.full_name.slice(0, 1)}
                                </span>
                              ) : (
                                <span className="text-xs text-ink-soft/40">atanmadı</span>
                              )}
                            </span>
                          </div>
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                  {items.length === 0 && <li className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-sm text-ink-soft/50">Boş</li>}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <Card className="mt-4" title="Son 30 günde kim kaç iş bitirdi?">
        <HBars
          rows={profiles.map((p) => ({ id: p.id, label: p.full_name, value: done30.filter((x) => x.assignee === p.id).length, color: p.color, sub: `${open.filter((x) => x.assignee === p.id).length} açık iş` }))}
          format={(v) => `${v} iş`}
        />
      </Card>

      {editing && <TaskForm task={editing === 'new' ? null : editing} defaultStatus={newStatus} onClose={() => setEditing(null)} />}
    </>
  )
}

function TaskForm({ task, defaultStatus, onClose }: { task: Task | null; defaultStatus: Task['status']; onClose: () => void }) {
  const { me, profiles } = useAuth()
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? 'normal',
    assignee: task?.assignee ?? me.id,
    brand: (task?.brand ?? 'genel') as BrandOrGenel,
    due_date: task?.due_date ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const row = { ...f, title: f.title.trim(), description: f.description || null, assignee: f.assignee || null, due_date: f.due_date || null }
    try {
      await write(task ? supabase.from('tasks').update(row).eq('id', task.id) : supabase.from('tasks').insert(row))
      invalidate(...AFTER.tasks)
      toast('İş kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!task || !(await confirm('İş silinsin mi?'))) return
    try {
      await write(supabase.from('tasks').delete().eq('id', task.id))
      invalidate(...AFTER.tasks)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={task ? 'İşi düzenle' : 'Yeni iş'}
      footer={
        <>
          {task && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="task-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={save} className="space-y-4">
        <Field label="İş">
          <Input required autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ör. Trendyol kampanya fiyatlarını güncelle" />
        </Field>
        <Field label="Açıklama">
          <Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Kim yapacak?">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ assignee: p.id })}
                className={cx('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition', f.assignee === p.id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-line')}
              >
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.full_name}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as any })}>
              {TASK_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Öncelik">
            <Select value={f.priority} onChange={(e) => set({ priority: e.target.value as any })}>
              {TASK_PRIORITY.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
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
          <Field label="Son tarih">
            <Input type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
          </Field>
        </div>
      </form>
    </Drawer>
  )
}
