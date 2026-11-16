import type { Metadata } from 'next'
import { QuotePage } from '@/components/site/LeadPage'

export const metadata: Metadata = {
  title: 'Toptan teklif ve bayilik | OMY Ticaret',
  description: 'Kumaş, FormStep tabanlık ve SERYN için toptan fiyat teklifi isteyin ya da bayilik başvurusu yapın.',
}

export default function Page() {
  return <QuotePage />
}
