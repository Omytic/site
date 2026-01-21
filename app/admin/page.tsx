'use client'

import { useState, useEffect } from 'react'
import { 
  Lock, X, Plus, Edit2, Trash2, Upload, CheckCircle, AlertCircle, 
  Package, Settings, LogOut, Menu, Home, Image as ImageIcon, 
  ExternalLink, Search, Filter, LayoutDashboard, BarChart3, 
  TrendingUp, Clock, Table as TableIcon, Grid3x3, Phone, Mail, 
  MapPin, Instagram, Linkedin, Bell, Globe, Save, ToggleLeft, ToggleRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/Logo'
import Toast from '@/components/Toast'
import { motion, AnimatePresence } from 'framer-motion'

interface Product {
  id: string
  name: string
  description: string | null
  image_url: string | null
  category: 'kumaş' | 'diğer'
  amazon_link: string | null
  features: string[] | null
}

type ViewMode = 'dashboard' | 'products' | 'add' | 'settings'
type ProductViewMode = 'grid' | 'table'

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard')
  const [productViewMode, setProductViewMode] = useState<ProductViewMode>('grid')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<'all' | 'kumaş' | 'diğer'>('all')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showFormSheet, setShowFormSheet] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)

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
      fetchSettings()
    }
  }, [])

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      
      if (data) {
        setSettings(data)
      } else {
        // İlk kez oluşturuluyorsa varsayılan değerler
        setSettings({
          phone: '+90 553 588 69 36',
          whatsapp: '+90 553 588 69 36',
          email: 'info@omytic.com',
          address: '',
          instagram: '',
          linkedin: '',
          announcement_text: '',
          announcement_visible: false,
          site_title: 'OMY Ticaret - Kaliteli Toptan Ticaret',
          site_description: 'OMY Ticaret; kaliteli ürün yelpazesi ve hızlı tedarik zinciriyle, müşterilerinin ihtiyaçlarına özel çözümler sunan güvenilir bir iş ortağıdır.'
        })
      }
    } catch (err: any) {
      console.error('Ayarlar yüklenirken hata:', err)
    }
  }

  const handleSaveSettings = async () => {
    if (!settings) return
    
    setSettingsLoading(true)
    setError('')
    
    try {
      // Önce var mı kontrol et
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .limit(1)
        .single()

      if (existing) {
        // Güncelle
        const { error } = await supabase
          .from('settings')
          .update(settings)
          .eq('id', existing.id)

        if (error) throw error
      } else {
        // Yeni oluştur
        const { error } = await supabase
          .from('settings')
          .insert([settings])

        if (error) throw error
      }

      setToast({ message: 'Ayarlar başarıyla kaydedildi!', type: 'success' })
    } catch (err: any) {
      setError(err.message || 'Ayarlar kaydedilirken bir hata oluştu')
      setToast({ message: err.message || 'Ayarlar kaydedilirken bir hata oluştu', type: 'error' })
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
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
    setViewMode('products')
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
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `products/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('products')
        .getPublicUrl(filePath)

      setFormData({ ...formData, image_url: data.publicUrl })
      setPreviewImage(data.publicUrl)
      setToast({ message: 'Görsel başarıyla yüklendi!', type: 'success' })
    } catch (err: any) {
      setError(err.message || 'Görsel yüklenirken bir hata oluştu')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir görsel dosyası seçin')
      return
    }

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
        if (editingProduct.image_url && editingProduct.image_url !== formData.image_url) {
          const oldImagePath = editingProduct.image_url.split('/products/')[1]
          if (oldImagePath) {
            await supabase.storage
              .from('products')
              .remove([`products/${oldImagePath}`])
          }
        }

        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) throw error
        setToast({ message: 'Ürün başarıyla güncellendi!', type: 'success' })
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData])

        if (error) throw error
        setToast({ message: 'Ürün başarıyla eklendi!', type: 'success' })
      }

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
      setShowFormSheet(false)
      setViewMode('products')
      fetchProducts()
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
      const product = products.find(p => p.id === id)
      
      if (product?.image_url) {
        const imagePath = product.image_url.split('/products/')[1]
        if (imagePath) {
          await supabase.storage
            .from('products')
            .remove([`products/${imagePath}`])
        }
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setToast({ message: 'Ürün başarıyla silindi!', type: 'success' })
      fetchProducts()
    } catch (err: any) {
      setError(err.message || 'Ürün silinirken bir hata oluştu')
    } finally {
      setLoading(false)
    }
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
    setShowFormSheet(true)
    setError('')
  }

  const handleNewProduct = () => {
    setEditingProduct(null)
    setFormData({
      name: '',
      description: '',
      image_url: '',
      category: 'kumaş',
      amazon_link: '',
      features: '',
    })
    setPreviewImage(null)
    setShowFormSheet(true)
    setError('')
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
    setShowFormSheet(false)
    setError('')
  }

  // Filtrelenmiş ürünler
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory
    return matchesSearch && matchesCategory
  })

  // İstatistikler
  const stats = {
    totalProducts: products.length,
    fabrics: products.filter(p => p.category === 'kumaş').length,
    other: products.filter(p => p.category === 'diğer').length,
    lastAdded: products[0]?.name || 'Henüz ürün yok'
  }

  // Giriş ekranı
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-navy-50 to-anthracite-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-luxury-xl p-8 border border-anthracite-100"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-navy-900 to-anthracite-900 text-gold-400 mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-navy-900">
              Admin Paneli
            </h1>
            <p className="text-anthracite-600 mt-2 text-sm">Lütfen şifrenizi girin</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifre"
                className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-gradient-to-r from-navy-900 to-anthracite-900 hover:from-navy-800 hover:to-anthracite-800 text-white font-semibold rounded-lg transition-all shadow-luxury hover:shadow-luxury-lg"
            >
              Giriş Yap
            </button>
          </form>
        </motion.div>
      </div>
    )
  }

  // Ana admin paneli
  return (
    <div className="min-h-screen bg-gradient-to-br from-anthracite-50 via-white to-beige-50">
      {/* Sidebar - Dark Theme */}
      <aside className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-navy-900 to-anthracite-900 border-r border-navy-800 shadow-luxury-xl z-40 transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      }`}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 border-b border-navy-800">
            <a href="/" className="flex items-center">
              <Logo variant="light" size="sm" />
            </a>
          </div>

          {/* Menü */}
          <nav className="flex-1 p-4 space-y-2">
            <button
              onClick={() => setViewMode('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                viewMode === 'dashboard'
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-500/30'
                  : 'text-navy-200 hover:bg-navy-800/50 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </button>

            <button
              onClick={() => setViewMode('products')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                viewMode === 'products'
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-500/30'
                  : 'text-navy-200 hover:bg-navy-800/50 hover:text-white'
              }`}
            >
              <Package className="w-5 h-5" />
              <span className="font-medium">Ürün Listesi</span>
            </button>

            <button
              onClick={handleNewProduct}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                showFormSheet
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-500/30'
                  : 'text-navy-200 hover:bg-navy-800/50 hover:text-white'
              }`}
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Yeni Ürün Ekle</span>
            </button>

            <button
              onClick={() => setViewMode('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                viewMode === 'settings'
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-500/30'
                  : 'text-navy-200 hover:bg-navy-800/50 hover:text-white'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Site Ayarları</span>
            </button>
          </nav>

          {/* Çıkış */}
          <div className="p-4 border-t border-navy-800">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Çıkış Yap</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Ana İçerik */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="bg-white border-b border-anthracite-100 shadow-luxury sticky top-0 z-30">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSidebarOpen(!sidebarOpen)
                  setMobileMenuOpen(!mobileMenuOpen)
                }}
                className="p-2 hover:bg-anthracite-50 rounded-lg transition-colors lg:hidden"
              >
                <Menu className="w-5 h-5 text-anthracite-700" />
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:block p-2 hover:bg-anthracite-50 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-anthracite-700" />
              </button>
              <div>
                <h1 className="text-xl font-serif font-bold text-navy-900">
                  {viewMode === 'dashboard' && 'Dashboard'}
                  {viewMode === 'products' && 'Ürün Listesi'}
                  {viewMode === 'settings' && 'Site Ayarları'}
                </h1>
                {viewMode === 'products' && (
                  <p className="text-sm text-anthracite-600 mt-0.5">
                    {filteredProducts.length} ürün
                  </p>
                )}
              </div>
            </div>
            <a
              href="/"
              className="flex items-center gap-2 px-4 py-2 text-anthracite-700 hover:bg-anthracite-50 rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Ana Sayfa</span>
            </a>
          </div>
        </header>

        {/* İçerik Alanı */}
        <div className="p-6">
          {/* Toast Notification */}
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              isVisible={!!toast}
              onClose={() => setToast(null)}
            />
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2"
            >
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Dashboard Görünümü */}
          {viewMode === 'dashboard' && (
            <div className="space-y-6">
              {/* İstatistik Kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-navy-100 rounded-lg">
                      <Package className="w-6 h-6 text-navy-600" />
                    </div>
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-navy-900 mb-1">{stats.totalProducts}</h3>
                  <p className="text-sm text-anthracite-600">Toplam Ürün</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gold-100 rounded-lg">
                      <BarChart3 className="w-6 h-6 text-gold-600" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-navy-900 mb-1">{stats.fabrics}</h3>
                  <p className="text-sm text-anthracite-600">Kumaş Ürünleri</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-anthracite-100 rounded-lg">
                      <Package className="w-6 h-6 text-anthracite-600" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-navy-900 mb-1">{stats.other}</h3>
                  <p className="text-sm text-anthracite-600">Diğer Ürünler</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gold-100 rounded-lg">
                      <Clock className="w-6 h-6 text-gold-600" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-navy-900 mb-1 line-clamp-1">{stats.lastAdded}</h3>
                  <p className="text-sm text-anthracite-600">Son Eklenen</p>
                </motion.div>
              </div>

              {/* Hızlı Erişim */}
              <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                <h2 className="text-xl font-serif font-bold text-navy-900 mb-4">Hızlı Erişim</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setViewMode('products')}
                    className="flex items-center gap-4 p-4 border border-anthracite-200 rounded-lg hover:bg-anthracite-50 transition-colors text-left"
                  >
                    <div className="p-3 bg-navy-100 rounded-lg">
                      <Package className="w-6 h-6 text-navy-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-navy-900">Ürünleri Görüntüle</h3>
                      <p className="text-sm text-anthracite-600">Tüm ürünleri listele</p>
                    </div>
                  </button>
                  <button
                    onClick={handleNewProduct}
                    className="flex items-center gap-4 p-4 border border-anthracite-200 rounded-lg hover:bg-anthracite-50 transition-colors text-left"
                  >
                    <div className="p-3 bg-gold-100 rounded-lg">
                      <Plus className="w-6 h-6 text-gold-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-navy-900">Yeni Ürün Ekle</h3>
                      <p className="text-sm text-anthracite-600">Yeni ürün ekle</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ürünler Görünümü */}
          {viewMode === 'products' && (
            <div className="space-y-6">
              {/* Filtreler ve Görünüm Seçici */}
              <div className="bg-white rounded-xl shadow-luxury p-4 border border-anthracite-100">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-anthracite-400" />
                    <input
                      type="text"
                      placeholder="Ürün ara..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-anthracite-400" />
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value as any)}
                      className="px-4 py-2 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                    >
                      <option value="all">Tüm Kategoriler</option>
                      <option value="kumaş">Kumaş</option>
                      <option value="diğer">Diğer</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 border border-anthracite-200 rounded-lg p-1">
                    <button
                      onClick={() => setProductViewMode('grid')}
                      className={`p-2 rounded transition-colors ${
                        productViewMode === 'grid' 
                          ? 'bg-gold-100 text-gold-700' 
                          : 'text-anthracite-600 hover:bg-anthracite-50'
                      }`}
                    >
                      <Grid3x3 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setProductViewMode('table')}
                      className={`p-2 rounded transition-colors ${
                        productViewMode === 'table' 
                          ? 'bg-gold-100 text-gold-700' 
                          : 'text-anthracite-600 hover:bg-anthracite-50'
                      }`}
                    >
                      <TableIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    onClick={handleNewProduct}
                    className="flex items-center gap-2 px-4 py-2 bg-gold-600 hover:bg-gold-500 text-navy-900 font-semibold rounded-lg transition-colors shadow-luxury hover:shadow-luxury-lg"
                  >
                    <Plus className="w-5 h-5" />
                    Yeni Ürün
                  </button>
                </div>
              </div>

              {/* Ürün Listesi - Grid Görünümü */}
              {productViewMode === 'grid' && (
                <>
                  {loading ? (
                    <div className="text-center py-12 text-anthracite-600">Yükleniyor...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-luxury p-12 text-center border border-anthracite-100">
                      <Package className="w-12 h-12 text-anthracite-300 mx-auto mb-4" />
                      <p className="text-anthracite-600">Henüz ürün bulunmuyor.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white rounded-xl shadow-luxury border border-anthracite-100 overflow-hidden hover:shadow-luxury-lg transition-all group"
                    >
                      {/* Görsel */}
                      <div className="relative aspect-square bg-anthracite-50 overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-anthracite-300">
                            <ImageIcon className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            product.category === 'kumaş' 
                              ? 'bg-navy-100 text-navy-700' 
                              : 'bg-gold-100 text-gold-700'
                          }`}>
                            {product.category}
                          </span>
                        </div>
                      </div>

                      {/* İçerik */}
                      <div className="p-4">
                        <h3 className="font-serif font-bold text-navy-900 mb-1 line-clamp-2">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-sm text-anthracite-600 mb-3 line-clamp-2">
                            {product.description}
                          </p>
                        )}
                        
                        {/* Butonlar */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-anthracite-50 hover:bg-anthracite-100 text-anthracite-700 rounded-lg transition-colors text-sm font-medium"
                          >
                            <Edit2 className="w-4 h-4" />
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                    </div>
                  )}
                </>
              )}

              {/* Ürün Listesi - Tablo Görünümü */}
              {productViewMode === 'table' && (
                <>
                  {loading ? (
                    <div className="text-center py-12 text-anthracite-600">Yükleniyor...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-luxury p-12 text-center border border-anthracite-100">
                      <Package className="w-12 h-12 text-anthracite-300 mx-auto mb-4" />
                      <p className="text-anthracite-600">Henüz ürün bulunmuyor.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-anthracite-50 border-b border-anthracite-200">
                            <tr>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-anthracite-700 uppercase tracking-wider">Görsel</th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-anthracite-700 uppercase tracking-wider">Ürün Adı</th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-anthracite-700 uppercase tracking-wider">Kategori</th>
                              <th className="px-6 py-4 text-left text-xs font-semibold text-anthracite-700 uppercase tracking-wider">Açıklama</th>
                              <th className="px-6 py-4 text-right text-xs font-semibold text-anthracite-700 uppercase tracking-wider">İşlemler</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-anthracite-100">
                            {filteredProducts.map((product) => (
                              <tr key={product.id} className="hover:bg-anthracite-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-anthracite-100">
                                    {product.image_url ? (
                                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <ImageIcon className="w-6 h-6 text-anthracite-300" />
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-serif font-bold text-navy-900">{product.name}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                                    product.category === 'kumaş' 
                                      ? 'bg-navy-100 text-navy-700' 
                                      : 'bg-gold-100 text-gold-700'
                                  }`}>
                                    {product.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-sm text-anthracite-600 line-clamp-2 max-w-md">
                                    {product.description || '-'}
                                  </p>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleEdit(product)}
                                      className="p-2 bg-anthracite-50 hover:bg-anthracite-100 text-anthracite-700 rounded-lg transition-colors"
                                      title="Düzenle"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(product.id)}
                                      className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                      title="Sil"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sağdan Açılan Form Panel (Sheet) */}
          <AnimatePresence>
            {showFormSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowFormSheet(false)}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                />
                {/* Sheet Panel */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-luxury-xl z-50 overflow-y-auto"
                >
                  <div className="sticky top-0 bg-white border-b border-anthracite-100 p-6 flex items-center justify-between z-10">
                    <h2 className="text-2xl font-serif font-bold text-navy-900">
                      {editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
                    </h2>
                    <button
                      onClick={() => setShowFormSheet(false)}
                      className="p-2 hover:bg-anthracite-50 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-anthracite-600" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  {/* Ürün Adı */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Ürün Adı *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>

                  {/* Açıklama */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Açıklama
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all resize-none"
                    />
                  </div>

                  {/* Görsel */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Görsel
                    </label>
                    
                    <div className="space-y-4">
                      {/* Yükleme Alanı */}
                      <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-anthracite-300 rounded-lg cursor-pointer bg-anthracite-50 hover:bg-anthracite-100 transition-colors">
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
                            className="w-full h-64 object-cover rounded-lg border border-anthracite-200"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewImage(null)
                              setFormData({ ...formData, image_url: '' })
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-luxury"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Manuel URL */}
                      <div>
                        <p className="text-xs text-anthracite-500 mb-2">veya URL ile ekle:</p>
                        <input
                          type="text"
                          value={formData.image_url}
                          onChange={(e) => {
                            setFormData({ ...formData, image_url: e.target.value })
                            setPreviewImage(e.target.value || null)
                          }}
                          placeholder="https://..."
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Kategori */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Kategori *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as 'kumaş' | 'diğer' })}
                      className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                      required
                    >
                      <option value="kumaş">Kumaş</option>
                      <option value="diğer">Diğer</option>
                    </select>
                  </div>

                  {/* Amazon Linki */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Amazon Linki
                    </label>
                    <input
                      type="text"
                      value={formData.amazon_link}
                      onChange={(e) => setFormData({ ...formData, amazon_link: e.target.value })}
                      placeholder="https://www.amazon.com.tr/..."
                      className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Özellikler */}
                  <div>
                    <label className="block text-sm font-medium text-anthracite-700 mb-2">
                      Özellikler (Her satıra bir özellik)
                    </label>
                    <textarea
                      value={formData.features}
                      onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                      rows={6}
                      placeholder="Özellik 1&#10;Özellik 2&#10;Özellik 3"
                      className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all resize-none"
                    />
                  </div>

                    {/* Butonlar */}
                    <div className="flex gap-3 pt-4 border-t border-anthracite-100 sticky bottom-0 bg-white pb-6">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-navy-900 font-semibold rounded-lg transition-all shadow-luxury hover:shadow-luxury-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Kaydediliyor...' : editingProduct ? 'Güncelle' : 'Ürün Ekle'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFormSheet(false)}
                        className="px-6 py-3 border border-anthracite-300 hover:bg-anthracite-50 text-anthracite-700 font-medium rounded-lg transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                  </form>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Ayarlar Görünümü */}
          {viewMode === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {!settings ? (
                <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600 mx-auto mb-4"></div>
                  <p className="text-anthracite-600">Ayarlar yükleniyor...</p>
                </div>
              ) : (
                <>
                  {/* İletişim Bilgileri */}
                  <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-navy-100 rounded-lg">
                        <Phone className="w-5 h-5 text-navy-600" />
                      </div>
                      <h2 className="text-xl font-serif font-bold text-navy-900">İletişim Bilgileri</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Telefon
                        </label>
                        <input
                          type="text"
                          value={settings.phone || ''}
                          onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="+90 553 588 69 36"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          WhatsApp
                        </label>
                        <input
                          type="text"
                          value={settings.whatsapp || ''}
                          onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="+90 553 588 69 36"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          E-posta
                        </label>
                        <input
                          type="email"
                          value={settings.email || ''}
                          onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="info@omytic.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Adres
                        </label>
                        <input
                          type="text"
                          value={settings.address || ''}
                          onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="Adres bilgisi"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sosyal Medya */}
                  <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-gold-100 rounded-lg">
                        <Instagram className="w-5 h-5 text-gold-600" />
                      </div>
                      <h2 className="text-xl font-serif font-bold text-navy-900">Sosyal Medya</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Instagram Profil Linki
                        </label>
                        <input
                          type="url"
                          value={settings.instagram || ''}
                          onChange={(e) => setSettings({ ...settings, instagram: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="https://instagram.com/..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          LinkedIn Profil Linki
                        </label>
                        <input
                          type="url"
                          value={settings.linkedin || ''}
                          onChange={(e) => setSettings({ ...settings, linkedin: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="https://linkedin.com/company/..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Duyuru Yönetimi */}
                  <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-anthracite-100 rounded-lg">
                        <Bell className="w-5 h-5 text-anthracite-600" />
                      </div>
                      <h2 className="text-xl font-serif font-bold text-navy-900">Duyuru Yönetimi</h2>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Duyuru Metni
                        </label>
                        <textarea
                          value={settings.announcement_text || ''}
                          onChange={(e) => setSettings({ ...settings, announcement_text: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all resize-none"
                          placeholder="Ana sayfanın en üstünde görünecek duyuru metni..."
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-anthracite-50 rounded-lg">
                        <div>
                          <p className="font-medium text-anthracite-900 mb-1">Duyuruyu Göster</p>
                          <p className="text-sm text-anthracite-600">Ana sayfanın en üstünde duyuru metni görünsün mü?</p>
                        </div>
                        <button
                          onClick={() => setSettings({ ...settings, announcement_visible: !settings.announcement_visible })}
                          className="flex items-center gap-2"
                        >
                          {settings.announcement_visible ? (
                            <ToggleRight className="w-10 h-10 text-gold-600" />
                          ) : (
                            <ToggleLeft className="w-10 h-10 text-anthracite-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SEO */}
                  <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-navy-100 rounded-lg">
                        <Globe className="w-5 h-5 text-navy-600" />
                      </div>
                      <h2 className="text-xl font-serif font-bold text-navy-900">SEO Ayarları</h2>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Site Başlığı (Title)
                        </label>
                        <input
                          type="text"
                          value={settings.site_title || ''}
                          onChange={(e) => setSettings({ ...settings, site_title: e.target.value })}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
                          placeholder="OMY Ticaret - Kaliteli Toptan Ticaret"
                        />
                        <p className="text-xs text-anthracite-500 mt-1">Tarayıcı sekmesinde görünecek başlık</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-anthracite-700 mb-2">
                          Site Açıklaması (Description)
                        </label>
                        <textarea
                          value={settings.site_description || ''}
                          onChange={(e) => setSettings({ ...settings, site_description: e.target.value })}
                          rows={4}
                          className="w-full px-4 py-3 border border-anthracite-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all resize-none"
                          placeholder="Arama motorlarında görünecek site açıklaması..."
                        />
                        <p className="text-xs text-anthracite-500 mt-1">Arama motorlarında görünecek açıklama (150-160 karakter önerilir)</p>
                      </div>
                    </div>
                  </div>

                  {/* Kaydet Butonu */}
                  <div className="bg-white rounded-xl shadow-luxury border border-anthracite-100 p-6">
                    <button
                      onClick={handleSaveSettings}
                      disabled={settingsLoading}
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-navy-900 font-semibold rounded-lg transition-all shadow-luxury hover:shadow-luxury-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {settingsLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-navy-900"></div>
                          <span>Kaydediliyor...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          <span>Ayarları Kaydet</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
