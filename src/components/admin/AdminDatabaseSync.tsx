import React, { useState, useEffect } from 'react';
import { Database, Cloud, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { api, getApiBaseUrl } from '../../services/api.ts';
import { auth } from '../../services/firebase.ts';

export const AdminDatabaseSync: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState<any>(null);
  const [readinessStatus, setReadinessStatus] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [live, ready] = await Promise.all([
        api.checkLiveness().catch(err => ({ status: 'error', message: err.message })),
        api.checkReadiness().catch(err => ({ status: 'error', message: err.message }))
      ]);
      setLivenessStatus(live);
      setReadinessStatus(ready);
    } catch (err: any) {
      setErrorMessage(err.message || 'Health check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const currentUser = auth.currentUser;
  const baseUrl = getApiBaseUrl();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Live Backend Integration Status (/health/live & /health/ready)
            </h3>
            <p className="text-[11px] text-slate-500">
              Connected Backend: <span className="font-mono font-semibold text-slate-700">{baseUrl}</span>
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
        {/* Backend API Liveness */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-600" /> API Liveness
            </span>
            {livenessStatus?.status === 'ok' || livenessStatus?.status === 'live' || livenessStatus?.status === 'healthy' ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Live
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {livenessStatus?.status || 'Pending'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Endpoint: <code className="bg-slate-200/70 px-1 py-0.5 rounded font-mono">GET /health/live</code>
          </p>
        </div>

        {/* Backend API Readiness */}
        <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" /> Service Readiness
            </span>
            {readinessStatus?.status === 'ok' || readinessStatus?.status === 'ready' ? (
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
            Endpoint: <code className="bg-slate-200/70 px-1 py-0.5 rounded font-mono">GET /health/ready</code>
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
