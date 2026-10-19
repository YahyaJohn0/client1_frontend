import type { CartItem } from './pricing.ts';

export interface GuestCheckoutForm {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  area?: string;
  notes?: string;
}

export interface ValidationErrors {
  fullName?: string;
  phone?: string;
  address?: string;
  city?: string;
  cart?: string;
}

export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  // Pakistani phone formats: 03XX XXXXXXX or +923XX XXXXXXX or 923XX XXXXXXX or general 10-12 digits
  const pkPhoneRegex = /^((\+92)|(92)|(0))?3[0-9]{9}$/;
  const generalRegex = /^[0-9]{10,13}$/;
  return pkPhoneRegex.test(cleanPhone) || generalRegex.test(cleanPhone);
}

export function validateGuestCheckout(
  form: GuestCheckoutForm,
  items: CartItem[]
): { isValid: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  if (!form.fullName || form.fullName.trim().length < 2) {
    errors.fullName = 'Please enter your full name (at least 2 characters).';
  }

  if (!form.phone || !validatePhoneNumber(form.phone)) {
    errors.phone = 'Please enter a valid mobile number (e.g., 0300 1234567).';
  }

  if (!form.address || form.address.trim().length < 5) {
    errors.address = 'Please enter a complete delivery address (street, house/flat #).';
  }

  if (!form.city || form.city.trim().length < 2) {
    errors.city = 'Please select or enter your city.';
  }

  if (!items || items.length === 0) {
    errors.cart = 'Your cart is empty. Add items before checking out.';
  } else {
    for (const item of items) {
      if (item.quantity <= 0) {
        errors.cart = `Invalid quantity for ${item.name}.`;
        break;
      }
      if (item.quantity > item.stock) {
        errors.cart = `Sorry, only ${item.stock} units available for ${item.name}.`;
        break;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}${random}`;
}
