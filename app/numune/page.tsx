import type { Metadata } from 'next'
import { SamplePage } from '@/components/site/LeadPage'

export const metadata: Metadata = {
  title: 'Ücretsiz kumaş numunesi | OMY Ticaret',
  description: 'Döşemelik kumaş renklerinin numunesini adresinize gönderelim. Alcantara, Welsoft, Airfile ve daha fazlası.',
}

export default function Page() {
  return <SamplePage />
}
