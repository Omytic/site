'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Copy, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Card, PageHeader, useUi } from '@/components/panel/ui'

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

function Inner() {
  const { toast } = useUi()
  const params = useSearchParams()
  const code = params.get('code')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState('')
  const [err, setErr] = useState(params.get('error_description') ?? '')

  useEffect(() => {
    if (!code) return
    ;(async () => {
      setBusy(true)
      try {
        const res = await fetch('/api/amazon-ads/baglan', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
        const b = await res.json()
        if (!b.ok) throw new Error(b.message)
        setRefresh(b.refresh_token)
        // Kod bir kez kullanılır; adres çubuğundan temizlenir
        window.history.replaceState(null, '', '/admin/amazon-ads-baglan')
      } catch (e: any) {
        setErr(e.message)
      } finally {
        setBusy(false)
      }
    })()
  }, [code])

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/amazon-ads/baglan', { headers: { Authorization: `Bearer ${await token()}` } })
      const b = await res.json()
      if (!b.ok) throw new Error(b.message)
      window.location.href = b.url
    } catch (e: any) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Amazon Ads bağlantısı" subtitle="Amazon reklam API başvurunuz onaylandıktan sonra bir kez yapılır. Amazon’da reklam hesabının sahibi olan kullanıcıyla onay verin." />
      <Card className="max-w-2xl">
        {refresh ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-[#0a7d0a]">Bağlantı onaylandı. Bu değeri Vercel’e <code>AMAZON_ADS_REFRESH_TOKEN</code> olarak ekleyin, sonra Redeploy yapın.</p>
            <textarea readOnly value={refresh} rows={4} className="w-full rounded-xl bg-[#F7F6F2] p-3 font-mono text-xs ring-1 ring-line" />
            <Button
              icon={<Copy className="h-4 w-4" />}
              onClick={() => {
                navigator.clipboard.writeText(refresh)
                toast('Kopyalandı.')
              }}
            >
              Kopyala
            </Button>
            <p className="text-xs text-ink-soft/60">Bu değer bir daha gösterilmez; sayfadan çıkınca kaybolur. Kimseyle paylaşmayın.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {err && <p className="rounded-xl bg-[#FDECEC] px-4 py-3 text-[#8a1f1f]">{err}</p>}
            <p>Basınca Amazon’un onay sayfası açılır. Onay verince buraya geri dönersiniz ve anahtar gösterilir.</p>
            <Button onClick={start} loading={busy} icon={<ExternalLink className="h-4 w-4" />}>
              Amazon Ads’i bağla
            </Button>
          </div>
        )}
      </Card>
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
