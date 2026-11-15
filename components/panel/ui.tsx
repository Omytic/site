'use client'

import { createPortal } from 'react-dom'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Loader2, Search, X } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ */
/* Düğmeler                                                            */
/* ------------------------------------------------------------------ */
type BtnVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger'
const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft shadow-sm',
  gold: 'bg-thread text-night hover:bg-thread-soft shadow-sm',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-line hover:bg-[#F7F6F2]',
  ghost: 'text-ink-soft hover:bg-black/[0.05]',
  danger: 'bg-[#d03b3b] text-white hover:bg-[#b83030]',
}
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]',
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4 text-sm',
        btnStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------ */
/* Yerleşim                                                            */
/* ------------------------------------------------------------------ */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1 className="font-display text-[28px] font-black leading-tight tracking-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-soft/70 sm:text-[15px]">{subtitle}</p>}
      </div>
      {actions && (
        // Telefonda düğmeler tek sıra, yana kaydırılır
        <div className="-mx-4 flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">{actions}</div>
      )}
    </div>
  )
}

export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(14,21,39,0.04)]', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4">
          {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  sub,
  delta,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  delta?: number | null
  icon?: ReactNode
  tone?: 'default' | 'dark'
}) {
  const up = (delta ?? 0) >= 0
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl p-5 ring-1',
        tone === 'dark' ? 'bg-night text-white ring-white/10' : 'bg-white text-ink ring-black/[0.06]',
      )}
    >
      {tone === 'dark' && <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-thread/25 blur-2xl" />}
      <div className="relative flex items-start justify-between gap-2">
        <p className={cx('text-sm font-semibold', tone === 'dark' ? 'text-white/60' : 'text-ink-soft/70')}>{label}</p>
        {icon && <span className={tone === 'dark' ? 'text-thread' : 'text-ink-soft/40'}>{icon}</span>}
      </div>
      <p className="relative mt-2 font-display text-[28px] font-black leading-none tracking-tight">{value}</p>
      <div className="relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span
            className={cx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold',
              up ? 'bg-[#0ca30c]/12 text-[#0a7d0a]' : 'bg-[#d03b3b]/12 text-[#b83030]',
              tone === 'dark' && (up ? 'bg-[#0ca30c]/20 text-[#6fe06f]' : 'bg-[#d03b3b]/25 text-[#ff9a9a]'),
            )}
          >
            {up ? '▲' : '▼'} %{Math.abs(Math.round(delta * 100))}
          </span>
        )}
        {sub && <span className={tone === 'dark' ? 'text-white/50' : 'text-ink-soft/60'}>{sub}</span>}
      </div>
    </div>
  )
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', className)}
      style={color ? { backgroundColor: `${color}1f`, color: '#0E1527' } : undefined}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  )
}

/** Durum rozeti: renk + ikon/etiket birlikte (renk tek başına anlam taşımaz). */
export function StatusPill({ tone, children }: { tone: 'good' | 'warning' | 'critical' | 'neutral' | 'info'; children: ReactNode }) {
  const m = {
    good: 'bg-[#0ca30c]/10 text-[#0a6e0a] ring-[#0ca30c]/25',
    warning: 'bg-[#fab219]/15 text-[#8a5a00] ring-[#fab219]/40',
    critical: 'bg-[#d03b3b]/10 text-[#a32a2a] ring-[#d03b3b]/25',
    neutral: 'bg-black/[0.04] text-ink-soft ring-black/10',
    info: 'bg-[#2a78d6]/10 text-[#1c5cab] ring-[#2a78d6]/25',
  }[tone]
  const dot = { good: '●', warning: '▲', critical: '■', neutral: '○', info: '◆' }[tone]
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', m)}>
      <span aria-hidden className="text-[9px]">{dot}</span>
      {children}
    </span>
  )
}

export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-thread/10 text-thread-deep">{icon}</div>}
      <p className="font-bold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-soft/70">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-black/[0.05]', className)} />
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#a32a2a]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Form alanları                                                       */
/* ------------------------------------------------------------------ */
const fieldBase =
  'w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink-soft/40 focus:border-ink/40 focus:ring-4 focus:ring-thread/15 disabled:bg-black/[0.03]'

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft/60">{hint}</span>}
    </label>
  )
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-11', className)} {...p} />
})
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%232B3550%27 stroke-width=%272.5%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[position:right_12px_center] bg-no-repeat pr-9', className)} {...p}>
      {children}
    </select>
  )
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, 'min-h-[88px] resize-y py-2.5', className)} {...p} />
}

export function SearchBox({ value, onChange, placeholder = 'Ara…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(fieldBase, 'h-10 w-full pl-9 sm:w-64')}
      />
    </div>
  )
}

/** Yan yana seçenek düğmeleri (filtreler, sekmeler). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: ReactNode }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-black/[0.05] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cx(
            'relative whitespace-nowrap rounded-lg font-semibold transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.id ? 'text-ink' : 'text-ink-soft/60 hover:text-ink',
          )}
        >
          {value === o.id && (
            <motion.span layoutId={`seg-${options.map((x) => x.id).join('')}`} className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sağdan açılan form paneli                                           */
/* ------------------------------------------------------------------ */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open, onClose])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  // body'ye taşınır: form içinden açılan ikinci panel (ör. alımda "yeni kumaş") iç içe form olmasın
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-night/40 backdrop-blur-[2px]" />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className={cx('absolute inset-y-0 right-0 flex w-full flex-col bg-[#F7F6F2] shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
          >
            <header className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <h2 className="font-display text-xl font-black tracking-tight text-ink">{title}</h2>
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-white px-5 py-3.5">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Bildirimler ve onay                                                 */
/* ------------------------------------------------------------------ */
type ToastMsg = { id: number; text: string; tone: 'ok' | 'error' }
type ConfirmReq = { text: string; detail?: string; confirm: string; resolve: (v: boolean) => void }
const UiCtx = createContext<{ toast: (text: string, tone?: 'ok' | 'error') => void; confirm: (text: string, detail?: string, confirm?: string) => Promise<boolean> } | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [ask, setAsk] = useState<ConfirmReq | null>(null)
  const idRef = useRef(0)
  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])
  const confirm = useCallback(
    (text: string, detail?: string, confirmLabel = 'Sil') => new Promise<boolean>((resolve) => setAsk({ text, detail, confirm: confirmLabel, resolve })),
    [],
  )
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[100] lg:bottom-4 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60 }}
              className={cx(
                'pointer-events-auto flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl',
                t.tone === 'ok' ? 'bg-night text-white' : 'bg-[#d03b3b] text-white',
              )}
            >
              {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-thread" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {ask && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-night/50" onClick={() => (ask.resolve(false), setAsk(null))} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <p className="text-lg font-bold text-ink">{ask.text}</p>
              {ask.detail && <p className="mt-2 text-sm text-ink-soft/70">{ask.detail}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => (ask.resolve(false), setAsk(null))}>
                  Vazgeç
                </Button>
                <Button variant="danger" autoFocus onClick={() => (ask.resolve(true), setAsk(null))}>
                  {ask.confirm}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </UiCtx.Provider>
  )
}
export function useUi() {
  const v = useContext(UiCtx)
  if (!v) throw new Error('useUi UiProvider içinde kullanılmalı')
  return v
}

/* ------------------------------------------------------------------ */
/* Tablo                                                               */
/* ------------------------------------------------------------------ */
export function Table({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead className="text-left text-xs font-semibold text-ink-soft/60 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-line [&_th]:bg-white [&_th]:px-4 [&_th]:py-2.5 [&_th]:font-semibold">
          {head}
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-black/[0.04] [&_td]:px-4 [&_td]:py-3 [&_tr:last-child_td]:border-0 [&_tr]:transition-colors hover:[&_tr]:bg-[#FAF9F6]">
          {children}
        </tbody>
      </table>
    </div>
  )
}

export function UserDot({ name, color, size = 'sm' }: { name?: string; color?: string; size?: 'sm' | 'md' }) {
  if (!name) return <span className="text-ink-soft/40">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cx('inline-flex items-center justify-center rounded-full font-bold text-night', size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-8 w-8 text-xs')}
        style={{ backgroundColor: color ?? '#E3AB3B' }}
      >
        {name.slice(0, 1)}
      </span>
      <span className="text-sm text-ink-soft">{name}</span>
    </span>
  )
}

/** Uzun listeler için "daha fazla göster". */
export function useShowMore(step = 50) {
  const [n, setN] = useState(step)
  return { n, reset: () => setN(step), more: () => setN((x) => x + step) }
}
export function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null
  return (
    <div className="border-t border-black/[0.05] p-3 text-center">
      <button onClick={onMore} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-black/5 hover:text-ink">
        {total - shown} kayıt daha göster
      </button>
    </div>
  )
}
