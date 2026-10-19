import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSubtotal,
  validateCoupon,
  calculateDiscount,
  calculateShippingFee,
  calculateOrderPricing,
  formatPKR,
  type CartItem,
  type Coupon
} from './pricing.ts';

test('calculateSubtotal sums regular and sale prices correctly', () => {
  const items: CartItem[] = [
    {
      id: '1',
      productId: 'p1',
      name: 'Rose Gold Styling Brush',
      price: 1500,
      salePrice: 1200,
      quantity: 2,
      image: '/test.jpg',
      stock: 10
    },
    {
      id: '2',
      productId: 'p2',
      name: 'Acrylic Cosmetic Organizer',
      price: 2400,
      quantity: 1,
      image: '/test2.jpg',
      stock: 5
    }
  ];

  // (1200 * 2) + (2400 * 1) = 2400 + 2400 = 4800
  assert.equal(calculateSubtotal(items), 4800);
});

test('validateCoupon checks expiry, usage limit, and minimum spend', () => {
  const expiredCoupon: Coupon = {
    id: 'c1',
    code: 'EXPIRED10',
    discountType: 'percentage',
    discountValue: 10,
    timesUsed: 0,
    isActive: true,
    expiresAt: '2020-01-01T00:00:00.000Z'
  };

  const activeCoupon: Coupon = {
    id: 'c2',
    code: 'SAVE15',
    discountType: 'percentage',
    discountValue: 15,
    minSpend: 2000,
    timesUsed: 5,
    usageLimit: 100,
    isActive: true
  };

  assert.equal(validateCoupon(expiredCoupon, 5000).valid, false);
  assert.equal(validateCoupon(activeCoupon, 1500).valid, false); // below min spend
  assert.equal(validateCoupon(activeCoupon, 2500).valid, true);
});

test('calculateDiscount applies percentage discount with cap correctly', () => {
  const coupon: Coupon = {
    id: 'c3',
    code: 'MEGA20',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscount: 500,
    timesUsed: 0,
    isActive: true
  };

  // 20% of 4000 is 800, capped at maxDiscount 500
  assert.equal(calculateDiscount(coupon, 4000), 500);

  // 20% of 1000 is 200 (under 500 cap)
  assert.equal(calculateDiscount(coupon, 1000), 200);
});

test('calculateShippingFee grants free shipping above threshold', () => {
  assert.deepEqual(calculateShippingFee(2500, 200, 3000), { fee: 200, isFree: false });
  assert.deepEqual(calculateShippingFee(3500, 200, 3000), { fee: 0, isFree: true });
  assert.deepEqual(calculateShippingFee(0, 200, 3000), { fee: 0, isFree: false });
});

test('calculateOrderPricing integrates items, discounts and shipping', () => {
  const items: CartItem[] = [
    {
      id: '1',
      productId: 'p1',
      name: 'Paddle Brush',
      price: 1500,
      quantity: 2, // 3000
      image: '/test.jpg',
      stock: 5
    }
  ];

  const coupon: Coupon = {
    id: 'c4',
    code: 'FLAT500',
    discountType: 'fixed',
    discountValue: 500,
    timesUsed: 0,
    isActive: true
  };

  // Subtotal = 3000. Discount = 500. Subtotal after discount = 2500.
  // Standard fee = 200 (since 2500 < 3000 free threshold).
  // Total = 2500 + 200 = 2700.
  const pricing = calculateOrderPricing(items, coupon, { standardFee: 200, freeShippingThreshold: 3000 });
  assert.equal(pricing.subtotal, 3000);
  assert.equal(pricing.discountAmount, 500);
  assert.equal(pricing.shippingFee, 200);
  assert.equal(pricing.total, 2700);
  assert.equal(pricing.isFreeShipping, false);
});

test('formatPKR formats currency cleanly', () => {
  assert.equal(formatPKR(1500), 'Rs. 1,500');
});
