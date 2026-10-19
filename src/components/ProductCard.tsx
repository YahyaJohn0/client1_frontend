import React from 'react';
import { Heart, Plus, Check } from 'lucide-react';
import type { Product } from '../types/store.ts';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { openProductDetail, addToCart, isInWishlist, toggleWishlist, categories } = useStore();
  const [justAdded, setJustAdded] = React.useState(false);

  const categoryName = categories.find(c => c.id === product.categoryId)?.name || 'Lifestyle';
  const hasDiscount = product.salePrice && product.salePrice < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.stock <= 0) return;
    addToCart(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  const isSaved = isInWishlist(product.id);
  const isOutOfStock = product.stock <= 0;

  return (
    <article
      onClick={() => openProductDetail(product)}
      className="group cursor-pointer flex flex-col bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs hover:shadow-md transition-all duration-200"
    >
      {/* Product Image Container */}
      <div className="relative aspect-[4/3] sm:aspect-square w-full bg-[#F4F4F5] overflow-hidden">
        <img
          src={product.images[0] || '/src/assets/images/product_rosegold_brush_1792058412656.jpg'}
          alt={product.name}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
          loading="lazy"
        />

        {/* Wishlist Button */}
        <button
          onClick={handleWishlist}
          className={`absolute top-2.5 right-2.5 p-2 rounded-full backdrop-blur-md transition-all ${
            isSaved
              ? 'bg-rose-50 text-rose-600 shadow-xs'
              : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 shadow-xs'
          }`}
          aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-600 stroke-rose-600' : 'stroke-[1.8]'}`} />
        </button>

        {/* Discount Badge */}
        {hasDiscount && !isOutOfStock && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold tracking-wide uppercase shadow-xs">
            {discountPercent}% OFF
          </div>
        )}

        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-white text-slate-900 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Product Content Details */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between">
        <div>
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
            {categoryName}
          </span>
          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-amber-800 transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>
        </div>

        {/* Pricing and Action Row */}
        <div className="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">
                {formatPKR(product.salePrice || product.price)}
              </span>
              {hasDiscount && (
                <span className="text-[11px] text-slate-400 line-through tabular-nums">
                  {formatPKR(product.price)}
                </span>
              )}
            </div>
            {product.stock > 0 && product.stock <= 5 && (
              <span className="text-[10px] font-medium text-amber-600">
                Only {product.stock} left in stock
              </span>
            )}
          </div>

          {/* Quick Add Button */}
          {!isOutOfStock && (
            <button
              onClick={handleQuickAdd}
              className={`p-2 rounded-xl transition-all duration-200 ${
                justAdded
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-900 text-white hover:bg-amber-600 shadow-xs'
              }`}
              aria-label={`Add ${product.name} to cart`}
              title="Add to cart"
            >
              {justAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4 stroke-[2.5]" />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
