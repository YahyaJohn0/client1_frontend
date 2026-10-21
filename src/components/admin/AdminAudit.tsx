import React, { useState, useEffect } from 'react';
import { History, ShieldAlert, RefreshCcw, Info } from 'lucide-react';
import type { AuditLog, InventoryMovement } from '../../types/store.ts';
import { api } from '../../services/api.ts';

export const AdminAudit: React.FC = () => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');
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

      // Estimate movement history from orders; client-side checkout does not reserve stock.
      const derivedMovements: InventoryMovement[] = [];
      orders.forEach((o) => {
        (o.items || []).forEach((item, idx) => {
          derivedMovements.push({
            id: `mov-${o.id}-${idx}`,
            productId: item.productId,
            productName: item.name,
            type: o.fulfillmentStatus === 'cancelled' ? 'order_cancellation_restock' : 'order_deduction',
            quantityChange: o.fulfillmentStatus === 'cancelled' ? item.quantity : -item.quantity,
            previousStock: 20,
            newStock: Math.max(0, 20 - item.quantity),
            reason: `Order #${o.orderNumber} (${o.fulfillmentStatus})`,
            timestamp: o.createdAt || new Date().toISOString(),
            performedBy: o.customer.fullName || 'Customer'
          });
        });
      });

      // Derive audit logs from order history and product timestamps
      const derivedLogs: AuditLog[] = [];
      orders.forEach((o) => {
        (o.statusHistory || []).forEach((sh, sidx) => {
          derivedLogs.push({
            id: `log-ord-${o.id}-${sidx}`,
            action: `Order Status -> ${sh.status.toUpperCase()}`,
            entityType: 'order',
            entityId: o.orderNumber,
            details: sh.note || `Fulfillment marked as ${sh.status}`,
            performedBy: 'Administrator',
            timestamp: sh.timestamp
          });
        });
      });

      products.forEach((p) => {
        derivedLogs.push({
          id: `log-prod-${p.id}`,
          action: p.isActive ? 'Product Active' : 'Product Archived/Inactive',
          entityType: 'product',
          entityId: p.sku,
          details: `Current stock: ${p.stock} units, Regular Price: Rs. ${p.price}`,
          performedBy: 'Administrator',
          timestamp: p.updatedAt || p.createdAt || new Date().toISOString()
        });
      });

      derivedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      derivedMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setMovements(derivedMovements);
      setLogs(derivedLogs);
    } catch (err) {
      console.error('Audit trail load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Stock Ledger & Audit Trail
          </h2>
          <p className="text-xs text-slate-500">
            Activity stream derived from Firebase order and product records.
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          These entries are derived from Firebase order history and current product records; they are not an authoritative inventory ledger. Client-side checkout does not automatically reserve or decrement stock.
        </p>
      </div>

      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'inventory' ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Inventory Movements ({movements.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'audit' ? 'border-amber-600 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Order & Status Audit Logs ({logs.length})</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading records from Firebase...</div>
      ) : activeTab === 'inventory' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {movements.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No inventory movements recorded yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Product</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Qty Change</th>
                  <th className="py-3 px-4 font-medium">Reason / Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(m.timestamp).toLocaleDateString('en-PK', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{m.productName}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        m.quantityChange < 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                      }`}>
                        {m.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`py-3 px-4 font-bold tabular-nums ${
                      m.quantityChange < 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}>
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No audit logs found.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Target</th>
                  <th className="py-3 px-4 font-medium">Details</th>
                  <th className="py-3 px-4 font-medium">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleDateString('en-PK', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{l.action}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{l.entityId}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={l.details}>
                      {l.details}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{l.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
