'use client'

import { motion } from 'framer-motion'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-navy-900 to-anthracite-900 text-white">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-8">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-sm text-navy-300">
            © 2026 OMY Ticaret. Tüm Hakları Saklıdır.
          </p>
        </motion.div>
      </div>
    </footer>
  )
}
