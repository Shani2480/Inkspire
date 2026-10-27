import { parseXmlEvents, type XmlOpenTag } from "@/document/docx/xml"

export const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
export const XML_NS = "http://www.w3.org/XML/1998/namespace"
export const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
export const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

/** Strict (ISO 29500) namespace and relationship URIs, longest prefix first. */
const STRICT_URIS: [string, string][] = [
  [
    "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing",
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  ],
  ["http://purl.oclc.org/ooxml/drawingml/picture", "http://schemas.openxmlformats.org/drawingml/2006/picture"],
  [
    "http://purl.oclc.org/ooxml/drawingml/chartDrawing",
    "http://schemas.openxmlformats.org/drawingml/2006/chartDrawing",
  ],
  ["http://purl.oclc.org/ooxml/drawingml/chart", "http://schemas.openxmlformats.org/drawingml/2006/chart"],
  ["http://purl.oclc.org/ooxml/drawingml/diagram", "http://schemas.openxmlformats.org/drawingml/2006/diagram"],
  [
    "http://purl.oclc.org/ooxml/drawingml/lockedCanvas",
    "http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas",
  ],
  ["http://purl.oclc.org/ooxml/drawingml/main", "http://schemas.openxmlformats.org/drawingml/2006/main"],
  ["http://purl.oclc.org/ooxml/wordprocessingml/main", WORD_NS],
  ["http://purl.oclc.org/ooxml/officeDocument/relationships", REL_NS],
  ["http://purl.oclc.org/ooxml/officeDocument/math", "http://schemas.openxmlformats.org/officeDocument/2006/math"],
]

const ALWAYS_UNDERSTOOD = new Set([MC_NS, XML_NS, "http://www.w3.org/2000/xmlns/"])

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
/**
 * DrawingML's open content: a graphic's data and an extension list's entries hold markup of any namespace, and
 * Office writes them without listing it as ignorable. The reader keeps drawings whole, so it passes them through.
 */
const OPEN_CONTENT = new Set(["graphicData", "ext"])

/** Namespaces this reader processes. Anything else must be ignorable or the document is rejected. */
export const UNDERSTOOD_NAMESPACES = new Set([
  WORD_NS,
  REL_NS,
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  "http://schemas.openxmlformats.org/drawingml/2006/picture",
  // Charts, SmartArt and locked canvases: Word declares them on the graphic itself, never as ignorable. The
  // drawing is kept whole, so understanding them means carrying them through.
  "http://schemas.openxmlformats.org/drawingml/2006/chart",
  "http://schemas.openxmlformats.org/drawingml/2006/chartDrawing",
  "http://schemas.openxmlformats.org/drawingml/2006/diagram",
  "http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas",
  "http://schemas.microsoft.com/office/drawing/2014/chartex",
  // Word's mc:Choice for a chartex chart (Requires="cx1", "cx2" for Funnel, "cx4" for Map): the drawing in it is
  // read.
  "http://schemas.microsoft.com/office/drawing/2015/9/8/chartex",
  "http://schemas.microsoft.com/office/drawing/2015/10/21/chartex",
  "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex",
  // a16:creationId and friends sit in a drawing's extension list.
  "http://schemas.microsoft.com/office/drawing/2014/main",
  // a14:useLocalDpi sits inside pictures and is not listed in mc:Ignorable.
  "http://schemas.microsoft.com/office/drawing/2010/main",
  "http://schemas.openxmlformats.org/officeDocument/2006/math",
  "http://schemas.microsoft.com/office/word/2010/wordml",
  "http://schemas.microsoft.com/office/word/2012/wordml",
  "http://schemas.microsoft.com/office/word/2015/wordml/symex",
  "http://schemas.microsoft.com/office/word/2016/wordml/cid",
  "http://schemas.microsoft.com/office/word/2018/wordml/cex",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
  "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas",
  "urn:schemas-microsoft-com:office:office",
  "urn:schemas-microsoft-com:vml",
  "urn:schemas-microsoft-com:office:word",
])

export class MceError extends Error {
  readonly code: "unknown-namespace" | "must-understand"
  readonly uri: string

  constructor(code: "unknown-namespace" | "must-understand", uri: string) {
    super(
      code === "must-understand"
        ? `Namespace must be understood: ${uri || "(unbound prefix)"}`
        : `Unknown namespace is not listed in mc:Ignorable: ${uri || "(none)"}`,
    )
    this.name = "MceError"
    this.code = code
    this.uri = uri
  }
}

export type MarkupAttribute = {
  prefix: string
  local: string
  uri: string
  value: string
}

export type MarkupEvent =
  | { type: "start"; prefix: string; local: string; uri: string; attributes: MarkupAttribute[]; start: number }
  | { type: "end"; prefix: string; local: string; uri: string; end: number }
  | { type: "text"; text: string }

type Scope = {
  ignorable: string[]
  processContent: string[]
  namespaces: Record<string, string>
}

type Frame =
  | { kind: "skip"; depth: number }
  | { kind: "alternate"; selected: boolean }
  | { kind: "branch"; take: boolean }
  | { kind: "transparent" }
  | { kind: "open"; prefix: string; local: string; uri: string }

/**
 * Markup Compatibility preprocessor (ECMA-376-3). Strict namespaces are rewritten to
 * Transitional before a namespace is tested. The selected AlternateContent branch is
 * emitted in place; ignorable markup this reader does not understand is dropped.
 */
export function filterMarkup(
  xml: string,
  visit: (event: MarkupEvent) => void,
  understood: ReadonlySet<string> = UNDERSTOOD_NAMESPACES,
) {
  const scopes: Scope[] = []
  const stack: Frame[] = []

  let openContent = 0
  // A Choice is taken only for namespaces the reader really knows, open content or not.
  const understands = (uri: string) => {
    if (!uri) {
      return false
    }
    const mapped = transitionalUri(uri)
    return ALWAYS_UNDERSTOOD.has(mapped) || understood.has(mapped)
  }
  const knows = (uri: string) => Boolean(uri) && (openContent > 0 || understands(uri))

  const ignorable = () => scopes.flatMap((scope) => scope.ignorable)
  const processing = () => scopes.flatMap((scope) => scope.processContent)

  const namespacesFor = (tag: XmlOpenTag) => ({
    xml: XML_NS,
    ...scopes[scopes.length - 1]?.namespaces,
    ...tag.namespaces,
  })

  const pushScope = (tag: XmlOpenTag) => {
    const namespaces = namespacesFor(tag)
    const mustUnderstand = prefixedUris(tag, "MustUnderstand", namespaces)
    for (const uri of mustUnderstand) {
      if (!knows(uri)) {
        throw new MceError("must-understand", uri)
      }
    }
    scopes.push({
      ignorable: prefixedUris(tag, "Ignorable", namespaces),
      processContent: prefixedUris(tag, "ProcessContent", namespaces),
      namespaces,
    })
  }

  parseXmlEvents(xml, {
    start(tag) {
      const top = stack[stack.length - 1]
      if (top?.kind === "skip") {
        top.depth += 1
        return
      }
      if (top?.kind === "branch" && !top.take) {
        stack.push({ kind: "skip", depth: 1 })
        return
      }
      if (top?.kind === "alternate") {
        if (isMc(tag, "Choice") || isMc(tag, "Fallback")) {
          const take =
            !top.selected && (isMc(tag, "Fallback") || requiresUnderstood(tag, namespacesFor(tag), understands))
          if (take) {
            top.selected = true
            pushScope(tag)
          }
          stack.push({ kind: "branch", take })
          return
        }
        stack.push({ kind: "skip", depth: 1 })
        return
      }
      if (isMc(tag, "AlternateContent")) {
        pushScope(tag)
        stack.push({ kind: "alternate", selected: false })
        return
      }

      const uri = transitionalUri(tag.uri)
      const namespaces = namespacesFor(tag)
      const ignored = new Set(ignorable())
      const processed = new Set(processing())
      for (const declared of prefixedUris(tag, "Ignorable", namespaces)) {
        ignored.add(declared)
      }
      for (const declared of prefixedUris(tag, "ProcessContent", namespaces)) {
        processed.add(declared)
      }
      if (!knows(uri)) {
        if (ignored.has(uri)) {
          if (processed.has(uri)) {
            pushScope(tag)
            stack.push({ kind: "transparent" })
            return
          }
          stack.push({ kind: "skip", depth: 1 })
          return
        }
        throw new MceError("unknown-namespace", uri)
      }

      pushScope(tag)
      visit({
        type: "start",
        prefix: tag.prefix,
        local: tag.local,
        uri,
        attributes: keptAttributes(tag, ignored, knows),
        start: tag.start,
      })
      stack.push({ kind: "open", prefix: tag.prefix, local: tag.local, uri })
      if (uri === DRAWING_NS && OPEN_CONTENT.has(tag.local)) {
        openContent += 1
      }
    },
    end(tag) {
      const top = stack[stack.length - 1]
      if (!top) {
        return
      }
      if (top.kind === "skip") {
        top.depth -= 1
        if (top.depth === 0) {
          stack.pop()
        }
        return
      }
      stack.pop()
      if (top.kind === "branch") {
        if (top.take) {
          scopes.pop()
        }
        return
      }
      if (top.kind === "open") {
        if (top.uri === DRAWING_NS && OPEN_CONTENT.has(top.local)) {
          openContent -= 1
        }
        scopes.pop()
        visit({ type: "end", prefix: top.prefix, local: top.local, uri: top.uri, end: tag.end })
        return
      }
      scopes.pop()
    },
    text(text) {
      if (textSuppressed(stack[stack.length - 1])) {
        return
      }
      visit({ type: "text", text })
    },
  })
}

export function transitionalUri(uri: string) {
  for (const [strict, transitional] of STRICT_URIS) {
    if (uri === strict || uri.startsWith(`${strict}/`)) {
      return transitional + uri.slice(strict.length)
    }
  }
  return uri
}

function keptAttributes(tag: XmlOpenTag, ignored: Set<string>, knows: (uri: string) => boolean) {
  const attributes: MarkupAttribute[] = []
  for (const attribute of tag.attributes) {
    const uri = transitionalUri(attribute.uri)
    if (!attribute.uri || knows(uri)) {
      attributes.push({
        prefix: attribute.prefix,
        local: attribute.local,
        uri,
        value: attribute.value.startsWith("http://purl.oclc.org/ooxml/")
          ? transitionalUri(attribute.value)
          : attribute.value,
      })
      continue
    }
    if (ignored.has(uri)) {
      continue
    }
    throw new MceError("unknown-namespace", uri)
  }
  return attributes
}

function prefixedUris(tag: XmlOpenTag, local: string, namespaces: Record<string, string>) {
  const attribute = tag.attributes.find((item) => item.uri === MC_NS && item.local === local)
  if (!attribute) {
    return []
  }
  const uris: string[] = []
  for (const prefix of attribute.value.split(/\s+/)) {
    if (!prefix) {
      continue
    }
    uris.push(transitionalUri(namespaces[prefix] ?? ""))
  }
  return uris
}

function requiresUnderstood(tag: XmlOpenTag, namespaces: Record<string, string>, knows: (uri: string) => boolean) {
  const attribute = tag.attributes.find((item) => item.local === "Requires")
  if (!attribute) {
    return false
  }
  const prefixes = attribute.value.split(/\s+/).filter(Boolean)
  return prefixes.every((prefix) => knows(transitionalUri(namespaces[prefix] ?? "")))
}

function isMc(tag: XmlOpenTag, local: string) {
  return tag.uri === MC_NS && tag.local === local
}

function textSuppressed(top: Frame | undefined) {
  if (!top || top.kind === "open" || top.kind === "transparent") {
    return false
  }
  if (top.kind === "branch") {
    return !top.take
  }
  return true
}
