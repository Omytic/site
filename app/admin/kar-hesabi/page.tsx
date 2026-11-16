'use client'

import { useMemo, useState } from 'react'
import { BRANDS } from '@/lib/panel/constants'
import { groupModels, modelTitle, Q, useItemsWithStock } from '@/lib/panel/data'
import { ProfitCalc } from '@/components/panel/ProfitCalc'
import { PageHeader, Select } from '@/components/panel/ui'

/** Serbest kâr / KDV hesabı: ürün seçilirse kartından dolar, seçilmezse elle girilir. */
export default function ProfitPage() {
  const { data: items } = useItemsWithStock()
  const costs = Q.channelCosts()
  const models = useMemo(() => groupModels((items ?? []).filter((i) => i.active)), [items])
  const [key, setKey] = useState('')
  const model = models.find((m) => m.key === key) ?? null
  return (
    <>
      <PageHeader
        title="Kâr ve KDV hesabı"
        subtitle="Bir adet satışta komisyon, kargo, KDV ve stopaj sonrası ne kalıyor? Devlete KDV mi ödersiniz, devlet mi size borçlu? Ürün seçerseniz fiyat, maliyet ve kanal giderleri kendiliğinden dolar."
      />
      <div className="mb-4 w-full sm:w-80">
        <Select value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">Serbest hesap (elle girin)</option>
          {BRANDS.map((b) => {
            const list = models.filter((m) => m.brand === b.id)
            if (!list.length) return null
            return (
              <optgroup key={b.id} label={b.label}>
                {list.map((m) => (
                  <option key={m.key} value={m.key}>
                    {modelTitle(m)}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </Select>
      </div>
      <ProfitCalc model={model} costs={costs.data} title={model ? `${modelTitle(model)} · bir adet` : 'Bir adet satış'} />
    </>
  )
}
