import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  Percent,
  History,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Settings,
  X,
  KeyRound
} from 'lucide-react';
import { AdminLogin } from './AdminLogin.tsx';
import { AdminSecurity } from './AdminSecurity.tsx';
import { AdminOverview } from './AdminOverview.tsx';
import { AdminProducts } from './AdminProducts.tsx';
import { AdminCategories } from './AdminCategories.tsx';
import { AdminOrders } from './AdminOrders.tsx';
import { AdminPromotions } from './AdminPromotions.tsx';
import { AdminAudit } from './AdminAudit.tsx';
import {
  api,
  ApiError,
  getApiBaseUrl,
  getApiBaseUrlOverride,
  setApiBaseUrl,
  type AdminIdentity
} from '../../services/api.ts';
import { onAdminAuthStateChanged, adminSignOut } from '../../services/firebase.ts';
import type { Order } from '../../types/store.ts';
import { useStore } from '../../context/StoreContext.tsx';

interface HealthStatus {
  isChecking: boolean;
  isLive: boolean;
  isReady: boolean;
  lastChecked: Date | null;
  errorMessage?: string;
  livenessData?: any;
  readinessData?: any;
}

export const AdminLayout: React.FC = () => {
  const { setActiveTab } = useStore();
  const [adminUser, setAdminUser] = useState<AdminIdentity | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [deniedUid, setDeniedUid] = useState<string | undefined>(undefined);
  const [activeAdminTab, setActiveAdminTab] = useState<
    'overview' | 'products' | 'categories' | 'orders' | 'promotions' | 'audit' | 'security'
  >('overview');
  const [selectedOrderForManagement, setSelectedOrderForManagement] = useState<Order | null>(null);

  // Health and connection state
  const [health, setHealth] = useState<HealthStatus>({
    isChecking: false,
    isLive: false,
    isReady: false,
    lastChecked: null
  });
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [tempBaseUrl, setTempBaseUrl] = useState(getApiBaseUrl());
  const [testResult, setTestResult] = useState<string | null>(null);

  /**
   * The backend is the only authority on administrator access. The UI opens
   * only after GET /api/admin/me confirms an authorized administrator session;
   * nothing stored in the browser grants access.
   */
  const refreshAdmin = useCallback(async (): Promise<AdminIdentity | null> => {
    try {
      const identity = await api.adminMe();
      setAdminUser(identity);
      setAuthError('');
      setDeniedUid(undefined);
      return identity;
    } catch (err: any) {
      setAdminUser(null);
      if (err instanceof ApiError && err.status === 403) {
        setAuthError(err.message || 'This account is not authorized as an administrator.');
        setDeniedUid(err.details?.uid);
      } else if (err instanceof ApiError && err.status === 401) {
        setAuthError('');
        setDeniedUid(undefined);
      } else {
        setAuthError(err?.message || 'Could not verify the administrator session.');
      }
      return null;
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshAdmin();
    // Re-check after the admin Firebase app signs in or out.
    const unsubscribe = onAdminAuthStateChanged(() => {
      refreshAdmin();
    });
    return () => unsubscribe();
  }, [refreshAdmin]);

  const checkHealth = useCallback(async () => {
    setHealth(prev => ({ ...prev, isChecking: true }));
    let live = false;
    let ready = false;
    let liveData: any = null;
    let readyData: any = null;
    let errorMsg: string | undefined = undefined;

    try {
      liveData = await api.checkLiveness();
      live = true;
    } catch (err: any) {
      errorMsg = err.message || 'Liveness check failed';
    }

    if (live) {
      try {
        readyData = await api.checkReadiness();
        ready = true;
      } catch (err: any) {
        errorMsg = err.message || 'Readiness check failed';
      }
    }

    setHealth({
      isChecking: false,
      isLive: live,
      isReady: ready,
      lastChecked: new Date(),
      errorMessage: errorMsg,
      livenessData: liveData,
      readinessData: readyData
    });
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleLogout = async () => {
    // Revoke the server-side session (when one exists), then sign out the
    // dedicated administrator Firebase app. Customer authentication is kept.
    try {
      await api.adminLogout();
    } catch (e) {
      console.error('Backend logout error:', e);
    }
    try {
      await adminSignOut();
    } catch (e) {
      console.error('Firebase logout error:', e);
    }
    setAdminUser(null);
    setActiveAdminTab('overview');
    setAuthError('');
    setDeniedUid(undefined);
  };

  const handleLoginSuccess = (identity: AdminIdentity) => {
    setAdminUser(identity);
    setAuthError('');
    setDeniedUid(undefined);
    setIsCheckingAuth(false);
    setActiveAdminTab(identity.mustChangePassword ? 'security' : 'overview');
  };

  const handleSaveApiUrl = () => {
    setApiBaseUrl(tempBaseUrl.trim());
    setIsConfigModalOpen(false);
    setTestResult(null);
    checkHealth();
  };

  const handleTestUrl = async () => {
    setTestResult('Testing connection...');
    const originalOverride = getApiBaseUrlOverride();
    try {
      setApiBaseUrl(tempBaseUrl.trim());
      const live = await api.checkLiveness();
      setTestResult(`Success! Backend responded: ${JSON.stringify(live)}`);
    } catch (err: any) {
      // A failed probe must not leave the portal pointed at an unreachable API.
      setApiBaseUrl(originalOverride);
      setTestResult(`Connection failed: ${err.message}`);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-slate-500 font-medium">
        Verifying administrator authorization...
      </div>
    );
  }

  if (!adminUser) {
    return (
      <AdminLogin
        onLoginSuccess={handleLoginSuccess}
        onExit={() => {
          if (window.location.pathname.startsWith('/adminportal')) {
            window.location.href = '/';
          } else {
            setActiveTab('home');
          }
        }}
        initialError={authError}
        initialUid={deniedUid}
      />
    );
  }

  // A legacy/default password must be rotated before any administration.
  if (adminUser.mustChangePassword) {
    return (
      <div className="min-h-screen bg-[#F1F5F9]">
        <header className="bg-slate-900 text-white shadow-md">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold text-sm shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="font-heading font-bold text-base tracking-tight text-white block">
                  Zamzam Admin Console
                </span>
                <span className="text-[10px] text-amber-400 font-mono -mt-1 block truncate max-w-[240px]">
                  {adminUser.email || adminUser.identifier}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-rose-800/60 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <AdminSecurity
            admin={adminUser}
            forced
            onChanged={refreshAdmin}
            onSignOut={handleLogout}
          />
        </main>
      </div>
    );
  }

  const navigateToOrder = (order: Order) => {
    setSelectedOrderForManagement(order);
    setActiveAdminTab('orders');
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-20">
      {/* Admin Top Navigation */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold text-sm shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-heading font-bold text-base tracking-tight text-white block">
                Zamzam Admin Console
              </span>
              <span className="text-[10px] text-amber-400 font-mono -mt-1 block truncate max-w-[180px] sm:max-w-none">
                {adminUser.email || adminUser.identifier}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Backend Health Connection Indicator */}
            <button
              onClick={() => {
                setTempBaseUrl(getApiBaseUrl());
                setTestResult(null);
                setIsConfigModalOpen(true);
              }}
              title="Click to view backend connection & health diagnostics"
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                health.isLive && health.isReady
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/80'
                  : health.isLive
                  ? 'bg-amber-950/60 border-amber-800/80 text-amber-300 hover:bg-amber-900/80'
                  : 'bg-rose-950/60 border-rose-800/80 text-rose-300 hover:bg-rose-900/80'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    health.isLive && health.isReady ? 'bg-emerald-400' : health.isLive ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    health.isLive && health.isReady ? 'bg-emerald-500' : health.isLive ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="hidden sm:inline">
                {health.isLive && health.isReady ? 'Backend Ready' : health.isLive ? 'Backend Live' : 'Backend Offline'}
              </span>
            </button>

            <button
              onClick={() => {
                if (window.location.pathname.startsWith('/adminportal')) {
                  window.location.href = '/';
                } else {
                  setActiveTab('home');
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Storefront</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-rose-800/60 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="bg-slate-800/90 border-t border-slate-700/60 px-4 sm:px-6 overflow-x-auto scrollbar-none no-scrollbar">
          <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveAdminTab('overview')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'overview'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('products')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'products'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Products</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('categories')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'categories'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Categories</span>
            </button>

            <button
              onClick={() => {
                setSelectedOrderForManagement(null);
                setActiveAdminTab('orders');
              }}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'orders'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Orders & Invoices</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('promotions')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'promotions'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Percent className="w-4 h-4" />
              <span>Promotions & Settings</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('audit')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'audit'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Stock Ledger & Audit</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('security')}
              className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeAdminTab === 'security'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Security</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin View Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeAdminTab === 'overview' && (
          <AdminOverview
            onNavigateTab={setActiveAdminTab}
            onSelectOrder={navigateToOrder}
          />
        )}
        {activeAdminTab === 'products' && <AdminProducts />}
        {activeAdminTab === 'categories' && <AdminCategories />}
        {activeAdminTab === 'orders' && (
          <AdminOrders initialSelectedOrder={selectedOrderForManagement} />
        )}
        {activeAdminTab === 'promotions' && <AdminPromotions />}
        {activeAdminTab === 'audit' && <AdminAudit />}
        {activeAdminTab === 'security' && (
          <AdminSecurity
            admin={adminUser}
            onChanged={refreshAdmin}
            onSignOut={handleLogout}
          />
        )}
      </main>

      {/* Backend API Configuration & Health Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-slate-900">
                    Backend Connection & Health Diagnostics
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Liveness (/health/live) & Readiness (/health/ready)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Health Status Box */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border ${
                  health.isLive ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {health.isLive ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                    <span className="text-xs font-bold">Liveness Check</span>
                  </div>
                  <p className="text-[11px]">
                    {health.isLive ? 'Process responding OK' : 'Process offline or unreachable'}
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${
                  health.isReady ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {health.isReady ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    <span className="text-xs font-bold">Readiness Check</span>
                  </div>
                  <p className="text-[11px]">
                    {health.isReady ? 'Database & dependencies ready' : 'Dependencies pending/offline'}
                  </p>
                </div>
              </div>

              {health.errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Connection Diagnostic:</span>
                    <span className="text-[11px]">{health.errorMessage}</span>
                  </div>
                </div>
              )}

              {/* API Base URL Configuration */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Backend Base URL Override
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempBaseUrl}
                    onChange={(e) => setTempBaseUrl(e.target.value)}
                    placeholder="Same origin — leave empty to use the bundled API"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                  <button
                    type="button"
                    onClick={handleTestUrl}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Test
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  By default the storefront calls the API on the same origin that served this page (the bundled server on port 3000). Set a URL only when the API is hosted elsewhere; a trailing <code>/api/v1</code> is accepted and normalized.
                </p>
              </div>

              {testResult && (
                <div className="p-2.5 bg-slate-100 rounded-xl text-[11px] font-mono text-slate-800 break-all">
                  {testResult}
                </div>
              )}

              {/* Verified Administrator Session */}
              <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                <span className="font-semibold text-slate-700 block">Verified Administrator Session</span>
                <p className="text-slate-600 text-[11px]">
                  Account: <span className="font-mono text-slate-900">{adminUser.email || adminUser.identifier}</span>
                </p>
                <p className="text-slate-600 text-[11px]">
                  Provider: <span className="font-mono text-slate-900">{adminUser.provider === 'firebase' ? 'Firebase Authentication' : 'Local recovery account'}</span>
                </p>
                {adminUser.uid && (
                  <p className="text-slate-600 text-[11px]">
                    UID: <span className="font-mono text-slate-900 break-all">{adminUser.uid}</span>
                  </p>
                )}
                <p className="text-slate-600 text-[11px]">
                  Authorization: the API verifies this identity and the administrator allowlist on every request. No role is trusted from the browser.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => checkHealth()}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${health.isChecking ? 'animate-spin' : ''}`} />
                <span>Recheck Health</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiUrl}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Save URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
