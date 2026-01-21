'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, X, Plus, Edit2, Trash2, Upload, CheckCircle, AlertCircle } from 'lucide-react'
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

export default function AdminPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: '',
    category: 'kumaş' as 'kumaş' | 'diğer',
    amazon_link: '',
    features: '',
  })

  // Basit şifre kontrolü
  useEffect(() => {
    const stored = sessionStorage.getItem('admin_authenticated')
    if (stored === 'true') {
      setIsAuthenticated(true)
      fetchProducts()
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Basit şifre kontrolü - production'da daha güvenli bir yöntem kullanın
    // Şifre .env.local dosyasındaki ADMIN_PASSWORD değişkeninden alınır
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123'
    
    if (password === adminPassword) {
      setIsAuthenticated(true)
      sessionStorage.setItem('admin_authenticated', 'true')
      fetchProducts()
      setPassword('')
    } else {
      setError('Yanlış şifre!')
      setPassword('')
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('admin_authenticated')
    setPassword('')
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProducts(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    setError('')
    
    try {
      // Dosya adını oluştur (timestamp + random)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `products/${fileName}`

      // Supabase Storage'a yükle
      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // Public URL'i al
      const { data } = supabase.storage
        .from('products')
        .getPublicUrl(filePath)

      setFormData({ ...formData, image_url: data.publicUrl })
      setPreviewImage(data.publicUrl)
      setSuccessMessage('Görsel başarıyla yüklendi!')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Görsel yüklenirken bir hata oluştu')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Dosya tipi kontrolü
    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir görsel dosyası seçin')
      return
    }

    // Dosya boyutu kontrolü (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Dosya boyutu 5MB\'dan küçük olmalıdır')
      return
    }

    handleImageUpload(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setLoading(true)

    try {
      const productData = {
        name: formData.name,
        description: formData.description || null,
        image_url: formData.image_url || null,
        category: formData.category,
        amazon_link: formData.amazon_link || null,
        features: formData.features
          ? formData.features.split('\n').filter(f => f.trim())
          : null,
      }

      if (editingProduct) {
        // Eski görseli sil (eğer yeni görsel yüklendiyse)
        if (editingProduct.image_url && editingProduct.image_url !== formData.image_url) {
          // Storage'dan eski görseli sil
          const oldImagePath = editingProduct.image_url.split('/products/')[1]
          if (oldImagePath) {
            await supabase.storage
              .from('products')
              .remove([`products/${oldImagePath}`])
          }
        }

        // Güncelle
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) throw error
        setSuccessMessage('Ürün başarıyla güncellendi!')
      } else {
        // Yeni ekle
        const { error } = await supabase
          .from('products')
          .insert([productData])

        if (error) throw error
        setSuccessMessage('Ürün başarıyla eklendi!')
      }

      // Formu sıfırla
      setFormData({
        name: '',
        description: '',
        image_url: '',
        category: 'kumaş',
        amazon_link: '',
        features: '',
      })
      setPreviewImage(null)
      setEditingProduct(null)
      setShowForm(false)
      fetchProducts()
      
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }


  const handleDelete = async (id: string) => {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return

    setLoading(true)
    setError('')
    setSuccessMessage('')
    
    try {
      // Önce ürünü bul (görseli silmek için)
      const product = products.find(p => p.id === id)
      
      // Görseli storage'dan sil
      if (product?.image_url) {
        const imagePath = product.image_url.split('/products/')[1]
        if (imagePath) {
          await supabase.storage
            .from('products')
            .remove([`products/${imagePath}`])
        }
      }

      // Ürünü veritabanından sil
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setSuccessMessage('Ürün başarıyla silindi!')
      fetchProducts()
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Ürün silinirken bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: '',
      description: '',
      image_url: '',
      category: 'kumaş',
      amazon_link: '',
      features: '',
    })
    setPreviewImage(null)
    setEditingProduct(null)
    setShowForm(false)
    setError('')
    setSuccessMessage('')
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      description: product.description || '',
      image_url: product.image_url || '',
      category: product.category,
      amazon_link: product.amazon_link || '',
      features: product.features?.join('\n') || '',
    })
    setPreviewImage(product.image_url || null)
    setShowForm(true)
    setError('')
    setSuccessMessage('')
  }

  // Giriş ekranı
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-luxury-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-navy-900 text-gold-400 mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-navy-900">
              Admin Paneli
            </h1>
            <p className="text-anthracite-600 mt-2">Lütfen şifrenizi girin</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifre"
                className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-navy-900 hover:bg-navy-800 text-white font-semibold rounded-lg transition-colors"
            >
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Ana admin paneli
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        )}
        {error && !showForm && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-luxury p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-navy-900">
                Ürün Yönetimi
              </h1>
              <p className="text-anthracite-600 mt-1">
                Toplam {products.length} ürün
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  handleCancel()
                  setShowForm(true)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gold-600 hover:bg-gold-500 text-navy-900 font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                Yeni Ürün
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 border border-anthracite-300 hover:bg-anthracite-50 text-anthracite-700 font-medium rounded-lg transition-colors"
              >
                Çıkış
              </button>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-luxury-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-anthracite-100 flex items-center justify-between">
                <h2 className="text-2xl font-serif font-bold text-navy-900">
                  {editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
                </h2>
                <button
                  onClick={handleCancel}
                  className="p-2 hover:bg-anthracite-50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-anthracite-600" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Ürün Adı *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Açıklama
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Görsel
                  </label>
                  
                  {/* Görsel Yükleme */}
                  <div className="space-y-3">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-anthracite-300 rounded-lg cursor-pointer bg-anthracite-50 hover:bg-anthracite-100 transition-colors">
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600"></div>
                          <span className="text-sm text-anthracite-600">Yükleniyor...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-anthracite-400" />
                          <span className="text-sm text-anthracite-600">
                            Görsel Yükle (Max 5MB)
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>

                    {/* Önizleme */}
                    {(previewImage || formData.image_url) && (
                      <div className="relative">
                        <img
                          src={previewImage || formData.image_url}
                          alt="Önizleme"
                          className="w-full h-48 object-cover rounded-lg border border-anthracite-200"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewImage(null)
                            setFormData({ ...formData, image_url: '' })
                          }}
                          className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Manuel URL Girişi (Alternatif) */}
                    <div>
                      <p className="text-xs text-anthracite-500 mb-1">veya URL ile ekle:</p>
                      <input
                        type="text"
                        value={formData.image_url}
                        onChange={(e) => {
                          setFormData({ ...formData, image_url: e.target.value })
                          setPreviewImage(e.target.value || null)
                        }}
                        placeholder="https://..."
                        className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Kategori *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'kumaş' | 'diğer' })}
                    className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
                    required
                  >
                    <option value="kumaş">Kumaş</option>
                    <option value="diğer">Diğer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Amazon Linki
                  </label>
                  <input
                    type="text"
                    value={formData.amazon_link}
                    onChange={(e) => setFormData({ ...formData, amazon_link: e.target.value })}
                    placeholder="https://www.amazon.com.tr/..."
                    className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-anthracite-700 mb-1">
                    Özellikler (Her satıra bir özellik)
                  </label>
                  <textarea
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    rows={5}
                    placeholder="Özellik 1&#10;Özellik 2&#10;Özellik 3"
                    className="w-full px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-gold-600 hover:bg-gold-500 text-navy-900 font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Kaydediliyor...' : editingProduct ? 'Güncelle' : 'Ekle'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 border border-anthracite-300 hover:bg-anthracite-50 text-anthracite-700 font-medium rounded-lg transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Ürün Listesi */}
        {loading && !showForm ? (
          <div className="text-center py-12 text-anthracite-600">Yükleniyor...</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-luxury p-12 text-center">
            <p className="text-anthracite-600">Henüz ürün eklenmemiş.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-xl shadow-luxury p-6 border border-anthracite-100 hover:shadow-luxury-lg transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Görsel Önizleme */}
                  {product.image_url && (
                    <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-anthracite-50 border border-anthracite-200">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-serif font-bold text-navy-900">
                        {product.name}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-anthracite-100 text-anthracite-700 whitespace-nowrap">
                        {product.category}
                      </span>
                    </div>
                    {product.description && (
                      <p className="text-anthracite-600 mb-2 text-sm line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    {product.amazon_link && (
                      <a
                        href={product.amazon_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gold-600 hover:text-gold-700 inline-flex items-center gap-1"
                      >
                        Amazon Linki →
                      </a>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(product)}
                      disabled={loading}
                      className="p-2 hover:bg-anthracite-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Düzenle"
                    >
                      <Edit2 className="w-5 h-5 text-anthracite-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      disabled={loading}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Sil"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
