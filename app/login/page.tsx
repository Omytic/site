'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usernameToEmail } from '@/lib/panel/auth'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(params.get('yetki') === 'yok' ? 'Bu hesabın panele erişimi yok.' : '')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/admin')
    })
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
    if (error) {
      setLoading(false)
      setError(error.message.includes('Invalid login') ? 'Kullanıcı adı ya da şifre hatalı.' : 'Giriş yapılamadı. Biraz sonra tekrar deneyin.')
      return
    }
    router.replace('/admin')
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-white/70">Kullanıcı adı</span>
        <input
          autoFocus
          required
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yunus, yusuf ya da omer"
          className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none transition placeholder:text-white/30 focus:border-thread/60 focus:bg-white/[0.08]"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-white/70">Şifre</span>
        <span className="relative block">
          <input
            required
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 pr-12 text-white outline-none transition focus:border-thread/60 focus:bg-white/[0.08]"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/50 hover:text-white"
            aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-[#d03b3b]/15 px-3.5 py-2.5 text-sm font-medium text-[#ffb4b4]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-thread-soft to-thread font-bold text-night shadow-[0_10px_40px_-10px_rgba(227,171,59,0.7)] transition disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Giriş yap <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-night px-4 font-sans text-white">
      <div aria-hidden className="weave absolute inset-0" />
      <div aria-hidden className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-thread/15 blur-[140px]" />
      <div aria-hidden className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-[#2a78d6]/10 blur-[140px]" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <span className="inline-flex items-baseline gap-2">
            <span className="font-display text-5xl font-black tracking-[-0.04em]">OMY</span>
            <span className="h-2.5 w-2.5 rounded-full bg-thread" />
          </span>
          <p className="mt-2 text-white/55">Stok, satış ve finans paneli</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-7">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-white/35">
          <a href="/" className="hover:text-white/70">omytic.com'a dön</a>
        </p>
      </motion.div>
    </main>
  )
}
