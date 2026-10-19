import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, Tag, ShoppingBag, Truck } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';

export const CartDrawer: React.FC = () => {
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateCartQuantity,
    removeFromCart,
    pricing,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    proceedToCheckout,
    settings
  } = useStore();

  const [couponInput, setCouponInput] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');

  if (!isCartOpen) return null;

  const freeThreshold = settings?.freeShippingThreshold ?? 3000;
  const subtotalAfterDiscount = pricing.subtotal - pricing.discountAmount;
  const amountToFreeShipping = Math.max(0, freeThreshold - subtotalAfterDiscount);
  const freeShippingPercent = Math.min(100, Math.round((subtotalAfterDiscount / freeThreshold) * 100));

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setIsApplyingCoupon(true);
    setCouponError('');
    const res = await applyCoupon(couponInput.trim());
    setIsApplyingCoupon(false);
    if (res.success) {
      setCouponInput('');
    } else {
      setCouponError(res.message);
    }
  };

  const handleProceedCheckout = () => {
    proceedToCheckout();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-slate-800" />
            <h2 className="font-heading text-lg font-bold text-slate-900">
              Shopping Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h2>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Close cart drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Shipping Progress Indicator */}
        <div className="bg-amber-50/60 border-b border-amber-100/60 px-5 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-900 mb-1.5">
            <Truck className="w-4 h-4 text-amber-600 shrink-0" />
            {amountToFreeShipping > 0 ? (
              <span>Add <strong className="font-bold">{formatPKR(amountToFreeShipping)}</strong> more for <strong>Free Shipping</strong>!</span>
            ) : (
              <span className="font-bold text-emerald-700">Congratulations! You unlocked Free Shipping.</span>
            )}
          </div>
          <div className="w-full bg-amber-200/50 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${amountToFreeShipping <= 0 ? 'bg-emerald-600' : 'bg-amber-600'}`}
              style={{ width: `${freeShippingPercent}%` }}
            />
          </div>
        </div>

        {/* Items List or Empty State */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-500">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <ShoppingBag className="w-8 h-8 text-slate-400" />
              </div>
              <p className="font-heading text-base font-bold text-slate-800 mb-1">Your cart is empty</p>
              <p className="text-xs text-slate-500 max-w-xs mb-6">
                Explore our handcrafted hairbrushes, vanity organizers, and lifestyle accessories.
              </p>
              <button
                onClick={() => setIsCartOpen(false)}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3.5 p-3 rounded-xl border border-slate-100 bg-white shadow-xs"
              >
                <div className="w-16 h-16 rounded-lg bg-slate-50 overflow-hidden shrink-0 border border-slate-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-slate-900 truncate">
                    {item.name}
                  </h4>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xs font-bold text-slate-900 tabular-nums">
                      {formatPKR(item.salePrice || item.price)}
                    </span>
                    {item.salePrice && item.salePrice < item.price && (
                      <span className="text-[10px] text-slate-400 line-through tabular-nums">
                        {formatPKR(item.price)}
                      </span>
                    )}
                  </div>

                  {/* Quantity and Remove */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                      <button
                        onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                        className="p-1 text-slate-600 hover:bg-slate-50"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-slate-900 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                        className="p-1 text-slate-600 hover:bg-slate-50"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Coupon, Totals, and Checkout */}
        {cart.length > 0 && (
          <div className="p-5 border-t border-slate-100 bg-slate-50/70 space-y-3.5">
            {/* Coupon Code Section */}
            {appliedCoupon ? (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <Tag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Coupon <strong>{appliedCoupon.code}</strong> applied (-{formatPKR(pricing.discountAmount)})</span>
                </div>
                <button
                  onClick={removeCoupon}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="space-y-1">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Coupon code (e.g. WELCOME10)"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl uppercase font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isApplyingCoupon || !couponInput.trim()}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {isApplyingCoupon ? '...' : 'Apply'}
                  </button>
                </div>
                {couponError && <p className="text-[11px] text-rose-600 pl-1">{couponError}</p>}
              </form>
            )}

            {/* Price Calculations */}
            <div className="space-y-1.5 text-xs text-slate-600 pt-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900 tabular-nums">{formatPKR(pricing.subtotal)}</span>
              </div>
              {pricing.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Coupon Discount</span>
                  <span className="font-semibold tabular-nums">-{formatPKR(pricing.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Nationwide Delivery</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {pricing.isFreeShipping ? (
                    <span className="text-emerald-700 font-bold uppercase text-[10px]">Free</span>
                  ) : (
                    formatPKR(pricing.shippingFee)
                  )}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline text-sm">
                <span className="font-bold text-slate-900">Total Payable</span>
                <span className="text-base font-extrabold text-slate-900 tabular-nums">
                  {formatPKR(pricing.total)}
                </span>
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleProceedCheckout}
              className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md shadow-amber-900/10 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <span>Guest Checkout (Cash on Delivery)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
