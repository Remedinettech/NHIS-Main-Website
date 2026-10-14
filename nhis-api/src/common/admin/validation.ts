import type { AdminFieldError } from '@nhis/shared-types';
import { adminConfig } from './config';
import { AdminHttpError, invalid } from './errors';

/* ------------------------------------------------------------------ body reader */

/** Rejects ASCII control characters (C0 except TAB/LF/CR when allowed, DEL, C1) and unpaired surrogates. */
const CONTROL_STRICT = /[\u0000-\u001F\u007F-\u009F]/;
const CONTROL_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function hasControlChars(value: string, allowNewlines = false): boolean {
  return (allowNewlines ? CONTROL_MULTILINE : CONTROL_STRICT).test(value) || LONE_SURROGATE.test(value);
}

/**
 * Reads a bounded JSON object body. 415 is not used; wrong content-type, oversize, malformed or non-object bodies are
 * 400 INVALID (413-style limits are reported as INVALID too so the error contract stays small).
 */
export async function readJsonBody(request: Request, maxBytes = adminConfig().maxBodyBytes): Promise<Record<string, unknown>> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) throw invalid('Content-Type must be application/json.');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw invalid('Request body is too large.');
  if (!request.body) throw invalid('Request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw invalid('Request body is too large.');
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw invalid('Request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid('Request body must be a JSON object.');
  return parsed as Record<string, unknown>;
}

/* ------------------------------------------------------------------ field validator */

export interface StringOptions {
  min?: number;
  max: number;
  /** Absent/null/'' is accepted and returned as undefined. */
  optional?: boolean;
  /** Allow LF/CR/TAB (textarea fields). */
  multiline?: boolean;
  /** Keep the value as sent instead of trimming. Default false (trim). */
  keepWhitespace?: boolean;
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/**
 * Collects field errors; call `done()` (or `throwIfInvalid()`) once to get a 400 INVALID with `details`.
 * Every checker returns the cleaned value, or undefined after recording an error.
 */
export class Validator {
  readonly errors: AdminFieldError[] = [];

  constructor(private readonly prefix = '') {}

  private path(field: string): string {
    return [this.prefix, field].filter(Boolean).join('.');
  }

  fail(field: string, message: string): undefined {
    this.errors.push({ field: this.path(field), message });
    return undefined;
  }

  /** Child validator that shares this one's error list (for nested objects / array items). */
  child(field: string): Validator {
    const c = new Validator(this.path(field));
    (c as { errors: AdminFieldError[] }).errors = this.errors;
    return c;
  }

  object(value: unknown, field: string): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return this.fail(field, 'Must be an object.');
    return value as Record<string, unknown>;
  }

  /** Rejects keys not in `allowed` (strict bodies). */
  noUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[]): void {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) this.fail(key, 'Unknown field.');
  }

  string(value: unknown, field: string, options: StringOptions): string | undefined {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '' && options.optional)) {
      if (options.optional) return undefined;
      return this.fail(field, 'This field is required.');
    }
    if (typeof value !== 'string') return this.fail(field, 'Must be a string.');
    const text = options.keepWhitespace ? value : value.trim();
    const min = options.min ?? (options.optional ? 0 : 1);
    if (text.length < min) return this.fail(field, min <= 1 ? 'This field is required.' : `Must be at least ${min} characters.`);
    if (text.length > options.max) return this.fail(field, `Must be at most ${options.max} characters.`);
    if (hasControlChars(text, options.multiline)) return this.fail(field, 'Contains invalid control characters.');
    return text;
  }

  email(value: unknown, field: string, optional = false): string | undefined {
    const text = this.string(value, field, { max: 254, optional });
    if (text === undefined) return undefined;
    if (!EMAIL_RE.test(text) || text.includes('..')) return this.fail(field, 'Must be a valid email address.');
    return text.toLowerCase();
  }

  enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[], optional = false): T | undefined {
    if (value === undefined || value === null) return optional ? undefined : this.fail(field, 'This field is required.');
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) return this.fail(field, `Must be one of: ${allowed.join(', ')}.`);
    return value as T;
  }

  int(value: unknown, field: string, min: number, max: number, optional = false): number | undefined {
    if (value === undefined || value === null) return optional ? undefined : this.fail(field, 'This field is required.');
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) return this.fail(field, 'Must be an integer.');
    if (value < min || value > max) return this.fail(field, `Must be between ${min} and ${max}.`);
    return value;
  }

  boolean(value: unknown, field: string, optional = false): boolean | undefined {
    if (value === undefined || value === null) return optional ? undefined : this.fail(field, 'This field is required.');
    if (typeof value !== 'boolean') return this.fail(field, 'Must be true or false.');
    return value;
  }

  /** URL with an allowed scheme (default https only), no credentials, no control chars; optional host allow-list. */
  url(value: unknown, field: string, options: { schemes?: readonly string[]; max?: number; optional?: boolean; hosts?: readonly string[] } = {}): string | undefined {
    const text = this.string(value, field, { max: options.max ?? 2048, optional: options.optional });
    if (text === undefined) return undefined;
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      return this.fail(field, 'Must be a valid URL.');
    }
    const schemes = options.schemes ?? ['https:'];
    if (!schemes.includes(parsed.protocol)) return this.fail(field, `Must use ${schemes.map((s) => s.replace(':', '')).join(' or ')}.`);
    if (parsed.username || parsed.password) return this.fail(field, 'Must not contain credentials.');
    if (options.hosts && !options.hosts.includes(parsed.hostname.toLowerCase())) return this.fail(field, 'Host is not allowed.');
    return text;
  }

  array(value: unknown, field: string, maxItems: number, optional = false): unknown[] | undefined {
    if (value === undefined || value === null) return optional ? undefined : this.fail(field, 'This field is required.');
    if (!Array.isArray(value)) return this.fail(field, 'Must be a list.');
    if (value.length > maxItems) return this.fail(field, `At most ${maxItems} items are allowed.`);
    return value;
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }

  throwIfInvalid(message = 'Some fields are invalid.'): void {
    if (this.errors.length > 0) throw new AdminHttpError('INVALID', message, { details: [...this.errors] });
  }
}

/* ------------------------------------------------------------------ paging, ids, versions */

export interface Paging { page: number; pageSize: number; skip: number }

/** `page` >= 1, `pageSize` 1..maxPageSize. Bad values are 400 INVALID. */
export function parsePaging(params: URLSearchParams, defaultPageSize = 25, maxPageSize = 100): Paging {
  const v = new Validator();
  const num = (name: string, fallback: number, max: number) => {
    const raw = params.get(name);
    if (raw === null || raw === '') return fallback;
    if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
      v.fail(name, `Must be an integer between 1 and ${max}.`);
      return fallback;
    }
    return Number(raw);
  };
  const page = num('page', 1, 1_000_000);
  const pageSize = num('pageSize', defaultPageSize, maxPageSize);
  v.throwIfInvalid('Invalid query parameters.');
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function pagedResponse<T>(data: T[], total: number, paging: Paging) {
  return { data, total, page: paging.page, pageSize: paging.pageSize, totalPages: Math.max(1, Math.ceil(total / paging.pageSize)) };
}

/** Optional string query parameter with a length cap (control characters rejected). */
export function queryString(params: URLSearchParams, name: string, max: number): string | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const v = new Validator();
  const value = v.string(raw, name, { max });
  v.throwIfInvalid('Invalid query parameters.');
  return value;
}

export function queryEnum<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T | undefined {
  const raw = params.get(name);
  if (raw === null || raw === '') return undefined;
  const v = new Validator();
  const value = v.enumValue(raw, name, allowed);
  v.throwIfInvalid('Invalid query parameters.');
  return value;
}

/** Path ids (cuid, `doc_...`, `nhis-snapshot-row-12`, slugs): letters, digits, `-` and `_` only. */
export function parseIdParam(raw: string, name = 'id'): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(raw)) throw invalid(`${name} is not a valid identifier.`);
  return raw;
}

/** `expectedVersion` (integer >= 0) from a request body. */
export function parseExpectedVersion(body: Record<string, unknown>): number {
  const v = new Validator();
  const version = v.int(body.expectedVersion, 'expectedVersion', 0, 2_000_000_000);
  v.throwIfInvalid();
  return version as number;
}
