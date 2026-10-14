import type { Readable } from 'node:stream';

/** Canonical extensions the storage layer ever writes. */
export type StoredExtension = 'pdf' | 'jpg' | 'png' | 'webp';

export interface StoredObject {
  /** Random storage key (`<32 hex>.<ext>`). Never derived from a user supplied name. */
  key: string;
  bytes: number;
  sha256: string;
}

/**
 * Storage backend. The local-disk implementation is the only one today; an S3 / Azure Blob adapter can implement
 * this interface and be selected through FILE_STORAGE_DRIVER without changing callers.
 */
export interface StorageAdapter {
  /** Stores the bytes under a freshly generated random key. */
  put(data: Uint8Array, extension: StoredExtension): Promise<StoredObject>;
  /** Streams the object. Rejects with `StorageNotFoundError` when it does not exist and `InvalidStorageKeyError` for an unsafe key. */
  get(key: string): Promise<Readable>;
  /** Removes the object. Missing objects are not an error. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Invalid storage key');
    this.name = 'InvalidStorageKeyError';
  }
}

export class StorageNotFoundError extends Error {
  constructor() {
    super('Stored file not found');
    this.name = 'StorageNotFoundError';
  }
}
