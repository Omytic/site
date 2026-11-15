// Panel güvenlik kuralları: şifre gücü ve hareketsizlikte çıkış

export const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000 // 8 saat işlem yapılmazsa oturum kapanır
const LAST_KEY = 'omy-panel-last-activity'

/** Şifre kurala uymuyorsa nedenini döner. */
export function passwordProblem(pw: string, username = '') {
  if (pw.length < 10) return 'Şifre en az 10 karakter olmalı.'
  if (!/[a-zçğıöşü]/.test(pw) || !/[A-ZÇĞİÖŞÜ]/.test(pw)) return 'Şifrede hem büyük hem küçük harf olmalı.'
  if (!/\d/.test(pw)) return 'Şifrede en az bir rakam olmalı.'
  const low = pw.toLocaleLowerCase('tr')
  if (low.includes('qweasd') || low.includes('123456') || low.includes('omytic') || low.includes('sifre') || low.includes('şifre')) return 'Bu şifre çok tahmin edilebilir, başka bir şifre seçin.'
  const u = username.trim().toLocaleLowerCase('tr')
  if (u && low.includes(u)) return 'Şifre kullanıcı adını içermemeli.'
  return null
}

export function markActivity() {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()))
  } catch {}
}
export function idleTooLong() {
  try {
    const v = Number(localStorage.getItem(LAST_KEY))
    return v > 0 && Date.now() - v > IDLE_LIMIT_MS
  } catch {
    return false
  }
}
export function clearActivity() {
  try {
    localStorage.removeItem(LAST_KEY)
  } catch {}
}
