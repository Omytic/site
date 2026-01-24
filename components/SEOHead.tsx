'use client'

import { useEffect } from 'react'
import { useSettings } from '@/lib/useSettings'

export default function SEOHead() {
  const { settings } = useSettings()

  useEffect(() => {
    if (settings.site_title) {
      document.title = settings.site_title
    }
    
    const metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription && settings.site_description) {
      metaDescription.setAttribute('content', settings.site_description)
    } else if (settings.site_description) {
      const meta = document.createElement('meta')
      meta.name = 'description'
      meta.content = settings.site_description
      document.head.appendChild(meta)
    }
  }, [settings])

  return null
}
