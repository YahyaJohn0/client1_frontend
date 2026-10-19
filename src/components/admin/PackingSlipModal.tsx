import React from 'react';
import { Printer, X, CheckCircle, Package } from 'lucide-react';
import type { Order, StoreSettings } from '../../types/store.ts';
import { formatPKR } from '../../utils/pricing.ts';

interface PackingSlipModalProps {
  order: Order;
  settings: StoreSettings | null;
  onClose: () => void;
}

export const PackingSlipModal: React.FC<PackingSlipModalProps> = ({ order, settings, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controls Bar */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Invoice & Packing Slip — #{order.orderNumber}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Document */}
        <div className="p-8 sm:p-10 overflow-y-auto space-y-6 text-slate-800 bg-white">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-md bg-amber-600 text-white font-bold flex items-center justify-center text-sm">
                  Z
                </div>
                <h1 className="font-heading text-xl font-extrabold text-slate-900">
                  {settings?.storeName || 'Zamzam'}
                </h1>
              </div>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {settings?.address || 'Lahore, Pakistan'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Phone: {settings?.contactPhone} · {settings?.contactEmail}
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-widest rounded-md mb-2">
                COD INVOICE
              </span>
              <p className="font-mono text-base font-extrabold text-slate-900">#{order.orderNumber}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Date: {new Date(order.createdAt).toLocaleDateString('en-PK', { dateStyle: 'long' })}
              </p>
            </div>
          </div>

          {/* Customer / Shipping Details Grid */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">
                Ship To (Customer):
              </span>
              <p className="font-bold text-sm text-slate-900">{order.customer.fullName}</p>
              <p className="text-slate-600 mt-1 leading-snug">{order.customer.address}</p>
              <p className="text-slate-600 font-semibold">{order.customer.city} {order.customer.area ? `(${order.customer.area})` : ''}</p>
              <p className="text-slate-900 font-bold mt-1">Phone: {order.customer.phone}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">
                Dispatch & Payment Details:
              </span>
              <p className="text-slate-700"><strong>Payment Method:</strong> Cash on Delivery (COD)</p>
              <p className="text-slate-700 mt-0.5"><strong>Fulfillment:</strong> {order.fulfillmentStatus.toUpperCase()}</p>
              {order.trackingNumber && (
                <p className="text-slate-700 mt-0.5"><strong>Courier:</strong> {order.courierName} ({order.trackingNumber})</p>
              )}
              {order.customer.notes && (
                <p className="text-amber-900 bg-amber-50 p-1.5 rounded mt-1.5 text-[11px] font-medium border border-amber-200/60">
                  Note: {order.customer.notes}
                </p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div>
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      {item.sku && <p className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</p>}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatPKR(item.price)}</td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-900 tabular-nums">{formatPKR(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Discount:</span>
                  <span className="tabular-nums">-{formatPKR(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Delivery Charges:</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {order.shippingFee === 0 ? 'FREE' : formatPKR(order.shippingFee)}
                </span>
              </div>
              <div className="border-t-2 border-slate-900 pt-2 flex justify-between items-baseline font-bold text-sm text-slate-900">
                <span>Total Cash Due (COD):</span>
                <span className="text-base font-extrabold text-amber-800 tabular-nums">
                  {formatPKR(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t border-slate-100 pt-6 text-center text-[11px] text-slate-400">
            <p>Thank you for shopping with {settings?.storeName || 'Zamzam'}!</p>
            <p className="mt-0.5">Please hand exact cash of {formatPKR(order.total)} to the courier upon delivery.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
