import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { ADS_LWA } from '@/lib/integrations/amazonAds'

export const dynamic = 'force-dynamic'

const REDIRECT = () => `${process.env.NEXT_PUBLIC_SITE_URL || 'https://omytic.com'}/admin/amazon-ads-baglan`

/** GET: Amazon'un onay sayfasının adresi. POST {code}: kodu refresh token'a çevirir (yalnızca panel kullanıcısı). */
export async function GET(req: Request) {
  const db = adminClient()
  const who = await authorize(req, db)
  if (!who.ok) return NextResponse.json({ ok: false, message: who.message }, { status: who.status })
  if (!process.env.AMAZON_ADS_CLIENT_ID) return NextResponse.json({ ok: false, message: 'Önce AMAZON_ADS_CLIENT_ID ve AMAZON_ADS_CLIENT_SECRET Vercel’e eklenmeli.' }, { status: 400 })
  const u = new URL(process.env.AMAZON_ADS_AUTH_URL || 'https://eu.account.amazon.com/ap/oa')
  u.searchParams.set('client_id', process.env.AMAZON_ADS_CLIENT_ID)
  u.searchParams.set('scope', 'advertising::campaign_management')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', REDIRECT())
  return NextResponse.json({ ok: true, url: u.toString() })
}

export async function POST(req: Request) {
  const db = adminClient()
  const who = await authorize(req, db)
  if (!who.ok || !who.userId) return NextResponse.json({ ok: false, message: 'Yetkisiz' }, { status: 401 })
  const { code } = await req.json().catch(() => ({}))
  if (!code) return NextResponse.json({ ok: false, message: 'Kod yok' }, { status: 400 })
  const res = await fetch(ADS_LWA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT(), client_id: process.env.AMAZON_ADS_CLIENT_ID!, client_secret: process.env.AMAZON_ADS_CLIENT_SECRET! }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok || !b.refresh_token) return NextResponse.json({ ok: false, message: `Amazon: ${b.error_description || b.error || res.status}` }, { status: 502 })
  return NextResponse.json({ ok: true, refresh_token: b.refresh_token })
}
