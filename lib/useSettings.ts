'use client'

import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface Settings {
  id?: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  instagram: string | null
  linkedin: string | null
  announcement_text: string | null
  announcement_active: boolean
  site_title: string | null
  site_description: string | null
}

const defaultSettings: Settings = {
  phone: '+90 553 588 69 36',
  whatsapp: '+90 553 588 69 36',
  email: 'info@omytic.com',
  address: '',
  instagram: '',
  linkedin: '',
  announcement_text: '',
  announcement_active: false,
  site_title: 'OMY Ticaret - Kaliteli Toptan Ticaret',
  site_description: 'OMY Ticaret; kaliteli ürün yelpazesi ve hızlı tedarik zinciriyle, müşterilerinin ihtiyaçlarına özel çözümler sunan güvenilir bir iş ortağıdır.'
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('Settings fetch error:', error)
      }

      if (data) {
        setSettings({
          phone: data.phone || defaultSettings.phone,
          whatsapp: data.whatsapp || defaultSettings.whatsapp,
          email: data.email || defaultSettings.email,
          address: data.address || defaultSettings.address,
          instagram: data.instagram || defaultSettings.instagram,
          linkedin: data.linkedin || defaultSettings.linkedin,
          announcement_text: data.announcement_text || defaultSettings.announcement_text,
          announcement_active: data.announcement_active ?? defaultSettings.announcement_active,
          site_title: data.site_title || defaultSettings.site_title,
          site_description: data.site_description || defaultSettings.site_description,
        })
      }
    } catch (err) {
      console.error('Settings yüklenirken hata:', err)
    } finally {
      setLoading(false)
    }
  }

  return { settings, loading }
}
