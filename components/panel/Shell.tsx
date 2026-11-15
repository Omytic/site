'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Boxes,
  ExternalLink,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plug,
  Megaphone,
  Menu,
  PackagePlus,
  Plus,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
  X, Tag, Calculator, ClipboardCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { invalidate } from '@/lib/panel/data'
import { passwordProblem } from '@/lib/panel/security'
import { Button, cx, Drawer, Field, Input, useUi } from './ui'

type NavPage = { href: string; label: string; icon: typeof Boxes; hint?: string }
type NavSection = NavPage & { pages?: NavPage[] }

// Ana menü 8 bölüm; birbirine yakın sayfalar bölümün içinde sekme olarak durur.
const NAV: NavSection[] = [
  { href: '/admin', label: 'Genel bakış', icon: LayoutDashboard },
  { href: '/admin/satislar', label: 'Satışlar', icon: ShoppingBag },
  { href: '/admin/alimlar', label: 'Alımlar', icon: PackagePlus },
  {
    href: '/admin/stok',
    label: 'Ürün ve stok',
    icon: Boxes,
    pages: [
      { href: '/admin/stok', label: 'Stok', icon: Boxes, hint: 'Ne kadar var, ne zaman biter' },
      { href: '/admin/urunler', label: 'Ürün kartları', icon: Tag, hint: 'Fiyat, maliyet, numara ve renkler' },
      { href: '/admin/kar-hesabi', label: 'Kâr ve KDV hesabı', icon: Calculator, hint: 'Bir satıştan ne kalır' },
    ],
  },
  { href: '/admin/sevkiyat', label: 'Amazon sevkiyatı', icon: Truck },
  {
    href: '/admin/finans',
    label: 'Para',
    icon: Wallet,
    pages: [
      { href: '/admin/finans', label: 'Finans', icon: Wallet, hint: 'Gelir, gider, alacak, borç' },
      { href: '/admin/reklam', label: 'Reklam', icon: Megaphone, hint: 'Harcama ve bütçe' },
    ],
  },
  {
    href: '/admin/isler',
    label: 'Ekip',
    icon: ListChecks,
    pages: [
      { href: '/admin/isler', label: 'İşler', icon: ListChecks, hint: 'Yapılacaklar' },
      { href: '/admin/varliklar', label: 'Dijital varlıklar', icon: Globe, hint: 'Hesaplar, alan adları' },
      { href: '/admin/gecmis', label: 'Düzenleme geçmişi', icon: History, hint: 'Kim neyi değiştirdi' },
    ],
  },
  {
    href: '/admin/entegrasyonlar',
    label: 'Site ve bağlantılar',
    icon: Plug,
    pages: [
      { href: '/admin/entegrasyonlar', label: 'Entegrasyonlar', icon: Plug, hint: 'Pazaryeri senkronu' },
      { href: '/admin/vitrin', label: 'Vitrin', icon: Store, hint: 'omytic.com içeriği' },
    ],
  },
]
const matches = (href: string, path: string | null) => (href === '/admin' ? path === '/admin' : !!path?.startsWith(href))
const sectionOf = (path: string | null) => NAV.find((s) => (s.pages ?? [s]).some((p) => matches(p.href, path)))
const pageOf = (path: string | null) => {
  const s = sectionOf(path)
  return s && (s.pages ?? [s]).find((p) => matches(p.href, path))
}

/** Bölümün alt sayfaları: sayfanın üstünde sekme olarak */
function SectionTabs() {
  const path = usePathname()
  const s = sectionOf(path)
  if (!s?.pages) return null
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      <div className="inline-flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-black/[0.06]">
        {s.pages.map((p) => {
          const active = matches(p.href, path)
          return (
            <Link
              key={p.href}
              href={p.href}
              title={p.hint}
              className={cx(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors',
                active ? 'bg-night text-white' : 'text-ink-soft/70 hover:bg-[#F4F3EF] hover:text-ink',
              )}
            >
              <p.icon className={cx('h-4 w-4', active ? 'text-thread' : 'text-ink-soft/45')} />
              {p.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// Telefonda alttaki sekme çubuğu
const TABS = [
  { href: '/admin', label: 'Özet', icon: LayoutDashboard },
  { href: '/admin/satislar', label: 'Satışlar', icon: ShoppingBag },
  { href: '/admin/stok', label: 'Stok', icon: Boxes },
  { href: '/admin/finans', label: 'Para', icon: Wallet },
]

const QUICK = [
  { href: '/admin/satislar?yeni=1', label: 'Satış', icon: ShoppingBag },
  { href: '/admin/alimlar?yeni=1', label: 'Mal alımı', icon: PackagePlus },
  { href: '/admin/sevkiyat?yeni=1', label: 'Amazon sevkiyatı', icon: Truck },
  { href: '/admin/urunler?yeni=1', label: 'Ürün / model', icon: Tag },
  { href: '/admin/stok?sayim=1', label: 'Stok sayımı', icon: ClipboardCheck },
  { href: '/admin/finans?yeni=1', label: 'Gelir / gider', icon: Wallet },
  { href: '/admin/reklam?yeni=1', label: 'Reklam harcaması', icon: Megaphone },
  { href: '/admin/isler?yeni=1', label: 'İş', icon: ListChecks },
]

function Mark() {
  return (
    <span className="inline-flex items-baseline gap-1.5 leading-none text-white">
      <span className="font-display text-[22px] font-black tracking-[-0.04em]">OMY</span>
      <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-thread" />
      <span className="text-[13px] font-semibold tracking-wide text-white/60">Panel</span>
    </span>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname()
  const current = sectionOf(path)
  return (
    <nav>
      <ul className="space-y-0.5">
        {NAV.map((it) => {
          const active = current === it
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                onClick={onNavigate}
                className={cx(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors',
                  active ? 'text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-white/[0.08] ring-1 ring-inset ring-white/10"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-thread" />}
                <it.icon className={cx('relative h-[18px] w-[18px]', active ? 'text-thread' : '')} />
                <span className="relative">{it.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const { toast } = useUi()
  const [name, setName] = useState(me.full_name)
  const [color, setColor] = useState(me.color)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const prob = pw ? passwordProblem(pw, me.username) : null
    if (prob) return toast(prob, 'error')
    if (pw && pw !== pw2) return toast('Şifreler aynı değil.', 'error')
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: name.trim() || me.full_name, color }).eq('id', me.id)
      if (error) throw error
      if (pw) {
        const { error: e2 } = await supabase.auth.updateUser({ password: pw })
        if (e2) throw e2
      }
      toast(pw ? 'Bilgiler ve şifre güncellendi.' : 'Bilgiler güncellendi.')
      setPw('')
      setPw2('')
      onClose()
      setTimeout(() => location.reload(), 600)
    } catch (e: any) {
      toast(e.message ?? 'Kaydedilemedi', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Hesabım"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-white p-4 text-sm text-ink-soft ring-1 ring-line">
          Kullanıcı adı: <b className="text-ink">{me.username}</b>
          <span className="mt-1 block text-xs">8 saat işlem yapılmazsa oturum kendiliğinden kapanır.</span>
        </p>
        <Field label="Görünen ad">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Renk" hint="İşlerde ve geçmişte adınızın yanında görünür.">
          <div className="flex gap-2">
            {['#E3AB3B', '#4EA1E1', '#B85C4E', '#1baf7a', '#e87ba4', '#9085e9'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cx('h-9 w-9 rounded-full ring-offset-2 transition', color === c && 'ring-2 ring-ink')}
                style={{ backgroundColor: c }}
                aria-label={`Renk ${c}`}
              />
            ))}
          </div>
        </Field>
        <div className="border-t border-line pt-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <KeyRound className="h-4 w-4" /> Şifre değiştir
          </p>
          <div className="space-y-3">
            <Field label="Yeni şifre">
              <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="En az 10 karakter, büyük/küçük harf ve rakam" />
            </Field>
            <Field label="Yeni şifre (tekrar)">
              <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function QuickAdd() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="hidden sm:inline">Yeni kayıt</span>
      </Button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-black/10"
          >
            {QUICK.map((q) => (
              <li key={q.href}>
                <Link href={q.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-[#F4F3EF]">
                  <q.icon className="h-4 w-4 text-ink-soft/60" />
                  {q.label}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth()
  const [mobile, setMobile] = useState(false)
  const [account, setAccount] = useState(false)
  const path = usePathname()
  useEffect(() => setMobile(false), [path])

  const userCard = (
    <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
      <button onClick={() => setAccount(true)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left hover:bg-white/[0.04]" title="Hesabım: ad, renk, şifre">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-night" style={{ backgroundColor: me.color }}>
          {me.full_name.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{me.full_name}</span>
          <span className="block text-[11px] text-white/45">Hesabım</span>
        </span>
      </button>
      <a href="/" target="_blank" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.06] hover:text-white" title="Siteyi aç" aria-label="Siteyi aç">
        <ExternalLink className="h-4 w-4" />
      </a>
      <button onClick={signOut} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.06] hover:text-white" title="Çıkış" aria-label="Çıkış">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
  const section = sectionOf(path)
  const current = pageOf(path)

  return (
    <div className="min-h-screen bg-[#F4F3EF] font-sans text-ink">
      {/* Masaüstü yan menü */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden bg-night px-4 pb-4 pt-6 lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-thread/15 blur-[80px]" />
        <Link href="/admin" className="relative mb-6 px-3">
          <Mark />
        </Link>
        <div className="relative -mr-2 flex-1 overflow-y-auto pr-2 [scrollbar-width:thin]">
          <NavList />
        </div>
        <div className="relative mt-3 border-t border-white/[0.06] pt-3">{userCard}</div>
      </aside>

      {/* Mobil */}
      <AnimatePresence>
        {mobile && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} className="absolute inset-0 bg-night/50" />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-night px-4 pb-4 pt-5"
            >
              <div className="mb-6 flex items-center justify-between px-3">
                <Mark />
                <button onClick={() => setMobile(false)} className="text-white/70" aria-label="Menüyü kapat">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList onNavigate={() => setMobile(false)} />
              </div>
              <div className="mt-4">{userCard}</div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-black/[0.06] bg-[#F4F3EF]/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobile(true)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-line lg:hidden" aria-label="Menüyü aç">
              <Menu className="h-5 w-5" />
            </button>
            {current && current.href !== '/admin' ? (
              <p className="flex min-w-0 items-center gap-2 text-sm">
                {section?.pages && <span className="hidden text-ink-soft/50 sm:inline">{section.label}</span>}
                {section?.pages && <span className="hidden text-ink-soft/30 sm:inline">/</span>}
                <current.icon className="h-4 w-4 shrink-0 text-ink-soft/60" />
                <b className="truncate text-ink">{current.label}</b>
              </p>
            ) : (
              <p className="truncate text-sm text-ink-soft/70">
                Merhaba <b className="text-ink">{me.full_name}</b>
                <span className="hidden sm:inline">, {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => invalidate()} title="Verileri yenile">
              Yenile
            </Button>
            <QuickAdd />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:py-8">
          <SectionTabs />
          {children}
        </main>
      </div>

      {/* Telefonda alt sekme çubuğu */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Ana sayfalar">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = t.href === '/admin' ? path === '/admin' : sectionOf(path)?.href === t.href
            return (
              <li key={t.href}>
                <Link href={t.href} className={cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', active ? 'text-ink' : 'text-ink-soft/50')}>
                  <t.icon className={cx('h-5 w-5', active && 'text-[#c98f1f]')} />
                  {t.label}
                </Link>
              </li>
            )
          })}
          <li>
            <button onClick={() => setMobile(true)} className="flex w-full flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-ink-soft/50">
              <Menu className="h-5 w-5" />
              Menü
            </button>
          </li>
        </ul>
      </nav>
      <AccountDrawer open={account} onClose={() => setAccount(false)} />
    </div>
  )
}
