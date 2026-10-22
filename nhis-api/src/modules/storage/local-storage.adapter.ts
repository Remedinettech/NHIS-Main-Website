import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { InvalidStorageKeyError, StorageNotFoundError, type StorageAdapter, type StoredExtension, type StoredObject } from './storage.types';

const KEY_PATTERN = /^[a-f0-9]{32}\.(?:pdf|jpg|png|webp|mp4)$/;
const EXTENSIONS: readonly StoredExtension[] = ['pdf', 'jpg', 'png', 'webp', 'mp4'];

export const isValidStorageKey = (key: unknown): key is string => typeof key === 'string' && KEY_PATTERN.test(key);

export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /**
   * Maps a key to an absolute path. Only keys of the exact generated form are accepted (no separators, dots or
   * traversal sequences can pass the pattern) and the resolved path is verified to stay inside the root.
   */
  resolveKey(key: string): string {
    if (!isValidStorageKey(key)) throw new InvalidStorageKeyError();
    const full = path.resolve(this.root, key);
    const relative = path.relative(this.root, full);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new InvalidStorageKeyError();
    if (path.dirname(full) !== this.root) throw new InvalidStorageKeyError();
    return full;
  }

  async put(data: Uint8Array, extension: StoredExtension): Promise<StoredObject> {
    if (!EXTENSIONS.includes(extension)) throw new InvalidStorageKeyError();
    await fsp.mkdir(this.root, { recursive: true });
    const key = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
    const target = this.resolveKey(key);
    const temp = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      // 'wx' refuses to overwrite: a (practically impossible) key collision fails instead of replacing a file.
      await fsp.writeFile(temp, data, { flag: 'wx', mode: 0o640 });
      await fsp.link(temp, target); // atomic and fails if the target exists
    } finally {
      await fsp.rm(temp, { force: true });
    }
    return { key, bytes: data.byteLength, sha256: crypto.createHash('sha256').update(data).digest('hex') };
  }

  async get(key: string, range?: { start: number; end: number }): Promise<Readable> {
    const file = this.resolveKey(key);
    try {
      await fsp.access(file, fs.constants.R_OK);
    } catch {
      throw new StorageNotFoundError();
    }
    return fs.createReadStream(file, range);
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await fsp.stat(this.resolveKey(key))).isFile();
    } catch (error) {
      if (error instanceof InvalidStorageKeyError) throw error;
      return false;
    }
  }
}
