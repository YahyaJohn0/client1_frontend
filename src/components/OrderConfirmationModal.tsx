import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, ArrowRight, PackageCheck, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';

export const OrderConfirmationModal: React.FC = () => {
  const { confirmedOrder, setConfirmedOrder, setActiveTab } = useStore();
  const [copied, setCopied] = useState(false);

  if (!confirmedOrder) return null;

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(confirmedOrder.orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrackNow = () => {
    setConfirmedOrder(null);
    setActiveTab('track');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-lg rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-4 shadow-sm animate-bounce duration-1000">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h2 className="font-heading text-2xl font-bold text-slate-900 mb-1">
          Thank You, {confirmedOrder.customer.fullName}!
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mb-5">
          Your order has been placed successfully and will be delivered via Cash on Delivery.
        </p>

        {/* Order Number Box */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6 text-left space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Your Order Number
              </span>
              <span className="font-mono text-base font-extrabold text-amber-700">
                #{confirmedOrder.orderNumber}
              </span>
            </div>
            <button
              onClick={handleCopyOrderNumber}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="border-t border-slate-100 pt-3 text-xs space-y-1.5 text-slate-600">
            <div className="flex justify-between">
              <span>Delivery To:</span>
              <span className="font-semibold text-slate-900 text-right max-w-[200px] truncate">
                {confirmedOrder.customer.address}, {confirmedOrder.customer.city}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Contact Phone:</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {confirmedOrder.customer.phone}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Payable on Arrival (COD):</span>
              <span className="font-bold text-amber-700 tabular-nums">
                {formatPKR(confirmedOrder.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={handleTrackNow}
            className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md shadow-amber-900/10 flex items-center justify-center gap-2 transition-all"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Track Order Timeline</span>
          </button>

          <button
            onClick={() => {
              setConfirmedOrder(null);
              setActiveTab('home');
            }}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Continue Shopping</span>
          </button>
        </div>
      </div>
    </div>
  );
};
