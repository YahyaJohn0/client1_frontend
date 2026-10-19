/**
 * Administrator password policy shared by the API server, the admin panel and
 * the recovery CLI. Keep this module free of browser/Node-specific imports so
 * it can run in every environment.
 */

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export interface PasswordPolicyContext {
  /** The password being replaced, when available. */
  currentPassword?: string;
  /** Administrator username or email, used to reject passwords containing it. */
  identifier?: string;
}

export interface PasswordPolicyChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
  notCommon: boolean;
  notReused: boolean;
  notIdentifier: boolean;
  noEdgeWhitespace: boolean;
}

export interface PasswordPolicyResult {
  ok: boolean;
  errors: string[];
  /** 0 (very weak) to 4 (very strong), suitable for a strength meter. */
  score: number;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  checks: PasswordPolicyChecks;
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  'admin',
  'admin1',
  'admin12',
  'admin123',
  'admin1234',
  'administrator',
  'letmein',
  'letmein123',
  'welcome',
  'welcome1',
  'welcome123',
  'changeme',
  'changeme123',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'abc123',
  'abc12345',
  '12345678',
  '123456789',
  '1234567890',
  'iloveyou',
  'monkey',
  'dragon',
  'zamzam',
  'zamzam123',
  'store123',
  'shopadmin'
]);

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Validates a new administrator password.
 *
 * Policy: at least 12 characters, at least three of the four character classes
 * (lower, upper, digit, symbol) or 20+ characters for passphrases, not a known
 * common password, not the current password and not derived from the account
 * identifier.
 */
export function validatePasswordStrength(
  password: string,
  context: PasswordPolicyContext = {}
): PasswordPolicyResult {
  const value = typeof password === 'string' ? password : '';
  const lower = /[a-z]/.test(value);
  const upper = /[A-Z]/.test(value);
  const digit = /[0-9]/.test(value);
  const symbol = /[^A-Za-z0-9]/.test(value);
  const classCount = [lower, upper, digit, symbol].filter(Boolean).length;

  const normalized = normalizeForComparison(value);
  const notCommon = value.length > 0 && !COMMON_PASSWORDS.has(normalized);

  const notReused =
    !context.currentPassword ||
    (value !== context.currentPassword &&
      normalizeForComparison(value) !== normalizeForComparison(context.currentPassword));

  const identifier = (context.identifier || '').trim().toLowerCase();
  const identifierToken = identifier.includes('@') ? identifier.split('@')[0] : identifier;
  const notIdentifier =
    identifierToken.length < 3 || !normalizeForComparison(value).includes(normalizeForComparison(identifierToken));

  const noEdgeWhitespace = value.length > 0 && value.trim() === value;
  const lengthOk = value.length >= MIN_ADMIN_PASSWORD_LENGTH;
  const lengthWithinLimit = value.length <= MAX_ADMIN_PASSWORD_LENGTH;
  const classesOk = classCount >= 3 || value.length >= 20;

  const checks: PasswordPolicyChecks = {
    length: lengthOk && lengthWithinLimit,
    lower,
    upper,
    digit,
    symbol,
    notCommon,
    notReused,
    notIdentifier,
    noEdgeWhitespace
  };

  const errors: string[] = [];
  if (!lengthOk) {
    errors.push(`Use at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`);
  }
  if (!lengthWithinLimit) {
    errors.push(`Use no more than ${MAX_ADMIN_PASSWORD_LENGTH} characters.`);
  }
  if (!classesOk) {
    errors.push('Mix upper-case, lower-case, numbers and symbols (three of the four), or use 20+ characters.');
  }
  if (!notCommon) {
    errors.push('This password is too common. Choose something unique.');
  }
  if (!notReused) {
    errors.push('The new password must be different from the current password.');
  }
  if (!notIdentifier) {
    errors.push('The password must not contain your username or email name.');
  }
  if (!noEdgeWhitespace) {
    errors.push('The password must not start or end with whitespace.');
  }

  let score = 0;
  if (value.length >= MIN_ADMIN_PASSWORD_LENGTH) score += 1;
  if (classCount >= 3) score += 1;
  if (value.length >= 16) score += 1;
  if (value.length >= 20 || (classCount === 4 && value.length >= 14)) score += 1;
  if (errors.length > 0) score = Math.min(score, 1);
  score = Math.max(0, Math.min(4, score));

  const labels: PasswordPolicyResult['label'][] = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

  return {
    ok: errors.length === 0,
    errors,
    score,
    label: labels[score],
    checks
  };
}
