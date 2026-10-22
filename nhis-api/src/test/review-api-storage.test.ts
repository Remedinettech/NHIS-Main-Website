/**
 * Resumed security review: path safety of the local storage adapter (the only code that touches the upload folder). No
 * database needed. Keys are random names of the generated form; nothing a client sends becomes part of a path.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InvalidStorageKeyError, LocalStorageAdapter, StorageNotFoundError, isValidStorageKey, type StoredExtension } from '../modules/storage';

let workDir: string;
let root: string;
let outside: string;
let adapter: LocalStorageAdapter;

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhis-review-storage-'));
  root = path.join(workDir, 'uploads');
  outside = path.join(workDir, 'outside-secret.pdf');
  fs.mkdirSync(root);
  fs.writeFileSync(outside, 'secret outside the upload folder');
  fs.writeFileSync(path.join(workDir, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'), 'sibling of the upload folder with a valid-looking name');
  adapter = new LocalStorageAdapter(root);
});
after(() => fs.rmSync(workDir, { recursive: true, force: true }));

const HEX = 'a'.repeat(32);
const hostileKeys = (): string[] => [
  '../outside-secret.pdf', `../${HEX}.pdf`, `..\\${HEX}.pdf`, `/${HEX}.pdf`, `${root}/${HEX}.pdf`, `C:\\${HEX}.pdf`, `C:/${HEX}.pdf`,
  `sub/${HEX}.pdf`, `${HEX}.pdf/`, `${HEX}.pdf/..`, `./${HEX}.pdf`, `${HEX}.PDF`, `${HEX.toUpperCase()}.pdf`, `${HEX}.pdf.tmp`, `${HEX}.exe`, `${HEX}.html`, `${HEX}.svg`,
  `${HEX}`, `${HEX}.`, `.${HEX}.pdf`, `${HEX.slice(1)}.pdf`, `${HEX}a.pdf`, `${HEX}.pdf\0.png`, `${HEX}.pdf\n`, ` ${HEX}.pdf`, `${HEX}.pdf `, `%2e%2e%2f${HEX}.pdf`, `${HEX}.pdf::$DATA`,
  '', '.', '..', 'CON', 'nul.pdf', `${HEX}.pdf.`, `${HEX}.mp4.pdf`,
];

describe('keys', () => {
  test('only <32 lower-case hex>.<pdf|jpg|png|webp|mp4> is a key; everything else is refused before any file system call', async () => {
    for (const key of hostileKeys()) {
      assert.equal(isValidStorageKey(key), false, JSON.stringify(key));
      assert.throws(() => adapter.resolveKey(key), InvalidStorageKeyError, JSON.stringify(key));
      await assert.rejects(adapter.get(key), InvalidStorageKeyError, `get ${JSON.stringify(key)}`);
      await assert.rejects(adapter.delete(key), InvalidStorageKeyError, `delete ${JSON.stringify(key)}`);
      await assert.rejects(adapter.exists(key), InvalidStorageKeyError, `exists ${JSON.stringify(key)}`);
    }
    for (const value of [undefined, null, 5, {}, [], ['a'], Symbol('x')]) assert.equal(isValidStorageKey(value), false);
    for (const extension of ['pdf', 'jpg', 'png', 'webp', 'mp4']) assert.equal(isValidStorageKey(`${HEX}.${extension}`), true, extension);
  });

  test('a refused delete never removes a file outside the folder or a sibling with a valid-looking name', async () => {
    for (const key of [`../${HEX}.pdf`, '../outside-secret.pdf', `${root}/../outside-secret.pdf`]) await assert.rejects(adapter.delete(key), InvalidStorageKeyError);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'secret outside the upload folder');
    assert.ok(fs.existsSync(path.join(workDir, `${HEX}.pdf`)));
    assert.deepEqual(fs.readdirSync(root), []);
  });

  test('every resolved path is a direct child of the folder', () => {
    for (const extension of ['pdf', 'jpg', 'png', 'webp', 'mp4']) {
      const resolved = adapter.resolveKey(`${'0123456789abcdef'.repeat(2)}.${extension}`);
      assert.equal(path.dirname(resolved), path.resolve(root));
    }
  });
});

describe('put, get, exists, delete', () => {
  test('put writes under a fresh random key with the requested extension only, never overwrites, and leaves no temporary file', async () => {
    const data = Buffer.from('%PDF-1.4\nhello');
    const stored = await adapter.put(data, 'pdf');
    assert.match(stored.key, /^[a-f0-9]{32}\.pdf$/);
    assert.equal(stored.bytes, data.length);
    assert.equal(fs.readFileSync(path.join(root, stored.key), 'utf8'), data.toString());
    assert.deepEqual(fs.readdirSync(root), [stored.key]);
    const second = await adapter.put(data, 'pdf');
    assert.notEqual(second.key, stored.key);
    for (const extension of ['exe', 'html', 'svg', '../x', '', 'PDF', 'pdf/', 'pdf\0'] as unknown as StoredExtension[]) {
      await assert.rejects(adapter.put(data, extension), InvalidStorageKeyError, JSON.stringify(extension));
    }
    assert.equal(fs.readdirSync(root).length, 2, 'refused puts leave nothing behind');
    await adapter.delete(stored.key);
    await adapter.delete(second.key);
    await adapter.delete(second.key); // a missing file is not an error
    assert.deepEqual(fs.readdirSync(root), []);
  });

  test('a missing file is StorageNotFoundError on get and false on exists; a directory with a valid name is not a file', async () => {
    const key = `${'b'.repeat(32)}.mp4`;
    await assert.rejects(adapter.get(key), StorageNotFoundError);
    assert.equal(await adapter.exists(key), false);
    fs.mkdirSync(path.join(root, key));
    assert.equal(await adapter.exists(key), false, 'a directory is not a stored file');
    fs.rmdirSync(path.join(root, key));
  });

  test('ranges: a valid range streams exactly those bytes; unsafe ranges are an error, never "the whole file" and never a read outside it', async () => {
    const stored = await adapter.put(Buffer.from('0123456789'), 'mp4');
    const read = async (range?: { start: number; end: number }): Promise<string> => {
      const chunks: Buffer[] = [];
      for await (const chunk of await adapter.get(stored.key, range)) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString();
    };
    assert.equal(await read(), '0123456789');
    assert.equal(await read({ start: 2, end: 4 }), '234');
    assert.equal(await read({ start: 9, end: 9 }), '9');
    assert.equal(await read({ start: 0, end: 99 }), '0123456789', 'an end past the file is clamped by the file system');
    for (const range of [{ start: -1, end: 3 }, { start: 5, end: 2 }, { start: Number.NaN, end: 3 }, { start: 1.5, end: 3 }, { start: 0, end: Number.NaN }, { start: 2 ** 60, end: 2 ** 61 }]) {
      let outcome: string;
      try { outcome = await read(range); } catch { outcome = 'error'; }
      assert.ok(outcome === 'error' || outcome === '', `${JSON.stringify(range)} -> ${JSON.stringify(outcome)}`);
    }
    await adapter.delete(stored.key);
  });
});
