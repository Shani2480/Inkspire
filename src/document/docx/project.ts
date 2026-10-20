import { BUILT_IN_STYLES, catalogWithStyles, wordIdForNamedStyle, type StyleDef } from "@/document/styles"
import type { DocumentChrome } from "@/document/header"
import { emptyChrome } from "@/document/header"
import { storyShapes } from "@/document/docx/chrome-shapes"
import { bordersOf, shadingOf } from "@/document/docx/cell-edits"
import { cellCss, tableLookTokens, tableVariables, themeFontsOf } from "@/document/docx/word-styles"
import type { PageSetup, PaperSize, SectionStart } from "@/document/page-setup"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import type { DocumentProps } from "@/document/store"
import {
  blockFromAttrs,
  blockFromProperties,
  blockHtmlAttributes,
  propertiesFromBlock,
} from "@/document/docx/block-format"
import {
  blockAtomHtml,
  commentsFromEditor,
  imageRun,
  inlinesFromEditor,
  diagramSvg,
  inlinesHtml,
  mediaFor,
  numberAttr,
  payloadBlock,
  payloadInlines,
  placeCommentRanges,
  projectionFor,
  type InlineBuild,
  type JsonNode,
  type Projection,
} from "@/document/docx/inlines"
import { readLooseTocAt, readTocAt, tocBlocks } from "@/document/docx/toc"
import { headingBookmark, readTocEntries, tocLevelOf, tocOptions, type TocStyleLike } from "@/document/toc"
import {
  DEFAULT_SECTION,
  emptyNumbering,
  emptyParagraph,
  numberingLevel,
  paragraphsIn,
  paragraphText,
  tablesIn,
  type Block,
  type Border,
  type HeaderFooterRef,
  type HeaderFooterType,
  type Hyperlink,
  type Inline,
  type LineNumbering,
  type NumberingDefinitions,
  type Paragraph,
  type ParagraphProperties,
  type Run,
  type RunProperties,
  type SectionProps,
  type Style,
  type StyleCatalog,
  type Table,
  type TableCell,
  type TableRow,
  type WordDocument,
} from "@/document/docx/model"

const TWIP_PER_MM = 1440 / 25.4
const TWIP_PER_PX = 1440 / 96

const PAPER_TWIPS: Record<PaperSize, { w: number; h: number }> = {
  letter: { w: 12240, h: 15840 },
  a4: { w: 11906, h: 16838 },
  legal: { w: 12240, h: 20160 },
}

export type EditorView = {
  html: string
  chrome: DocumentChrome
  props: Partial<DocumentProps>
}

type Build = InlineBuild & {
  /** The document's styles, for the Word id of each paragraph's named style. */
  styles: StyleDef[]
  bulletId: number
  orderedId: number
  origins: Origins
  numbering: NumberingDefinitions
  toc: TocLinks
}

/** How tables of contents link to their headings when saved. */
type TocLinks = {
  /** Bookmarks to add to headings that a table of contents links to but that have none. */
  bookmarks: Map<JsonNode, { id: number; name: string }>
  /** The bookmark each entry of a table of contents links to, by entry. */
  anchors: Map<JsonNode, (string | undefined)[]>
  /** The width between the margins, for the right-aligned page numbers. */
  textWidth: number
}

/** Source paragraphs and tables by editor anchor, for saving an opened document. */
type Origins = {
  paragraphs: Map<string, Paragraph>
  tables: Map<string, Table>
  runs: Map<string, Run>
  /** The hyperlink each source run sat in, by run anchor. */
  links: Map<string, Hyperlink>
  /** The paragraph each source run sat in, by run anchor. */
  runParagraphs: Map<string, Paragraph>
  /** Anchors whose section break has been placed; a split paragraph must not end the section twice. */
  sectionsPlaced: Set<string>
}

export function wordToEditor(doc: WordDocument): EditorView {
  assignKeys(doc)
  return {
    html: blocksToHtml(doc.blocks, projectionFor(doc)),
    chrome: chromeFromDocument(doc),
    props: {},
  }
}

export function editorToWord(
  json: JsonNode,
  chrome: DocumentChrome,
  _props: Partial<DocumentProps>,
  base?: WordDocument | null,
  documentStyles: StyleDef[] = BUILT_IN_STYLES,
): WordDocument {
  const source = base ? structuredClone(base) : null
  const origins = originsOf(source)
  const build: Build = {
    styles: documentStyles,
    media: [...(source?.media ?? [])],
    picture: (source?.media?.length ?? 0) + 1,
    usedParts: new Set(
      [...(source?.preserved?.parts ?? []), ...(source?.media ?? [])].map((part) => part.name.toLowerCase()),
    ),
    preserved: source?.preserved,
    bulletId: 0,
    orderedId: 0,
    origins,
    numbering: source?.numbering ?? emptyNumbering(),
    runs: origins.runs,
    links: origins.links,
    comments: new Map(),
    tags: new Map(),
    revisionIds: new Map(),
    nextRevision: 1_000_000,
    theme: source ? themeFontsOf(source) : undefined,
    toc: { bookmarks: new Map(), anchors: new Map(), textWidth: 0 },
  }
  const section = sectionFromChrome(chrome, source?.section ?? null, source === null)
  build.section = source?.section ?? section
  build.toc = linkTocEntries(json, section, documentStyles)
  const numbering = ensureListNumbering(build.numbering, json, build)
  build.numbering = numbering
  const blocks = blocksFromNodes(json.content ?? [], build, 0)
  dropEditorTrailingParagraph(blocks)
  const comments = commentsFromEditor(build.comments, source?.comments)
  placeCommentRanges(blocks, build.tags, comments.ids, commentReferenceProps(source))
  const styles = ensureEditorStyles(
    catalogWithStyles(
      source?.styles ?? { docDefaults: { pPr: {}, rPr: {} }, styles: [] },
      documentStyles,
      usedStyleIds(blocks),
    ),
    blocks,
    source === null,
  )
  const settings = {
    ...(source?.settings ?? { compatibilityMode: 15, rsids: [] }),
    evenAndOddHeaders: chrome.pageSetup.differentOddEven ? true : undefined,
  }
  const document: WordDocument = {
    ...(source ?? {
      notes: [],
      settings,
      styles,
      numbering,
    }),
    blocks: blocks.length > 0 ? blocks : [emptyParagraph()],
    section,
    styles,
    numbering,
    settings,
    media: build.media.length > 0 ? build.media : undefined,
    comments: comments.part,
  }
  return document
}

/**
 * Gives every paragraph and table an anchor the editor carries as data-docx. Saving copies anchors into the new
 * document, so they keep pointing at the right source across saves.
 */
function assignKeys(doc: WordDocument) {
  const used = new Set<string>()
  const tables = tablesIn(doc.blocks)
  const paragraphs = paragraphsIn(doc.blocks)
  for (const item of [...paragraphs, ...tables, ...runsIn(doc.blocks)]) {
    if (item.key) {
      used.add(item.key)
    }
  }
  // A per-open prefix, so a paragraph pasted from another document never matches a source here.
  const scope = Math.random().toString(36).slice(2, 8)
  let next = 1
  const fresh = (kind: string) => {
    const prefix = `${scope}-${kind}`
    while (used.has(`${prefix}${next}`)) {
      next += 1
    }
    used.add(`${prefix}${next}`)
    return `${prefix}${next}`
  }
  for (const paragraph of paragraphs) {
    paragraph.key ??= fresh("p")
  }
  for (const table of tables) {
    table.key ??= fresh("t")
  }
  for (const run of runsIn(doc.blocks)) {
    run.key ??= fresh("r")
  }
}

function originsOf(source: WordDocument | null): Origins {
  const origins: Origins = {
    paragraphs: new Map(),
    tables: new Map(),
    runs: new Map(),
    links: new Map(),
    runParagraphs: new Map(),
    sectionsPlaced: new Set(),
  }
  for (const paragraph of paragraphsIn(source?.blocks ?? [])) {
    if (paragraph.key && !origins.paragraphs.has(paragraph.key)) {
      origins.paragraphs.set(paragraph.key, paragraph)
    }
  }
  for (const table of tablesIn(source?.blocks ?? [])) {
    if (table.key && !origins.tables.has(table.key)) {
      origins.tables.set(table.key, table)
    }
  }
  for (const run of runsIn(source?.blocks ?? [])) {
    if (run.key && !origins.runs.has(run.key)) {
      origins.runs.set(run.key, run)
    }
  }
  const visit = (inlines: Inline[], link: Hyperlink | undefined) => {
    for (const inline of inlines) {
      if (inline.kind === "run" && inline.key && link) {
        origins.links.set(inline.key, link)
      } else if (inline.kind === "hyperlink") {
        visit(inline.inlines, inline)
      } else if (inline.kind === "ins" || inline.kind === "del" || inline.kind === "simpleField") {
        visit(inline.inlines, link)
      }
    }
  }
  for (const paragraph of paragraphsIn(source?.blocks ?? [])) {
    visit(paragraph.inlines, undefined)
    for (const run of runsIn([paragraph])) {
      if (run.key) {
        origins.runParagraphs.set(run.key, paragraph)
      }
    }
  }
  return origins
}

/** Run properties for a new comment reference: the source's own, else the CommentReference style if defined. */
function commentReferenceProps(source: WordDocument | null): RunProperties {
  const existing = runsIn(source?.blocks ?? []).find((run) =>
    run.content.some((item) => item.kind === "commentReference"),
  )
  if (existing) {
    return existing.rPr
  }
  return source?.styles.styles.some((style) => style.id === "CommentReference") ? { rStyle: "CommentReference" } : {}
}

function runsIn(blocks: Block[]): Run[] {
  const runs: Run[] = []
  const visit = (inlines: Inline[]) => {
    for (const inline of inlines) {
      if (inline.kind === "run") {
        runs.push(inline)
      } else if (
        inline.kind === "hyperlink" ||
        inline.kind === "ins" ||
        inline.kind === "del" ||
        inline.kind === "simpleField"
      ) {
        visit(inline.inlines)
      }
    }
  }
  paragraphsIn(blocks).forEach((paragraph) => visit(paragraph.inlines))
  return runs
}

function blocksToHtml(blocks: Block[], ctx: Projection) {
  let html = ""
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]
    const toc = readTocAt(blocks, index, ctx.doc) ?? readLooseTocAt(blocks, index, ctx.doc)
    if (toc) {
      html += `<nav data-toc="${escapeAttribute(JSON.stringify(toc.entries))}" data-toc-instruction="${escapeAttribute(
        toc.instruction,
      )}" data-toc-title="${escapeAttribute(toc.title)}" data-toc-leader="${toc.leader}" data-toc-right-align="${
        toc.rightAlign
      }" data-toc-source="${escapeAttribute(toc.source)}"></nav>`
      index = toc.end
      continue
    }
    if (block?.kind === "paragraph" && block.pPr.numPr?.numId) {
      const numId = block.pPr.numPr.numId
      const tag = listTag(ctx.doc, numId)
      const items: Paragraph[] = []
      while (index < blocks.length) {
        const next = blocks[index]
        if (next?.kind !== "paragraph" || next.pPr.numPr?.numId !== numId) {
          break
        }
        items.push(next)
        index += 1
      }
      html += `<${tag}${listAttributes(tag, numId, items, ctx)}>${items.map((item) => listItemHtml(item, ctx)).join("")}</${tag}>`
      continue
    }
    if (block) {
      html += blockHtml(block, ctx)
    }
    index += 1
  }
  return html || "<p></p>"
}

/** Where Word numbers the list from, and its indent from the numbering level (or the first item's own). */
function listAttributes(tag: string, numId: number, items: Paragraph[], ctx: Projection) {
  const level = numberingLevel(ctx.doc.numbering, numId, 0)
  const before = ctx.listItems.get(numId) ?? 0
  ctx.listItems.set(numId, before + items.filter((item) => (item.pPr.numPr?.ilvl ?? 0) === 0).length)
  const start = (level?.start ?? 1) + before
  const left = items[0]?.pPr.ind?.left ?? level?.pPr.ind?.left
  const indent = left !== undefined ? `padding-left: ${left / 20}pt` : ""
  return `${tag === "ol" && start !== 1 ? ` start="${start}"` : ""} data-word-list="1"${
    indent ? ` data-word-indent="${indent}"` : ""
  }`
}

function listTag(doc: WordDocument, numId: number) {
  const level = numberingLevel(doc.numbering, numId, 0)
  return level?.format === "bullet" ? "ul" : "ol"
}

function listItemHtml(paragraph: Paragraph, ctx: Projection) {
  const level = paragraph.pPr.numPr?.ilvl ?? 0
  const indent = level > 0 ? ` data-indent="${level}"` : ""
  // A list item has to open with a paragraph; without a blank one the picture would be pushed out of the list.
  const opening = picturesOnly(paragraph, ctx.doc) ? "<p></p>" : ""
  return `<li${indent}>${opening}${paragraphHtml(paragraph, ctx)}</li>`
}

function blockHtml(block: Block, ctx: Projection) {
  if (block.kind === "table") {
    return tableHtml(block, ctx)
  }
  if (block.kind === "raw") {
    return blockAtomHtml(block, block.text)
  }
  if (isPageBreak(block)) {
    const key = block.key ? ` data-docx="${block.key}"` : ""
    return `<div data-page-break=""${key} class="page-break"></div>`
  }
  return paragraphHtml(block, ctx)
}

function paragraphHtml(paragraph: Paragraph, ctx: Projection) {
  ctx.textParagraph = paragraphText(paragraph).trim() !== ""
  const floatingOnly = paragraph.inlines.every(
    (inline) => inline.kind !== "run" || inline.content.every((item) => item.kind !== "drawing" || item.layout),
  )
  if (picturesOnly(paragraph, ctx.doc) && !floatingOnly) {
    // The editor's images are blocks; a <p> around one would open as an extra empty paragraph.
    return inlinesHtml(paragraph.inlines, ctx)
  }
  const tag = headingTag(paragraph.styleId)
  const outline = tag === "p" ? outlineLevelOf(paragraph, ctx.doc) : null
  const attrs =
    blockHtmlAttributes(blockFromProperties(paragraph.pPr), paragraph.key) +
    (outline ? ` data-outline="${outline}"` : "")
  const style = tag === "p" && paragraph.styleId ? ` data-word-style="${escapeAttribute(paragraph.styleId)}"` : ""
  const stops = editorTabStops(paragraph, ctx.doc)
  const tabs = stops ? ` data-tab-stops="${stops}"` : ""
  // A floating picture is anchored to its paragraph; in the editor it is the block just before it.
  const floats: string[] = []
  const inner = inlinesHtml(paragraph.inlines, ctx).replace(/<img [^>]*data-anchoring="move"[^>]*>/g, (img) => {
    floats.push(img)
    return ""
  })
  return `${floats.join("")}<${tag}${attrs}${style}${tabs}>${inner}</${tag}>`
}

/**
 * The paragraph's tab stops for the editor's tab layout: the style's (through basedOn) with the paragraph's own
 * added or cleared, as Word combines them. Saving keeps w:tabs from the source paragraph.
 */
function editorTabStops(paragraph: Paragraph, doc: WordDocument) {
  const chain: ParagraphProperties[] = []
  const seen = new Set<string>()
  for (
    let style = doc.styles.styles.find((item) => item.id === paragraph.styleId);
    style && !seen.has(style.id);
    style = doc.styles.styles.find((item) => item.id === style?.basedOn)
  ) {
    seen.add(style.id)
    chain.unshift(style.pPr)
  }
  chain.push(paragraph.pPr)
  const stops = new Map<number, string>()
  for (const props of chain) {
    for (const tab of props.tabs ?? []) {
      if (tab.val === "clear") {
        stops.delete(tab.pos)
        continue
      }
      // The reader already maps start/end to left/right; bar and num stops are not stops the text aligns to.
      const align = ["left", "center", "right", "decimal"].includes(tab.val) ? tab.val : undefined
      if (!align || tab.pos < 0) {
        continue
      }
      const leader = tab.leader && tab.leader !== "none" ? `:${tab.leader === "heavy" ? "underscore" : tab.leader}` : ""
      stops.set(tab.pos, `${Math.round((tab.pos / TWIP_PER_PX) * 10) / 10}:${align}${leader}`)
    }
  }
  return [...stops.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, stop]) => stop)
    .join(",")
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/**
 * The outline level (1 to 9) Word gives the paragraph, from its own properties or its style's, so it shows in the
 * Navigation pane and the table of contents; null for body text.
 */
function outlineLevelOf(paragraph: Paragraph, doc: WordDocument): number | null {
  let level = paragraph.pPr.outlineLvl
  const seen = new Set<string>()
  for (
    let style = doc.styles.styles.find((item) => item.id === paragraph.styleId);
    level === undefined && style && !seen.has(style.id);
    style = doc.styles.styles.find((item) => item.id === style?.basedOn)
  ) {
    seen.add(style.id)
    level =
      style.pPr.outlineLvl ??
      (/^heading\s?([1-9])$/i.test(style.name ?? "") ? Number(/([1-9])$/.exec(style.name ?? "")![1]) - 1 : undefined)
  }
  return level !== undefined && level >= 0 && level <= 8 ? level + 1 : null
}

function picturesOnly(paragraph: Paragraph, doc: WordDocument) {
  return (
    paragraph.inlines.length > 0 &&
    paragraph.inlines.every(
      (inline) =>
        inline.kind === "run" &&
        inline.content.length > 0 &&
        inline.content.every(
          (item) =>
            item.kind === "drawing" && (mediaFor(doc, item.relId) !== undefined || diagramSvg(doc, item) !== null),
        ),
    )
  )
}

function headingTag(styleId: string | undefined) {
  const match = /^Heading([1-6])$/i.exec(styleId ?? "")
  return match ? `h${match[1]}` : "p"
}

function tableHtml(table: Table, ctx: Projection) {
  const rows = table.rows
    .map((row, rowIndex) => {
      let column = 0
      const cells = row.cells
        .map((cell) => {
          const at = column
          column += cell.gridSpan ?? 1
          if (cell.vMerge === "continue") {
            return ""
          }
          const span = cell.gridSpan && cell.gridSpan > 1 ? ` colspan="${cell.gridSpan}"` : ""
          const down = rowSpan(table.rows, rowIndex, at)
          const rowspan = down > 1 ? ` rowspan="${down}"` : ""
          const inner = blocksToHtml(cell.blocks, ctx)
          const widths = table.grid.slice(at, at + (cell.gridSpan ?? 1))
          const colwidth =
            widths.length === (cell.gridSpan ?? 1) && widths.every((width) => width > 0)
              ? ` colwidth="${widths.map((width) => Math.round(width / TWIP_PER_PX)).join(",")}"`
              : ""
          const valign = cell.look?.vAlign === "center" ? "middle" : cell.look?.vAlign === "bottom" ? "bottom" : ""
          const look = cellCss({ borders: cell.look?.borders, margins: cell.look?.margins, shading: cell.shading })
          const word = look.length > 0 ? ` data-word-cell="${escapeAttribute(look.join("; "))}"` : ""
          return `<td${span}${rowspan}${colwidth}${valign ? ` data-valign="${valign}"` : ""}${word}>${inner}</td>`
        })
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")
  const key = table.key ? ` data-docx="${table.key}"` : ""
  const style = table.styleId ? ` data-word-table-style="${escapeAttribute(table.styleId)}"` : ""
  const frame = tableVariables(table.borders, table.cellMargins).join("; ")
  const attrs = `${key} data-word-table="1"${style} data-word-look="${tableLookTokens(table.look)}"${
    frame ? ` data-word-frame="${escapeAttribute(frame)}"` : ""
  }`
  return `<table${attrs}><tbody>${rows}</tbody></table>`
}

function rowSpan(rows: Table["rows"], rowIndex: number, column: number) {
  const cell = cellAt(rows[rowIndex], column)
  if (!cell || cell.vMerge !== "restart") {
    return 1
  }
  let span = 1
  for (let index = rowIndex + 1; index < rows.length; index += 1) {
    const below = cellAt(rows[index], column)
    if (below?.vMerge !== "continue") {
      break
    }
    span += 1
  }
  return span
}

function cellAt(row: Table["rows"][number] | undefined, column: number) {
  let cursor = 0
  for (const cell of row?.cells ?? []) {
    const width = cell.gridSpan ?? 1
    if (column >= cursor && column < cursor + width) {
      return cell
    }
    cursor += width
  }
  return undefined
}

/** Markers that take no room on the page; a page break paragraph may also hold them (a heading's bookmark). */
const MARKERS = new Set(["bookmarkStart", "bookmarkEnd", "commentRangeStart", "commentRangeEnd"])

function isPageBreak(paragraph: Paragraph) {
  const content = paragraph.inlines.filter((inline) => !MARKERS.has(inline.kind))
  if (content.length !== 1) {
    return false
  }
  const inline = content[0]
  return (
    inline?.kind === "run" &&
    inline.content.length === 1 &&
    inline.content[0]?.kind === "break" &&
    inline.content[0].breakType === "page"
  )
}

function chromeFromDocument(doc: WordDocument): DocumentChrome {
  const section = doc.section
  const setup = section ? pageSetupFromSection(section) : { ...DEFAULT_PAGE_SETUP }
  if (doc.settings.evenAndOddHeaders) {
    setup.differentOddEven = true
  }
  const references = section?.references ?? []
  return {
    ...emptyChrome(),
    header: storyText(references, "header", "default"),
    footer: storyText(references, "footer", "default"),
    differentFirstPage: Boolean(section?.titlePg),
    firstHeader: storyText(references, "header", "first"),
    firstFooter: storyText(references, "footer", "first"),
    pageSetup: setup,
    headerShapes: storyShapes(storyOf(references, "header", "default"), section),
    footerShapes: storyShapes(storyOf(references, "footer", "default"), section),
    firstHeaderShapes: storyShapes(storyOf(references, "header", "first"), section),
    firstFooterShapes: storyShapes(storyOf(references, "footer", "first"), section),
  }
}

function storyOf(references: HeaderFooterRef[], kind: "header" | "footer", type: HeaderFooterType) {
  return references.find((item) => item.kind === kind && item.type === type)
}

function storyText(references: HeaderFooterRef[], kind: "header" | "footer", type: HeaderFooterType) {
  const story = storyOf(references, kind, type)
  if (!story) {
    return ""
  }
  return story.blocks
    .filter((block): block is Paragraph => block.kind === "paragraph")
    .map((paragraph) => visibleParagraphText(paragraph))
    .join("\n")
    .trim()
}

function pageSetupFromSection(section: SectionProps): PageSetup {
  const width = twipsToMm(section.pageWidth ?? DEFAULT_SECTION.pageWidth ?? 12240)
  const height = twipsToMm(section.pageHeight ?? DEFAULT_SECTION.pageHeight ?? 15840)
  const portraitWidth = Math.min(width, height)
  const portraitHeight = Math.max(width, height)
  const named = namedPaper(portraitWidth, portraitHeight)
  const orientation = section.orient === "landscape" || width > height ? "landscape" : "portrait"
  const columns = section.columnCount === 2 || section.columnCount === 3 ? section.columnCount : 1
  return {
    ...DEFAULT_PAGE_SETUP,
    paper: named ?? "letter",
    orientation,
    paperWidth: named ? 0 : portraitWidth,
    paperHeight: named ? 0 : portraitHeight,
    marginTop: twipsToMm(section.marginTop ?? 1440),
    marginRight: twipsToMm(section.marginRight ?? 1440),
    marginBottom: twipsToMm(section.marginBottom ?? 1440),
    marginLeft: twipsToMm(section.marginLeft ?? 1440),
    lineNumbers: section.lineNumbers !== undefined,
    lineNumberRestart: section.lineNumbers?.restart === "newPage" ? "page" : "continuous",
    gutter: twipsToMm(section.gutter ?? 0),
    headerFromEdge: twipsToMm(section.header ?? 708),
    footerFromEdge: twipsToMm(section.footer ?? 708),
    columns,
    columnGap: section.columnSpace
      ? Math.round((section.columnSpace / 1440) * 254) / 100
      : DEFAULT_PAGE_SETUP.columnGap,
    columnLine: columns > 1 && section.columnSeparator === true,
    sectionStart: sectionStartFrom(section.type),
  }
}

function namedPaper(width: number, height: number): PaperSize | null {
  const near = (left: number, right: number) => Math.abs(left - right) < 2
  if (near(width, 215.9) && near(height, 279.4)) {
    return "letter"
  }
  if (near(width, 210) && near(height, 297)) {
    return "a4"
  }
  if (near(width, 215.9) && near(height, 355.6)) {
    return "legal"
  }
  return null
}

function sectionStartFrom(type: SectionProps["type"]): SectionStart {
  switch (type) {
    case "continuous":
      return "continuous"
    case "evenPage":
      return "even"
    case "oddPage":
      return "odd"
    case "nextColumn":
      return "new-column"
    default:
      return "new-page"
  }
}

function sectionFromChrome(
  chrome: DocumentChrome,
  base: SectionProps | null,
  synthesizePageNumber: boolean,
): SectionProps {
  const setup = chrome.pageSetup
  const named = PAPER_TWIPS[setup.paper] ?? PAPER_TWIPS.letter
  const custom = setup.paperWidth > 0 && setup.paperHeight > 0
  // A value the user left alone keeps the source twips; converting through millimetres would round it.
  const keep = (source: number | undefined, mm: number) =>
    source !== undefined && twipsToMm(source) === mm ? source : mmToTwips(mm)
  const portrait =
    base && base.orient === "landscape"
      ? { w: base.pageHeight, h: base.pageWidth }
      : { w: base?.pageWidth, h: base?.pageHeight }
  let width = custom ? keep(portrait.w, setup.paperWidth) : named.w
  let height = custom ? keep(portrait.h, setup.paperHeight) : named.h
  if (setup.orientation === "landscape") {
    const swap = width
    width = height
    height = swap
  }
  const references = storiesFromChrome(chrome, base?.references ?? [], synthesizePageNumber)
  const section: SectionProps = {
    ...(base ?? {}),
    pageWidth: width,
    pageHeight: height,
    orient: setup.orientation === "landscape" ? "landscape" : undefined,
    marginTop: keep(base?.marginTop, setup.marginTop),
    marginRight: keep(base?.marginRight, setup.marginRight),
    marginBottom: keep(base?.marginBottom, setup.marginBottom),
    marginLeft: keep(base?.marginLeft, setup.marginLeft),
    gutter: keep(base?.gutter, setup.gutter),
    header: keep(base?.header, setup.headerFromEdge),
    footer: keep(base?.footer, setup.footerFromEdge),
    columnCount: setup.columns > 1 ? setup.columns : undefined,
    columnSpace:
      setup.columns > 1
        ? base?.columnSpace !== undefined && Math.round((base.columnSpace / 1440) * 254) / 100 === setup.columnGap
          ? base.columnSpace
          : mmToTwips(setup.columnGap * 10)
        : (base?.columnSpace ?? DEFAULT_SECTION.columnSpace),
    columnSeparator:
      setup.columns > 1 && setup.columnLine ? true : base?.columnSeparator === undefined ? undefined : false,
    linePitch: base?.linePitch ?? DEFAULT_SECTION.linePitch,
    lineNumbers: lineNumberingFrom(setup, base?.lineNumbers),
    titlePg: chrome.differentFirstPage ? true : undefined,
    type: sectionTypeFrom(setup.sectionStart) ?? base?.type,
    references: references.length > 0 ? references : undefined,
  }
  return section
}

/**
 * The section's line numbers from the page setup: what Word wrote (count by, start, distance) while the setup still
 * says the same, else numbering every line, restarting where the setup says.
 */
function lineNumberingFrom(setup: PageSetup, base: LineNumbering | undefined): LineNumbering | undefined {
  if (!setup.lineNumbers) {
    return undefined
  }
  const restart = setup.lineNumberRestart === "page" ? "newPage" : "continuous"
  if (base && (base.restart === "newPage" ? "newPage" : "continuous") === restart) {
    return base
  }
  return { countBy: 1, restart }
}

function sectionTypeFrom(start: SectionStart): SectionProps["type"] {
  switch (start) {
    case "continuous":
      return "continuous"
    case "even":
      return "evenPage"
    case "odd":
      return "oddPage"
    case "new-column":
      return "nextColumn"
    default:
      return undefined
  }
}

function storiesFromChrome(chrome: DocumentChrome, existing: HeaderFooterRef[], synthesizePageNumber: boolean) {
  const used = new Set(existing.map((story) => story.relId))
  const nextId = () => {
    let number = 10
    while (used.has(`rId${number}`)) {
      number += 1
    }
    const id = `rId${number}`
    used.add(id)
    return id
  }
  const stories = existing.map((story) => ({ ...story, blocks: story.blocks.map((block) => ({ ...block })) }))
  const ensure = (kind: "header" | "footer", type: HeaderFooterType, text: string) => {
    const current = stories.find((story) => story.kind === kind && story.type === type)
    const projected = storyText(existing, kind, type)
    const page = pageFieldFor(kind, type, chrome, current, synthesizePageNumber)
    if (current && text === projected && storyHasPageField(current) === page) {
      return
    }
    const blocks = textToParagraphs(text, page)
    if (current) {
      const replaced = blocks.length > 0 ? blocks : [emptyParagraph()]
      // The page chrome edits text only; pictures in the story (a logo) stay with its first paragraph.
      const pictures = runsIn(current.blocks).filter((run) => run.content.some((item) => item.kind === "drawing"))
      const first = replaced[0]
      if (first?.kind === "paragraph" && pictures.length > 0) {
        first.inlines = [...pictures, ...first.inlines]
      }
      current.blocks = replaced
      return
    }
    if (blocks.length === 0) {
      return
    }
    stories.push({ kind, type, relId: nextId(), blocks })
  }
  ensure("header", "default", chrome.header)
  ensure("footer", "default", chrome.footer)
  if (chrome.differentFirstPage) {
    ensure("header", "first", chrome.firstHeader)
    ensure("footer", "first", chrome.firstFooter)
  }
  return stories
}

function pageFieldFor(
  kind: "header" | "footer",
  type: HeaderFooterType,
  chrome: DocumentChrome,
  current: HeaderFooterRef | undefined,
  synthesizePageNumber: boolean,
) {
  const place = chrome.pageSetup.pageNumber
  const wanted = place !== "none" && (kind === "footer" ? place.startsWith("bottom") : place.startsWith("top"))
  if (!wanted || (type !== "default" && type !== "first")) {
    return false
  }
  if (current) {
    return storyHasPageField(current)
  }
  return synthesizePageNumber
}

function storyHasPageField(story: HeaderFooterRef) {
  return story.blocks.some((block) => block.kind === "paragraph" && inlinesHavePageField(block.inlines))
}

function inlinesHavePageField(inlines: Inline[]): boolean {
  for (const inline of inlines) {
    if (inline.kind === "simpleField" && /\bPAGE\b/.test(inline.instr)) {
      return true
    }
    if (
      inline.kind === "hyperlink" ||
      inline.kind === "ins" ||
      inline.kind === "del" ||
      inline.kind === "simpleField"
    ) {
      if (inlinesHavePageField(inline.inlines)) {
        return true
      }
    }
    if (
      inline.kind === "run" &&
      inline.content.some((content) => content.kind === "instrText" && /\bPAGE\b/.test(content.text))
    ) {
      return true
    }
  }
  return false
}

function visibleParagraphText(paragraph: Paragraph) {
  return visibleInlineText(paragraph.inlines)
}

function visibleInlineText(inlines: Inline[]) {
  let text = ""
  let instruction = ""
  let inField = false
  let skipResult = false
  const visit = (inline: Inline) => {
    if (inline.kind === "simpleField") {
      if (!/\bPAGE\b/.test(inline.instr)) {
        text += visibleInlineText(inline.inlines)
      }
      return
    }
    if (inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "del") {
      text += visibleInlineText(inline.inlines)
      return
    }
    if (inline.kind === "raw") {
      text += inline.text
      return
    }
    if (inline.kind !== "run") {
      return
    }
    for (const content of inline.content) {
      if (content.kind === "fldChar") {
        if (content.fieldType === "begin") {
          inField = true
          instruction = ""
          skipResult = false
        } else if (content.fieldType === "separate") {
          skipResult = /\bPAGE\b/.test(instruction)
        } else if (content.fieldType === "end") {
          inField = false
          skipResult = false
        }
        continue
      }
      if (content.kind === "instrText") {
        if (inField) {
          instruction += content.text
        }
        continue
      }
      if (skipResult) {
        continue
      }
      if (content.kind === "text" || content.kind === "delText" || content.kind === "drawing") {
        text += content.text
      }
    }
  }
  for (const inline of inlines) {
    visit(inline)
  }
  return text
}

function textToParagraphs(text: string, page = false): Paragraph[] {
  if (!text) {
    return page ? [storyParagraph("", true)] : []
  }
  const lines = text.split("\n")
  return lines.map((line, index) => storyParagraph(line, page && index === lines.length - 1))
}

function storyParagraph(line: string, page: boolean): Paragraph {
  const inlines: Inline[] = []
  if (line) {
    inlines.push(plainRun(line))
  }
  if (page) {
    inlines.push({ kind: "simpleField", instr: " PAGE ", inlines: [plainRun("1")] })
  }
  return { kind: "paragraph", pPr: {}, markRPr: {}, inlines }
}

/** The editor keeps an empty paragraph after a final list or table; Word does not need it. */
function dropEditorTrailingParagraph(blocks: Block[]) {
  const last = blocks[blocks.length - 1]
  const before = blocks[blocks.length - 2]
  if (last?.kind === "paragraph" && !last.key && last.inlines.length === 0 && before) {
    const listEnd = before.kind === "paragraph" && before.pPr.numPr !== undefined
    if (before.kind === "table" || listEnd) {
      blocks.pop()
    }
  }
}

function plainRun(text: string): Run {
  return { kind: "run", rPr: {}, content: text ? [{ kind: "text", text }] : [] }
}

function blocksFromNodes(nodes: JsonNode[], build: Build, level: number): Block[] {
  const blocks: Block[] = []
  let floats: Inline[] = []
  for (const node of nodes) {
    if (node.type === "bulletList" || node.type === "orderedList") {
      blocks.push(...blocksFromList(node, build, level))
      continue
    }
    if (node.type === "tableOfContents") {
      blocks.push(...tocBlocks(node.attrs, build.toc.anchors.get(node) ?? [], build.toc.textWidth))
      continue
    }
    if (node.type === "image" && typeof node.attrs?.wrap === "string" && node.attrs.wrap !== "inline") {
      // A floating picture goes into the paragraph it is anchored to, the next one, as Word keeps it.
      const drawing = imageRun(node, build)
      if (drawing) {
        floats.push(drawing)
      }
      continue
    }
    const block = blockFromNode(node, build)
    if (floats.length > 0 && block?.kind === "paragraph") {
      block.inlines.unshift(...floats)
      floats = []
    }
    const previous = blocks[blocks.length - 1]
    const runKey = node.type === "image" && typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
    const home = runKey ? build.origins.runParagraphs.get(runKey)?.key : undefined
    if (
      node.type === "image" &&
      block?.kind === "paragraph" &&
      previous?.kind === "paragraph" &&
      previous.key !== undefined &&
      (previous.key === block.key || previous.key === home)
    ) {
      // A picture in a paragraph with text shows below that text in the editor, which has no inline pictures.
      // Pictures that shared a Word paragraph go back into it.
      previous.inlines.push(...block.inlines)
      continue
    }
    if (block) {
      blocks.push(block)
    }
  }
  if (floats.length > 0) {
    blocks.push({ kind: "paragraph", pPr: {}, markRPr: {}, inlines: floats })
  }
  return blocks
}

function blocksFromList(node: JsonNode, build: Build, level: number): Block[] {
  const kind = node.type === "orderedList" ? "ordered" : "bullet"
  // An opened list keeps its numbering instance, so restarts, start values and level formats survive.
  const sourceNumId = (child: JsonNode | undefined) => {
    const key = typeof child?.attrs?.docxKey === "string" ? child.attrs.docxKey : undefined
    const numId = key ? build.origins.paragraphs.get(key)?.pPr.numPr?.numId : undefined
    if (!numId) {
      return undefined
    }
    const bullet = numberingLevel(build.numbering, numId, 0)?.format === "bullet"
    return bullet === (kind === "bullet") ? numId : undefined
  }
  const items = (node.content ?? []).filter((item) => item.type === "listItem")
  const listNumId =
    items.map((item) => sourceNumId(item.content?.[0])).find((numId) => numId !== undefined) ??
    (kind === "bullet" ? build.bulletId : build.orderedId)
  const blocks: Block[] = []
  for (const item of node.content ?? []) {
    if (item.type !== "listItem") {
      continue
    }
    const indent = numberAttr(item.attrs?.indent) ?? 0
    const numId = sourceNumId(item.content?.[0]) ?? listNumId
    let first = true
    const children = item.content ?? []
    for (const [index, child] of children.entries()) {
      if (index === 0 && isBlankParagraph(child) && children[1]?.type === "image") {
        // A list item must open with a paragraph, so a numbered picture opens as a blank one plus the picture.
        continue
      }
      if (child.type === "bulletList" || child.type === "orderedList") {
        blocks.push(...blocksFromList(child, build, level + 1))
        continue
      }
      const block = blockFromNode(child, build)
      if (block?.kind === "paragraph" && first) {
        block.pPr = { ...block.pPr, numPr: { ilvl: level + indent, numId } }
        first = false
      }
      if (block) {
        blocks.push(block)
      }
    }
  }
  return blocks
}

function isBlankParagraph(node: JsonNode) {
  return node.type === "paragraph" && !node.attrs?.docxKey && (node.content ?? []).length === 0
}

function blockFromNode(node: JsonNode, build: Build): Block | null {
  if (node.type === "pageBreak") {
    const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
    const origin = key ? build.origins.paragraphs.get(key) : undefined
    if (origin && isPageBreak(origin)) {
      // The break's paragraph and run formatting, which decide the height of the line it sits on.
      const paragraph = structuredClone(origin)
      if (paragraph.sectionBreak && build.origins.sectionsPlaced.has(key!)) {
        delete paragraph.sectionBreak
      }
      build.origins.sectionsPlaced.add(key!)
      return paragraph
    }
    return {
      kind: "paragraph",
      pPr: {},
      markRPr: {},
      inlines: [{ kind: "run", rPr: {}, content: [{ kind: "break", breakType: "page" }] }],
    }
  }
  if (node.type === "image") {
    const drawing = imageRun(node, build)
    if (!drawing) {
      return null
    }
    const runKey = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
    const origin = runKey ? build.origins.runParagraphs.get(runKey) : undefined
    if (!origin?.key || !picturesOnlySource(origin)) {
      return { kind: "paragraph", pPr: {}, markRPr: {}, inlines: [drawing] }
    }
    const paragraph: Paragraph = {
      kind: "paragraph",
      pPr: structuredClone(origin.pPr),
      markRPr: structuredClone(origin.markRPr),
      inlines: [drawing],
      key: origin.key,
      ...(origin.styleId ? { styleId: origin.styleId } : {}),
    }
    if (origin.sectionBreak && !build.origins.sectionsPlaced.has(origin.key)) {
      build.origins.sectionsPlaced.add(origin.key)
      paragraph.sectionBreak = structuredClone(origin.sectionBreak)
    }
    return paragraph
  }
  if (node.type === "wordBlock") {
    return payloadBlock(node.attrs?.payload)
  }
  if (node.type === "table") {
    return tableFromNode(node, build)
  }
  if (node.type !== "paragraph" && node.type !== "heading") {
    const nested = blocksFromNodes(node.content ?? [], build, 0)
    return nested.length === 1 ? (nested[0] ?? null) : null
  }
  const level = node.type === "heading" ? headingLevel(node.attrs?.level) : 0
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.origins.paragraphs.get(key) : undefined
  const pPr = propertiesFromBlock(blockFromAttrs(node.attrs), origin?.pPr)
  // List membership comes from the editor's list structure, not from the source paragraph.
  delete pPr.numPr
  const outline = node.type === "paragraph" ? Number(node.attrs?.outlineLevel || 0) : 0
  if (outline >= 1 && outline <= 9) {
    pPr.outlineLvl = outline - 1
  } else if (node.type === "paragraph" && pPr.outlineLvl !== undefined && pPr.outlineLvl < 9) {
    // Made body text in the editor.
    delete pPr.outlineLvl
  }
  const paragraph: Paragraph = {
    kind: "paragraph",
    pPr,
    markRPr: origin ? structuredClone(origin.markRPr) : {},
    inlines: inlinesFromEditor(node.content ?? [], build),
  }
  const styleId = paragraphStyleId(level, origin?.styleId, node.attrs, build.styles)
  if (styleId) {
    paragraph.styleId = styleId
  }
  const bookmark = build.toc.bookmarks.get(node)
  if (bookmark) {
    paragraph.inlines.unshift({ kind: "bookmarkStart", id: bookmark.id, name: bookmark.name })
    paragraph.inlines.push({ kind: "bookmarkEnd", id: bookmark.id })
  }
  if (key) {
    paragraph.key = key
    if (origin?.sectionBreak && !build.origins.sectionsPlaced.has(key)) {
      build.origins.sectionsPlaced.add(key)
      paragraph.sectionBreak = structuredClone(origin.sectionBreak)
    }
  }
  return paragraph
}

function picturesOnlySource(paragraph: Paragraph) {
  return paragraph.inlines.every(
    (inline) => inline.kind === "run" && inline.content.every((item) => item.kind === "drawing"),
  )
}

/**
 * A heading keeps its source style unless the editor changed its level. A paragraph takes the style applied in the
 * editor: a named style (Title, a new style…) as its Word id, else the Word style it shows (`wordStyle`, from the
 * source until another style is applied). JSON without editor attributes keeps the source style.
 */
function paragraphStyleId(
  level: number,
  source: string | undefined,
  attrs: Record<string, unknown> | undefined,
  styles: StyleDef[],
) {
  const sourceLevel = /^Heading([1-6])$/i.exec(source ?? "")?.[1]
  if (level >= 1) {
    return sourceLevel === String(level) ? source : `Heading${level}`
  }
  const named = typeof attrs?.namedStyle === "string" ? wordIdForNamedStyle(attrs.namedStyle, styles) : undefined
  if (named) {
    return named === "Normal" ? undefined : named
  }
  const shown = attrs && "wordStyle" in attrs ? attrs.wordStyle : source
  const id = typeof shown === "string" && shown ? shown : undefined
  return id && !/^Heading[1-6]$/i.test(id) ? id : undefined
}

/** The Word style ids the saved body refers to. */
function usedStyleIds(blocks: Block[]) {
  const ids = new Set(paragraphsIn(blocks).flatMap((paragraph) => (paragraph.styleId ? [paragraph.styleId] : [])))
  for (const run of runsIn(blocks)) {
    if (run.rPr.rStyle) {
      ids.add(run.rPr.rStyle)
    }
  }
  return ids
}

function tableFromNode(node: JsonNode, build: Build): Table {
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.origins.tables.get(key) : undefined
  // Columns still covered by a cell merged from a row above: rows left to cover and how many columns it spans.
  const carry = new Map<number, { rows: number; span: number }>()
  const rows = (node.content ?? [])
    .filter((row) => row.type === "tableRow")
    .map((row, rowIndex) => {
      let column = 0
      const cells: EditedRow["cells"] = []
      const source = origin?.rows[rowIndex]
      const sourceCellAt = (at: number) =>
        source?.cells.find((_cell, sourceIndex) => gridColumn(source.cells, sourceIndex) === at)
      const fillCarried = () => {
        for (let merged = carry.get(column); merged && merged.rows > 0; merged = carry.get(column)) {
          // Word keeps a paragraph (and its properties) in every covered cell; the editor has no such cell.
          const covered = sourceCellAt(column)
          cells.push({
            blocks: covered?.vMerge === "continue" ? structuredClone(covered.blocks) : [emptyParagraph()],
            vMerge: "continue" as const,
            ...(merged.span > 1 ? { gridSpan: merged.span } : {}),
          })
          carry.set(column, { ...merged, rows: merged.rows - 1 })
          column += merged.span
        }
      }
      for (const child of row.content ?? []) {
        if (child.type !== "tableCell" && child.type !== "tableHeader") {
          continue
        }
        fillCarried()
        const span = Math.max(1, numberAttr(child.attrs?.colspan) ?? 1)
        const down = Math.max(1, numberAttr(child.attrs?.rowspan) ?? 1)
        const blocks = blocksFromNodes(child.content ?? [], build, 0)
        cells.push({
          blocks: blocks.length > 0 ? blocks : [emptyParagraph()],
          ...(span > 1 ? { gridSpan: span } : {}),
          ...(down > 1 ? { vMerge: "restart" as const } : {}),
          colwidth: Array.isArray(child.attrs?.colwidth) ? child.attrs.colwidth.map((width) => Number(width)) : null,
          ...shadedAndBordered(child.attrs),
        })
        if (down > 1) {
          carry.set(column, { rows: down - 1, span })
        }
        column += span
      }
      fillCarried()
      // Row and cell properties the editor does not show come from the source row at the same place.
      for (const [index, cell] of cells.entries()) {
        const match = sourceCellAt(gridColumn(cells, index))
        if (!match || (match.gridSpan ?? 1) !== (cell.gridSpan ?? 1)) {
          continue
        }
        if (match.shading && !cell.shading) {
          cell.shading = structuredClone(match.shading)
        }
        if (match.look && !cell.look?.borders) {
          cell.look = { ...structuredClone(match.look), ...cell.look }
        }
        if (match.source) {
          // Borders, margins, vertical alignment, conditional formatting: everything tcPr says that the editor
          // does not show.
          cell.source = match.source
        }
      }
      return {
        ...(source?.header ? { header: true } : {}),
        ...(source?.cellMargins ? { cellMargins: structuredClone(source.cellMargins) } : {}),
        ...(source?.source ? { source: source.source } : {}),
        ...(source?.exceptionSource ? { exceptionSource: source.exceptionSource } : {}),
        cells,
      }
    })
  const grid = editedGrid(rows, origin)
  const table: Table = {
    kind: "table",
    ...(origin?.styleId ? { styleId: origin.styleId } : {}),
    ...(origin?.source ? { source: origin.source } : {}),
    ...(origin?.width ? { width: structuredClone(origin.width) } : {}),
    ...(origin?.borders ? { borders: structuredClone(origin.borders) } : {}),
    ...(origin?.layout ? { layout: origin.layout } : {}),
    ...(origin?.look ? { look: structuredClone(origin.look) } : {}),
    grid,
    rows: rows.map((row) => ({
      ...row,
      cells: row.cells.map(({ colwidth: _colwidth, ...cell }, index) => {
        const at = gridColumn(row.cells, index)
        const width = grid.slice(at, at + (cell.gridSpan ?? 1)).reduce((sum, column) => sum + column, 0)
        return width > 0 ? { ...cell, width: { value: width, type: "dxa" as const } } : cell
      }),
    })),
  }
  if (key) {
    table.key = key
  }
  if (!origin) {
    madeInApp(table, node.attrs?.frame)
  }
  return table
}

/** The fill and borders the person gave a cell in the editor. */
function shadedAndBordered(attrs: JsonNode["attrs"]) {
  const shading = shadingOf(attrs?.backgroundColor)
  const borders = bordersOf(attrs?.borders, attrs?.borderPen)
  return {
    ...(shading ? { shading } : {}),
    ...(borders ? { look: { borders } } : {}),
  }
}

const GRID_LINE: Border = { value: "single", sz: 4, space: 0, color: "auto" }

/**
 * A table made in the app saves as Word's Table Grid draws one: single lines (or the frame chosen), and cell
 * paragraphs with no space after and single spacing, so it has the same one-line rows when Word or the app opens it.
 */
function madeInApp(table: Table, frame: unknown) {
  if (frame === "bottom") {
    table.borders = { bottom: { ...GRID_LINE } }
  } else if (frame !== "none") {
    table.borders = Object.fromEntries(
      (["top", "left", "bottom", "right", "insideH", "insideV"] as const).map((side) => [side, { ...GRID_LINE }]),
    )
  }
  for (const row of table.rows) {
    for (const cell of row.cells) {
      for (const block of cell.blocks) {
        if (block.kind === "paragraph" && !block.styleId && !block.pPr.spacing) {
          block.pPr = { ...block.pPr, spacing: { before: 0, after: 0, line: 240, lineRule: "auto" } }
        }
      }
    }
  }
}

type EditedRow = Omit<TableRow, "cells"> & { cells: (TableCell & { colwidth?: number[] | null })[] }

/**
 * Column widths from the editor's colwidth attributes. While they still match the source grid in pixels the
 * source keeps its exact twips; a resized table gets the new widths; without widths the source grid stays if it
 * still has the right number of columns.
 */
function editedGrid(rows: EditedRow[], origin: Table | undefined) {
  const columns = Math.max(0, ...rows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0)))
  const pixels: (number | undefined)[] = Array.from({ length: columns })
  for (const row of rows) {
    row.cells.forEach((cell, index) => {
      const at = gridColumn(row.cells, index)
      cell.colwidth?.forEach((width, offset) => {
        if (Number.isFinite(width) && width > 0 && pixels[at + offset] === undefined) {
          pixels[at + offset] = width
        }
      })
    })
  }
  const sourceGrid = origin && origin.grid.length === columns ? origin.grid : undefined
  if (pixels.length === 0 || pixels.some((width) => width === undefined)) {
    return sourceGrid ? [...sourceGrid] : []
  }
  if (sourceGrid && sourceGrid.every((twips, index) => Math.round(twips / TWIP_PER_PX) === pixels[index])) {
    return [...sourceGrid]
  }
  return pixels.map((width) => Math.round((width ?? 0) * TWIP_PER_PX))
}

function gridColumn(cells: { gridSpan?: number }[], index: number) {
  return cells.slice(0, index).reduce((sum, cell) => sum + (cell.gridSpan ?? 1), 0)
}

function ensureListNumbering(numbering: NumberingDefinitions, json: JsonNode, build: Build) {
  const wantsBullet = treeHas(json, "bulletList")
  const wantsOrdered = treeHas(json, "orderedList")
  if (!wantsBullet && !wantsOrdered) {
    build.bulletId = numbering.instances[0]?.id ?? 1
    build.orderedId = numbering.instances[0]?.id ?? 1
    return numbering
  }
  const abstracts = [...numbering.abstracts]
  const instances = [...numbering.instances]
  const add = (format: "bullet" | "decimal") => {
    const found = instances.find((instance) => {
      const level = abstracts.find((item) => item.id === instance.abstractNumId)?.levels[0]
      return level?.format === format
    })
    if (found) {
      return found.id
    }
    const abstractId = Math.max(0, ...abstracts.map((item) => item.id)) + 1
    const numId = Math.max(0, ...instances.map((item) => item.id)) + 1
    abstracts.push({
      id: abstractId,
      levels: [
        {
          ilvl: 0,
          start: 1,
          format,
          text: format === "bullet" ? "•" : "%1.",
          justify: "left",
          pPr: {},
          rPr: {},
        },
      ],
    })
    instances.push({ id: numId, abstractNumId: abstractId })
    return numId
  }
  if (wantsBullet) {
    build.bulletId = add("bullet")
  }
  if (wantsOrdered) {
    build.orderedId = add("decimal")
  }
  return { ...numbering, abstracts, instances }
}

/**
 * Styles the saved body refers to but the catalog lacks. An opened document only gains the ones it now uses, so
 * its styles part stays as Word wrote it; a new document gets the full heading set.
 */
function ensureEditorStyles(styles: StyleCatalog, blocks: Block[], fresh: boolean): StyleCatalog {
  const ids = new Set(styles.styles.map((style) => style.id))
  const controls = blocks.flatMap((block) => (block.kind === "raw" ? (block.blocks ?? []) : []))
  const paragraphStyles = new Set(paragraphsIn([...blocks, ...controls]).map((paragraph) => paragraph.styleId))
  const runStyles = new Set(runsIn(blocks).map((run) => run.rPr.rStyle))
  const extra: Style[] = []
  if (!ids.has("Normal")) {
    extra.push({ id: "Normal", type: "paragraph", default: true, name: "Normal", pPr: {}, rPr: {} })
  }
  for (let level = 1; level <= 6; level += 1) {
    const id = `Heading${level}`
    if (!ids.has(id) && (fresh || paragraphStyles.has(id))) {
      extra.push({
        id,
        type: "paragraph",
        name: `heading ${level}`,
        basedOn: "Normal",
        next: "Normal",
        pPr: { outlineLvl: level - 1 },
        rPr: {},
      })
    }
  }
  if (!ids.has("TOCHeading") && paragraphStyles.has("TOCHeading")) {
    // Word's built-in TOC Heading: Heading 1 that is left out of the table of contents.
    extra.push({
      id: "TOCHeading",
      type: "paragraph",
      name: "TOC Heading",
      basedOn: ids.has("Heading1") || extra.some((style) => style.id === "Heading1") ? "Heading1" : "Normal",
      next: "Normal",
      pPr: { outlineLvl: 9 },
      rPr: {},
    })
  }
  for (let level = 1; level <= 9; level += 1) {
    const id = `TOC${level}`
    if (!ids.has(id) && paragraphStyles.has(id)) {
      // Word's built-in toc n: indented 0.15" a level, 5pt after.
      extra.push({
        id,
        type: "paragraph",
        name: `toc ${level}`,
        basedOn: "Normal",
        next: "Normal",
        pPr: { spacing: { after: 100 }, ...(level > 1 ? { ind: { left: (level - 1) * 220 } } : {}) },
        rPr: {},
      })
    }
  }
  if (!ids.has("Hyperlink") && runStyles.has("Hyperlink")) {
    extra.push({
      id: "Hyperlink",
      type: "character",
      name: "Hyperlink",
      pPr: {},
      rPr: { color: "0563C1", u: { value: "single" } },
    })
  }
  return extra.length > 0 ? { ...styles, styles: [...styles.styles, ...extra] } : styles
}

/**
 * Links each table of contents entry to its heading: the bookmark it named when that heading still has it, else
 * the next heading with the same text, which gets a new _Toc bookmark when it has none.
 */
function linkTocEntries(json: JsonNode, section: SectionProps, styles: readonly TocStyleLike[] = []): TocLinks {
  const textWidth =
    (section.pageWidth ?? 12240) - (section.marginLeft ?? 1440) - (section.marginRight ?? 1440) - (section.gutter ?? 0)
  const links: TocLinks = { bookmarks: new Map(), anchors: new Map(), textWidth }
  const headings: { node: JsonNode; text: string; anchor?: string }[] = []
  const tables: JsonNode[] = []
  const names = new Set<string>()
  let nextId = 0
  const visit = (node: JsonNode) => {
    if (node.type === "tableOfContents") {
      tables.push(node)
      return
    }
    if (node.type === "wordInline" && node.attrs?.role === "bookmark") {
      for (const item of payloadInlines(node.attrs.payload)) {
        if (item.kind === "bookmarkStart" || item.kind === "bookmarkEnd") {
          nextId = Math.max(nextId, item.id + 1)
        }
        if (item.kind === "bookmarkStart") {
          names.add(item.name)
        }
      }
    }
    const level = node.type ? tocLevelOf({ type: node.type, attrs: node.attrs }, styles) : null
    if (level !== null) {
      const children = (node.content ?? []).map((child) => ({ type: child.type ?? "", attrs: child.attrs }))
      headings.push({ node, text: normalizedText(jsonText(node)), anchor: headingBookmark(children) })
    }
    for (const child of node.content ?? []) {
      visit(child)
    }
  }
  visit(json)
  if (tables.length === 0) {
    return links
  }
  let serial = 0
  const newName = () => {
    let name: string
    do {
      serial += 1
      name = `_Toc${String(200000000 + serial)}`
    } while (names.has(name))
    names.add(name)
    return name
  }
  for (const table of tables) {
    const options = tocOptions(table.attrs ?? {})
    if (!options.hyperlinks && !options.pageNumbers) {
      continue
    }
    let cursor = 0
    const anchors = readTocEntries(table.attrs?.entries).map((entry) => {
      let at = entry.anchor ? headings.findIndex((heading) => heading.anchor === entry.anchor) : -1
      if (at < 0) {
        const text = normalizedText(entry.text)
        const after = headings.slice(cursor).findIndex((heading) => heading.text === text)
        at = after < 0 ? headings.findIndex((heading) => heading.text === text) : cursor + after
      }
      const heading = headings[at]
      if (!heading) {
        return undefined
      }
      cursor = at + 1
      if (!heading.anchor) {
        heading.anchor = newName()
        links.bookmarks.set(heading.node, { id: nextId, name: heading.anchor })
        nextId += 1
      }
      return heading.anchor
    })
    links.anchors.set(table, anchors)
  }
  return links
}

function jsonText(node: JsonNode): string {
  return node.text ?? (node.content ?? []).map((child) => jsonText(child)).join("")
}

function normalizedText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function headingLevel(value: unknown) {
  const level = numberAttr(value)
  return level && level >= 1 && level <= 6 ? level : 1
}

function treeHas(node: JsonNode, type: string): boolean {
  if (node.type === type) {
    return true
  }
  return (node.content ?? []).some((child) => treeHas(child, type))
}

function twipsToMm(twips: number) {
  return Math.round((twips / TWIP_PER_MM) * 10) / 10
}

function mmToTwips(mm: number) {
  return Math.round(mm * TWIP_PER_MM)
}
