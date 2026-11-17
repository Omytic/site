'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from './data'
import { clearActivity, idleTooLong, markActivity } from './security'

interface AuthState {
  me: Profile
  profiles: Profile[]
  byId: (id: string | null | undefined) => Profile | undefined
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

// YEREL ÖNİZLEME: giriş sadece bilgisayarda `npm run dev` ile ve .env.local'de NEXT_PUBLIC_LOCAL_PANEL_EMAIL varsa kapalı.
// Canlı sitede (production build) bu her zaman false olur; giriş ekranı açık kalır.
const LOCAL_PANEL = process.env.NODE_ENV === 'development' && !!process.env.NEXT_PUBLIC_LOCAL_PANEL_EMAIL
const LOCAL_ME: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'omer',
  full_name: 'Ömer',
  color: '#C4A574',
}

export const usernameToEmail = (u: string) => {
  const clean = u
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
  return clean.includes('@') ? clean : `${clean}@omytic.com`
}

export function PanelAuth({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<{ me: Profile; profiles: Profile[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (LOCAL_PANEL) {
      const boot = async () => {
        const email = process.env.NEXT_PUBLIC_LOCAL_PANEL_EMAIL
        const password = process.env.NEXT_PUBLIC_LOCAL_PANEL_PASSWORD
        let session = (await supabase.auth.getSession()).data.session
        if (!session && email && password) {
          const { data } = await supabase.auth.signInWithPassword({ email, password })
          session = data.session
        }
        if (!session) {
          if (alive) setState({ me: LOCAL_ME, profiles: [LOCAL_ME] })
          return
        }
        const { data: profiles } = await supabase.from('profiles').select('id,username,full_name,color').order('username')
        if (!alive) return
        const list = (profiles ?? []) as Profile[]
        const me = list.find((p) => p.id === session!.user.id) ?? LOCAL_ME
        setState({ me, profiles: list.length ? list : [me] })
      }
      boot()
      return
    }
    const load = async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.replace('/login')
        return
      }
      // Uzun süre hareketsiz kalmış oturum kapanır
      if (idleTooLong()) {
        await supabase.auth.signOut()
        clearActivity()
        router.replace('/login?cikis=sure')
        return
      }
      // İlk şifre değiştirilmeden panel açılmaz
      const { data: mine } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (mine && (mine as any).must_change_password) {
        router.replace('/login')
        return
      }
      markActivity()
      const { data: profiles, error } = await supabase.from('profiles').select('id,username,full_name,color').order('username')
      if (!alive) return
      if (error) {
        setError('Panel verileri okunamadı. Veritabanı kurulumu yapılmış mı?')
        return
      }
      const me = profiles?.find((p) => p.id === user.id)
      if (!me) {
        await supabase.auth.signOut()
        router.replace('/login?yetki=yok')
        return
      }
      setState({ me, profiles: profiles as Profile[] })
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    // Hareket oldukça zamanı güncelle; her dakika kontrol et
    let last = 0
    const onAct = () => {
      if (Date.now() - last > 60_000) {
        last = Date.now()
        markActivity()
      }
    }
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, onAct, { passive: true }))
    const timer = setInterval(async () => {
      if (idleTooLong()) {
        await supabase.auth.signOut()
        clearActivity()
        router.replace('/login?cikis=sure')
      }
    }, 60_000)
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      evs.forEach((e) => window.removeEventListener(e, onAct))
      clearInterval(timer)
    }
  }, [router])

  const value = useMemo<AuthState | null>(
    () =>
      state && {
        ...state,
        byId: (id) => state.profiles.find((p) => p.id === id),
        signOut: async () => {
          clearActivity()
          await supabase.auth.signOut()
          router.replace('/login')
        },
      },
    [state, router],
  )

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F3EF] p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-[#0E1527]">{error}</p>
          <button onClick={() => location.reload()} className="mt-4 rounded-full bg-[#0E1527] px-5 py-2.5 font-semibold text-white">
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }
  if (!value) return <>{fallback}</>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth PanelAuth içinde kullanılmalı')
  return v
}
