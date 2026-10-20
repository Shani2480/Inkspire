import type { DocumentChrome } from "@/document/header"
import { findPart, openPackage, writePackage, type OpcPackage } from "@/document/docx/opc"
import { editorToWord, wordToEditor, type EditorView } from "@/document/docx/project"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { decodeXml, escapeXml, xmlBytes } from "@/document/docx/xml"
import type { WordDocument } from "@/document/docx/model"
import type { DocumentProps } from "@/document/store"
import type { StyleDef } from "@/document/styles"

const CORE_TYPE = "application/vnd.openxmlformats-package.core-properties+xml"
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"

type JsonNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
  content?: JsonNode[]
}

export async function openDocxBytes(bytes: Uint8Array, fileName = "document.docx") {
  const pkg = await openPackage(bytes, fileName)
  const word = readDocument(pkg)
  const view: EditorView = { ...wordToEditor(word), props: coreProperties(pkg) }
  return { word, view }
}

export async function saveDocxBytes(input: {
  json: JsonNode
  chrome: DocumentChrome
  props?: Partial<DocumentProps>
  word: WordDocument | null
  unchanged: boolean
  fileName: string
  /** The document's styles; the built-ins when left out. */
  styles?: StyleDef[]
}) {
  const word =
    input.unchanged && input.word
      ? input.word
      : editorToWord(input.json, input.chrome, input.props ?? {}, input.word, input.styles)
  const pkg = writeDocument(word, input.fileName.endsWith(".docx") ? input.fileName : "document.docx")
  attachCoreProperties(pkg, input.props ?? {})
  return { bytes: await writePackage(pkg), word }
}

function coreProperties(pkg: OpcPackage): Partial<DocumentProps> {
  const part = findPart(pkg, "/docProps/core.xml")
  if (!part) {
    return {}
  }
  const xml = decodeXml(part.data)
  const text = (name: string) => {
    const match = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`))
    return match?.[1] ? decodeXmlText(match[1]) : undefined
  }
  const props: Partial<DocumentProps> = {}
  const title = text("title")
  const subject = text("subject")
  const author = text("creator")
  const tags = text("keywords")
  const comments = text("description")
  const createdAt = text("created")
  if (title) {
    props.title = title
  }
  if (subject) {
    props.subject = subject
  }
  if (author) {
    props.author = author
  }
  if (tags) {
    props.tags = tags
  }
  if (comments) {
    props.comments = comments
  }
  if (createdAt) {
    props.createdAt = createdAt
  }
  return props
}

function attachCoreProperties(pkg: OpcPackage, props: Partial<DocumentProps>) {
  const created = props.createdAt || new Date().toISOString()
  const modified = new Date().toISOString()
  const body = [
    props.title ? `<dc:title>${escapeXml(props.title)}</dc:title>` : "",
    props.subject ? `<dc:subject>${escapeXml(props.subject)}</dc:subject>` : "",
    props.author ? `<dc:creator>${escapeXml(props.author)}</dc:creator>` : "",
    props.tags ? `<cp:keywords>${escapeXml(props.tags)}</cp:keywords>` : "",
    props.comments ? `<dc:description>${escapeXml(props.comments)}</dc:description>` : "",
    `<cp:lastModifiedBy>${escapeXml(props.author || "")}</cp:lastModifiedBy>`,
    `<dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(created)}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(modified)}</dcterms:modified>`,
  ].join("")
  const xml =
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `${body}</cp:coreProperties>`
  pkg.parts = pkg.parts.filter((part) => part.contentType !== CORE_TYPE)
  pkg.parts.push({ name: "/docProps/core.xml", contentType: CORE_TYPE, data: xmlBytes(xml) })
  const root = pkg.relationships.find((group) => group.source === "")
  if (!root) {
    return
  }
  root.items = root.items.filter((item) => item.type !== CORE_REL)
  const used = new Set(pkg.relationships.flatMap((group) => group.items.map((item) => item.id)))
  let number = 1
  while (used.has(`rId${number}`)) {
    number += 1
  }
  root.items.push({
    id: `rId${number}`,
    type: CORE_REL,
    target: "docProps/core.xml",
    targetMode: "Internal",
    partName: "/docProps/core.xml",
  })
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}
