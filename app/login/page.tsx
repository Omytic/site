'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usernameToEmail } from '@/lib/panel/auth'
import { markActivity, passwordProblem } from '@/lib/panel/security'

type Step = 'loading' | 'password' | 'newpass'
const GENERIC = 'Kullanıcı adı ya da şifre hatalı.'
const inputCls =
  'h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none transition placeholder:text-white/30 focus:border-thread/60 focus:bg-white/[0.08]'

/*
 * Giriş:
 *  1) kullanıcı adı + şifre
 *  2) ilk girişte herkes kendi güçlü şifresini belirler (ortak şifre bir kez kullanılır)
 */
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [step, setStep] = useState<Step>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    params.get('yetki') === 'yok' ? GENERIC : params.get('cikis') === 'sure' ? 'Uzun süre işlem yapılmadığı için oturum kapandı. Tekrar giriş yapın.' : '',
  )
  const [me, setMe] = useState<{ id: string; username: string } | null>(null)
  const [np, setNp] = useState('')
  const [np2, setNp2] = useState('')

  // Oturumun hangi adımda olduğuna bakıp doğru ekranı açar
  const next = async () => {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return setStep('password')
    const uid = s.session.user.id
    const { data: prof, error: pe } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (pe || !prof) {
      await supabase.auth.signOut()
      setError(GENERIC)
      return setStep('password')
    }
    if ((prof as any).must_change_password) {
      setMe({ id: uid, username: (prof as any).username })
      return setStep('newpass')
    }
    markActivity()
    router.replace('/admin')
  }
  const run = async (fn: () => Promise<void>, keepError = false) => {
    if (!keepError) setError('')
    setLoading(true)
    try {
      await fn()
    } catch (e: any) {
      const m = String(e?.message ?? '')
      setError(/rate|too many/i.test(m) ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.' : m || 'Bir sorun oldu, tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // YEREL ÖNİZLEME: giriş ekranı kapalı.
    router.replace('/admin')
  }, [router])

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
      if (error) {
        setError(/rate|too many/i.test(error.message) ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.' : GENERIC)
        return
      }
      setPassword('')
      await next()
    })
  }
  const submitNewPass = (e: React.FormEvent) => {
    e.preventDefault()
    const p = passwordProblem(np, me?.username)
    if (p) return setError(p)
    if (np !== np2) return setError('Şifreler aynı değil.')
    run(async () => {
      const { error } = await supabase.auth.updateUser({ password: np })
      if (error) throw new Error(/same|different/i.test(error.message) ? 'Yeni şifre eskisiyle aynı olamaz.' : error.message)
      const { error: e2 } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', me!.id)
      if (e2) throw e2
      setNp('')
      setNp2('')
      await next()
    })
  }
  const restart = () =>
    run(async () => {
      await supabase.auth.signOut()
      setStep('password')
    })

  const errBox = error && (
    <p className="flex items-center gap-2 rounded-xl bg-[#d03b3b]/15 px-3.5 py-2.5 text-sm font-medium text-[#ffb4b4]">
      <AlertCircle className="h-4 w-4 shrink-0" /> {error}
    </p>
  )
  const submitBtn = (label: string) => (
    <button
      type="submit"
      disabled={loading}
      className="group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-thread-soft to-thread font-bold text-night shadow-[0_10px_40px_-10px_rgba(227,171,59,0.7)] transition disabled:opacity-70"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
    </button>
  )
  const back = (
    <button type="button" onClick={restart} className="mx-auto mt-1 block text-xs text-white/40 hover:text-white/70">
      Farklı hesapla gir
    </button>
  )

  if (step === 'loading')
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </div>
    )

  if (step === 'newpass')
    return (
      <form onSubmit={submitNewPass} className="space-y-4">
        <div className="flex items-start gap-2.5">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-thread" />
          <div>
            <p className="font-bold">Kendi şifrenizi belirleyin</p>
            <p className="mt-1 text-sm text-white/60">Ortak şifre sadece ilk giriş içindi. En az 10 karakter; büyük harf, küçük harf ve rakam olsun.</p>
          </div>
        </div>
        <input autoFocus required type="password" autoComplete="new-password" value={np} onChange={(e) => setNp(e.target.value)} className={inputCls} placeholder="Yeni şifre" aria-label="Yeni şifre" />
        <input required type="password" autoComplete="new-password" value={np2} onChange={(e) => setNp2(e.target.value)} className={inputCls} placeholder="Yeni şifre (tekrar)" aria-label="Yeni şifre tekrar" />
        {np && <p className={`text-xs ${passwordProblem(np, me?.username) ? 'text-white/50' : 'text-[#7ee0a8]'}`}>{passwordProblem(np, me?.username) ?? 'Şifre uygun.'}</p>}
        {errBox}
        {submitBtn('Şifreyi kaydet ve gir')}
      </form>
    )

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-white/70">Kullanıcı adı</span>
        <input autoFocus required autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-white/70">Şifre</span>
        <span className="relative block">
          <input required type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-12`} />
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
      {errBox}
      {submitBtn('Devam')}
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
          <p className="mt-2 text-white/55">Yönetim paneli</p>
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
