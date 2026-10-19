import React, { useState } from 'react';
import { X, ShieldCheck, MapPin, Phone, User, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';
import { api } from '../services/api.ts';

const MAJOR_CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
  'Hyderabad',
  'Bahawalpur',
  'Other'
];

export const GuestCheckoutModal: React.FC = () => {
  const {
    isCheckoutOpen,
    setIsCheckoutOpen,
    cart,
    pricing,
    appliedCoupon,
    clearCart,
    setConfirmedOrder,
    refreshProducts,
    settings,
    customerUser
  } = useStore();

  const [formData, setFormData] = useState({
    fullName: customerUser?.displayName || '',
    phone: customerUser?.phoneNumber || '',
    city: 'Lahore',
    customCity: '',
    area: '',
    address: '',
    notes: ''
  });

  // Sync customer user name if loaded
  React.useEffect(() => {
    if (customerUser && !formData.fullName) {
      setFormData(prev => ({
        ...prev,
        fullName: customerUser.displayName || prev.fullName,
        phone: customerUser.phoneNumber || prev.phone
      }));
    }
  }, [customerUser]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!isCheckoutOpen) return null;

  const effectiveCity = formData.city === 'Other' ? formData.customCity : formData.city;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      errs.fullName = 'Please enter your full name (minimum 2 letters).';
    }
    const cleanPhone = formData.phone.replace(/[\s\-\(\)]/g, '');
    const pkPhoneRegex = /^((\+92)|(92)|(0))?3[0-9]{9}$/;
    const generalRegex = /^[0-9]{10,12}$/;
    if (!cleanPhone || (!pkPhoneRegex.test(cleanPhone) && !generalRegex.test(cleanPhone))) {
      errs.phone = 'Please enter a valid Pakistani mobile number (e.g. 0300 1234567).';
    }
    if (!formData.address.trim() || formData.address.trim().length < 6) {
      errs.address = 'Please enter your complete street and house address for delivery.';
    }
    if (!effectiveCity.trim()) {
      errs.city = 'Please specify your city.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent duplicate submission
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const orderPayload = {
        customer: {
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          city: effectiveCity.trim(),
          area: formData.area.trim() || undefined,
          address: formData.address.trim(),
          notes: customerUser
            ? `${formData.notes.trim() ? formData.notes.trim() + ' | ' : ''}Customer: ${customerUser.email || customerUser.displayName || 'User'} (${customerUser.uid})`
            : formData.notes.trim() || undefined
        },
        items: cart.map(i => ({
          productId: i.productId,
          name: i.name,
          price: i.salePrice && i.salePrice > 0 ? i.salePrice : i.price,
          quantity: i.quantity,
          image: i.image
        })),
        couponCode: appliedCoupon?.code
      };

      const res = await api.placeOrder(orderPayload);
      if (res.success && res.order) {
        clearCart();
        setIsCheckoutOpen(false);
        setConfirmedOrder(res.order);
        refreshProducts(); // Refresh stock counts in UI
      } else {
        setSubmitError('Failed to place order. Please review your details and try again.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred during checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-2xl rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">
              Quick Guest Checkout
            </h2>
            <p className="text-[11px] text-slate-500">
              No account or password needed. Cash on Delivery across Pakistan.
            </p>
          </div>
          <button
            onClick={() => setIsCheckoutOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Customer Details Box */}
          <div className="space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-600" />
              <span>1. Contact Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: '' });
                  }}
                  placeholder="e.g. Fatima Ali"
                  className={`w-full px-3.5 py-2 text-xs bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                    errors.fullName ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 focus:border-amber-600'
                  }`}
                />
                {errors.fullName && <p className="text-[10px] text-rose-600 mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (for Courier & SMS) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({ ...formData, phone: e.target.value });
                      if (errors.phone) setErrors({ ...errors, phone: '' });
                    }}
                    placeholder="0300 1234567"
                    className={`w-full pl-8 pr-3.5 py-2 text-xs bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                      errors.phone ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 focus:border-amber-600'
                    }`}
                  />
                </div>
                {errors.phone && <p className="text-[10px] text-rose-600 mt-1">{errors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Delivery Address Box */}
          <div className="space-y-3.5 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>2. Delivery Address</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  City <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  {MAJOR_CITIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {formData.city === 'Other' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Enter City Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customCity}
                    onChange={(e) => setFormData({ ...formData, customCity: e.target.value })}
                    placeholder="e.g. Abbottabad"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Area / Sector (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    placeholder="e.g. DHA Phase 5 / Gulberg"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Complete Street Address <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => {
                  setFormData({ ...formData, address: e.target.value });
                  if (errors.address) setErrors({ ...errors, address: '' });
                }}
                placeholder="House / Apartment number, Street name, Landmark..."
                className={`w-full px-3.5 py-2 text-xs bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                  errors.address ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 focus:border-amber-600'
                }`}
              />
              {errors.address && <p className="text-[10px] text-rose-600 mt-1">{errors.address}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Special Delivery Instructions (Optional)
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g. Leave with security, call before arrival..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          {/* Payment Method Badge */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                COD
              </div>
              <div>
                <p className="text-xs font-bold text-amber-950">Cash on Delivery (Pay When You Receive)</p>
                <p className="text-[11px] text-amber-800">Inspect parcel and pay courier in cash upon arrival.</p>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-amber-700 shrink-0" />
          </div>

          {/* Order Summary Snapshot */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Order Summary ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
            </h4>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
              {cart.map(item => (
                <div key={item.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                  <span className="text-slate-700 truncate max-w-[240px]">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatPKR((item.salePrice || item.price) * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-2 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium">{formatPKR(pricing.subtotal)}</span>
              </div>
              {pricing.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Coupon ({appliedCoupon?.code})</span>
                  <span className="tabular-nums font-medium">-{formatPKR(pricing.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery</span>
                <span className="tabular-nums font-medium">
                  {pricing.isFreeShipping ? 'FREE' : formatPKR(pricing.shippingFee)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-1.5 flex justify-between items-baseline font-bold text-sm text-slate-900">
                <span>Final Payable Amount</span>
                <span className="text-base font-extrabold text-amber-700 tabular-nums">
                  {formatPKR(pricing.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Place Order CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-900/15 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Placing Order...' : `Confirm & Place Order (${formatPKR(pricing.total)})`}</span>
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              By placing your order, you agree to {settings?.storeName || 'Zamzam'} shipping and return terms.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
