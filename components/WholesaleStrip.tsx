// Toptan sipariş akışı — gerçekten sıralı olduğu için numaralı.
const steps = [
  {
    title: 'İhtiyacınızı yazın',
    text: 'Kumaş türü, renk ve yaklaşık miktarı WhatsApp ya da e-postayla iletin.',
  },
  {
    title: 'Fiyat ve termin alın',
    text: 'Stok durumuna göre size özel toptan fiyatı ve teslim süresini bildirelim.',
  },
  {
    title: 'Sevkiyat',
    text: 'Onayınızın ardından siparişiniz hazırlanır ve en kısa sürede yola çıkar.',
  },
]

export default function WholesaleStrip() {
  return (
    <section id="nasil-calisiyoruz" className="border-y border-line bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8 lg:grid-cols-[0.8fr_2fr] lg:px-12">
        <h2 className="stretch-wide text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Toptan sipariş nasıl ilerler?
        </h2>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-white p-6 sm:p-7">
              <span className="block text-5xl font-extrabold leading-none text-saffron stretch-narrow">{i + 1}</span>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-stone">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
