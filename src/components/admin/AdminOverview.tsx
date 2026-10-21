import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  AlertTriangle,
  CheckCircle,
  Truck,
  XCircle,
  ArrowRight,
  Package
} from 'lucide-react';
import type { DashboardReports, Order } from '../../types/store.ts';
import { api } from '../../services/api.ts';
import { formatPKR } from '../../utils/pricing.ts';

interface AdminOverviewProps {
  onNavigateTab: (tab: 'products' | 'categories' | 'orders' | 'promotions' | 'audit') => void;
  onSelectOrder: (order: Order) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigateTab, onSelectOrder }) => {
  const [reports, setReports] = useState<DashboardReports | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordRes, prodRes] = await Promise.all([
        api.getOrders(),
        api.getProducts({ includeInactive: true })
      ]);
      const orders = ordRes.orders || [];
      const products = prodRes.products || [];

      // Calculate dashboard metrics from Firebase orders and products.
      const placed = orders.filter(o => o.fulfillmentStatus === 'placed').length;
      const confirmed = orders.filter(o => o.fulfillmentStatus === 'confirmed').length;
      const processing = orders.filter(o => o.fulfillmentStatus === 'processing' || o.fulfillmentStatus === 'packed').length;
      const shipped = orders.filter(o => o.fulfillmentStatus === 'shipped' || o.fulfillmentStatus === 'out_for_delivery').length;
      const delivered = orders.filter(o => o.fulfillmentStatus === 'delivered').length;
      const cancelled = orders.filter(o => o.fulfillmentStatus === 'cancelled').length;

      const grossSales = orders
        .filter(o => o.fulfillmentStatus !== 'cancelled')
        .reduce((sum, o) => sum + (o.total || 0), 0);

      const completedSales = orders
        .filter(o => o.fulfillmentStatus === 'delivered')
        .reduce((sum, o) => sum + (o.total || 0), 0);

      const lowStockProducts = products.filter(p => p.stock > 0 && p.stock <= 5);
      const outOfStockProducts = products.filter(p => p.stock <= 0);

      // Compute top selling products from orders items
      const salesMap = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();
      orders.filter(o => o.fulfillmentStatus !== 'cancelled').forEach(o => {
        (o.items || []).forEach(item => {
          const prev = salesMap.get(item.productId) || { id: item.productId, name: item.name, quantity: 0, revenue: 0 };
          prev.quantity += item.quantity;
          prev.revenue += (item.price || 0) * item.quantity;
          salesMap.set(item.productId, prev);
        });
      });
      const topSellingProducts = Array.from(salesMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const calculatedReports: DashboardReports = {
        totalOrders: orders.length,
        placedOrders: placed,
        confirmedOrders: confirmed,
        processingOrders: processing,
        shippedOrders: shipped,
        deliveredOrders: delivered,
        cancelledOrders: cancelled,
        grossSales,
        completedSales,
        lowStockProducts,
        outOfStockProducts,
        topSellingProducts
      };

      setReports(calculatedReports);
      setRecentOrders(orders.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard metrics from Firebase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading || !reports) {
    return (
      <div className="py-12 text-center text-xs text-slate-500">
        Loading real-time store metrics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Gross Sales</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tabular-nums">
            {formatPKR(reports.grossSales)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Active COD orders</span>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Net Delivered</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
            {formatPKR(reports.completedSales)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">{reports.deliveredOrders} orders delivered</span>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Total Orders</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-slate-900 tabular-nums">
            {reports.totalOrders}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {reports.placedOrders + reports.confirmedOrders + reports.processingOrders} awaiting shipment
          </span>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Low Stock Alert</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-rose-700 tabular-nums">
            {reports.lowStockProducts.length + reports.outOfStockProducts.length}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Products below 10 units</span>
        </div>
      </div>

      {/* Order Status Breakdown Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
          Order Pipeline Status
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-500 font-semibold uppercase block">Placed</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">{reports.placedOrders}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
            <span className="text-[10px] text-blue-700 font-semibold uppercase block">Confirmed</span>
            <span className="text-base font-bold text-blue-900 tabular-nums">{reports.confirmedOrders}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
            <span className="text-[10px] text-amber-700 font-semibold uppercase block">Processing</span>
            <span className="text-base font-bold text-amber-900 tabular-nums">{reports.processingOrders}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
            <span className="text-[10px] text-indigo-700 font-semibold uppercase block">Shipped</span>
            <span className="text-base font-bold text-indigo-900 tabular-nums">{reports.shippedOrders}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <span className="text-[10px] text-emerald-700 font-semibold uppercase block">Delivered</span>
            <span className="text-base font-bold text-emerald-900 tabular-nums">{reports.deliveredOrders}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-100">
            <span className="text-[10px] text-rose-700 font-semibold uppercase block">Cancelled</span>
            <span className="text-base font-bold text-rose-900 tabular-nums">{reports.cancelledOrders}</span>
          </div>
        </div>
      </div>

      {/* Grid: Low Stock Warnings & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Items */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Inventory Alerts</span>
              </h3>
              <button
                onClick={() => onNavigateTab('products')}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                Manage Stock â†’
              </button>
            </div>

            {reports.lowStockProducts.length === 0 && reports.outOfStockProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">All catalog items have healthy stock levels.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...reports.outOfStockProducts, ...reports.lowStockProducts].slice(0, 4).map(prod => (
                  <div key={prod.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        <img src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 truncate max-w-[200px]">{prod.name}</p>
                        <p className="text-[10px] text-slate-400">SKU: {prod.sku}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] tabular-nums ${
                      prod.stock <= 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {prod.stock <= 0 ? 'OUT OF STOCK' : `${prod.stock} left`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
          <h3 className="font-heading text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Top Performing Products</span>
          </h3>

          {reports.topSellingProducts.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No order sales registered yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.topSellingProducts.slice(0, 4).map((item, idx) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 font-bold text-slate-400 tabular-nums">0{idx + 1}.</span>
                    <span className="font-semibold text-slate-900 truncate max-w-[190px]">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 tabular-nums">{item.quantity} sold</span>
                    <span className="text-[10px] text-slate-400 block tabular-nums">{formatPKR(item.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" />
            <span>Recent Customer Orders</span>
          </h3>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            <span>All Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase font-bold">
                <th className="pb-2 font-medium">Order #</th>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">City</th>
                <th className="pb-2 font-medium">Total (PKR)</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/70">
                  <td className="py-3 font-mono font-bold text-slate-900">#{order.orderNumber}</td>
                  <td className="py-3 font-medium text-slate-800">{order.customer.fullName}</td>
                  <td className="py-3 text-slate-600">{order.customer.city}</td>
                  <td className="py-3 font-bold text-slate-900 tabular-nums">{formatPKR(order.total)}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      order.fulfillmentStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                      order.fulfillmentStatus === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {order.fulfillmentStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => onSelectOrder(order)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
