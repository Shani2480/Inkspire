import { create } from "zustand"

/**
 * Optional fonts (U39): free fonts with the same widths as the Office fonts Word documents use most, downloaded only
 * when the person asks. With one installed, text in Calibri wraps where it does in Word, even where Calibri is
 * missing (Linux, the web build). Microsoft's own fonts may not be redistributed, so Aptos is a link to Microsoft's
 * download instead.
 *
 * - The files come from Google Fonts' repository at a pinned commit, each checked against its SHA-256.
 * - They are kept in IndexedDB (in the desktop app that lives in the app's data folder), never in the system.
 * - Each font is registered under its own name and under the Office names it stands in for, with `local()` first:
 *   where the real Calibri is installed it still wins. The document keeps its own font names when saved.
 */

const SOURCE = "https://raw.githubusercontent.com/google/fonts/ce6523df69fcaec9534b128945bf47cd92bdc5b2/"

export type FontFile = { path: string; weight: string; style: "normal" | "italic"; size: number; sha256: string }

export type OptionalFont = {
  id: string
  family: string
  /** The Office fonts it has the widths of. */
  standsFor: string[]
  licence: string
  files: FontFile[]
}

const OFL = "SIL Open Font License"

function four(dir: string, name: string, sizes: number[], sums: string[]): FontFile[] {
  return (["Regular", "Bold", "Italic", "BoldItalic"] as const).map((face, index) => ({
    path: `${dir}/${name}-${face}.ttf`,
    weight: face.startsWith("Bold") ? "700" : "400",
    style: face.endsWith("Italic") ? "italic" : "normal",
    size: sizes[index]!,
    sha256: sums[index]!,
  }))
}

export const OPTIONAL_FONTS: OptionalFont[] = [
  {
    id: "carlito",
    family: "Carlito",
    standsFor: ["Calibri", "Calibri Light"],
    licence: OFL,
    files: four(
      "ofl/carlito",
      "Carlito",
      [628032, 682468, 615236, 808508],
      [
        "f6418f708baede9789daef5d458c0f53d2a888af9820e8062934e504fedc6595",
        "bb5d20f79b82599ec72983597437373a80f2d2085fa91fc144fd74e876a594db",
        "0b019225e58d702bfedcbd35c21696769f8ee115cb6343f84c2f240312450d1c",
        "b32928186c119599e03ca6a1ffc680fdcb7fac95772f4b95d989cf6cd3861517",
      ],
    ),
  },
  {
    id: "caladea",
    family: "Caladea",
    standsFor: ["Cambria"],
    licence: OFL,
    files: four(
      "ofl/caladea",
      "Caladea",
      [81600, 84492, 83780, 83356],
      [
        "f1e899278b7b4491aba5b6a8253c4b04c050cc59b21865be5c37559a775153cd",
        "ae3cb2dcbc925809dd29d2a44e9802211cab66be541bacbfc9c08c74b27c3742",
        "4359a8e24f748b6447b1ff6d7a174febe70961d29f8bb8634b56dacd740a3deb",
        "ccabaa7b7e2fdf253d2b1a5fa699dd8a3df8d835a9eb285ad82631a677eb76c0",
      ],
    ),
  },
  {
    id: "arimo",
    family: "Arimo",
    standsFor: ["Arial"],
    licence: OFL,
    files: [
      {
        path: "ofl/arimo/Arimo%5Bwght%5D.ttf",
        weight: "400 700",
        style: "normal",
        size: 496268,
        sha256: "e43898b143ec826ac8cb4034816458a7047fbe0836558de2a1f8c6223ae3e0ca",
      },
      {
        path: "ofl/arimo/Arimo-Italic%5Bwght%5D.ttf",
        weight: "400 700",
        style: "italic",
        size: 543196,
        sha256: "a80fc54fd0233c1dfe298577c4d00f5ae81d5bb83510975e473c47e699b7f4ed",
      },
    ],
  },
  {
    id: "tinos",
    family: "Tinos",
    standsFor: ["Times New Roman"],
    licence: OFL,
    files: four(
      "ofl/tinos",
      "Tinos",
      [521588, 597880, 565016, 578976],
      [
        "60a0e8ef0c04dd5dd69ffe91025fa2ae5836cbd35600a82ba031977557e2cb61",
        "393269dbab8899f938db19783eca5eac92eb431f7ae0ab45b8349ca895f1a06b",
        "5942266ed398b155d7dc23e36833e7ec6be988f2439bdbeb8ef1bede808eaa91",
        "a5de79f0fe863ea0954757acb3d47b3ccd0a930ce3dd5b97230cd3866790a06e",
      ],
    ),
  },
  {
    id: "cousine",
    family: "Cousine",
    standsFor: ["Courier New"],
    licence: OFL,
    files: four(
      "ofl/cousine",
      "Cousine",
      [296856, 298048, 306880, 308292],
      [
        "1da22250675fc4c42fcf3a9736c44bc0570516105331443b663fd5cfbd1412fe",
        "17c8a7245156d2253531c9e529474937b09d9f641c5ae7695c5e33f22822eef4",
        "ea2a76ae3d0ece9cd59f0d30fdc08dd70e8f5f457beee5b0852a7b50c2286c7c",
        "848e858726fee0ae27b754e4cd6a2755209bf1428a8c91f747696d58c33906c3",
      ],
    ),
  },
  {
    id: "gelasio",
    family: "Gelasio",
    standsFor: ["Georgia"],
    licence: OFL,
    files: [
      {
        path: "ofl/gelasio/Gelasio%5Bwght%5D.ttf",
        weight: "400 700",
        style: "normal",
        size: 168556,
        sha256: "4daecea457258c9ebeb8bc99ed3fd24353618bfad3ea4b93fa0b5d0468fc04e4",
      },
      {
        path: "ofl/gelasio/Gelasio-Italic%5Bwght%5D.ttf",
        weight: "400 700",
        style: "italic",
        size: 174212,
        sha256: "52559e845a4d33514e5f93bb9ae7dbeae1894a53f2c565a15f18af40cd337c09",
      },
    ],
  },
  {
    // Not metric-compatible by design, but within half a percent of Arial Nova Cond's widths over a real form's
    // text (measured against Word's own PDF), so its lines wrap where Word's do.
    id: "roboto-condensed",
    family: "Roboto Condensed",
    standsFor: ["Arial Nova Cond"],
    licence: OFL,
    files: [
      {
        path: "ofl/robotocondensed/RobotoCondensed%5Bwght%5D.ttf",
        weight: "100 900",
        style: "normal",
        size: 371616,
        sha256: "dace262afcee68a5276f200d8026c57221735c0118ab5fda8c2c0d3dc409a8d0",
      },
      {
        path: "ofl/robotocondensed/RobotoCondensed-Italic%5Bwght%5D.ttf",
        weight: "100 900",
        style: "italic",
        size: 388124,
        sha256: "78f643b1923008b00dfc9b371a2ecd4d80a017722925f1a3fac9940be56d1b7d",
      },
    ],
  },
]

/** Microsoft's own page for Aptos, Office's default font since 2023: it may not be passed on, only linked to. */
export const APTOS_DOWNLOAD = "https://www.microsoft.com/en-us/download/details.aspx?id=106087"

export function fontSize(font: OptionalFont) {
  return font.files.reduce((sum, file) => sum + file.size, 0)
}

/** The optional font that stands in for an Office font (by name, any case), if there is one. */
export function standInFor(name: string) {
  const key = name
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase()
  return OPTIONAL_FONTS.find((font) => font.standsFor.some((office) => office.toLowerCase() === key))
}

/** The Office fonts named in CSS text (style attributes, a style sheet) that have an optional stand-in. */
export function officeFontsIn(css: string) {
  const found = new Set<string>()
  // Entities first (a style attribute's quotes), then each declaration up to its end; a stray `">x` is no font name.
  for (const match of css.replace(/&quot;/g, '"').matchAll(/font-family\s*:\s*([^;}<>]+)/gi)) {
    for (const part of match[1]!.split(",")) {
      const font = standInFor(part)
      if (font) {
        found.add(
          font.standsFor.find(
            (office) =>
              office.toLowerCase() ===
              part
                .trim()
                .replace(/^['"]|['"]$/g, "")
                .toLowerCase(),
          )!,
        )
      }
    }
  }
  return [...found]
}

// --- storage -------------------------------------------------------------------------------------------------

const DB_NAME = "inkspire-fonts"
const STORE = "files"

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb()
  if (!db) {
    return null
  }
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

const readFile = (path: string) => withStore<ArrayBuffer | undefined>("readonly", (store) => store.get(path))
const writeFile = (path: string, data: ArrayBuffer) => withStore("readwrite", (store) => store.put(data, path))
const deleteFile = (path: string) => withStore("readwrite", (store) => store.delete(path))
const storedPaths = () => withStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys())

async function sha256(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

// --- registering with the page ---------------------------------------------------------------------------------

const registered = new Map<string, FontFace[]>()
const urls = new Map<string, string>()

/** Adds a font's faces to the page: under its own name, and under each Office name after the real one (local()). */
function register(font: OptionalFont, data: Map<string, ArrayBuffer>) {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || registered.has(font.id)) {
    return
  }
  const faces: FontFace[] = []
  for (const file of font.files) {
    const buffer = data.get(file.path)
    if (!buffer) {
      continue
    }
    const descriptors = { weight: file.weight, style: file.style }
    faces.push(new FontFace(font.family, buffer, descriptors))
    const url = URL.createObjectURL(new Blob([buffer], { type: "font/ttf" }))
    urls.set(file.path, url)
    for (const office of font.standsFor) {
      faces.push(new FontFace(office, `local("${office}"), url("${url}") format("truetype")`, descriptors))
    }
  }
  for (const face of faces) {
    document.fonts.add(face)
    void face.load().catch(() => {})
  }
  registered.set(font.id, faces)
}

function unregister(font: OptionalFont) {
  for (const face of registered.get(font.id) ?? []) {
    document.fonts.delete(face)
  }
  registered.delete(font.id)
  for (const file of font.files) {
    const url = urls.get(file.path)
    if (url) {
      URL.revokeObjectURL(url)
      urls.delete(file.path)
    }
  }
}

// --- state -------------------------------------------------------------------------------------------------------

export type FontStatus = "missing" | "installed" | "downloading" | "failed"

type OptionalFontsState = {
  status: Record<string, FontStatus>
  /** Bytes received while downloading. */
  progress: Record<string, number>
  ready: boolean
  /** Reads what is stored and registers it: run once when the app starts. */
  load: () => Promise<void>
  download: (ids: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useOptionalFonts = create<OptionalFontsState>((set, get) => ({
  status: Object.fromEntries(OPTIONAL_FONTS.map((font) => [font.id, "missing" as FontStatus])),
  progress: {},
  ready: false,
  load: async () => {
    const paths = new Set((await storedPaths())?.map(String) ?? [])
    const status = { ...get().status }
    for (const font of OPTIONAL_FONTS) {
      if (!font.files.every((file) => paths.has(file.path))) {
        continue
      }
      const data = new Map<string, ArrayBuffer>()
      for (const file of font.files) {
        const buffer = await readFile(file.path)
        if (buffer) {
          data.set(file.path, buffer)
        }
      }
      if (data.size === font.files.length) {
        register(font, data)
        status[font.id] = "installed"
      }
    }
    set({ status, ready: true })
  },
  download: async (ids) => {
    await Promise.all(
      ids.map(async (id) => {
        const font = OPTIONAL_FONTS.find((item) => item.id === id)
        if (!font || get().status[id] === "installed" || get().status[id] === "downloading") {
          return
        }
        const mark = (value: FontStatus) => set((state) => ({ status: { ...state.status, [id]: value } }))
        const progress = (bytes: number) => set((state) => ({ progress: { ...state.progress, [id]: bytes } }))
        mark("downloading")
        progress(0)
        try {
          const data = new Map<string, ArrayBuffer>()
          let received = 0
          for (const file of font.files) {
            const response = await fetch(SOURCE + file.path)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }
            const buffer = await response.arrayBuffer()
            if ((await sha256(buffer)) !== file.sha256) {
              throw new Error("The file is not the one expected")
            }
            data.set(file.path, buffer)
            received += buffer.byteLength
            progress(received)
          }
          for (const [path, buffer] of data) {
            await writeFile(path, buffer)
          }
          register(font, data)
          mark("installed")
        } catch {
          mark("failed")
        }
      }),
    )
  },
  remove: async (id) => {
    const font = OPTIONAL_FONTS.find((item) => item.id === id)
    if (!font) {
      return
    }
    unregister(font)
    for (const file of font.files) {
      await deleteFile(file.path)
    }
    set((state) => ({ status: { ...state.status, [id]: "missing" } }))
  },
}))

/**
 * Whether the page can draw a font itself: text in it measures differently from the fallback. Works on the web too,
 * where the list of system fonts needs a permission. True when it cannot tell (no canvas), so no hint is shown.
 */
export function fontAvailable(name: string) {
  if (typeof document === "undefined") {
    return true
  }
  let context: CanvasRenderingContext2D | null
  try {
    context = document.createElement("canvas").getContext("2d")
  } catch {
    context = null
  }
  if (!context) {
    return true
  }
  const sample = "mmmmmmmmmlli WWW 0123456789"
  for (const fallback of ["monospace", "serif"]) {
    context.font = `32px ${fallback}`
    const base = context.measureText(sample).width
    context.font = `32px "${name.replace(/"/g, "")}", ${fallback}`
    if (context.measureText(sample).width !== base) {
      return true
    }
  }
  return false
}

/** The Office fonts a document uses that this page cannot draw and that have a stand-in not yet downloaded. */
export function fontsToOffer(html: string, styleSheet: string, status = useOptionalFonts.getState().status) {
  return (
    officeFontsIn(`${styleSheet}\n${html}`)
      .filter((office) => !fontAvailable(office))
      .map((office) => ({ office, font: standInFor(office)! }))
      // A stand-in the system already has (Carlito on many Linux systems) is drawn already.
      .filter(
        ({ font }) => (status[font.id] === "missing" || status[font.id] === "failed") && !fontAvailable(font.family),
      )
  )
}
