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
  type AdminIdentity
} from '../../services/api.ts';
import { onAdminAuthStateChanged, adminSignOut } from '../../services/firebase.ts';
import type { Order } from '../../types/store.ts';
import { useStore } from '../../context/StoreContext.tsx';

interface HealthStatus {
  isChecking: boolean;
  isReady: boolean;
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

  const [health, setHealth] = useState<HealthStatus>({
    isChecking: false,
    isReady: false
  });

  /**
   * Admin access is checked against Firebase Authentication and the Firebase
   * administrator allowlist before the console is shown.
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
    try {
      await api.checkReadiness();
      setHealth({ isChecking: false, isReady: true });
    } catch (err: any) {
      setHealth({ isChecking: false, isReady: false });
      console.error('Firebase connection check failed:', err);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleLogout = async () => {
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
            <button
              onClick={() => {
                checkHealth();
              }}
              title="Check backend and MongoDB-compatible Firestore connection"
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                health.isReady
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/80'
                  : 'bg-rose-950/60 border-rose-800/80 text-rose-300 hover:bg-rose-900/80'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    health.isReady ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    health.isReady ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="hidden sm:inline">
                {health.isChecking ? 'Checking Database' : health.isReady ? 'Database Ready' : 'Database Offline'}
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

    </div>
  );
};
