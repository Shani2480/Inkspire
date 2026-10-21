import { create } from "zustand"

/** What went wrong, in the terms the dialog explains it in. */
export type FileProblemKind =
  | "not-found"
  | "folder-missing"
  | "unsupported"
  | "legacy-word"
  | "protected"
  | "damaged"
  | "permission"
  | "read-only"
  | "in-use"
  | "disk-full"
  | "desktop-only"
  | "unknown"

export type FileOperation = "open" | "save" | "export"

/** The buttons a problem offers, besides Close. */
export type FileProblemAction = "retry" | "save-as" | "open-other" | "remove-recent" | "close"

export type FileProblem = {
  kind: FileProblemKind
  operation: FileOperation
  fileName: string
  title: string
  message: string
  /** The error as the system or reader gave it, for Details and Copy. */
  detail: string
  actions: FileProblemAction[]
}

type Context = {
  operation: FileOperation
  /** Path or name of the file; only its name is shown. */
  file?: string | null
  /** The file's first bytes, when it was read, to tell an old .doc or a password-protected file from damage. */
  bytes?: Uint8Array
  /** The file came from the Recent list, so it can be removed from it. */
  recent?: boolean
}

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function isCompoundFile(bytes: Uint8Array | undefined) {
  return Boolean(bytes && bytes.length >= 8 && CFB_SIGNATURE.every((byte, index) => bytes[index] === byte))
}

function baseName(file: string | null | undefined) {
  return (file ?? "").split(/[/\\]/).pop() || "this document"
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase()
}

export function errorDetail(error: unknown) {
  if (typeof error === "string") {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return String(error ?? "")
}

/** Sorts an error from opening or saving into one of the cases the dialog explains. */
export function classifyFileError(error: unknown, context: Pick<Context, "file" | "bytes" | "operation">) {
  const detail = errorDetail(error)
  const name = baseName(context.file)
  const ext = extensionOf(name)
  if (context.operation === "open" && isCompoundFile(context.bytes)) {
    // Word stores a password-protected .docx encrypted inside a compound file, the container .doc files use too.
    return ext === "docx" ? "protected" : "legacy-word"
  }
  // By name, not class: the reader's classes live in a part of the app that loads only when a file is opened.
  const failure = error instanceof Error ? error : null
  if (failure?.name === "MceError") {
    return "unsupported"
  }
  const code = (failure as { code?: unknown } | null)?.code
  if (failure?.name === "OpcError" && (code === "unsupported-extension" || code === "content-type-mismatch")) {
    return context.operation === "open" ? "unsupported" : "unknown"
  }
  if (failure?.name === "OpcError" || failure?.name === "WmlError" || failure?.name === "ZipError") {
    return context.operation === "open" ? "damaged" : "unknown"
  }
  const text = detail.toLowerCase()
  if (/requires the desktop app/.test(text)) {
    return "desktop-only"
  }
  if (/can only open and save|not allowed/.test(text)) {
    return "unsupported"
  }
  if (/folder for that file could not be found/.test(text)) {
    return "folder-missing"
  }
  if (/could not be found|no such file|os error 2\b|cannot find the (file|path)/.test(text)) {
    return context.operation === "open" ? "not-found" : "folder-missing"
  }
  if (/read-only file system|os error 30\b/.test(text)) {
    return "read-only"
  }
  if (/permission denied|access is denied|operation not permitted|os error (1|5|13)\b/.test(text)) {
    return "permission"
  }
  if (/used by another process|resource busy|locked|os error (16|32|33)\b/.test(text)) {
    return "in-use"
  }
  if (/no space left|not enough space|disk (is )?full|quota|os error (28|39|112)\b/.test(text)) {
    return "disk-full"
  }
  if (context.operation === "open" && /pandoc could not import/.test(text)) {
    return "damaged"
  }
  return "unknown"
}

const WORDS: Record<FileOperation, string> = { open: "open", save: "save", export: "export" }

/** The title, message and buttons for an error while opening or saving a file. */
export function describeFileProblem(error: unknown, context: Context): FileProblem {
  const kind = classifyFileError(error, context)
  const fileName = baseName(context.file)
  const verb = WORDS[context.operation]
  const opening = context.operation === "open"
  const saveActions: FileProblemAction[] = ["save-as", "retry", "close"]
  const problem = (title: string, message: string, actions: FileProblemAction[]): FileProblem => ({
    kind,
    operation: context.operation,
    fileName,
    title,
    message,
    detail: errorDetail(error),
    actions,
  })
  switch (kind) {
    case "not-found":
      return problem(
        "We couldn't find this file",
        `"${fileName}" may have been moved, renamed or deleted.`,
        context.recent ? ["open-other", "remove-recent", "close"] : ["open-other", "close"],
      )
    case "folder-missing":
      return problem(
        `We couldn't ${verb} to this folder`,
        `The folder for "${fileName}" no longer exists. Choose another place to save it.`,
        ["save-as", "close"],
      )
    case "unsupported":
      return opening
        ? problem(
            "This file type isn't supported",
            `Inkspire can't read "${fileName}". It opens Word documents (.docx), OpenDocument text (.odt), Rich Text, HTML, Markdown and plain text files.`,
            ["open-other", "close"],
          )
        : problem(
            "This file type isn't supported",
            `Inkspire can't ${verb} "${fileName}" in this format. Choose another file type.`,
            ["save-as", "close"],
          )
    case "legacy-word":
      return problem(
        "This is an older Word file",
        `"${fileName}" uses the Word 97–2003 format, which Inkspire can't open. Save it as a .docx file in Word, then open it here.`,
        ["open-other", "close"],
      )
    case "protected":
      return problem(
        "This document is password protected",
        `"${fileName}" is encrypted with a password. Inkspire can't open protected documents yet. Remove the password in Word, then open it here.`,
        ["open-other", "close"],
      )
    case "damaged":
      return problem(
        "This file can't be opened",
        `"${fileName}" seems to be damaged, or it isn't the kind of file its name says.`,
        ["open-other", "close"],
      )
    case "permission":
      return opening
        ? problem(
            "You don't have permission to open this file",
            `Your account isn't allowed to read "${fileName}". Ask its owner for access, or copy it somewhere you can read it.`,
            ["retry", "open-other", "close"],
          )
        : problem(
            "You don't have permission to save here",
            `Your account isn't allowed to write "${fileName}". Save a copy somewhere else.`,
            saveActions,
          )
    case "read-only":
      return problem(
        "This location is read-only",
        `"${fileName}" is on a drive or folder that can't be changed. Save a copy somewhere else.`,
        saveActions,
      )
    case "in-use":
      return problem(
        "This file is in use",
        `Another program has "${fileName}" open. Close it there and try again, or save a copy.`,
        opening ? ["retry", "close"] : saveActions,
      )
    case "disk-full":
      return problem(
        "There isn't enough space",
        `The drive is full, so "${fileName}" wasn't saved. Free up some space and try again, or save it to another drive.`,
        saveActions,
      )
    case "desktop-only":
      return problem(
        "This needs the desktop app",
        `Inkspire in the browser can't ${verb} "${fileName}" in this format. Use the desktop app, or choose another format.`,
        opening ? ["open-other", "close"] : ["save-as", "close"],
      )
    default:
      return problem(
        opening ? "Something went wrong opening this file" : `Something went wrong while trying to ${verb}`,
        opening
          ? `Inkspire couldn't open "${fileName}".`
          : `"${fileName}" wasn't ${context.operation === "export" ? "exported" : "saved"}. Your changes are still here.`,
        opening ? ["retry", "open-other", "close"] : saveActions,
      )
  }
}

type FileErrorState = {
  problem: FileProblem | null
  resolve: ((action: FileProblemAction) => void) | null
  show: (problem: FileProblem) => Promise<FileProblemAction>
  answer: (action: FileProblemAction) => void
}

export const useFileError = create<FileErrorState>((set, get) => ({
  problem: null,
  resolve: null,
  show: (problem) =>
    new Promise<FileProblemAction>((resolve) => {
      get().resolve?.("close")
      set({ problem, resolve })
    }),
  answer: (action) => {
    const resolve = get().resolve
    set({ problem: null, resolve: null })
    resolve?.(action)
  },
}))
