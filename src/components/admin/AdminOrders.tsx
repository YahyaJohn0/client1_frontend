import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  Truck,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Printer
} from 'lucide-react';
import type { Order, OrderStatus } from '../../types/store.ts';
import { api } from '../../services/api.ts';
import { formatPKR } from '../../utils/pricing.ts';
import { useStore } from '../../context/StoreContext.tsx';
import { PackingSlipModal } from './PackingSlipModal.tsx';

interface AdminOrdersProps {
  initialSelectedOrder?: Order | null;
}

export const AdminOrders: React.FC<AdminOrdersProps> = ({ initialSelectedOrder }) => {
  const { settings, showToast } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialSelectedOrder || null);
  const [isPackingSlipOpen, setIsPackingSlipOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Status Update State inside modal
  const [updatingStatus, setUpdatingStatus] = useState<OrderStatus>('confirmed');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierName, setCourierName] = useState('TCS Express');
  const [cancelReason, setCancelReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      // GET /api/v1/orders
      const res = await api.getOrders({ status: statusFilter, search });
      setOrders(res.orders);
    } catch (err: any) {
      console.error('[Admin Orders Load Error]', err);
      showToast(err.message || 'Failed to load orders from backend', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter, search]);

  useEffect(() => {
    if (initialSelectedOrder) {
      setSelectedOrder(initialSelectedOrder);
    }
  }, [initialSelectedOrder]);

  const openOrderDetails = async (order: Order) => {
    setSelectedOrder(order);
    setUpdatingStatus(order.fulfillmentStatus);
    setTrackingNumber(order.trackingNumber || '');
    setCourierName(order.courierName || 'TCS Express');
    setCancelReason(order.cancelReason || '');
    setInternalNotes(order.internalNotes || '');

    // Fetch fresh order details from GET /api/v1/orders/:id
    try {
      const res = await api.getOrder(order.id);
      if (res.order) {
        setSelectedOrder(res.order);
        setUpdatingStatus(res.order.fulfillmentStatus);
        setTrackingNumber(res.order.trackingNumber || '');
        setCourierName(res.order.courierName || 'TCS Express');
        setCancelReason(res.order.cancelReason || '');
        setInternalNotes(res.order.internalNotes || '');
      }
    } catch (err) {
      console.warn('Could not refresh order details from /api/v1/orders/:id:', err);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSavingStatus(true);
    try {
      // PATCH /api/v1/orders/:id/status
      const res = await api.updateOrderStatus(selectedOrder.id, updatingStatus, {
        trackingNumber: trackingNumber.trim() || undefined,
        courierName: courierName.trim() || undefined,
        cancelReason: cancelReason.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined
      });
      if (res.success && res.order) {
        setSelectedOrder(res.order);
        await loadOrders();
        showToast(`Order #${res.order.orderNumber} status updated to ${updatingStatus.toUpperCase()}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status', 'error');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Order Number', 'Date', 'Customer Name', 'Phone', 'City', 'Address', 'Total (PKR)', 'Status', 'Payment', 'Tracking'];
    const rows = orders.map(o => [
      o.orderNumber,
      new Date(o.createdAt).toISOString().split('T')[0],
      `"${o.customer.fullName.replace(/"/g, '""')}"`,
      `"${o.customer.phone}"`,
      `"${o.customer.city}"`,
      `"${o.customer.address.replace(/"/g, '""')}"`,
      o.total,
      o.fulfillmentStatus,
      o.paymentStatus,
      o.trackingNumber || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header with Search and Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Order Fulfillment & Management ({orders.length})
          </h2>
          <p className="text-xs text-slate-500">
            Process guest checkout orders, assign courier dispatches, print invoices, and update statuses.
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export Orders CSV</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order number, customer name, phone, or city..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        >
          <option value="all">All Fulfillment Statuses</option>
          <option value="placed">Placed</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase font-bold bg-slate-50">
                <th className="py-3 px-4 font-medium">Order #</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Destination</th>
                <th className="py-3 px-4 font-medium">Items Summary</th>
                <th className="py-3 px-4 font-medium">Total (PKR)</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">#{order.orderNumber}</td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {new Date(order.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{order.customer.fullName}</p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{order.customer.phone}</p>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="font-medium text-slate-800">{order.customer.city}</span>
                    <span className="block text-[10px] text-slate-400 truncate max-w-[130px]">{order.customer.address}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-slate-700 font-medium">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} items ({order.items[0]?.name.slice(0, 18)}...)
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 tabular-nums">
                    {formatPKR(order.total)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      order.fulfillmentStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                      order.fulfillmentStatus === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                      order.fulfillmentStatus === 'shipped' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {order.fulfillmentStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openOrderDetails(order)}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-[11px] transition-colors"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details & Status Updater Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Manage Order</span>
                <h3 className="font-heading text-lg font-bold text-slate-900">
                  #{selectedOrder.orderNumber}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPackingSlipOpen(true)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Invoice Slip</span>
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
              {/* Customer and Delivery Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Customer Contact</span>
                  <p className="font-bold text-slate-900 text-sm">{selectedOrder.customer.fullName}</p>
                  <p className="text-slate-600 mt-0.5">Phone: <strong>{selectedOrder.customer.phone}</strong></p>
                  {selectedOrder.customer.notes && (
                    <p className="text-amber-800 bg-amber-50 p-1.5 rounded mt-1.5 text-[11px] border border-amber-200/50">
                      Note: {selectedOrder.customer.notes}
                    </p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Delivery Destination</span>
                  <p className="font-medium text-slate-800">{selectedOrder.customer.address}</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedOrder.customer.city} {selectedOrder.customer.area ? `(${selectedOrder.customer.area})` : ''}</p>
                  <p className="text-slate-500 mt-1">Payment Method: <strong>Cash on Delivery (COD)</strong></p>
                </div>
              </div>

              {/* Items Purchased List */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
                  Items Snapshot ({selectedOrder.items.length})
                </h4>
                <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img src={item.image} alt={item.name} className="w-8 h-8 rounded-lg object-cover" />
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-400">Qty: {item.quantity} × {formatPKR(item.price)}</p>
                        </div>
                      </div>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {formatPKR(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Update Form */}
              <form onSubmit={handleUpdateStatus} className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 space-y-3.5">
                <h4 className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                  Update Fulfillment Pipeline
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      New Status
                    </label>
                    <select
                      value={updatingStatus}
                      onChange={(e) => setUpdatingStatus(e.target.value as OrderStatus)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-medium"
                    >
                      <option value="placed">Placed</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Processing</option>
                      <option value="packed">Packed</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled (Restock inventory)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Courier Service
                    </label>
                    <input
                      type="text"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      placeholder="e.g. TCS Express / Leopard"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Courier Tracking Number (if dispatched)
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. TCS-78901234"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono uppercase"
                  />
                </div>

                {updatingStatus === 'cancelled' && (
                  <div>
                    <label className="block text-xs font-semibold text-rose-700 mb-1">
                      Cancellation Reason (will automatically restock items)
                    </label>
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g. Customer cancelled via call / Fake address"
                      className="w-full px-3 py-2 text-xs bg-rose-50 border border-rose-200 rounded-xl text-rose-900"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Staff Notes
                  </label>
                  <input
                    type="text"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Private note visible only to administrators..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingStatus}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs"
                  >
                    {isSavingStatus ? 'Updating...' : 'Save Status Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Printable Packing Slip Modal */}
      {isPackingSlipOpen && selectedOrder && (
        <PackingSlipModal
          order={selectedOrder}
          settings={settings}
          onClose={() => setIsPackingSlipOpen(false)}
        />
      )}
    </div>
  );
};
