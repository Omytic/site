import { NextResponse } from 'next/server'

// İki adımlı doğrulama kaldırıldı (15 Kasım 2026); bu uç artık kullanılmıyor.
export const dynamic = 'force-dynamic'
export async function POST() {
  return NextResponse.json({ ok: false, message: 'İki adımlı doğrulama kullanılmıyor.' }, { status: 410 })
}
