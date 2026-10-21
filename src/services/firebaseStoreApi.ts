import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import type { Product, Category, Order, OrderStatus, Coupon, Banner, StoreSettings, AuditLog } from '../types/store.ts';
import { adminAuth, auth, firestore } from './firebase.ts';
import { ApiError } from './apiErrors.ts';
import {
  archiveMongoProduct,
  checkMongoBackendReadiness,
  createMongoProduct,
  getMongoProduct,
  getMongoProducts,
  updateMongoProduct,
  updateMongoProductStatus
} from './mongoProductsClient.ts';

interface AdminIdentity {
  identifier: string;
  provider: 'firebase';
  role: 'admin';
  mustChangePassword: false;
  authenticatedAt: string;
  recentAuth: boolean;
  email?: string;
  uid: string;
}

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Zamzam',
  tagline: 'Refined Everyday Beauty, Hair & Home Essentials',
  contactPhone: '',
  contactEmail: '',
  address: '',
  currency: 'PKR',
  standardShippingFee: 200,
  freeShippingThreshold: 3000,
  returnPolicy: '',
  deliveryPolicy: '',
  aboutText: ''
};

function requireSignedIn(admin = false) {
  const user = admin ? adminAuth.currentUser : auth.currentUser;
  if (!user) throw new ApiError(admin ? 'Sign in with your administrator account.' : 'Please sign in to continue.', 401, 'UNAUTHENTICATED');
  return user;
}

async function requireAdmin() {
  const user = requireSignedIn(true);
  const adminDoc = await getDoc(doc(firestore, 'admins', user.uid));
  if (!adminDoc.exists() || adminDoc.data().enabled === false) {
    throw new ApiError('This Firebase account is not authorized as an administrator.', 403, 'FORBIDDEN', { uid: user.uid });
  }
  return user;
}

function normalizeCategory(id: string, raw: Record<string, any>): Category {
  const name = String(raw.name ?? '');
  return {
    ...raw,
    id,
    name,
    slug: raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: String(raw.description ?? ''),
    displayOrder: Number(raw.displayOrder ?? 0),
    isActive: raw.isActive !== false
  };
}

function normalizeOrder(id: string, raw: Record<string, any>): Order {
  const customer = raw.customer ?? {};
  const status = raw.status === 'pending' ? 'placed' : raw.status ?? raw.fulfillmentStatus ?? 'placed';
  return {
    ...raw,
    id,
    orderNumber: String(raw.orderNumber ?? id),
    customer: {
      fullName: customer.fullName ?? customer.name ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      area: customer.area,
      notes: customer.notes
    },
    items: (raw.items ?? []).map((item: any) => ({
      ...item,
      price: item.price ?? item.unitPrice ?? 0,
      image: item.image ?? ''
    })),
    subtotal: Number(raw.subtotal ?? 0),
    discount: Number(raw.discount ?? 0),
    shippingFee: Number(raw.shippingFee ?? 0),
    total: Number(raw.total ?? 0),
    paymentMethod: 'COD',
    paymentStatus: raw.paymentStatus === 'unpaid' ? 'pending' : raw.paymentStatus ?? 'pending',
    fulfillmentStatus: status,
    statusHistory: (raw.statusHistory ?? []).map((entry: any) => ({
      status: entry.status === 'pending' ? 'placed' : entry.status,
      timestamp: entry.timestamp ?? entry.at ?? ''
    })),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? '')
  } as Order;
}

async function readCategories(includeInactive = false): Promise<Category[]> {
  if (includeInactive) await requireAdmin();
  const constraints = includeInactive ? [] : [where('isActive', '==', true)];
  const result = await getDocs(query(collection(firestore, 'categories'), ...constraints));
  return result.docs.map(item => normalizeCategory(item.id, item.data())).sort((a, b) => a.displayOrder - b.displayOrder);
}

async function getStoreSettings(): Promise<StoreSettings> {
  const snapshot = await getDoc(doc(firestore, 'settings', 'store'));
  const raw = snapshot.data() ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    standardShippingFee: Number(raw.shippingFee ?? raw.standardShippingFee ?? DEFAULT_SETTINGS.standardShippingFee),
    freeShippingThreshold: Number(raw.freeShippingThreshold ?? DEFAULT_SETTINGS.freeShippingThreshold)
  };
}

export const api = {
  checkReadiness: checkMongoBackendReadiness,
  getPublishedProducts: async () => ({ products: await getMongoProducts() }),
  getDemoProducts: async () => ({ products: await getMongoProducts({ includeInactive: true, token: await requireAdmin().then(user => user.getIdToken()) }) }),
  getDemoProduct: async (id: string) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    return { product: await getMongoProduct(id, token) };
  },
  createDemoProduct: async (payload: Partial<Product>) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    return { product: await createMongoProduct(payload, token) };
  },
  updateDemoProduct: async (id: string, payload: Partial<Product>) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    return { product: await updateMongoProduct(id, payload, token) };
  },
  updateDemoProductStatus: async (id: string, isActive: boolean) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    return { product: await updateMongoProductStatus(id, isActive, token) };
  },
  archiveDemoProduct: async (id: string) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    await archiveMongoProduct(id, token);
  },
  getProducts: async (params?: { category?: string; search?: string; includeInactive?: boolean }) => {
    const token = params?.includeInactive ? await requireAdmin().then(user => user.getIdToken()) : undefined;
    const products = await getMongoProducts({ includeInactive: params?.includeInactive, token });
    const filtered = products.filter(product =>
      (!params?.category || params.category === 'all' || product.categoryId === params.category) &&
      (!params?.search || `${product.name} ${product.sku} ${product.description}`.toLowerCase().includes(params.search.toLowerCase()))
    );
    return { products: filtered, total: filtered.length, page: 1, totalPages: 1 };
  },
  getProduct: async (id: string) => api.getDemoProduct(id),
  createProduct: (payload: Partial<Product>) => api.createDemoProduct(payload),
  updateProduct: (id: string, payload: Partial<Product>) => api.updateDemoProduct(id, payload),
  archiveProduct: async (id: string) => { await api.archiveDemoProduct(id); return { success: true }; },
  deleteProduct: async (id: string) => { await api.archiveDemoProduct(id); return { success: true }; },
  updateProductStatus: async (id: string, isActive: boolean) => {
    const result = await api.updateDemoProductStatus(id, isActive);
    return { success: true, product: result.product };
  },
  getCategories: async (params?: { includeInactive?: boolean }) => ({ categories: await readCategories(params?.includeInactive) }),
  getCategory: async (id: string) => {
    await requireAdmin();
    const result = await getDoc(doc(firestore, 'categories', id));
    if (!result.exists()) throw new ApiError('Category not found.', 404, 'NOT_FOUND');
    return { category: normalizeCategory(result.id, result.data()) };
  },
  createCategory: async (payload: Partial<Category>) => {
    await requireAdmin();
    const record = { ...payload, isActive: payload.isActive !== false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const result = await addDoc(collection(firestore, 'categories'), record);
    return { category: normalizeCategory(result.id, record) };
  },
  updateCategory: async (id: string, payload: Partial<Category>) => {
    await requireAdmin();
    const record = { ...payload, updatedAt: new Date().toISOString() };
    await updateDoc(doc(firestore, 'categories', id), record);
    return { category: await api.getCategory(id).then(result => result.category) };
  },
  deleteCategory: async (id: string) => {
    const token = await requireAdmin().then(user => user.getIdToken());
    const products = await getMongoProducts({ includeInactive: true, token });
    if (products.some(product => product.categoryId === id)) throw new ApiError('Reassign products before deleting this category.', 409, 'CATEGORY_IN_USE');
    await deleteDoc(doc(firestore, 'categories', id));
    return { success: true };
  },
  uploadProductImage: async (file: File | Blob) => {
    await requireAdmin();
    const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME as string | undefined;
    const uploadPreset = import.meta.env.CLOUDINARY_UPLOAD_PRESET as string | undefined;
    if (!cloudName || !uploadPreset) throw new ApiError('Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET for the frontend build.', 503, 'UPLOADS_NOT_CONFIGURED');
    if (!(file instanceof Blob) || !file.type.startsWith('image/')) throw new ApiError('Choose a valid image file.', 400, 'INVALID_IMAGE');
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', uploadPreset);
    form.append('folder', 'samples/ecommerce');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok) throw new ApiError(result?.error?.message || 'Cloudinary upload failed.', response.status, 'UPLOAD_FAILED');
    if (typeof result.secure_url !== 'string' || typeof result.public_id !== 'string') throw new ApiError('Cloudinary returned invalid image details.', 502, 'UPLOAD_RESPONSE_INVALID');
    return { url: result.secure_url, secureUrl: result.secure_url, publicId: result.public_id, format: result.format, width: result.width, height: result.height, bytes: result.bytes };
  },
  deleteCloudinaryImage: async (_publicId: string) => {
    throw new ApiError('Unsigned Cloudinary uploads cannot be securely deleted from the browser. Remove unused assets in the Cloudinary console.', 501, 'UNSIGNED_UPLOAD_CANNOT_DELETE');
  },
  placeOrder: async (input: { customer: { fullName: string; phone: string; address: string; city: string; area?: string; notes?: string }; items: Array<{ productId: string; quantity: number }>; couponCode?: string }) => {
    const user = requireSignedIn();
    if (!input.items.length) throw new ApiError('Your cart is empty.', 400, 'EMPTY_ORDER');
    const orderRef = doc(collection(firestore, 'orders'));
    const catalogProducts = await getMongoProducts();
    const products = new Map(catalogProducts.map(product => [product.id, product]));
    const quantities = new Map<string, number>();
    input.items.forEach(item => quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity));
    let subtotal = 0;
    const items = [...quantities].map(([productId, quantity]) => {
      const product = products.get(productId)!;
      if (!product.isActive || product.stock < quantity) throw new ApiError(`${product.name} is unavailable in the requested quantity.`, 409, 'INSUFFICIENT_STOCK');
      const price = product.salePrice && product.salePrice > 0 ? product.salePrice : product.price;
      subtotal += price * quantity;
      return { productId, name: product.name, sku: product.sku, quantity, price, image: product.images[0] ?? '' };
    });
    let discount = 0;
    let couponCode: string | undefined;
    if (input.couponCode) {
      const couponSnapshot = await getDoc(doc(firestore, 'coupons', input.couponCode.trim().toUpperCase()));
      const coupon = couponSnapshot.data();
      const currentTime = Date.now();
      const startsAt = coupon?.startsAt ? Date.parse(coupon.startsAt) : null;
      const expiresAt = coupon?.expiresAt ? Date.parse(coupon.expiresAt) : coupon?.endsAt ? Date.parse(coupon.endsAt) : null;
      if (!couponSnapshot.exists() || !coupon?.isActive ||
          (startsAt !== null && (!Number.isFinite(startsAt) || startsAt > currentTime)) ||
          (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt < currentTime)) ||
          (coupon.usageLimit != null && Number(coupon.usageCount ?? coupon.timesUsed ?? 0) >= Number(coupon.usageLimit))) {
        throw new ApiError('This coupon is not valid.', 400, 'INVALID_COUPON');
      }
      if (subtotal < Number(coupon.minSpend ?? coupon.minimumSubtotal ?? 0)) throw new ApiError('Order total does not meet the coupon minimum.', 400, 'INVALID_COUPON');
      const value = Number(coupon.discountValue ?? 0);
      discount = coupon.discountType === 'percentage' || coupon.discountType === 'percent' ? subtotal * value / 100 : value;
      if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
      discount = Math.min(subtotal, discount);
      couponCode = input.couponCode.trim().toUpperCase();
    }
    const settings = await getStoreSettings();
    const shippingFee = subtotal >= settings.freeShippingThreshold ? 0 : settings.standardShippingFee;
    const now = new Date().toISOString();
    const orderNumber = `ZZ-${now.slice(0, 10).replaceAll('-', '')}-${orderRef.id.slice(0, 8).toUpperCase()}`;
    const orderData = {
      orderNumber,
      customerUid: user.uid,
      customer: input.customer,
      items,
      subtotal,
      discount,
      shippingFee,
      total: Math.max(0, subtotal - discount + shippingFee),
      couponCode: couponCode ?? null,
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'unpaid',
      status: 'pending',
      statusHistory: [{ status: 'pending', at: now }],
      inventoryRestored: false,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(orderRef, orderData);
    return { success: true, order: normalizeOrder(orderRef.id, orderData) };
  },
  trackOrder: async (orderNumber: string, phone: string) => {
    const user = requireSignedIn();
    const results = await getDocs(query(collection(firestore, 'orders'), where('customerUid', '==', user.uid), limit(100)));
    const match = results.docs.find(item => String(item.data().customer?.phone ?? '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (!match) throw new ApiError('No order found matching this account and phone number.', 404, 'NOT_FOUND');
    const order = normalizeOrder(match.id, match.data());
    return { order: { orderNumber: order.orderNumber, fulfillmentStatus: order.fulfillmentStatus, statusHistory: order.statusHistory, createdAt: order.createdAt, updatedAt: order.updatedAt } };
  },
  getOrders: async (_params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    await requireAdmin();
    const results = await getDocs(query(collection(firestore, 'orders'), orderBy('createdAt', 'desc'), limit(100)));
    return { orders: results.docs.map(item => normalizeOrder(item.id, item.data())), total: results.size };
  },
  getCustomerOrders: async () => {
    const user = requireSignedIn();
    const results = await getDocs(query(collection(firestore, 'orders'), where('customerUid', '==', user.uid), limit(100)));
    return { orders: results.docs.map(item => normalizeOrder(item.id, item.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  },
  getOrder: async (id: string) => {
    await requireAdmin();
    const result = await getDoc(doc(firestore, 'orders', id));
    if (!result.exists()) throw new ApiError('Order not found.', 404, 'NOT_FOUND');
    return { order: normalizeOrder(result.id, result.data()) };
  },
  updateOrderStatus: async (id: string, status: OrderStatus, extra?: { trackingNumber?: string; courierName?: string; cancelReason?: string; internalNotes?: string }) => {
    await requireAdmin();
    const orderRef = doc(firestore, 'orders', id);
    const now = new Date().toISOString();
    const nextStatus = status === 'placed' ? 'confirmed' : status;
    const transitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['packed', 'cancelled'],
      packed: ['shipped', 'cancelled'],
      shipped: ['out_for_delivery', 'delivered'],
      out_for_delivery: ['delivered'],
      delivered: ['returned'],
      cancelled: [],
      returned: []
    };
    await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) throw new ApiError('Order not found.', 404, 'NOT_FOUND');
      const current = snapshot.data();
      if (!transitions[String(current.status)]?.includes(nextStatus)) {
        throw new ApiError(`Cannot change order status from ${current.status} to ${nextStatus}.`, 409, 'INVALID_STATUS_TRANSITION');
      }
      const history = [...(current.statusHistory ?? []), { status: nextStatus, at: now }];
      transaction.update(orderRef, {
        ...Object.fromEntries(Object.entries(extra ?? {}).filter(([, value]) => value !== undefined)),
        status: nextStatus,
        statusHistory: history,
        updatedAt: now
      });
    });
    return { success: true, order: (await api.getOrder(id)).order };
  },
  validateCoupon: async (code: string, subtotal: number): Promise<
    | { valid: true; coupon: Coupon; amountSaved: number }
    | { valid: false; error: string }
  > => {
    const snapshot = await getDoc(doc(firestore, 'coupons', code.trim().toUpperCase()));
    const coupon = snapshot.data();
    if (!snapshot.exists() || !coupon?.isActive) return { valid: false, error: 'Coupon is not valid.' };
    const startsAt = coupon.startsAt ? Date.parse(coupon.startsAt) : null;
    const expiresAt = coupon.expiresAt ? Date.parse(coupon.expiresAt) : coupon.endsAt ? Date.parse(coupon.endsAt) : null;
    if ((startsAt !== null && (!Number.isFinite(startsAt) || startsAt > Date.now())) ||
        (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt < Date.now()))) return { valid: false, error: 'Coupon is not active.' };
    if (coupon.usageLimit != null && Number(coupon.usageCount ?? coupon.timesUsed ?? 0) >= Number(coupon.usageLimit)) return { valid: false, error: 'Coupon usage limit has been reached.' };
    if (subtotal < Number(coupon.minSpend ?? coupon.minimumSubtotal ?? 0)) return { valid: false, error: 'Minimum order amount not reached.' };
    let amountSaved = coupon.discountType === 'percentage' || coupon.discountType === 'percent' ? subtotal * Number(coupon.discountValue) / 100 : Number(coupon.discountValue);
    if (coupon.maxDiscount) amountSaved = Math.min(amountSaved, Number(coupon.maxDiscount));
    return {
      valid: true,
      coupon: {
        ...coupon,
        id: snapshot.id,
        code: snapshot.id,
        discountType: coupon.discountType === 'percent' ? 'percentage' : coupon.discountType,
        discountValue: Number(coupon.discountValue ?? 0),
        timesUsed: Number(coupon.timesUsed ?? coupon.usageCount ?? 0),
        isActive: true
      } as Coupon,
      amountSaved: Math.min(subtotal, amountSaved)
    };
  },
  getBanners: async () => {
    const result = await getDocs(query(collection(firestore, 'banners'), where('isActive', '==', true)));
    return { banners: result.docs.map(item => ({ id: item.id, ...item.data() } as Banner)).sort((a, b) => a.displayOrder - b.displayOrder) };
  },
  getSettings: async () => ({ settings: await getStoreSettings() }),
  adminGetBanners: async () => {
    await requireAdmin();
    const result = await getDocs(collection(firestore, 'banners'));
    return { banners: result.docs.map(item => ({ id: item.id, ...item.data() } as Banner)).sort((a, b) => a.displayOrder - b.displayOrder) };
  },
  adminSaveBanner: async (banner: Partial<Banner>) => {
    await requireAdmin();
    const id = banner.id || undefined;
    const { id: _id, ...data } = banner;
    const target = id ? doc(firestore, 'banners', id) : doc(collection(firestore, 'banners'));
    await setDoc(target, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
    return { banner: { id: target.id, ...data } as Banner };
  },
  adminDeleteBanner: async (id: string) => { await requireAdmin(); await deleteDoc(doc(firestore, 'banners', id)); return { success: true }; },
  adminGetCoupons: async () => {
    await requireAdmin();
    const result = await getDocs(collection(firestore, 'coupons'));
    return { coupons: result.docs.map(item => ({ id: item.id, ...item.data() } as Coupon)) };
  },
  adminSaveCoupon: async (coupon: Partial<Coupon>) => {
    await requireAdmin();
    const code = String(coupon.code ?? '').trim().toUpperCase();
    if (!code) throw new ApiError('Coupon code is required.', 400, 'VALIDATION_ERROR');
    const { id: _id, ...data } = coupon;
    await setDoc(doc(firestore, 'coupons', code), { ...data, code, updatedAt: new Date().toISOString() }, { merge: true });
    return { coupon: { ...data, id: code, code } as Coupon };
  },
  adminDeleteCoupon: async (id: string) => { await requireAdmin(); await deleteDoc(doc(firestore, 'coupons', id)); return { success: true }; },
  adminGetSettings: async () => { await requireAdmin(); return { settings: await getStoreSettings() }; },
  adminUpdateSettings: async (settings: Partial<StoreSettings>) => {
    await requireAdmin();
    await setDoc(doc(firestore, 'settings', 'store'), {
      ...settings,
      shippingFee: settings.standardShippingFee,
      freeShippingThreshold: settings.freeShippingThreshold
    }, { merge: true });
    return { settings: await getStoreSettings() };
  },
  adminMe: async (): Promise<AdminIdentity> => {
    const user = await requireAdmin();
    const token = await user.getIdTokenResult();
    return { identifier: user.email ?? user.uid, provider: 'firebase', role: 'admin', mustChangePassword: false, authenticatedAt: new Date(token.authTime).toISOString(), recentAuth: Date.now() - Date.parse(token.authTime) < 600000, email: user.email ?? undefined, uid: user.uid };
  },
  adminLogin: async (_username: string, _password: string) => { throw new ApiError('Sign in using your Firebase administrator email.', 501, 'LOCAL_ADMIN_UNSUPPORTED'); },
  adminLogout: async () => ({ success: true }),
  changeAdminPassword: async (_currentPassword: string, _newPassword: string) => { throw new ApiError('Use Firebase Authentication to change the administrator password.', 501, 'UNSUPPORTED'); },
  recordAdminPasswordChange: async () => ({ success: true }),
  adminGetAuditLogs: async () => {
    await requireAdmin();
    const result = await getDocs(query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100)));
    return { auditLogs: result.docs.map(item => ({ id: item.id, ...item.data() } as AuditLog)) };
  }
};

export async function getPublishedProducts(): Promise<Product[]> {
  return getMongoProducts();
}
