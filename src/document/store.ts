import { chromeHtml } from "@/document/chrome-html"
import { isBlankNewDocument } from "@/document/blank"
import { clearWordDocument } from "@/document/docx/session"
import type { DocumentChrome } from "@/document/header"
import { pageSetupForNewDocument } from "@/document/design-format"
import { DEFAULT_PAGE_SETUP, normalizePageSetup, samePageSetup, type PageSetup } from "@/document/page-setup"
import {
  CHROME_SLOTS,
  type ChromeSlot,
  type SectionChrome,
  type SectionSetupPatch,
  sectionPageSetup,
  slotOwner,
} from "@/document/sections"
import { slotHome } from "@/document/section-slots"
import { create } from "zustand"

type ChromeState = {
  documentHTML: string
  savedHTML: string
  headerHtml: string
  savedHeader: string
  footerHtml: string
  savedFooter: string
  differentFirstPage: boolean
  savedDifferentFirstPage: boolean
  firstHeaderHtml: string
  evenHeaderHtml: string
  savedFirstHeader: string
  savedEvenHeader: string
  firstFooterHtml: string
  evenFooterHtml: string
  savedFirstFooter: string
  savedEvenFooter: string
  pageSetup: PageSetup
  savedPageSetup: PageSetup
  sections: SectionChrome[]
  savedSections: SectionChrome[]
  linkedSlots: ChromeSlot[]
}

/** The store field each of the document's own (last section's) headers and footers is kept in. */
export const SLOT_FIELDS = {
  header: "headerHtml",
  footer: "footerHtml",
  firstHeader: "firstHeaderHtml",
  firstFooter: "firstFooterHtml",
  evenHeader: "evenHeaderHtml",
  evenFooter: "evenFooterHtml",
} as const satisfies Record<ChromeSlot, keyof ChromeState>

function isUnsaved(state: ChromeState, next: Partial<ChromeState> = {}) {
  // A blank new document is never unsaved: there is nothing in it to lose.
  if (isBlankNewDocument({ ...state, ...next })) {
    return false
  }
  const html = next.documentHTML ?? state.documentHTML
  const header = next.headerHtml ?? state.headerHtml
  const footer = next.footerHtml ?? state.footerHtml
  const differentFirstPage = next.differentFirstPage ?? state.differentFirstPage
  const firstHeader = next.firstHeaderHtml ?? state.firstHeaderHtml
  const evenHeader = next.evenHeaderHtml ?? state.evenHeaderHtml
  const firstFooter = next.firstFooterHtml ?? state.firstFooterHtml
  const evenFooter = next.evenFooterHtml ?? state.evenFooterHtml
  const pageSetup = next.pageSetup ?? state.pageSetup
  const sections = next.sections ?? state.sections
  return (
    sections !== state.savedSections ||
    html !== state.savedHTML ||
    header !== state.savedHeader ||
    footer !== state.savedFooter ||
    differentFirstPage !== state.savedDifferentFirstPage ||
    firstHeader !== state.savedFirstHeader ||
    evenHeader !== state.savedEvenHeader ||
    firstFooter !== state.savedFirstFooter ||
    evenFooter !== state.savedEvenFooter ||
    !samePageSetup(pageSetup, state.savedPageSetup)
  )
}

const RECENT_FILES_KEY = "aiword.recent-files"
const PINNED_FILES_KEY = "aiword.pinned-files"
const RECENT_FOLDERS_KEY = "aiword.recent-folders"
const DOC_PROPS_KEY = "aiword.document-props"
const RECENT_FILE_LIMIT = 24
const RECENT_FOLDER_LIMIT = 12

export type DocumentProps = {
  title: string
  subject: string
  tags: string
  comments: string
  author: string
  company: string
  category: string
  createdAt: string
  lastPrintedAt: string | null
  totalEditingMs: number
}

function loadStringList(key: string, limit: number) {
  if (typeof localStorage === "undefined") {
    return [] as string[]
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === "string").slice(0, limit)
  } catch {
    return []
  }
}

function saveStringList(key: string, values: string[]) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, JSON.stringify(values))
  }
}

function loadRecentFiles() {
  return loadStringList(RECENT_FILES_KEY, RECENT_FILE_LIMIT)
}

function loadPinnedFiles() {
  return loadStringList(PINNED_FILES_KEY, RECENT_FILE_LIMIT)
}

function loadRecentFolders() {
  return loadStringList(RECENT_FOLDERS_KEY, RECENT_FOLDER_LIMIT)
}

function loadDocumentProps(): DocumentProps {
  const fallback: DocumentProps = {
    title: "",
    subject: "",
    tags: "",
    comments: "",
    author: typeof localStorage !== "undefined" ? (localStorage.getItem("aiword.author") ?? "") : "",
    company: "",
    category: "",
    createdAt: new Date().toISOString(),
    lastPrintedAt: null,
    totalEditingMs: 0,
  }
  if (typeof localStorage === "undefined") {
    return fallback
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(DOC_PROPS_KEY) ?? "null") as Partial<DocumentProps> | null
    if (!parsed || typeof parsed !== "object") {
      return fallback
    }
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      comments: typeof parsed.comments === "string" ? parsed.comments : "",
      author: typeof parsed.author === "string" ? parsed.author : fallback.author,
      company: typeof parsed.company === "string" ? parsed.company : "",
      category: typeof parsed.category === "string" ? parsed.category : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : fallback.createdAt,
      lastPrintedAt: typeof parsed.lastPrintedAt === "string" ? parsed.lastPrintedAt : null,
      totalEditingMs: typeof parsed.totalEditingMs === "number" ? parsed.totalEditingMs : 0,
    }
  } catch {
    return fallback
  }
}

function persistDocumentProps(props: DocumentProps) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(DOC_PROPS_KEY, JSON.stringify(props))
    if (props.author) {
      localStorage.setItem("aiword.author", props.author)
    }
  }
}

function folderOf(path: string) {
  const normalized = path.replace(/\\/g, "/")
  const slash = normalized.lastIndexOf("/")
  return slash <= 0 ? normalized : normalized.slice(0, slash)
}

function rememberRecent(path: string, current: string[]) {
  const recentFiles = [path, ...current.filter((item) => item !== path)].slice(0, RECENT_FILE_LIMIT)
  saveStringList(RECENT_FILES_KEY, recentFiles)
  return recentFiles
}

function rememberFolder(path: string, current: string[]) {
  const folder = folderOf(path)
  const recentFolders = [folder, ...current.filter((item) => item !== folder)].slice(0, RECENT_FOLDER_LIMIT)
  saveStringList(RECENT_FOLDERS_KEY, recentFolders)
  return recentFolders
}

export type FileFormat = "docx" | "odt" | "html" | "htm" | "md" | "txt" | "rtf" | "pdf" | "unknown"

function formatFromPath(path: string | null): FileFormat {
  if (!path) {
    return "unknown"
  }
  const base = path.replace(/\\/g, "/").split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  const ext = dot === -1 ? "" : base.slice(dot + 1).toLowerCase()
  if (
    ext === "docx" ||
    ext === "odt" ||
    ext === "html" ||
    ext === "htm" ||
    ext === "md" ||
    ext === "txt" ||
    ext === "rtf" ||
    ext === "pdf"
  ) {
    return ext
  }
  return "unknown"
}

function nameFromPath(path: string | null) {
  if (!path) {
    return "Untitled"
  }
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "Untitled"
  return base || "Untitled"
}

type DocumentState = {
  currentFilePath: string | null
  fileName: string
  fileFormat: FileFormat
  lastSavedTimestamp: string | null
  isDirty: boolean
  saving: boolean
  documentHTML: string
  savedHTML: string
  headerHtml: string
  savedHeader: string
  footerHtml: string
  savedFooter: string
  differentFirstPage: boolean
  savedDifferentFirstPage: boolean
  firstHeaderHtml: string
  evenHeaderHtml: string
  savedFirstHeader: string
  savedEvenHeader: string
  firstFooterHtml: string
  evenFooterHtml: string
  savedFirstFooter: string
  savedEvenFooter: string
  pageSetup: PageSetup
  savedPageSetup: PageSetup
  /** A Word document's sections before the last (see `sections.ts`); empty for one with a single section. */
  sections: SectionChrome[]
  savedSections: SectionChrome[]
  /** The last section's headers and footers that are Linked to Previous (its previous section's are shown). */
  linkedSlots: ChromeSlot[]
  recentFiles: string[]
  pinnedFiles: string[]
  recentFolders: string[]
  documentProps: DocumentProps
  readOnly: boolean
  noteEdit: (html: string) => void
  setHeader: (header: string) => void
  setFooter: (footer: string) => void
  setFirstHeader: (header: string) => void
  setFirstFooter: (footer: string) => void
  setEvenHeader: (header: string) => void
  setEvenFooter: (footer: string) => void
  setDifferentFirstPage: (enabled: boolean) => void
  /** A header or footer of a section before the last, by its section's key. */
  setSectionPart: (key: string, slot: ChromeSlot, html: string) => void
  /** The page setup of a section before the last (Page Setup > Apply to: This section, Format Page Numbers). */
  setSectionSetup: (key: string, patch: SectionSetupPatch) => void
  /**
   * Link to Previous for a section's header or footer (`key` null: the document's own last section). Linking drops the
   * section's own part, so the previous section's shows; unlinking gives it a copy of the one it showed, as Word does.
   */
  setSlotLinked: (key: string | null, slot: ChromeSlot, linked: boolean) => void
  setPageSetup: (pageSetup: PageSetup) => void
  startUntitled: (blankHtml: string) => void
  markOpened: (
    path: string | null,
    html: string,
    chrome?: Partial<DocumentChrome>,
    fileName?: string,
    props?: Partial<DocumentProps>,
  ) => void
  markSaved: (path: string | null, html: string, fileName?: string) => void
  /** Takes the editor's HTML as the saved state; only when there is none yet, unless `replace`. */
  adoptBaseline: (html: string, replace?: boolean) => void
  setSaving: (saving: boolean) => void
  forgetRecent: (path: string) => void
  /** The document's file was renamed (or, with no file yet, its name changed): `path` is null for no file. */
  renamed: (path: string | null, fileName: string) => void
  applyRecovery: (path: string | null, html: string, chrome: DocumentChrome) => void
  togglePinned: (path: string) => void
  setDocumentProps: (patch: Partial<DocumentProps>) => void
  setReadOnly: (readOnly: boolean) => void
  addEditingTime: (ms: number) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentFilePath: null,
  fileName: "Document1",
  fileFormat: "unknown",
  lastSavedTimestamp: null,
  isDirty: false,
  saving: false,
  documentHTML: "",
  savedHTML: "",
  headerHtml: "",
  savedHeader: "",
  footerHtml: "",
  savedFooter: "",
  differentFirstPage: false,
  savedDifferentFirstPage: false,
  firstHeaderHtml: "",
  evenHeaderHtml: "",
  savedFirstHeader: "",
  savedEvenHeader: "",
  firstFooterHtml: "",
  evenFooterHtml: "",
  savedFirstFooter: "",
  savedEvenFooter: "",
  pageSetup: pageSetupForNewDocument(),
  savedPageSetup: pageSetupForNewDocument(),
  sections: [],
  savedSections: [],
  linkedSlots: [],
  recentFiles: loadRecentFiles(),
  pinnedFiles: loadPinnedFiles(),
  recentFolders: loadRecentFolders(),
  documentProps: loadDocumentProps(),
  readOnly: false,
  noteEdit: (html) =>
    set((state) => ({
      documentHTML: html,
      isDirty: isUnsaved(state, { documentHTML: html }),
    })),
  setHeader: (header) =>
    set((state) => {
      const html = chromeHtml(header)
      return { headerHtml: html, isDirty: isUnsaved(state, { headerHtml: html }) }
    }),
  setFooter: (footer) =>
    set((state) => {
      const html = chromeHtml(footer)
      return { footerHtml: html, isDirty: isUnsaved(state, { footerHtml: html }) }
    }),
  setFirstHeader: (header) =>
    set((state) => {
      const html = chromeHtml(header)
      return { firstHeaderHtml: html, isDirty: isUnsaved(state, { firstHeaderHtml: html }) }
    }),
  setFirstFooter: (footer) =>
    set((state) => {
      const html = chromeHtml(footer)
      return { firstFooterHtml: html, isDirty: isUnsaved(state, { firstFooterHtml: html }) }
    }),
  setEvenHeader: (header) =>
    set((state) => {
      const html = chromeHtml(header)
      return { evenHeaderHtml: html, isDirty: isUnsaved(state, { evenHeaderHtml: html }) }
    }),
  setEvenFooter: (footer) =>
    set((state) => {
      const html = chromeHtml(footer)
      return { evenFooterHtml: html, isDirty: isUnsaved(state, { evenFooterHtml: html }) }
    }),
  setDifferentFirstPage: (enabled) =>
    set((state) => ({
      differentFirstPage: enabled,
      isDirty: isUnsaved(state, { differentFirstPage: enabled }),
    })),
  setSectionPart: (key, slot, value) =>
    set((state) => {
      const html = chromeHtml(value)
      const section = state.sections.find((item) => item.key === key)
      if (!section || section.parts[slot] === html) {
        return state
      }
      const sections = state.sections.map((item) =>
        item === section ? { ...item, parts: { ...item.parts, [slot]: html } } : item,
      )
      return { sections, isDirty: isUnsaved(state, { sections }) }
    }),
  setSectionSetup: (key, patch) =>
    set((state) => {
      const section = state.sections.find((item) => item.key === key)
      if (!section) {
        return state
      }
      const changed = (Object.keys(patch) as (keyof SectionSetupPatch)[]).some((name) => patch[name] !== section[name])
      if (!changed) {
        return state
      }
      const sections = state.sections.map((item) => (item === section ? { ...item, ...patch } : item))
      return { sections, isDirty: isUnsaved(state, { sections }) }
    }),
  setSlotLinked: (key, slot, linked) =>
    set((state) => {
      const index = key === null ? state.sections.length : state.sections.findIndex((item) => item.key === key)
      const previous = state.sections[index - 1]
      if (index < 0 || !previous) {
        return state
      }
      // What the previous section shows for the slot (its own, or the one it is linked to).
      const owner = slotOwner(state.sections, previous, slot)
      const shown = owner.parts[slot]
      if (key !== null) {
        const section = state.sections[index]!
        if (linked === (section.parts[slot] === undefined)) {
          return state
        }
        const parts = { ...section.parts }
        if (linked) {
          delete parts[slot]
        } else {
          parts[slot] = shown ?? ""
        }
        const sections = state.sections.map((item) => (item === section ? { ...item, parts } : item))
        return { sections, isDirty: true }
      }
      if (linked === state.linkedSlots.includes(slot)) {
        return state
      }
      const field = SLOT_FIELDS[slot]
      if (linked) {
        return { linkedSlots: [...state.linkedSlots, slot], [field]: shown ?? "", isDirty: true }
      }
      // A chain no section had a part for showed the last section's own, which it keeps.
      return {
        linkedSlots: state.linkedSlots.filter((item) => item !== slot),
        ...(shown !== undefined ? { [field]: shown } : {}),
        isDirty: true,
      }
    }),
  setPageSetup: (pageSetup) =>
    set((state) => {
      const next = normalizePageSetup(pageSetup)
      return {
        pageSetup: next,
        isDirty: isUnsaved(state, { pageSetup: next }),
      }
    }),
  startUntitled: (blankHtml) => {
    clearWordDocument()
    const documentProps: DocumentProps = {
      title: "",
      subject: "",
      tags: "",
      comments: "",
      author: get().documentProps.author,
      company: get().documentProps.company,
      category: "",
      createdAt: new Date().toISOString(),
      lastPrintedAt: null,
      totalEditingMs: 0,
    }
    persistDocumentProps(documentProps)
    set({
      currentFilePath: null,
      fileName: "Document1",
      fileFormat: "unknown",
      lastSavedTimestamp: null,
      isDirty: false,
      documentHTML: blankHtml,
      savedHTML: blankHtml,
      headerHtml: "",
      savedHeader: "",
      footerHtml: "",
      savedFooter: "",
      differentFirstPage: false,
      savedDifferentFirstPage: false,
      firstHeaderHtml: "",
      evenHeaderHtml: "",
      savedFirstHeader: "",
      savedEvenHeader: "",
      firstFooterHtml: "",
      evenFooterHtml: "",
      savedFirstFooter: "",
      savedEvenFooter: "",
      pageSetup: pageSetupForNewDocument(),
      savedPageSetup: pageSetupForNewDocument(),
      sections: [],
      savedSections: [],
      linkedSlots: [],
      documentProps,
      readOnly: false,
    })
  },
  markOpened: (path, html, chrome = {}, fileName, props) =>
    set((state) => {
      const resolvedName = fileName || nameFromPath(path)
      const documentProps: DocumentProps = {
        ...state.documentProps,
        ...props,
        title: (props?.title ?? state.documentProps.title) || resolvedName.replace(/\.[^.]+$/, ""),
        createdAt: props?.createdAt || state.documentProps.createdAt || new Date().toISOString(),
        author: props?.author ?? state.documentProps.author,
        company: props?.company ?? state.documentProps.company,
      }
      persistDocumentProps(documentProps)
      return {
        currentFilePath: path,
        fileName: resolvedName,
        fileFormat: formatFromPath(path ?? resolvedName),
        lastSavedTimestamp: new Date().toISOString(),
        documentHTML: html,
        savedHTML: html,
        headerHtml: chrome.header ?? "",
        savedHeader: chrome.header ?? "",
        footerHtml: chrome.footer ?? "",
        savedFooter: chrome.footer ?? "",
        differentFirstPage: chrome.differentFirstPage ?? false,
        savedDifferentFirstPage: chrome.differentFirstPage ?? false,
        firstHeaderHtml: chrome.firstHeader ?? "",
        evenHeaderHtml: chrome.evenHeader ?? "",
        savedFirstHeader: chrome.firstHeader ?? "",
        savedEvenHeader: chrome.evenHeader ?? "",
        firstFooterHtml: chrome.firstFooter ?? "",
        evenFooterHtml: chrome.evenFooter ?? "",
        savedFirstFooter: chrome.firstFooter ?? "",
        savedEvenFooter: chrome.evenFooter ?? "",
        pageSetup: normalizePageSetup(chrome.pageSetup ?? DEFAULT_PAGE_SETUP),
        savedPageSetup: normalizePageSetup(chrome.pageSetup ?? DEFAULT_PAGE_SETUP),
        sections: chrome.sections ?? [],
        savedSections: chrome.sections ?? [],
        linkedSlots: chrome.linked ?? [],
        isDirty: false,
        recentFiles: path ? rememberRecent(path, state.recentFiles) : state.recentFiles,
        recentFolders: path ? rememberFolder(path, state.recentFolders) : state.recentFolders,
        documentProps,
        readOnly: false,
      }
    }),
  markSaved: (path, html, fileName) =>
    set((state) => {
      const resolvedName = fileName || nameFromPath(path) || state.fileName
      return {
        currentFilePath: path,
        fileName: resolvedName,
        fileFormat: formatFromPath(path ?? resolvedName),
        lastSavedTimestamp: new Date().toISOString(),
        documentHTML: html,
        savedHTML: html,
        savedHeader: state.headerHtml,
        savedFooter: state.footerHtml,
        savedDifferentFirstPage: state.differentFirstPage,
        savedFirstHeader: state.firstHeaderHtml,
        savedEvenHeader: state.evenHeaderHtml,
        savedFirstFooter: state.firstFooterHtml,
        savedEvenFooter: state.evenFooterHtml,
        savedPageSetup: state.pageSetup,
        savedSections: state.sections,
        isDirty: false,
        recentFiles: path ? rememberRecent(path, state.recentFiles) : state.recentFiles,
        recentFolders: path ? rememberFolder(path, state.recentFolders) : state.recentFolders,
      }
    }),
  adoptBaseline: (html, replace = false) =>
    set((state) =>
      state.savedHTML && !replace
        ? state
        : {
            documentHTML: html,
            savedHTML: html,
            isDirty: false,
          },
    ),
  setSaving: (saving) => set({ saving }),
  renamed: (path, fileName) =>
    set((state) => {
      if (!path) {
        return { fileName }
      }
      const old = state.currentFilePath
      const recentFiles = rememberRecent(
        path,
        state.recentFiles.filter((item) => item !== old),
      )
      return { currentFilePath: path, fileName, fileFormat: formatFromPath(path), recentFiles }
    }),
  forgetRecent: (path) =>
    set((state) => {
      const recentFiles = state.recentFiles.filter((item) => item !== path)
      saveStringList(RECENT_FILES_KEY, recentFiles)
      return { recentFiles }
    }),
  togglePinned: (path) =>
    set((state) => {
      const pinnedFiles = state.pinnedFiles.includes(path)
        ? state.pinnedFiles.filter((item) => item !== path)
        : [path, ...state.pinnedFiles].slice(0, RECENT_FILE_LIMIT)
      saveStringList(PINNED_FILES_KEY, pinnedFiles)
      return { pinnedFiles }
    }),
  setDocumentProps: (patch) =>
    set((state) => {
      const documentProps = { ...state.documentProps, ...patch }
      persistDocumentProps(documentProps)
      return { documentProps }
    }),
  setReadOnly: (readOnly) => set({ readOnly }),
  addEditingTime: (ms) =>
    set((state) => {
      if (ms <= 0) {
        return state
      }
      const documentProps = {
        ...state.documentProps,
        totalEditingMs: state.documentProps.totalEditingMs + ms,
      }
      persistDocumentProps(documentProps)
      return { documentProps }
    }),
  applyRecovery: (path, html, chrome) =>
    set({
      currentFilePath: path,
      fileName: path ? nameFromPath(path) : get().fileName,
      documentHTML: html,
      // Fake baseline so the restored draft stays Unsaved until the user saves.
      savedHTML: "\u0000",
      headerHtml: chrome.header,
      savedHeader: chrome.header,
      footerHtml: chrome.footer,
      savedFooter: chrome.footer,
      differentFirstPage: chrome.differentFirstPage,
      savedDifferentFirstPage: chrome.differentFirstPage,
      firstHeaderHtml: chrome.firstHeader,
      evenHeaderHtml: chrome.evenHeader,
      savedFirstHeader: chrome.firstHeader,
      savedEvenHeader: chrome.evenHeader,
      firstFooterHtml: chrome.firstFooter,
      evenFooterHtml: chrome.evenFooter,
      savedFirstFooter: chrome.firstFooter,
      savedEvenFooter: chrome.evenFooter,
      pageSetup: chrome.pageSetup,
      savedPageSetup: chrome.pageSetup,
      sections: chrome.sections ?? [],
      savedSections: chrome.sections ?? [],
      linkedSlots: chrome.linked ?? [],
      isDirty: true,
      recentFiles: path ? rememberRecent(path, get().recentFiles) : get().recentFiles,
    }),
}))

export function documentName(path: string | null) {
  if (!path) {
    return useDocumentStore.getState().fileName || "Untitled"
  }

  const normalized = path.replace(/\\/g, "/")
  const base = normalized.slice(normalized.lastIndexOf("/") + 1)
  return base || "Untitled"
}

export type SaveStateLabel = "Saved" | "Saving…" | "Unsaved"

export function saveStateLabel(isDirty: boolean, saving: boolean): SaveStateLabel {
  if (saving) {
    return "Saving…"
  }
  return isDirty ? "Unsaved" : "Saved"
}

export function documentTitle(path: string | null, isDirty: boolean, saving = false) {
  const name = documentName(path)
  if (saving) {
    return `${name} — Saving...`
  }
  const base = isDirty ? `${name}*` : name
  return `${base} - Word`
}

/** The HTML of a header or footer kept at `home`: a section before the last by key, or `null` for the document's own. */
export function slotHtml(home: string | null, slot: ChromeSlot) {
  const state = useDocumentStore.getState()
  if (home === null) {
    return state[SLOT_FIELDS[slot]]
  }
  return state.sections.find((item) => item.key === home)?.parts[slot] ?? ""
}

/**
 * A section break that starts a page, made in the editor, ends a new section `key` before the one it is put in
 * (`before`: a section before the last by key, or `null` for the document's own). As in Word, the new section has
 * that one's page setup, and shows the same headers and footers: a copy of each it has of its own (all of them when
 * the new one is first, with nothing before to link to), the rest linked to the previous section as they were.
 */
export function insertSection(key: string, before: string | null) {
  useDocumentStore.setState((state) => {
    if (state.sections.some((item) => item.key === key)) {
      return state
    }
    const split = before ? (state.sections.find((item) => item.key === before) ?? null) : null
    const at = split ? state.sections.indexOf(split) : state.sections.length
    const setup = sectionPageSetup(state.pageSetup, split)
    const slots = {
      sections: state.sections,
      linkedSlots: state.linkedSlots,
      differentFirstPage: state.differentFirstPage,
      differentOddEven: state.pageSetup.differentOddEven,
    }
    const parts: Partial<Record<ChromeSlot, string>> = {}
    for (const slot of CHROME_SLOTS) {
      const own = split ? split.parts[slot] : state.linkedSlots.includes(slot) ? undefined : state[SLOT_FIELDS[slot]]
      if (own !== undefined) {
        parts[slot] = own
      } else if (at === 0) {
        const home = slotHome(slots, split, slot)
        parts[slot] =
          home === null
            ? state[SLOT_FIELDS[slot]]
            : (state.sections.find((item) => item.key === home)?.parts[slot] ?? "")
      }
    }
    const section: SectionChrome = {
      key,
      marginTop: setup.marginTop,
      marginBottom: setup.marginBottom,
      headerFromEdge: setup.headerFromEdge,
      footerFromEdge: setup.footerFromEdge,
      differentFirstPage: split ? split.differentFirstPage : state.differentFirstPage,
      paper: setup.paper,
      orientation: setup.orientation,
      paperWidth: setup.paperWidth,
      paperHeight: setup.paperHeight,
      marginLeft: setup.marginLeft,
      marginRight: setup.marginRight,
      columns: setup.columns,
      columnGap: setup.columnGap,
      columnLine: setup.columnLine,
      columnWidths: setup.columns > 1 ? setup.columnWidths : undefined,
      pageNumberStart: null,
      pageNumberFormat: setup.pageNumberFormat,
      parts,
      // Never opened: every part it has is written as its own when saved.
      opened: {},
    }
    const sections = [...state.sections.slice(0, at), section, ...state.sections.slice(at)]
    return { sections, isDirty: true }
  })
}

/** Replaces the header or footer kept at `home` (see `slotHtml`). */
export function setSlotHtml(home: string | null, slot: ChromeSlot, html: string) {
  const state = useDocumentStore.getState()
  if (home !== null) {
    state.setSectionPart(home, slot, html)
    return
  }
  const setters: Record<ChromeSlot, (value: string) => void> = {
    header: state.setHeader,
    footer: state.setFooter,
    firstHeader: state.setFirstHeader,
    firstFooter: state.setFirstFooter,
    evenHeader: state.setEvenHeader,
    evenFooter: state.setEvenFooter,
  }
  setters[slot](html)
}
