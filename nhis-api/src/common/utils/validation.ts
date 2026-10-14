import { ValidationError } from './errors';

/** Parses a strictly positive integer query value (digits only). `null` returns the fallback. */
export function parsePositiveInt(raw: string | null, name: string, fallback: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new ValidationError(`${name} must be a positive integer`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ValidationError(`${name} is out of range`);
  return n;
}

/** Returns the value when it is one of `allowed`; `null`/empty returns undefined (filter not applied). */
export function parseEnum<T extends string>(raw: string | null, allowed: readonly T[], name: string): T | undefined {
  if (raw === null || raw === '') return undefined;
  if (!(allowed as readonly string[]).includes(raw)) throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  return raw as T;
}

/** Returns the value (or '' when absent) after enforcing a maximum length. */
export function parseBoundedString(raw: string | null, name: string, maxLength: number): string {
  const value = raw ?? '';
  if (value.length > maxLength) throw new ValidationError(`${name} is too long`);
  return value;
}

/** Path parameters: lowercase letters, digits and hyphens only. */
export function parseSlugParam(raw: string, name: string, maxLength = 80): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) || raw.length > maxLength) throw new ValidationError(`${name} is not a valid identifier`);
  return raw;
}

/** Record ids (imported ids such as `go-employee-71` and generated ids such as `doc_cl9x...`): letters, digits, `_` and `-`. */
export function parseIdParam(raw: string, name: string, maxLength = 100): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw) || raw.length > maxLength) throw new ValidationError(`${name} is not a valid identifier`);
  return raw;
}
