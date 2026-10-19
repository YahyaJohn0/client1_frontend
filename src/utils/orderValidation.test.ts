import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhoneNumber,
  validateGuestCheckout,
  generateOrderNumber
} from './orderValidation.ts';
import type { CartItem } from './pricing.ts';

test('validatePhoneNumber accepts valid Pakistan phone variations', () => {
  assert.equal(validatePhoneNumber('03001234567'), true);
  assert.equal(validatePhoneNumber('+923001234567'), true);
  assert.equal(validatePhoneNumber('0333 4567890'), true);
  assert.equal(validatePhoneNumber('0312-3456789'), true);
  assert.equal(validatePhoneNumber('123'), false);
  assert.equal(validatePhoneNumber('abcd-efgh-ijk'), false);
});

test('validateGuestCheckout validates required address, phone, and stock limits', () => {
  const sampleItems: CartItem[] = [
    {
      id: '1',
      productId: 'p1',
      name: 'Curling Brush',
      price: 1500,
      quantity: 1,
      image: '/test.jpg',
      stock: 5
    }
  ];

  const validForm = {
    fullName: 'Fatima Ali',
    phone: '03001234567',
    address: 'House 42, Street 7, Gulberg III',
    city: 'Lahore'
  };

  const validResult = validateGuestCheckout(validForm, sampleItems);
  assert.equal(validResult.isValid, true);
  assert.equal(Object.keys(validResult.errors).length, 0);

  // Test missing name and invalid phone
  const invalidResult = validateGuestCheckout(
    { fullName: '', phone: 'abc', address: 'H 1', city: '' },
    sampleItems
  );
  assert.equal(invalidResult.isValid, false);
  assert.ok(invalidResult.errors.fullName);
  assert.ok(invalidResult.errors.phone);
  assert.ok(invalidResult.errors.address);
  assert.ok(invalidResult.errors.city);

  // Test stock overflow
  const overStockResult = validateGuestCheckout(validForm, [
    { ...sampleItems[0], quantity: 10 }
  ]);
  assert.equal(overStockResult.isValid, false);
  assert.match(overStockResult.errors.cart || '', /only 5 units available/);
});

test('generateOrderNumber returns consistent format', () => {
  const num1 = generateOrderNumber();
  const num2 = generateOrderNumber();
  assert.match(num1, /^ORD-[A-Z0-9]+$/);
  assert.notEqual(num1, num2);
});
