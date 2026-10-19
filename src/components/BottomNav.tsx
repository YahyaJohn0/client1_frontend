import React from 'react';
import { Home, Compass, Heart, ShoppingBag, Package } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, cartCount, wishlist, setIsCartOpen } = useStore();

  // If in admin mode, do not crowd the bottom navigation
  if (activeTab === 'admin') return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 safe-area-bottom shadow-lg">
      <div className="grid grid-cols-5 items-center justify-around max-w-md mx-auto">
        {/* Home */}
        <button
          onClick={() => {
            setActiveTab('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            activeTab === 'home' ? 'text-amber-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Home"
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-medium mt-0.5">Home</span>
        </button>

        {/* Shop / Explore */}
        <button
          onClick={() => {
            setActiveTab('shop');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            activeTab === 'shop' ? 'text-amber-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Shop"
        >
          <Compass className={`w-5 h-5 ${activeTab === 'shop' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-medium mt-0.5">Shop</span>
        </button>

        {/* Wishlist */}
        <button
          onClick={() => {
            setActiveTab('wishlist');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 relative transition-colors ${
            activeTab === 'wishlist' ? 'text-amber-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Wishlist"
        >
          <div className="relative">
            <Heart className={`w-5 h-5 ${activeTab === 'wishlist' ? 'stroke-[2.5] fill-amber-700' : 'stroke-[1.8]'}`} />
            {wishlist.length > 0 && (
              <span className="absolute -top-1 -right-2 bg-amber-600 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {wishlist.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium mt-0.5">Wishlist</span>
        </button>

        {/* Cart Drawer Trigger */}
        <button
          onClick={() => setIsCartOpen(true)}
          className="flex flex-col items-center justify-center py-1 relative text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="Shopping Cart"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 stroke-[1.8]" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-slate-900 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium mt-0.5">Cart</span>
        </button>

        {/* Track Order */}
        <button
          onClick={() => {
            setActiveTab('track');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            activeTab === 'track' ? 'text-amber-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Track Order"
        >
          <Package className={`w-5 h-5 ${activeTab === 'track' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] font-medium mt-0.5">Track</span>
        </button>
      </div>
    </nav>
  );
};
