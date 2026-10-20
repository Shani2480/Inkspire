import { SaxesParser } from "saxes"

export class XmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "XmlError"
  }
}

export type XmlElement = {
  name: string
  attributes: Record<string, string>
}

/** Decode a part, including UTF-8 and UTF-16 byte-order marks. */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes)
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
}

/**
 * Stream start tags from an XML document. A DOCTYPE is an error: Office XML forbids DTDs,
 * and expanding their entities is unsafe.
 */
export function parseElements(xml: string, visit: (element: XmlElement) => void) {
  const parser = new SaxesParser({ xmlns: false })
  let failure: Error | null = null
  const fail = (error: Error) => {
    failure ??= error
  }
  parser.on("error", (error: Error) => {
    fail(error instanceof Error ? error : new XmlError(String(error)))
  })
  parser.on("doctype", () => {
    fail(new XmlError("DOCTYPE is not allowed in Office XML."))
  })
  parser.on("opentag", (tag) => {
    if (failure) {
      return
    }
    const attributes: Record<string, string> = {}
    for (const [key, value] of Object.entries(tag.attributes)) {
      attributes[key] = typeof value === "string" ? value : String(value)
    }
    visit({ name: tag.name, attributes })
  })
  parser.write(xml)
  parser.close()
  if (failure) {
    throw failure
  }
}

export type XmlAttribute = {
  name: string
  prefix: string
  local: string
  uri: string
  value: string
}

export type XmlOpenTag = {
  prefix: string
  local: string
  uri: string
  attributes: XmlAttribute[]
  namespaces: Record<string, string>
  /** Offsets of the start tag in the source string ("<" and just after ">"). */
  start: number
  end: number
}

export type XmlCloseTag = {
  prefix: string
  local: string
  uri: string
  /** Offset just after the end tag (or the self-closing start tag) in the source string. */
  end: number
}

/**
 * Namespace-aware stream of a part. Used by the Markup Compatibility filter before
 * WordprocessingML sees the elements. A DOCTYPE is an error.
 */
export function parseXmlEvents(
  xml: string,
  handlers: {
    start: (tag: XmlOpenTag) => void
    end: (tag: XmlCloseTag) => void
    text: (text: string) => void
  },
) {
  const parser = new SaxesParser({ xmlns: true })
  let failure: Error | null = null
  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new XmlError(String(error))
  }
  const guard = (read: () => void) => {
    if (failure) {
      return
    }
    try {
      read()
    } catch (error) {
      fail(error)
    }
  }
  parser.on("error", (error: Error) => {
    fail(error)
  })
  parser.on("doctype", () => {
    fail(new XmlError("DOCTYPE is not allowed in Office XML."))
  })
  // saxes reports positions in UTF-16 code units, the same units as string indices.
  parser.on("opentag", (tag) => {
    const end = parser.position
    guard(() => handlers.start({ ...openTag(tag), start: xml.lastIndexOf("<", end - 1), end }))
  })
  parser.on("closetag", (tag) => {
    guard(() => handlers.end({ ...closeTag(tag), end: parser.position }))
  })
  parser.on("text", (text: string) => {
    guard(() => handlers.text(text))
  })
  parser.on("cdata", (text: string) => {
    guard(() => handlers.text(text))
  })
  parser.write(xml)
  parser.close()
  if (failure) {
    throw failure
  }
}

function openTag(tag: {
  name: string
  prefix?: string
  local?: string
  uri?: string
  ns?: Record<string, string>
  attributes: Record<string, string | { name: string; prefix: string; local: string; uri: string; value: string }>
}): Omit<XmlOpenTag, "start" | "end"> {
  const attributes: XmlAttribute[] = []
  for (const value of Object.values(tag.attributes)) {
    if (typeof value === "string") {
      continue
    }
    attributes.push({
      name: value.name,
      prefix: value.prefix,
      local: value.local,
      uri: value.uri,
      value: value.value,
    })
  }
  return {
    prefix: tag.prefix ?? "",
    local: tag.local ?? tag.name,
    uri: tag.uri ?? "",
    attributes,
    namespaces: { ...(tag.ns ?? {}) },
  }
}

function closeTag(tag: { name: string; prefix?: string; local?: string; uri?: string }): Omit<XmlCloseTag, "end"> {
  return {
    prefix: tag.prefix ?? "",
    local: tag.local ?? tag.name,
    uri: tag.uri ?? "",
  }
}

export function attribute(element: XmlElement, name: string) {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(element.attributes)) {
    if (key.toLowerCase() === target) {
      return value
    }
  }
  return ""
}

export function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Element text. Quotes stay literal so field instructions match Word. */
export function escapeXmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** UTF-8 XML document: declaration, CRLF, then the root on one line. */
export function xmlBytes(root: string) {
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${root}`)
}
