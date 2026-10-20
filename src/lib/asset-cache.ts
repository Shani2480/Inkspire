/** localStorage + IndexedDB cache for online icon / model catalogs and SVG payloads. */

const PREFIX = "aiword-asset-cache:"
const IDB_NAME = "aiword-assets"
const IDB_STORE = "blobs"
const MEMORY = new Map<string, unknown>()

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export function readCache<T>(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): T | null {
  if (MEMORY.has(key)) {
    return MEMORY.get(key) as T
  }
  if (typeof localStorage === "undefined") {
    return null
  }
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as { at: number; value: T }
    if (!parsed || typeof parsed.at !== "number") {
      return null
    }
    if (Date.now() - parsed.at > maxAgeMs) {
      return null
    }
    MEMORY.set(key, parsed.value)
    return parsed.value
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, value: T) {
  MEMORY.set(key, value)
  if (typeof localStorage === "undefined") {
    return
  }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // quota — fall through to IndexedDB
  }
  void writeIdb(key, value)
}

export async function readCacheAsync<T>(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<T | null> {
  const local = readCache<T>(key, maxAgeMs)
  if (local != null) {
    return local
  }
  const db = await openDb()
  if (!db) {
    return null
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly")
      const request = tx.objectStore(IDB_STORE).get(key)
      request.onsuccess = () => {
        const row = request.result as { at: number; value: T } | undefined
        if (!row || Date.now() - row.at > maxAgeMs) {
          resolve(null)
          return
        }
        MEMORY.set(key, row.value)
        resolve(row.value)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeIdb<T>(key: string, value: T) {
  const db = await openDb()
  if (!db) {
    return
  }
  try {
    const tx = db.transaction(IDB_STORE, "readwrite")
    tx.objectStore(IDB_STORE).put({ at: Date.now(), value }, key)
  } catch {
    // ignore
  }
}
