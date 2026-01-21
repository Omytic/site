'use client'

import Logo from './Logo'
import { Heart } from 'lucide-react'

export default function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-anthracite-100 shadow-luxury">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-20">
          {/* Sol taraf - boş alan */}
          <div className="w-20"></div>
          
          {/* Logo - ortada */}
          <a href="#ana-sayfa" className="flex items-center hover:opacity-80 transition-opacity">
            <Logo variant="dark" size="sm" />
          </a>
          
          {/* Sağ taraf - F harfi ve kalp */}
          <div className="flex items-center gap-1 text-xs text-anthracite-400 w-20 justify-end">
            <span className="text-[10px]">F</span>
            <Heart className="w-3 h-3" strokeWidth={1.5} fill="none" />
          </div>
        </div>
      </div>
    </nav>
  )
}
