'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BRANDS, UNITS, type Brand } from '@/lib/panel/constants'
import { AFTER, invalidate, write, type ItemWithStock } from '@/lib/panel/data'
import { tl } from '@/lib/panel/format'
import { Button, Drawer, Field, Input, Select, Textarea, useUi } from './ui'

/** Ürün kartı: yeni ürün, mevcut modele yeni varyant (id'si boş kayıt) ya da varyant düzenleme. */
export function ItemForm({
  item: given,
  onClose,
  defaultBrand,
  onSaved,
}: {
  item: ItemWithStock | null
  onClose: () => void
  /** Yeni üründe seçili gelecek marka (ör. Kumaşlar sayfasından açılınca kumaş). */
  defaultBrand?: Brand
  /** Kayıttan sonra yeni/güncellenen ürün id'leri (ör. alım formunda hemen satıra eklemek için). */
  onSaved?: (ids: string[]) => void
}) {
  const { toast, confirm } = useUi()
  // id'si boş gelen kayıt = mevcut modele yeni varyant (ad, marka, fiyat dolu gelir)
  const item = given?.id ? given : null
  const preset = given
  const [f, setF] = useState({
    name: preset?.name ?? '',
    brand: (preset?.brand ?? defaultBrand ?? 'kumas') as Brand,
    variant: item?.variant ?? '',
    color: preset?.color ?? '',
    sku: item?.sku ?? '',
    unit: preset?.unit ?? ((preset?.brand ?? defaultBrand ?? 'kumas') === 'kumas' ? 'metre' : 'adet'),
    cost: preset ? String(preset.cost) : '',
    vat_rate: preset ? String(preset.vat_rate ?? 20) : '20',
    price: preset ? String(preset.price) : '',
    min_stock: preset ? String(preset.min_stock) : '',
    active: item?.active ?? true,
    notes: item?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // Alım formunun içinden açıldığında dıştaki formu da göndermesin
    e.stopPropagation()
    setBusy(true)
    // Yeni üründe "36-37, 37-38, 38-39" gibi virgülle yazılırsa her numara ayrı varyant açılır
    const variants = item ? [f.variant.trim()] : f.variant.split(',').map((v) => v.trim()).filter(Boolean)
    if (variants.length > 1) {
      const rows = variants.map((v) => ({
        name: f.name.trim(),
        brand: f.brand,
        variant: v,
        color: f.color.trim() || null,
        sku: f.sku.trim() ? `${f.sku.trim()}-${v.replace(/[^0-9A-Za-z]/g, '')}${f.color.trim() ? `-${f.color.trim().slice(0, 3).toUpperCase()}` : ''}` : null,
        unit: f.unit,
        cost: Number(f.cost) || 0,
        vat_rate: Number(f.vat_rate) || 0,
        price: Number(f.price) || 0,
        min_stock: Number(f.min_stock) || 0,
        active: f.active,
        notes: f.notes || null,
      }))
      try {
        const made = await write<{ id: string }[]>(supabase.from('items').insert(rows).select('id'))
        invalidate(...AFTER.item)
        onSaved?.((made ?? []).map((r) => r.id))
        toast(`${rows.length} varyant açıldı. Açılış stoğunu "Toplu sayım"dan girebilirsiniz.`)
        onClose()
      } catch (err: any) {
        toast(err.message, 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    const row = {
      name: f.name.trim(),
      brand: f.brand,
      variant: f.variant.trim() || null,
      color: f.color.trim() || null,
      sku: f.sku.trim() || null,
      unit: f.unit,
      cost: Number(f.cost) || 0,
      vat_rate: Number(f.vat_rate) || 0,
      price: Number(f.price) || 0,
      min_stock: Number(f.min_stock) || 0,
      active: f.active,
      notes: f.notes || null,
    }
    try {
      const made = await write<{ id: string }[]>(item ? supabase.from('items').update(row).eq('id', item.id).select('id') : supabase.from('items').insert(row).select('id'))
      invalidate(...AFTER.item)
      onSaved?.((made ?? []).map((r) => r.id))
      toast(item ? 'Ürün güncellendi.' : 'Ürün eklendi. Açılış stoğunu "Toplu sayım"dan girebilirsiniz.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!item || !(await confirm('Ürün kartı silinsin mi?', 'Satış/alım kaydı olan ürünler silinemez; pasife alın.'))) return
    try {
      await write(supabase.from('items').delete().eq('id', item.id))
      invalidate(...AFTER.item)
      toast('Ürün silindi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={item ? 'Varyantı düzenle' : preset ? `${preset.name} · yeni varyant` : 'Yeni ürün kartı'}
      footer={
        <>
          {item && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="item-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as Brand, unit: e.target.value === 'kumas' ? 'metre' : 'adet' })}>
              {BRANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Birim">
            <Select value={f.unit} onChange={(e) => set({ unit: e.target.value as any })}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Ürün adı">
          <Input required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.brand === 'kumas' ? 'Alcantara' : 'Ürün adı'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={item ? 'Numara / varyant' : 'Numara / varyant'} hint={item ? 'Numara, gramaj, ebat…' : 'Birden çok numara için virgülle ayırın: 36-37, 37-38, 38-39'}>
            <Input value={f.variant} onChange={(e) => set({ variant: e.target.value })} placeholder={f.brand === 'kumas' ? '150 cm' : '40-41'} />
          </Field>
          <Field label="Renk" hint="Varsa. Aynı model farklı renkte ayrı varyant olur.">
            <Input value={f.color} onChange={(e) => set({ color: e.target.value })} placeholder={f.brand === 'kumas' ? 'Lacivert' : 'Siyah'} />
          </Field>
          <Field label="SKU / kod" hint={!item && f.variant.includes(',') ? 'Her numaraya sonuna numara eklenerek verilir.' : undefined}>
            <Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} />
          </Field>
          <Field label="Birim maliyet, KDV hariç (₺)" hint={Number(f.cost) > 0 ? `KDV dahil ${tl((Number(f.cost) || 0) * (1 + (Number(f.vat_rate) || 0) / 100))}` : 'Alımlarda bu maliyet kullanılır.'}>
            <Input type="number" min="0" step="any" value={f.cost} onChange={(e) => set({ cost: e.target.value })} />
          </Field>
          <Field label="KDV %">
            <Select value={f.vat_rate} onChange={(e) => set({ vat_rate: e.target.value })}>
              {['0', '1', '10', '20'].map((v) => (
                <option key={v} value={v}>
                  %{v}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Satış fiyatı, KDV dahil (₺)"
            hint={Number(f.price) > 0 ? `KDV hariç ${tl(Number(f.price) / (1 + (Number(f.vat_rate) || 0) / 100))} · KDV ${tl(Number(f.price) - Number(f.price) / (1 + (Number(f.vat_rate) || 0) / 100))}` : undefined}
          >
            <Input type="number" min="0" step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Kritik stok sınırı" hint="Bunun altına düşünce uyarı verir.">
            <Input type="number" min="0" step="any" value={f.min_stock} onChange={(e) => set({ min_stock: e.target.value })} />
          </Field>
          <Field label="Durum">
            <Select value={f.active ? '1' : '0'} onChange={(e) => set({ active: e.target.value === '1' })}>
              <option value="1">Aktif</option>
              <option value="0">Pasif (listelerde gizlenir)</option>
            </Select>
          </Field>
        </div>
        <Field label="Not">
          <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}

