import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { api } from '../../services/api.ts';
import { adminAuth } from '../../services/firebase.ts';

interface FirebaseConnectionStatus {
  status: string;
  message?: string;
}

export const AdminDatabaseSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [readinessStatus, setReadinessStatus] = useState<FirebaseConnectionStatus | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      setReadinessStatus(await api.checkReadiness());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backend database connection check failed.';
      setReadinessStatus({ status: 'error', message });
      console.error('Firebase connection check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const currentUser = adminAuth.currentUser;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">Database Connection Status</h3>
            <p className="text-[11px] text-slate-500">
              Product catalog requests use the secured API and MongoDB-compatible Firestore connection.
            </p>
          </div>
        </div>

        <button
          onClick={checkStatus}
          disabled={loading}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Health</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
        {/* Static frontend */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-600" /> Frontend
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Loaded
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Static storefront loaded in the browser.
          </p>
        </div>

        {/* Product database */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" /> Product Database
            </span>
            {readinessStatus?.status === 'ready' ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {readinessStatus?.status || 'Checking'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {readinessStatus?.message || 'Checking MongoDB-compatible Firestore and Firebase services.'}
          </p>
        </div>

        {/* Firebase Administrator Session */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-600" /> Firebase Auth
            </span>
            {currentUser ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                Not Signed In
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate" title={currentUser?.email || ''}>
            User: {currentUser?.email || 'None'}
          </p>
        </div>
      </div>
    </div>
  );
};
