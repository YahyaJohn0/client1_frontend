import React, { useState } from 'react';
import { ShoppingBag, Heart, Search, PackageCheck, X, User } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';

export const Header: React.FC = () => {
  const {
    cartCount,
    setIsCartOpen,
    wishlist,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    settings,
    customerUser,
    setIsCustomerAuthModalOpen,
    setIsCustomerAccountModalOpen
  } = useStore();

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab('shop');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 transition-all">
      {/* Main Header Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left group flex items-center gap-2.5"
            aria-label="Zamzam Home"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              Z
            </div>
            <div>
              <span className="font-heading text-xl font-bold tracking-tight text-slate-900 group-hover:text-amber-700 transition-colors">
                {settings?.storeName || 'Zamzam'}
              </span>
              <p className="text-[10px] text-slate-500 font-medium -mt-1 hidden sm:block">
                Beauty, Hair & Home Essentials
              </p>
            </div>
          </button>
        </div>

        {/* Search Bar (Desktop & Tablet) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hair brushes, makeup organizers, clips..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* Right Navigation & Action Zone */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Search Toggle */}
          <button
            onClick={() => setIsSearchExpanded(!isSearchExpanded)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100"
            aria-label="Toggle mobile search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Track Order Shortcut */}
          <button
            onClick={() => setActiveTab('track')}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'track'
                ? 'bg-amber-50 text-amber-800 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <PackageCheck className="w-4 h-4 text-amber-600" />
            <span>Track Order</span>
          </button>

          {/* Wishlist */}
          <button
            onClick={() => setActiveTab('wishlist')}
            className="relative p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors"
            aria-label={`Wishlist (${wishlist.length} items)`}
          >
            <Heart className="w-5 h-5" />
            {wishlist.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {wishlist.length}
              </span>
            )}
          </button>

          {/* Cart Trigger */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 text-slate-700 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors"
            aria-label={`Shopping bag (${cartCount} items)`}
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-slate-900 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>

          {/* Customer Authentication & Account */}
          {customerUser ? (
            <button
              onClick={() => setIsCustomerAccountModalOpen(true)}
              className="ml-1 flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold transition-all border border-slate-200/60 cursor-pointer"
              title="Customer Account & Orders"
              aria-label="Customer Account"
            >
              {customerUser.photoURL ? (
                <img
                  src={customerUser.photoURL}
                  alt={customerUser.displayName || 'Customer'}
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {(customerUser.displayName || customerUser.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline max-w-[100px] truncate text-slate-900">
                {customerUser.displayName || customerUser.email?.split('@')[0] || 'Account'}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setIsCustomerAuthModalOpen(true)}
              className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              aria-label="Sign In"
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Expandable Search Bar */}
      {isSearchExpanded && (
        <div className="md:hidden px-4 pb-3 pt-1 border-t border-slate-100 bg-white">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, brands, or categories..."
              autoFocus
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>
      )}
    </header>
  );
};
