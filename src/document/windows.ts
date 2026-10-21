/**
 * Several documents at once, each in a window of its own as in Word: a new desktop window, or a new browser tab.
 * Windows know of each other through a list in localStorage (for View > Switch Windows and for finding a file that
 * is already open); what a new window should show arrives with it, its file or template passed through IndexedDB.
 */
import { isTauriRuntime } from "@/lib/platform"
import type { OpenedFile } from "@/lib/file-io"
import { invoke } from "@tauri-apps/api/core"
import { getAllWindows, getCurrentWindow, Window as DesktopWindow } from "@tauri-apps/api/window"
import { useSyncExternalStore } from "react"

/** What a new window opens: a file on disk, a file or template handed over, or a blank document. */
export type WindowRequest =
  | { kind: "path"; path: string }
  | { kind: "handoff"; id: string }
  | { kind: "blank" }
  /** A recovered draft, by its id in the recovery store (which every window of the app shares). */
  | { kind: "recovery"; id: string }

/**
 * Handed to a new window: a file read in this one (the browser has no paths), a file dropped on it (not read yet),
 * or a template's HTML.
 */
export type Handoff =
  { kind: "file"; file: OpenedFile } | { kind: "dropped"; file: File } | { kind: "html"; html: string }

export type OpenWindow = {
  id: string
  /** The desktop window's label, for bringing it to the front. */
  label: string
  name: string
  path: string | null
  dirty: boolean
  /** When the window opened; the list is in this order, as Word's is. */
  since: number
  at: number
}

export const WINDOW_ID = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())

const LIST_KEY = "inkspire-windows"
const BEAT_MS = 4_000
/** A window not heard from for this long has closed or crashed. */
const GONE_MS = 15_000
const HASH_KEY = "inkspire-open"
const FOCUS_CHANNEL = "inkspire-windows"

// ---------------------------------------------------------------------------------------------------------------
// The list of open windows
// ---------------------------------------------------------------------------------------------------------------

function leave() {
  const list = readList()
  delete list[WINDOW_ID]
  writeList(list)
}

function readList(): Record<string, OpenWindow> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_KEY) || "{}") as Record<string, OpenWindow>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeList(list: Record<string, OpenWindow>) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: this window does not know of the others.
  }
  notify()
}

function live(list: Record<string, OpenWindow>, now = Date.now()) {
  return Object.values(list)
    .filter((entry) => now - entry.at < GONE_MS)
    .sort((left, right) => (left.since ?? 0) - (right.since ?? 0) || left.id.localeCompare(right.id))
}

const listeners = new Set<() => void>()
function notify() {
  listeners.forEach((listener) => listener())
}

function currentLabel() {
  if (!isTauriRuntime()) {
    return ""
  }
  try {
    return getCurrentWindow().label
  } catch {
    return ""
  }
}

/**
 * Keeps this window on the list with its document's name, path and state while it is open. `describe` reads them
 * at each beat; `subscribe` tells it when they change. Returns the cleanup, which takes the window off the list.
 */
export function registerWindow(
  describe: () => Pick<OpenWindow, "name" | "path" | "dirty">,
  subscribe: (onChange: () => void) => () => void,
) {
  const label = currentLabel()
  const since = Date.now()
  const beat = () => {
    const now = Date.now()
    const list = Object.fromEntries(live(readList(), now).map((entry) => [entry.id, entry]))
    list[WINDOW_ID] = { id: WINDOW_ID, label, ...describe(), since, at: now }
    writeList(list)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === LIST_KEY) {
      notify()
    }
  }
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(FOCUS_CHANNEL)
  if (channel) {
    channel.onmessage = (event: MessageEvent<{ focus?: string }>) => {
      if (event.data?.focus === WINDOW_ID) {
        window.focus()
      }
    }
  }
  beat()
  const timer = window.setInterval(beat, BEAT_MS)
  const stop = subscribe(beat)
  window.addEventListener("storage", onStorage)
  window.addEventListener("pagehide", leave)
  return () => {
    window.clearInterval(timer)
    stop()
    channel?.close()
    window.removeEventListener("storage", onStorage)
    window.removeEventListener("pagehide", leave)
    leave()
  }
}

/**
 * Whether this is the window the app starts with, which alone shows the splash screen. Windows opened for a
 * document (desktop `doc-N` windows, tabs opened with a request) and any tab opened while another is open do not.
 */
export function isLaunchWindow() {
  if (isTauriRuntime()) {
    return currentLabel() === "main" || currentLabel() === ""
  }
  if (window.location.hash.includes(`${HASH_KEY}=`)) {
    return false
  }
  return !openWindows().some((entry) => entry.id !== WINDOW_ID)
}

/** Every open window, this one included. */
export function openWindows() {
  return live(readList())
}

/** Another open window with the file, if any. */
export function windowWithPath(path: string) {
  const key = path.replace(/\\/g, "/").toLowerCase()
  return openWindows().find(
    (entry) => entry.id !== WINDOW_ID && entry.path && entry.path.replace(/\\/g, "/").toLowerCase() === key,
  )
}

/** Whether another document window is open: the desktop's own count, or the list of browser tabs. */
export async function hasOtherWindows() {
  if (isTauriRuntime()) {
    return (await getAllWindows()).length > 1
  }
  return openWindows().some((entry) => entry.id !== WINDOW_ID)
}

let cachedRaw = ""
let cached: OpenWindow[] = []
function snapshot() {
  let raw: string
  try {
    raw = localStorage.getItem(LIST_KEY) || ""
  } catch {
    raw = ""
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = live(readList())
  }
  return cached
}

function subscribeList(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOpenWindows() {
  return useSyncExternalStore(subscribeList, snapshot, () => cached)
}

/** Brings another window to the front: the desktop window itself, or asks a browser tab to take the focus. */
export async function focusWindow(entry: OpenWindow) {
  if (entry.id === WINDOW_ID) {
    return
  }
  if (isTauriRuntime() && entry.label) {
    const target = await DesktopWindow.getByLabel(entry.label)
    if (target) {
      await target.unminimize().catch(() => undefined)
      await target.setFocus()
    }
    return
  }
  // Browsers let a tab take the focus only in some cases; the message is all a page can do.
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(FOCUS_CHANNEL)
    channel.postMessage({ focus: entry.id })
    channel.close()
  }
}

/** Closes this window, after its document has been dealt with. False when the browser keeps the tab open. */
export async function closeThisWindow() {
  if (isTauriRuntime()) {
    leave()
    // Destroy, not close: close would ask the close guard about the document again.
    await getCurrentWindow().destroy()
    return true
  }
  window.close()
  return window.closed
}

// ---------------------------------------------------------------------------------------------------------------
// Opening a new window
// ---------------------------------------------------------------------------------------------------------------

/**
 * Opens a window for the request. In a browser the tab is opened at once, inside the click that asked for it, so it
 * is not blocked as a pop-up; whatever it needs is handed over afterwards. False when the browser blocked the tab.
 */
export function openWindow(request: WindowRequest | { kind: "handoff"; handoff: Handoff }) {
  const sent: WindowRequest = request.kind === "handoff" && "handoff" in request ? newHandoff(request.handoff) : request
  if (isTauriRuntime()) {
    void invoke("open_window", { request: JSON.stringify(sent) }).catch((error) => console.error(error))
    return true
  }
  const url = new URL(window.location.href)
  url.hash = `${HASH_KEY}=${encodeURIComponent(JSON.stringify(sent))}`
  return Boolean(window.open(url.href, "_blank"))
}

function newHandoff(handoff: Handoff): WindowRequest {
  const id = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())
  void putHandoff(id, handoff).catch((error) => console.error(error))
  return { kind: "handoff", id }
}

/** Whether this window was opened to show something (a file, a new document), without taking the request. */
export function hasWindowRequest() {
  if ((window as Window & { __INKSPIRE_OPEN__?: unknown }).__INKSPIRE_OPEN__ !== undefined) {
    return true
  }
  return new RegExp(`${HASH_KEY}=`).test(window.location.hash)
}

/** What this window was opened for; read once, at launch. */
export function takeWindowRequest(): WindowRequest | null {
  const fromDesktop = (window as Window & { __INKSPIRE_OPEN__?: unknown }).__INKSPIRE_OPEN__
  let raw: unknown = fromDesktop
  if (raw === undefined) {
    const match = new RegExp(`${HASH_KEY}=([^&]*)`).exec(window.location.hash)
    if (!match) {
      return null
    }
    // Not left in the address, so reloading the tab does not open it again.
    history.replaceState(null, "", window.location.pathname + window.location.search)
    try {
      raw = JSON.parse(decodeURIComponent(match[1]))
    } catch {
      return null
    }
  } else {
    delete (window as Window & { __INKSPIRE_OPEN__?: unknown }).__INKSPIRE_OPEN__
  }
  return readRequest(raw)
}

export function readRequest(value: unknown): WindowRequest | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.kind === "path" && typeof record.path === "string" && record.path) {
    return { kind: "path", path: record.path }
  }
  if (record.kind === "handoff" && typeof record.id === "string" && record.id) {
    return { kind: "handoff", id: record.id }
  }
  if (record.kind === "blank") {
    return { kind: "blank" }
  }
  if (record.kind === "recovery" && typeof record.id === "string" && record.id) {
    return { kind: "recovery", id: record.id }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Handing a file or template to a new window
// ---------------------------------------------------------------------------------------------------------------

const DB_NAME = "inkspire-handoff"
const STORE = "items"
/** Left behind by a window that never opened. */
const HANDOFF_FOR_MS = 60_000

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error ?? new Error("Failed to open the handoff database"))
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"))
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
  })
}

type HandoffRecord = { id: string; at: number; handoff: Handoff }

async function putHandoff(id: string, handoff: Handoff) {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    const all = store.getAll()
    all.onsuccess = () => {
      const now = Date.now()
      for (const old of all.result as HandoffRecord[]) {
        if (now - old.at > HANDOFF_FOR_MS) {
          store.delete(old.id)
        }
      }
    }
    store.put({ id, at: Date.now(), handoff } satisfies HandoffRecord)
    await done(tx)
  } finally {
    db.close()
  }
}

async function takeHandoffOnce(id: string): Promise<Handoff | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    const request = store.get(id)
    let found: HandoffRecord | undefined
    request.onsuccess = () => {
      found = request.result as HandoffRecord | undefined
      if (found) {
        store.delete(id)
      }
    }
    await done(tx)
    return found?.handoff ?? null
  } finally {
    db.close()
  }
}

/** The file or template handed to this window; the window may open before it has been written, so it waits a little. */
export async function takeHandoff(id: string, waitMs = 5_000) {
  const until = Date.now() + waitMs
  for (;;) {
    const handoff = await takeHandoffOnce(id).catch(() => null)
    if (handoff || Date.now() > until) {
      return handoff
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  }
}
