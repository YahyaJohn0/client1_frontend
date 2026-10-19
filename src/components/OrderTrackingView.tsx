import React, { useState } from 'react';
import { Search, Package, CheckCircle, Clock, Truck, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import type { Order, OrderStatus } from '../types/store.ts';
import { api } from '../services/api.ts';
import { formatPKR } from '../utils/pricing.ts';

const STATUS_STEPS: Array<{ key: OrderStatus; label: string; desc: string }> = [
  { key: 'placed', label: 'Order Placed', desc: 'Received and registered in system' },
  { key: 'confirmed', label: 'Confirmed', desc: 'Verified and queued for warehouse' },
  { key: 'processing', label: 'Processing', desc: 'Item allocated & quality checked' },
  { key: 'packed', label: 'Packed', desc: 'Boxed with invoice & packing slip' },
  { key: 'shipped', label: 'Shipped', desc: 'Handed over to courier partner' },
  { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Courier rider is en route' },
  { key: 'delivered', label: 'Delivered', desc: 'Parcel safely handed over & COD collected' }
];

export const OrderTrackingView: React.FC = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) {
      setError('Please provide both Order Number and your Mobile Phone number.');
      return;
    }
    setIsLoading(true);
    setError('');
    setOrder(null);

    try {
      const res = await api.trackOrder(orderNumber.trim(), phone.trim());
      if (res.order) {
        setOrder(res.order);
      } else {
        setError('No order found matching this order number and phone number.');
      }
    } catch (err: any) {
      setError(err.message || 'No matching order found. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStepStatus = (stepKey: OrderStatus, currentStatus: OrderStatus) => {
    if (currentStatus === 'cancelled') return 'cancelled';
    const stepOrder = STATUS_STEPS.map(s => s.key);
    const currentIndex = stepOrder.indexOf(currentStatus);
    const thisIndex = stepOrder.indexOf(stepKey);

    if (thisIndex < currentIndex) return 'completed';
    if (thisIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Page Header */}
      <div className="text-center max-w-md mx-auto mb-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center mb-3">
          <Truck className="w-6 h-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-slate-900 tracking-tight mb-1">
          Track Your Order
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Enter your order number and mobile number to see real-time delivery progress.
        </p>
      </div>

      {/* Tracking Search Form */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs mb-8">
        <form onSubmit={handleTrack} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Order Number
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. ORD-8821 or ORD-XXXX"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0300 1234567"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setOrderNumber('ORD-8821');
                setPhone('03001234567');
              }}
              className="px-3 py-2 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors"
            >
              Demo Order (#ORD-8821)
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Search className="w-4 h-4" />
              <span>{isLoading ? 'Searching...' : 'Find Order'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Order Results Card */}
      {order && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden animate-in fade-in duration-200">
          {/* Order Header */}
          <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Order Tracking Record
              </span>
              <h2 className="font-heading text-lg font-bold text-slate-900">
                #{order.orderNumber}
              </h2>
              <p className="text-xs text-slate-500">
                Placed on {new Date(order.createdAt).toLocaleDateString('en-PK', { dateStyle: 'medium' })}
              </p>
            </div>

            <div className="text-right">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                order.fulfillmentStatus === 'delivered'
                  ? 'bg-emerald-100 text-emerald-800'
                  : order.fulfillmentStatus === 'cancelled'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {order.fulfillmentStatus.replace('_', ' ')}
              </span>
              <p className="text-xs font-bold text-slate-900 mt-1 tabular-nums">
                COD: {formatPKR(order.total)}
              </p>
            </div>
          </div>

          {/* Courier Banner if Shipped */}
          {order.trackingNumber && (
            <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-700" />
                <span>Courier: <strong>{order.courierName || 'Standard Express'}</strong></span>
                <span className="text-amber-400">·</span>
                <span>Tracking ID: <strong className="font-mono">{order.trackingNumber}</strong></span>
              </div>
            </div>
          )}

          {/* Progress Timeline */}
          <div className="p-6 sm:p-8">
            <h3 className="font-heading text-sm font-bold text-slate-900 mb-6">
              Fulfillment Journey
            </h3>

            {order.fulfillmentStatus === 'cancelled' ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 mb-6">
                <p className="font-bold text-rose-900">This order was cancelled.</p>
                <p className="mt-1">{order.cancelReason || 'Cancelled by store administrator.'}</p>
              </div>
            ) : (
              <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {STATUS_STEPS.map((step) => {
                  const state = getStepStatus(step.key, order.fulfillmentStatus);
                  const isDone = state === 'completed';
                  const isCurrent = state === 'current';

                  return (
                    <div key={step.key} className="relative flex items-start gap-4">
                      {/* Circle on timeline */}
                      <div
                        className={`absolute -left-6 sm:-left-8 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
                          isDone
                            ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
                            : isCurrent
                            ? 'bg-amber-600 text-white ring-4 ring-amber-100 animate-pulse'
                            : 'bg-white border-2 border-slate-300 text-slate-400'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : isCurrent ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        )}
                      </div>

                      {/* Content */}
                      <div>
                        <h4 className={`text-xs font-bold ${
                          isDone || isCurrent ? 'text-slate-900' : 'text-slate-400'
                        }`}>
                          {step.label}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Items Summary Table */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <h3 className="font-heading text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                Items in This Parcel
              </h3>
              <div className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatPKR(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
