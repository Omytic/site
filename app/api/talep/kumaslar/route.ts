import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/integrations/server'

export const revalidate = 300

/** Numune formu için aktif kumaşlar ve renkleri (fiyat, maliyet, stok gönderilmez). */
export async function GET() {
  try {
    const db = adminClient()
    const { data, error } = await db.from('items').select('id,name,variant,color').eq('brand', 'kumas').eq('active', true).order('name').order('variant')
    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
