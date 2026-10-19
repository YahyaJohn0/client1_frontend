import React, { useState, useEffect } from 'react';
import { X, User as UserIcon, LogOut, Package, Mail, Calendar, ExternalLink, CheckCircle2, Clock, Truck, RefreshCw } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { api } from '../services/api.ts';
import { formatPKR } from '../utils/pricing.ts';
import type { Order } from '../types/store.ts';

export const CustomerAccountModal: React.FC = () => {
  const {
    customerUser,
    isCustomerAccountModalOpen,
    setIsCustomerAccountModalOpen,
    customerLogout,
    setActiveTab
  } = useStore();

  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Fetch only this customer's private orders
  useEffect(() => {
    if (isCustomerAccountModalOpen && customerUser) {
      setIsLoadingOrders(true);
      // The API scopes this list to the verified Firebase UID in the ID token.
      api.getCustomerOrders()
        .then(res => {
          setCustomerOrders(res.orders || []);
        })
        .catch(err => {
          console.warn('Customer orders fetch error:', err);
          setCustomerOrders([]);
        })
        .finally(() => {
          setIsLoadingOrders(false);
        });
    }
  }, [isCustomerAccountModalOpen, customerUser]);

  if (!isCustomerAccountModalOpen || !customerUser) return null;

  const displayName = customerUser.displayName || customerUser.email?.split('@')[0] || 'Customer';
  const photoUrl = customerUser.photoURL;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'shipped':
      case 'out_for_delivery':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'processing':
      case 'confirmed':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Profile Section */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white relative">
          <button
            onClick={() => setIsCustomerAccountModalOpen(false)}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="w-14 h-14 rounded-2xl border-2 border-amber-400/60 object-cover shadow-md"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xl flex items-center justify-center shadow-md">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-white truncate">
                {displayName}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{customerUser.email}</span>
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-[10px] font-semibold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Verified Customer Account
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Actions Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h4 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              <span>Your Orders History</span>
            </h4>
            <button
              onClick={() => {
                setIsCustomerAccountModalOpen(false);
                setActiveTab('track');
              }}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Track with Phone</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Customer Orders List (Isolated to this customer) */}
          {isLoadingOrders ? (
            <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-amber-600" />
              <span>Loading your account orders...</span>
            </div>
          ) : customerOrders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-2 bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <Package className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-800">No previous orders yet</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Items you order while signed into this account will be securely listed here for real-time tracking and delivery receipts.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {customerOrders.map(order => (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-amber-300 transition-all shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 font-mono">#{order.orderNumber}</span>
                      <span className="text-[11px] text-slate-400 ml-2">
                        {new Date(order.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getStatusBadge(order.fulfillmentStatus)}`}>
                      {order.fulfillmentStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    <p className="line-clamp-1 text-[11px]">
                      {order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="font-medium text-slate-500">Total Amount:</span>
                    <span className="font-extrabold text-slate-900">{formatPKR(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Account Security & Sign Out Section */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              Session secured via Firebase Authentication.
            </p>
            <button
              type="button"
              onClick={customerLogout}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
