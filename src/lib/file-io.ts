import { isTauriRuntime } from "@/lib/platform"
import { open as tauriOpen, save as tauriSave } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { readFile as fsReadFile, writeFile as fsWriteFile } from "@tauri-apps/plugin-fs"
import { isContentUri, pathBaseName, sniffExtension } from "@/lib/paths"

export { isContentUri, pathBaseName } from "@/lib/paths"

export type FileFilter = { name: string; extensions: string[] }

export type OpenedFile = {
  path: string | null
  name: string
  bytes: Uint8Array
  text?: string
}

const ACCEPT_MAP: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  txt: "text/plain",
  rtf: "application/rtf",
  json: "application/json",
}

function extOf(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name
  const dot = base.lastIndexOf(".")
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase()
}

function acceptFromFilters(filters: FileFilter[]) {
  const accept: Record<string, string[]> = {}
  for (const filter of filters) {
    for (const ext of filter.extensions) {
      const mime = ACCEPT_MAP[ext] ?? "application/octet-stream"
      accept[mime] = [...(accept[mime] ?? []), `.${ext}`]
    }
  }
  return accept
}

type AndroidPicker = { openDocument(mimeTypesJson: string): void }

/**
 * Android's document picker, through MainActivity: it grants read and write access that lasts, where the dialog
 * plugin's picker grants a read-only copy, so Save can write back to the file.
 */
function pickAndroidDocument(filters: FileFilter[]): Promise<string | null> | null {
  const files = (globalThis as { InkspireFiles?: Partial<AndroidPicker> }).InkspireFiles
  if (!files?.openDocument) {
    return null
  }
  const mimeTypes = [...new Set(filters.flatMap((filter) => filter.extensions.map((ext) => ACCEPT_MAP[ext] ?? "")))]
  const openDocument = files.openDocument.bind(files)
  return new Promise((resolve) => {
    const host = globalThis as { __inkspirePicked?: (uri: string | null) => void }
    host.__inkspirePicked = (uri) => {
      delete host.__inkspirePicked
      resolve(uri)
    }
    openDocument(JSON.stringify(mimeTypes.filter(Boolean)))
  })
}

export async function pickOpenPath(filters: FileFilter[], title = "Open"): Promise<string | null> {
  const android = pickAndroidDocument(filters)
  if (android) {
    return android
  }
  if (isTauriRuntime()) {
    const selected = await tauriOpen({ title, multiple: false, filters })
    return typeof selected === "string" ? selected : null
  }

  if (typeof window.showOpenFilePicker === "function") {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: title, accept: acceptFromFilters(filters) }],
      })
      const file = await handles[0].getFile()
      return file.name
    } catch {
      return null
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",")
    input.onchange = () => resolve(input.files?.[0]?.name ?? null)
    input.click()
  })
}

export async function pickSavePath(
  filters: FileFilter[],
  defaultPath: string,
  title = "Save As",
): Promise<string | null> {
  if (isTauriRuntime()) {
    const selected = await tauriSave({ title, filters, defaultPath })
    return selected ?? null
  }

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultPath.split(/[/\\]/).pop() ?? defaultPath,
        types: [{ description: title, accept: acceptFromFilters(filters) }],
      })
      return handle.name
    } catch {
      return null
    }
  }

  return defaultPath
}

/** A name to open a file under: its own, or with the extension its bytes show when the name has none we read. */
export function namedForOpening(path: string, bytes: Uint8Array) {
  const name = pathBaseName(path)
  return KNOWN_EXTENSIONS.has(extOf(name)) ? name : `${name}.${sniffExtension(bytes)}`
}

const KNOWN_EXTENSIONS = new Set([...Object.keys(ACCEPT_MAP), "doc", "docm", "dotx"])

// The fs plugin is scoped to app data. User documents go through Rust commands
// that check the path and extension (src-tauri/src/lib.rs read_document / write_document);
// Android's content links go through the fs plugin, which opens them with the content resolver.
async function readDocumentBytes(path: string): Promise<Uint8Array> {
  if (isContentUri(path)) {
    return fsReadFile(path)
  }
  return new Uint8Array(await invoke<ArrayBuffer>("read_document", { path }))
}

async function writeDocumentBytes(path: string, data: Uint8Array): Promise<void> {
  if (isContentUri(path)) {
    await fsWriteFile(path, data)
    return
  }
  await invoke("write_document", data, { headers: { "x-document-path": encodeURIComponent(path) } })
}

export async function readBytes(path: string): Promise<Uint8Array> {
  if (isTauriRuntime()) {
    return readDocumentBytes(path)
  }
  throw new Error("Binary read requires a Tauri path or a File handle.")
}

export async function readText(path: string): Promise<string> {
  if (isTauriRuntime()) {
    return new TextDecoder().decode(await readDocumentBytes(path))
  }
  throw new Error("Text read requires a Tauri path or a File handle.")
}

export async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  if (isTauriRuntime()) {
    await writeDocumentBytes(path, data)
    return
  }
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  downloadBlob(new Blob([copy]), path.split(/[/\\]/).pop() ?? "download.bin")
}

export async function writeText(path: string, data: string): Promise<void> {
  if (isTauriRuntime()) {
    await writeDocumentBytes(path, new TextEncoder().encode(data))
    return
  }
  downloadBlob(new Blob([data], { type: "text/plain;charset=utf-8" }), path.split(/[/\\]/).pop() ?? "download.txt")
}

export async function openLocalFile(filters: FileFilter[], title = "Open"): Promise<OpenedFile | null> {
  if (isTauriRuntime()) {
    const path = await pickOpenPath(filters, title)
    if (!path) {
      return null
    }
    const bytes = await readDocumentBytes(path)
    const name = namedForOpening(path, bytes)
    const textExt = new Set(["html", "htm", "md", "txt", "rtf"])
    const text = textExt.has(extOf(name)) ? new TextDecoder().decode(bytes) : undefined
    return { path, name, bytes, text }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",")
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const buffer = new Uint8Array(await file.arrayBuffer())
      const textExt = new Set(["html", "htm", "md", "txt", "rtf"])
      resolve({
        path: null,
        name: file.name,
        bytes: buffer,
        text: textExt.has(extOf(file.name)) ? new TextDecoder().decode(buffer) : undefined,
      })
    }
    input.click()
  })
}

export async function openDroppedFile(file: File): Promise<OpenedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const textExt = new Set(["html", "htm", "md", "txt", "rtf"])
  return {
    path: isTauriRuntime() ? ((file as File & { path?: string }).path ?? null) : null,
    name: file.name,
    bytes,
    text: textExt.has(extOf(file.name)) ? new TextDecoder().decode(bytes) : undefined,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** A file's extension; for an Android content link, that of the name the link stands for. */
export function fileExtension(path: string) {
  return extOf(isContentUri(path) ? pathBaseName(path) : path)
}

const SETTINGS_FILTERS: FileFilter[] = [{ name: "Customizations", extensions: ["json"] }]

/**
 * Saves a settings file (Export all customizations) where the user chooses; in the browser it is downloaded.
 * Resolves false when the choice was cancelled. The desktop app writes only .json this way (`write_settings_file`).
 */
export async function saveSettingsFile(name: string, text: string, title: string): Promise<boolean> {
  if (isTauriRuntime()) {
    const path = await tauriSave({ title, filters: SETTINGS_FILTERS, defaultPath: name })
    if (!path) {
      return false
    }
    if (isContentUri(path)) {
      await fsWriteFile(path, new TextEncoder().encode(text))
    } else {
      await invoke("write_settings_file", { path, text })
    }
    return true
  }
  downloadBlob(new Blob([text], { type: "application/json;charset=utf-8" }), name)
  return true
}

/** Opens a settings file the user picks (Import customization file); null when the choice was cancelled. */
export async function openSettingsFile(title: string): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = await pickOpenPath(SETTINGS_FILTERS, title)
    if (path && isContentUri(path)) {
      return new TextDecoder().decode(await fsReadFile(path))
    }
    return path ? invoke<string>("read_settings_file", { path }) : null
  }
  const opened = await openLocalFile(SETTINGS_FILTERS, title)
  return opened ? new TextDecoder().decode(opened.bytes) : null
}
