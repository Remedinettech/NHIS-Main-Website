import argon2 from 'argon2';
import { generateToken } from './tokens';
import { invalid } from './errors';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

const DENY_LIST = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password12345', 'passw0rd1234',
  'qwertyuiop12', 'qwertyuiopasdf', 'qwerty123456', 'qwertyuiop123', 'asdfghjkl123', 'letmein12345',
  'welcome12345', 'welcome123456', 'admin1234567', 'administrator', 'administrator1', 'changeme1234', 'changemenow1',
  '123456789012', '1234567890123', '111111111111', '000000000000', 'abcdefghijkl', 'iloveyou1234',
  'tnhis1234567', 'tnhis@123456', 'tamilnadu1234', 'tamilnadu@123', 'nhis12345678', 'monkey123456',
]);

export interface PasswordContext { email?: string; name?: string }

/** Returns human-readable problems; an empty array means the password is acceptable. */
export function validatePasswordPolicy(password: unknown, context: PasswordContext = {}): string[] {
  if (typeof password !== 'string') return ['Password is required.'];
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`);
  const normalized = password.trim().toLowerCase();
  const email = context.email?.trim().toLowerCase();
  const name = context.name?.trim().toLowerCase();
  if (email && (normalized === email || normalized === email.split('@')[0])) problems.push('Password must not be the same as the email address.');
  if (name && normalized === name) problems.push('Password must not be the same as the name.');
  if (DENY_LIST.has(normalized)) problems.push('Password is too common.');
  if (password.length > 0 && new Set(password).size === 1) problems.push('Password must not repeat a single character.');
  return problems;
}

/** Throws a 400 INVALID with a field error on `field` when the policy is not met. */
export function assertPasswordPolicy(password: unknown, context: PasswordContext = {}, field = 'password'): string {
  const problems = validatePasswordPolicy(password, context);
  if (problems.length > 0) throw invalid('The password does not meet the password policy.', problems.map((message) => ({ field, message })));
  return password as string;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** False for malformed hashes as well as wrong passwords; never throws. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash);
  } catch {
    return true;
  }
}

let dummyHash: Promise<string> | null = null;

/** Spends the same time as a real verification (used when the account does not exist or is inactive). Always false. */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword(generateToken(24));
  await verifyPassword(await dummyHash, password);
  return false;
}
