import { join } from 'node:path'
import { Storage, StorageRoots } from '../src/storage.js'

export function fixtureStorage(dir) {
  return new Storage({ settings: { read: async () => ({ exportDir: dir }) }, roots: new StorageRoots(join(dir, 'storage-roots.json')), filesDir: join(dir, 'files') })
}
