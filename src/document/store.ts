import { clearWordDocument } from "@/document/docx/session"
import type { ChromeShape, DocumentChrome } from "@/document/header"
import { pageSetupForNewDocument } from "@/document/design-format"
import { DEFAULT_PAGE_SETUP, normalizePageSetup, samePageSetup, type PageSetup } from "@/document/page-setup"
import { create } from "zustand"

type ChromeState = {
  documentHTML: string
  savedHTML: string
  headerText: string
  savedHeader: string
  footerText: string
  savedFooter: string
  differentFirstPage: boolean
  savedDifferentFirstPage: boolean
  firstHeaderText: string
  savedFirstHeader: string
  firstFooterText: string
  savedFirstFooter: string
  pageSetup: PageSetup
  savedPageSetup: PageSetup
}

function isUnsaved(state: ChromeState, next: Partial<ChromeState> = {}) {
  const html = next.documentHTML ?? state.documentHTML
  const header = next.headerText ?? state.headerText
  const footer = next.footerText ?? state.footerText
  const differentFirstPage = next.differentFirstPage ?? state.differentFirstPage
  const firstHeader = next.firstHeaderText ?? state.firstHeaderText
  const firstFooter = next.firstFooterText ?? state.firstFooterText
  const pageSetup = next.pageSetup ?? state.pageSetup
  return (
    html !== state.savedHTML ||
    header !== state.savedHeader ||
    footer !== state.savedFooter ||
    differentFirstPage !== state.savedDifferentFirstPage ||
    firstHeader !== state.savedFirstHeader ||
    firstFooter !== state.savedFirstFooter ||
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
  headerText: string
  savedHeader: string
  footerText: string
  savedFooter: string
  differentFirstPage: boolean
  savedDifferentFirstPage: boolean
  firstHeaderText: string
  savedFirstHeader: string
  firstFooterText: string
  savedFirstFooter: string
  headerShapes: ChromeShape[]
  footerShapes: ChromeShape[]
  firstHeaderShapes: ChromeShape[]
  firstFooterShapes: ChromeShape[]
  pageSetup: PageSetup
  savedPageSetup: PageSetup
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
  setDifferentFirstPage: (enabled: boolean) => void
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
  headerText: "",
  savedHeader: "",
  footerText: "",
  savedFooter: "",
  differentFirstPage: false,
  savedDifferentFirstPage: false,
  firstHeaderText: "",
  savedFirstHeader: "",
  firstFooterText: "",
  savedFirstFooter: "",
  headerShapes: [],
  footerShapes: [],
  firstHeaderShapes: [],
  firstFooterShapes: [],
  pageSetup: pageSetupForNewDocument(),
  savedPageSetup: pageSetupForNewDocument(),
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
    set((state) => ({
      headerText: header,
      isDirty: isUnsaved(state, { headerText: header }),
    })),
  setFooter: (footer) =>
    set((state) => ({
      footerText: footer,
      isDirty: isUnsaved(state, { footerText: footer }),
    })),
  setFirstHeader: (header) =>
    set((state) => ({
      firstHeaderText: header,
      isDirty: isUnsaved(state, { firstHeaderText: header }),
    })),
  setFirstFooter: (footer) =>
    set((state) => ({
      firstFooterText: footer,
      isDirty: isUnsaved(state, { firstFooterText: footer }),
    })),
  setDifferentFirstPage: (enabled) =>
    set((state) => ({
      differentFirstPage: enabled,
      isDirty: isUnsaved(state, { differentFirstPage: enabled }),
    })),
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
      headerText: "",
      savedHeader: "",
      footerText: "",
      savedFooter: "",
      differentFirstPage: false,
      savedDifferentFirstPage: false,
      firstHeaderText: "",
      savedFirstHeader: "",
      firstFooterText: "",
      savedFirstFooter: "",
      headerShapes: [],
      footerShapes: [],
      firstHeaderShapes: [],
      firstFooterShapes: [],
      pageSetup: pageSetupForNewDocument(),
      savedPageSetup: pageSetupForNewDocument(),
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
        headerText: chrome.header ?? "",
        savedHeader: chrome.header ?? "",
        footerText: chrome.footer ?? "",
        savedFooter: chrome.footer ?? "",
        differentFirstPage: chrome.differentFirstPage ?? false,
        savedDifferentFirstPage: chrome.differentFirstPage ?? false,
        firstHeaderText: chrome.firstHeader ?? "",
        savedFirstHeader: chrome.firstHeader ?? "",
        firstFooterText: chrome.firstFooter ?? "",
        savedFirstFooter: chrome.firstFooter ?? "",
        headerShapes: chrome.headerShapes ?? [],
        footerShapes: chrome.footerShapes ?? [],
        firstHeaderShapes: chrome.firstHeaderShapes ?? [],
        firstFooterShapes: chrome.firstFooterShapes ?? [],
        pageSetup: normalizePageSetup(chrome.pageSetup ?? DEFAULT_PAGE_SETUP),
        savedPageSetup: normalizePageSetup(chrome.pageSetup ?? DEFAULT_PAGE_SETUP),
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
        savedHeader: state.headerText,
        savedFooter: state.footerText,
        savedDifferentFirstPage: state.differentFirstPage,
        savedFirstHeader: state.firstHeaderText,
        savedFirstFooter: state.firstFooterText,
        savedPageSetup: state.pageSetup,
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
      headerText: chrome.header,
      savedHeader: chrome.header,
      footerText: chrome.footer,
      savedFooter: chrome.footer,
      differentFirstPage: chrome.differentFirstPage,
      savedDifferentFirstPage: chrome.differentFirstPage,
      firstHeaderText: chrome.firstHeader,
      savedFirstHeader: chrome.firstHeader,
      firstFooterText: chrome.firstFooter,
      savedFirstFooter: chrome.firstFooter,
      headerShapes: chrome.headerShapes ?? [],
      footerShapes: chrome.footerShapes ?? [],
      firstHeaderShapes: chrome.firstHeaderShapes ?? [],
      firstFooterShapes: chrome.firstFooterShapes ?? [],
      pageSetup: chrome.pageSetup,
      savedPageSetup: chrome.pageSetup,
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
