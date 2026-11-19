/*
 * Bildirim gönderimi: WhatsApp (Meta Cloud API) ve e-posta (Resend).
 *  WhatsApp: WHATSAPP_TOKEN (ya da META_ACCESS_TOKEN), WHATSAPP_PHONE_NUMBER_ID,
 *            WHATSAPP_TEMPLATE (varsayılan gunluk_ozet), WHATSAPP_TEMPLATE_LANG (varsayılan tr)
 *  E-posta:  RESEND_API_KEY, NOTIFY_FROM (varsayılan "OMY Panel <bildirim@omytic.com>")
 */

const GRAPH = process.env.META_GRAPH_URL || 'https://graph.facebook.com/v25.0'

export const waToken = () => process.env.WHATSAPP_TOKEN || process.env.META_ACCESS_TOKEN
export const whatsappConfigured = () => !!(waToken() && process.env.WHATSAPP_PHONE_NUMBER_ID)
export const emailConfigured = () => !!process.env.RESEND_API_KEY

/** 0532 123 45 67 / +90 532… / 532… → 905321234567 */
export function e164(phone: string) {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '90' + d.slice(1)
  if (d.length === 10) d = '90' + d
  return d
}

async function wa(body: object) {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${waToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = b.error ?? {}
    // 131047: 24 saat geçti, serbest mesaj gönderilemez; 132001: şablon yok / onaylanmamış
    throw new Error(`WhatsApp ${res.status}${e.code ? ` (${e.code})` : ''}: ${e.error_data?.details ?? e.message ?? 'gönderilemedi'}`)
  }
  return String(b.messages?.[0]?.id ?? '')
}

/** Onaylı şablonla mesaj (firma ilk yazıyorsa zorunlu). */
export function sendWhatsAppTemplate(to: string, params: string[], template = process.env.WHATSAPP_TEMPLATE || 'gunluk_ozet') {
  return wa({
    to: e164(to),
    type: 'template',
    template: {
      name: template,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'tr' },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    },
  })
}

/** Serbest metin: yalnızca kişi son 24 saatte bize yazdıysa gider. */
export function sendWhatsAppText(to: string, text: string) {
  return wa({ to: e164(to), type: 'text', text: { body: text.slice(0, 4096), preview_url: false } })
}

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'OMY Panel <bildirim@omytic.com>', to: [to], subject, html, text }),
    cache: 'no-store',
  })
  const b = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`E-posta ${res.status}: ${b.message ?? b.name ?? 'gönderilemedi'}`)
  return String(b.id ?? '')
}
