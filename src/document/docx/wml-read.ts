import { elementChildren, snapshot, type ElementSource } from "@/document/docx/element-source"
import { isStrictMarkup, transitionalMarkup, transitionalUriOf } from "@/document/docx/strict"
import { filterMarkup, REL_NS, WORD_NS, XML_NS, type MarkupAttribute } from "@/document/docx/mce"
import {
  INKSPIRE_OBJECT_NS,
  docDefaultsFingerprint,
  styleFingerprint,
  BORDER_VALUES,
  BREAK_TYPES,
  FIELD_CHAR_TYPES,
  FONT_HINTS,
  HEADER_FOOTER_TYPES,
  HIGHLIGHT_VALUES,
  JC_VALUES,
  LINE_RULES,
  MERGE_VALUES,
  MULTI_LEVEL_TYPES,
  NOTE_TYPES,
  NUMBER_FORMATS,
  PAGE_ORIENTATIONS,
  SECTION_TYPES,
  SHADING_VALUES,
  STYLE_TYPES,
  TAB_ALIGNS,
  TAB_LEADERS,
  TABLE_LAYOUTS,
  TABLE_WIDTH_TYPES,
  UNDERLINE_VALUES,
  VERTICAL_ALIGNS,
  W14_NS,
  emptyNumbering,
  emptyParagraph,
  paragraphsIn,
  tableGrid,
  type AbstractNumbering,
  type Block,
  type Border,
  type CellMargins,
  type Comment,
  type CommentEx,
  type CommentExtensible,
  type CommentId,
  type CommentPart,
  type HeaderFooterRef,
  type Indent,
  type Inline,
  type Language,
  type NumberingDefinitions,
  type NumberingInstance,
  type NumberingLevel,
  type GlossaryPackage,
  type MediaPart,
  type Note,
  type NotePart,
  type NumberingRef,
  type Paragraph,
  type CellLook,
  type TableStyleFormat,
  type TableStylePart,
  TABLE_CONDITIONS,
  paragraphPropertiesInput,
  tablePropertiesInput,
  rowPropertiesInput,
  rowExceptionsInput,
  cellPropertiesInput,
  type AnchorAxis,
  type DrawingLayout,
  type PartLinks,
  type PeoplePart,
  type Person,
  type PreservedPackage,
  type ParagraphProperties,
  type RootAttribute,
  type SavedPart,
  type RunContent,
  type RunFonts,
  type RunProperties,
  type LineNumbering,
  type PageBorders,
  type SectionProps,
  type Settings,
  type Spacing,
  type Style,
  type StyleCatalog,
  type TabStop,
  type Table,
  type TablePosition,
  type Underline,
  type WordDocument,
  type WordNote,
} from "@/document/docx/model"
import {
  findPart,
  isPassthroughPart,
  isUnknownPart,
  partKey,
  relationshipsFor,
  type OpcPackage,
  type OpcPart,
} from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

const REL_TYPES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/",
]
const W15_NS = "http://schemas.microsoft.com/office/word/2012/wordml"
const W16CID_NS = "http://schemas.microsoft.com/office/word/2016/wordml/cid"
const W16CEX_NS = "http://schemas.microsoft.com/office/word/2018/wordml/cex"
const COMMENTS_EXTENDED_REL = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended"
const COMMENTS_IDS_REL = "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds"
const COMMENTS_EXTENSIBLE_REL = "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible"
const PEOPLE_REL = "http://schemas.microsoft.com/office/2011/relationships/people"
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

export class WmlError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "WmlError"
    this.code = code
  }
}

type MarkupNode = {
  local: string
  uri: string
  attributes: MarkupAttribute[]
  children: MarkupNode[]
  text: string
  /** The part's text and this element's span in it, so markup the model does not cover can be kept as written. */
  source?: string
  start?: number
  end?: number
}

type Piece =
  | { type: "run"; rPr: RunProperties; content: RunContent[]; rsidR?: string }
  | { type: "bookmarkStart"; id: number; name: string }
  | { type: "bookmarkEnd"; id: number }
  | { type: "simpleField"; instr: string; inlines: Inline[] }
  | { type: "hyperlink"; relId?: string; anchor?: string; history?: boolean; inlines: Inline[] }
  | { type: "commentRangeStart"; id: number }
  | { type: "commentRangeEnd"; id: number }
  | { type: "ins"; id: number; author?: string; date?: string; inlines: Inline[] }
  | { type: "del"; id: number; author?: string; date?: string; inlines: Inline[] }
  | { type: "raw"; xml: string; text: string }

type RawKind = "drawing" | "sdt" | "math"
type RawCursor = { take(kind: RawKind): string | undefined }
const NO_RAW: RawCursor = { take: () => undefined }

const PRESERVED_MARKUP = new Map<string, RawKind>([
  ["AlternateContent", "drawing"],
  ["drawing", "drawing"],
  ["pict", "drawing"],
  ["sdt", "sdt"],
  ["oMathPara", "math"],
  ["oMath", "math"],
])

function rawCursor(xml: string): RawCursor {
  const items = preservedMarkup(xml)
  let index = 0
  return {
    take(kind) {
      const item = items[index]
      if (!item || item.kind !== kind) {
        return undefined
      }
      index += 1
      return transitionalMarkup(item.xml)
    },
  }
}

type MarkupTag = { start: number; end: number; local: string; closing: boolean; selfClosing: boolean }

/** Element tags of a part in source order, skipping comments, declarations, and processing instructions. */
function scanTags(xml: string, visit: (tag: MarkupTag) => void) {
  let index = 0
  while (index < xml.length) {
    const start = xml.indexOf("<", index)
    if (start < 0) {
      break
    }
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4)
      index = end < 0 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith("<?", start) || xml.startsWith("<!", start)) {
      const end = xml.indexOf(">", start + 2)
      index = end < 0 ? xml.length : end + 1
      continue
    }
    const closing = xml[start + 1] === "/"
    const nameStart = start + (closing ? 2 : 1)
    let nameEnd = nameStart
    while (nameEnd < xml.length && /[A-Za-z0-9:_-]/.test(xml[nameEnd] ?? "")) {
      nameEnd += 1
    }
    const name = xml.slice(nameStart, nameEnd)
    const colon = name.indexOf(":")
    const local = colon < 0 ? name : name.slice(colon + 1)
    let cursor = nameEnd
    let quote = ""
    while (cursor < xml.length) {
      const character = xml[cursor] ?? ""
      if (quote) {
        if (character === quote) {
          quote = ""
        }
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === ">") {
        break
      }
      cursor += 1
    }
    const end = cursor + 1
    visit({ start, end, local, closing, selfClosing: cursor > nameEnd && xml[cursor - 1] === "/" })
    index = end
  }
}

/** Original markup for drawings, content controls, and equations, outermost element only. */
function preservedMarkup(xml: string) {
  const items: { kind: RawKind; xml: string }[] = []
  const stack: { local: string; start: number; kind?: RawKind }[] = []
  scanTags(xml, ({ start, end, local, closing, selfClosing }) => {
    if (closing) {
      for (let frame = stack.length - 1; frame >= 0; frame -= 1) {
        const item = stack.pop()
        if (item?.local === local) {
          if (item.kind) {
            items.push({ kind: item.kind, xml: xml.slice(item.start, end) })
          }
          break
        }
      }
      return
    }
    const nested = stack.some((frame) => frame.kind)
    const kind = nested ? undefined : PRESERVED_MARKUP.get(local)
    stack.push({ local, start, kind })
    if (selfClosing) {
      const item = stack.pop()
      if (item?.kind) {
        items.push({ kind: item.kind, xml: xml.slice(item.start, end) })
      }
    }
  })
  return items
}

/** Children of the root element as written, with their qualified names. */
function rootChildMarkup(xml: string) {
  const children: { name: string; xml: string }[] = []
  let depth = 0
  let open = { start: 0, name: "" }
  scanTags(xml, ({ start, end, closing, selfClosing }) => {
    if (closing) {
      depth -= 1
      if (depth === 1) {
        children.push({ name: open.name, xml: xml.slice(open.start, end) })
      }
      return
    }
    if (depth === 1) {
      open = { start, name: /^<([A-Za-z0-9:_-]+)/.exec(xml.slice(start, end))?.[1] ?? "" }
      if (selfClosing) {
        children.push({ name: open.name, xml: xml.slice(start, end) })
        return
      }
    }
    if (!selfClosing) {
      depth += 1
    }
  })
  return children
}

export function readDocument(pkg: OpcPackage): WordDocument {
  const main = findPart(pkg, pkg.mainPartName)
  if (!main) {
    throw new WmlError("missing-main-part", "The package has no main document part.")
  }
  const doc = readWordXml({
    documentXml: decodeXml(main.data),
    stylesXml: partXml(pkg, "styles"),
    settingsXml: partXml(pkg, "settings"),
    numberingXml: partXml(pkg, "numbering"),
  })
  attachStories(pkg, doc)
  attachNotes(pkg, doc)
  attachComments(pkg, doc)
  attachPeople(pkg, doc)
  attachMedia(pkg, doc)
  attachGlossary(pkg, doc)
  attachPreserved(pkg, doc)
  bindHyperlinks(pkg, doc)
  return doc
}

export function readWordXml(input: {
  documentXml: string
  stylesXml?: string
  settingsXml?: string
  numberingXml?: string
}): WordDocument {
  const notes: WordNote[] = []
  const document = parseDocument(input.documentXml)
  const styles = readStyles(input.stylesXml, notes)
  const settings = readSettings(input.settingsXml, notes)
  const numbering = readNumberingPart(input.numberingXml, notes)
  const body = wordChild(document, "body")
  if (!body) {
    throw new WmlError("missing-body", "The document has no w:body element.")
  }
  const blocks: Block[] = []
  let section: SectionProps | null = null
  const raw = rawCursor(input.documentXml)
  blocks.push(...readBlockChildren(body, notes, raw))
  const sectPr = wordChild(body, "sectPr")
  if (sectPr) {
    section = readSection(sectPr)
  }
  for (const block of blocks) {
    if (block.kind !== "table" || block.grid.length > 0) {
      continue
    }
    block.grid = tableGrid(block, section)
    notes.push({ code: "missing-table-grid", message: "A table has no w:tblGrid. A grid was generated." })
  }
  noteParagraphs(blocks, styles, notes)
  if (!section) {
    notes.push({ code: "missing-sect-pr", message: "The body has no sectPr. The writer supplies the A4 default." })
  }
  dropUnpairedBookmarks(blocks, notes)
  flattenUnbalancedFields(blocks, notes)
  return {
    blocks,
    section,
    styles,
    numbering,
    settings,
    rootAttributes: copiedAttributes(document),
    notes,
  }
}

function partXml(pkg: OpcPackage, name: "styles" | "settings" | "numbering") {
  const relationship = relationshipsFor(pkg, pkg.mainPartName).find((item) =>
    REL_TYPES.some((base) => item.type === `${base}${name}`),
  )
  if (!relationship?.partName) {
    return undefined
  }
  const part = findPart(pkg, relationship.partName)
  return part ? decodeXml(part.data) : undefined
}

function parseDocument(xml: string) {
  let root: MarkupNode
  try {
    root = buildTree(xml)
  } catch (error) {
    throw new WmlError("broken-document", error instanceof Error ? error.message : "The main part is not usable XML.")
  }
  const document = root.children.find((node) => node.uri === WORD_NS && node.local === "document")
  if (!document) {
    throw new WmlError("missing-document", "The main part has no w:document element.")
  }
  return document
}

function readStyles(xml: string | undefined, notes: WordNote[]): StyleCatalog {
  const catalog: StyleCatalog = { docDefaults: { pPr: {}, rPr: {} }, styles: [] }
  if (xml === undefined) {
    notes.push({ code: "missing-styles", message: "The document has no styles part." })
    return catalog
  }
  let root: MarkupNode
  try {
    root = parseAnyRoot(xml, "styles")
  } catch (error) {
    notes.push({
      code: "broken-styles",
      message: error instanceof Error ? error.message : "styles.xml is not usable.",
    })
    return catalog
  }
  const defaults = wordChild(root, "docDefaults")
  if (defaults) {
    const rPr = wordChild(wordChild(defaults, "rPrDefault"), "rPr")
    const pPr = wordChild(wordChild(defaults, "pPrDefault"), "pPr")
    const paragraph = pPr ? readParagraphFormatting(pPr) : undefined
    catalog.docDefaults.rPr = rPr ? readRunProperties(rPr) : (paragraph?.markRPr ?? {})
    catalog.docDefaults.pPr = paragraph?.pPr ?? {}
  }
  for (const node of wordChildren(root, "style")) {
    const style = readStyle(node)
    if (style) {
      catalog.styles.push(style)
    }
  }
  // Strict markup is converted first, so both conformance classes can be written back as they were.
  const source = transitionalMarkup(xml)
  const rootTag = /<(?:[A-Za-z0-9_-]+:)?styles\b[^>]*>/.exec(source)?.[0] ?? ""
  if (rootTag.includes(`="${WORD_NS}"`)) {
    const children = rootChildMarkup(source)
    const byId = new Map(
      children.filter((child) => child.name === "w:style").map((child) => [styleIdOf(child.xml), child.xml]),
    )
    for (const style of catalog.styles) {
      const markup = byId.get(style.id)
      if (markup) {
        style.raw = { xml: markup, model: styleFingerprint(style) }
      }
    }
    catalog.raw = { rootAttributes: copiedAttributes(root), children, docDefaults: docDefaultsFingerprint(catalog) }
  }
  return catalog
}

function styleIdOf(xml: string) {
  return decodeEntities(/^<w:style\b[^>]*\sw:styleId="([^"]*)"/.exec(xml)?.[1] ?? "")
}

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function readStyle(node: MarkupNode): Style | undefined {
  const type = oneOf(attr(node, "type"), STYLE_TYPES)
  const id = attr(node, "styleId")
  if (!type || !id) {
    return undefined
  }
  const paragraph = wordChild(node, "pPr")
  const formatting = paragraph ? readParagraphFormatting(paragraph) : undefined
  const rPr = wordChild(node, "rPr")
  const style: Style = {
    id,
    type,
    pPr: formatting?.pPr ?? {},
    rPr: rPr ? readRunProperties(rPr) : (formatting?.markRPr ?? {}),
  }
  if (isOn(attr(node, "default"))) {
    style.default = true
  }
  const name = childVal(node, "name")
  const basedOn = childVal(node, "basedOn")
  const next = childVal(node, "next")
  const link = childVal(node, "link")
  if (name) {
    style.name = name
  }
  if (basedOn) {
    style.basedOn = basedOn
  }
  if (next) {
    style.next = next
  }
  if (link) {
    style.link = link
  }
  if (type === "table") {
    style.table = readTableStyle(node)
  }
  return style
}

function readSettings(xml: string | undefined, notes: WordNote[]): Settings {
  const settings: Settings = { compatibilityMode: null, rsids: [] }
  if (xml === undefined) {
    notes.push({ code: "missing-settings", message: "settings.xml is missing. Compatibility mode is 12." })
    return settings
  }
  let root: MarkupNode
  try {
    root = parseAnyRoot(xml, "settings")
  } catch (error) {
    notes.push({
      code: "broken-settings",
      message: error instanceof Error ? error.message : "settings.xml is not usable. Compatibility mode is 12.",
    })
    return settings
  }
  const compat = wordChild(root, "compat")
  if (compat) {
    for (const setting of wordChildren(compat, "compatSetting")) {
      if (attr(setting, "name") !== "compatibilityMode") {
        continue
      }
      const value = readUint(attr(setting, "val"))
      if (value !== undefined) {
        settings.compatibilityMode = value
      }
    }
  }
  if (settings.compatibilityMode === null) {
    notes.push({ code: "compatibility-mode", message: "compatibilityMode is absent. Word opens this as mode 12." })
  }
  const tab = readUMeasure(childVal(root, "defaultTabStop"))
  if (tab !== undefined) {
    settings.defaultTabStop = tab
  }
  const evenOdd = wordChild(root, "evenAndOddHeaders")
  if (evenOdd) {
    settings.evenAndOddHeaders = readOnOff(evenOdd) ?? true
  }
  for (const name of ["alignBordersAndEdges", "bordersDoNotSurroundHeader", "bordersDoNotSurroundFooter"] as const) {
    const flag = wordChild(root, name)
    if (flag) {
      settings[name] = readOnOff(flag) ?? true
    }
  }
  const footnotePr = readNotePr(wordChild(root, "footnotePr"), "footnote")
  const endnotePr = readNotePr(wordChild(root, "endnotePr"), "endnote")
  if (footnotePr) {
    settings.footnotePr = footnotePr
  }
  if (endnotePr) {
    settings.endnotePr = endnotePr
  }
  const rsids = wordChild(root, "rsids")
  if (rsids) {
    const rootId = readHex(childVal(rsids, "rsidRoot"))
    if (rootId) {
      settings.rsidRoot = rootId
    }
    for (const rsid of wordChildren(rsids, "rsid")) {
      const value = readHex(attr(rsid, "val"))
      if (value) {
        settings.rsids.push(value)
      }
    }
  }
  // Strict markup is converted first, so both conformance classes can be written back as they were.
  const source = transitionalMarkup(xml)
  const rootTag = /<(?:[A-Za-z0-9_-]+:)?settings\b[^>]*>/.exec(source)?.[0] ?? ""
  if (rootTag.includes(`="${WORD_NS}"`)) {
    settings.raw = { rootAttributes: copiedAttributes(root), children: rootChildMarkup(source) }
  }
  return settings
}

/** The part as a tree after Markup Compatibility processing, each element knowing its span in the source. */
function buildTree(xml: string) {
  const root: MarkupNode = { local: "", uri: "", attributes: [], children: [], text: "" }
  const stack = [root]
  filterMarkup(xml, (event) => {
    const current = stack[stack.length - 1]
    if (!current) {
      return
    }
    if (event.type === "start") {
      const node: MarkupNode = {
        local: event.local,
        uri: event.uri,
        attributes: event.attributes,
        children: [],
        text: "",
        source: xml,
        start: event.start,
      }
      current.children.push(node)
      stack.push(node)
      return
    }
    if (event.type === "end") {
      const node = stack.pop()
      if (node) {
        node.end = event.end
      }
      return
    }
    current.text += event.text
  })
  return root
}

function parseAnyRoot(xml: string, local: string | readonly string[]) {
  const root = buildTree(xml)
  const names = local === "*" ? undefined : typeof local === "string" ? [local] : local
  const found = names
    ? root.children.find((node) => node.uri === WORD_NS && names.includes(node.local))
    : root.children[0]
  if (!found) {
    const label = names ? names.map((name) => `w:${name}`).join(" or ") : "root"
    throw new WmlError("broken-part", `The part has no ${label} element.`)
  }
  return found
}

function readParagraph(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW): Paragraph {
  const formatting = wordChild(node, "pPr")
  const props = formatting ? readParagraphFormatting(formatting) : undefined
  const paragraph: Paragraph = {
    kind: "paragraph",
    pPr: props?.pPr ?? {},
    markRPr: props?.markRPr ?? {},
    inlines: piecesToInlines(readPieces(node, notes, raw)),
  }
  if (props?.sectionBreak) {
    paragraph.sectionBreak = props.sectionBreak
  }
  const styleId = props?.styleId
  if (styleId) {
    paragraph.styleId = styleId
  }
  const paraId = readParaId(attr(node, "paraId", W14_NS), notes)
  const textId = readParaId(attr(node, "textId", W14_NS), notes)
  const rsidR = readHex(attr(node, "rsidR"))
  const rsidRPr = readHex(attr(node, "rsidRPr"))
  const rsidP = readHex(attr(node, "rsidP"))
  if (paraId) {
    paragraph.paraId = paraId
  }
  if (textId) {
    paragraph.textId = textId
  }
  if (rsidR) {
    paragraph.rsidR = rsidR
  }
  if (rsidRPr) {
    paragraph.rsidRPr = rsidRPr
  }
  if (rsidP) {
    paragraph.rsidP = rsidP
  }
  const source = elementSource(formatting, paragraphPropertiesInput(paragraph))
  if (source) {
    paragraph.pPr.source = source
  }
  return paragraph
}

function readPieces(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW) {
  const pieces: Piece[] = []
  for (const child of node.children) {
    if (child.uri === MATH_NS && (child.local === "oMath" || child.local === "oMathPara")) {
      pieces.push({ type: "raw", xml: raw.take("math") ?? "", text: visibleText(child) })
      continue
    }
    if (child.uri !== WORD_NS || child.local === "pPr") {
      continue
    }
    if (child.local === "r") {
      const run = readRun(child, notes, raw)
      if (run) {
        pieces.push(run)
      }
    } else if (child.local === "fldSimple") {
      pieces.push({
        type: "simpleField",
        instr: attr(child, "instr") ?? "",
        inlines: piecesToInlines(readPieces(child, notes, raw)),
      })
    } else if (child.local === "hyperlink") {
      const history = readBool(attr(child, "history"))
      pieces.push({
        type: "hyperlink",
        relId: attr(child, "id", REL_NS),
        anchor: attr(child, "anchor"),
        history,
        inlines: piecesToInlines(readPieces(child, notes, raw)),
      })
    } else if (child.local === "ins" || child.local === "del") {
      const id = readUint(attr(child, "id"))
      if (id !== undefined) {
        const revision = {
          id,
          author: attr(child, "author"),
          date: attr(child, "date"),
          inlines: piecesToInlines(readPieces(child, notes, raw)),
        }
        pieces.push(child.local === "ins" ? { type: "ins", ...revision } : { type: "del", ...revision })
      }
    } else if (child.local === "commentRangeStart" || child.local === "commentRangeEnd") {
      const id = readUint(attr(child, "id"))
      if (id !== undefined) {
        pieces.push({ type: child.local, id })
      }
    } else if (child.local === "bookmarkStart") {
      const id = readUint(attr(child, "id"))
      const name = attr(child, "name")
      if (id !== undefined && name) {
        pieces.push({ type: "bookmarkStart", id, name })
      }
    } else if (child.local === "bookmarkEnd") {
      const id = readUint(attr(child, "id"))
      if (id !== undefined) {
        pieces.push({ type: "bookmarkEnd", id })
      }
    } else if (child.local === "smartTag") {
      // Smart tags only annotate the runs inside them; Word itself no longer writes them.
      pieces.push(...readPieces(child, notes, raw))
    } else if (child.local !== "proofErr") {
      // Inline content controls, tracked moves, permissions, custom XML: kept as written.
      const xml = child.local === "sdt" ? (raw.take("sdt") ?? sourceOf(child)) : sourceOf(child)
      if (xml) {
        pieces.push({ type: "raw", xml, text: visibleText(child) })
      }
    }
  }
  return pieces
}

function readRun(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW): Piece | undefined {
  let rPr: RunProperties = {}
  let contentStarted = false
  const content: RunContent[] = []
  for (const child of node.children) {
    if (child.uri !== WORD_NS) {
      continue
    }
    if (child.local === "rPr") {
      if (contentStarted) {
        notes.push({ code: "rpr-after-content", message: "Run properties placed after run content are ignored." })
        continue
      }
      rPr = readRunProperties(child)
      continue
    }
    contentStarted = true
    const item = readRunContent(child, raw)
    if (item) {
      content.push(item)
    }
  }
  const rsidR = readHex(attr(node, "rsidR"))
  if (content.length === 0 && Object.keys(rPr).length === 0 && !rsidR) {
    return undefined
  }
  return rsidR ? { type: "run", rPr, content, rsidR } : { type: "run", rPr, content }
}

function readRunContent(child: MarkupNode, raw: RawCursor = NO_RAW): RunContent | undefined {
  if (child.local === "drawing" || child.local === "pict") {
    return drawingContent(child, raw)
  }
  if (child.local === "t" || child.local === "delText") {
    const text = applySpace(child.text, preservesSpace(child))
    return text ? { kind: child.local === "delText" ? "delText" : "text", text } : undefined
  }
  if (child.local === "footnoteReference" || child.local === "endnoteReference" || child.local === "commentReference") {
    const id = readInt(attr(child, "id"))
    return id === undefined ? undefined : { kind: child.local, id }
  }
  if (
    child.local === "footnoteRef" ||
    child.local === "endnoteRef" ||
    child.local === "separator" ||
    child.local === "continuationSeparator" ||
    child.local === "annotationRef"
  ) {
    return { kind: child.local }
  }
  if (child.local === "instrText") {
    const text = applySpace(child.text, preservesSpace(child))
    return text ? { kind: "instrText", text } : undefined
  }
  if (child.local === "tab") {
    return { kind: "tab" }
  }
  if (child.local === "br") {
    return { kind: "break", breakType: oneOf(attr(child, "type"), BREAK_TYPES) ?? "textWrapping" }
  }
  if (child.local === "fldChar") {
    const fieldType = oneOf(attr(child, "fldCharType"), FIELD_CHAR_TYPES)
    return fieldType ? { kind: "fldChar", fieldType } : undefined
  }
  if (child.local === "cr") {
    return { kind: "break", breakType: "textWrapping" }
  }
  if (child.local === "lastRenderedPageBreak") {
    // Where Word last broke the page; it recomputes this on every save.
    return undefined
  }
  const xml = sourceOf(child)
  return xml ? { kind: "raw", xml, text: rawRunText(child) } : undefined
}

/** What a run element the model keeps as written shows on the page. */
function rawRunText(node: MarkupNode) {
  switch (node.local) {
    case "sym": {
      const code = Number.parseInt(attr(node, "char") ?? "", 16)
      // Symbol fonts put their glyphs in the private use area, where the font (when installed) shows them.
      return Number.isFinite(code) ? String.fromCharCode(code) : ""
    }
    case "noBreakHyphen":
      return "\u2011"
    case "ptab":
      return "\t"
    default:
      return visibleText(node)
  }
}

function drawingContent(node: MarkupNode, raw: RawCursor): RunContent {
  const extent = descendant(node, "extent")
  const properties = descendant(node, "docPr")
  const blip = descendant(node, "blip")
  const cx = readInt(anyAttr(extent, "cx"))
  const cy = readInt(anyAttr(extent, "cy"))
  const name = anyAttr(properties, "name")
  const relId = blip ? attr(blip, "embed", REL_NS) : undefined
  const content: Extract<RunContent, { kind: "drawing" }> = {
    kind: "drawing",
    xml: raw.take("drawing") ?? "",
    text: visibleText(node),
    floating: descendant(node, "anchor") !== undefined,
  }
  const layout = anchorLayout(descendant(node, "anchor"))
  if (layout) {
    content.layout = layout
  }
  if (relId) {
    content.relId = relId
  }
  if (name) {
    content.name = name
  }
  if (cx !== undefined) {
    content.cx = cx
  }
  if (cy !== undefined) {
    content.cy = cy
  }
  const rot = readInt(anyAttr(descendant(node, "xfrm"), "rot"))
  if (rot) {
    content.rot = rot
  }
  const source = descendant(node, "srcRect")
  if (source) {
    const side = (name: string) => readInt(anyAttr(source, name)) ?? 0
    const crop = { l: side("l"), t: side("t"), r: side("r"), b: side("b") }
    if (crop.l || crop.t || crop.r || crop.b) {
      content.crop = crop
    }
  }
  // A picture's shape (Crop to Shape) is the preset on the picture itself, not on a shape drawn around it.
  const geometry = anyAttr(descendant(descendant(node, "pic") ?? node, "prstGeom"), "prst")
  if (geometry && geometry !== "rect" && descendant(node, "pic")) {
    content.geometry = geometry
  }
  const object = inkspireObject(node)
  if (object) {
    content.object = object
  }
  const paragraphs = textBoxParagraphs(node)
  if (paragraphs) {
    content.boxParagraphs = paragraphs
  }
  return content
}

/**
 * The paragraphs of a Word text box (a `wps:wsp` holding `w:txbxContent`), or nothing when it holds more than
 * paragraphs of text (a table, a picture, a content control): such a box stays whole.
 */
function textBoxParagraphs(node: MarkupNode): Paragraph[] | undefined {
  const shape = descendant(node, "wsp")
  const content = shape ? descendant(shape, "txbxContent") : undefined
  if (!content) {
    // A box later in a chain of linked boxes: its text is in the chain's first box.
    return shape && descendant(shape, "linkedTxbx") ? [] : undefined
  }
  const children = content.children.filter((child) => child.uri === WORD_NS)
  const pictures = children.some((child) => descendant(child, "drawing") || descendant(child, "pict"))
  if (pictures || children.some((child) => child.local !== "p")) {
    return undefined
  }
  return children.map((child) => readParagraph(child, []))
}

const WRAP_ELEMENTS: Record<string, DrawingLayout["wrap"]> = {
  wrapSquare: "square",
  wrapTight: "tight",
  wrapThrough: "through",
  wrapTopAndBottom: "topBottom",
  wrapNone: "none",
}

/** The position and wrapping of a floating drawing. */
/** The app's own object kept in a drawing's docPr extension list (see INKSPIRE_OBJECT_NS). */
function inkspireObject(node: MarkupNode): string | undefined {
  if (node.local === "object" && node.uri === INKSPIRE_OBJECT_NS) {
    return anyAttr(node, "data")
  }
  for (const child of node.children) {
    const found = inkspireObject(child)
    if (found) {
      return found
    }
  }
  return undefined
}

function anchorLayout(anchor: MarkupNode | undefined): DrawingLayout | undefined {
  if (!anchor) {
    return undefined
  }
  const axis = (local: string): AnchorAxis => {
    const position = anchor.children.find((child) => child.local === local)
    const offset = position?.children.find((child) => child.local === "posOffset")
    const align = position?.children.find((child) => child.local === "align")
    const axis: AnchorAxis = { from: anyAttr(position, "relativeFrom") ?? "column" }
    const value = offset ? Number.parseInt(offset.text.trim(), 10) : Number.NaN
    if (Number.isFinite(value)) {
      axis.offset = value
    } else if (align?.text.trim()) {
      axis.align = align.text.trim()
    }
    return axis
  }
  const wrapNode = anchor.children.find((child) => child.local in WRAP_ELEMENTS)
  const z = readInt(anyAttr(anchor, "relativeHeight"))
  const flag = (name: string) => {
    const value = anyAttr(anchor, name)
    return value === undefined ? undefined : value === "1" || value === "true" || value === "on"
  }
  const dist = (name: string) => readInt(anyAttr(anchor, name)) ?? 0
  const wrapText = wrapNode ? anyAttr(wrapNode, "wrapText") : undefined
  const allowOverlap = flag("allowOverlap")
  const locked = flag("locked")
  return {
    wrap: wrapNode ? WRAP_ELEMENTS[wrapNode.local]! : "none",
    behind: flag("behindDoc") === true,
    h: axis("positionH"),
    v: axis("positionV"),
    ...(z !== undefined ? { z } : {}),
    ...(wrapText ? { wrapText } : {}),
    dist: { t: dist("distT"), b: dist("distB"), l: dist("distL"), r: dist("distR") },
    ...(allowOverlap !== undefined ? { allowOverlap } : {}),
    ...(locked !== undefined ? { locked } : {}),
  }
}

function visibleText(node: MarkupNode): string {
  const own =
    (node.local === "t" || node.local === "delText") && (node.uri === WORD_NS || node.uri === MATH_NS) ? node.text : ""
  return own + node.children.map((child) => visibleText(child)).join("")
}

function descendant(node: MarkupNode, local: string): MarkupNode | undefined {
  if (node.local === local) {
    return node
  }
  for (const child of node.children) {
    const found = descendant(child, local)
    if (found) {
      return found
    }
  }
  return undefined
}

function anyAttr(node: MarkupNode | undefined, local: string) {
  return node?.attributes.find((item) => item.local === local)?.value
}

function piecesToInlines(pieces: Piece[]): Inline[] {
  return pieces.map((piece) => {
    if (piece.type === "bookmarkStart") {
      return { kind: "bookmarkStart", id: piece.id, name: piece.name }
    }
    if (piece.type === "bookmarkEnd") {
      return { kind: "bookmarkEnd", id: piece.id }
    }
    if (piece.type === "simpleField") {
      return { kind: "simpleField", instr: piece.instr, inlines: piece.inlines }
    }
    if (piece.type === "hyperlink") {
      return {
        kind: "hyperlink",
        relId: piece.relId,
        anchor: piece.anchor,
        history: piece.history,
        inlines: piece.inlines,
      }
    }
    if (piece.type === "commentRangeStart" || piece.type === "commentRangeEnd") {
      return { kind: piece.type, id: piece.id }
    }
    if (piece.type === "ins" || piece.type === "del") {
      return { kind: piece.type, id: piece.id, author: piece.author, date: piece.date, inlines: piece.inlines }
    }
    if (piece.type === "raw") {
      return { kind: "raw", xml: piece.xml, text: piece.text }
    }
    const run = { kind: "run" as const, rPr: piece.rPr, content: piece.content }
    return piece.rsidR ? { ...run, rsidR: piece.rsidR } : run
  })
}

function readNumberingPart(xml: string | undefined, notes: WordNote[]): NumberingDefinitions {
  if (xml === undefined) {
    return emptyNumbering()
  }
  try {
    const root = parseAnyRoot(xml, "numbering")
    const definitions = readNumberingDefinitions(root)
    if (root.uri === WORD_NS) {
      definitions.rootAttributes = copiedAttributes(root)
    }
    return definitions
  } catch (error) {
    notes.push({
      code: "broken-numbering",
      message: error instanceof Error ? error.message : "numbering.xml is not usable.",
    })
    return emptyNumbering()
  }
}

function readNumberingDefinitions(root: MarkupNode): NumberingDefinitions {
  const abstracts: AbstractNumbering[] = []
  const instances: NumberingInstance[] = []
  for (const node of wordChildren(root, "abstractNum")) {
    const id = readUint(attr(node, "abstractNumId"))
    if (id === undefined) {
      continue
    }
    const abstract: AbstractNumbering = { id, levels: [] }
    const restart = readBool(attr(node, "restartNumberingAfterBreak", W15_NS))
    const nsid = readHex(childVal(node, "nsid"))
    const multiLevelType = oneOf(childVal(node, "multiLevelType"), MULTI_LEVEL_TYPES)
    const tmpl = readHex(childVal(node, "tmpl"))
    if (restart !== undefined) {
      abstract.restartAfterBreak = restart
    }
    if (nsid) {
      abstract.nsid = nsid
    }
    if (multiLevelType) {
      abstract.multiLevelType = multiLevelType
    }
    if (tmpl) {
      abstract.tmpl = tmpl
    }
    for (const levelNode of wordChildren(node, "lvl")) {
      const level = readNumberingLevel(levelNode)
      if (level) {
        abstract.levels.push(level)
      }
    }
    abstracts.push(abstract)
  }
  for (const node of wordChildren(root, "num")) {
    const id = readUint(attr(node, "numId"))
    const abstractNumId = readUint(childVal(node, "abstractNumId"))
    if (id === undefined || abstractNumId === undefined) {
      continue
    }
    const instance: NumberingInstance = { id, abstractNumId }
    const durableId = attr(node, "durableId", W16CID_NS)
    if (durableId && /^[0-9A-Za-z]+$/.test(durableId)) {
      instance.durableId = durableId
    }
    instances.push(instance)
  }
  return { abstracts, instances }
}

function readNumberingLevel(node: MarkupNode): NumberingLevel | undefined {
  const ilvl = readUint(attr(node, "ilvl"))
  if (ilvl === undefined) {
    return undefined
  }
  const formatting = wordChild(node, "pPr")
  const paragraph = formatting ? readParagraphFormatting(formatting) : undefined
  const rPr = wordChild(node, "rPr")
  const level: NumberingLevel = {
    ilvl,
    pPr: paragraph?.pPr ?? {},
    rPr: rPr ? readRunProperties(rPr) : {},
  }
  const start = readUint(childVal(node, "start"))
  const format = oneOf(childVal(node, "numFmt"), NUMBER_FORMATS)
  const text = childVal(node, "lvlText")
  const justify = oneOf(childVal(node, "lvlJc"), JC_VALUES)
  if (start !== undefined) {
    level.start = start
  }
  if (format) {
    level.format = format
  }
  if (text) {
    level.text = text
  }
  if (justify) {
    level.justify = justify
  }
  return level
}

function readTable(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW): Table {
  const table: Table = { kind: "table", grid: [], rows: [] }
  const properties = wordChild(node, "tblPr")
  const styleId = childVal(properties, "tblStyle")
  if (styleId) {
    table.styleId = styleId
  }
  const cellMargins = readCellMargins(wordChild(properties, "tblCellMar"))
  if (cellMargins) {
    table.cellMargins = cellMargins
  }
  const width = readTableWidth(wordChild(properties, "tblW"))
  if (width) {
    table.width = width
  }
  const position = readTablePosition(wordChild(properties, "tblpPr"))
  if (position) {
    table.position = position
  }
  const overlap = oneOf(childVal(properties, "tblOverlap"), ["never", "overlap"] as const)
  if (overlap) {
    table.overlap = overlap
  }
  const indent = readTableWidth(wordChild(properties, "tblInd"))
  if (indent) {
    table.indent = indent
  }
  const spacing = readTableWidth(wordChild(properties, "tblCellSpacing"))
  if (spacing) {
    table.cellSpacing = spacing
  }
  const borders = readBorders(wordChild(properties, "tblBorders"))
  if (borders) {
    table.borders = borders
  }
  const layout = oneOf(attr(wordChild(properties, "tblLayout"), "type"), TABLE_LAYOUTS)
  if (layout) {
    table.layout = layout
  }
  const look = readTableLook(wordChild(properties, "tblLook"))
  if (look) {
    table.look = look
  }
  const align = oneOf(logicalSide(childVal(properties, "jc")), ["left", "center", "right"] as const)
  if (align) {
    table.align = align
  }
  const caption = childVal(properties, "tblCaption")
  if (caption) {
    table.caption = caption
  }
  const description = childVal(properties, "tblDescription")
  if (description) {
    table.description = description
  }
  const grid = wordChild(node, "tblGrid")
  if (grid) {
    for (const column of wordChildren(grid, "gridCol")) {
      const value = readUMeasure(attr(column, "w"))
      if (value !== undefined) {
        table.grid.push(value)
      }
    }
  }
  for (const rowNode of wordChildren(node, "tr")) {
    const exceptions = wordChild(rowNode, "tblPrEx")
    const rowProperties = wordChild(rowNode, "trPr")
    const margins = readCellMargins(wordChild(exceptions, "tblCellMar"))
    const header = wordChild(rowProperties, "tblHeader")
    const cells = wordChildren(rowNode, "tc").map((cell) => readCell(cell, notes, raw))
    const row: Table["rows"][number] = { cells }
    if (margins) {
      row.cellMargins = margins
    }
    if (header) {
      row.header = readOnOff(header) ?? true
    }
    const cantSplit = wordChild(rowProperties, "cantSplit")
    if (cantSplit && (readOnOff(cantSplit) ?? true)) {
      row.cantSplit = true
    }
    const heightNode = wordChild(rowProperties, "trHeight")
    const heightValue = readUMeasure(attr(heightNode, "val"))
    if (heightValue !== undefined && heightValue > 0) {
      const rule = oneOf(attr(heightNode, "hRule"), ["atLeast", "exact"] as const)
      row.height = rule ? { value: heightValue, rule } : { value: heightValue }
    }
    const source = elementSource(rowProperties, rowPropertiesInput(row))
    if (source) {
      row.source = source
    }
    const exceptionSource = elementSource(exceptions, rowExceptionsInput(row))
    if (exceptionSource) {
      row.exceptionSource = exceptionSource
    }
    table.rows.push(row)
  }
  const source = elementSource(properties, tablePropertiesInput(table))
  if (source) {
    table.source = source
  }
  return table
}

function readCell(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW) {
  const properties = wordChild(node, "tcPr")
  const blocks = readBlockChildren(node, notes, raw)
  if (!blocks.some((block) => block.kind === "paragraph")) {
    blocks.push(emptyParagraph())
    notes.push({ code: "cell-without-paragraph", message: "A table cell had no paragraph." })
  }
  const cell: Table["rows"][number]["cells"][number] = { blocks }
  const width = readTableWidth(wordChild(properties, "tcW"))
  const span = readUint(childVal(properties, "gridSpan"))
  const merge = wordChild(properties, "vMerge")
  const shading = readShading(wordChild(properties, "shd"))
  if (width) {
    cell.width = width
  }
  if (span !== undefined && span > 1) {
    cell.gridSpan = span
  }
  if (merge) {
    cell.vMerge = oneOf(attr(merge, "val"), MERGE_VALUES) ?? "continue"
  }
  if (shading) {
    cell.shading = shading
  }
  const look = readCellLook(properties)
  if (look) {
    cell.look = look
  }
  for (const [name, key] of [
    ["noWrap", "noWrap"],
    ["tcFitText", "fitText"],
  ] as const) {
    const flag = wordChild(properties, name)
    if (flag && (readOnOff(flag) ?? true)) {
      cell[key] = true
    }
  }
  const source = elementSource(properties, cellPropertiesInput(cell))
  if (source) {
    cell.source = source
  }
  return cell
}

function readBorders(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const borders: NonNullable<Table["borders"]> = {}
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV", "tl2br", "tr2bl"] as const) {
    const border = readBorder(sideChild(node, side))
    if (border) {
      borders[side] = border
    }
  }
  return borders.top ||
    borders.left ||
    borders.bottom ||
    borders.right ||
    borders.insideH ||
    borders.insideV ||
    borders.tl2br ||
    borders.tr2bl
    ? borders
    : undefined
}

function readParagraphBorders(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const borders: NonNullable<ParagraphProperties["borders"]> = {}
  for (const side of ["top", "left", "bottom", "right"] as const) {
    const border = readBorder(sideChild(node, side))
    if (border) {
      borders[side] = border
    }
  }
  return borders.top || borders.left || borders.bottom || borders.right ? borders : undefined
}

function readBorder(node: MarkupNode | undefined): Border | undefined {
  if (!node) {
    return undefined
  }
  const value = oneOf(attr(node, "val"), BORDER_VALUES)
  if (!value) {
    return undefined
  }
  const border: Border = { value }
  const sz = readUint(attr(node, "sz"))
  const space = readUint(attr(node, "space"))
  const color = readColor(attr(node, "color"))
  if (sz !== undefined) {
    border.sz = sz
  }
  if (space !== undefined) {
    border.space = space
  }
  if (color) {
    border.color = color
  }
  if (isOn(attr(node, "shadow"))) {
    border.shadow = true
  }
  if (isOn(attr(node, "frame"))) {
    border.frame = true
  }
  return border
}

function readTableLook(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const look: NonNullable<Table["look"]> = {}
  const val = attr(node, "val")
  if (val && /^[0-9A-Fa-f]{1,4}$/.test(val)) {
    look.val = val.toUpperCase()
  }
  assignBool(look, "firstRow", attr(node, "firstRow"))
  assignBool(look, "lastRow", attr(node, "lastRow"))
  assignBool(look, "firstColumn", attr(node, "firstColumn"))
  assignBool(look, "lastColumn", attr(node, "lastColumn"))
  assignBool(look, "noHBand", attr(node, "noHBand"))
  assignBool(look, "noVBand", attr(node, "noVBand"))
  return look.val !== undefined ||
    look.firstRow !== undefined ||
    look.lastRow !== undefined ||
    look.firstColumn !== undefined ||
    look.lastColumn !== undefined ||
    look.noHBand !== undefined ||
    look.noVBand !== undefined
    ? look
    : undefined
}

function readCellLook(node: MarkupNode | undefined): CellLook | undefined {
  const look: CellLook = {}
  const borders = readBorders(wordChild(node, "tcBorders"))
  const margins = readCellMargins(wordChild(node, "tcMar"))
  const vAlign = oneOf(childVal(node, "vAlign"), ["top", "center", "bottom"] as const)
  if (borders) {
    look.borders = borders
  }
  if (margins) {
    look.margins = margins
  }
  if (vAlign) {
    look.vAlign = vAlign
  }
  return look.borders || look.margins || look.vAlign ? look : undefined
}

/** A table style's whole-table formatting and its conditional parts (header row, banding, …). */
function readTableStyle(node: MarkupNode): TableStyleFormat {
  const part = (container: MarkupNode, cellBorders: boolean): TableStylePart => {
    const paragraph = wordChild(container, "pPr")
    const run = wordChild(container, "rPr")
    const table = wordChild(container, "tblPr")
    const cell = wordChild(container, "tcPr")
    const result: TableStylePart = {
      pPr: paragraph ? readParagraphFormatting(paragraph).pPr : {},
      rPr: run ? readRunModel(run) : {},
    }
    const look = readCellLook(cell)
    const borders = cellBorders ? look?.borders : readBorders(wordChild(table, "tblBorders"))
    const margins = readCellMargins(wordChild(table, "tblCellMar")) ?? look?.margins
    const shading = readShading(wordChild(cell, "shd")) ?? readShading(wordChild(table, "shd"))
    if (borders) {
      result.borders = borders
    }
    if (margins) {
      result.margins = margins
    }
    if (shading) {
      result.shading = shading
    }
    if (look?.vAlign) {
      result.vAlign = look.vAlign
    }
    return result
  }
  const format: TableStyleFormat = { whole: part(node, false), conditions: {} }
  for (const conditional of wordChildren(node, "tblStylePr")) {
    const type = oneOf(attr(conditional, "type"), TABLE_CONDITIONS)
    if (type) {
      format.conditions[type] = part(conditional, true)
    }
  }
  return format
}

function readCellMargins(node: MarkupNode | undefined): CellMargins | undefined {
  if (!node) {
    return undefined
  }
  const margins: CellMargins = {}
  for (const side of ["top", "left", "bottom", "right"] as const) {
    const edge = readTableWidth(sideChild(node, side))
    if (edge) {
      margins[side] = edge
    }
  }
  return margins.top || margins.left || margins.bottom || margins.right ? margins : undefined
}

function readShading(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const value = oneOf(attr(node, "val"), SHADING_VALUES)
  if (!value) {
    return undefined
  }
  const shading: NonNullable<Table["rows"][number]["cells"][number]["shading"]> = { value }
  const color = readColor(attr(node, "color"))
  const fill = readColor(attr(node, "fill"))
  if (color) {
    shading.color = color
  }
  if (fill) {
    shading.fill = fill
  }
  return shading
}

/** w:tblpPr: where a table text wraps around sits. */
function readTablePosition(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const position: TablePosition = {}
  for (const key of ["leftFromText", "rightFromText", "topFromText", "bottomFromText"] as const) {
    const value = readUMeasure(attr(node, key))
    if (value !== undefined) {
      position[key] = value
    }
  }
  const anchors = ["text", "margin", "page"] as const
  const vertAnchor = oneOf(attr(node, "vertAnchor"), anchors)
  const horzAnchor = oneOf(attr(node, "horzAnchor"), anchors)
  const xSpec = oneOf(attr(node, "tblpXSpec"), ["left", "center", "right", "inside", "outside"] as const)
  const ySpec = oneOf(attr(node, "tblpYSpec"), ["inline", "top", "center", "bottom", "inside", "outside"] as const)
  const x = readMeasure(attr(node, "tblpX"))
  const y = readMeasure(attr(node, "tblpY"))
  Object.assign(
    position,
    vertAnchor ? { vertAnchor } : {},
    horzAnchor ? { horzAnchor } : {},
    xSpec ? { tblpXSpec: xSpec } : {},
    x !== undefined ? { tblpX: x } : {},
    ySpec ? { tblpYSpec: ySpec } : {},
    y !== undefined ? { tblpY: y } : {},
  )
  return position
}

function readTableWidth(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const type = oneOf(attr(node, "type"), TABLE_WIDTH_TYPES)
  const raw = attr(node, "w")
  // Strict writes percentages as "50%"; Transitional counts fiftieths of a percent.
  const value = type === "pct" && raw?.endsWith("%") ? readPercent(raw) : readUMeasure(raw)
  if (!type || value === undefined) {
    return undefined
  }
  return { value, type }
}

function readSection(node: MarkupNode): SectionProps {
  const section = readSectionModel(node)
  const source = elementSource(node, section)
  if (source) {
    section.source = source
  }
  return section
}

function readSectionModel(node: MarkupNode): SectionProps {
  const section: SectionProps = {}
  const references: HeaderFooterRef[] = []
  for (const child of node.children) {
    if (child.uri !== WORD_NS) {
      continue
    }
    if (child.local !== "headerReference" && child.local !== "footerReference") {
      continue
    }
    const type = oneOf(attr(child, "type"), HEADER_FOOTER_TYPES)
    const relId = attr(child, "id", REL_NS)
    if (!type || !relId) {
      continue
    }
    references.push({
      kind: child.local === "headerReference" ? "header" : "footer",
      type,
      relId,
      blocks: [],
    })
  }
  if (references.length > 0) {
    section.references = references
  }
  const type = oneOf(childVal(node, "type"), SECTION_TYPES)
  if (type) {
    section.type = type
  }
  const size = wordChild(node, "pgSz")
  if (size) {
    const width = readUMeasure(attr(size, "w"))
    const height = readUMeasure(attr(size, "h"))
    const orient = oneOf(attr(size, "orient"), PAGE_ORIENTATIONS)
    if (width !== undefined) {
      section.pageWidth = width
    }
    if (height !== undefined) {
      section.pageHeight = height
    }
    if (orient) {
      section.orient = orient
    }
  }
  const margins = wordChild(node, "pgMar")
  if (margins) {
    assignMeasure(section, "marginTop", attr(margins, "top"))
    assignMeasure(section, "marginRight", attr(margins, "right"))
    assignMeasure(section, "marginBottom", attr(margins, "bottom"))
    assignMeasure(section, "marginLeft", attr(margins, "left"))
    assignMeasure(section, "header", attr(margins, "header"))
    assignMeasure(section, "footer", attr(margins, "footer"))
    assignMeasure(section, "gutter", attr(margins, "gutter"))
  }
  const numbering = wordChild(node, "lnNumType")
  if (numbering) {
    const restart = oneOf(attr(numbering, "restart"), ["continuous", "newPage", "newSection"] as const)
    const lines: LineNumbering = {}
    assignUint(lines, "countBy", attr(numbering, "countBy"))
    assignUint(lines, "start", attr(numbering, "start"))
    assignMeasure(lines, "distance", attr(numbering, "distance"))
    if (restart) {
      lines.restart = restart
    }
    section.lineNumbers = lines
  }
  const borders = wordChild(node, "pgBorders")
  if (borders) {
    const pageBorders: PageBorders = {}
    const display = oneOf(attr(borders, "display"), ["allPages", "firstPage", "notFirstPage"] as const)
    const offsetFrom = oneOf(attr(borders, "offsetFrom"), ["page", "text"] as const)
    const zOrder = oneOf(attr(borders, "zOrder"), ["front", "back"] as const)
    if (display) {
      pageBorders.display = display
    }
    if (offsetFrom) {
      pageBorders.offsetFrom = offsetFrom
    }
    if (zOrder) {
      pageBorders.zOrder = zOrder
    }
    for (const side of ["top", "left", "bottom", "right"] as const) {
      const border = readBorder(wordChild(borders, side))
      if (border) {
        pageBorders[side] = border
      }
    }
    section.pageBorders = pageBorders
  }
  const columns = wordChild(node, "cols")
  if (columns) {
    assignUint(section, "columnCount", attr(columns, "num"))
    assignMeasure(section, "columnSpace", attr(columns, "space"))
    const separator = attr(columns, "sep")
    if (separator !== undefined) {
      section.columnSeparator = separator === "1" || separator === "true" || separator === "on"
    }
    const equal = attr(columns, "equalWidth")
    const widths = wordChildren(columns, "col").map((column) => ({
      width: readUMeasure(attr(column, "w")) ?? 0,
      space: readUMeasure(attr(column, "space")),
    }))
    if (
      (equal === "0" || equal === "false" || equal === "off") &&
      widths.length > 0 &&
      widths.every((column) => column.width > 0)
    ) {
      section.columnWidths = widths.map((column) =>
        column.space === undefined ? { width: column.width } : { width: column.width, space: column.space },
      )
    }
  }
  if (wordChild(node, "titlePg")) {
    section.titlePg = readOnOff(wordChild(node, "titlePg")) ?? true
  }
  const grid = wordChild(node, "docGrid")
  if (grid) {
    assignUint(section, "linePitch", attr(grid, "linePitch"))
  }
  return section
}

function readParagraphFormatting(node: MarkupNode) {
  const pPr: ParagraphProperties = {}
  const styleId = childVal(node, "pStyle")
  assignOnOff(pPr, "keepNext", wordChild(node, "keepNext"))
  assignOnOff(pPr, "keepLines", wordChild(node, "keepLines"))
  assignOnOff(pPr, "contextualSpacing", wordChild(node, "contextualSpacing"))
  assignOnOff(pPr, "pageBreakBefore", wordChild(node, "pageBreakBefore"))
  assignOnOff(pPr, "widowControl", wordChild(node, "widowControl"))
  assignOnOff(pPr, "suppressLineNumbers", wordChild(node, "suppressLineNumbers"))
  assignOnOff(pPr, "suppressAutoHyphens", wordChild(node, "suppressAutoHyphens"))
  assignOnOff(pPr, "mirrorIndents", wordChild(node, "mirrorIndents"))
  const tightWrap = oneOf(childVal(node, "textboxTightWrap"), [
    "none",
    "allLines",
    "firstAndLastLine",
    "firstLineOnly",
    "lastLineOnly",
  ] as const)
  if (tightWrap) {
    pPr.textboxTightWrap = tightWrap
  }
  const numPr = readNumbering(wordChild(node, "numPr"))
  if (numPr) {
    pPr.numPr = numPr
  }
  const paragraphBorders = readParagraphBorders(wordChild(node, "pBdr"))
  if (paragraphBorders) {
    pPr.borders = paragraphBorders
  }
  const paragraphShading = readShading(wordChild(node, "shd"))
  if (paragraphShading) {
    pPr.shading = paragraphShading
  }
  const tabs = readTabs(wordChild(node, "tabs"))
  if (tabs) {
    pPr.tabs = tabs
  }
  const spacing = readSpacing(wordChild(node, "spacing"))
  if (spacing) {
    pPr.spacing = spacing
  }
  const ind = readIndent(wordChild(node, "ind"))
  if (ind) {
    pPr.ind = ind
  }
  const jc = oneOf(logicalSide(childVal(node, "jc")), JC_VALUES)
  if (jc) {
    pPr.jc = jc
  }
  const outline = readUint(childVal(node, "outlineLvl"))
  if (outline !== undefined && outline <= 9) {
    pPr.outlineLvl = outline
  }
  const mark = wordChild(node, "rPr")
  const sect = wordChild(node, "sectPr")
  return {
    styleId,
    pPr,
    markRPr: mark ? readRunProperties(mark) : {},
    sectionBreak: sect ? readSection(sect) : undefined,
  }
}

function readTabs(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const tabs: TabStop[] = []
  for (const child of wordChildren(node, "tab")) {
    const val = oneOf(logicalSide(attr(child, "val")), TAB_ALIGNS)
    const pos = readMeasure(attr(child, "pos"))
    if (!val || pos === undefined) {
      continue
    }
    const leader = oneOf(attr(child, "leader"), TAB_LEADERS)
    tabs.push(leader ? { val, leader, pos } : { val, pos })
  }
  return tabs.length > 0 ? tabs : undefined
}

function readNumbering(node: MarkupNode | undefined): NumberingRef | undefined {
  if (!node) {
    return undefined
  }
  const ilvl = readUint(childVal(node, "ilvl"))
  const numId = readUint(childVal(node, "numId"))
  if (ilvl === undefined && numId === undefined) {
    return undefined
  }
  const ref: NumberingRef = {}
  if (ilvl !== undefined) {
    ref.ilvl = ilvl
  }
  if (numId !== undefined) {
    ref.numId = numId
  }
  return ref
}

function readSpacing(node: MarkupNode | undefined): Spacing | undefined {
  if (!node) {
    return undefined
  }
  const spacing: Spacing = {}
  const before = readMeasure(attr(node, "before"))
  const after = readMeasure(attr(node, "after"))
  const line = readMeasure(attr(node, "line"))
  const lineRule = oneOf(attr(node, "lineRule"), LINE_RULES)
  if (before !== undefined) {
    spacing.before = before
  }
  if (after !== undefined) {
    spacing.after = after
  }
  if (line !== undefined) {
    spacing.line = line
  }
  if (lineRule) {
    spacing.lineRule = lineRule
  }
  return before !== undefined || after !== undefined || line !== undefined || lineRule ? spacing : undefined
}

function readIndent(node: MarkupNode | undefined): Indent | undefined {
  if (!node) {
    return undefined
  }
  const indent: Indent = {}
  // Strict names the sides start and end; Transitional's left and right mean the same edges.
  const left = readMeasure(attr(node, "left") ?? attr(node, "start"))
  const right = readMeasure(attr(node, "right") ?? attr(node, "end"))
  const hanging = readMeasure(attr(node, "hanging"))
  const firstLine = readMeasure(attr(node, "firstLine"))
  if (left !== undefined) {
    indent.left = left
  }
  if (right !== undefined) {
    indent.right = right
  }
  if (hanging !== undefined) {
    indent.hanging = hanging
  }
  if (firstLine !== undefined) {
    indent.firstLine = firstLine
  }
  return left !== undefined || right !== undefined || hanging !== undefined || firstLine !== undefined
    ? indent
    : undefined
}

function readRunProperties(node: MarkupNode): RunProperties {
  const props = readRunModel(node)
  const source = elementSource(node, props)
  if (source) {
    props.source = source
  }
  return props
}

function readRunModel(node: MarkupNode): RunProperties {
  const props: RunProperties = {}
  const fonts = readFonts(wordChild(node, "rFonts"))
  if (fonts) {
    props.rFonts = fonts
  }
  assignOnOff(props, "b", wordChild(node, "b"))
  assignOnOff(props, "bCs", wordChild(node, "bCs"))
  assignOnOff(props, "i", wordChild(node, "i"))
  assignOnOff(props, "iCs", wordChild(node, "iCs"))
  assignOnOff(props, "caps", wordChild(node, "caps"))
  assignOnOff(props, "smallCaps", wordChild(node, "smallCaps"))
  assignOnOff(props, "strike", wordChild(node, "strike"))
  assignOnOff(props, "dstrike", wordChild(node, "dstrike"))
  assignOnOff(props, "emboss", wordChild(node, "emboss"))
  assignOnOff(props, "imprint", wordChild(node, "imprint"))
  assignOnOff(props, "outline", wordChild(node, "outline"))
  assignOnOff(props, "shadow", wordChild(node, "shadow"))
  assignOnOff(props, "noProof", wordChild(node, "noProof"))
  assignOnOff(props, "vanish", wordChild(node, "vanish"))
  const color = readColor(childVal(node, "color"))
  if (color) {
    props.color = color
  }
  assignInt(props, "spacing", childVal(node, "spacing"))
  assignInt(props, "w", childVal(node, "w"))
  assignUint(props, "kern", childVal(node, "kern"))
  assignInt(props, "position", childVal(node, "position"))
  assignUint(props, "sz", childVal(node, "sz"))
  assignUint(props, "szCs", childVal(node, "szCs"))
  const highlight = oneOf(childVal(node, "highlight"), HIGHLIGHT_VALUES)
  if (highlight) {
    props.highlight = highlight
  }
  const underline = readUnderline(wordChild(node, "u"))
  if (underline) {
    props.u = underline
  }
  const bdr = readBorder(wordChild(node, "bdr"))
  if (bdr) {
    props.bdr = bdr
  }
  const shd = readShading(wordChild(node, "shd"))
  if (shd) {
    props.shd = shd
  }
  const vertAlign = oneOf(childVal(node, "vertAlign"), VERTICAL_ALIGNS)
  if (vertAlign) {
    props.vertAlign = vertAlign
  }
  const rStyle = childVal(node, "rStyle")
  if (rStyle) {
    props.rStyle = rStyle
  }
  const lang = readLanguage(wordChild(node, "lang"))
  if (lang) {
    props.lang = lang
  }
  const change = readPropertyChange(wordChild(node, "rPrChange"))
  if (change) {
    props.rPrChange = change
  }
  return props
}

function readPropertyChange(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const id = readUint(attr(node, "id"))
  if (id === undefined) {
    return undefined
  }
  const inner = wordChild(node, "rPr")
  const change = { id, rPr: inner ? readRunProperties(inner) : {} }
  const author = attr(node, "author")
  const date = attr(node, "date")
  return {
    ...change,
    ...(author ? { author } : {}),
    ...(date ? { date } : {}),
  }
}

function readNotePr(node: MarkupNode | undefined, local: "footnote" | "endnote") {
  if (!node) {
    return undefined
  }
  const ids = wordChildren(node, local)
    .map((child) => readInt(attr(child, "id")))
    .filter((id): id is number => id !== undefined)
  return ids.length > 0 ? ids : undefined
}

function readFonts(node: MarkupNode | undefined): RunFonts | undefined {
  if (!node) {
    return undefined
  }
  const fonts: RunFonts = {}
  const ascii = attr(node, "ascii")
  const hAnsi = attr(node, "hAnsi")
  const cs = attr(node, "cs")
  const eastAsia = attr(node, "eastAsia")
  const hint = oneOf(attr(node, "hint"), FONT_HINTS)
  const asciiTheme = attr(node, "asciiTheme")
  const hAnsiTheme = attr(node, "hAnsiTheme")
  const eastAsiaTheme = attr(node, "eastAsiaTheme")
  const csTheme = attr(node, "cstheme")
  if (ascii) {
    fonts.ascii = ascii
  }
  if (hAnsi) {
    fonts.hAnsi = hAnsi
  }
  if (cs) {
    fonts.cs = cs
  }
  if (eastAsia) {
    fonts.eastAsia = eastAsia
  }
  if (hint) {
    fonts.hint = hint
  }
  if (asciiTheme) {
    fonts.asciiTheme = asciiTheme
  }
  if (hAnsiTheme) {
    fonts.hAnsiTheme = hAnsiTheme
  }
  if (eastAsiaTheme) {
    fonts.eastAsiaTheme = eastAsiaTheme
  }
  if (csTheme) {
    fonts.csTheme = csTheme
  }
  return ascii || hAnsi || cs || eastAsia || hint || asciiTheme || hAnsiTheme || eastAsiaTheme || csTheme
    ? fonts
    : undefined
}

function readUnderline(node: MarkupNode | undefined): Underline | undefined {
  if (!node) {
    return undefined
  }
  const value = oneOf(attr(node, "val") ?? "single", UNDERLINE_VALUES)
  if (!value) {
    return undefined
  }
  const color = readColor(attr(node, "color"))
  return color ? { value, color } : { value }
}

function readLanguage(node: MarkupNode | undefined): Language | undefined {
  if (!node) {
    return undefined
  }
  const lang: Language = {}
  const val = readLang(attr(node, "val"))
  const eastAsia = readLang(attr(node, "eastAsia"))
  const bidi = readLang(attr(node, "bidi"))
  if (val) {
    lang.val = val
  }
  if (eastAsia) {
    lang.eastAsia = eastAsia
  }
  if (bidi) {
    lang.bidi = bidi
  }
  return val || eastAsia || bidi ? lang : undefined
}

function noteParagraphs(blocks: Block[], styles: StyleCatalog, notes: WordNote[]) {
  const seen = new Set<string>()
  for (const paragraph of paragraphsIn(blocks)) {
    if (paragraph.styleId && !styles.styles.some((style) => style.id === paragraph.styleId)) {
      notes.push({ code: "undefined-style", message: `Style ${paragraph.styleId} is not defined.` })
    }
    if (!paragraph.paraId) {
      continue
    }
    if (seen.has(paragraph.paraId)) {
      notes.push({ code: "duplicate-para-id", message: `paraId ${paragraph.paraId} is used more than once.` })
    }
    seen.add(paragraph.paraId)
  }
}

function dropUnpairedBookmarks(blocks: Block[], notes: WordNote[]) {
  const starts = new Set<number>()
  const ends = new Set<number>()
  const commentStarts = new Set<number>()
  const commentEnds = new Set<number>()
  for (const paragraph of paragraphsIn(blocks)) {
    eachInline(paragraph.inlines, (inline) => {
      if (inline.kind === "bookmarkStart") {
        starts.add(inline.id)
      } else if (inline.kind === "bookmarkEnd") {
        ends.add(inline.id)
      } else if (inline.kind === "commentRangeStart") {
        commentStarts.add(inline.id)
      } else if (inline.kind === "commentRangeEnd") {
        commentEnds.add(inline.id)
      }
    })
  }
  let droppedBookmark = false
  let droppedComment = false
  const mark = (kind: "bookmark" | "comment") => {
    if (kind === "bookmark") {
      droppedBookmark = true
    } else {
      droppedComment = true
    }
  }
  for (const paragraph of paragraphsIn(blocks)) {
    paragraph.inlines = filterBookmarks(paragraph.inlines, starts, ends, commentStarts, commentEnds, mark)
  }
  if (droppedBookmark) {
    notes.push({ code: "unpaired-bookmark", message: "A bookmark has no matching start or end, so it was dropped." })
  }
  if (droppedComment) {
    notes.push({
      code: "unpaired-comment",
      message: "A comment range has no matching start or end, so it was dropped.",
    })
  }
}

function filterBookmarks(
  inlines: Inline[],
  starts: Set<number>,
  ends: Set<number>,
  commentStarts: Set<number>,
  commentEnds: Set<number>,
  markDropped: (kind: "bookmark" | "comment") => void,
): Inline[] {
  const kept: Inline[] = []
  for (const inline of inlines) {
    if (inline.kind === "bookmarkStart" || inline.kind === "bookmarkEnd") {
      const keep = inline.kind === "bookmarkStart" ? ends.has(inline.id) : starts.has(inline.id)
      if (!keep) {
        markDropped("bookmark")
      } else {
        kept.push(inline)
      }
      continue
    }
    if (inline.kind === "commentRangeStart" || inline.kind === "commentRangeEnd") {
      const keep = inline.kind === "commentRangeStart" ? commentEnds.has(inline.id) : commentStarts.has(inline.id)
      if (!keep) {
        markDropped("comment")
      } else {
        kept.push(inline)
      }
      continue
    }
    if (hasNestedInlines(inline)) {
      kept.push(
        replaceInlines(inline, filterBookmarks(inline.inlines, starts, ends, commentStarts, commentEnds, markDropped)),
      )
      continue
    }
    kept.push(inline)
  }
  return kept
}

function replaceInlines(inline: Inline & { inlines: Inline[] }, inlines: Inline[]): Inline {
  if (inline.kind === "simpleField" || inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "del") {
    return { ...inline, inlines }
  }
  return inline
}

function hasNestedInlines(inline: Inline): inline is Inline & { inlines: Inline[] } {
  return inline.kind === "simpleField" || inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "del"
}

function eachInline(inlines: Inline[], visit: (inline: Inline) => void) {
  for (const inline of inlines) {
    visit(inline)
    if (hasNestedInlines(inline)) {
      eachInline(inline.inlines, visit)
    }
  }
}

function flattenUnbalancedFields(blocks: Block[], notes: WordNote[]) {
  if (fieldsBalanced(blocks)) {
    return
  }
  notes.push({
    code: "unbalanced-field",
    message: "A complex field has no matching end. Its instruction is body text.",
  })
  for (const paragraph of paragraphsIn(blocks)) {
    paragraph.inlines = paragraph.inlines.flatMap((inline) => flattenInline(inline))
  }
}

function fieldsBalanced(blocks: Block[]) {
  let depth = 0
  for (const paragraph of paragraphsIn(blocks)) {
    depth = fieldDepth(paragraph.inlines, depth)
    if (depth < 0) {
      return false
    }
  }
  return depth === 0
}

function fieldDepth(inlines: Inline[], depth: number) {
  for (const inline of inlines) {
    if (hasNestedInlines(inline)) {
      depth = fieldDepth(inline.inlines, depth)
      if (depth < 0) {
        return depth
      }
      continue
    }
    if (inline.kind !== "run") {
      continue
    }
    for (const content of inline.content) {
      if (content.kind !== "fldChar") {
        continue
      }
      if (content.fieldType === "begin") {
        depth += 1
      } else if (content.fieldType === "end") {
        depth -= 1
      }
      if (depth < 0) {
        return depth
      }
    }
  }
  return depth
}

function flattenInline(inline: Inline): Inline[] {
  if (hasNestedInlines(inline)) {
    return [
      replaceInlines(
        inline,
        inline.inlines.flatMap((item) => flattenInline(item)),
      ),
    ]
  }
  if (inline.kind !== "run") {
    return [inline]
  }
  const hadField = inline.content.some((item) => item.kind === "fldChar" || item.kind === "instrText")
  const content: RunContent[] = []
  for (const item of inline.content) {
    if (item.kind === "fldChar") {
      continue
    }
    if (item.kind === "instrText") {
      if (item.text) {
        content.push({ kind: "text", text: item.text })
      }
      continue
    }
    content.push(item)
  }
  if (content.length === 0) {
    return hadField ? [] : [inline]
  }
  return [{ ...inline, content }]
}

function attachStories(pkg: OpcPackage, doc: WordDocument) {
  const cache = new Map<string, { blocks: Block[]; rootAttributes: RootAttribute[]; links?: PartLinks }>()
  const sections = sectionsOf(doc)
  for (const section of sections) {
    for (const ref of section.references ?? []) {
      const relationship = relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === ref.relId)
      const partName = relationship?.partName
      if (!partName) {
        doc.notes.push({
          code: "missing-header",
          message: `Relationship ${ref.relId} does not point at a header or footer part.`,
        })
        continue
      }
      ref.partName = partName
      const cached = cache.get(partName)
      if (cached) {
        ref.blocks = cached.blocks
        ref.rootAttributes = cached.rootAttributes
        if (cached.links) {
          ref.links = cached.links
        }
        continue
      }
      const part = findPart(pkg, partName)
      if (!part) {
        doc.notes.push({ code: "missing-header", message: `Header or footer part ${partName} is missing.` })
        continue
      }
      const story = { ...readStory(decodeXml(part.data), doc.notes), links: partLinks(pkg, partName) }
      cache.set(partName, story)
      ref.blocks = story.blocks
      ref.rootAttributes = story.rootAttributes
      if (story.links) {
        ref.links = story.links
      }
    }
  }
}

function sectionsOf(doc: WordDocument) {
  const sections: SectionProps[] = []
  if (doc.section) {
    sections.push(doc.section)
  }
  for (const paragraph of paragraphsIn(doc.blocks)) {
    if (paragraph.sectionBreak) {
      sections.push(paragraph.sectionBreak)
    }
  }
  return sections
}

function readStory(xml: string, notes: WordNote[]) {
  const raw = rawCursor(xml)
  let root: MarkupNode
  try {
    root = parseAnyRoot(xml, ["hdr", "ftr"])
  } catch (error) {
    notes.push({
      code: "broken-story",
      message: error instanceof Error ? error.message : "A header or footer part is not usable.",
    })
    return { blocks: [] as Block[], rootAttributes: [] as RootAttribute[] }
  }
  return { blocks: readBlocks(root, notes, raw), rootAttributes: copiedAttributes(root) }
}

/** Blocks of a header, footer, note, or comment. `raw` walks the part's pictures and content controls in order. */
function readBlocks(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW) {
  const blocks = readBlockChildren(node, notes, raw)
  dropUnpairedBookmarks(blocks, notes)
  flattenUnbalancedFields(blocks, notes)
  return blocks
}

/**
 * A story part's relationships other than hyperlinks, and the parts they point at, so pictures in headers,
 * footers, notes, and comments are written back with the part that shows them.
 */
function partLinks(pkg: OpcPackage, partName: string): PartLinks | undefined {
  const relationships = relationshipsFor(pkg, partName).filter((item) => !item.type.endsWith("/hyperlink"))
  if (relationships.length === 0) {
    return undefined
  }
  const parts: SavedPart[] = []
  for (const item of relationships) {
    const target = item.targetMode === "Internal" && item.partName ? findPart(pkg, item.partName) : undefined
    if (target && !parts.some((part) => part.name === target.name)) {
      parts.push({ name: target.name, contentType: target.contentType, data: transitionalPart(target) })
    }
  }
  return {
    relationships: relationships.map((item) => ({ ...item, type: transitionalUriOf(item.type) })),
    parts,
  }
}

let strictSource: { text: string; strict: boolean } | undefined

/** The element's markup as written, converted to Transitional when the part is Strict. */
function sourceOf(node: MarkupNode | undefined) {
  if (!node?.source || node.start === undefined || node.end === undefined || node.start < 0) {
    return undefined
  }
  if (strictSource?.text !== node.source) {
    strictSource = { text: node.source, strict: isStrictMarkup(node.source) }
  }
  const xml = node.source.slice(node.start, node.end)
  return strictSource.strict ? transitionalMarkup(xml) : xml
}

/** A property element's children as written, with a snapshot of the model read from them. */
function elementSource(node: MarkupNode | undefined, model: unknown): ElementSource | undefined {
  const xml = sourceOf(node)
  // Strict markup measures in points and names sides start/end; the model already converts it, so a Strict
  // document is written from the model alone.
  if (!xml || strictSource?.strict) {
    return undefined
  }
  const children = elementChildren(xml)
  return children.length > 0 ? { children, model: snapshot(model) } : undefined
}

/** Inline markers Word may put between paragraphs; they belong to the paragraph next to them. */
const OPENING_MARKERS = new Set([
  "bookmarkStart",
  "commentRangeStart",
  "permStart",
  "moveFromRangeStart",
  "moveToRangeStart",
])
const CLOSING_MARKERS = new Set(["bookmarkEnd", "commentRangeEnd", "permEnd", "moveFromRangeEnd", "moveToRangeEnd"])
const IGNORED_BLOCKS = new Set(["sectPr", "tcPr", "proofErr"])

/**
 * Paragraphs, tables, and content controls of a body, cell, header, footer, note, or comment. Markers between
 * paragraphs move into the paragraph next to them; anything else the model does not cover is kept as written.
 */
function readBlockChildren(node: MarkupNode, notes: WordNote[], raw: RawCursor = NO_RAW) {
  const blocks: Block[] = []
  let pending: Inline[] = []
  const lastParagraph = () => {
    const last = blocks[blocks.length - 1]
    return last?.kind === "paragraph" ? last : undefined
  }
  for (const child of node.children) {
    if (child.uri === MATH_NS) {
      const xml = sourceOf(child)
      if (xml) {
        blocks.push({ kind: "raw", xml, text: visibleText(child) })
      }
      continue
    }
    if (child.uri !== WORD_NS || IGNORED_BLOCKS.has(child.local)) {
      continue
    }
    if (child.local === "p") {
      const paragraph = readParagraph(child, notes, raw)
      paragraph.inlines = [...pending, ...paragraph.inlines]
      pending = []
      blocks.push(paragraph)
    } else if (child.local === "tbl") {
      blocks.push(readTable(child, notes, raw))
    } else if (child.local === "sdt") {
      const control: Block = { kind: "raw", xml: raw.take("sdt") ?? sourceOf(child) ?? "", text: visibleText(child) }
      const content = wordChild(child, "sdtContent")
      if (content && isTocControl(child)) {
        // Read for the editor's table of contents; the control itself is written back as read.
        control.blocks = readBlocks(content, [])
      }
      blocks.push(control)
    } else if (OPENING_MARKERS.has(child.local) || CLOSING_MARKERS.has(child.local)) {
      const marker = readMarker(child)
      const previous = lastParagraph()
      if (marker && CLOSING_MARKERS.has(child.local) && previous && pending.length === 0) {
        previous.inlines.push(marker)
      } else if (marker) {
        pending.push(marker)
      }
    } else {
      const xml = sourceOf(child)
      if (xml) {
        blocks.push({ kind: "raw", xml, text: visibleText(child) })
      }
    }
  }
  if (pending.length > 0) {
    const previous = lastParagraph()
    if (previous) {
      previous.inlines.push(...pending)
    } else {
      blocks.push({ ...emptyParagraph(), inlines: pending })
    }
  }
  return blocks
}

/** A marker element as an inline: modelled bookmarks and comment ranges, anything else as written. */
function readMarker(node: MarkupNode): Inline | undefined {
  const pieces = readPieces({ ...node, children: [node] } as MarkupNode, [])
  return piecesToInlines(pieces)[0]
}

function copiedAttributes(node: MarkupNode): RootAttribute[] {
  // w:conformance="strict" would mark the Transitional markup the writer produces as Strict.
  return node.attributes
    .filter((item) => !(item.local === "conformance" && item.uri === WORD_NS))
    .map((item) => ({ prefix: item.prefix, local: item.local, value: item.value }))
}

function locatePart(pkg: OpcPackage, types: string[]) {
  const relationship = relationshipsFor(pkg, pkg.mainPartName).find(
    (item) => types.includes(item.type) && item.partName,
  )
  if (!relationship?.partName) {
    return undefined
  }
  const part = findPart(pkg, relationship.partName)
  if (!part) {
    return undefined
  }
  return { xml: decodeXml(part.data), relId: relationship.id, partName: relationship.partName }
}

function attachNotes(pkg: OpcPackage, doc: WordDocument) {
  const footnotes = readNotePart(pkg, doc, "footnotes", "footnote")
  const endnotes = readNotePart(pkg, doc, "endnotes", "endnote")
  if (footnotes) {
    doc.footnotes = footnotes
  }
  if (endnotes) {
    doc.endnotes = endnotes
  }
}

function readNotePart(
  pkg: OpcPackage,
  doc: WordDocument,
  partLocal: "footnotes" | "endnotes",
  itemLocal: "footnote" | "endnote",
): NotePart | undefined {
  const located = locatePart(
    pkg,
    REL_TYPES.map((base) => `${base}${partLocal}`),
  )
  if (!located) {
    return undefined
  }
  try {
    const root = parseAnyRoot(located.xml, partLocal)
    const raw = rawCursor(located.xml)
    const items: Note[] = []
    for (const child of wordChildren(root, itemLocal)) {
      const id = readInt(attr(child, "id"))
      if (id === undefined) {
        continue
      }
      const type = oneOf(attr(child, "type"), NOTE_TYPES)
      const blocks = readBlocks(child, doc.notes, raw)
      items.push(type ? { id, type, blocks } : { id, blocks })
    }
    const links = partLinks(pkg, located.partName)
    return { relId: located.relId, rootAttributes: copiedAttributes(root), items, ...(links ? { links } : {}) }
  } catch (error) {
    doc.notes.push({
      code: "broken-notes",
      message: error instanceof Error ? error.message : `${partLocal}.xml is not usable.`,
    })
    return undefined
  }
}

function attachComments(pkg: OpcPackage, doc: WordDocument) {
  const located = locatePart(
    pkg,
    REL_TYPES.map((base) => `${base}comments`),
  )
  if (!located) {
    return
  }
  try {
    const root = parseAnyRoot(located.xml, "comments")
    const raw = rawCursor(located.xml)
    const items: Comment[] = []
    for (const child of wordChildren(root, "comment")) {
      const id = readInt(attr(child, "id"))
      if (id === undefined) {
        continue
      }
      const comment: Comment = { id, blocks: readBlocks(child, doc.notes, raw) }
      const author = attr(child, "author")
      const date = attr(child, "date")
      const initials = attr(child, "initials")
      if (author) {
        comment.author = author
      }
      if (date) {
        comment.date = date
      }
      if (initials) {
        comment.initials = initials
      }
      items.push(comment)
    }
    const part: CommentPart = { relId: located.relId, rootAttributes: copiedAttributes(root), items }
    const links = partLinks(pkg, located.partName)
    if (links) {
      part.links = links
    }
    const extended = readExtension(pkg, doc, [COMMENTS_EXTENDED_REL], "commentEx", (child) => {
      const paraId = attr(child, "paraId", W15_NS)
      if (!paraId) {
        return undefined
      }
      const item: CommentEx = { paraId }
      const parent = attr(child, "paraIdParent", W15_NS)
      const done = readBool(attr(child, "done", W15_NS))
      if (parent) {
        item.parentParaId = parent
      }
      if (done !== undefined) {
        item.done = done
      }
      return item
    })
    if (extended) {
      part.extended = extended.items
      part.extendedRelId = extended.relId
      part.extendedRoot = extended.rootAttributes
    }
    const ids = readExtension(pkg, doc, [COMMENTS_IDS_REL], "commentId", (child) => {
      const paraId = attr(child, "paraId", W16CID_NS)
      const durableId = attr(child, "durableId", W16CID_NS)
      return paraId && durableId ? ({ paraId, durableId } satisfies CommentId) : undefined
    })
    if (ids) {
      part.ids = ids.items
      part.idsRelId = ids.relId
      part.idsRoot = ids.rootAttributes
    }
    const extensible = readExtension(pkg, doc, [COMMENTS_EXTENSIBLE_REL], "commentExtensible", (child) => {
      const durableId = attr(child, "durableId", W16CEX_NS)
      if (!durableId) {
        return undefined
      }
      const item: CommentExtensible = { durableId }
      const dateUtc = attr(child, "dateUtc", W16CEX_NS)
      if (dateUtc) {
        item.dateUtc = dateUtc
      }
      return item
    })
    if (extensible) {
      part.extensible = extensible.items
      part.extensibleRelId = extensible.relId
      part.extensibleRoot = extensible.rootAttributes
    }
    doc.comments = part
  } catch (error) {
    doc.notes.push({
      code: "broken-comments",
      message: error instanceof Error ? error.message : "comments.xml is not usable.",
    })
  }
}

function readExtension<T>(
  pkg: OpcPackage,
  doc: WordDocument,
  types: string[],
  local: string,
  readItem: (node: MarkupNode) => T | undefined,
) {
  const located = locatePart(pkg, types)
  if (!located) {
    return undefined
  }
  try {
    const root = parseAnyRoot(located.xml, "*")
    const items: T[] = []
    for (const child of root.children) {
      if (child.local !== local) {
        continue
      }
      const item = readItem(child)
      if (item) {
        items.push(item)
      }
    }
    return { items, relId: located.relId, rootAttributes: copiedAttributes(root) }
  } catch (error) {
    doc.notes.push({
      code: "broken-comments",
      message: error instanceof Error ? error.message : `${local} part is not usable.`,
    })
    return undefined
  }
}

function attachPeople(pkg: OpcPackage, doc: WordDocument) {
  const located = locatePart(pkg, [PEOPLE_REL])
  if (!located) {
    return
  }
  try {
    const root = parseAnyRoot(located.xml, "*")
    const items: Person[] = []
    for (const child of root.children) {
      if (child.local !== "person") {
        continue
      }
      const author = attr(child, "author", W15_NS)
      if (!author) {
        continue
      }
      const presence = child.children.find((item) => item.local === "presenceInfo")
      const person: Person = { author }
      const providerId = presence ? attr(presence, "providerId", W15_NS) : undefined
      const userId = presence ? attr(presence, "userId", W15_NS) : undefined
      if (providerId) {
        person.providerId = providerId
      }
      if (userId) {
        person.userId = userId
      }
      items.push(person)
    }
    const part: PeoplePart = { relId: located.relId, rootAttributes: copiedAttributes(root), items }
    doc.people = part
  } catch (error) {
    doc.notes.push({
      code: "broken-people",
      message: error instanceof Error ? error.message : "people.xml is not usable.",
    })
  }
}

function attachMedia(pkg: OpcPackage, doc: WordDocument) {
  const media: MediaPart[] = []
  for (const rel of relationshipsFor(pkg, pkg.mainPartName)) {
    if (!rel.type.endsWith("/image") || !rel.partName) {
      continue
    }
    const part = findPart(pkg, rel.partName)
    if (!part) {
      continue
    }
    media.push({
      relId: rel.id,
      type: transitionalUriOf(rel.type),
      target: rel.target,
      name: part.name,
      contentType: part.contentType,
      data: part.data,
    })
  }
  if (media.length > 0) {
    doc.media = media
  }
}

function attachGlossary(pkg: OpcPackage, doc: WordDocument) {
  const rel = relationshipsFor(pkg, pkg.mainPartName).find(
    (item) => item.type.endsWith("/glossaryDocument") && item.partName,
  )
  if (!rel?.partName) {
    return
  }
  const glossary: GlossaryPackage = {
    relId: rel.id,
    type: transitionalUriOf(rel.type),
    target: rel.target,
    partName: rel.partName,
    parts: pkg.parts
      .filter((part) => part.name.startsWith("/word/glossary/"))
      .map((part) => ({ name: part.name, contentType: part.contentType, data: transitionalPart(part) })),
    relationships: pkg.relationships
      .filter((group) => group.source.startsWith("/word/glossary/"))
      .map((group) => ({ source: group.source, items: transitionalRelationships(group.items) })),
  }
  doc.glossary = glossary
}

/**
 * Theme, font table, and properties go back byte for byte (Strict ones converted to Transitional, since the
 * writer produces a Transitional package). The glossary writes its own copies.
 */
function keepsAsWritten(part: OpcPart) {
  return isPassthroughPart(part) && !part.name.toLowerCase().startsWith("/word/glossary/")
}

/** A kept part's bytes, converted when it is Strict XML. */
function transitionalPart(part: { name: string; contentType?: string; data: Uint8Array }) {
  // XML by its type ("...+xml", "text/xml") or name. "openxmlformats" is in the type of binary parts too (an OLE
  // object can be tens of megabytes), so the type is not searched for "xml" as a substring.
  if (!/(^|[/+])xml(;|$)/i.test(part.contentType ?? "") && !part.name.toLowerCase().endsWith(".xml")) {
    return part.data
  }
  const xml = decodeXml(part.data)
  return isStrictMarkup(xml) ? new TextEncoder().encode(transitionalMarkup(xml)) : part.data
}

function transitionalRelationships<T extends { type: string }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, type: transitionalUriOf(item.type) }))
}

/**
 * Parts behind a drawing the editor keeps whole: charts with their styles and data workbooks, SmartArt, embedded
 * objects. The writer has no model for them, so they go back as they came, with their own relationships.
 */
function belongsToKeptDrawing(part: OpcPart) {
  return (
    /\.drawingml\.|chart|spreadsheetml|presentationml|oleObject/i.test(part.contentType) ||
    part.name.toLowerCase().startsWith("/word/embeddings/")
  )
}

function attachPreserved(pkg: OpcPackage, doc: WordDocument) {
  const unknown = new Set(
    pkg.parts
      .filter((part) => isUnknownPart(part) || keepsAsWritten(part) || belongsToKeptDrawing(part))
      .map((part) => partKey(part.name)),
  )
  if (unknown.size === 0) {
    return
  }
  const main = partKey(pkg.mainPartName)
  const preserved: PreservedPackage = {
    parts: pkg.parts
      .filter((part) => unknown.has(partKey(part.name)))
      .map((part) => ({ name: part.name, contentType: part.contentType, data: transitionalPart(part) })),
    relationships: pkg.relationships.flatMap((group) => {
      const sourceUnknown = group.source ? unknown.has(partKey(group.source)) : false
      const items = group.items.filter(
        (item) => sourceUnknown || (item.partName ? unknown.has(partKey(item.partName)) : false),
      )
      if (items.length === 0) {
        return []
      }
      const source = group.source && partKey(group.source) === main ? "/word/document.xml" : group.source
      return [{ source, items: transitionalRelationships(items) }]
    }),
  }
  doc.preserved = preserved
}

function bindHyperlinks(pkg: OpcPackage, doc: WordDocument) {
  bindHyperlinkStory(pkg, pkg.mainPartName, doc.blocks)
  for (const section of sectionsOf(doc)) {
    for (const ref of section.references ?? []) {
      if (ref.partName) {
        bindHyperlinkStory(pkg, ref.partName, ref.blocks)
      }
    }
  }
  bindNoteHyperlinks(pkg, doc.footnotes, "/word/footnotes.xml")
  bindNoteHyperlinks(pkg, doc.endnotes, "/word/endnotes.xml")
  if (doc.comments) {
    bindHyperlinkStory(
      pkg,
      "/word/comments.xml",
      doc.comments.items.flatMap((comment) => comment.blocks),
    )
  }
}

function bindNoteHyperlinks(pkg: OpcPackage, part: NotePart | undefined, source: string) {
  if (!part) {
    return
  }
  bindHyperlinkStory(
    pkg,
    source,
    part.items.flatMap((note) => note.blocks),
  )
}

function bindHyperlinkStory(pkg: OpcPackage, source: string, blocks: Block[]) {
  const rels = relationshipsFor(pkg, source)
  for (const paragraph of paragraphsIn(blocks)) {
    eachInline(paragraph.inlines, (inline) => {
      if (inline.kind !== "hyperlink" || !inline.relId) {
        return
      }
      const relationship = rels.find((item) => item.id === inline.relId)
      if (relationship?.targetMode === "External") {
        inline.target = relationship.target
      }
    })
  }
}

function isTocControl(node: MarkupNode) {
  const gallery = wordChild(wordChild(wordChild(node, "sdtPr"), "docPartObj"), "docPartGallery")
  return attr(gallery, "val") === "Table of Contents"
}

function wordChild(node: MarkupNode | undefined, local: string) {
  return node?.children.find((child) => child.uri === WORD_NS && child.local === local)
}

function wordChildren(node: MarkupNode, local: string) {
  return node.children.filter((child) => child.uri === WORD_NS && child.local === local)
}

function attr(node: MarkupNode | undefined, local: string, uri = WORD_NS) {
  return node?.attributes.find((item) => item.local === local && item.uri === uri)?.value
}

function childVal(node: MarkupNode | undefined, local: string) {
  return attr(wordChild(node, local), "val")
}

function preservesSpace(node: MarkupNode) {
  const value = node.attributes.find((item) => item.local === "space" && (item.uri === XML_NS || item.prefix === "xml"))
  return value?.value === "preserve"
}

function applySpace(text: string, preserve: boolean) {
  if (preserve) {
    return text
  }
  return text.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "")
}

function readBool(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }
  if (value === "1" || value === "true" || value === "on") {
    return true
  }
  if (value === "0" || value === "false" || value === "off") {
    return false
  }
  return undefined
}

function assignBool<T extends object>(target: T, key: keyof T, value: string | undefined) {
  const bit = readBool(value)
  if (bit !== undefined) {
    target[key] = bit as T[keyof T]
  }
}

function readOnOff(node: MarkupNode | undefined) {
  if (!node) {
    return undefined
  }
  const value = attr(node, "val")
  if (value === undefined) {
    return true
  }
  if (value === "1" || value === "true" || value === "on") {
    return true
  }
  if (value === "0" || value === "false" || value === "off") {
    return false
  }
  return undefined
}

function isOn(value: string | undefined) {
  return value === "1" || value === "true" || value === "on"
}

function assignOnOff<T extends object>(target: T, key: keyof T, node: MarkupNode | undefined) {
  const value = readOnOff(node)
  if (value !== undefined) {
    target[key] = value as T[keyof T]
  }
}

function assignInt<T extends object>(target: T, key: keyof T, value: string | undefined) {
  const number = readInt(value)
  if (number !== undefined) {
    target[key] = number as T[keyof T]
  }
}

function assignUint<T extends object>(target: T, key: keyof T, value: string | undefined) {
  const number = readUint(value)
  if (number !== undefined) {
    target[key] = number as T[keyof T]
  }
}

function readInt(value: string | undefined) {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    return undefined
  }
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

const UNIVERSAL_MEASURE = /^(-?\d+(?:\.\d+)?)(mm|cm|in|pt|pc|pi)$/
const TWIPS_PER_UNIT: Record<string, number> = { mm: 1440 / 25.4, cm: 1440 / 2.54, in: 1440, pt: 20, pc: 240, pi: 240 }

/** Twips, from a plain number or a Strict universal measure such as "36pt" or "2.54cm". */
function readMeasure(value: string | undefined) {
  const match = value === undefined ? null : UNIVERSAL_MEASURE.exec(value)
  if (match) {
    return Math.round(Number(match[1]) * (TWIPS_PER_UNIT[match[2]!] ?? 0))
  }
  return readInt(value)
}

function readUMeasure(value: string | undefined) {
  const number = readMeasure(value)
  return number !== undefined && number >= 0 ? number : undefined
}

function assignMeasure<T extends object>(target: T, key: keyof T, value: string | undefined) {
  const number = readUMeasure(value)
  if (number !== undefined) {
    target[key] = number as T[keyof T]
  }
}

function readPercent(value: string) {
  const number = Number(value.slice(0, -1))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 50) : undefined
}

/** Strict's start and end are Transitional's left and right, which already follow the paragraph direction. */
function logicalSide(value: string | undefined) {
  return value === "start" ? "left" : value === "end" ? "right" : value
}

/** A side child, accepting Strict's start/end for left/right. */
function sideChild(node: MarkupNode | undefined, side: string) {
  const strict = side === "left" ? "start" : side === "right" ? "end" : undefined
  return wordChild(node, side) ?? (strict ? wordChild(node, strict) : undefined)
}

function readUint(value: string | undefined) {
  const number = readInt(value)
  return number !== undefined && number >= 0 ? number : undefined
}

function readHex(value: string | undefined) {
  if (!value || !/^[0-9A-Fa-f]{8}$/.test(value)) {
    return undefined
  }
  return value.toUpperCase()
}

function readParaId(value: string | undefined, notes: WordNote[]) {
  if (value === undefined) {
    return undefined
  }
  const hex = readHex(value)
  if (!hex || Number.parseInt(hex, 16) >= 0x80000000) {
    notes.push({ code: "invalid-para-id", message: `Paragraph id ${value} is not below 0x80000000.` })
    return undefined
  }
  return hex
}

function readColor(value: string | undefined) {
  if (!value) {
    return undefined
  }
  if (value.toLowerCase() === "auto") {
    return "auto"
  }
  return /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : undefined
}

function readLang(value: string | undefined) {
  if (!value || !/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(value)) {
    return undefined
  }
  return value
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) {
    return undefined
  }
  return allowed.includes(value as T) ? (value as T) : undefined
}
