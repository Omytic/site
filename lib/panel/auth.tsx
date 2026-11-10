'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from './data'

interface AuthState {
  me: Profile
  profiles: Profile[]
  byId: (id: string | null | undefined) => Profile | undefined
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

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
    const load = async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.replace('/login')
        return
      }
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
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  const value = useMemo<AuthState | null>(
    () =>
      state && {
        ...state,
        byId: (id) => state.profiles.find((p) => p.id === id),
        signOut: async () => {
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
