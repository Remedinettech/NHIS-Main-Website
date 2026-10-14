import { loadStorageConfig } from '../../config/storage';
import { LocalStorageAdapter } from './local-storage.adapter';
import type { StorageAdapter } from './storage.types';

export * from './storage.types';
export * from './file-validation';
export { LocalStorageAdapter, isValidStorageKey } from './local-storage.adapter';

/** Creates the adapter selected by FILE_STORAGE_DRIVER (read when called, so tests can change the environment). */
export function createStorageAdapter(env: Record<string, string | undefined> = process.env): StorageAdapter {
  const config = loadStorageConfig(env);
  return new LocalStorageAdapter(config.rootDir);
}

let shared: StorageAdapter | undefined;
/** Process-wide adapter for route handlers. */
export function getStorage(): StorageAdapter {
  shared ??= createStorageAdapter();
  return shared;
}
/** Test hook: forget the cached adapter after changing FILE_STORAGE_DIR. */
export function resetStorageForTests(): void {
  shared = undefined;
}
