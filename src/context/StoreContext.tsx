import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Product, Category, StoreSettings, Order } from '../types/store.ts';
import type { CartItem, Coupon } from '../utils/pricing.ts';
import { calculateOrderPricing } from '../utils/pricing.ts';
import { api } from '../services/api.ts';
import {
  auth,
  customerSignOut as fbCustomerSignOut,
  getPublishedProducts
} from '../services/firebase.ts';
import { onAuthStateChanged, type User } from 'firebase/auth';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type PendingAuthAction =
  | { type: 'add_to_cart'; product: Product; quantity: number }
  | { type: 'buy_now'; product: Product; quantity: number }
  | { type: 'checkout' };

function categoriesForProducts(products: Product[]): Category[] {
  const categoryIds = [...new Set(products.map(product => product.categoryId).filter(Boolean))];
  return categoryIds.map((id, index) => {
    const name = id
      .replace(/^cat[-_]/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
    return {
      id,
      name,
      slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: '',
      displayOrder: index,
      isActive: true
    };
  });
}

interface StoreContextType {
  products: Product[];
  categories: Category[];
  settings: StoreSettings | null;
  isLoading: boolean;
  catalogError: string | null;
  refreshProducts: () => Promise<void>;

  // Customer Authentication & Account
  customerUser: User | null;
  isCustomerAuthLoading: boolean;
  isCustomerAuthModalOpen: boolean;
  setIsCustomerAuthModalOpen: (open: boolean) => void;
  authModalContextMessage: string;
  setAuthModalContextMessage: (msg: string) => void;
  authModalDefaultMode: 'signin' | 'signup' | 'forgot_password';
  setAuthModalDefaultMode: (mode: 'signin' | 'signup' | 'forgot_password') => void;
  isCustomerAccountModalOpen: boolean;
  setIsCustomerAccountModalOpen: (open: boolean) => void;
  customerLogout: () => Promise<void>;
  pendingAuthAction: PendingAuthAction | null;
  setPendingAuthAction: (action: PendingAuthAction | null) => void;

  // Cart
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  buyNow: (product: Product, quantity?: number) => void;
  proceedToCheckout: () => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;

  // Coupon
  appliedCoupon: Coupon | null;
  applyCoupon: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;

  // Pricing calculations
  pricing: ReturnType<typeof calculateOrderPricing>;

  // Wishlist
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;

  // Selected product detail modal
  selectedProduct: Product | null;
  openProductDetail: (product: Product) => void;
  closeProductDetail: () => void;

  // Checkout & Confirmation
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  confirmedOrder: Order | null;
  setConfirmedOrder: (order: Order | null) => void;

  // Navigation
  activeTab: 'home' | 'shop' | 'wishlist' | 'track' | 'admin';
  setActiveTab: (tab: 'home' | 'shop' | 'wishlist' | 'track' | 'admin') => void;
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Toasts
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

const WISHLIST_STORAGE_KEY = 'zamzam_wishlist_v1';
const getCustomerCartStorageKey = (uid: string) => `zamzam_cart_${uid}`;

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Customer Authentication state
  const [customerUser, setCustomerUser] = useState<User | null>(null);
  const [isCustomerAuthLoading, setIsCustomerAuthLoading] = useState(true);
  const [isCustomerAuthModalOpen, setIsCustomerAuthModalOpen] = useState(false);
  const [authModalContextMessage, setAuthModalContextMessage] = useState('');
  const [authModalDefaultMode, setAuthModalDefaultMode] = useState<'signin' | 'signup' | 'forgot_password'>('signin');
  const [isCustomerAccountModalOpen, setIsCustomerAccountModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);

  // Cart state strictly customer-scoped
  const [cart, setCart] = useState<CartItem[]>([]);

  // Wishlist state
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'shop' | 'wishlist' | 'track' | 'admin'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Helper ref to avoid stale closures in auth state listener
  const pendingActionRef = useRef<PendingAuthAction | null>(null);
  pendingActionRef.current = pendingAuthAction;

  // Listen to Customer Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCustomerUser(user);
      setIsCustomerAuthLoading(false);

      if (user) {
        // Load this customer's scoped cart
        try {
          const key = getCustomerCartStorageKey(user.uid);
          const savedCart = localStorage.getItem(key);
          const parsed = savedCart ? JSON.parse(savedCart) : [];
          setCart(parsed);
        } catch {
          setCart([]);
        }

        // Check if there was a pending action before sign in
        const pending = pendingActionRef.current;
        if (pending) {
          if (pending.type === 'add_to_cart') {
            performAddToCart(pending.product, pending.quantity, user.uid);
            showToast(`Signed in! Added "${pending.product.name}" to your cart.`, 'success');
            setIsCartOpen(true);
          } else if (pending.type === 'buy_now') {
            performAddToCart(pending.product, pending.quantity, user.uid);
            setSelectedProduct(null);
            setIsCheckoutOpen(true);
            showToast(`Signed in! Proceeding to checkout for "${pending.product.name}".`, 'success');
          } else if (pending.type === 'checkout') {
            setIsCheckoutOpen(true);
            showToast('Signed in! Continuing to checkout.', 'success');
          }
          setPendingAuthAction(null);
        }
      } else {
        // Customer signed out: clear in-memory cart and pending state
        setCart([]);
        setAppliedCoupon(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Persist customer-scoped cart whenever cart or user changes
  useEffect(() => {
    if (customerUser) {
      try {
        const key = getCustomerCartStorageKey(customerUser.uid);
        localStorage.setItem(key, JSON.stringify(cart));
      } catch (e) {
        console.error('Cart persistence error:', e);
      }
    }
  }, [cart, customerUser]);

  // Persist wishlist
  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch (e) {
      console.error('Wishlist persistence error:', e);
    }
  }, [wishlist]);

  const refreshProducts = async () => {
    setIsLoading(true);
    setCatalogError(null);
    try {
      const [prodsRes, setsRes] = await Promise.allSettled([
        getPublishedProducts(),
        api.getSettings()
      ]);

      if (prodsRes.status === 'fulfilled') {
        setProducts(prodsRes.value);
        setCategories(categoriesForProducts(prodsRes.value));
      } else {
        const message = prodsRes.reason instanceof Error ? prodsRes.reason.message : 'Could not load products from the product API.';
        setCatalogError(message);
        console.error('Failed to load published products from the product API:', prodsRes.reason);
      }
      if (setsRes.status === 'fulfilled') {
        setSettings(setsRes.value.settings);
      } else {
        console.error('Failed to load store settings from the API:', setsRes.reason);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
  }, []);

  // Internal helper that actually executes add to cart for an authenticated user
  const performAddToCart = (product: Product, quantity = 1, uid?: string) => {
    if (product.stock <= 0) {
      showToast(`Sorry, ${product.name} is currently out of stock.`, 'error');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      let updated: CartItem[];
      if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > product.stock) {
          showToast(`Cannot add more. Only ${product.stock} units available in stock.`, 'error');
          return prev;
        }
        showToast(`Updated quantity in cart (${newQty} units)`);
        updated = prev.map(item =>
          item.productId === product.id ? { ...item, quantity: newQty } : item
        );
      } else {
        const initQty = Math.min(quantity, product.stock);
        showToast(`Added "${product.name}" to your cart`);
        updated = [
          ...prev,
          {
            id: `ci-${Date.now()}`,
            productId: product.id,
            name: product.name,
            price: product.price,
            salePrice: product.salePrice,
            quantity: initQty,
            image: product.images[0] || '/src/assets/images/product_rosegold_brush_1792058412656.jpg',
            stock: product.stock
          }
        ];
      }

      // Immediate storage write
      const targetUid = uid || customerUser?.uid;
      if (targetUid) {
        try {
          localStorage.setItem(getCustomerCartStorageKey(targetUid), JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
      }

      return updated;
    });
  };

  // Public addToCart requiring customer authentication
  const addToCart = (product: Product, quantity = 1) => {
    if (!customerUser) {
      setPendingAuthAction({ type: 'add_to_cart', product, quantity });
      setAuthModalContextMessage(`Sign in or create an account to add "${product.name}" to your cart.`);
      setAuthModalDefaultMode('signin');
      setIsCustomerAuthModalOpen(true);
      showToast('Please sign in or create an account to add items to your cart.', 'info');
      return;
    }

    performAddToCart(product, quantity);
  };

  // Buy Now requiring customer authentication
  const buyNow = (product: Product, quantity = 1) => {
    if (!customerUser) {
      setPendingAuthAction({ type: 'buy_now', product, quantity });
      setAuthModalContextMessage(`Sign in or create an account to purchase "${product.name}".`);
      setAuthModalDefaultMode('signin');
      setIsCustomerAuthModalOpen(true);
      showToast('Please sign in to proceed to checkout.', 'info');
      return;
    }

    performAddToCart(product, quantity);
    setSelectedProduct(null);
    setIsCheckoutOpen(true);
  };

  // Proceed to checkout requiring customer authentication
  const proceedToCheckout = () => {
    if (!customerUser) {
      setPendingAuthAction({ type: 'checkout' });
      setAuthModalContextMessage('Please sign in or create an account to complete your checkout.');
      setAuthModalDefaultMode('signin');
      setIsCustomerAuthModalOpen(true);
      showToast('Please sign in to complete checkout.', 'info');
      return;
    }

    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    const product = products.find(p => p.id === productId);
    const maxStock = product ? product.stock : 999;
    if (quantity > maxStock) {
      showToast(`Maximum available stock reached (${maxStock} units)`, 'info');
      quantity = maxStock;
    }

    setCart(prev =>
      prev.map(item => (item.productId === productId ? { ...item, quantity } : item))
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
    showToast('Item removed from cart', 'info');
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
    if (customerUser) {
      try {
        localStorage.removeItem(getCustomerCartStorageKey(customerUser.uid));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const customerLogout = async () => {
    try {
      await fbCustomerSignOut();
      setCart([]);
      setAppliedCoupon(null);
      setIsCustomerAccountModalOpen(false);
      showToast('Signed out of your customer account.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Logout failed', 'error');
    }
  };

  const applyCoupon = async (code: string) => {
    try {
      const subtotal = cart.reduce((sum, i) => sum + (i.salePrice || i.price) * i.quantity, 0);
      const res = await api.validateCoupon(code, subtotal);
      if (res.valid) {
        setAppliedCoupon({
          id: 'applied',
          code: res.coupon.code,
          discountType: res.coupon.discountType,
          discountValue: res.coupon.discountValue,
          timesUsed: 0,
          isActive: true
        });
        showToast(`Coupon "${res.coupon.code}" applied! You saved Rs. ${(res.amountSaved ?? 0).toLocaleString()}`, 'success');
        return { success: true, message: 'Coupon applied successfully' };
      }
      return { success: false, message: 'Invalid coupon' };
    } catch (err: any) {
      showToast(err.message || 'Failed to apply coupon', 'error');
      return { success: false, message: err.message };
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon removed', 'info');
  };

  const toggleWishlist = (productId: string) => {
    setWishlist(prev => {
      const exists = prev.includes(productId);
      if (exists) {
        showToast('Removed from wishlist', 'info');
        return prev.filter(id => id !== productId);
      } else {
        showToast('Saved to wishlist', 'success');
        return [...prev, productId];
      }
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  const pricing = calculateOrderPricing(cart, appliedCoupon, {
    standardFee: settings?.standardShippingFee ?? 200,
    freeShippingThreshold: settings?.freeShippingThreshold ?? 3000
  });

  return (
    <StoreContext.Provider
      value={{
        products,
        categories,
        settings,
        isLoading,
        catalogError,
        refreshProducts,
        customerUser,
        isCustomerAuthLoading,
        isCustomerAuthModalOpen,
        setIsCustomerAuthModalOpen,
        authModalContextMessage,
        setAuthModalContextMessage,
        authModalDefaultMode,
        setAuthModalDefaultMode,
        isCustomerAccountModalOpen,
        setIsCustomerAccountModalOpen,
        customerLogout,
        pendingAuthAction,
        setPendingAuthAction,
        cart,
        addToCart,
        buyNow,
        proceedToCheckout,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        isCartOpen,
        setIsCartOpen,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        pricing,
        wishlist,
        toggleWishlist,
        isInWishlist,
        selectedProduct,
        openProductDetail: setSelectedProduct,
        closeProductDetail: () => setSelectedProduct(null),
        isCheckoutOpen,
        setIsCheckoutOpen,
        confirmedOrder,
        setConfirmedOrder,
        activeTab,
        setActiveTab,
        selectedCategory,
        setSelectedCategory,
        searchQuery,
        setSearchQuery,
        toasts,
        showToast
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};
