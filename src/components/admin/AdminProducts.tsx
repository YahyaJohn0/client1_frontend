import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Edit2, Trash2, Eye, EyeOff, Sparkles, AlertCircle, Check,
  RefreshCw, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Package,
  AlertTriangle, CheckSquare, Square, Layers, Tag, DollarSign, Image as ImageIcon
} from 'lucide-react';
import type { Product, Category, ProductImageMeta } from '../../types/store.ts';
import { api } from '../../services/api.ts';
import { formatPKR } from '../../utils/pricing.ts';
import { useStore } from '../../context/StoreContext.tsx';
import { CloudinaryImageUploader, UploadedImageItem } from './CloudinaryImageUploader.tsx';
import { ProductDeleteModal } from './ProductDeleteModal.tsx';
import { AdminDatabaseSync } from './AdminDatabaseSync.tsx';

const DEFAULT_IMAGES = [
  '/src/assets/images/product_rosegold_brush_1792058412656.jpg',
  '/src/assets/images/product_wood_paddle_brush_1792058413065.jpg',
  '/src/assets/images/product_rainbow_hairbrush_1792058414278.jpg',
  '/src/assets/images/product_makeup_organizer_1792058414597.jpg',
  '/src/assets/images/hero_lifestyle_store_1792058412869.jpg'
];

export const AdminProducts: React.FC = () => {
  const { refreshProducts, showToast } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search & Pagination
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name_asc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Bulk Selection
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkActionCategory, setBulkActionCategory] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Modal & Edit/Create State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Delete Modal State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    categoryId: '',
    price: '',
    salePrice: '',
    stock: '',
    description: '',
    shortDescription: '',
    isFeatured: false,
    isBestSeller: false,
    isTrending: false,
    isNewArrival: true,
    isActive: true
  });

  // Image uploader state
  const [formImages, setFormImages] = useState<UploadedImageItem[]>([]);
  const [deletedPublicIds, setDeletedPublicIds] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.getProducts({ includeInactive: true }),
        api.getCategories()
      ]);
      setProducts(pRes.products);
      setCategories(cRes.categories);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Category filter
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false;

      // Status filter
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;

      // Stock filter
      if (stockFilter === 'in_stock' && p.stock <= 0) return false;
      if (stockFilter === 'low_stock' && (p.stock > 5 || p.stock <= 0)) return false;
      if (stockFilter === 'out_of_stock' && p.stock > 0) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
        );
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'price_asc') {
        const priceA = a.salePrice && a.salePrice > 0 ? a.salePrice : a.price;
        const priceB = b.salePrice && b.salePrice > 0 ? b.salePrice : b.price;
        return priceA - priceB;
      }
      if (sortBy === 'price_desc') {
        const priceA = a.salePrice && a.salePrice > 0 ? a.salePrice : a.price;
        const priceB = b.salePrice && b.salePrice > 0 ? b.salePrice : b.price;
        return priceB - priceA;
      }
      if (sortBy === 'stock_asc') {
        return a.stock - b.stock;
      }
      if (sortBy === 'stock_desc') {
        return b.stock - a.stock;
      }
      return 0;
    });
  }, [products, categoryFilter, statusFilter, stockFilter, search, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage]);

  // Statistics counters
  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter(p => p.isActive).length;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5).length;
    const outOfStock = products.filter(p => p.stock <= 0).length;
    return { total, active, lowStock, outOfStock };
  }, [products]);

  const generateSku = () => {
    const prefix = 'ZAM';
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = Date.now().toString(36).slice(-3).toUpperCase();
    return `${prefix}-${code}${rand}`;
  };

  const openNewModal = () => {
    setEditingProduct(null);
    setValidationErrors({});
    setDeletedPublicIds([]);
    setFormData({
      name: '',
      sku: generateSku(),
      categoryId: categories[0]?.id || '',
      price: '',
      salePrice: '',
      stock: '20',
      description: '',
      shortDescription: '',
      isFeatured: false,
      isBestSeller: false,
      isTrending: false,
      isNewArrival: true,
      isActive: true
    });

    // Provide default starter image in list
    setFormImages([
      {
        id: `init-${Date.now()}`,
        url: DEFAULT_IMAGES[0],
        status: 'ready',
        isPrimary: true
      }
    ]);

    setIsModalOpen(true);
  };

  const openEditModal = async (p: Product) => {
    setEditingProduct(p);
    setValidationErrors({});
    setDeletedPublicIds([]);
    setFormData({
      name: p.name,
      sku: p.sku,
      categoryId: p.categoryId,
      price: String(p.price),
      salePrice: p.salePrice ? String(p.salePrice) : '',
      stock: String(p.stock),
      description: p.description,
      shortDescription: p.shortDescription || '',
      isFeatured: p.isFeatured,
      isBestSeller: p.isBestSeller,
      isTrending: p.isTrending,
      isNewArrival: p.isNewArrival,
      isActive: p.isActive
    });

    const populateImages = (prod: Product) => {
      const existingImages: UploadedImageItem[] = (prod.images && prod.images.length > 0 ? prod.images : [DEFAULT_IMAGES[0]]).map((url, idx) => {
        const meta = prod.imageMetadata?.find(m => m.url === url);
        return {
          id: `img-${idx}-${Date.now()}`,
          url,
          publicId: meta?.publicId,
          altText: meta?.altText,
          isPrimary: meta?.isPrimary ?? idx === 0,
          status: 'ready'
        };
      });
      setFormImages(existingImages);
    };

    populateImages(p);
    setIsModalOpen(true);

    // Fetch fresh product data from GET /api/v1/products/:id
    try {
      const res = await api.getProduct(p.id);
      if (res.product) {
        setEditingProduct(res.product);
        setFormData({
          name: res.product.name,
          sku: res.product.sku,
          categoryId: res.product.categoryId,
          price: String(res.product.price),
          salePrice: res.product.salePrice ? String(res.product.salePrice) : '',
          stock: String(res.product.stock),
          description: res.product.description,
          shortDescription: res.product.shortDescription || '',
          isFeatured: res.product.isFeatured,
          isBestSeller: res.product.isBestSeller,
          isTrending: res.product.isTrending,
          isNewArrival: res.product.isNewArrival,
          isActive: res.product.isActive
        });
        populateImages(res.product);
      }
    } catch (err) {
      console.warn('Could not refresh product details from /api/v1/products/:id:', err);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Product name is required';
    }

    if (!formData.sku.trim()) {
      errors.sku = 'SKU is required';
    } else {
      const duplicate = products.find(p =>
        p.sku.toLowerCase() === formData.sku.trim().toLowerCase() &&
        p.id !== editingProduct?.id
      );
      if (duplicate) {
        errors.sku = `SKU is already in use by "${duplicate.name}"`;
      }
    }

    if (!formData.categoryId) {
      errors.categoryId = 'Please select a category';
    }

    const priceNum = parseFloat(formData.price);
    if (!formData.price || isNaN(priceNum) || priceNum <= 0) {
      errors.price = 'Regular price must be a valid number greater than 0';
    }

    if (formData.salePrice) {
      const saleNum = parseFloat(formData.salePrice);
      if (isNaN(saleNum) || saleNum <= 0) {
        errors.salePrice = 'Sale price must be a positive number';
      } else if (saleNum >= priceNum) {
        errors.salePrice = 'Sale price must be strictly less than regular price';
      }
    }

    const stockNum = parseInt(formData.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      errors.stock = 'Stock quantity cannot be negative';
    }

    const readyImages = formImages.filter(img => img.status === 'ready');
    if (readyImages.length === 0) {
      errors.images = 'At least one product image is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast('Please resolve the highlighted validation errors.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Check if any images are still uploading
      const isStillUploading = formImages.some(img => img.status === 'uploading');
      if (isStillUploading) {
        showToast('Please wait until all Cloudinary images finish uploading.', 'error');
        setIsSaving(false);
        return;
      }

      const readyImages = formImages.filter(img => img.status === 'ready');
      const primaryItem = readyImages.find(img => img.isPrimary) || readyImages[0];
      const orderedUrls = [primaryItem.url, ...readyImages.filter(img => img.id !== primaryItem.id).map(img => img.url)];

      const imageMetadata: ProductImageMeta[] = readyImages.map(img => ({
        url: img.url,
        publicId: img.publicId,
        altText: img.altText || formData.name,
        isPrimary: img.id === primaryItem.id
      }));

      const payload: Partial<Product> = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        categoryId: formData.categoryId,
        price: parseFloat(formData.price),
        salePrice: formData.salePrice ? parseFloat(formData.salePrice) : undefined,
        stock: parseInt(formData.stock, 10) || 0,
        description: formData.description.trim(),
        shortDescription: formData.shortDescription.trim(),
        images: orderedUrls,
        imageMetadata,
        isFeatured: formData.isFeatured,
        isBestSeller: formData.isBestSeller,
        isTrending: formData.isTrending,
        isNewArrival: formData.isNewArrival,
        isActive: formData.isActive
      };

      if (editingProduct) {
        // PATCH /api/v1/products/:id
        await api.updateProduct(editingProduct.id, payload);
      } else {
        // POST /api/v1/products
        await api.createProduct(payload);
      }

      // Clean up any Cloudinary images that were explicitly removed during edit
      if (deletedPublicIds.length > 0) {
        for (const pid of deletedPublicIds) {
          api.deleteCloudinaryImage(pid).catch(err => console.warn('Clean up error:', err));
        }
      }

      await loadData();
      await refreshProducts();
      setIsModalOpen(false);
      showToast(editingProduct ? 'Product updated successfully!' : 'New product created successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save product', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      // PATCH /api/v1/products/:id/status
      await api.updateProductStatus(product.id, !product.isActive);
      await loadData();
      await refreshProducts();
      showToast(`Product "${product.name}" marked as ${!product.isActive ? 'Active' : 'Inactive'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update product status', 'error');
    }
  };

  const handleQuickStockUpdate = async (product: Product, delta: number) => {
    const newStock = Math.max(0, product.stock + delta);
    try {
      // PATCH /api/v1/products/:id
      await api.updateProduct(product.id, { stock: newStock });
      await loadData();
      await refreshProducts();
      showToast(`Stock updated to ${newStock} for "${product.name}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust stock', 'error');
    }
  };

  // Bulk Operations
  const handleSelectAll = () => {
    if (selectedProductIds.length === paginatedProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(paginatedProducts.map(p => p.id));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkActivate = async (activate: boolean) => {
    if (selectedProductIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      await Promise.all(selectedProductIds.map(id => api.updateProductStatus(id, activate)));
      showToast(`Updated ${selectedProductIds.length} products to ${activate ? 'Active' : 'Inactive'}.`, 'success');
      setSelectedProductIds([]);
      await loadData();
      await refreshProducts();
    } catch (err: any) {
      showToast(err.message || 'Bulk operation failed', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkChangeCategory = async () => {
    if (selectedProductIds.length === 0 || !bulkActionCategory) return;
    setIsBulkProcessing(true);
    try {
      await Promise.all(selectedProductIds.map(id => api.updateProduct(id, { categoryId: bulkActionCategory })));
      showToast(`Assigned ${selectedProductIds.length} products to category.`, 'success');
      setSelectedProductIds([]);
      setBulkActionCategory('');
      await loadData();
      await refreshProducts();
    } catch (err: any) {
      showToast(err.message || 'Bulk category assignment failed', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : 'Unassigned';
  };

  return (
    <div className="space-y-6">
      {/* Cloud & Database Integration Monitor */}
      <AdminDatabaseSync />

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Products</p>
          <p className="text-xl font-extrabold text-slate-900 mt-0.5">{stats.total}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Storefront</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{stats.active}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Low Stock (&le; 5)</p>
          <p className="text-xl font-extrabold text-amber-600 mt-0.5">{stats.lowStock}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Out of Stock</p>
          <p className="text-xl font-extrabold text-rose-600 mt-0.5">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Header with Search and Create */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Products Catalog ({filteredProducts.length})
          </h2>
          <p className="text-xs text-slate-500">
            Multi-image Cloudinary uploads, real-time stock sync, and safe archival.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors shadow-xs"
            title="Reload products from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openNewModal}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by title, SKU, or keyword..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all"
            />
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {/* Stock Availability Filter */}
            <select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="all">All Stock</option>
              <option value="in_stock">In Stock (&gt; 0)</option>
              <option value="low_stock">Low Stock (&le; 5)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="name_asc">Sort: Title (A-Z)</option>
              <option value="price_asc">Sort: Price (Low to High)</option>
              <option value="price_desc">Sort: Price (High to Low)</option>
              <option value="stock_asc">Sort: Stock (Low to High)</option>
              <option value="stock_desc">Sort: Stock (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Controls */}
        {selectedProductIds.length > 0 && (
          <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-amber-900">
              {selectedProductIds.length} product(s) selected
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkActivate(true)}
                disabled={isBulkProcessing}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-semibold rounded-lg hover:bg-amber-100 transition-colors"
              >
                Bulk Activate
              </button>
              <button
                onClick={() => handleBulkActivate(false)}
                disabled={isBulkProcessing}
                className="px-3 py-1.5 bg-white border border-amber-300 text-slate-700 font-semibold rounded-lg hover:bg-amber-100 transition-colors"
              >
                Bulk Deactivate
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  value={bulkActionCategory}
                  onChange={(e) => setBulkActionCategory(e.target.value)}
                  className="px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                >
                  <option value="">Move to Category...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkChangeCategory}
                  disabled={isBulkProcessing || !bulkActionCategory}
                  className="px-3 py-1.5 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-500 disabled:opacity-40 transition-colors"
                >
                  Apply
                </button>
              </div>

              <button
                onClick={() => setSelectedProductIds([])}
                className="px-2 py-1.5 text-slate-500 hover:text-slate-800"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product List Table / Card View */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600" />
          <p className="text-xs">Loading products from database...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3">
          <Package className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-800">No products match your criteria</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search terms or filters, or add a new product to the catalog.
          </p>
          <button
            onClick={openNewModal}
            className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-500 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3.5 w-10 text-center">
                    <button
                      onClick={handleSelectAll}
                      className="text-slate-400 hover:text-slate-600"
                      title="Select all on this page"
                    >
                      {selectedProductIds.length === paginatedProducts.length && paginatedProducts.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Price</th>
                  <th className="py-3 px-3">Stock</th>
                  <th className="py-3 px-3">Badges</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {paginatedProducts.map(p => {
                  const isSelected = selectedProductIds.includes(p.id);
                  const isLow = p.stock > 0 && p.stock <= 5;
                  const isOut = p.stock <= 0;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      } ${!p.isActive ? 'opacity-70 bg-slate-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3.5 text-center">
                        <button
                          onClick={() => handleSelectOne(p.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Product Thumbnail & Name */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 relative">
                            <img
                              src={p.images[0] || DEFAULT_IMAGES[0]}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            {p.images.length > 1 && (
                              <span className="absolute bottom-0 right-0 bg-slate-900/70 text-white text-[9px] px-1 rounded-tl font-mono">
                                +{p.images.length - 1}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <p className="font-bold text-slate-900 truncate" title={p.name}>
                              {p.name}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400">
                              SKU: {p.sku}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {getCategoryName(p.categoryId)}
                        </span>
                      </td>

                      {/* Price / Sale Price */}
                      <td className="py-3 px-3">
                        {p.salePrice && p.salePrice > 0 ? (
                          <div>
                            <span className="font-bold text-slate-900 text-sm">
                              {formatPKR(p.salePrice)}
                            </span>
                            <span className="block text-[11px] text-slate-400 line-through">
                              {formatPKR(p.price)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900 text-sm">
                            {formatPKR(p.price)}
                          </span>
                        )}
                      </td>

                      {/* Stock Quantity with Quick adjust */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isOut
                                ? 'bg-rose-100 text-rose-800'
                                : isLow
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isOut ? 'Out of Stock' : `${p.stock} in stock`}
                          </span>

                          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                            <button
                              onClick={() => handleQuickStockUpdate(p, -1)}
                              disabled={p.stock <= 0}
                              className="px-1.5 py-0.5 bg-white hover:bg-slate-100 disabled:opacity-30 text-[11px] text-slate-600"
                              title="Decrease stock"
                            >
                              -
                            </button>
                            <button
                              onClick={() => handleQuickStockUpdate(p, 1)}
                              className="px-1.5 py-0.5 bg-white hover:bg-slate-100 text-[11px] text-slate-600 border-l border-slate-200"
                              title="Increase stock"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Marketing Badges */}
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {p.isFeatured && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              Featured
                            </span>
                          )}
                          {p.isBestSeller && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Best Seller
                            </span>
                          )}
                          {p.isTrending && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Trending
                            </span>
                          )}
                          {p.isNewArrival && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                              New
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Active / Inactive Status */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                            p.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title={p.isActive ? 'Click to deactivate' : 'Click to activate'}
                        >
                          {p.isActive ? (
                            <>
                              <Eye className="w-3 h-3" /> Active
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" /> Inactive
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions Menu */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingProduct(p)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete or Archive Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              Showing <span className="font-semibold text-slate-800">{Math.min(filteredProducts.length, (currentPage - 1) * itemsPerPage + 1)}</span> to{' '}
              <span className="font-semibold text-slate-800">{Math.min(filteredProducts.length, currentPage * itemsPerPage)}</span> of{' '}
              <span className="font-semibold text-slate-800">{filteredProducts.length}</span> products
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold ${
                    page === currentPage
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-base font-bold text-slate-900">
                  {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Create New Product'}
                </h3>
                <p className="text-xs text-slate-500">
                  Fill details and upload gallery images to Cloudinary.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                âœ•
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (validationErrors.name) setValidationErrors({ ...validationErrors, name: '' });
                  }}
                  placeholder="e.g. Luxury Rose Gold Detangling Hairbrush"
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                    validationErrors.name ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                  }`}
                />
                {validationErrors.name && (
                  <p className="text-[11px] text-rose-600 mt-1">{validationErrors.name}</p>
                )}
              </div>

              {/* SKU & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-800">SKU Code *</label>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, sku: generateSku() }))}
                      className="text-[10px] text-amber-700 hover:underline font-semibold"
                    >
                      Generate New
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => {
                      setFormData({ ...formData, sku: e.target.value.toUpperCase() });
                      if (validationErrors.sku) setValidationErrors({ ...validationErrors, sku: '' });
                    }}
                    placeholder="e.g. ZAM-BRUSH-01"
                    className={`w-full px-3 py-2 text-xs font-mono uppercase bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      validationErrors.sku ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                    }`}
                  />
                  {validationErrors.sku && (
                    <p className="text-[11px] text-rose-600 mt-1">{validationErrors.sku}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">Category *</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => {
                      setFormData({ ...formData, categoryId: e.target.value });
                      if (validationErrors.categoryId) setValidationErrors({ ...validationErrors, categoryId: '' });
                    }}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      validationErrors.categoryId ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                    }`}
                  >
                    <option value="">Select Category...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {validationErrors.categoryId && (
                    <p className="text-[11px] text-rose-600 mt-1">{validationErrors.categoryId}</p>
                  )}
                </div>
              </div>

              {/* Price, Sale Price, and Stock Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Regular Price (PKR) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.price}
                    onChange={(e) => {
                      setFormData({ ...formData, price: e.target.value });
                      if (validationErrors.price) setValidationErrors({ ...validationErrors, price: '' });
                    }}
                    placeholder="2500"
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      validationErrors.price ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                    }`}
                  />
                  {validationErrors.price && (
                    <p className="text-[11px] text-rose-600 mt-1">{validationErrors.price}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Sale Price (PKR) <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.salePrice}
                    onChange={(e) => {
                      setFormData({ ...formData, salePrice: e.target.value });
                      if (validationErrors.salePrice) setValidationErrors({ ...validationErrors, salePrice: '' });
                    }}
                    placeholder="1950"
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      validationErrors.salePrice ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                    }`}
                  />
                  {validationErrors.salePrice && (
                    <p className="text-[11px] text-rose-600 mt-1">{validationErrors.salePrice}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Initial Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.stock}
                    onChange={(e) => {
                      setFormData({ ...formData, stock: e.target.value });
                      if (validationErrors.stock) setValidationErrors({ ...validationErrors, stock: '' });
                    }}
                    placeholder="25"
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 ${
                      validationErrors.stock ? 'border-rose-400 focus:ring-rose-500/20' : 'border-slate-200 focus:ring-amber-500/20 focus:border-amber-600'
                    }`}
                  />
                  {validationErrors.stock && (
                    <p className="text-[11px] text-rose-600 mt-1">{validationErrors.stock}</p>
                  )}
                </div>
              </div>

              {/* Cloudinary Multi-Image Uploader */}
              <div className="pt-2">
                <CloudinaryImageUploader
                  images={formImages}
                  onChange={(updated) => {
                    setFormImages(updated);
                    if (validationErrors.images) setValidationErrors({ ...validationErrors, images: '' });
                  }}
                  onDeletedPublicId={(pid) => {
                    setDeletedPublicIds(prev => [...prev, pid]);
                  }}
                />
                {validationErrors.images && (
                  <p className="text-[11px] text-rose-600 mt-1">{validationErrors.images}</p>
                )}
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Short Highlights
                </label>
                <input
                  type="text"
                  value={formData.shortDescription}
                  onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                  placeholder="e.g. Ergonomic cushioned handle, anti-static flexible bristles."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Full Product Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide comprehensive details, materials, care instructions, and usage..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
              </div>

              {/* Toggles Grid */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-slate-800">Merchandising & Visibility</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-slate-800">Active (Purchasable)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-slate-700">Featured</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isBestSeller}
                      onChange={(e) => setFormData({ ...formData, isBestSeller: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-slate-700">Best Seller</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isTrending}
                      onChange={(e) => setFormData({ ...formData, isTrending: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-slate-700">Trending</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isNewArrival}
                      onChange={(e) => setFormData({ ...formData, isNewArrival: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-slate-700">New Arrival</span>
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Archival Confirmation Modal */}
      {deletingProduct && (
        <ProductDeleteModal
          product={deletingProduct}
          isOpen={!!deletingProduct}
          onClose={() => setDeletingProduct(null)}
          onSuccess={(msg) => {
            showToast(msg, 'success');
            loadData();
            refreshProducts();
          }}
        />
      )}
    </div>
  );
};
