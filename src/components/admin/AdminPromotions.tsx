import React, { useState, useEffect } from 'react';
import { Plus, Tag, Image, Settings, Trash2, Check, AlertCircle } from 'lucide-react';
import type { Banner, Coupon, StoreSettings } from '../../types/store.ts';
import { api } from '../../services/api.ts';
import { formatPKR } from '../../utils/pricing.ts';
import { useStore } from '../../context/StoreContext.tsx';

export const AdminPromotions: React.FC = () => {
  const { refreshProducts } = useStore();
  const [activeSubTab, setActiveSubTab] = useState<'banners' | 'coupons' | 'settings'>('banners');

  const [banners, setBanners] = useState<Banner[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  const [statusMessage, setStatusMessage] = useState('');

  // Banner Form
  const [bannerForm, setBannerForm] = useState({
    title: '',
    subtitle: '',
    badgeText: 'Limited Offer',
    imageUrl: '/src/assets/images/hero_lifestyle_store_1792058412869.jpg',
    ctaText: 'Shop Now',
    linkUrl: '#collection',
    isActive: true
  });
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);

  // Coupon Form
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 10,
    minSpend: 1500,
    maxDiscount: 500,
    usageLimit: 200,
    isActive: true
  });
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

  // Settings Form
  const [settingsForm, setSettingsForm] = useState<StoreSettings>({
    storeName: 'Zamzam',
    tagline: 'Refined Everyday Beauty, Hair & Home Essentials',
    contactPhone: '03049002888',
    contactEmail: 'ahsanullahyousafzai90@gmail.com',
    address: 'Phase 5 DHA, Lahore, Pakistan',
    currency: 'PKR',
    standardShippingFee: 200,
    freeShippingThreshold: 3000,
    returnPolicy: '7-day replacement or return on personal accessories.',
    deliveryPolicy: 'Fast nationwide Cash on Delivery (COD). 2-3 business days in major cities.',
    aboutText: 'Curating salon-grade brushes and aesthetic storage.'
  });

  const loadData = async () => {
    try {
      const [bRes, cRes, sRes] = await Promise.all([
        api.adminGetBanners(),
        api.adminGetCoupons(),
        api.adminGetSettings()
      ]);
      setBanners(bRes.banners);
      setCoupons(cRes.coupons);
      setSettings(sRes.settings);
      setSettingsForm(sRes.settings);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminSaveBanner(bannerForm);
      await loadData();
      await refreshProducts();
      setIsBannerModalOpen(false);
      setStatusMessage('Banner saved successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save banner');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Delete this promotional banner?')) return;
    try {
      await api.adminDeleteBanner(id);
      await loadData();
      await refreshProducts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponForm.code.trim()) return;
    try {
      await api.adminSaveCoupon({
        ...couponForm,
        code: couponForm.code.trim().toUpperCase()
      });
      await loadData();
      setIsCouponModalOpen(false);
      setStatusMessage('Coupon saved successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save coupon');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Delete this coupon code?')) return;
    try {
      await api.adminDeleteCoupon(id);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminUpdateSettings({
        ...settingsForm,
        standardShippingFee: Number(settingsForm.standardShippingFee),
        freeShippingThreshold: Number(settingsForm.freeShippingThreshold)
      });
      await loadData();
      await refreshProducts();
      setStatusMessage('Store settings & shipping rules updated successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('banners')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === 'banners' ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Image className="w-4 h-4" />
          <span>Home Banners ({banners.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('coupons')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === 'coupons' ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Coupons & Discounts ({coupons.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('settings')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === 'settings' ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Store & Shipping Settings</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* BANNERS TAB */}
      {activeSubTab === 'banners' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Control the top hero banners displayed on the customer home screen.
            </p>
            <button
              onClick={() => setIsBannerModalOpen(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Banner</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {banners.map(b => (
              <div key={b.id} className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <div className="aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 relative">
                  <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                  {b.badgeText && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-amber-600 text-white text-[10px] font-bold rounded">
                      {b.badgeText}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="font-heading font-bold text-slate-900 text-sm">{b.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{b.subtitle}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    b.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {b.isActive ? 'Active' : 'Draft'}
                  </span>
                  <button
                    onClick={() => handleDeleteBanner(b.id)}
                    className="text-rose-600 hover:underline text-[11px] font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COUPONS TAB */}
      {activeSubTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Manage promotional discount codes validated on the server during guest checkout.
            </p>
            <button
              onClick={() => setIsCouponModalOpen(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Coupon</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-medium">Coupon Code</th>
                  <th className="py-3 px-4 font-medium">Discount Value</th>
                  <th className="py-3 px-4 font-medium">Min Spend (PKR)</th>
                  <th className="py-3 px-4 font-medium">Times Used</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.code}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-800">
                      {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `Rs. ${c.discountValue} FLAT OFF`}
                    </td>
                    <td className="py-3 px-4 text-slate-600 tabular-nums">
                      {c.minSpend ? formatPKR(c.minSpend) : 'No Minimum'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">{c.timesUsed}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {c.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteCoupon(c.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        title="Delete Coupon"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeSubTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 max-w-2xl">
          <h3 className="font-heading text-sm font-bold text-slate-900 mb-2">
            Storefront Identity & Shipping Rules
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Store Name</label>
              <input
                type="text"
                value={settingsForm.storeName}
                onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                value={settingsForm.tagline}
                onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Standard Delivery Fee (PKR)</label>
              <input
                type="number"
                value={settingsForm.standardShippingFee}
                onChange={(e) => setSettingsForm({ ...settingsForm, standardShippingFee: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Free Delivery Threshold (PKR)</label>
              <input
                type="number"
                value={settingsForm.freeShippingThreshold}
                onChange={(e) => setSettingsForm({ ...settingsForm, freeShippingThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone & WhatsApp</label>
              <input
                type="text"
                value={settingsForm.contactPhone}
                onChange={(e) => setSettingsForm({ ...settingsForm, contactPhone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
              <input
                type="email"
                value={settingsForm.contactEmail}
                onChange={(e) => setSettingsForm({ ...settingsForm, contactEmail: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address / Studio Location</label>
            <input
              type="text"
              value={settingsForm.address}
              onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Policy Summary</label>
            <textarea
              rows={2}
              value={settingsForm.deliveryPolicy}
              onChange={(e) => setSettingsForm({ ...settingsForm, deliveryPolicy: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Return & Replacement Policy</label>
            <textarea
              rows={2}
              value={settingsForm.returnPolicy}
              onChange={(e) => setSettingsForm({ ...settingsForm, returnPolicy: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              Save Store Settings
            </button>
          </div>
        </form>
      )}

      {/* Banner Creation Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="font-heading text-base font-bold text-slate-900">Add Hero Banner</h3>
            <form onSubmit={handleSaveBanner} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Banner Title</label>
                <input
                  type="text"
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  placeholder="e.g. 30% Off Hair Accessories"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Subtitle</label>
                <input
                  type="text"
                  value={bannerForm.subtitle}
                  onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                  placeholder="Salon blowouts made easy..."
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Banner Image URL</label>
                <input
                  type="text"
                  value={bannerForm.imageUrl}
                  onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Badge</label>
                  <input
                    type="text"
                    value={bannerForm.badgeText}
                    onChange={(e) => setBannerForm({ ...bannerForm, badgeText: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">CTA Button</label>
                  <input
                    type="text"
                    value={bannerForm.ctaText}
                    onChange={(e) => setBannerForm({ ...bannerForm, ctaText: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsBannerModalOpen(false)} className="px-4 py-2 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold">Save Banner</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="font-heading text-base font-bold text-slate-900">Create Discount Coupon</h3>
            <form onSubmit={handleSaveCoupon} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Coupon Code (Uppercase)</label>
                <input
                  type="text"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                  placeholder="e.g. FLASH20"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-mono uppercase font-bold"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Type</label>
                  <select
                    value={couponForm.discountType}
                    onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (PKR)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Discount Value</label>
                  <input
                    type="number"
                    value={couponForm.discountValue}
                    onChange={(e) => setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-bold"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Min Spend (PKR)</label>
                  <input
                    type="number"
                    value={couponForm.minSpend}
                    onChange={(e) => setCouponForm({ ...couponForm, minSpend: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Max Cap (PKR)</label>
                  <input
                    type="number"
                    value={couponForm.maxDiscount}
                    onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCouponModalOpen(false)} className="px-4 py-2 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold">Create Coupon</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
