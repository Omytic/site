'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/Logo'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Eğer zaten giriş yapılmışsa admin paneline yönlendir
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email === 'info@omytic.com') {
        router.push('/admin')
      }
    } catch (err) {
      console.error('Auth kontrolü hatası:', err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      // E-posta kontrolü
      if (email !== 'info@omytic.com') {
        setError('Bu e-posta adresi ile giriş yapılamaz. Sadece yetkili kullanıcılar giriş yapabilir.')
        setLoading(false)
        return
      }

      // Supabase Auth ile giriş
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('E-posta veya şifre hatalı!')
        } else {
          setError(authError.message)
        }
        setLoading(false)
        return
      }

      // E-posta doğrulaması kontrolü
      if (data.user && !data.user.email_confirmed_at) {
        setError('Lütfen e-posta adresinizi doğrulayın.')
        setLoading(false)
        return
      }

      // Başarılı giriş - admin paneline yönlendir
      setMessage('Giriş başarılı! Yönlendiriliyorsunuz...')
      setTimeout(() => {
        router.push('/admin')
      }, 500)

    } catch (err: any) {
      setError(err.message || 'Giriş yapılırken bir hata oluştu')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-navy-50 to-anthracite-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-luxury-xl p-8 border border-anthracite-100"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-navy-900 to-anthracite-900 text-gold-400 mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <div className="mb-4 flex justify-center">
            <Logo variant="dark" size="sm" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy-900">
            Admin Paneli Girişi
          </h1>
          <p className="text-anthracite-600 mt-2 text-sm">Lütfen e-posta ve şifrenizi girin</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {message && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {message}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-anthracite-700 mb-2">
              E-posta
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-anthracite-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@omytic.com"
                className="w-full pl-10 pr-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-anthracite-700 mb-2">
              Şifre
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-anthracite-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi girin"
                className="w-full pl-10 pr-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-navy-900 to-anthracite-900 hover:from-navy-800 hover:to-anthracite-800 text-white font-semibold rounded-lg transition-all shadow-luxury hover:shadow-luxury-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Giriş yapılıyor...</span>
              </>
            ) : (
              'Giriş Yap'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-anthracite-600 hover:text-navy-900 transition-colors"
          >
            ← Ana Sayfaya Dön
          </a>
        </div>
      </motion.div>
    </div>
  )
}
