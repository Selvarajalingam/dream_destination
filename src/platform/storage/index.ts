import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Object storage for owner uploads.
 *
 * A local directory outside `public/`, so nothing uploaded is ever reachable
 * except through a route that checks who is asking. A pilot deployment swaps
 * this for an object store behind the same three methods; nothing downstream
 * knows which is in use.
 */

export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const KEY = /^[a-z0-9][a-z0-9/-]{0,200}$/;

class LocalDirectoryStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Keys are generated server-side, but a traversal must stay impossible
    // even if that ever changes.
    if (!KEY.test(key) || key.includes('..')) throw new Error('Invalid storage key.');
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key.');
    return target;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

let store: ObjectStore | null = null;

export function getObjectStore(): ObjectStore {
  if (store === null) {
    store = new LocalDirectoryStore(path.resolve(process.env.UPLOAD_DIR ?? 'var/uploads'));
  }
  return store;
}
