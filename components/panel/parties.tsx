'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS } from '@/lib/panel/constants'
import { AFTER, invalidate, partyKey, Q, write, type Party, type PartyKind } from '@/lib/panel/data'
import { Button, cx, Drawer, Field, Input, Select, Textarea, useUi } from './ui'

export const PARTY_KINDS: { id: PartyKind; label: string }[] = [
  { id: 'musteri', label: 'Müşteri' },
  { id: 'tedarikci', label: 'Tedarikçi' },
  { id: 'ikisi', label: 'Hem müşteri hem tedarikçi' },
]
export const SEGMENTS = [
  { id: 'toptan', label: 'Toptancı' },
  { id: 'magaza', label: 'Mağaza' },
  { id: 'bayi', label: 'Bayi' },
  { id: 'kurumsal', label: 'Kurumsal / üretici' },
  { id: 'bireysel', label: 'Bireysel' },
  { id: 'diger', label: 'Diğer' },
]
export const kindLabel = (k: string) => (k === 'ikisi' ? 'Müşteri + tedarikçi' : PARTY_KINDS.find((x) => x.id === k)?.label ?? k)
export const segmentLabel = (s: string | null) => SEGMENTS.find((x) => x.id === s)?.label ?? null
export const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, '').replace(/^0/, '90').replace(/^(?!90)(\d{10})$/, '90$1')}`
export const telLink = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
export const mapLink = (p: Pick<Party, 'address' | 'district' | 'city' | 'name'>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.address, p.district, p.city].filter(Boolean).join(', ') || p.name)}`

/**
 * Firma adı kutusu: kayıtlı carilerden seçtirir; yazılan ad bir cariyle eşleşirse kartına bağlantı gösterir.
 * Kayıtta eşleşme veritabanında kendiliğinden kurulur (Gezer = GEZER Ltd. Şti.).
 */
export function PartyNameInput({
  value,
  onChange,
  placeholder,
  kind,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  kind?: 'musteri' | 'tedarikci'
}) {
  const parties = Q.parties()
  const list = (parties.data ?? []).filter((p) => !kind || p.kind === kind || p.kind === 'ikisi')
  const k = partyKey(value)
  const match = k ? (parties.data ?? []).find((p) => partyKey(p.name) === k) : undefined
  const id = `cariler-${kind ?? 'hepsi'}`
  return (
    <div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={id} autoComplete="off" />
      <datalist id={id}>
        {list.map((p) => (
          <option key={p.id} value={p.name}>
            {[p.contact_name, p.city].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
      {match ? (
        <Link href={`/admin/cariler/${match.id}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1d5fb0] hover:underline">
          Cari kartı: {match.name}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ) : (
        value.trim().length > 2 && <p className="mt-1 text-xs text-ink-soft/50">Kayıtlı cari değil. İsterseniz Cariler sayfasından kart açın; geçmiş kayıtlar kendiliğinden bağlanır.</p>
      )}
    </div>
  )
}

type Draft = Partial<Party> & { name: string }

/** Yeni cari / cari düzenleme formu */
export function PartyForm({ party, initial, onClose, onSaved }: { party: Party | null; initial?: Partial<Party>; onClose: () => void; onSaved?: (id: string) => void }) {
  const { toast, confirm } = useUi()
  const src = party ?? initial ?? {}
  const [f, setF] = useState({
    name: src.name ?? '',
    kind: (src.kind ?? 'musteri') as PartyKind,
    segment: src.segment ?? '',
    brands: src.brands ?? [],
    status: src.status ?? 'aktif',
    contact_name: src.contact_name ?? '',
    phone: src.phone ?? '',
    email: src.email ?? '',
    website: src.website ?? '',
    instagram: src.instagram ?? '',
    city: src.city ?? '',
    district: src.district ?? '',
    address: src.address ?? '',
    tax_office: src.tax_office ?? '',
    tax_no: src.tax_no ?? '',
    iban: src.iban ?? '',
    payment_days: src.payment_days != null ? String(src.payment_days) : '',
    discount_pct: src.discount_pct != null ? String(src.discount_pct) : '',
    price_note: src.price_note ?? '',
    note: src.note ?? '',
  })
  const [more, setMore] = useState(!!(party && (party.tax_no || party.iban || party.website || party.instagram)))
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const toggleBrand = (b: string) => set({ brands: f.brands.includes(b) ? f.brands.filter((x) => x !== b) : [...f.brands, b] })
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const t = (v: string) => v.trim() || null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return toast('Firma adını yazın', 'error')
    setBusy(true)
    try {
      const row: Draft = {
        name: f.name.trim(),
        kind: f.kind,
        segment: f.segment || null,
        brands: f.brands,
        status: f.status as Party['status'],
        contact_name: t(f.contact_name),
        phone: t(f.phone),
        email: t(f.email),
        website: t(f.website),
        instagram: t(f.instagram)?.replace(/^@/, '') ?? null,
        city: t(f.city),
        district: t(f.district),
        address: t(f.address),
        tax_office: t(f.tax_office),
        tax_no: t(f.tax_no),
        iban: t(f.iban)?.replace(/\s+/g, '').toUpperCase() ?? null,
        payment_days: n(f.payment_days),
        discount_pct: n(f.discount_pct),
        price_note: t(f.price_note),
        note: t(f.note),
      }
      const res = party
        ? await write<Party[]>(supabase.from('parties').update(row).eq('id', party.id).select('id'))
        : await write<Party[]>(supabase.from('parties').insert(row).select('id'))
      const id = (res as any)?.[0]?.id ?? party?.id
      invalidate(...AFTER.parties, `party:${id}`)
      toast(party ? 'Cari güncellendi' : 'Cari kartı açıldı')
      onSaved?.(id)
      onClose()
    } catch (err: any) {
      toast(/parties_norm_name_uq|duplicate/.test(err.message) ? 'Bu adla bir cari zaten var' : err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!party || !(await confirm(`${party.name} kartı silinsin mi?`, 'Satış, alım ve fatura kayıtları silinmez; sadece bu karttan bağlantıları kalkar. Notlar, kişiler ve anlaşmalar silinir.', 'Kartı sil'))) return
    try {
      const { data: ag } = await supabase.from('party_agreements').select('file_path').eq('party_id', party.id)
      const files = (ag ?? []).map((a) => a.file_path).filter(Boolean) as string[]
      if (files.length) await supabase.storage.from('invoices').remove(files)
      await write(supabase.from('parties').delete().eq('id', party.id))
      invalidate(...AFTER.parties)
      toast('Cari silindi')
      onSaved?.('')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={party ? 'Cariyi düzenle' : 'Yeni cari'}
      footer={
        <>
          {party && (
            <Button type="button" variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="party-form" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="party-form" onSubmit={save} className="space-y-4">
        <Field label="Firma adı">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ör. Gezer Ayakkabı" autoFocus={!party} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ne ilişkimiz var">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as PartyKind })}>
              {PARTY_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Türü">
            <Select value={f.segment} onChange={(e) => set({ segment: e.target.value })}>
              <option value="">Seçilmedi</option>
              {SEGMENTS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Hangi markalarla çalışıyoruz">
          <div className="flex flex-wrap gap-1.5">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBrand(b.id)}
                className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition', f.brands.includes(b.id) ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>
        </Field>

        <p className="pt-1 text-xs font-bold uppercase tracking-wider text-ink-soft/50">İletişim</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Yetkili kişi">
            <Input value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} placeholder="Ad soyad" />
          </Field>
          <Field label="Telefon">
            <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" inputMode="tel" placeholder="05xx xxx xx xx" />
          </Field>
          <Field label="E-posta" className="sm:col-span-2">
            <Input value={f.email} onChange={(e) => set({ email: e.target.value })} type="email" />
          </Field>
          <Field label="Şehir">
            <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="İlçe">
            <Input value={f.district} onChange={(e) => set({ district: e.target.value })} />
          </Field>
          <Field label="Adres" className="sm:col-span-2">
            <Textarea rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Teslimat / fatura adresi" />
          </Field>
        </div>

        <p className="pt-1 text-xs font-bold uppercase tracking-wider text-ink-soft/50">Çalışma koşulları</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vade (gün)" hint="Satışta tahsilat günü bundan hesaplanır">
            <Input value={f.payment_days} onChange={(e) => set({ payment_days: e.target.value })} inputMode="numeric" placeholder="Peşin ise boş" />
          </Field>
          <Field label="Anlaşmalı indirim (%)">
            <Input value={f.discount_pct} onChange={(e) => set({ discount_pct: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Fiyat / koşul notu" className="sm:col-span-2">
            <Textarea rows={2} value={f.price_note} onChange={(e) => set({ price_note: e.target.value })} placeholder="Ör. FormStep koli fiyatı 210 TL + KDV, kargo bizden" />
          </Field>
        </div>

        {more ? (
          <>
            <p className="pt-1 text-xs font-bold uppercase tracking-wider text-ink-soft/50">Fatura ve diğer</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vergi dairesi">
                <Input value={f.tax_office} onChange={(e) => set({ tax_office: e.target.value })} />
              </Field>
              <Field label="Vergi / TC no">
                <Input value={f.tax_no} onChange={(e) => set({ tax_no: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="IBAN" className="sm:col-span-2">
                <Input value={f.iban} onChange={(e) => set({ iban: e.target.value })} placeholder="TR.." />
              </Field>
              <Field label="Web sitesi">
                <Input value={f.website} onChange={(e) => set({ website: e.target.value })} />
              </Field>
              <Field label="Instagram">
                <Input value={f.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@hesap" />
              </Field>
              {party && (
                <Field label="Durum" className="sm:col-span-2">
                  <Select value={f.status} onChange={(e) => set({ status: e.target.value as Party['status'] })}>
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif (artık çalışmıyoruz)</option>
                  </Select>
                </Field>
              )}
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1d5fb0] hover:underline">
            <Plus className="h-4 w-4" /> Vergi no, IBAN, web, Instagram ekle
          </button>
        )}
        <Field label="Not">
          <Textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Bu firma hakkında herkesin bilmesi gereken" />
        </Field>
      </form>
    </Drawer>
  )
}
