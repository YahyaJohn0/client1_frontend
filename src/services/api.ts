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
 * Trusted administrator identity returned by GET /api/v1/auth/admin/me. It is only a
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

export interface OrderTrackingInfo {
  orderNumber: string;
  fulfillmentStatus: OrderStatus;
  statusHistory: Array<{ status: OrderStatus; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

// Centralized API Configuration
const STORAGE_CUSTOM_BASE_URL = 'zamzam_custom_api_base_url';
const DEFAULT_API_BASE_URL = 'https://clientbackend-taxt7mcy.b4a.run';
const API_PREFIX = '/api/v1';

function apiPath(path: string): string {
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

function unwrapApiData<T>(response: any): T {
  return response?.success === true && Object.hasOwn(response, 'data') ? response.data as T : response as T;
}

function normalizeProduct(raw: any): Product {
  const images = Array.isArray(raw?.images) ? raw.images : [];
  const imageMetadata = Array.isArray(raw?.imageMetadata)
    ? raw.imageMetadata
    : images
        .filter((image: any) => image && typeof image === 'object' && typeof image.url === 'string')
        .map((image: any, index: number) => ({
          url: image.url,
          publicId: image.publicId,
          isPrimary: index === 0
        }));
  return {
    ...raw,
    images: images.map((image: any) => typeof image === 'string' ? image : image?.url).filter(Boolean),
    imageMetadata,
    salePrice: raw?.salePrice ?? undefined
  } as Product;
}

function serializeProduct(input: Partial<Product>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of [
    'name', 'sku', 'description', 'shortDescription', 'categoryId', 'price', 'salePrice',
    'stock', 'isFeatured', 'isBestSeller', 'isTrending', 'isNewArrival', 'isActive'
  ] as const) {
    if (Object.hasOwn(input, field)) payload[field] = input[field];
  }

  if (Object.hasOwn(input, 'images')) {
    const metadata = new Map((input.imageMetadata || []).map(image => [image.url, image]));
    payload.images = (input.images || []).map(url => {
      const image = metadata.get(url);
      if (!image?.publicId) {
        throw new ApiError(
          'Upload each product image before saving; the API requires its Cloudinary public ID.',
          400,
          'IMAGE_PUBLIC_ID_REQUIRED'
        );
      }
      return { url, publicId: image.publicId };
    });
  }
  return payload;
}

function normalizeCategory(raw: any): Category {
  return {
    ...raw,
    slug: raw?.slug || String(raw?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    image: raw?.image ?? undefined
  } as Category;
}

function unsupportedBackendFeature(feature: string): never {
  throw new ApiError(
    `${feature} is not supported by the deployed client_backend API.`,
    501,
    'FEATURE_NOT_SUPPORTED'
  );
}

function serializeCategory(input: Partial<Category>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of ['name', 'description', 'image', 'isActive', 'displayOrder'] as const) {
    if (Object.hasOwn(input, field)) payload[field] = input[field];
  }
  return payload;
}

function normalizeOrder(raw: any, fallback?: any): Order {
  const status = raw?.status || raw?.fulfillmentStatus || 'placed';
  return {
    ...fallback,
    ...raw,
    customer: {
      ...fallback?.customer,
      ...raw?.customer,
      fullName: raw?.customer?.fullName || raw?.customer?.name || fallback?.customer?.fullName || '',
      phone: raw?.customer?.phone || fallback?.customer?.phone || '',
      address: raw?.customer?.address || fallback?.customer?.address || '',
      city: raw?.customer?.city || fallback?.customer?.city || ''
    },
    items: (raw?.items || fallback?.items || []).map((item: any) => ({
      ...item,
      price: item.price ?? item.unitPrice ?? 0,
      image: item.image || ''
    })),
    paymentMethod: 'COD',
    paymentStatus: raw?.paymentStatus === 'unpaid' ? 'pending' : raw?.paymentStatus || 'pending',
    fulfillmentStatus: status === 'pending' ? 'placed' : status,
    statusHistory: (raw?.statusHistory || []).map((entry: any) => ({
      ...entry,
      status: entry.status === 'pending' ? 'placed' : entry.status,
      timestamp: entry.timestamp || entry.at || ''
    }))
  } as Order;
}

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
 * Use the deployed backend unless a local-storage override or API_BASE_URL
 * selects another API.
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

  const envUrl = normalizeBaseUrl(import.meta.env.API_BASE_URL as string | undefined);
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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
  requiresAuth?: boolean;
  /**
   * Which credential to send on an authenticated request.
   * - "admin": the administrator Firebase ID token from the dedicated admin app.
   * - "customer": only the signed-in customer's Firebase ID token.
   * - "auto" (default): the customer token when present, otherwise the admin
   *   token (public endpoints do not require either).
   */
  auth?: 'auto' | 'admin' | 'customer';
  timeoutMs?: number;
  deduplicate?: boolean;
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
  const isBinaryBody = typeof Blob !== 'undefined' && options.body instanceof Blob;
  const requestKey = `${method}:${finalUrl}:${isBinaryBody ? `binary:${crypto.randomUUID()}` : options.body ? JSON.stringify(options.body) : ''}`;

  // Prevent duplicate concurrent in-flight submissions for identical mutating requests
  if (method !== 'GET' && options.deduplicate !== false && pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey) as Promise<T>;
  }

  const execRequest = async (): Promise<T> => {
    const headers: Record<string, string> = {
      ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData) && !isBinaryBody) {
      headers['Content-Type'] = 'application/json';
    } else if (isBinaryBody && options.body.type) {
      headers['Content-Type'] = options.body.type;
    }

    // Attach the credential appropriate for the request type.
    const isOurBackend = finalUrl.startsWith(baseUrl);
    const authMode = options.auth || 'auto';
    if (isOurBackend) {
      const authToken = await resolveAuthToken(authMode);
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      } else if (options.requiresAuth) {
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
        credentials: 'omit',
        body: options.body instanceof FormData || isBinaryBody ? options.body : options.body ? JSON.stringify(options.body) : undefined,
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
  if (method !== 'GET' && options.deduplicate !== false && !isBinaryBody) {
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
    const response = await httpRequest<any>('/health/live', {
      timeoutMs: 5000
    });
    return unwrapApiData(response);
  },

  /**
   * Check if backend service and dependencies (database, external providers) are ready
   * GET /health/ready
   */
  checkReadiness: async (): Promise<{ status: string; database?: boolean; details?: any }> => {
    const response = await httpRequest<any>('/health/ready', {
      timeoutMs: 6000
    });
    return unwrapApiData(response);
  },

  // -----------------------------------------------------------------------
  // PRODUCT ENDPOINTS (PREFIX: /api/v1)
  // -----------------------------------------------------------------------

  getDemoProducts: async (): Promise<{ products: Product[] }> => {
    const response = await httpRequest<any>(apiPath('/demo-products'), {
      params: { includeInactive: true, limit: 100 },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      products: (Array.isArray(raw) ? raw : Array.isArray(raw?.products) ? raw.products : [])
        .map(normalizeProduct)
    };
  },

  getDemoProduct: async (id: string): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath(`/demo-products/${encodeURIComponent(id)}`), {
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return { product: normalizeProduct(raw?.product || raw?.data || raw) };
  },

  createDemoProduct: async (payload: Partial<Product>): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath('/demo-products'), {
      method: 'POST',
      body: serializeProduct(payload),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return { product: normalizeProduct(raw?.product || raw?.data || raw) };
  },

  updateDemoProduct: async (id: string, payload: Partial<Product>): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath(`/demo-products/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: serializeProduct(payload),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return { product: normalizeProduct(raw?.product || raw?.data || raw) };
  },

  updateDemoProductStatus: async (id: string, isActive: boolean): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath(`/demo-products/${encodeURIComponent(id)}/status`), {
      method: 'PATCH',
      body: { isActive },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return { product: normalizeProduct(raw?.product || raw?.data || raw) };
  },

  archiveDemoProduct: async (id: string): Promise<void> => {
    await httpRequest(apiPath(`/demo-products/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
  },

  /**
   * List products with search, category, status, stock, sorting, pagination
   * GET /api/v1/products (includeInactive requires a Firebase administrator)
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
    const response = await httpRequest<any>(apiPath('/products'), {
      method: 'GET',
      params: {
        categoryId: params?.category && params.category !== 'all' ? params.category : undefined,
        search: params?.search,
        sort: ['name', 'price', 'createdAt', 'updatedAt'].includes(params?.sort || '') ? params?.sort : undefined,
        order: 'desc',
        stock: params?.stock,
        limit: params?.limit || 100,
        includeInactive: includeInactive ? true : undefined
      },
      requiresAuth: includeInactive,
      auth: includeInactive ? 'admin' : 'auto'
    });
    const raw = unwrapApiData<any>(response);

    // Handle standard { products: [...] } or direct array [...] or { data: [...] }
    const products: Product[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.products)
      ? raw.products
      : [];
    const normalizedProducts = products.map(normalizeProduct);

    return {
      products: normalizedProducts,
      total: normalizedProducts.length,
      page: 1,
      totalPages: 1
    };
  },

  /**
   * Get single product details (Admin authenticated so inactive products load)
   * GET /api/v1/products/:id?includeInactive=true
   */
  getProduct: async (id: string): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath(`/products/${encodeURIComponent(id)}`), {
      method: 'GET',
      params: { includeInactive: true },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const product = raw?.product || raw?.data || raw;
    return { product: normalizeProduct(product) };
  },

  /**
   * Create new product (Admin authenticated)
   * POST /api/v1/products
   */
  createProduct: async (productPayload: Partial<Product>): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath('/products'), {
      method: 'POST',
      body: serializeProduct(productPayload),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const product = raw?.product || raw?.data || raw;
    return { product: normalizeProduct(product) };
  },

  /**
   * Update existing product (Admin authenticated)
   * PATCH /api/v1/products/:id
   */
  updateProduct: async (id: string, updates: Partial<Product>): Promise<{ product: Product }> => {
    const response = await httpRequest<any>(apiPath(`/products/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: serializeProduct(updates),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const product = raw?.product || raw?.data || raw;
    return { product: normalizeProduct(product) };
  },

  /**
   * Archive product (Admin authenticated). Archiving preserves order history.
   * DELETE /api/v1/products/:id (archives without destroying order history)
   */
  archiveProduct: async (id: string): Promise<{ success: boolean; product?: Product; message?: string }> => {
    const response = await httpRequest<any>(apiPath(`/products/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      success: raw?.success ?? true,
      product: raw?.product,
      message: raw?.message || 'Product archived successfully'
    };
  },

  /**
   * Permanently delete a product (Admin authenticated).
   * DELETE /api/v1/products/:id archives products, preserving order history.
   */
  deleteProduct: async (id: string, force = false): Promise<{ success: boolean; message?: string; requiresArchive?: boolean; orderCount?: number }> => {
    const response = await httpRequest<any>(
      apiPath(`/products/${encodeURIComponent(id)}`),
      { method: 'DELETE', requiresAuth: true, auth: 'admin' }
    );
    const raw = unwrapApiData<any>(response);
    return {
      success: raw?.success ?? true,
      message: raw?.message,
      requiresArchive: raw?.requiresArchive,
      orderCount: raw?.orderCount
    };
  },

  /**
   * Change product active status (Admin authenticated)
   * PATCH /api/v1/products/:id/status
   */
  updateProductStatus: async (
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; product?: Product }> => {
    const response = await httpRequest<any>(apiPath(`/products/${encodeURIComponent(id)}/status`), {
      method: 'PATCH',
      body: { isActive },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
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
   * GET /api/v1/categories (includeInactive requires a Firebase administrator)
   */
  getCategories: async (params?: { includeInactive?: boolean }): Promise<{ categories: Category[] }> => {
    const includeInactive = params?.includeInactive === true;
    const response = await httpRequest<any>(apiPath('/categories'), {
      method: 'GET',
      params: { includeInactive: includeInactive ? true : undefined },
      requiresAuth: includeInactive,
      auth: includeInactive ? 'admin' : 'auto'
    });
    const raw = unwrapApiData<any>(response);
    const categoryItems = Array.isArray(raw) ? raw : Array.isArray(raw?.categories) ? raw.categories : [];
    const categories: Category[] = categoryItems.map(normalizeCategory);
    return { categories };
  },

  /**
   * Get one category (Admin authenticated)
   * GET /api/v1/categories/:id?includeInactive=true
   */
  getCategory: async (id: string): Promise<{ category: Category }> => {
    const response = await httpRequest<any>(apiPath(`/categories/${encodeURIComponent(id)}`), {
      method: 'GET',
      params: { includeInactive: true },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const category = raw?.category || raw?.data || raw;
    return { category: normalizeCategory(category) };
  },

  /**
   * Create category (Admin authenticated)
   * POST /api/v1/categories
   */
  createCategory: async (categoryPayload: Partial<Category>): Promise<{ category: Category }> => {
    const response = await httpRequest<any>(apiPath('/categories'), {
      method: 'POST',
      body: serializeCategory(categoryPayload),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const category = raw?.category || raw?.data || raw;
    return { category: normalizeCategory(category) };
  },

  /**
   * Update category (Admin authenticated)
   * PATCH /api/v1/categories/:id
   */
  updateCategory: async (id: string, updates: Partial<Category>): Promise<{ category: Category }> => {
    const response = await httpRequest<any>(apiPath(`/categories/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: serializeCategory(updates),
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    const category = raw?.category || raw?.data || raw;
    return { category: normalizeCategory(category) };
  },

  /**
   * Delete category (Admin authenticated)
   * DELETE /api/v1/categories/:id
   */
  deleteCategory: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const response = await httpRequest<any>(apiPath(`/categories/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      success: raw?.success ?? true,
      message: raw?.message
    };
  },

  // -----------------------------------------------------------------------
  // IMAGE UPLOAD & DELETION ENDPOINTS (proxied through the API server)
  // -----------------------------------------------------------------------

  /** Uploads a file through the authenticated API, which streams it to Cloudinary server-side. */
  uploadProductImage: async (
    file: File | Blob
  ): Promise<{
    url: string;
    secureUrl: string;
    publicId: string;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
  }> => {
    if (typeof Blob === 'undefined' || !(file instanceof Blob)) {
      throw new ApiError('A valid image file is required for upload.', 400, 'INVALID_IMAGE');
    }

    const response = await httpRequest<any>(apiPath('/uploads/product-image'), {
      method: 'POST',
      body: file,
      requiresAuth: true,
      auth: 'admin',
      timeoutMs: 60000,
      deduplicate: false
    });

    const uploaded = unwrapApiData<any>(response);
    if (typeof uploaded?.secureUrl !== 'string' || !uploaded.secureUrl.startsWith('https://res.cloudinary.com/') ||
        typeof uploaded.publicId !== 'string') {
      throw new ApiError('The upload API returned invalid Cloudinary product image details.', 502, 'UPLOAD_RESPONSE_INVALID');
    }
    return {
      url: uploaded.secureUrl,
      secureUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      format: uploaded.format,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes
    };
  },

  /** Delete an unreferenced Cloudinary image through the API. */
  deleteCloudinaryImage: async (publicId: string): Promise<{ success: boolean; result?: string }> => {
    const response = await httpRequest<any>(apiPath('/uploads'), {
      method: 'DELETE',
      body: { publicId },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      success: raw?.deleted === true,
      result: raw?.deleted ? 'ok' : 'not found'
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
    const response = await httpRequest<any>(apiPath('/orders'), {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: {
        customer: {
          name: orderData.customer.fullName,
          phone: orderData.customer.phone,
          address: orderData.customer.address,
          city: orderData.customer.city,
          ...(orderData.customer.area ? { area: orderData.customer.area } : {}),
          ...(orderData.customer.notes ? { notes: orderData.customer.notes } : {})
        },
        items: orderData.items.map(item => ({ productId: item.productId, quantity: item.quantity })),
        ...(orderData.couponCode ? { couponCode: orderData.couponCode } : {}),
        paymentMethod: 'cash_on_delivery'
      }
    });
    const raw = unwrapApiData<any>(response);
    return {
      success: true,
      order: normalizeOrder(raw?.order || raw, orderData)
    };
  },

  /**
   * Track order by Order ID or Order Number + customer phone
   * POST /api/v1/orders/:id/track
   */
  trackOrder: async (orderIdOrNumber: string, phone: string): Promise<{ order: OrderTrackingInfo }> => {
    const cleanId = encodeURIComponent(orderIdOrNumber.trim());
    const response = await httpRequest<any>(apiPath(`/orders/${cleanId}/track`), {
      method: 'POST',
      body: { phone: phone.trim() }
    });
    const raw = unwrapApiData<any>(response);
    const order = raw?.order || raw;
    return {
      order: {
        orderNumber: order.orderNumber,
        fulfillmentStatus: order.status === 'pending' ? 'placed' : order.status,
        statusHistory: (order.statusHistory || []).map((entry: any) => ({
          status: entry.status === 'pending' ? 'placed' : entry.status,
          timestamp: entry.timestamp || entry.at || ''
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    };
  },

  /**
   * List all orders (Admin authenticated)
   * GET /api/v1/orders (administrator Firebase token required)
   */
  getOrders: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ orders: Order[]; total?: number }> => {
    const response = await httpRequest<any>(apiPath('/orders'), {
      method: 'GET',
      params: { limit: params?.limit || 100 },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);

    const orders: Order[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.orders)
      ? raw.orders
      : [];
    const normalizedOrders = orders.map(order => normalizeOrder(order));

    return {
      orders: normalizedOrders,
      total: normalizedOrders.length
    };
  },

  /**
   * List only the signed-in customer's own orders (Firebase ID token required)
   * GET /api/v1/orders/my
   */
  getCustomerOrders: async (): Promise<{ orders: Order[] }> => {
    const response = await httpRequest<any>(apiPath('/orders/my'), {
      method: 'GET',
      requiresAuth: true,
      auth: 'customer'
    });
    const raw = unwrapApiData<any>(response);

    const orders: Order[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.orders)
      ? raw.orders
      : [];

    return { orders: orders.map(order => normalizeOrder(order)) };
  },

  /**
   * Get single order by ID (Admin authenticated)
   * GET /api/v1/orders/:id
   */
  getOrder: async (id: string): Promise<{ order: Order }> => {
    const response = await httpRequest<any>(apiPath(`/orders/${encodeURIComponent(id)}`), {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      order: normalizeOrder(raw?.order || raw)
    };
  },

  /**
   * Update order status and fulfillment notes (Admin authenticated)
   * PATCH /api/v1/orders/:id/status
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
    const response = await httpRequest<any>(apiPath(`/orders/${encodeURIComponent(id)}/status`), {
      method: 'PATCH',
      body: {
        status: status === 'placed' ? 'confirmed' : status,
        ...extra
      },
      requiresAuth: true,
      auth: 'admin'
    });
    const raw = unwrapApiData<any>(response);
    return {
      success: true,
      order: normalizeOrder(raw?.order || raw)
    };
  },

  // -----------------------------------------------------------------------
  // SUPPLEMENTARY CLIENT METHODS (Preserved with graceful backend integration)
  // -----------------------------------------------------------------------

  validateCoupon: async (code: string, subtotal: number) => {
    try {
      const response = await httpRequest<any>(apiPath('/coupons/validate'), {
        method: 'POST',
        body: { code, subtotal }
      });
      return unwrapApiData<any>(response);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 400) {
        return {
          valid: false,
          error: err.message
        };
      }
      throw err;
    }
  },

  getBanners: async (): Promise<{ banners: Banner[] }> => {
    const response = await httpRequest<any>(apiPath('/banners'), { method: 'GET' });
    const raw = unwrapApiData<any>(response);
    const banners: Banner[] = Array.isArray(raw) ? raw : Array.isArray(raw?.banners) ? raw.banners : [];
    return { banners };
  },

  getSettings: async (): Promise<{ settings: StoreSettings }> => {
    const response = await httpRequest<any>(apiPath('/settings'), { method: 'GET' });
    const raw = unwrapApiData<any>(response);
    return {
      settings: {
        storeName: 'Zamzam',
        tagline: 'Refined Everyday Beauty, Hair & Home Essentials',
        contactPhone: '',
        contactEmail: '',
        address: '',
        currency: 'PKR',
        standardShippingFee: 0,
        freeShippingThreshold: 3000,
        returnPolicy: '',
        deliveryPolicy: '',
        aboutText: '',
        ...raw
      }
    };
  },

  // -----------------------------------------------------------------------
  // ADMIN PROMOTIONS & SETTINGS (authenticated administrator endpoints)
  // -----------------------------------------------------------------------

  adminGetBanners: async (): Promise<{ banners: Banner[] }> => {
    const response = await httpRequest<any>(apiPath('/banners'), { method: 'GET' });
    const raw = unwrapApiData<any>(response);
    const banners: Banner[] = Array.isArray(raw) ? raw : [];
    return { banners };
  },
  adminSaveBanner: async (_banner: Partial<Banner>): Promise<{ banner: Banner }> => {
    return unsupportedBackendFeature('Banner management');
  },
  adminDeleteBanner: async (_id: string): Promise<{ success: boolean }> => {
    return unsupportedBackendFeature('Banner management');
  },
  adminGetCoupons: async (): Promise<{ coupons: Coupon[] }> => {
    return unsupportedBackendFeature('Coupon management');
  },
  adminSaveCoupon: async (_coupon: Partial<Coupon>): Promise<{ coupon: Coupon }> => {
    return unsupportedBackendFeature('Coupon management');
  },
  adminDeleteCoupon: async (_id: string): Promise<{ success: boolean }> => {
    return unsupportedBackendFeature('Coupon management');
  },
  adminGetSettings: async (): Promise<{ settings: StoreSettings }> => {
    return api.getSettings();
  },
  adminUpdateSettings: async (_settings: Partial<StoreSettings>): Promise<{ settings: StoreSettings }> => {
    return unsupportedBackendFeature('Store settings management');
  },

  // -----------------------------------------------------------------------
  // ADMIN SESSION, ACCOUNT SECURITY & AUDIT
  // -----------------------------------------------------------------------

  /**
   * Returns the backend-verified administrator identity. This is the only
   * source of truth for whether the admin console may open.
   * GET /api/v1/auth/admin/me
   */
  adminMe: async (): Promise<AdminIdentity> => {
    const response = await httpRequest<any>(apiPath('/auth/admin/me'), {
      method: 'GET',
      requiresAuth: true,
      auth: 'admin'
    });
    const user = unwrapApiData<any>(response);
    if (!user || user.role !== 'admin' || !user.provider) {
      throw new ApiError('The backend did not confirm an administrator session.', 401, 'UNAUTHENTICATED', user);
    }
    return user as AdminIdentity;
  },

  /**
   * The deployed API supports Firebase administrator sign-in only.
   */
  adminLogin: async (
    _username: string,
    _pass: string
  ): Promise<{ success: boolean; user?: Partial<AdminIdentity> }> => {
    throw new ApiError(
      'This API supports Firebase administrator email sign-in only. Sign in with an administrator Firebase account.',
      501,
      'LOCAL_ADMIN_UNSUPPORTED'
    );
  },

  /** Signs out the dedicated Firebase administrator identity. */
  adminLogout: async (): Promise<{ success: boolean }> => {
    return { success: true };
  },

  /**
   * Changes the local recovery administrator password. The current password is
   * re-verified server-side and the session cookie is rotated on success.
   * POST /api/admin/change-password
   */
  changeAdminPassword: async (
    _currentPassword: string,
    _newPassword: string
  ): Promise<{ success: boolean; message?: string; user?: Partial<AdminIdentity> }> => {
    return unsupportedBackendFeature('Local administrator password changes');
  },

  /**
   * Records a completed Firebase password change in the server audit log.
   * No password data is sent.
   * POST /api/admin/security/password-changed
   */
  recordAdminPasswordChange: async (): Promise<{ success: boolean }> => {
    return unsupportedBackendFeature('Administrator audit logging');
  },

  /** Security and catalogue audit events (administrator only). */
  adminGetAuditLogs: async (): Promise<{ auditLogs: AuditLog[] }> => {
    return unsupportedBackendFeature('Administrator audit log access');
  }
};
