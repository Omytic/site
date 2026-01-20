'use client'

import Logo from './Logo'

export default function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-anthracite-100 shadow-luxury">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-center h-20">
          {/* Logo */}
          <a href="#ana-sayfa" className="flex items-center hover:opacity-80 transition-opacity">
            <Logo variant="dark" size="sm" />
          </a>
        </div>
      </div>
    </nav>
  )
}
