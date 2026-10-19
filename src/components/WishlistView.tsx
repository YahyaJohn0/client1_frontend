import React from 'react';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';

export const WishlistView: React.FC = () => {
  const { wishlist, products, toggleWishlist, addToCart, openProductDetail, setActiveTab } = useStore();

  const savedProducts = products.filter(p => wishlist.includes(p.id));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 tracking-tight">
            My Wishlist ({savedProducts.length})
          </h1>
          <p className="text-xs text-slate-500">
            Items saved locally on this device.
          </p>
        </div>

        {savedProducts.length > 0 && (
          <button
            onClick={() => {
              savedProducts.forEach(p => {
                if (p.stock > 0) addToCart(p, 1);
              });
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Move All to Cart</span>
          </button>
        )}
      </div>

      {savedProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 mx-auto flex items-center justify-center mb-4">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="font-heading text-base font-bold text-slate-900 mb-1">
            Your wishlist is empty
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            Tap the heart icon on any hairbrush, cosmetic organizer, or beauty accessory to save it for later.
          </p>
          <button
            onClick={() => setActiveTab('shop')}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Explore Products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {savedProducts.map(product => (
            <div
              key={product.id}
              onClick={() => openProductDetail(product)}
              className="cursor-pointer group bg-white rounded-2xl border border-slate-100 p-3.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all"
            >
              <div>
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-50 relative mb-3">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 text-rose-600 shadow-xs hover:bg-white"
                    aria-label="Remove from wishlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 mb-1">
                  {product.name}
                </h3>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {formatPKR(product.salePrice || product.price)}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addToCart(product, 1);
                  }}
                  disabled={product.stock <= 0}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1"
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>{product.stock <= 0 ? 'Out of Stock' : 'Add to Bag'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
