import type {
  Product,
  Category,
  Order,
  OrderStatus,
  Coupon,
  Banner,
  StoreSettings,
  DashboardReports,
  AuditLog,
  InventoryMovement
} from '../types/store.ts';
import { getFreshIdToken, getAdminIdToken } from './firebase.ts';

/**
 * Trusted administrator identity returned by GET /api/admin/me. It is only a
 * description of what the backend has already authorized; it never grants
 * access by itself.
 */
export interface AdminIdentity {
  identifier: string;
  provider: 'firebase' | 'local';
  role: 'admin';
  mustChangePassword: boolean;
  authenticatedAt: string;
  recentAuth: boolean;
  email?: string;
  uid?: string;
  username?: string;
}

// Centralized API Configuration
const STORAGE_CUSTOM_BASE_URL = 'zamzam_custom_api_base_url';
const DEFAULT_API_BASE_URL = 'https://clientbackend2-qu4dpdu9.b4a.run';

/**
 * Normalizes a configured API base URL.
 *
 * Accepts both a bare origin ("http://localhost:3000") and the versioned form
 * documented in the backend guide ("https://api.example.com/api/v1"). Any
 * trailing "/api/v1" is stripped because every request in this module already
 * includes that prefix; keeping it produced requests such as
 * "/api/v1/api/v1/products", which the server answered with 404.
 */
function normalizeBaseUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  value = value.replace(/\/+$/, '');
  value = value.replace(/\/api\/v1$/i, '');
  value = value.replace(/\/+$/, '');
  return value || null;
}

/**
 * Use the deployed Firebase backend unless a local-storage override or
 * VITE_API_BASE_URL selects another API.
 */
function readStoredBaseUrl(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_CUSTOM_BASE_URL) : null;
  } catch {
    return null;
  }
}

export function getApiBaseUrl(): string {
  const custom = normalizeBaseUrl(readStoredBaseUrl());
  if (custom) return custom;

  const envUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (envUrl) return envUrl;

  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string | null): void {
  const normalized = normalizeBaseUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(STORAGE_CUSTOM_BASE_URL, normalized);
    } else {
      localStorage.removeItem(STORAGE_CUSTOM_BASE_URL);
    }
  } catch (err) {
    console.error('Could not persist the API base URL override:', err);
  }
}

/** Returns the stored administrator override, or null when the default is used. */
export function getApiBaseUrlOverride(): string | null {
  return normalizeBaseUrl(readStoredBaseUrl());
}

export class ApiError extends Error {
  code?: string;
  status: number;
  details?: any;

  constructor(message: string, status: number = 500, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// In-flight request deduplication map to prevent duplicate submissions
const pendingRequests = new Map<string, Promise<any>>();

/** Reads a browser File/Blob into a base64 data URI for upload proxying. */
function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new ApiError('This browser cannot read the selected file.', 0, 'FILE_READER_UNAVAILABLE'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(new ApiError('Could not read the selected image file.', 0, 'FILE_READ_ERROR', reader.error));
    reader.readAsDataURL(file);
  });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
  requiresAuth?: boolean;
  /**
   * Which credential to send on an authenticated request.
   * - "admin": the administrator Firebase ID token (from the dedicated admin
   *   app) and the `X-Zamzam-Admin` CSRF header. The httpOnly local-recovery
   *   cookie is sent by the browser automatically.
   * - "customer": only the signed-in customer's Firebase ID token.
   * - "auto" (default): the customer token when present, otherwise the admin
   *   token (public endpoints do not require either).
   */
  auth?: 'auto' | 'admin' | 'customer';
  timeoutMs?: number;
}

async function resolveAuthToken(mode: 'auto' | 'admin' | 'customer'): Promise<string | null> {
  if (mode === 'admin') {
    // A customer's Firebase session must never be used for admin requests.
    return getAdminIdToken();
  }
  if (mode === 'customer') {
    return getFreshIdToken();
  }
  const customerToken = await getFreshIdToken();
  return customerToken || (await getAdminIdToken());
}

/**
 * Low-level HTTP requester with Firebase/session bearer authentication,
 * structured error handling, and duplicate submission prevention.
 */
async function httpRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const baseUrl = getApiBaseUrl();

  // Build full URL
  const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);

  // Query parameters serialization
  if (options.params) {
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        urlObj.searchParams.set(key, String(val));
      }
    });
  }

  const finalUrl = urlObj.toString();
  const requestKey = `${method}:${finalUrl}:${options.body ? JSON.stringify(options.body) : ''}`;

  // Prevent duplicate concurrent in-flight submissions for identical mutating requests
  if (method !== 'GET' && pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey) as Promise<T>;
  }

  const execRequest = async (): Promise<T> => {
    const headers: Record<string, string> = {
      ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Attach the credential appropriate for the request type.
    const isOurBackend = finalUrl.startsWith(baseUrl);
    const authMode = options.auth || 'auto';
    if (isOurBackend) {
      if (authMode === 'admin') {
        // CSRF defence for the httpOnly local-recovery cookie. Cross-origin
        // callers cannot set this header without an approved CORS preflight.
        headers['X-Zamzam-Admin'] = '1';
      }
      const authToken = await resolveAuthToken(authMode);
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      } else if (options.requiresAuth && authMode !== 'admin') {
        // Admin requests may be authenticated by the httpOnly cookie instead,
        // so the server makes that decision rather than failing client-side.
        throw new ApiError(
          authMode === 'customer'
            ? 'Please sign in to your customer account to continue.'
            : 'A valid administrator authentication token is required. Please sign in.',
          401,
          'UNAUTHENTICATED'
        );
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 25000);

    let res: Response;
    try {
      res = await fetch(finalUrl, {
        method,
        headers,
        credentials: 'same-origin',
        body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (networkErr: any) {
      if (networkErr.name === 'AbortError') {
        throw new ApiError(`Request timeout after ${options.timeoutMs || 25000}ms to ${finalUrl}`, 408, 'TIMEOUT');
      }
      throw new ApiError(
        `Unable to reach backend API at ${baseUrl}. Please verify the server is running and accessible (CORS/network check).`,
        0,
        'NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse response body
    const contentType = res.headers.get('content-type') || '';
    let parsed: any = null;
    if (contentType.includes('application/json')) {
      parsed = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => '');
      parsed = text ? { raw: text } : {};
    }

    if (!res.ok) {
      const errObj = parsed?.error;
      const structured = errObj && typeof errObj === 'object' && !Array.isArray(errObj) ? errObj : null;
      const errorCode =
        structured?.code ||
        (typeof parsed?.code === 'string' ? parsed.code : '') ||
        (res.status === 401
          ? 'UNAUTHENTICATED'
          : res.status === 403
          ? 'FORBIDDEN'
          : res.status === 404
          ? 'NOT_FOUND'
          : 'API_ERROR');

      // Preserve the API's own message first (e.g. "Invalid administrator
      // credentials"); only fall back to generic status hints when the server
      // did not explain the failure.
      const validationSummary = Array.isArray(parsed?.errors)
        ? parsed.errors
            .map((e: any) => (typeof e === 'string' ? e : e?.message))
            .filter(Boolean)
            .join(' ')
        : '';
      const serverMessage =
        (structured?.message && String(structured.message)) ||
        (typeof errObj === 'string' ? errObj : '') ||
        (typeof parsed?.message === 'string' ? parsed.message : '') ||
        validationSummary ||
        '';

      let errorMessage = serverMessage || `Request failed with HTTP ${res.status}`;
      if (!serverMessage) {
        if (res.status === 401) {
          errorMessage = 'Your session has expired or requires authentication. Please sign in with administrator credentials.';
        } else if (res.status === 403) {
          errorMessage = 'Access denied: Your account lacks administrator privileges on the backend server.';
        }
      }

      throw new ApiError(errorMessage, res.status, errorCode, parsed);
    }

    return parsed as T;
  };

  const promise = execRequest();
  if (method !== 'GET') {
    pendingRequests.set(requestKey, promise);
    // Attach a no-op rejection handler before finally() so a failed request does
    // not surface as an unhandled promise rejection.
    promise.catch(() => undefined).finally(() => pendingRequests.delete(requestKey));
  }

  return promise;
}

// =========================================================================
// API CLIENT IMPLEMENTATION CONNECTING TO REAL /api/v1 BACKEND ENDPOINTS
// =========================================================================

export const api = {
  // -----------------------------------------------------------------------
  // HEALTH & READINESS ENDPOINTS
  // -----------------------------------------------------------------------

  /**
   * Check if backend service process is alive
   * GET /health/live
   */
  checkLiveness: async (): Promise<{ status: string; uptime?: number; timestamp?: string }> => {
    return httpRequest<{ status: string; uptime?: number; timestamp?: string }>('/health/live', {
      timeoutMs: 5000
    });
  },

  /**
   * Check if backend service and dependencies (database, external providers) are ready
   * GET /health/ready
   */
  checkReadiness: async (): Promise<{ status: string; database?: boolean; details?: any }> => {
    return httpRequest<{ status: string; database?: boolean; details?: any }>('/health/ready', {
      timeoutMs: 6000
    });
  },

  // -----------------------------------------------------------------------
  // PRODUCT ENDPOINTS (PREFIX: /api/v1)
  // -----------------------------------------------------------------------

  /**
   * List products with search, category, status, stock, sorting, pagination
   * GET /api/v1/products (public) or GET /api/admin/products (includeInactive)
   */
  getProducts: async (params?: {
    category?: string;
    search?: string;
    sort?: string;
    isActive?: boolean | string;
    status?: string;
    stock?: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
  }): Promise<{ products: Product[]; total?: number; page?: number; totalPages?: number }> => {
    const includeInactive = params?.includeInactive === true;
    const raw = await httpRequest<any>(includeInactive ? '/api/admin/products' : '/api/v1/products', {
      method: 'GET',
      params: includeInactive
        ? undefined
        : {
            category: params?.category && params.category !== 'all' ? params.category : undefined,
            categoryId: params?.category && params.category !== 'all' ? params.category : undefined,
            search: params?.search,
            sort: params?.sort,
            isActive: params?.isActive,
            status: params?.status,
            stock: params?.stock,
            page: params?.page,
            limit: params?.limit
          },
      requiresAuth: includeInactive,
      auth: includeInactive ? 'admin' : 'auto'
    });

    // Handle standard { products: [...] } or direct array [...] or { data: [...] }
    const products: Product[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.products)
      ? raw.products
      : Array.isArray(raw?.data)
      ? raw.data
      : [];

    return {
      products,
      total: raw?.total ?? products.length,
      page: raw?.page,
      totalPages: raw?.totalPages
    };
  },

  /**
   * Get single product details (Admin authenticated so inactive products load)
   * GET /api/admin/products/:id
   */
  getProduct: async (id: string): Promise<{ product: Product }> => {
    const raw = await httpRequest<any>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const product = raw?.product || raw?.data || raw;
    return { product };
  },

  /**
   * Create new product (Admin authenticated)
   * POST /api/admin/products
   */
  createProduct: async (productPayload: Partial<Product>): Promise<{ product: Product }> => {
    const raw = await httpRequest<any>('/api/admin/products', {
      method: 'POST',
      body: productPayload,
      requiresAuth: true,
      auth: 'admin'
    });
    const product = raw?.product || raw?.data || raw;
    return { product };
  },

  /**
   * Update existing product (Admin authenticated)
   * PUT /api/admin/products/:id
   */
  updateProduct: async (id: string, updates: Partial<Product>): Promise<{ product: Product }> => {
    const raw = await httpRequest<any>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
      requiresAuth: true,
      auth: 'admin'
    });
    const product = raw?.product || raw?.data || raw;
    return { product };
  },

  /**
   * Archive product (Admin authenticated). Archiving preserves order history.
   * POST /api/admin/products/:id/archive
   */
  archiveProduct: async (id: string): Promise<{ success: boolean; product?: Product; message?: string }> => {
    const raw = await httpRequest<any>(`/api/admin/products/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      success: raw?.success ?? true,
      product: raw?.product,
      message: raw?.message || 'Product archived successfully'
    };
  },

  /**
   * Permanently delete a product (Admin authenticated).
   * DELETE /api/admin/products/:id — the API refuses when the product is
   * referenced by historical orders and asks for archival instead.
   */
  deleteProduct: async (id: string, force = false): Promise<{ success: boolean; message?: string; requiresArchive?: boolean; orderCount?: number }> => {
    const raw = await httpRequest<any>(
      `/api/admin/products/${encodeURIComponent(id)}${force ? '?force=true' : ''}`,
      { method: 'DELETE', requiresAuth: true, auth: 'admin' }
    );
    return {
      success: raw?.success ?? true,
      message: raw?.message,
      requiresArchive: raw?.requiresArchive,
      orderCount: raw?.orderCount
    };
  },

  /**
   * Change product active status (Admin authenticated)
   * PUT /api/admin/products/:id
   */
  updateProductStatus: async (
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; product?: Product }> => {
    const raw = await httpRequest<any>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { isActive },
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      success: raw?.success ?? true,
      product: raw?.product || raw?.data
    };
  },

  // -----------------------------------------------------------------------
  // CATEGORY ENDPOINTS (PREFIX: /api/v1)
  // -----------------------------------------------------------------------

  /**
   * List categories
   * GET /api/v1/categories (public) or GET /api/admin/categories (includeInactive)
   */
  getCategories: async (params?: { includeInactive?: boolean }): Promise<{ categories: Category[] }> => {
    const includeInactive = params?.includeInactive === true;
    const raw = await httpRequest<any>(includeInactive ? '/api/admin/categories' : '/api/v1/categories', {
      method: 'GET',
      requiresAuth: includeInactive,
      auth: includeInactive ? 'admin' : 'auto'
    });
    const categories: Category[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.categories)
      ? raw.categories
      : Array.isArray(raw?.data)
      ? raw.data
      : [];
    return { categories };
  },

  /**
   * Get one category (Admin authenticated)
   * GET /api/admin/categories/:id
   */
  getCategory: async (id: string): Promise<{ category: Category }> => {
    const raw = await httpRequest<any>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const category = raw?.category || raw?.data || raw;
    return { category };
  },

  /**
   * Create category (Admin authenticated)
   * POST /api/admin/categories
   */
  createCategory: async (categoryPayload: Partial<Category>): Promise<{ category: Category }> => {
    const raw = await httpRequest<any>('/api/admin/categories', {
      method: 'POST',
      body: categoryPayload,
      requiresAuth: true,
      auth: 'admin'
    });
    const category = raw?.category || raw?.data || raw;
    return { category };
  },

  /**
   * Update category (Admin authenticated)
   * PUT /api/admin/categories/:id
   */
  updateCategory: async (id: string, updates: Partial<Category>): Promise<{ category: Category }> => {
    const raw = await httpRequest<any>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates,
      requiresAuth: true,
      auth: 'admin'
    });
    const category = raw?.category || raw?.data || raw;
    return { category };
  },

  /**
   * Delete category (Admin authenticated)
   * DELETE /api/admin/categories/:id
   */
  deleteCategory: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const raw = await httpRequest<any>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      success: raw?.success ?? true,
      message: raw?.message
    };
  },

  // -----------------------------------------------------------------------
  // IMAGE UPLOAD & DELETION ENDPOINTS (proxied through the API server)
  // -----------------------------------------------------------------------

  /**
   * Upload a product image through the API server (Admin authenticated).
   * POST /api/admin/cloudinary/upload
   *
   * The file is sent as a data URI so Cloudinary credentials never reach the
   * browser. When Cloudinary is not configured the bundled API server stores
   * the image locally and returns a same-origin URL instead of failing.
   */
  uploadProductImage: async (
    file: File | Blob,
    folder?: string
  ): Promise<{
    url: string;
    secureUrl: string;
    publicId: string;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
  }> => {
    const dataUrl = await readFileAsDataUrl(file);
    const raw = await httpRequest<any>('/api/admin/cloudinary/upload', {
      method: 'POST',
      body: {
        file: dataUrl,
        folder: folder || 'zamzam/products',
        fileName: typeof File !== 'undefined' && file instanceof File ? file.name : undefined
      },
      requiresAuth: true,
      auth: 'admin',
      timeoutMs: 60000
    });

    const image = raw?.image || raw?.data || raw;
    if (!image?.url && !image?.secureUrl) {
      throw new ApiError(
        'The image upload endpoint did not return a URL.',
        502,
        'UPLOAD_FAILED',
        raw
      );
    }

    return {
      url: image.url || image.secureUrl,
      secureUrl: image.secureUrl || image.url,
      publicId: image.publicId || image.public_id || '',
      format: image.format,
      width: image.width,
      height: image.height,
      bytes: image.bytes
    };
  },

  /**
   * Delete image through the API server (Admin authenticated)
   * POST /api/admin/cloudinary/delete
   */
  deleteCloudinaryImage: async (publicId: string): Promise<{ success: boolean; result?: string }> => {
    const raw = await httpRequest<any>('/api/admin/cloudinary/delete', {
      method: 'POST',
      body: { publicId },
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      success: raw?.success ?? true,
      result: raw?.result
    };
  },

  // -----------------------------------------------------------------------
  // ORDER ENDPOINTS (PREFIX: /api/v1)
  // -----------------------------------------------------------------------

  /**
   * Create new order during customer checkout (Server-authoritative)
   * POST /api/v1/orders
   */
  placeOrder: async (orderData: {
    customer: { fullName: string; phone: string; address: string; city: string; area?: string; notes?: string };
    items: Array<{ productId: string; name: string; price?: number; quantity: number; image?: string; sku?: string }>;
    couponCode?: string;
  }): Promise<{ success: boolean; order: Order }> => {
    const raw = await httpRequest<any>('/api/v1/orders', {
      method: 'POST',
      body: orderData
    });
    return {
      success: raw?.success ?? true,
      order: raw?.order || raw?.data || raw
    };
  },

  /**
   * Track order by Order ID or Order Number + customer phone
   * POST /api/v1/orders/:id/track
   */
  trackOrder: async (orderIdOrNumber: string, phone: string): Promise<{ order: Order }> => {
    const cleanId = encodeURIComponent(orderIdOrNumber.trim());
    const raw = await httpRequest<any>(`/api/v1/orders/${cleanId}/track`, {
      method: 'POST',
      body: { phone: phone.trim(), phoneNumber: phone.trim() }
    });
    return {
      order: raw?.order || raw?.data || raw
    };
  },

  /**
   * List all orders (Admin authenticated)
   * GET /api/admin/orders
   */
  getOrders: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ orders: Order[]; total?: number }> => {
    const raw = await httpRequest<any>('/api/admin/orders', {
      method: 'GET',
      params: {
        status: params?.status && params.status !== 'all' ? params.status : undefined,
        search: params?.search,
        page: params?.page,
        limit: params?.limit
      },
      requiresAuth: true,
      auth: 'admin'
    });

    const orders: Order[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.orders)
      ? raw.orders
      : Array.isArray(raw?.data)
      ? raw.data
      : [];

    return {
      orders,
      total: raw?.total ?? orders.length
    };
  },

  /**
   * List only the signed-in customer's own orders (Firebase ID token required)
   * GET /api/orders/my
   */
  getCustomerOrders: async (): Promise<{ orders: Order[] }> => {
    const raw = await httpRequest<any>('/api/orders/my', {
      method: 'GET',
      requiresAuth: true,
      auth: 'customer'
    });

    const orders: Order[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.orders)
      ? raw.orders
      : Array.isArray(raw?.data)
      ? raw.data
      : [];

    return { orders };
  },

  /**
   * Get single order by ID (Admin authenticated)
   * GET /api/admin/orders/:id
   */
  getOrder: async (id: string): Promise<{ order: Order }> => {
    const raw = await httpRequest<any>(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      order: raw?.order || raw?.data || raw
    };
  },

  /**
   * Update order status and fulfillment notes (Admin authenticated)
   * PUT /api/admin/orders/:id/status
   */
  updateOrderStatus: async (
    id: string,
    status: OrderStatus,
    extra?: {
      trackingNumber?: string;
      courierName?: string;
      cancelReason?: string;
      internalNotes?: string;
    }
  ): Promise<{ success: boolean; order: Order }> => {
    const raw = await httpRequest<any>(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: {
        status,
        ...extra
      },
      requiresAuth: true,
      auth: 'admin'
    });
    return {
      success: raw?.success ?? true,
      order: raw?.order || raw?.data || raw
    };
  },

  // -----------------------------------------------------------------------
  // SUPPLEMENTARY CLIENT METHODS (Preserved with graceful backend integration)
  // -----------------------------------------------------------------------

  validateCoupon: async (code: string, subtotal: number) => {
    try {
      const raw = await httpRequest<any>('/api/v1/coupons/validate', {
        method: 'POST',
        body: { code, subtotal }
      });
      return raw;
    } catch (err: any) {
      // The API rejects an unknown/expired coupon with HTTP 400 and a structured
      // body. Surface that reply instead of masking it with a fake coupon.
      if (err instanceof ApiError && err.status === 400 && err.details) {
        return {
          valid: false,
          error: err.details.error || err.details.message || err.message
        };
      }
      // Network fallback only, so a transient outage does not block checkout.
      const normalized = code.trim().toUpperCase();
      if (normalized === 'SAVE10' || normalized === 'ZAMZAM10') {
        const discountAmount = Math.round(subtotal * 0.1);
        return {
          valid: true,
          coupon: {
            code: normalized,
            discountType: 'percentage' as const,
            discountValue: 10,
            amountSaved: discountAmount
          }
        };
      }
      return { valid: false, error: err?.message || 'Could not validate the coupon. Please try again.' };
    }
  },

  getBanners: async (): Promise<{ banners: Banner[] }> => {
    try {
      const raw = await httpRequest<any>('/api/v1/banners', { method: 'GET' });
      return { banners: raw.banners || raw.data || [] };
    } catch {
      return {
        banners: [
          {
            id: 'b-default',
            title: 'Refined Everyday Essentials',
            subtitle: 'Salon-grade brushes & aesthetic acrylic organizers designed for your daily routine.',
            badgeText: 'Curated Collection',
            imageUrl: '/src/assets/images/hero_lifestyle_store_1792058412869.jpg',
            linkUrl: '#collection',
            ctaText: 'Explore Catalog',
            isActive: true,
            displayOrder: 1
          }
        ]
      };
    }
  },

  getSettings: async (): Promise<{ settings: StoreSettings }> => {
    try {
      const raw = await httpRequest<any>('/api/v1/settings', { method: 'GET' });
      return { settings: raw.settings || raw.data || raw };
    } catch {
      return {
        settings: {
          storeName: 'Zamzam',
          tagline: 'Refined Everyday Beauty, Hair & Home Essentials',
          contactPhone: '03049002888',
          contactEmail: 'ahsanullahyousafzai90@gmail.com',
          address: 'Phase 5 DHA, Lahore, Pakistan',
          currency: 'PKR',
          standardShippingFee: 200,
          freeShippingThreshold: 3000,
          returnPolicy: '7-day replacement or return on personal accessories.',
          deliveryPolicy: 'Fast nationwide Cash on Delivery (COD). 2-3 business days in major cities.',
          aboutText: 'Curating salon-grade brushes and aesthetic storage.'
        }
      };
    }
  },

  // -----------------------------------------------------------------------
  // ADMIN PROMOTIONS & SETTINGS (authenticated administrator endpoints)
  // -----------------------------------------------------------------------

  adminGetBanners: async (): Promise<{ banners: Banner[] }> => {
    const raw = await httpRequest<any>('/api/admin/banners', {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const banners: Banner[] = Array.isArray(raw?.banners)
      ? raw.banners
      : Array.isArray(raw?.data)
      ? raw.data
      : [];
    return { banners };
  },
  adminSaveBanner: async (banner: Partial<Banner>): Promise<{ banner: Banner }> => {
    const raw = await httpRequest<any>(
      banner.id ? `/api/admin/banners/${encodeURIComponent(banner.id)}` : '/api/admin/banners',
      {
        method: banner.id ? 'PUT' : 'POST',
        body: banner,
        requiresAuth: true,
        auth: 'admin'
      }
    );
    return { banner: raw?.banner || raw?.data || raw };
  },
  adminDeleteBanner: async (id: string): Promise<{ success: boolean }> => {
    const raw = await httpRequest<any>(`/api/admin/banners/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
    return { success: raw?.success ?? true };
  },
  adminGetCoupons: async (): Promise<{ coupons: Coupon[] }> => {
    const raw = await httpRequest<any>('/api/admin/coupons', {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const coupons: Coupon[] = Array.isArray(raw?.coupons)
      ? raw.coupons
      : Array.isArray(raw?.data)
      ? raw.data
      : [];
    return { coupons };
  },
  adminSaveCoupon: async (coupon: Partial<Coupon>): Promise<{ coupon: Coupon }> => {
    const raw = await httpRequest<any>(
      coupon.id ? `/api/admin/coupons/${encodeURIComponent(coupon.id)}` : '/api/admin/coupons',
      {
        method: coupon.id ? 'PUT' : 'POST',
        body: coupon,
        requiresAuth: true,
        auth: 'admin'
      }
    );
    return { coupon: raw?.coupon || raw?.data || raw };
  },
  adminDeleteCoupon: async (id: string): Promise<{ success: boolean }> => {
    const raw = await httpRequest<any>(`/api/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
    return { success: raw?.success ?? true };
  },
  adminGetSettings: async (): Promise<{ settings: StoreSettings }> => {
    const raw = await httpRequest<any>('/api/admin/settings', {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    return { settings: raw?.settings || raw?.data || raw };
  },
  adminUpdateSettings: async (settings: Partial<StoreSettings>): Promise<{ settings: StoreSettings }> => {
    const raw = await httpRequest<any>('/api/admin/settings', {
      method: 'PUT',
      body: settings,
      requiresAuth: true,
      auth: 'admin'
    });
    return { settings: raw?.settings || raw?.data || raw };
  },

  // -----------------------------------------------------------------------
  // ADMIN SESSION, ACCOUNT SECURITY & AUDIT
  // -----------------------------------------------------------------------

  /**
   * Returns the backend-verified administrator identity. This is the only
   * source of truth for whether the admin console may open.
   * GET /api/admin/me
   */
  adminMe: async (): Promise<AdminIdentity> => {
    const raw = await httpRequest<any>('/api/admin/me', {
      method: 'GET',
      auth: 'admin'
    });
    const user = raw?.user;
    if (!user || user.role !== 'admin' || !user.provider) {
      throw new ApiError('The backend did not confirm an administrator session.', 401, 'UNAUTHENTICATED', raw);
    }
    return user as AdminIdentity;
  },

  /**
   * Local recovery administrator sign-in. The session is delivered as an
   * httpOnly cookie; no bearer token is stored in the browser.
   * POST /api/admin/login
   */
  adminLogin: async (
    username: string,
    pass: string
  ): Promise<{ success: boolean; user?: Partial<AdminIdentity> }> => {
    return httpRequest<any>('/api/admin/login', {
      method: 'POST',
      body: { username, password: pass },
      auth: 'auto'
    });
  },

  /** Revokes the local administrator session and clears the cookie. */
  adminLogout: async (): Promise<{ success: boolean }> => {
    try {
      return await httpRequest<any>('/api/admin/logout', {
        method: 'POST',
        auth: 'admin'
      });
    } catch {
      return { success: true };
    }
  },

  /**
   * Changes the local recovery administrator password. The current password is
   * re-verified server-side and the session cookie is rotated on success.
   * POST /api/admin/change-password
   */
  changeAdminPassword: async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string; user?: Partial<AdminIdentity> }> => {
    return httpRequest<any>('/api/admin/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      requiresAuth: true,
      auth: 'admin',
      timeoutMs: 30000
    });
  },

  /**
   * Records a completed Firebase password change in the server audit log.
   * No password data is sent.
   * POST /api/admin/security/password-changed
   */
  recordAdminPasswordChange: async (): Promise<{ success: boolean }> => {
    return httpRequest<any>('/api/admin/security/password-changed', {
      method: 'POST',
      body: {},
      requiresAuth: true,
      auth: 'admin'
    });
  },

  /** Security and catalogue audit events (administrator only). */
  adminGetAuditLogs: async (): Promise<{ auditLogs: AuditLog[] }> => {
    const raw = await httpRequest<any>('/api/admin/audit-logs', {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const auditLogs: AuditLog[] = Array.isArray(raw?.auditLogs)
      ? raw.auditLogs
      : Array.isArray(raw?.data)
      ? raw.data
      : [];
    return { auditLogs };
  }
};
