'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, MessageCircle, Mail, Phone, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import ProductModal from '@/components/ProductModal'
import Footer from '@/components/Footer'
import Logo from '@/components/Logo'
import { supabase } from '@/lib/supabase'

interface Product {
  id: string
  name: string
  description: string | null
  image_url: string | null
  category: 'kumaş' | 'diğer'
  amazon_link: string | null
  features: string[] | null
}

export default function Home() {
  const [fabrics, setFabrics] = useState<Product[]>([])
  const [otherProducts, setOtherProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setError(null)
      
      // Supabase bağlantısını kontrol et
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
        console.warn('Supabase bağlantısı yapılandırılmamış. Test verileri kullanılıyor.')
        // Test verileri - Supabase bağlantısı yoksa bunları göster
        const mockFabrics: Product[] = [
          {
            id: '1',
            name: 'Airfile Kumaş',
            description: 'Hava geçirgenliği yüksek, teknik dokuma',
            image_url: '/images/airfile.jpg',
            category: 'kumaş',
            amazon_link: null,
            features: ['Hava geçirgenliği yüksek', 'Teknik dokuma', 'Nefes alabilir yapı', 'Dayanıklı']
          },
          {
            id: '2',
            name: 'Alcantara Kumaş',
            description: 'Yumuşak dokulu, lüks ve dayanıklı döşemelik',
            image_url: '/images/alcantara.jpg',
            category: 'kumaş',
            amazon_link: null,
            features: ['Yumuşak dokulu', 'Lüks görünüm', 'Dayanıklı', 'Döşemelik için ideal']
          },
          {
            id: '3',
            name: 'Welsoft Kumaş',
            description: 'Sıcak tutan, yumuşak ve anti-bakteriyel doku',
            image_url: '/images/welsoft.png',
            category: 'kumaş',
            amazon_link: null,
            features: ['Sıcak tutan', 'Yumuşak doku', 'Anti-bakteriyel', 'Rahat kullanım']
          }
        ]
        
        const mockOther: Product[] = [
          {
            id: '4',
            name: 'FormStep M900 Memory Foam İç Ayakkabı Tabanlık',
            description: 'Ortopedik, topuk dikeni için rahat, koşu ve konfor için darbe emici memory foam tabanlık. Ayak sağlığınız için ideal çözüm.',
            image_url: '/images/tabanlik.jpeg',
            category: 'diğer',
            amazon_link: 'https://amzn.eu/d/6zPNjFa',
            features: ['Memory Foam teknolojisi', 'Ortopedik destek', 'Topuk dikeni için ideal', 'Darbe emici yapı']
          },
          {
            id: '5',
            name: 'Banyo Paspası',
            description: 'Kaliteli banyo paspası',
            image_url: '/images/paspas.jpeg',
            category: 'diğer',
            amazon_link: null,
            features: ['Su emici özellik', 'Kaymaz taban', 'Kolay temizlik']
          }
        ]
        
        setFabrics(mockFabrics)
        setOtherProducts(mockOther)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase hatası:', error)
        setError(`Veritabanı hatası: ${error.message}`)
        throw error
      }

      console.log('Çekilen veriler:', data)

      // Kategorilere göre ayır - sadece 'kumaş' kategorisindekiler
      const fabricsData = (data || []).filter(p => p.category === 'kumaş')
      // Sadece 'diğer' kategorisindekiler
      const otherData = (data || []).filter(p => p.category === 'diğer')

      console.log('Kumaşlar:', fabricsData)
      console.log('Diğer ürünler:', otherData)

      setFabrics(fabricsData)
      setOtherProducts(otherData)
    } catch (err: any) {
      console.error('Ürünler yüklenirken hata:', err)
      setError(err?.message || 'Ürünler yüklenirken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedProduct(null)
  }

  return (
    <main className="min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <section id="ana-sayfa" className="relative min-h-screen flex items-center bg-gradient-to-br from-navy-950 via-navy-900 to-anthracite-900 text-white overflow-hidden pt-20">
        {/* Görsel Arka Plan - Sağ Taraf */}
        <div className="absolute right-0 top-0 bottom-0 w-full lg:w-1/2 xl:w-2/5 overflow-hidden">
          {/* Tekstil dokusu görseli - placeholder, gerçek görsel eklenebilir */}
          <div className="absolute inset-0 bg-gradient-to-br from-navy-900/40 via-anthracite-900/30 to-navy-950/50">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold-600/20 via-transparent to-transparent"></div>
            {/* Placeholder - gerçek görsel için: */}
            {/* <img src="/images/hero-texture.jpg" alt="" className="w-full h-full object-cover object-left" /> */}
            <div className="w-full h-full bg-gradient-to-br from-beige-300/10 via-anthracite-200/5 to-navy-800/20" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(212, 175, 55, 0.03) 10px, rgba(212, 175, 55, 0.03) 20px)'
            }}></div>
          </div>
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/80 to-transparent"></div>
        </div>

        {/* İçerik - Sol Taraf */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32 w-full">
          <div className="max-w-2xl">
            {/* Minimal Logo */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mb-8"
            >
              <Logo variant="light" size="md" />
            </motion.div>

            {/* Ana Başlık */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-serif font-bold leading-[1.1] text-white mb-8"
              style={{ letterSpacing: '-0.02em' }}
            >
              Kaliteli
              <br />
              <span className="text-gold-400">Toptan Ticaret</span>
            </motion.h1>

            {/* Butonlar */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row gap-4 mb-12"
            >
              <a
                href="#kumaslarimiz"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-gold-600 hover:bg-gold-500 text-navy-900 font-semibold rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg"
              >
                Ürünlerimizi İnceleyin
                <ChevronDown className="w-5 h-5 group-hover:translate-y-1 transition-transform" />
              </a>
              <a
                href="https://wa.me/905535886936?text=Merhaba,%20OMY%20Ticaret%20hakkında%20bilgi%20almak%20istiyorum."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 hover:border-white/50 text-white font-semibold rounded-lg transition-all duration-300 backdrop-blur-sm hover:bg-white/10"
              >
                <MessageCircle className="w-5 h-5" />
                Hızlı İletişim
              </a>
            </motion.div>
          </div>
        </div>

        {/* Alt Geçiş */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent z-10"></div>
      </section>

      {/* Hakkımızda Özet Kartı - Hero'nun Hemen Altında */}
      <section className="relative -mt-16 z-20">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6 }}
            className="bg-white rounded-2xl shadow-luxury-xl p-8 sm:p-10 lg:p-12 border border-anthracite-100"
          >
            <div className="max-w-3xl">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-navy-900 mb-4">
                OMY Ticaret: <span className="text-gold-600">Kalite, Hız ve Güven</span>
              </h2>
              <p className="text-anthracite-700 leading-relaxed text-base sm:text-lg">
                OMY Ticaret; kaliteli ürün yelpazesi ve hızlı tedarik zinciriyle, müşterilerinin ihtiyaçlarına özel çözümler sunan güvenilir bir iş ortağıdır. İlk günden bu yana gelişmelerle kendini sürekli yenileyen firmamız, yılların verdiği tecrübeli kadrosuyla kumaştan tabanlığa kadar birçok alanda fark yaratmaktadır.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Kumaşlarımız Section */}
      <section id="kumaslarimiz" className="py-16 sm:py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 sm:mb-16 space-y-4"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-navy-900">
              Kumaşlarımız
            </h2>
            <p className="text-base sm:text-lg text-anthracite-600 max-w-2xl mx-auto px-4">
              Geniş ürün yelpazemizle ihtiyacınıza uygun en kaliteli kumaşları bulabilirsiniz.
            </p>
          </motion.div>

          {loading ? (
            <div className="text-center py-12 text-anthracite-600">Yükleniyor...</div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <p className="text-anthracite-600 text-sm">Supabase bağlantısını kontrol edin veya admin panelinden ürün ekleyin.</p>
            </div>
          ) : fabrics.length === 0 ? (
            <div className="text-center py-12 text-anthracite-600">Henüz kumaş eklenmemiş.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {fabrics.map((fabric, index) => (
                <motion.div
                  key={fabric.id}
                  initial={{ opacity: 0, y: 40, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => handleProductClick(fabric)}
                  className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-anthracite-100 hover:border-gold-300/50 transition-all duration-300 hover:shadow-luxury-xl hover:scale-[1.02]"
                >
                  <div className="relative aspect-square overflow-hidden bg-anthracite-50">
                    {fabric.image_url ? (
                      <>
                        <img
                          src={fabric.image_url}
                          alt={fabric.name}
                          className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 shadow-inner-luxury pointer-events-none"></div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-anthracite-300 text-sm">
                        Görsel Yok
                      </div>
                    )}
                  </div>
                  <div className="p-4 sm:p-6">
                    <h3 className="text-lg sm:text-xl font-serif font-bold text-navy-900 mb-2 group-hover:text-gold-600 transition-colors">
                      {fabric.name}
                    </h3>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Diğer Ürünlerimiz Section */}
      <section id="urunlerimiz" className="py-16 sm:py-20 lg:py-32 bg-gradient-to-br from-anthracite-50 to-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-12 sm:mb-16 space-y-4"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-navy-900">
              Diğer Ürünlerimiz
            </h2>
            <p className="text-base sm:text-lg text-anthracite-600 max-w-2xl mx-auto px-4">
              Paspas ve tabanlık gibi çeşitli ürünlerimizi keşfedin.
            </p>
          </motion.div>

          {loading ? (
            <div className="text-center py-12 text-anthracite-600">Yükleniyor...</div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <p className="text-anthracite-600 text-sm">Supabase bağlantısını kontrol edin veya admin panelinden ürün ekleyin.</p>
            </div>
          ) : otherProducts.length === 0 ? (
            <div className="text-center py-12 text-anthracite-600">Henüz ürün eklenmemiş.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {otherProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 40, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="group bg-white rounded-2xl overflow-hidden border border-anthracite-100 hover:border-gold-300/50 transition-all duration-300 hover:shadow-luxury-xl hover:scale-[1.02]"
                >
                  <div
                    onClick={() => handleProductClick(product)}
                    className="cursor-pointer"
                  >
                    <div className="relative aspect-square overflow-hidden bg-anthracite-50">
                      {product.image_url ? (
                        <>
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 shadow-inner-luxury pointer-events-none"></div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-anthracite-300 text-sm">
                          Görsel Yok
                        </div>
                      )}
                    </div>
                    <div className="p-4 sm:p-6">
                      <h3 className="text-lg sm:text-xl font-serif font-bold text-navy-900 mb-2 group-hover:text-gold-600 transition-colors">
                        {product.name}
                      </h3>
                    </div>
                  </div>
                  {/* Amazon linki varsa ve boş değilse butonu göster */}
                  {product.amazon_link && product.amazon_link.trim() !== '' && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                      <a
                        href={product.amazon_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 w-full justify-center px-4 py-3 bg-amazon hover:bg-amazon-hover text-white font-semibold rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg text-sm sm:text-base"
                      >
                        Amazon'da Satın Al
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Hakkımızda Section - Detaylı */}
      <section id="hakkimizda" className="py-16 sm:py-20 lg:py-32 bg-gradient-to-br from-beige-50 via-anthracite-50 to-beige-50">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Metin Bölümü */}
            <motion.div
              initial={{ opacity: 0, x: -40, scale: 0.98 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="space-y-4 text-anthracite-700 leading-relaxed text-base sm:text-lg">
                <p>
                  Ürünlerimizi kalite, estetik ve dayanıklılığı bir arada sunma amacıyla özenle seçmekte ve siz müşterilerimizin ihtiyacı olan ürünü en kısa sürede, en doğru şekilde temin edebilmek için hem üretim hem lojistik süreçlerinde etkin çözümler geliştirmekteyiz.
                </p>
                <p className="font-medium text-navy-900">
                  OMY Ticaret olarak sadece mal alım-satımı değil; güven, istikrar ve memnuniyet inşa etme amacıyla yola çıkıyoruz.
                </p>
                <p className="text-lg sm:text-xl font-serif font-semibold text-gold-600 pt-4 border-t border-gold-200">
                  OMY Ticaret olarak, sadece ürün değil; kalite, hız ve güven sunuyoruz.
                </p>
              </div>
            </motion.div>

            {/* Görsel Bölümü */}
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.98 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-luxury-xl bg-gradient-to-br from-navy-900/10 to-anthracite-900/10 group">
                <img
                  src="/images/kumas.jpg"
                  alt="OMY Ticaret Kumaş Dokuları"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
                {/* Dekoratif pattern overlay */}
                <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,_rgba(0,0,0,0.15)_1px,_transparent_0)] bg-[length:20px_20px]"></div>
              </div>
              {/* Dekoratif elementler */}
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-gold-600/10 rounded-full blur-3xl -z-10"></div>
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-navy-900/5 rounded-full blur-2xl -z-10"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* İletişim Section */}
      <section id="iletisim" className="py-16 sm:py-20 lg:py-32 bg-gradient-to-br from-anthracite-50 via-beige-50 to-anthracite-50 relative overflow-hidden">
        {/* Dekoratif arka plan dokusu */}
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_2px_2px,_rgba(0,0,0,0.15)_1px,_transparent_0)] bg-[length:40px_40px]"></div>
        
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          {/* Başlık */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-12 sm:mb-16"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-navy-900 mb-4">
              İletişim
            </h2>
            <p className="text-base sm:text-lg text-anthracite-600 max-w-2xl mx-auto">
              Sipariş, iş birliği talepleri veya sorularınız için bizimle dilediğiniz zaman iletişime geçebilirsiniz.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Sol: İletişim Bilgileri */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="space-y-6">
                {/* E-posta */}
                <a
                  href="mailto:info@omytic.com?subject=İletişim%20Talebi&body=Merhaba,%20"
                  className="flex items-start gap-4 p-6 bg-white rounded-xl shadow-luxury hover:shadow-luxury-lg transition-all duration-300 group border border-anthracite-100 hover:border-gold-300/50"
                >
                  <div className="w-12 h-12 rounded-lg bg-gold-600/10 group-hover:bg-gold-600/20 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Mail className="w-6 h-6 text-gold-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-anthracite-500 mb-1">E-posta</h3>
                    <p className="text-lg font-medium text-navy-900 group-hover:text-gold-600 transition-colors">
                      info@omytic.com
                    </p>
                  </div>
                </a>

                {/* Telefon */}
                <a
                  href="tel:+905535886936"
                  className="flex items-start gap-4 p-6 bg-white rounded-xl shadow-luxury hover:shadow-luxury-lg transition-all duration-300 group border border-anthracite-100 hover:border-gold-300/50"
                >
                  <div className="w-12 h-12 rounded-lg bg-gold-600/10 group-hover:bg-gold-600/20 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Phone className="w-6 h-6 text-gold-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-anthracite-500 mb-1">Telefon</h3>
                    <p className="text-lg font-medium text-navy-900 group-hover:text-gold-600 transition-colors">
                      +90 553 588 69 36
                    </p>
                  </div>
                </a>

                {/* WhatsApp */}
                <a
                  href="https://wa.me/905535886936?text=Merhaba,%20OMY%20Ticaret%20hakkında%20bilgi%20almak%20istiyorum."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 p-6 bg-white rounded-xl shadow-luxury hover:shadow-luxury-lg transition-all duration-300 group border border-anthracite-100 hover:border-gold-300/50"
                >
                  <div className="w-12 h-12 rounded-lg bg-[#25D366]/10 group-hover:bg-[#25D366]/20 flex items-center justify-center flex-shrink-0 transition-colors">
                    <MessageCircle className="w-6 h-6 text-[#25D366]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-anthracite-500 mb-1">WhatsApp</h3>
                    <p className="text-lg font-medium text-navy-900 group-hover:text-[#25D366] transition-colors">
                      Hızlı Mesajlaşma
                    </p>
                  </div>
                </a>
              </div>
            </motion.div>

            {/* Sağ: İletişim Formu */}
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.98 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // Form gönderimi - mailto ile gönderilebilir veya API'ye bağlanabilir
                  const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value
                  const message = (e.currentTarget.elements.namedItem('message') as HTMLTextAreaElement).value
                  const subject = encodeURIComponent('İletişim Formu - OMY Ticaret')
                  const body = encodeURIComponent(`Ad-Soyad: ${name}\n\nMesaj:\n${message}`)
                  window.location.href = `mailto:info@omytic.com?subject=${subject}&body=${body}`
                }}
                className="bg-white rounded-xl shadow-luxury-lg p-6 sm:p-8 border border-anthracite-100 space-y-6"
              >
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-anthracite-700 mb-2">
                    Ad-Soyad *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                    placeholder="Adınız ve Soyadınız"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-anthracite-700 mb-2">
                    Mesaj *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all resize-none"
                    placeholder="Mesajınızı buraya yazın..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-gold-600 hover:bg-gold-500 text-navy-900 font-semibold rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg flex items-center justify-center gap-2"
                >
                  <Mail className="w-5 h-5" />
                  <span>Mesaj Gönder</span>
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        product={selectedProduct}
      />
    </main>
  )
}
