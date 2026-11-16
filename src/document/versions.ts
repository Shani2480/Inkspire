/**
 * File > History: earlier versions of a document. Word keeps them on OneDrive or SharePoint; here every save of a Word
 * document keeps a copy of the file as written, in this app's own storage (IndexedDB), under the file's path. An
 * encrypted file's versions stay encrypted.
 */

const DB_NAME = "aiword-versions"
const STORE = "versions"
/** Versions kept for each file; the oldest go first. */
export const VERSIONS_KEPT = 20
/** Larger files are not copied. */
const LARGEST = 40 * 1024 * 1024

export type DocumentVersion = {
  id: string
  /** The file it is a version of: its path, or its name when the browser gives no path. */
  file: string
  savedAt: number
  author: string
  size: number
  /** The file as it was written. */
  bytes: Uint8Array
}

export type VersionSummary = Omit<DocumentVersion, "bytes">

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" })
      store.createIndex("file", "file")
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function done(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function all(file: string): Promise<DocumentVersion[]> {
  const db = await open()
  if (!db) {
    return []
  }
  try {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).index("file").getAll(file)
    const rows = await new Promise<DocumentVersion[]>((resolve) => {
      request.onsuccess = () => resolve((request.result as DocumentVersion[]) ?? [])
      request.onerror = () => resolve([])
    })
    return rows.sort((a, b) => b.savedAt - a.savedAt)
  } finally {
    db.close()
  }
}

function same(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

/** Keeps the file as just saved; a save that wrote the same bytes as the last version adds none. */
export async function recordVersion(file: string, bytes: Uint8Array, author: string) {
  if (!file || bytes.length > LARGEST) {
    return
  }
  const versions = await all(file)
  if (versions[0] && same(versions[0].bytes, bytes)) {
    return
  }
  const db = await open()
  if (!db) {
    return
  }
  try {
    const transaction = db.transaction(STORE, "readwrite")
    const store = transaction.objectStore(STORE)
    store.put({
      id: crypto.randomUUID(),
      file,
      savedAt: Date.now(),
      author,
      size: bytes.length,
      bytes: bytes.slice(),
    } satisfies DocumentVersion)
    for (const old of versions.slice(VERSIONS_KEPT - 1)) {
      store.delete(old.id)
    }
    await done(transaction)
  } catch (error) {
    // Storage full or blocked: the save itself has already happened.
    console.warn("Version not kept", error)
  } finally {
    db.close()
    window.dispatchEvent(new Event("aiword-versions-changed"))
  }
}

/** The file's versions, newest first, without their bytes. */
export async function listVersions(file: string | null): Promise<VersionSummary[]> {
  if (!file) {
    return []
  }
  return (await all(file)).map(({ bytes: _bytes, ...summary }) => summary)
}

export async function readVersion(id: string): Promise<DocumentVersion | null> {
  const db = await open()
  if (!db) {
    return null
  }
  try {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id)
    return await new Promise((resolve) => {
      request.onsuccess = () => resolve((request.result as DocumentVersion | undefined) ?? null)
      request.onerror = () => resolve(null)
    })
  } finally {
    db.close()
  }
}

export async function deleteVersions(file: string) {
  const versions = await all(file)
  const db = await open()
  if (!db) {
    return
  }
  try {
    const transaction = db.transaction(STORE, "readwrite")
    for (const version of versions) {
      transaction.objectStore(STORE).delete(version.id)
    }
    await done(transaction)
  } finally {
    db.close()
    window.dispatchEvent(new Event("aiword-versions-changed"))
  }
}

/** The name a version opens under: the file's name with the time it was saved, as Word titles an opened version. */
export function versionFileName(file: string, savedAt: number) {
  const base = file.replace(/\\/g, "/").split("/").pop() || "Document.docx"
  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ".docx"
  const stamp = new Date(savedAt)
  const pad = (value: number) => String(value).padStart(2, "0")
  const when = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}.${pad(stamp.getMinutes())}`
  return `${stem} (version ${when})${ext}`
}
