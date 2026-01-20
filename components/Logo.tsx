'use client'

import { motion } from 'framer-motion'

interface LogoProps {
  variant?: 'default' | 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  className?: string
}

export default function Logo({ variant = 'default', size = 'md', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'text-xl sm:text-2xl',
    md: 'text-2xl sm:text-3xl lg:text-4xl',
    lg: 'text-3xl sm:text-4xl lg:text-5xl',
    xl: 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl',
    '2xl': 'text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl',
    '3xl': 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-[10rem] 2xl:text-[12rem]',
  }

  const colorClasses = {
    default: 'text-navy-900',
    light: 'text-white',
    dark: 'text-navy-900',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`flex items-baseline gap-1.5 sm:gap-2 ${className}`}
    >
      <span
        className={`${sizeClasses[size]} font-bold ${colorClasses[variant]} font-sans`}
        style={{ letterSpacing: '-0.03em', fontWeight: 700 }}
      >
        OMY
      </span>
      <span 
        className={`rounded-full bg-gold-600 ${
          size === 'sm' ? 'w-0.5 h-0.5 sm:w-1 sm:h-1' : 
          size === 'md' ? 'w-1 h-1 sm:w-1.5 sm:h-1.5' : 
          size === 'lg' ? 'w-1.5 h-1.5 sm:w-2 sm:h-2' :
          size === 'xl' ? 'w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3' :
          size === '2xl' ? 'w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4' :
          'w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6'
        }`}
      ></span>
      <span
        className={`${sizeClasses[size]} font-light ${colorClasses[variant]} font-sans`}
        style={{ 
          letterSpacing: '0.08em', 
          fontSize: size === 'sm' ? '0.7em' : size === 'md' ? '0.72em' : size === 'lg' ? '0.74em' : size === 'xl' ? '0.75em' : size === '2xl' ? '0.76em' : '0.77em',
          fontWeight: 300,
          opacity: variant === 'light' ? 0.95 : 0.85
        }}
      >
        TİCARET
      </span>
    </motion.div>
  )
}
