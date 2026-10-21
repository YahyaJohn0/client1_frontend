import type { OrderStatus } from '../types/store.ts';

export { ApiError } from './apiErrors.ts';
export { api } from './firebaseStoreApi.ts';

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
