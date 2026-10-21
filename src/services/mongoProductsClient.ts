import type { Product, ProductImageMeta } from '../types/store.ts';
import { ApiError } from './apiErrors.ts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { nextCursor?: string | null };
  error?: { code?: string; message?: string; details?: unknown };
}

function apiOrigin(): string {
  const configured = (import.meta.env.API_BASE_URL || '').trim().replace(/\/+$/, '');
  return configured.endsWith('/api/v1') ? configured.slice(0, -7) : configured;
}

function apiUrl(path: string): string {
  return `${apiOrigin()}/api/v1${path}`;
}

async function request<T>(path: string, token?: string, init: RequestInit = {}, versionedApi = true): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(versionedApi ? apiUrl(path) : `${apiOrigin()}${path}`, { ...init, headers });
  } catch (error) {
    throw new ApiError('Could not reach the product API. Check API_BASE_URL and ensure the backend is running.', 503, 'API_UNAVAILABLE', error);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch (error) {
    if (!response.ok) {
      const message = response.status === 404
        ? 'The configured API host returned 404. Check API_BASE_URL and deploy the API with /api/v1/products and /health/ready routes.'
        : `The product API returned HTTP ${response.status}.`;
      throw new ApiError(message, response.status, response.status === 404 ? 'API_ROUTE_NOT_FOUND' : 'API_ERROR', error);
    }
    throw new ApiError('The product API returned an invalid response.', 502, 'INVALID_API_RESPONSE', error);
  }
  if (!response.ok || payload.success !== true) {
    throw new ApiError(
      payload.error?.message || `Product API request failed (${response.status}).`,
      response.status,
      payload.error?.code,
      payload.error?.details
    );
  }
  return payload;
}

function normalizeProduct(value: Record<string, unknown>): Product {
  const rawImages = Array.isArray(value.images) ? value.images : [];
  const imageMetadata: ProductImageMeta[] = rawImages.flatMap((image, index) => {
    if (typeof image === 'string') return [{ url: image, isPrimary: index === 0, sortOrder: index }];
    if (!image || typeof image !== 'object' || !('url' in image) || typeof image.url !== 'string') return [];
    const metadata = image as ProductImageMeta;
    return [{ ...metadata, isPrimary: index === 0, sortOrder: index }];
  });
  return {
    ...value,
    id: String(value.id ?? value._id ?? ''),
    name: String(value.name ?? ''),
    sku: String(value.sku ?? ''),
    description: String(value.description ?? ''),
    shortDescription: String(value.shortDescription ?? ''),
    categoryId: String(value.categoryId ?? ''),
    price: Number(value.price ?? 0),
    salePrice: value.salePrice == null ? undefined : Number(value.salePrice),
    stock: Number(value.stock ?? 0),
    images: imageMetadata.map(image => image.url),
    imageMetadata,
    isFeatured: value.isFeatured === true,
    isBestSeller: value.isBestSeller === true,
    isTrending: value.isTrending === true,
    isNewArrival: value.isNewArrival === true,
    isActive: value.isActive !== false,
    createdAt: String(value.createdAt ?? ''),
    updatedAt: String(value.updatedAt ?? '')
  };
}

function productPayload(payload: Partial<Product>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...payload };
  delete result.id;
  delete result.imageMetadata;
  delete result.createdAt;
  delete result.updatedAt;
  if (Array.isArray(payload.images)) {
    const metadata = new Map((payload.imageMetadata ?? []).map(image => [image.url, image]));
    result.images = payload.images.map(url => {
      const image = metadata.get(url);
      if (!image?.publicId) throw new ApiError('Upload each product image before saving.', 400, 'IMAGE_PUBLIC_ID_REQUIRED');
      return { url, publicId: image.publicId };
    });
  }
  return result;
}

export async function getMongoProducts(options: {
  token?: string;
  includeInactive?: boolean;
} = {}): Promise<Product[]> {
  const products: Product[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (options.includeInactive) params.set('includeInactive', 'true');
    if (cursor) params.set('cursor', cursor);
    const response = await request<Record<string, unknown>[]>(`/products?${params.toString()}`, options.token);
    products.push(...response.data.map(normalizeProduct));
    cursor = response.meta?.nextCursor ?? null;
  } while (cursor);
  return products;
}

export async function getMongoProduct(id: string, token: string): Promise<Product> {
  const response = await request<Record<string, unknown>>(`/products/${encodeURIComponent(id)}?admin=true`, token);
  return normalizeProduct(response.data);
}

export async function createMongoProduct(payload: Partial<Product>, token: string): Promise<Product> {
  const response = await request<Record<string, unknown>>('/products', token, {
    method: 'POST',
    body: JSON.stringify(productPayload(payload))
  });
  return normalizeProduct(response.data);
}

export async function updateMongoProduct(id: string, payload: Partial<Product>, token: string): Promise<Product> {
  const response = await request<Record<string, unknown>>(`/products/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(productPayload(payload))
  });
  return normalizeProduct(response.data);
}

export async function updateMongoProductStatus(id: string, isActive: boolean, token: string): Promise<Product> {
  const response = await request<Record<string, unknown>>(`/products/${encodeURIComponent(id)}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ isActive })
  });
  return normalizeProduct(response.data);
}

export async function archiveMongoProduct(id: string, token: string): Promise<void> {
  await request<{ id: string; archived: boolean }>(`/products/${encodeURIComponent(id)}`, token, {
    method: 'DELETE'
  });
}

export async function checkMongoBackendReadiness(): Promise<{ status: string; database?: string }> {
  const response = await request<{ status: string; database?: string }>('/health/ready', undefined, {}, false);
  return response.data;
}
