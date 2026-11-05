interface LogoProps {
  variant?: 'default' | 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  className?: string
}

const sizes = {
  sm: 'text-xl',
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
  xl: 'text-4xl sm:text-5xl',
  '2xl': 'text-5xl sm:text-6xl',
  '3xl': 'text-6xl sm:text-7xl',
}

// OMY kelime markası: geniş kesim "OMY", safran nokta, dar kesim "Ticaret".
export default function Logo({ variant = 'default', size = 'md', className = '' }: LogoProps) {
  const color = variant === 'light' ? 'text-white' : 'text-ink'
  return (
    <span className={`inline-flex items-baseline gap-[0.18em] leading-none ${sizes[size]} ${color} ${className}`}>
      <span className="font-extrabold stretch-wide tracking-tight">OMY</span>
      <span aria-hidden className="inline-block h-[0.2em] w-[0.2em] rounded-full bg-saffron" />
      <span className="text-[0.62em] font-medium stretch-narrow tracking-wide opacity-80">Ticaret</span>
    </span>
  )
}
