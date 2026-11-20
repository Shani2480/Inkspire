import { create } from "zustand"

/**
 * Free fonts a document uses that are missing here, downloaded from Google Fonts when the person asks (the
 * document's message bar, or Options > Fonts). A Word document names a family ("Lato") or one weight of it
 * ("Lato Light", "Open Sans SemiBold"); each is registered with the page under the name the document uses, so its
 * text shows in the real font and wraps as in Word. The files are kept in IndexedDB (the app's data folder in the
 * desktop app), never installed in the system. Only the font's name is sent, and only after the person asks.
 */

export type WebFontMatch = {
  /** The name as the document uses it. */
  name: string
  /** The Google Fonts family. */
  family: string
  /** The family's weight that is the document font's regular. */
  weight: number
  /** A bold to download with it (a family named alone); a named weight's bold Word draws by thickening. */
  bold: boolean
  italic: boolean
}

type CatalogEntry = { family: string; upright: string; italic: string }

let catalogPromise: Promise<Map<string, CatalogEntry>> | null = null

export function parseCatalog(text: string) {
  const entries = new Map<string, CatalogEntry>()
  for (const line of text.split("\n")) {
    const [family, upright = "", italic = ""] = line.split("|")
    if (family) {
      entries.set(family.toLowerCase(), { family, upright, italic })
    }
  }
  return entries
}

/** The Google Fonts families (bundled, loaded the first time a document has a missing font). */
export function googleCatalog() {
  catalogPromise ??= import("@/document/google-fonts-catalog").then((module) => parseCatalog(module.GOOGLE_FONTS))
  return catalogPromise
}

/** The weight words Word puts after a family's name, as CSS weights. */
const WEIGHT_WORDS: [RegExp, number][] = [
  [/\s+(?:thin|hairline)$/i, 100],
  [/\s+(?:extra|ultra)[\s-]?light$/i, 200],
  [/\s+light$/i, 300],
  [/\s+(?:regular|normal|book)$/i, 400],
  [/\s+medium$/i, 500],
  [/\s+(?:semi|demi)[\s-]?bold$/i, 600],
  [/\s+(?:extra|ultra)[\s-]?bold$/i, 800],
  [/\s+(?:black|heavy)$/i, 900],
]

/** The Google Fonts family and weight a document's font name stands for, if Google Fonts has it. */
export function matchWebFont(name: string, catalog: Map<string, CatalogEntry>): WebFontMatch | null {
  const clean = name.trim().replace(/^['"]|['"]$/g, "")
  const whole = catalog.get(clean.toLowerCase())
  if (whole && whole.upright.includes("4")) {
    return {
      name: clean,
      family: whole.family,
      weight: 400,
      bold: whole.upright.includes("7"),
      italic: whole.italic.includes("4"),
    }
  }
  for (const [pattern, weight] of WEIGHT_WORDS) {
    if (!pattern.test(clean)) {
      continue
    }
    const base = catalog.get(clean.replace(pattern, "").toLowerCase())
    const digit = String(weight / 100)
    if (base && base.upright.includes(digit)) {
      return { name: clean, family: base.family, weight, bold: false, italic: base.italic.includes(digit) }
    }
  }
  return null
}

/** The Google Fonts CSS address for a match: its regular and italic, and its bold ones for a whole family. */
export function cssUrl(match: WebFontMatch) {
  const tuples = [`0,${match.weight}`]
  if (match.bold) {
    tuples.push("0,700")
  }
  if (match.italic) {
    tuples.push(`1,${match.weight}`)
    if (match.bold) {
      tuples.push("1,700")
    }
  }
  const family = encodeURIComponent(match.family).replace(/%20/g, "+")
  return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@${tuples.sort().join(";")}&display=swap`
}

export type WebFace = { url: string; style: "normal" | "italic"; weight: number; unicodeRange?: string }

/** The faces a Google Fonts style sheet lists. */
export function parseFaces(css: string): WebFace[] {
  const faces: WebFace[] = []
  for (const block of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = block[1] ?? ""
    const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1]?.replace(/^['"]|['"]$/g, "")
    if (!url || !url.startsWith("https://fonts.gstatic.com/")) {
      continue
    }
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim()
    faces.push({
      url,
      style: /font-style:\s*italic/.test(body) ? "italic" : "normal",
      weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1] ?? 400),
      ...(range ? { unicodeRange: range } : {}),
    })
  }
  return faces
}

/** The weight a face is registered with under the document's name: a named weight's own is that name's regular. */
export function registeredWeight(match: WebFontMatch, weight: number) {
  return weight === match.weight ? 400 : weight
}

// --- storage ------------------------------------------------------------------------------------------------------

type Stored = { match: WebFontMatch; faces: (WebFace & { key: string })[] }

const DB_NAME = "inkspire-web-fonts"
const FILES = "files"
const MANIFEST_KEY = "aiword.web-fonts"

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FILES)) {
          request.result.createObjectStore(FILES)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function store<T>(mode: IDBTransactionMode, run: (files: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  if (!db) {
    return null
  }
  return new Promise<T | null>((resolve) => {
    try {
      const request = run(db.transaction(FILES, mode).objectStore(FILES))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function readManifest(): Record<string, Stored> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? "{}") as Record<string, Stored>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeManifest(manifest: Record<string, Stored>) {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest))
  } catch {
    // Without storage the font is downloaded again next time it is asked for.
  }
}

// --- registering ------------------------------------------------------------------------------------------------

const registered = new Map<string, FontFace[]>()

function register(stored: Stored, data: Map<string, ArrayBuffer>) {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return
  }
  unregister(stored.match.name)
  const faces: FontFace[] = []
  for (const face of stored.faces) {
    const buffer = data.get(face.key)
    if (!buffer) {
      continue
    }
    const font = new FontFace(stored.match.name, buffer, {
      style: face.style,
      weight: String(registeredWeight(stored.match, face.weight)),
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    })
    document.fonts.add(font)
    void font.load().catch(() => {})
    faces.push(font)
  }
  registered.set(stored.match.name, faces)
}

function unregister(name: string) {
  for (const face of registered.get(name) ?? []) {
    document.fonts.delete(face)
  }
  registered.delete(name)
}

// --- state ----------------------------------------------------------------------------------------------------------

type WebFontsState = {
  /** The downloaded fonts, by the name documents use. */
  installed: Record<string, WebFontMatch>
  status: Record<string, "downloading" | "failed">
  load: () => Promise<void>
  download: (matches: WebFontMatch[]) => Promise<void>
  remove: (name: string) => Promise<void>
}

export const useWebFonts = create<WebFontsState>((set, get) => ({
  installed: Object.fromEntries(Object.entries(readManifest()).map(([name, stored]) => [name, stored.match])),
  status: {},
  load: async () => {
    for (const stored of Object.values(readManifest())) {
      const data = new Map<string, ArrayBuffer>()
      for (const face of stored.faces) {
        const buffer = await store<ArrayBuffer | undefined>("readonly", (files) => files.get(face.key))
        if (buffer) {
          data.set(face.key, buffer)
        }
      }
      register(stored, data)
    }
  },
  download: async (matches) => {
    for (const match of matches) {
      if (get().installed[match.name] || get().status[match.name] === "downloading") {
        continue
      }
      set({ status: { ...get().status, [match.name]: "downloading" } })
      try {
        const css = await (await fetch(cssUrl(match))).text()
        const faces = parseFaces(css)
        if (faces.length === 0) {
          throw new Error("no faces")
        }
        const data = new Map<string, ArrayBuffer>()
        const stored: Stored = { match, faces: [] }
        for (const face of faces) {
          const response = await fetch(face.url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          const buffer = await response.arrayBuffer()
          const key = `${match.name}|${face.url}`
          await store("readwrite", (files) => files.put(buffer, key))
          data.set(key, buffer)
          stored.faces.push({ ...face, key })
        }
        writeManifest({ ...readManifest(), [match.name]: stored })
        register(stored, data)
        const status = { ...get().status }
        delete status[match.name]
        set({ installed: { ...get().installed, [match.name]: match }, status })
      } catch {
        set({ status: { ...get().status, [match.name]: "failed" } })
      }
    }
  },
  remove: async (name) => {
    const manifest = readManifest()
    for (const face of manifest[name]?.faces ?? []) {
      await store("readwrite", (files) => files.delete(face.key))
    }
    delete manifest[name]
    writeManifest(manifest)
    unregister(name)
    const installed = { ...get().installed }
    delete installed[name]
    set({ installed })
  },
}))
