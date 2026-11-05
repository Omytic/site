'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import SEOHead from '@/components/SEOHead'
import Nav from '@/components/site/Nav'
import Hero, { type Swatch } from '@/components/site/Hero'
import Fabrics, { FabricMarquee, type Fabric } from '@/components/site/Fabrics'
import Process from '@/components/site/Process'
import Brands from '@/components/site/Brands'
import { Contact, SiteFooter } from '@/components/site/Contact'
import FabricModal from '@/components/site/FabricModal'
import { ScrollProgress } from '@/components/site/motion'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/useSettings'

// Veritabanında yeterli görselli kumaş yoksa hero duvarında bunlar döner.
const FALLBACK_SWATCHES: Swatch[] = [
  { name: 'Alcantara', image: '/images/fabric-alcantara.webp' },
  { name: 'Welsoft', image: '/images/fabric-welsoft.webp' },
  { name: 'Airfile', image: '/images/fabric-airfile.webp' },
]

export default function Home() {
  const { settings } = useSettings()
  const [fabrics, setFabrics] = useState<Fabric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Fabric | null>(null)
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)

  const waNumber = settings.whatsapp?.replace(/[^0-9]/g, '') || '905535886936'
  const wa = (text: string) => `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`
  const waGeneral = wa('Merhaba, toptan kumaş için fiyat teklifi almak istiyorum.')
  const quoteHref = (name: string) => wa(`Merhaba, ${name} kumaşı için toptan fiyat teklifi almak istiyorum.`)
  const closeModal = useCallback(() => setSelected(null), [])

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('category', 'kumaş')
          .order('created_at', { ascending: false })
        if (error) throw error
        setFabrics((data as Fabric[]) || [])
      } catch (err) {
        console.error('Kumaşlar yüklenemedi:', err)
        setError('Kumaşlar şu an yüklenemedi.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const withImages = fabrics.filter((f) => f.image_url)
  const swatches: Swatch[] =
    withImages.length >= 3 ? withImages.slice(0, 8).map((f) => ({ name: f.name, image: f.image_url as string })) : FALLBACK_SWATCHES

  return (
    <main className="grain min-h-screen bg-night">
      <SEOHead />
      <ScrollProgress />
      <Nav whatsappHref={waGeneral} />

      {settings.announcement_active && settings.announcement_text && !announcementDismissed && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-thread px-4 py-3 text-night shadow-2xl sm:bottom-5">
          <p className="flex-1 text-sm font-semibold">{settings.announcement_text}</p>
          <button onClick={() => setAnnouncementDismissed(true)} className="rounded-full p-1 hover:bg-night/10" aria-label="Duyuruyu kapat">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Hero swatches={swatches} whatsappHref={waGeneral} />
      <FabricMarquee names={(fabrics.length ? fabrics : FALLBACK_SWATCHES).map((f) => f.name)} />
      <Fabrics fabrics={fabrics} loading={loading} error={error} waGeneral={waGeneral} quoteHref={quoteHref} onOpen={setSelected} />
      <Process />
      <Brands />
      <Contact waGeneral={waGeneral} phone={settings.phone || '+90 553 588 69 36'} email={settings.email || 'info@omytic.com'} />
      <SiteFooter />

      <FabricModal fabric={selected} onClose={closeModal} quoteHref={quoteHref} />
    </main>
  )
}
