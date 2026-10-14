import type { AdminSettings, HelplineSetting, PortalSetting } from '@nhis/shared-types';

/* Client-side checks that mirror the server. They give quick feedback; the server remains the authority. */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password12345', 'passw0rd1234',
  'qwertyuiop12', 'qwertyuiopasdf', 'qwerty123456', 'qwertyuiop123', 'asdfghjkl123', 'letmein12345',
  'welcome12345', 'welcome123456', 'admin1234567', 'administrator', 'administrator1', 'changeme1234', 'changemenow1',
  '123456789012', '1234567890123', '111111111111', '000000000000', 'abcdefghijkl', 'iloveyou1234',
  'tnhis1234567', 'tnhis@123456', 'tamilnadu1234', 'tamilnadu@123', 'nhis12345678', 'monkey123456',
]);

export const PASSWORD_HINT = `Use at least ${PASSWORD_MIN_LENGTH} characters. Avoid your email address, your name and common passwords.`;

export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter an email address.';
  if (trimmed.length > 254 || !EMAIL_SHAPE.test(trimmed)) return 'Enter a valid email address, for example name@example.com.';
  return undefined;
}

export interface LoginFieldErrors { email?: string; password?: string }

/** Required fields and email shape only. Says nothing about whether the credentials match. */
export function validateLoginForm(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmed = email.trim();
  if (!trimmed) errors.email = 'Enter your email address.';
  else if (!EMAIL_SHAPE.test(trimmed)) errors.email = 'Enter a valid email address, for example name@example.com.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

/** Problems with a proposed password (empty array when acceptable), mirroring the server policy. */
export function passwordProblems(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`);
  const normalised = password.trim().toLowerCase();
  const email = context.email?.trim().toLowerCase();
  const name = context.name?.trim().toLowerCase();
  if (email && (normalised === email || normalised === email.split('@')[0])) problems.push('Password must not be the same as the email address.');
  if (name && normalised === name) problems.push('Password must not be the same as the name.');
  if (COMMON_PASSWORDS.has(normalised)) problems.push('Password is too common.');
  if (password.length > 0 && new Set(password).size === 1) problems.push('Password must not repeat a single character.');
  return problems;
}

export function validateName(value: string, label = 'Name'): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `Enter the ${label.toLowerCase()}.`;
  if (trimmed.length > 120) return `${label} must be 120 characters or fewer.`;
  if (CONTROL_CHARS.test(value)) return `${label} contains characters that are not allowed.`;
  return undefined;
}

/** True for `https:` URLs with a dotted host and no embedded credentials. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateHttpsUrl(value: string, label = 'Web address'): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `Enter the ${label.toLowerCase()}.`;
  if (trimmed.length > 500) return `${label} must be 500 characters or fewer.`;
  if (!isHttpsUrl(trimmed)) return `${label} must be a full address starting with https://`;
  return undefined;
}

const PHONE_SHAPE = /^\+?[0-9][0-9 ()-]*$/;

/** `tel:` link for a displayed number: digits only, with a leading + kept. */
export function telHrefFor(number: string): string {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

export function validateHelplineNumber(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter the helpline number.';
  if (trimmed.length > 30 || !PHONE_SHAPE.test(trimmed)) return 'Use digits, spaces, hyphens and brackets only (a leading + is allowed).';
  const digits = trimmed.replace(/\D/g, '').length;
  if (digits < 3 || digits > 15) return 'The number must have between 3 and 15 digits.';
  return undefined;
}

function required(value: string, label: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `Enter ${label}.`;
  if (trimmed.length > max) return `${label.charAt(0).toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`;
  if (CONTROL_CHARS.test(value)) return 'This text contains characters that are not allowed.';
  return undefined;
}

export type FieldErrors = Record<string, string>;

/** Validates the whole settings form. Keys are field paths such as `helplines.0.number`. */
export function validateSettings(values: AdminSettings): FieldErrors {
  const errors: FieldErrors = {};
  const set = (key: string, message: string | undefined) => { if (message) errors[key] = message; };
  set('schemeNameEn', required(values.schemeNameEn, 'the scheme name in English', 200));
  set('schemeNameTa', required(values.schemeNameTa, 'the scheme name in Tamil', 400));
  set('coverageStatementEn', required(values.coverageStatementEn, 'the coverage statement in English', 1000));
  set('coverageStatementTa', required(values.coverageStatementTa, 'the coverage statement in Tamil', 2000));
  set('availability', required(values.availability, 'the availability text', 200));
  values.helplines.forEach((h: HelplineSetting, i) => {
    set(`helplines.${i}.labelEn`, required(h.labelEn, 'a label in English', 120));
    set(`helplines.${i}.labelTa`, required(h.labelTa, 'a label in Tamil', 240));
    set(`helplines.${i}.number`, validateHelplineNumber(h.number));
  });
  values.portals.forEach((p: PortalSetting, i) => {
    set(`portals.${i}.label`, required(p.label, 'a label in English', 120));
    set(`portals.${i}.labelTa`, required(p.labelTa, 'a label in Tamil', 240));
    set(`portals.${i}.href`, validateHttpsUrl(p.href, 'Link address'));
  });
  if (values.helplines.length > 20) errors.helplines = 'Add no more than 20 helplines.';
  if (values.portals.length > 20) errors.portals = 'Add no more than 20 portal links.';
  return errors;
}

/** Message shown when sign-in is rate limited. */
export function retryMessage(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return 'Too many attempts. Try again in a few minutes.';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

const MAP_HOSTS = ['maps.google.com', 'www.google.com', 'google.com'];

/** https Google Maps link (the same rule the server applies to hospital map links). */
export function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MAP_HOSTS.includes(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}
