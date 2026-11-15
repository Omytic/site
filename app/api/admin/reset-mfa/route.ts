import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'

export const dynamic = 'force-dynamic'

/**
 * Telefonunu kaybeden / değiştiren kardeşin iki adımlı doğrulamasını sıfırlar.
 * Sadece iki adımlı doğrulamayla girmiş başka bir panel kullanıcısı yapabilir (kendi kendini sıfırlayamaz).
 * Sıfırlanan kişi bir sonraki girişte yeni QR okutur. Düzenleme geçmişine yazılır.
 */
export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 })
  }
  const who = await authorize(req, db)
  if (!who.ok || !who.userId) return NextResponse.json({ ok: false, message: who.ok ? 'Oturum gerekli' : who.message }, { status: who.ok ? 401 : who.status })
  const { userId } = await req.json().catch(() => ({ userId: null }))
  if (!userId || userId === who.userId) return NextResponse.json({ ok: false, message: 'Kendi doğrulamanızı sıfırlayamazsınız; başka bir kardeşin yapması gerekir.' }, { status: 400 })
  const { data: target } = await db.from('profiles').select('id,full_name').eq('id', userId).maybeSingle()
  if (!target) return NextResponse.json({ ok: false, message: 'Kullanıcı bulunamadı' }, { status: 404 })

  const { data: factors, error } = await db.auth.admin.mfa.listFactors({ userId })
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  for (const f of factors?.factors ?? []) {
    const { error: e2 } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId })
    if (e2) return NextResponse.json({ ok: false, message: e2.message }, { status: 500 })
  }
  await db.from('audit_log').insert({ user_id: who.userId, table_name: 'profiles', row_id: userId, action: 'UPDATE', old_data: { iki_adimli_dogrulama: 'açık' }, new_data: { iki_adimli_dogrulama: 'sıfırlandı', kisi: target.full_name } })
  return NextResponse.json({ ok: true, removed: factors?.factors?.length ?? 0 })
}
