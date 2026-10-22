import { useBackstage } from "@/document/backstage"
import { invokeWithTools } from "@/document/helper-tools"
import {
  closeThisWindow,
  focusWindow,
  hasOtherWindows,
  openWindow,
  takeHandoff,
  windowWithPath,
  type WindowRequest,
} from "@/document/windows"
import { flushPendingEdit, getDocumentEditor } from "@/document/editor-ref"
import { emptyChrome, packDocument, unpackDocument, type DocumentChrome } from "@/document/header"
import { useOptimizeDialog } from "@/document/optimize-dialog-state"
import { documentWithObjectPictures, restoreObjects } from "@/document/object-pictures"
import { clearWordDocument, currentWordDocument, rememberWordDocument } from "@/document/docx/session"
import { htmlToMarkdown, markdownToHtml } from "@/document/markdown"
import { rtfToHtml } from "@/document/rtf"
import {
  bindRecoverySession,
  clearRecovery,
  discardRecovery,
  listRecoveryOffers,
  resetRecoverySession,
  writeRecoveryDraft,
  type RecoveryOffer,
} from "@/document/recovery"
import { describeFileProblem, useFileError, type FileOperation } from "@/document/file-errors"
import { playDocumentEntrance } from "@/document/motion"
import { useSavePrompt } from "@/document/save-prompt"
import { defaultStyles, packStyles, stylesFromWord, unpackStyles, useStyleStore } from "@/document/styles"
import { useEditingOptions } from "@/document/editing-options"
import { documentName, useDocumentStore, type DocumentProps } from "@/document/store"
import { useViewStore } from "@/document/view"
import { paperSize, printPages } from "@/document/print-copy"
import {
  fileExtension,
  openDroppedFile,
  openLocalFile,
  pickOpenPath,
  readBytes,
  pickSavePath,
  writeBytes,
  writeText,
  type FileFilter,
  type OpenedFile,
} from "@/lib/file-io"
import { openExternal } from "@/document/help"
import { isTauriRuntime } from "@/lib/platform"
import { EditorState } from "@tiptap/pm/state"
import { invoke } from "@tauri-apps/api/core"
import { message } from "@tauri-apps/plugin-dialog"

// The .docx reader and writer (and the zip library under them) are large and needed only once a file is opened or
// saved, so they load then rather than when the app starts.
const docxIo = () => import("@/document/docx/io")
const docxOptimizer = () => import("@/document/docx/optimize")

export const BLANK_DOCUMENT_HTML = '<p style="text-align: left;"></p>'

const OPEN_FILTERS: FileFilter[] = [
  { name: "Documents", extensions: ["docx", "html", "htm", "md", "txt", "rtf", "odt"] },
  { name: "Word Document", extensions: ["docx"] },
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "Markdown", extensions: ["md"] },
  { name: "Plain Text", extensions: ["txt"] },
  { name: "Rich Text", extensions: ["rtf"] },
  { name: "OpenDocument Text", extensions: ["odt"] },
]

const SAVE_FILTERS: FileFilter[] = [
  { name: "Word Document", extensions: ["docx"] },
  { name: "OpenDocument Text", extensions: ["odt"] },
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "PDF", extensions: ["pdf"] },
  { name: "Markdown", extensions: ["md"] },
  { name: "Plain Text", extensions: ["txt"] },
  { name: "Rich Text", extensions: ["rtf"] },
]

export type ExportFormat = "docx" | "pdf" | "md" | "html" | "txt" | "odt" | "rtf"

const DEFAULT_SAVE_EXT = "docx"

let running = false

function currentHTML() {
  const editor = getDocumentEditor()
  return editor ? editor.getHTML() : useDocumentStore.getState().documentHTML
}

function currentChrome(): DocumentChrome {
  const state = useDocumentStore.getState()
  return {
    header: state.headerHtml,
    footer: state.footerHtml,
    differentFirstPage: state.differentFirstPage,
    firstHeader: state.firstHeaderHtml,
    evenHeader: state.evenHeaderHtml,
    firstFooter: state.firstFooterHtml,
    evenFooter: state.evenFooterHtml,
    pageSetup: state.pageSetup,
  }
}

function fileStem(path: string | null | undefined) {
  const name = documentName(path ?? null).replace(/\.[^.]+$/, "")
  return name || "Document"
}

function ensureExtension(path: string, ext: string) {
  const clean = ext.replace(/^\./, "").toLowerCase() || DEFAULT_SAVE_EXT
  const normalized = path.replace(/[/\\]+$/, "")
  const stripped = normalized.replace(/\.(html|htm|docx|odt|pdf|md|txt|rtf)$/i, "")
  return `${stripped}.${clean}`
}

function saveFiltersFor(ext: string) {
  const preferred = SAVE_FILTERS.find((filter) => filter.extensions.includes(ext))
  if (!preferred) {
    return SAVE_FILTERS
  }
  return [preferred, ...SAVE_FILTERS.filter((filter) => filter !== preferred)]
}

function stripTags(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message
    if (typeof message === "string" && message.trim()) {
      return message
    }
  }
  return "The request could not be completed."
}

export async function reportError(error: unknown) {
  const text = errorMessage(error)
  if (!isTauriRuntime()) {
    console.error(text)
    return
  }
  await message(text, { title: "Inkspire", kind: "error" })
}

/**
 * Explains a failed open or save in the app's own dialog and resolves with the button chosen. In the desktop app
 * and the browser alike, so a problem is never only in the console.
 */
function askAboutFileProblem(
  error: unknown,
  context: { operation: FileOperation; file?: string | null; bytes?: Uint8Array; recent?: boolean },
) {
  console.error(error)
  return useFileError.getState().show(describeFileProblem(error, context))
}

const TEXT_EXTENSIONS = new Set(["html", "htm", "md", "txt", "rtf"])

async function openedFromPath(path: string): Promise<OpenedFile> {
  const bytes = await readBytes(path)
  const name = path.split(/[/\\]/).pop() ?? path
  return {
    path,
    name,
    bytes,
    text: TEXT_EXTENSIONS.has(fileExtension(name)) ? new TextDecoder().decode(bytes) : undefined,
  }
}

/** Asks for a file and opens it. In the desktop app the path is known before it is read, so a failed read names it. */
/** Resolves false when the picker was cancelled. */
async function openPickedFile() {
  if (isTauriRuntime()) {
    const path = await pickOpenPath(OPEN_FILTERS, "Open")
    if (path) {
      await openWithRecovery(() => openedFromPath(path), path)
    }
    return Boolean(path)
  }
  let picked = false
  await openWithRecovery(async () => {
    const file = await openLocalFile(OPEN_FILTERS, "Open")
    picked = Boolean(file)
    return file
  }, null)
  return picked
}

/**
 * Reads and opens a file. When that fails the error dialog says why and offers what fits: try again, open another
 * file, or take a missing file off the Recent list.
 */
async function openWithRecovery(read: () => Promise<OpenedFile | null>, label: string | null, recent = false) {
  let file: OpenedFile | null = null
  try {
    file = await read()
    if (file) {
      await loadOpenedFile(file)
    }
    return
  } catch (error) {
    const action = await askAboutFileProblem(error, {
      operation: "open",
      file: file?.path ?? file?.name ?? label,
      bytes: file?.bytes,
      recent,
    })
    if (action === "retry") {
      await openWithRecovery(read, label, recent)
    } else if (action === "open-other") {
      await openPickedFile()
    } else if (action === "remove-recent" && label) {
      useDocumentStore.getState().forgetRecent(label)
    }
  }
}

function runExclusive<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (running) {
    return Promise.resolve(undefined)
  }
  running = true
  return task().finally(() => {
    running = false
  })
}

function applyEditorHtml(
  html: string,
  chrome: Partial<DocumentChrome> = {},
  path: string | null = null,
  fileName?: string,
  props?: Partial<DocumentProps>,
  exactWhitespace = false,
) {
  const editor = getDocumentEditor()
  if (!editor) {
    return false
  }
  // A Word document's HTML has no layout whitespace, and every space in it is text (a run ending in a space).
  editor.commands.setContent(html, {
    emitUpdate: false,
    ...(exactWhitespace ? { parseOptions: { preserveWhitespace: "full" as const } } : {}),
  })
  restoreObjects(editor)
  useDocumentStore.getState().markOpened(path, editor.getHTML(), { ...emptyChrome(), ...chrome }, fileName, props)
  // However the file arrived (dropped, recent list, opened from the system), show it rather than the File menu.
  useBackstage.getState().closeBackstage()
  startProofing()
  enterDocument()
  return true
}

async function loadOpenedFile(file: OpenedFile) {
  const editor = getDocumentEditor()
  if (!editor) {
    return
  }
  // Prior dirty draft stays in IndexedDB for the Unsaved Documents rail.
  resetRecoverySession()
  clearWordDocument()
  // Each document has its own styles: a Word or Inkspire file brings them, anything else starts from the defaults.
  useStyleStore.getState().load(defaultStyles())
  const ext = fileExtension(file.name || file.path || "")
  if (ext === "docx") {
    const opened = await (await docxIo()).openDocxBytes(file.bytes, file.name || file.path || "document.docx")
    rememberWordDocument(opened.word)
    useStyleStore.getState().load(stylesFromWord(opened.word))
    applyEditorHtml(opened.view.html, opened.view.chrome, file.path, file.name, opened.view.props, true)
    return
  }
  if (ext === "odt") {
    if (!isTauriRuntime() || !file.path) {
      throw new Error("Opening .odt requires the desktop app.")
    }
    const html = await invokeWithTools<string>("import_document", { path: file.path })
    applyEditorHtml(html, emptyChrome(), file.path, file.name)
    return
  }
  if (ext === "rtf") {
    if (isTauriRuntime() && file.path) {
      const html = await invokeWithTools<string>("import_document", { path: file.path })
      applyEditorHtml(html, emptyChrome(), file.path, file.name)
      return
    }
    const raw = file.text ?? new TextDecoder().decode(file.bytes)
    applyEditorHtml(rtfToHtml(raw), emptyChrome(), file.path, file.name)
    return
  }
  const raw = file.text ?? new TextDecoder().decode(file.bytes)
  if (ext === "html" || ext === "htm") {
    const withStyles = unpackStyles(raw)
    useStyleStore.getState().load(withStyles.styles ?? defaultStyles())
    const unpacked = unpackDocument(withStyles.html)
    applyEditorHtml(unpacked.html, unpacked, file.path, file.name)
    return
  }
  if (ext === "md") {
    applyEditorHtml(markdownToHtml(raw), emptyChrome(), file.path, file.name)
    return
  }
  if (ext !== "txt") {
    // An old .doc or any other binary would show as garbage; the error dialog explains it instead.
    throw new Error("Inkspire can only open and save .docx, .odt, .rtf, .html, .md, .txt, and .pdf files.")
  }
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
  applyEditorHtml(`<p>${escaped}</p>`, emptyChrome(), file.path, file.name)
}

/**
 * Whether this window can take the next document instead of a new window opening for it, as Word reuses its
 * untouched Document1: no document is open, or it is a new blank one with nothing written in it.
 */
export function untouchedHere() {
  if (useBackstage.getState().closed) {
    return true
  }
  const { currentFilePath, isDirty } = useDocumentStore.getState()
  const doc = getDocumentEditor()?.state.doc
  return (
    !currentFilePath &&
    !isDirty &&
    Boolean(doc) &&
    doc!.textContent.trim() === "" &&
    doc!.childCount <= 1 &&
    doc!.firstChild?.type.name === "paragraph" &&
    useDocumentStore.getState().headerHtml === "" &&
    useDocumentStore.getState().footerHtml === ""
  )
}

/**
 * File > Open: here when this window is untouched, otherwise in a window of its own. Resolves false when the
 * picker was cancelled, so the caller can stay where it was.
 */
export async function openDocument() {
  const picked = await runExclusive(async () => {
    if (untouchedHere()) {
      return openPickedFile()
    }
    if (isTauriRuntime()) {
      const path = await pickOpenPath(OPEN_FILTERS, "Open")
      if (path) {
        await openPathInWindow(path)
      }
      return Boolean(path)
    }
    const file = await openLocalFile(OPEN_FILTERS, "Open").catch(() => null)
    // A browser that blocks the new tab gets the file here, as before.
    if (file && !openWindow({ kind: "handoff", handoff: { kind: "file", file } }) && (await confirmCloseDocument())) {
      await openWithRecovery(async () => file, file.name)
    }
    return Boolean(file)
  })
  return picked === true
}

/** Opens a file in a window of its own; one already open in a window is brought to the front instead. */
async function openPathInWindow(path: string) {
  if (useDocumentStore.getState().currentFilePath === path) {
    useBackstage.getState().closeBackstage()
    return
  }
  const open = windowWithPath(path)
  if (open) {
    await focusWindow(open).catch(() => undefined)
    return
  }
  openWindow({ kind: "path", path })
}

/** Opens a file from the Recent list. A missing one stays listed until the user removes it, as in Word. */
export function openRecentDocument(path: string) {
  runExclusive(async () => {
    if (untouchedHere()) {
      await openWithRecovery(() => openedFromPath(path), path, true)
    } else if (await readable(path)) {
      await openPathInWindow(path)
    } else {
      // Checked here, before any window or view changes: the dialog appears over the Recent list, which stays.
      await openWithRecovery(() => openedFromPath(path), path, true)
    }
  })
}

async function readable(path: string) {
  try {
    await readBytes(path)
    return true
  } catch {
    return false
  }
}

/** Files dropped on the window: the first here when this window is untouched, every other in a window of its own. */
export function openDroppedDocuments(files: FileList | File[]) {
  const list = [...files].filter((file) => /\.(docx|odt|html?|md|txt|rtf)$/i.test(file.name))
  if (!list.length) {
    return
  }
  const here = untouchedHere() ? list.shift() : undefined
  const left: File[] = []
  for (const file of list) {
    const path = isTauriRuntime() ? (file as File & { path?: string }).path : undefined
    const opened = path
      ? openWindow({ kind: "path", path })
      : openWindow({ kind: "handoff", handoff: { kind: "dropped", file } })
    if (!opened) {
      left.push(file)
    }
  }
  // The browser blocked the tabs: the first of them opens here instead, after asking about this document.
  const first = here ?? left[0]
  if (!first) {
    return
  }
  runExclusive(async () => {
    if (await confirmCloseDocument()) {
      await openWithRecovery(() => openDroppedFile(first), first.name)
    }
  })
}

/** Ctrl+N: a new blank document, in this window when it is untouched. */
export function newDocumentWindow() {
  if (untouchedHere() || !openWindow({ kind: "blank" })) {
    void applyTemplateDocument(BLANK_DOCUMENT_HTML, true).then((opened) => {
      if (opened) {
        useBackstage.getState().closeBackstage()
      }
    })
  }
}

/** What this window was opened for (see windows.ts): a file, a handed-over file or template, or a blank document. */
export async function openWindowRequest(request: WindowRequest) {
  if (request.kind === "blank") {
    newBlankDocument()
    useBackstage.getState().closeBackstage()
    return
  }
  if (request.kind === "path") {
    await openWithRecovery(() => openedFromPath(request.path), request.path, true)
    return
  }
  if (request.kind === "recovery") {
    const offer = (await listRecoveryOffers()).find((item) => item.id === request.id)
    if (offer) {
      await restoreRecoveryDocument(offer)
    }
    return
  }
  const handoff = await takeHandoff(request.id)
  if (!handoff) {
    return
  }
  if (handoff.kind === "html") {
    newBlankDocument(handoff.html)
    useBackstage.getState().closeBackstage()
  } else if (handoff.kind === "dropped") {
    await openWithRecovery(() => openDroppedFile(handoff.file), handoff.file.name)
  } else {
    await openWithRecovery(async () => handoff.file, handoff.file.name)
  }
}

export function saveDocument() {
  runExclusive(async () => {
    await saveCurrent()
  })
}

/** Saves to the open file, or asks where to save a new one. Resolves false when nothing was saved. */
async function saveCurrent() {
  const path = useDocumentStore.getState().currentFilePath
  return path ? writeDocument(path) : saveAs()
}

/**
 * Before the open document is closed or replaced: when it has unsaved changes, asks as Word does whether to save
 * them. Resolves true when it is fine to go ahead (saved, or the changes were let go), false on Cancel or a save
 * that did not happen. Changes let go stay in the recovery copy, under Unsaved Documents.
 */
export async function confirmCloseDocument() {
  flushPendingEdit()
  const { isDirty, currentFilePath } = useDocumentStore.getState()
  if (!isDirty) {
    return true
  }
  const choice = await useSavePrompt.getState().ask(documentName(currentFilePath))
  if (choice === "cancel") {
    return false
  }
  if (choice === "discard") {
    if (useViewStore.getState().autoSave) {
      await writeRecoveryDraft().catch(() => undefined)
    }
    return true
  }
  return saveCurrent()
}

export function saveDocumentAs() {
  void runExclusive(() => saveAs())
}

/**
 * Opens the default mail program with a copy of the document attached. The desktop app attaches the file; where
 * that is not possible (the web, Windows) a message with the title is opened and the user attaches the file from
 * Save As.
 */
export async function emailDocument() {
  const props = useDocumentStore.getState().documentProps
  const subject = props.title || fileStem(useDocumentStore.getState().currentFilePath)
  if (isTauriRuntime()) {
    try {
      const editor = getDocumentEditor()
      const word = currentWordDocument()
      const fileName = `${fileStem(useDocumentStore.getState().currentFilePath)}.docx`
      const saved = await (
        await docxIo()
      ).saveDocxBytes({
        json: editor ? await documentWithObjectPictures(editor) : { type: "doc", content: [] },
        chrome: currentChrome(),
        props,
        word,
        unchanged: Boolean(word) && !useDocumentStore.getState().isDirty,
        styles: useStyleStore.getState().styles,
        fileName,
      })
      await invoke("email_document", { fileName, bytes: Array.from(saved.bytes), subject })
      return "attached" as const
    } catch (error) {
      console.warn("Could not attach the document.", error)
    }
  }
  await openExternal(`mailto:?subject=${encodeURIComponent(subject)}`)
  return "message" as const
}

/** The document as it would be saved to .docx right now, for the size optimizer (21.48). */
async function currentDocxBytes(fileName: string) {
  const editor = getDocumentEditor()
  const word = currentWordDocument()
  const saved = await (
    await docxIo()
  ).saveDocxBytes({
    json: editor ? await documentWithObjectPictures(editor) : { type: "doc", content: [] },
    chrome: currentChrome(),
    props: useDocumentStore.getState().documentProps,
    word,
    unchanged: Boolean(word) && !useDocumentStore.getState().isDirty,
    styles: useStyleStore.getState().styles,
    fileName,
  })
  return saved.bytes
}

/** Finds what the saved file would carry without using and shows it; nothing changes until a copy is saved. */
export async function optimizeDocumentSize() {
  const fileName = `${fileStem(useDocumentStore.getState().currentFilePath)}.docx`
  try {
    const bytes = await currentDocxBytes(fileName)
    const findings = await (await docxOptimizer()).analyzeDocx(bytes, fileName)
    useOptimizeDialog.getState().show({ fileName, bytes, findings })
  } catch (error) {
    await askAboutFileProblem(error, { operation: "save", file: fileName })
  }
}

/** Writes the optimized file as a copy; the open document and its file are left as they are. */
export async function saveOptimizedCopy(fileName: string, bytes: Uint8Array) {
  const selected = await pickSavePath(
    [{ name: "Word Document", extensions: ["docx"] }],
    fileName.replace(/\.docx$/i, "") + " (optimized).docx",
    "Save optimized copy",
  )
  if (!selected) {
    return null
  }
  const result = await (await docxOptimizer()).optimizeDocx(bytes, fileName)
  await writeBytes(ensureExtension(selected, "docx"), result.bytes)
  return result
}

/** Resolves false when the picker was cancelled or the file was not written. */
export async function saveDocumentAsFormat(ext: string) {
  return (await runExclusive(() => saveAs(ext || DEFAULT_SAVE_EXT))) === true
}

/** The page of document properties some people print after the document (Options > Display > Print document properties). */
export function propertiesPage(props: DocumentProps, name: string) {
  const rows: [string, string][] = [
    ["File", name],
    ["Title", props.title],
    ["Subject", props.subject],
    ["Author", props.author],
    ["Company", props.company],
    ["Category", props.category],
    ["Tags", props.tags],
    ["Comments", props.comments],
    ["Created", props.createdAt ? new Date(props.createdAt).toLocaleString() : ""],
    ["Last printed", props.lastPrintedAt ? new Date(props.lastPrintedAt).toLocaleString() : ""],
  ]
  const page = document.createElement("div")
  page.className = "print-properties"
  const heading = document.createElement("h1")
  heading.textContent = "Document properties"
  const list = document.createElement("dl")
  for (const [label, value] of rows) {
    if (value) {
      const term = document.createElement("dt")
      term.textContent = label
      const detail = document.createElement("dd")
      detail.textContent = value
      list.append(term, detail)
    }
  }
  page.append(heading, list)
  return page
}

/**
 * Lays the pages out for printing as the editor drew them (see print-copy.ts): the header and footer with their
 * pictures and fields, the first and even pages' own, page numbers, watermark and border print as on screen. Resolves
 * to a function that takes it all down again. Without laid-out pages (Web Layout, Read Mode) the body flows through
 * the browser's own pagination, with the header and footer text in the page's margin boxes, as before.
 */
export function stagePrintPages() {
  const source = document.querySelector<HTMLElement>("#document-scroll .page-canvas")
  const pages = source && useViewStore.getState().layoutMode === "print" ? printPages(source) : null
  const paper = source ? paperSize(source) : null
  if (!pages || !paper) {
    return () => {}
  }
  const style = document.createElement("style")
  style.id = "print-pages-paper"
  // The margin boxes hold the header and footer text of the flow path; here they are on the sheets.
  const boxes = ["@top-center", "@bottom-center", "@bottom-right"]
    .map((box) => `    ${box} {\n      content: none;\n    }`)
    .join("\n")
  style.textContent = `@media print {\n  @page {\n    size: ${paper.width} ${paper.height};\n    margin: 0;\n${boxes}\n  }\n  @page :first {\n${boxes}\n  }\n}`
  document.head.append(style)
  document.body.append(pages)
  document.documentElement.dataset.printPages = "1"
  return () => {
    delete document.documentElement.dataset.printPages
    pages.remove()
    style.remove()
  }
}

export function printDocument() {
  const { currentFilePath, documentProps } = useDocumentStore.getState()
  const page = useEditingOptions.getState().printProperties
    ? propertiesPage(documentProps, documentName(currentFilePath))
    : null
  document.querySelectorAll(".print-properties, .print-pages").forEach((old) => old.remove())
  const unstage = stagePrintPages()
  if (page) {
    document.body.append(page)
  }
  window.addEventListener(
    "afterprint",
    () => {
      page?.remove()
      unstage()
    },
    { once: true },
  )
  useDocumentStore.getState().setDocumentProps({ lastPrintedAt: new Date().toISOString() })
  window.print()
}

export function newBlankDocument(html = BLANK_DOCUMENT_HTML) {
  const editor = getDocumentEditor()
  if (!editor) {
    return false
  }
  // Leave any dirty snapshot in IndexedDB so it appears under Unsaved Documents.
  resetRecoverySession()
  useStyleStore.getState().load(defaultStyles())
  useDocumentStore.getState().startUntitled(html)
  editor.commands.setContent(html, { emitUpdate: false })
  const next = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  })
  editor.view.updateState(next)
  // The editor writes the blank page its own way; that, not the template's HTML, is the unchanged document.
  useDocumentStore.getState().adoptBaseline(editor.getHTML(), true)
  startProofing()
  editor.commands.focus("start")
  enterDocument()
  return true
}

/**
 * Every document starts with spelling checked as you type. Turning it off lasts until the next document is created
 * or opened.
 */
/** A document that has just been created, opened or recovered: spelling is checked, and the body is edited. */
function startProofing() {
  useViewStore.getState().setSpellCheck(true)
  useViewStore.getState().setEditingChrome(false)
}

/** A new document from a template (or blank): here when this window is untouched, otherwise in a new window. */
export async function applyTemplateDocument(html: string, here = false) {
  if (!here && !untouchedHere() && openWindow({ kind: "handoff", handoff: { kind: "html", html } })) {
    return true
  }
  return (await confirmCloseDocument()) && newBlankDocument(html)
}

/**
 * File > Close and Ctrl+W: asks to save a changed document, then shows the File view with no document open, as Word
 * does. Behind it the editor holds an empty blank document, which New or Open replaces.
 */
export async function closeDocument() {
  if (!(await confirmCloseDocument())) {
    return false
  }
  // With other documents open, Word closes the window with the document.
  if ((await hasOtherWindows().catch(() => false)) && (await closeThisWindow().catch(() => false))) {
    return true
  }
  if (!newBlankDocument()) {
    return false
  }
  useBackstage.getState().setClosed(true)
  useBackstage.getState().openBackstage("home")
  return true
}

/** A document is now in the editor. After Close the File view was kept open for it; it now gives way. */
function enterDocument() {
  const backstage = useBackstage.getState()
  if (backstage.closed) {
    backstage.setClosed(false)
    backstage.closeBackstage()
  }
  playDocumentEntrance()
}

export function exportDocument(format: ExportFormat) {
  runExclusive(() => exportAs(format))
}

async function exportAs(format: string): Promise<boolean> {
  const current = useDocumentStore.getState().currentFilePath
  const selected = await pickSavePath(
    [{ name: format.toUpperCase(), extensions: [format] }],
    `${fileStem(current)}.${format}`,
    `Export as ${format.toUpperCase()}`,
  )
  if (!selected) {
    return false
  }
  return writeDocument(ensureExtension(selected, format), format, "export")
}

export function insertHtmlAsNewDocument(html: string) {
  const editor = getDocumentEditor()
  if (!editor) {
    return "missing" as const
  }
  if (useDocumentStore.getState().isDirty) {
    return "dirty" as const
  }
  resetRecoverySession()
  useStyleStore.getState().load(defaultStyles())
  useDocumentStore.getState().startUntitled(BLANK_DOCUMENT_HTML)
  editor.commands.setContent(html, { emitUpdate: false })
  const next = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  })
  editor.view.updateState(next)
  useDocumentStore.getState().noteEdit(editor.getHTML())
  editor.commands.focus("start")
  enterDocument()
  return "ok" as const
}

/**
 * Unsaved Documents > Restore: the draft opens in a window of its own and the document already open is left alone.
 * Only an untouched Document1 takes it in place, and so does a browser that blocks the new tab (after offering to save
 * what is open). Resolves false when the person backed out.
 */
export async function openRecoveryDocument(offer: RecoveryOffer) {
  if (!untouchedHere() && openWindow({ kind: "recovery", id: offer.id })) {
    return true
  }
  if (!(await confirmCloseDocument())) {
    return false
  }
  await restoreRecoveryDocument(offer)
  return true
}

export async function restoreRecoveryDocument(offer: RecoveryOffer) {
  const editor = getDocumentEditor()
  if (!editor) {
    return
  }
  const withStyles = unpackStyles(offer.packedHtml)
  useStyleStore.getState().load(withStyles.styles ?? defaultStyles())
  const unpacked = unpackDocument(withStyles.html)
  if (offer.json && typeof offer.json === "object") {
    editor.commands.setContent(offer.json, { emitUpdate: false })
  } else {
    editor.commands.setContent(unpacked.html, { emitUpdate: false })
  }
  const next = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  })
  editor.view.updateState(next)
  useDocumentStore.getState().applyRecovery(offer.meta.sourcePath, editor.getHTML(), {
    header: unpacked.header,
    footer: unpacked.footer,
    differentFirstPage: unpacked.differentFirstPage,
    firstHeader: unpacked.firstHeader,
    evenHeader: unpacked.evenHeader,
    firstFooter: unpacked.firstFooter,
    evenFooter: unpacked.evenFooter,
    pageSetup: unpacked.pageSetup,
  })
  await discardRecovery(offer.id)
  useBackstage.getState().closeBackstage()
  startProofing()
  bindRecoverySession(offer.meta.sourcePath ? `path:${offer.meta.sourcePath}` : `session:${crypto.randomUUID()}`)
  editor.commands.focus("start")
  enterDocument()
}

async function saveAs(preferredExt = DEFAULT_SAVE_EXT) {
  const ext = preferredExt.replace(/^\./, "").toLowerCase() || DEFAULT_SAVE_EXT
  const current = useDocumentStore.getState().currentFilePath
  const selected = await pickSavePath(saveFiltersFor(ext), `${fileStem(current)}.${ext}`, "Save As")
  if (!selected) {
    return false
  }
  return writeDocument(ensureExtension(selected, ext), ext)
}

/**
 * Resolves true once the document is written. When writing fails the error dialog explains why; Try Again writes
 * the same file again and Save As… asks for another place.
 */
async function writeDocument(path: string, forceExt?: string, operation: FileOperation = "save"): Promise<boolean> {
  const ext = (forceExt || fileExtension(path)).toLowerCase()
  let failure: unknown
  useDocumentStore.getState().setSaving(true)
  try {
    const html = currentHTML()
    const editor = getDocumentEditor()
    const chrome = currentChrome()
    const props = useDocumentStore.getState().documentProps

    if (ext === "docx") {
      const json = editor ? await documentWithObjectPictures(editor) : { type: "doc", content: [] }
      const word = currentWordDocument()
      const saved = await (
        await docxIo()
      ).saveDocxBytes({
        json,
        chrome,
        props,
        word,
        unchanged: Boolean(word) && !useDocumentStore.getState().isDirty,
        styles: useStyleStore.getState().styles,
        fileName: path.split(/[/\\]/).pop() || "document.docx",
      })
      rememberWordDocument(saved.word)
      await writeBytes(path, saved.bytes)
    } else if (ext === "odt" || ext === "pdf" || ext === "rtf") {
      if (!isTauriRuntime()) {
        throw new Error(`Saving .${ext} requires the desktop app.`)
      }
      await invokeWithTools<void>("export_document", {
        html,
        path,
        title: props.title || null,
        author: props.author || null,
        subject: props.subject || null,
        keywords: props.tags || null,
        description: props.comments || null,
      })
    } else if (ext === "md") {
      await writeText(path, htmlToMarkdown(html))
    } else if (ext === "txt") {
      await writeText(path, stripTags(html))
    } else {
      await writeText(path, packStyles(useStyleStore.getState().styles) + packDocument(html, chrome))
    }

    if (ext !== "pdf") {
      useDocumentStore.getState().markSaved(path, html)
      await clearRecovery()
    }
    return true
  } catch (error) {
    failure = error
  } finally {
    useDocumentStore.getState().setSaving(false)
  }
  console.error(failure)
  const problem = describeFileProblem(failure, { operation, file: path })
  const action = await useFileError.getState().show(problem)
  if (action === "retry") {
    return writeDocument(path, forceExt, operation)
  }
  if (action === "save-as") {
    // A format this build can't write is swapped for a Word document; otherwise the same format, somewhere else.
    const next = problem.kind === "desktop-only" || problem.kind === "unsupported" ? DEFAULT_SAVE_EXT : ext
    return operation === "export" && next === ext ? exportAs(ext) : saveAs(next)
  }
  return false
}
