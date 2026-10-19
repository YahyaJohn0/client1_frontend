export interface ProductImageMeta {
  url: string;
  publicId?: string;
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  shortDescription?: string;
  categoryId: string;
  price: number;
  salePrice?: number;
  stock: number;
  images: string[];
  imageMetadata?: ProductImageMeta[];
  isFeatured: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image?: string;
  displayOrder: number;
  isActive: boolean;
}

export type OrderStatus = 
  | 'placed'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  sku?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    area?: string;
    notes?: string;
  };
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  paymentMethod: 'COD';
  paymentStatus: 'pending' | 'paid' | 'cancelled';
  fulfillmentStatus: OrderStatus;
  statusHistory: Array<{
    status: OrderStatus;
    timestamp: string;
    note?: string;
  }>;
  trackingNumber?: string;
  courierName?: string;
  cancelReason?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minSpend?: number;
  maxDiscount?: number;
  usageLimit?: number;
  timesUsed: number;
  expiresAt?: string;
  isActive: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  badgeText?: string;
  imageUrl: string;
  linkUrl: string;
  ctaText: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  logoUrl?: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  currency: string;
  standardShippingFee: number;
  freeShippingThreshold: number;
  returnPolicy: string;
  deliveryPolicy: string;
  aboutText: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'order_deduction' | 'order_cancellation_restock' | 'manual_adjustment' | 'restock';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string;
  timestamp: string;
  performedBy: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  performedBy: string;
  timestamp: string;
}

export interface DashboardReports {
  totalOrders: number;
  placedOrders: number;
  confirmedOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  grossSales: number;
  completedSales: number;
  lowStockProducts: Product[];
  outOfStockProducts: Product[];
  topSellingProducts: Array<{ id: string; name: string; quantity: number; revenue: number }>;
}
