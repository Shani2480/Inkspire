import type { BibSource, BibStyleId } from "@/document/bibliography"
import type { NoteSettings } from "@/document/note-numbering"
import { citationOrder, writeSourcesPart } from "@/document/docx/sources-part"
import type { DocumentProtection } from "@/document/review"
import type { DocumentChrome } from "@/document/header"
import { findPart, openPackage, writePackage, type OpcPackage } from "@/document/docx/opc"
import { editorToWord, wordToEditor, type EditorView } from "@/document/docx/project"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { decodeXml, escapeXml, xmlBytes } from "@/document/docx/xml"
import { paragraphsIn, type WordDocument } from "@/document/docx/model"
import type { DocumentProps } from "@/document/store"
import type { StyleDef } from "@/document/styles"
import { currentTheme, designedCatalog, themeChanged, writeThemePart } from "@/document/design"
import { designChanged } from "@/document/docx/session"

const CORE_TYPE = "application/vnd.openxmlformats-package.core-properties+xml"
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
const APP_TYPE = "application/vnd.openxmlformats-officedocument.extended-properties+xml"
const APP_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"
const CUSTOM_TYPE = "application/vnd.openxmlformats-officedocument.custom-properties+xml"
const CUSTOM_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties"
const SIGNATURE_TYPE = "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml"
/** The property set id Word gives the custom properties it writes itself. */
const USER_DEFINED_FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}"

/** Info > Protect Document, as it is kept in the file. */
export type FileProtection = {
  /** Always Open Read-Only (w:writeProtection w:recommended in settings.xml). */
  readOnlyRecommended: boolean
  /** Mark as Final (the _MarkAsFinal custom property, and the Status property "Final"). */
  markedFinal: boolean
}

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
  const protection: FileProtection = {
    readOnlyRecommended: Boolean(word.settings.readOnlyRecommended),
    markedFinal: markedFinal(pkg),
  }
  // Digital signatures Word added: shown on Info; they sign the file as it was, so a save here leaves them out.
  const signatures = pkg.parts.filter((part) => part.contentType === SIGNATURE_TYPE).length
  return { word, view, protection, signatures }
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
  /** Track Changes and Restrict Editing as set in the app; the document's own settings when left out. */
  review?: { trackRevisions: boolean; protection: DocumentProtection | null }
  /** Footnote and endnote options set in the app for the whole document; the document's own when left out. */
  notes?: NoteSettings
  /** The document's sources and bibliography style, when they changed (or were made) in the app. */
  bibliography?: { sources: BibSource[]; style: BibStyleId }
  /** Info > Protect Document: Always Open Read-Only and Mark as Final; the document's own when left out. */
  protection?: FileProtection
  /** Encrypt with Password: the file is written encrypted, and opens only with this password. */
  password?: string | null
  /** Options > Proofing > Exceptions for this document; the document's own when left out. */
  proofing?: { hideSpelling: boolean; hideGrammar: boolean }
}) {
  const settings = input.word?.settings
  const reviewChanged =
    input.review !== undefined &&
    (Boolean(settings?.trackRevisions) !== input.review.trackRevisions ||
      JSON.stringify(settings?.protection ?? null) !== JSON.stringify(input.review.protection))
  // Older callers (and some tests) pass chrome without a page setup.
  const setup = input.chrome.pageSetup as typeof input.chrome.pageSetup | undefined
  const designed = setup ? designChanged(setup) : false
  let word =
    input.unchanged && input.word && !reviewChanged && !input.notes && !input.bibliography
      ? input.word
      : editorToWord(input.json, input.chrome, input.props ?? {}, input.word, input.styles)
  if (setup && designed) {
    // Design tab: the Style Set and Paragraph Spacing go into styles.xml, the theme into the theme part.
    word = { ...word, styles: designedCatalog(word.styles, setup, !input.word) }
  }
  if (input.review && reviewChanged) {
    word.settings = {
      ...word.settings,
      trackRevisions: input.review.trackRevisions,
      protection: input.review.protection,
    }
  }
  if (input.notes) {
    applyNoteSettings(word, input.notes)
  }
  if (
    input.proofing &&
    (Boolean(word.settings.hideSpellingErrors) !== input.proofing.hideSpelling ||
      Boolean(word.settings.hideGrammaticalErrors) !== input.proofing.hideGrammar)
  ) {
    word = {
      ...word,
      settings: {
        ...word.settings,
        hideSpellingErrors: input.proofing.hideSpelling,
        hideGrammaticalErrors: input.proofing.hideGrammar,
      },
    }
  }
  if (input.protection && Boolean(word.settings.readOnlyRecommended) !== input.protection.readOnlyRecommended) {
    word = { ...word, settings: { ...word.settings, readOnlyRecommended: input.protection.readOnlyRecommended } }
  }
  const pkg = writeDocument(word, /\.(docx|docm|dotx|dotm)$/i.test(input.fileName) ? input.fileName : "document.docx")
  if (setup && themeChanged(setup)) {
    writeThemePart(pkg, currentTheme(setup, input.word))
  }
  const final = input.protection?.markedFinal ?? markedFinal(pkg)
  attachCoreProperties(pkg, input.props ?? {}, final)
  attachAppProperties(pkg, input.props ?? {})
  if (input.protection) {
    attachMarkAsFinal(pkg, input.protection.markedFinal)
  }
  // Signatures sign the file as it was opened; written again, it is a different file, as when Word saves an edit.
  pkg.parts = pkg.parts.filter((part) => part.contentType !== SIGNATURE_TYPE && !/^\/_xmlsignatures\//i.test(part.name))
  for (const group of pkg.relationships) {
    group.items = group.items.filter((item) => !/\/digital-signature\//.test(item.type))
  }
  pkg.relationships = pkg.relationships.filter((group) => !/^\/_xmlsignatures\//i.test(group.source))
  if (input.bibliography) {
    writeSourcesPart(pkg, input.bibliography.sources, input.bibliography.style, citationOrder(input.json))
  }
  const zipped = await writePackage(pkg)
  if (input.password) {
    const { encryptPackage } = await import("@/document/docx/encryption")
    return { bytes: await encryptPackage(zipped, input.password), word }
  }
  return { bytes: zipped, word }
}

/** Whether the package carries Mark as Final (the _MarkAsFinal custom property set to true). */
function markedFinal(pkg: OpcPackage) {
  const part = pkg.parts.find((item) => item.contentType === CUSTOM_TYPE)
  if (!part) {
    return false
  }
  const property = /<(?:\w+:)?property\b[^>]*name="_MarkAsFinal"[^>]*>([\s\S]*?)<\/(?:\w+:)?property>/.exec(decodeXml(part.data))
  return Boolean(property && /<(?:\w+:)?bool>\s*(true|1)\s*<\//.test(property[1]!))
}

/**
 * Mark as Final in docProps/custom.xml, as Word writes it. The part keeps every other property; one is made when the
 * document has none.
 */
function attachMarkAsFinal(pkg: OpcPackage, final: boolean) {
  if (markedFinal(pkg) === final) {
    return
  }
  const existing = pkg.parts.find((part) => part.contentType === CUSTOM_TYPE)
  let xml = existing
    ? decodeXml(existing.data).replace(/^\uFEFF?\s*<\?xml[^>]*\?>\s*/, "")
    : `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ` +
      `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`
  xml = xml.replace(/<(\w+:)?property\b[^>]*name="_MarkAsFinal"[^>]*>[\s\S]*?<\/(?:\w+:)?property>/, "")
  if (final) {
    const prefix = /^<(\w+:)?Properties\b/.exec(xml)?.[1] ?? ""
    const vt = /xmlns:(\w+)="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/docPropsVTypes"/.exec(xml)?.[1]
    if (!vt) {
      xml = xml.replace(/^<(\w+:)?Properties\b/, (match) => `${match} xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"`)
    }
    const pid = Math.max(1, ...[...xml.matchAll(/\bpid="(\d+)"/g)].map((match) => Number(match[1]))) + 1
    const property =
      `<${prefix}property fmtid="${USER_DEFINED_FMTID}" pid="${pid}" name="_MarkAsFinal">` +
      `<${vt ?? "vt"}:bool>true</${vt ?? "vt"}:bool></${prefix}property>`
    xml = /<\/(\w+:)?Properties>\s*$/.test(xml)
      ? xml.replace(/<\/(\w+:)?Properties>\s*$/, (end) => property + end)
      : xml.replace(/<((\w+:)?Properties\b[^>]*)\/>\s*$/, `<$1>${property}</${prefix}Properties>`)
  }
  if (existing) {
    existing.data = xmlBytes(xml)
    return
  }
  pkg.parts.push({ name: "/docProps/custom.xml", contentType: CUSTOM_TYPE, data: xmlBytes(xml) })
  const root = pkg.relationships.find((group) => group.source === "")
  if (!root) {
    return
  }
  const used = new Set(pkg.relationships.flatMap((group) => group.items.map((item) => item.id)))
  let number = 1
  while (used.has(`rId${number}`)) {
    number += 1
  }
  root.items.push({
    id: `rId${number}`,
    type: CUSTOM_REL,
    target: "docProps/custom.xml",
    targetMode: "Internal",
    partName: "/docProps/custom.xml",
  })
}

/**
 * The Footnote and Endnote dialog's "Apply changes to: Whole document", as Word writes it: the settings in
 * settings.xml and in every section's w:sectPr, so no section keeps numbering of its own.
 */
function applyNoteSettings(word: WordDocument, notes: NoteSettings) {
  word.settings = { ...word.settings, footnoteProps: { ...notes.footnote }, endnoteProps: { ...notes.endnote } }
  const sections = [word.section, ...paragraphsIn(word.blocks).flatMap((paragraph) => paragraph.sectionBreak ?? [])]
  for (const section of sections) {
    if (!section) {
      continue
    }
    section.footnoteProps = { ...notes.footnote }
    section.endnoteProps = { ...notes.endnote }
  }
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
  const category = text("category")
  if (category) {
    props.category = category
  }
  const app = findPart(pkg, "/docProps/app.xml")
  const company = app ? /<(?:\w+:)?Company>([\s\S]*?)<\/(?:\w+:)?Company>/.exec(decodeXml(app.data))?.[1] : undefined
  if (company) {
    props.company = decodeXmlText(company)
  }
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

function attachCoreProperties(pkg: OpcPackage, props: Partial<DocumentProps>, final = false) {
  const created = props.createdAt || new Date().toISOString()
  const modified = new Date().toISOString()
  const body = [
    props.title ? `<dc:title>${escapeXml(props.title)}</dc:title>` : "",
    props.subject ? `<dc:subject>${escapeXml(props.subject)}</dc:subject>` : "",
    props.author ? `<dc:creator>${escapeXml(props.author)}</dc:creator>` : "",
    props.tags ? `<cp:keywords>${escapeXml(props.tags)}</cp:keywords>` : "",
    props.comments ? `<dc:description>${escapeXml(props.comments)}</dc:description>` : "",
    props.category ? `<cp:category>${escapeXml(props.category)}</cp:category>` : "",
    // Mark as Final sets the Status property too.
    final ? "<cp:contentStatus>Final</cp:contentStatus>" : "",
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

/**
 * The Company property, in docProps/app.xml as Word keeps it (DOCPROPERTY Company reads it there). A package that
 * has the part keeps everything else in it; one without gets a part with just the application and the company.
 */
function attachAppProperties(pkg: OpcPackage, props: Partial<DocumentProps>) {
  const company = props.company ?? ""
  const existing = pkg.parts.find((part) => part.contentType === APP_TYPE)
  if (existing) {
    const read = decodeXml(existing.data)
    const current = /<Company>([\s\S]*?)<\/Company>/.exec(read)?.[1]
    if (props.company === undefined || decodeXmlText(current ?? "") === company) {
      // Unchanged: the part stays byte for byte as it was read.
      return
    }
    // xmlBytes writes the declaration itself.
    let xml = read.replace(/^\uFEFF?\s*<\?xml[^>]*\?>\s*/, "")
    const element = company ? `<Company>${escapeXml(company)}</Company>` : ""
    if (/<Company\s*\/>|<Company>[\s\S]*?<\/Company>/.test(xml)) {
      xml = xml.replace(/<Company\s*\/>|<Company>[\s\S]*?<\/Company>/, element)
    } else if (element) {
      // After Template and Manager, where Word writes it.
      const after = /<\/Manager>|<Manager\s*\/>|<\/Template>|<Template\s*\/>/.exec(xml)
      xml = after
        ? xml.slice(0, after.index + after[0].length) + element + xml.slice(after.index + after[0].length)
        : xml.replace(/(<Properties\b[^>]*>)/, `$1${element}`)
    }
    existing.data = xmlBytes(xml)
    return
  }
  if (!company) {
    return
  }
  const xml =
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Company>${escapeXml(company)}</Company><Application>Inkspire</Application></Properties>`
  pkg.parts.push({ name: "/docProps/app.xml", contentType: APP_TYPE, data: xmlBytes(xml) })
  const root = pkg.relationships.find((group) => group.source === "")
  if (!root) {
    return
  }
  root.items = root.items.filter((item) => item.type !== APP_REL)
  const used = new Set(pkg.relationships.flatMap((group) => group.items.map((item) => item.id)))
  let number = 1
  while (used.has(`rId${number}`)) {
    number += 1
  }
  root.items.push({
    id: `rId${number}`,
    type: APP_REL,
    target: "docProps/app.xml",
    targetMode: "Internal",
    partName: "/docProps/app.xml",
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
