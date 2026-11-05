'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE, WhatsAppIcon } from './motion'
import type { Fabric } from './Fabrics'

export default function FabricModal({
  fabric,
  onClose,
  quoteHref,
}: {
  fabric: Fabric | null
  onClose: () => void
  quoteHref: (name: string) => string
}) {
  useEffect(() => {
    if (!fabric) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [fabric, onClose])

  return (
    <AnimatePresence>
      {fabric && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-night/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={fabric.name}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="relative grid max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-[32px] bg-paper text-ink sm:rounded-[32px] md:grid-cols-[1.1fr_1fr]"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg backdrop-blur transition-transform hover:rotate-90"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative aspect-square overflow-hidden bg-line md:aspect-auto md:min-h-[520px]">
              {fabric.image_url && (
                <motion.img
                  initial={{ scale: 1.15 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 1.2, ease: EASE }}
                  src={fabric.image_url}
                  alt={fabric.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-col p-7 sm:p-10">
              <p className="text-sm font-bold text-thread-deep">Toptan kumaş</p>
              <h2 className="mt-2 font-display text-4xl font-black leading-none sm:text-5xl">{fabric.name}</h2>
              {fabric.description && <p className="mt-5 leading-relaxed text-ink-soft">{fabric.description}</p>}
              {fabric.features && fabric.features.length > 0 && (
                <ul className="mt-6 space-y-2.5">
                  {fabric.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-ink-soft">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-thread" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={quoteHref(fabric.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 font-bold text-white transition-colors hover:bg-ink-soft md:mt-auto"
              >
                <WhatsAppIcon />
                Bu kumaş için teklif iste
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
