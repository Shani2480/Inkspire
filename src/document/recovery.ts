import { APP_DATA, ensureAppData } from "@/document/app-data"
import { flushPendingEdit, getDocumentEditor } from "@/document/editor-ref"
import { packDocument } from "@/document/header"
import { packStyles, useStyleStore } from "@/document/styles"
import { documentName, useDocumentStore } from "@/document/store"
import { WINDOW_ID, openWindows } from "@/document/windows"
import { isTauriRuntime } from "@/lib/platform"
import { BaseDirectory, exists, readTextFile, remove, stat, writeTextFile } from "@tauri-apps/plugin-fs"

const DB_NAME = "aiword-document-snapshots"
const DB_VERSION = 1
const STORE = "snapshots"

export type RecoveryMeta = {
  sourcePath: string | null
  documentName: string
  writtenAt: number
  /** The snapshot the desktop mirror copies, so reading it back never makes a second record of the same draft. */
  id?: string
  owner?: string
}

export type RecoveryOffer = {
  id: string
  meta: RecoveryMeta
  packedHtml: string
  json: unknown | null
  preview: string
  wordCount: number
}

type SnapshotRecord = {
  id: string
  /** The window that wrote it; while that window is open, its drafts are not offered elsewhere. */
  owner?: string
  sourcePath: string | null
  documentName: string
  packedHtml: string
  json: unknown | null
  isDirty: true
  writtenAt: number
  preview: string
  wordCount: number
}

/** Snapshot id for the document currently open in this session. */
let activeSnapshotId: string | null = null

const ALIVE_KEY = "aiword-recovery-alive"
const ALIVE_EVERY_MS = 5_000
const ALIVE_FOR_MS = 20_000
let mirrorRead = false

function readAlive(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALIVE_KEY) || "{}") as Record<string, number>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Marks this window as open every few seconds, so another window does not offer to recover a draft that is
 * still being edited here. Returns the cleanup, which forgets this window.
 */
export function keepRecoveryAlive() {
  const beat = () => {
    try {
      const now = Date.now()
      const alive = Object.fromEntries(Object.entries(readAlive()).filter(([, at]) => now - at < ALIVE_FOR_MS))
      alive[WINDOW_ID] = now
      localStorage.setItem(ALIVE_KEY, JSON.stringify(alive))
    } catch {
      // Storage blocked: every window's drafts are offered, as before.
    }
  }
  const forget = () => {
    try {
      const alive = readAlive()
      delete alive[WINDOW_ID]
      localStorage.setItem(ALIVE_KEY, JSON.stringify(alive))
    } catch {
      // Best-effort.
    }
  }
  beat()
  const timer = window.setInterval(beat, ALIVE_EVERY_MS)
  window.addEventListener("pagehide", forget)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener("pagehide", forget)
    forget()
  }
}

/** A draft another open window is editing. */
function heldElsewhere(record: SnapshotRecord, alive: Record<string, number>, now: number) {
  if (!record.owner || record.owner === WINDOW_ID) {
    return false
  }
  // Either heartbeat says the window is open: a window behind another one may be slow to write its own.
  return now - (alive[record.owner] ?? 0) < ALIVE_FOR_MS || openWindows().some((entry) => entry.id === record.owner)
}

const pathKey = (path: string) => path.replace(/\\/g, "/").toLowerCase()

/**
 * The files open now: in this window and in every other live one. A draft of such a file is not offered back, as the
 * file is in front of the person already (it stays stored, and is offered again once the file is closed).
 */
export function openFilePaths(): Set<string> {
  const paths = new Set<string>()
  const here = useDocumentStore.getState().currentFilePath
  if (here) {
    paths.add(pathKey(here))
  }
  for (const entry of openWindows()) {
    if (entry.path) {
      paths.add(pathKey(entry.path))
    }
  }
  return paths
}

export function isOpenFile(sourcePath: string | null, open: Set<string>) {
  return Boolean(sourcePath) && open.has(pathKey(sourcePath as string))
}

export function resetRecoverySession() {
  activeSnapshotId = null
  notifyRecoveryChanged()
}

export function notifyRecoveryChanged() {
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(new Event("aiword-recovery-changed"))
}

export function activeRecoveryId() {
  return activeSnapshotId
}

export function bindRecoverySession(id: string) {
  activeSnapshotId = id
}

function ensureActiveSnapshotId() {
  const path = useDocumentStore.getState().currentFilePath
  if (path) {
    activeSnapshotId = `path:${path}`
    return activeSnapshotId
  }
  if (!activeSnapshotId || activeSnapshotId.startsWith("path:")) {
    activeSnapshotId = `session:${crypto.randomUUID()}`
  }
  return activeSnapshotId
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error("Failed to open recovery database"))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" })
        store.createIndex("writtenAt", "writtenAt")
        store.createIndex("sourcePath", "sourcePath")
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

async function putSnapshot(record: SnapshotRecord) {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readwrite")
    await idbRequest(tx.objectStore(STORE).put(record))
  } finally {
    db.close()
  }
}

async function getSnapshot(id: string): Promise<SnapshotRecord | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readonly")
    const value = await idbRequest(tx.objectStore(STORE).get(id))
    return (value as SnapshotRecord | undefined) ?? null
  } finally {
    db.close()
  }
}

async function deleteSnapshot(id: string) {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readwrite")
    await idbRequest(tx.objectStore(STORE).delete(id))
  } finally {
    db.close()
  }
}

async function listSnapshots(): Promise<SnapshotRecord[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readonly")
    const values = await idbRequest(tx.objectStore(STORE).getAll())
    return (values as SnapshotRecord[]).filter((item) => item?.isDirty && item.packedHtml?.trim())
  } finally {
    db.close()
  }
}

function plainText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function previewFromHtml(html: string) {
  const text = plainText(html)
  if (!text) {
    return "Empty document"
  }
  return text.length > 96 ? `${text.slice(0, 96).trimEnd()}…` : text
}

function wordCountFromHtml(html: string) {
  const text = plainText(html)
  if (!text) {
    return 0
  }
  return text.split(/\s+/).filter(Boolean).length
}

/** The preview and word count of a draft, from one pass over its text rather than one each. */
function summaryOf(html: string) {
  const text = plainText(html)
  return {
    preview: text ? (text.length > 96 ? `${text.slice(0, 96).trimEnd()}…` : text) : "Empty document",
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
  }
}

function toOffer(record: SnapshotRecord): RecoveryOffer {
  return {
    id: record.id,
    meta: {
      sourcePath: record.sourcePath,
      documentName: record.documentName || "Untitled document (Recovered)",
      writtenAt: record.writtenAt,
    },
    packedHtml: record.packedHtml,
    json: record.json,
    preview: record.preview || previewFromHtml(record.packedHtml),
    wordCount: record.wordCount || wordCountFromHtml(record.packedHtml),
  }
}

function buildSnapshotRecord(id: string): SnapshotRecord | null {
  flushPendingEdit()
  const state = useDocumentStore.getState()
  if (!state.isDirty || state.saving) {
    return null
  }

  const editorHtml = state.documentHTML
  const packed =
    packStyles(useStyleStore.getState().styles) +
    packDocument(editorHtml, {
      header: state.headerHtml,
      footer: state.footerHtml,
      differentFirstPage: state.differentFirstPage,
      firstHeader: state.firstHeaderHtml,
      evenHeader: state.evenHeaderHtml,
      firstFooter: state.firstFooterHtml,
      evenFooter: state.evenFooterHtml,
      pageSetup: state.pageSetup,
    })
  const editor = getDocumentEditor()
  const json = editor && !editor.isDestroyed ? editor.getJSON() : null
  const name = state.currentFilePath
    ? documentName(state.currentFilePath)
    : state.fileName || "Untitled document (Recovered)"

  return {
    id,
    owner: WINDOW_ID,
    sourcePath: state.currentFilePath,
    documentName: name,
    packedHtml: packed,
    json,
    isDirty: true,
    writtenAt: Date.now(),
    ...summaryOf(packed),
  }
}

async function writeTauriMirror(record: SnapshotRecord) {
  if (!isTauriRuntime()) {
    return
  }
  const meta: RecoveryMeta = {
    sourcePath: record.sourcePath,
    documentName: record.documentName,
    writtenAt: record.writtenAt,
    id: record.id,
    owner: record.owner,
  }
  await ensureAppData()
  await writeTextFile(APP_DATA.recoveryHtml, record.packedHtml, { baseDir: BaseDirectory.AppData })
  await writeTextFile(APP_DATA.recoveryMeta, JSON.stringify(meta), { baseDir: BaseDirectory.AppData })
}

async function clearTauriMirror() {
  if (!isTauriRuntime()) {
    return
  }
  try {
    await ensureAppData()
    if (await exists(APP_DATA.recoveryHtml, { baseDir: BaseDirectory.AppData })) {
      await remove(APP_DATA.recoveryHtml, { baseDir: BaseDirectory.AppData })
    }
    if (await exists(APP_DATA.recoveryMeta, { baseDir: BaseDirectory.AppData })) {
      await remove(APP_DATA.recoveryMeta, { baseDir: BaseDirectory.AppData })
    }
  } catch {
    // Best-effort cleanup.
  }
}

async function migrateTauriDraft(): Promise<SnapshotRecord | null> {
  if (!isTauriRuntime()) {
    return null
  }
  try {
    await ensureAppData()
    if (!(await exists(APP_DATA.recoveryMeta, { baseDir: BaseDirectory.AppData }))) {
      return null
    }
    if (!(await exists(APP_DATA.recoveryHtml, { baseDir: BaseDirectory.AppData }))) {
      return null
    }
    const meta = JSON.parse(
      await readTextFile(APP_DATA.recoveryMeta, { baseDir: BaseDirectory.AppData }),
    ) as RecoveryMeta
    if (!meta || typeof meta.writtenAt !== "number") {
      return null
    }
    const packedHtml = await readTextFile(APP_DATA.recoveryHtml, { baseDir: BaseDirectory.AppData })
    if (!packedHtml.trim()) {
      return null
    }
    if (!(await isRecoveryNewerThanSource(meta))) {
      await clearTauriMirror()
      return null
    }
    const id =
      typeof meta.id === "string" && meta.id
        ? meta.id
        : meta.sourcePath
          ? `path:${meta.sourcePath}`
          : `legacy:${meta.writtenAt}`
    // The mirror of the draft this window is writing is not a draft to recover.
    if (id === activeSnapshotId) {
      return null
    }
    const existing = await getSnapshot(id).catch(() => null)
    if (existing && existing.writtenAt >= meta.writtenAt) {
      return existing
    }
    const record: SnapshotRecord = {
      id,
      owner: typeof meta.owner === "string" ? meta.owner : undefined,
      sourcePath: typeof meta.sourcePath === "string" ? meta.sourcePath : null,
      documentName:
        typeof meta.documentName === "string" && meta.documentName
          ? meta.documentName
          : "Untitled document (Recovered)",
      packedHtml,
      json: null,
      isDirty: true,
      writtenAt: meta.writtenAt,
      ...summaryOf(packedHtml),
    }
    await putSnapshot(record)
    return record
  } catch {
    return null
  }
}

export async function writeRecoveryDraft() {
  if (!useDocumentStore.getState().isDirty || useDocumentStore.getState().saving) {
    return
  }
  const id = ensureActiveSnapshotId()
  const record = buildSnapshotRecord(id)
  if (!record) {
    return
  }
  // Bail if the user already saved or started a new document while we were packing.
  if (!useDocumentStore.getState().isDirty || useDocumentStore.getState().saving) {
    return
  }
  try {
    await putSnapshot(record)
  } catch {
    // IndexedDB may be blocked; still try the desktop mirror.
  }
  try {
    await writeTauriMirror(record)
  } catch {
    // Best-effort.
  }
}

export async function clearRecovery(id?: string) {
  const target = id ?? activeSnapshotId
  if (target) {
    try {
      await deleteSnapshot(target)
    } catch {
      // Best-effort.
    }
    if (target === activeSnapshotId) {
      activeSnapshotId = null
    }
  }
  await clearTauriMirror()
  notifyRecoveryChanged()
}

export async function discardRecovery(id: string) {
  await clearRecovery(id)
}

export async function listRecoveryOffers(): Promise<RecoveryOffer[]> {
  // The desktop mirror holds the last draft written before the app closed; read it once, at launch. Read again
  // later it would be the draft open now, offered back as a document to recover.
  if (!mirrorRead) {
    mirrorRead = true
    try {
      await migrateTauriDraft()
    } catch {
      // Continue with IndexedDB only.
    }
  }

  let records: SnapshotRecord[]
  try {
    records = await listSnapshots()
  } catch {
    records = []
  }

  const alive = readAlive()
  const now = Date.now()
  const open = openFilePaths()
  const offers: RecoveryOffer[] = []
  const seen = new Set<string>()
  for (const record of records.sort((left, right) => right.writtenAt - left.writtenAt)) {
    if (record.id === activeSnapshotId || heldElsewhere(record, alive, now) || isOpenFile(record.sourcePath, open)) {
      continue
    }
    // Earlier versions copied the open draft back in from the desktop mirror on every focus, as "legacy" records.
    // The mirror only ever holds one draft, so only the newest of those can be a real one; identical copies go too.
    const key = record.id.startsWith("legacy:") ? "legacy" : `${record.sourcePath ?? ""}\n${record.packedHtml}`
    if (seen.has(key) || seen.has(`${record.sourcePath ?? ""}\n${record.packedHtml}`)) {
      await deleteSnapshot(record.id).catch(() => undefined)
      continue
    }
    seen.add(key)
    seen.add(`${record.sourcePath ?? ""}\n${record.packedHtml}`)
    offers.push(toOffer(record))
  }

  const checked: RecoveryOffer[] = []
  for (const offer of offers) {
    if (await isRecoveryNewerThanSource(offer.meta)) {
      checked.push(offer)
    } else {
      await deleteSnapshot(offer.id).catch(() => undefined)
    }
  }
  return checked
}

/** @deprecated Prefer listRecoveryOffers — kept for single-offer call sites. */
export async function findRecoveryOffer(): Promise<RecoveryOffer | null> {
  const offers = await listRecoveryOffers()
  return offers[0] ?? null
}

export async function isRecoveryNewerThanSource(meta: RecoveryMeta) {
  if (!meta.sourcePath || !isTauriRuntime()) {
    return true
  }
  try {
    if (!(await exists(meta.sourcePath))) {
      return true
    }
    const info = await stat(meta.sourcePath)
    const mtime = info.mtime?.getTime() ?? 0
    return meta.writtenAt > mtime
  } catch {
    return true
  }
}

export function formatRecoveryWhen(writtenAt: number, now = Date.now()) {
  const date = new Date(writtenAt)
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)

  if (writtenAt >= startToday.getTime()) {
    return `Today at ${time}`
  }
  if (writtenAt >= startYesterday.getTime()) {
    return `Yesterday at ${time}`
  }
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  return `${day} at ${time}`
}
