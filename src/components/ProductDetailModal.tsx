import React, { useState } from 'react';
import { X, Heart, Plus, Minus, ShoppingBag, ShieldCheck, Truck, RefreshCw, Check } from 'lucide-react';
import { useStore } from '../context/StoreContext.tsx';
import { formatPKR } from '../utils/pricing.ts';

export const ProductDetailModal: React.FC = () => {
  const {
    selectedProduct,
    closeProductDetail,
    addToCart,
    buyNow,
    isInWishlist,
    toggleWishlist,
    categories,
    products,
    openProductDetail
  } = useStore();

  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [addedAnimation, setAddedAnimation] = useState(false);

  if (!selectedProduct) return null;

  const categoryName = categories.find(c => c.id === selectedProduct.categoryId)?.name || 'Lifestyle';
  const hasDiscount = selectedProduct.salePrice && selectedProduct.salePrice < selectedProduct.price;
  const isSaved = isInWishlist(selectedProduct.id);
  const isOutOfStock = selectedProduct.stock <= 0;

  const handleIncrement = () => {
    if (quantity < selectedProduct.stock) {
      setQuantity(q => q + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(q => q - 1);
    }
  };

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addToCart(selectedProduct, quantity);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1500);
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    buyNow(selectedProduct, quantity);
  };

  const relatedProducts = products
    .filter(p => p.categoryId === selectedProduct.categoryId && p.id !== selectedProduct.id)
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-3xl rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {categoryName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleWishlist(selectedProduct.id)}
              className={`p-2 rounded-full transition-colors ${
                isSaved ? 'text-rose-600 bg-rose-50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              aria-label="Wishlist toggle"
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-rose-600' : ''}`} />
            </button>
            <button
              onClick={closeProductDetail}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="Close product modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="overflow-y-auto p-5 sm:p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
            {/* Gallery Column */}
            <div className="space-y-3">
              <div className="aspect-square w-full rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 relative">
                <img
                  src={selectedProduct.images[selectedImageIndex] || selectedProduct.images[0]}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover object-center"
                  referrerPolicy="no-referrer"
                />
                {hasDiscount && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs font-bold uppercase tracking-wide">
                    {Math.round(((selectedProduct.price - selectedProduct.salePrice!) / selectedProduct.price) * 100)}% OFF
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {selectedProduct.images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {selectedProduct.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        selectedImageIndex === idx ? 'border-amber-600 ring-2 ring-amber-100' : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Purchase Module */}
            <div className="space-y-4">
              <div>
                <p className="text-xs font-mono text-slate-400 mb-1">SKU: {selectedProduct.sku}</p>
                <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {selectedProduct.name}
                </h2>
              </div>

              {/* Price & Stock status */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatPKR(selectedProduct.salePrice || selectedProduct.price)}
                    </span>
                    {hasDiscount && (
                      <span className="text-sm text-slate-400 line-through tabular-nums">
                        {formatPKR(selectedProduct.price)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">Inclusive of all local taxes</span>
                </div>

                <div>
                  {isOutOfStock ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700">
                      Out of Stock
                    </span>
                  ) : selectedProduct.stock <= 5 ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700">
                      Low Stock: {selectedProduct.stock} left
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700">
                      In Stock ({selectedProduct.stock} units)
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity Stepper */}
              {!isOutOfStock && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Quantity</label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-slate-200 rounded-xl bg-white overflow-hidden shadow-xs">
                      <button
                        onClick={handleDecrement}
                        disabled={quantity <= 1}
                        className="p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center font-bold text-sm text-slate-900 tabular-nums">
                        {quantity}
                      </span>
                      <button
                        onClick={handleIncrement}
                        disabled={quantity >= selectedProduct.stock}
                        className="p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs text-slate-500">
                      Subtotal: <span className="font-bold text-slate-900">{formatPKR((selectedProduct.salePrice || selectedProduct.price) * quantity)}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all ${
                    addedAnimation
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-300'
                  }`}
                >
                  {addedAnimation ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Added to Cart</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-amber-600 hover:bg-amber-500 text-white shadow-xs transition-all disabled:bg-slate-300"
                >
                  Buy Now (Cash on Delivery)
                </button>
              </div>

              {/* Trust Badges */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-50 flex flex-col items-center justify-center">
                  <Truck className="w-4 h-4 text-amber-600 mb-1" />
                  <span className="text-[10px] font-semibold text-slate-700">Cash on Delivery</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 flex flex-col items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-amber-600 mb-1" />
                  <span className="text-[10px] font-semibold text-slate-700">7-Day Return</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 flex flex-col items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-amber-600 mb-1" />
                  <span className="text-[10px] font-semibold text-slate-700">Quality Verified</span>
                </div>
              </div>

              {/* Description */}
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                  Product Description
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {selectedProduct.description}
                </p>
              </div>
            </div>
          </div>

          {/* Related Products Section */}
          {relatedProducts.length > 0 && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="font-heading text-base font-bold text-slate-900 mb-3">
                You May Also Like
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {relatedProducts.map(rp => (
                  <div
                    key={rp.id}
                    onClick={() => {
                      openProductDetail(rp);
                      setSelectedImageIndex(0);
                      setQuantity(1);
                    }}
                    className="cursor-pointer group p-2 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-50 mb-1.5">
                      <img src={rp.images[0]} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <p className="text-[11px] font-semibold text-slate-900 truncate">{rp.name}</p>
                    <p className="text-[11px] font-bold text-amber-700 tabular-nums">{formatPKR(rp.salePrice || rp.price)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
