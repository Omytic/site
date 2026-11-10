'use client'

import { Suspense, type ReactNode } from 'react'
import { PanelAuth } from '@/lib/panel/auth'
import { UiProvider } from '@/components/panel/ui'
import Shell from '@/components/panel/Shell'

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-night">
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex items-baseline gap-1.5 text-white">
          <span className="font-display text-3xl font-black tracking-[-0.04em]">OMY</span>
          <span className="h-2 w-2 animate-pulse rounded-full bg-thread" />
        </span>
        <span className="h-0.5 w-28 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-1/3 animate-[shine_1.4s_ease-in-out_infinite] bg-thread" />
        </span>
      </div>
    </div>
  )
}

export default function AdminClient({ children }: { children: ReactNode }) {
  return (
    <UiProvider>
      <PanelAuth fallback={<Loading />}>
        <Shell>
          <Suspense fallback={null}>{children}</Suspense>
        </Shell>
      </PanelAuth>
    </UiProvider>
  )
}
