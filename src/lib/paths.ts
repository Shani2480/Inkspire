/** Android's file picker hands back `content://` links, not paths; only the fs plugin can open them. */
export function isContentUri(path: string) {
  return path.startsWith("content://")
}

type AndroidFiles = { displayName(uri: string): string | null }

const displayNames = new Map<string, string | null>()

/** The name Android's file manager shows for a content link (MainActivity's `InkspireFiles`), asked once per link. */
function androidDisplayName(uri: string) {
  const files = (globalThis as { InkspireFiles?: AndroidFiles }).InkspireFiles
  if (!files) {
    return null
  }
  if (!displayNames.has(uri)) {
    let name: string | null = null
    try {
      name = files.displayName(uri)
    } catch {
      // The provider refused: fall back to the link itself.
    }
    displayNames.set(uri, name || null)
  }
  return displayNames.get(uri) ?? null
}

/**
 * The file name in a path or an Android `content://` link. A document link ends in its encoded id, which for local
 * storage is the path (`primary%3ADocuments%2FReport.docx`); other providers give an id with no name in it.
 */
export function pathBaseName(path: string) {
  if (!isContentUri(path)) {
    return path.split(/[/\\]/).pop() || path
  }
  const shown = androidDisplayName(path)
  if (shown) {
    return shown
  }
  const last = path.slice(path.lastIndexOf("/") + 1)
  let decoded = last
  try {
    decoded = decodeURIComponent(last)
  } catch {
    // A malformed escape: keep the raw segment.
  }
  return decoded.split(/[/:]/).pop() || decoded
}

/** The extension a file's first bytes show, for a link whose name has none: .docx is a zip, the others are text. */
export function sniffExtension(bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart()
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "docx"
  }
  if (head.startsWith("{\\rtf")) {
    return "rtf"
  }
  if (head.startsWith("%PDF")) {
    return "pdf"
  }
  if (head.startsWith("<")) {
    return "html"
  }
  return "txt"
}
