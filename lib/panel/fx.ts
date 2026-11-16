'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { dateTR } from './format'

export type Currency = 'TRY' | 'USD' | 'EUR'
export const CURRENCIES: { id: Currency; label: string; sym: string }[] = [
  { id: 'TRY', label: 'TL', sym: '₺' },
  { id: 'USD', label: 'Dolar', sym: '$' },
  { id: 'EUR', label: 'Euro', sym: '€' },
]
export const symOf = (c: string | null | undefined) => CURRENCIES.find((x) => x.id === c)?.sym ?? '₺'

export interface RateInfo {
  forDate: string
  bulletinDate: string
  bulletin: string | null
  rates: Record<'USD' | 'EUR', { buying: number; selling: number }>
}

const cache = new Map<string, Promise<RateInfo>>()

/** O tarihte yapılan işlem için geçerli TCMB kuru (önceki iş gününün bülteni). */
export function fetchRate(date: string): Promise<RateInfo> {
  if (!cache.has(date)) {
    const p = (async () => {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(`/api/kur?tarih=${date}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || 'Kur alınamadı')
      return j as RateInfo
    })()
    p.catch(() => cache.delete(date))
    cache.set(date, p)
  }
  return cache.get(date)!
}

/**
 * Formlarda kur: para birimi ya da tarih değişince TCMB kuru otomatik gelir; elle değiştirilebilir.
 * side: alımda/giderde döviz SATIŞ kuru (döviz alıp ödüyoruz), satışta/gelirde döviz ALIŞ kuru (döviz alıp bozduruyoruz).
 */
export function useFxRate(currency: Currency, date: string, side: 'buying' | 'selling', initial?: number | null) {
  const [rate, setRate] = useState<string>(initial ? String(initial) : '')
  const [manual, setManual] = useState(!!initial)
  const [info, setInfo] = useState<RateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (currency === 'TRY' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let alive = true
    setLoading(true)
    setError(null)
    fetchRate(date)
      .then((r) => {
        if (!alive) return
        setInfo(r)
        if (!manual) setRate(String(r.rates[currency][side]))
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, date, side])
  const auto = info && currency !== 'TRY' ? info.rates[currency][side] : null
  return {
    rate: currency === 'TRY' ? 1 : Number(String(rate).replace(',', '.')) || 0,
    rateText: rate,
    setRate: (v: string) => {
      setManual(true)
      setRate(v)
    },
    resetToAuto: () => {
      setManual(false)
      if (auto) setRate(String(auto))
    },
    auto,
    manual: manual && auto !== null && Number(rate) !== auto,
    note: info ? `TCMB ${dateTR(info.bulletinDate)} bülteni · döviz ${side === 'selling' ? 'satış' : 'alış'}` : null,
    loading,
    error,
  }
}
