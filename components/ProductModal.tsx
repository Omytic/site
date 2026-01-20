'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: {
    name: string
    image_url: string | null
    features: string[] | null
    description: string | null
  } | null
}

export default function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-luxury-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-anthracite-50 text-anthracite-700 hover:text-navy-900 transition-all duration-200 shadow-luxury"
          aria-label="Kapat"
        >
          <X className="w-5 h-5" />
        </button>

            {/* Content */}
            <div className="grid md:grid-cols-2 gap-6 md:gap-8 p-6 md:p-8">
          {/* Image */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-anthracite-50">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover object-center"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-anthracite-300">
                Görsel Yok
              </div>
            )}
          </div>

            {/* Details */}
            <div className="flex flex-col justify-center space-y-4 md:space-y-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-serif font-bold text-navy-900 mb-3 md:mb-4">
                  {product.name}
                </h2>
                {product.description && (
                  <p className="text-sm md:text-base text-anthracite-700 leading-relaxed mb-3 md:mb-4">
                    {product.description}
                  </p>
                )}
              </div>

            {product.features && product.features.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-navy-900 mb-3">Özellikler</h3>
                <ul className="space-y-2">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3 text-anthracite-700">
                      <span className="text-gold-600 mt-1">•</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
