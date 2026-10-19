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

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  salePrice?: number;
  quantity: number;
  image: string;
  stock: number;
}

export interface PricingBreakdown {
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  total: number;
  isFreeShipping: boolean;
  appliedCoupon?: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    amountSaved: number;
  };
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const unitPrice = item.salePrice && item.salePrice > 0 ? item.salePrice : item.price;
    return sum + unitPrice * Math.max(0, item.quantity);
  }, 0);
}

export function validateCoupon(
  coupon: Coupon | null | undefined,
  subtotal: number
): { valid: boolean; error?: string } {
  if (!coupon) {
    return { valid: false, error: 'Coupon code not found' };
  }
  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, error: 'This coupon has expired' };
  }
  if (coupon.usageLimit && coupon.timesUsed >= coupon.usageLimit) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }
  if (coupon.minSpend && subtotal < coupon.minSpend) {
    return { valid: false, error: `Minimum order amount for this coupon is Rs. ${coupon.minSpend.toLocaleString()}` };
  }
  return { valid: true };
}

export function calculateDiscount(
  coupon: Coupon | null | undefined,
  subtotal: number
): number {
  if (!coupon) return 0;
  const validation = validateCoupon(coupon, subtotal);
  if (!validation.valid) return 0;

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((subtotal * coupon.discountValue) / 100);
  } else {
    discount = coupon.discountValue;
  }

  if (coupon.maxDiscount && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
  }

  return Math.min(discount, subtotal);
}

export function calculateShippingFee(
  subtotalAfterDiscount: number,
  standardFee: number = 200,
  freeShippingThreshold: number = 3000
): { fee: number; isFree: boolean } {
  if (subtotalAfterDiscount <= 0) {
    return { fee: 0, isFree: false };
  }
  if (subtotalAfterDiscount >= freeShippingThreshold) {
    return { fee: 0, isFree: true };
  }
  return { fee: standardFee, isFree: false };
}

export function calculateOrderPricing(
  items: CartItem[],
  coupon?: Coupon | null,
  shippingSettings?: { standardFee: number; freeShippingThreshold: number }
): PricingBreakdown {
  const subtotal = calculateSubtotal(items);
  const discountAmount = calculateDiscount(coupon, subtotal);
  const standardFee = shippingSettings?.standardFee ?? 200;
  const freeThreshold = shippingSettings?.freeShippingThreshold ?? 3000;
  
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const { fee: shippingFee, isFree: isFreeShipping } = calculateShippingFee(
    subtotalAfterDiscount,
    standardFee,
    freeThreshold
  );

  const total = subtotalAfterDiscount + shippingFee;

  return {
    subtotal,
    discountAmount,
    shippingFee,
    total,
    isFreeShipping,
    appliedCoupon: discountAmount > 0 && coupon ? {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      amountSaved: discountAmount,
    } : undefined
  };
}

export function formatPKR(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}
