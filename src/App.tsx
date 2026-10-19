import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import { StoreProvider, useStore } from './context/StoreContext.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { HomeView } from './components/HomeView.tsx';
import { ShopCatalogView } from './components/ShopCatalogView.tsx';
import { WishlistView } from './components/WishlistView.tsx';
import { OrderTrackingView } from './components/OrderTrackingView.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { GuestCheckoutModal } from './components/GuestCheckoutModal.tsx';
import { OrderConfirmationModal } from './components/OrderConfirmationModal.tsx';
import { CustomerAuthModal } from './components/CustomerAuthModal.tsx';
import { CustomerAccountModal } from './components/CustomerAccountModal.tsx';
import { AdminLayout } from './components/admin/AdminLayout.tsx';
import { CheckCircle2, AlertCircle, Info, Compass, ShieldAlert, ArrowLeft } from 'lucide-react';

/**
 * Toast Notifications Container
 */
const ToastContainer: React.FC = () => {
  const { toasts } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-top-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-slate-900 text-white border-slate-800'
              : toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-800'
              : 'bg-white text-slate-800 border-slate-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Customer Public Storefront Route
 */
const StorefrontRoute: React.FC<{ initialTab?: 'home' | 'shop' | 'wishlist' | 'track' }> = ({ initialTab }) => {
  const { activeTab, setActiveTab } = useStore();

  useEffect(() => {
    if (initialTab && activeTab !== initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1E293B] flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <ToastContainer />
      <Header />

      {/* Main Public Content Area */}
      <main className="flex-1">
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'shop' && <ShopCatalogView />}
        {activeTab === 'wishlist' && <WishlistView />}
        {activeTab === 'track' && <OrderTrackingView />}
      </main>

      {/* Mobile Bottom Thumb Navigation */}
      <BottomNav />

      {/* Global Modals & Drawers */}
      <ProductDetailModal />
      <CartDrawer />
      <GuestCheckoutModal />
      <OrderConfirmationModal />
      <CustomerAuthModal />
      <CustomerAccountModal />
    </div>
  );
};

/**
 * Admin Portal Route - Accessible ONLY via /adminportal
 * Completely isolated from customer-facing storefront navigation
 */
const AdminPortalRoute: React.FC = () => {
  const location = useLocation();
  const subpath = location.pathname.replace(/^\/adminportal\/?/, '');

  // Valid administrative sub-paths
  const validAdminPaths = ['', 'overview', 'products', 'categories', 'orders', 'promotions', 'audit'];
  const isValidSubpath = validAdminPaths.includes(subpath.split('/')[0]);

  if (!isValidSubpath && subpath.length > 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="font-heading text-xl font-bold text-white mb-2">
            Admin Route Not Found
          </h1>
          <p className="text-xs text-slate-300 mb-6 leading-relaxed">
            The administrative section <code className="bg-slate-950 px-2 py-0.5 rounded text-amber-300 font-mono">/adminportal/{subpath}</code> does not exist.
          </p>
          <div className="space-y-2">
            <Link
              to="/adminportal"
              className="block w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-colors"
            >
              Return to Admin Console
            </Link>
            <Link
              to="/"
              className="block w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs rounded-xl transition-colors"
            >
              Return to Public Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9]">
      <ToastContainer />
      <AdminLayout />
    </div>
  );
};

/**
 * Public 404 Not Found Page
 */
const StorefrontNotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-3xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center shadow-inner">
            <Compass className="w-10 h-10" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700">404 Error</span>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Page Not Found
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
              We couldn't find the page you were looking for. Explore our curated hair care tools and vanity organizers on the storefront.
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Storefront</span>
            </Link>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Routes>
          <Route path="/adminportal/*" element={<AdminPortalRoute />} />
          <Route path="/adminportal" element={<AdminPortalRoute />} />
          <Route path="/shop" element={<StorefrontRoute initialTab="shop" />} />
          <Route path="/wishlist" element={<StorefrontRoute initialTab="wishlist" />} />
          <Route path="/track" element={<StorefrontRoute initialTab="track" />} />
          <Route path="/" element={<StorefrontRoute initialTab="home" />} />
          <Route path="*" element={<StorefrontNotFound />} />
        </Routes>
      </StoreProvider>
    </BrowserRouter>
  );
}
