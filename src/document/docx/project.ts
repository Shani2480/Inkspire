import { BUILT_IN_STYLES, catalogWithStyles, wordIdForNamedStyle, type StyleDef } from "@/document/styles"
import type { DocumentChrome } from "@/document/header"
import { emptyChrome } from "@/document/header"
import { chromeHasContent, chromeHasPageField } from "@/document/chrome-html"
import { chromeJson } from "@/document/chrome-json"
import { bordersOf, editedShading, sidePensOf, wordShadingValue } from "@/document/docx/cell-edits"
import { cellCss, tableLookTokens, tableVariables, themeFontsOf } from "@/document/docx/word-styles"
import { floatValue } from "@/editor/table-float"
import { presetAttrs, presetOf } from "@/editor/table-props"
import {
  floatFromWord,
  floatToWord,
  lengthFromWord,
  lengthToWord,
  marginsFromWord,
  marginsToWord,
  preferredFromWord,
  preferredToWord,
} from "@/document/docx/table-props-docx"
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
  type PageBorders,
  type MediaPart,
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
  const build = newBuild(source, documentStyles, origins)
  const section = sectionFromChrome(chrome, source?.section ?? null)
  build.section = source?.section ?? section
  build.toc = linkTocEntries(json, section, documentStyles)
  build.numbering = ensureListNumbering(build.numbering, json, build)
  const blocks = blocksFromNodes(json.content ?? [], build, 0)
  dropEditorTrailingParagraph(blocks)
  const stories = storiesFromChrome(chrome, source, build, source === null)
  const numbering = build.numbering
  section.references = stories.length > 0 ? stories : undefined
  const partBlocks = [...blocks, ...stories.flatMap((story) => story.blocks)]
  const comments = commentsFromEditor(build.comments, source?.comments)
  placeCommentRanges(blocks, build.tags, comments.ids, commentReferenceProps(source))
  const styles = ensureEditorStyles(
    catalogWithStyles(
      source?.styles ?? { docDefaults: { pPr: {}, rPr: {} }, styles: [] },
      documentStyles,
      usedStyleIds(partBlocks),
    ),
    partBlocks,
    source === null,
  )
  const settings = {
    ...(source?.settings ?? { compatibilityMode: 15, rsids: [] }),
    evenAndOddHeaders: chrome.pageSetup.differentOddEven ? true : undefined,
    alignBordersAndEdges: chrome.pageSetup.borderAlign ? true : undefined,
    bordersDoNotSurroundHeader: chrome.pageSetup.borderSurroundHeader ? undefined : true,
    bordersDoNotSurroundFooter: chrome.pageSetup.borderSurroundFooter ? undefined : true,
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

/** State for turning editor JSON back into a document's parts, starting from the source document's. */
function newBuild(
  source: WordDocument | null,
  documentStyles: StyleDef[],
  origins: Origins,
  reserved: Iterable<string> = [],
): Build {
  return {
    styles: documentStyles,
    media: [...(source?.media ?? [])],
    picture: (source?.media?.length ?? 0) + 1,
    usedParts: new Set(
      [...(source?.preserved?.parts ?? []), ...(source?.media ?? [])]
        .map((part) => part.name.toLowerCase())
        .concat([...reserved].map((name) => name.toLowerCase())),
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
}

/**
 * Gives every paragraph and table an anchor the editor carries as data-docx. Saving copies anchors into the new
 * document, so they keep pointing at the right source across saves.
 */
function assignKeys(doc: WordDocument) {
  const used = new Set<string>()
  // The header and footer parts are read like the body, so their paragraphs carry anchors too.
  const blocks = [...doc.blocks, ...(doc.section?.references ?? []).flatMap((story) => story.blocks)]
  const tables = tablesIn(blocks)
  const paragraphs = paragraphsIn(blocks)
  for (const item of [...paragraphs, ...tables, ...runsIn(blocks)]) {
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
  for (const run of runsIn(blocks)) {
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
  if (breakOnly(block, "column")) {
    return `<div data-column-break="" class="column-break"></div>`
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
          const shade = wordShadingValue(cell.shading)
          const shading = shade ? ` data-word-shading="${shade}"` : ""
          const ownMargins = marginsFromWord(cell.look?.margins)
          const options =
            (ownMargins ? ` data-cell-margins="${ownMargins}"` : "") +
            (cell.noWrap ? ` data-no-wrap="1"` : "") +
            (cell.fitText ? ` data-fit-text="1"` : "")
          return `<td${span}${rowspan}${colwidth}${valign ? ` data-valign="${valign}"` : ""}${word}${shading}${options}>${inner}</td>`
        })
        .join("")
      const height = row.height ? ` style="height: ${Math.round(row.height.value / TWIP_PER_PX)}px"` : ""
      const rule = row.height?.rule === "exact" ? ` data-height-rule="exact"` : ""
      const split = row.cantSplit ? ` data-cant-split="1"` : ""
      return `<tr${height}${rule}${split}>${cells}</tr>`
    })
    .join("")
  const key = table.key ? ` data-docx="${table.key}"` : ""
  const style = table.styleId ? ` data-word-table-style="${escapeAttribute(table.styleId)}"` : ""
  const frame = tableVariables(table.borders, table.cellMargins).join("; ")
  const align = table.align && table.align !== "left" ? ` data-align="${table.align}"` : ""
  const alt =
    (table.caption ? ` data-alt-title="${escapeAttribute(table.caption)}"` : "") +
    (table.description ? ` data-alt-desc="${escapeAttribute(table.description)}"` : "")
  const preferred = preferredFromWord(table.width)
  const indent = lengthFromWord(table.indent)
  const spacing = lengthFromWord(table.cellSpacing)
  const margins = marginsFromWord(table.cellMargins)
  const float = floatFromWord(table.position, table.overlap)
  const props =
    (preferred ? ` data-pref-width="${preferred}"` : "") +
    (indent !== null ? ` data-indent="${indent}"` : "") +
    (spacing !== null ? ` data-cell-spacing="${spacing}"` : "") +
    (table.layout === "fixed" ? ` data-auto-resize="0"` : "") +
    (margins ? ` data-margins="${margins}"` : "") +
    (float ? ` data-float="${escapeAttribute(floatValue(float)!)}"` : "")
  const attrs = `${key} data-word-table="1"${style} data-word-look="${tableLookTokens(table.look)}"${align}${alt}${props}${
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
  return breakOnly(paragraph, "page")
}

/** A paragraph holding nothing but one break of this kind (Word's own form for a page or column break). */
function breakOnly(paragraph: Paragraph, type: "page" | "column") {
  const content = paragraph.inlines.filter((inline) => !MARKERS.has(inline.kind))
  if (content.length !== 1) {
    return false
  }
  const inline = content[0]
  return (
    inline?.kind === "run" &&
    inline.content.length === 1 &&
    inline.content[0]?.kind === "break" &&
    inline.content[0].breakType === type
  )
}

function chromeFromDocument(doc: WordDocument): DocumentChrome {
  const section = doc.section
  const setup = section ? pageSetupFromSection(section) : { ...DEFAULT_PAGE_SETUP }
  if (doc.settings.evenAndOddHeaders) {
    setup.differentOddEven = true
  }
  setup.borderAlign = doc.settings.alignBordersAndEdges === true
  setup.borderSurroundHeader = doc.settings.bordersDoNotSurroundHeader !== true
  setup.borderSurroundFooter = doc.settings.bordersDoNotSurroundFooter !== true
  // A page number in a Word document is a field in its header or footer, which is shown there.
  setup.pageNumber = "none"
  const references = section?.references ?? []
  return {
    ...emptyChrome(),
    header: storyHtml(doc, storyOf(references, "header", "default")),
    footer: storyHtml(doc, storyOf(references, "footer", "default")),
    differentFirstPage: Boolean(section?.titlePg),
    firstHeader: storyHtml(doc, storyOf(references, "header", "first")),
    firstFooter: storyHtml(doc, storyOf(references, "footer", "first")),
    evenHeader: storyHtml(doc, storyOf(references, "header", "even")),
    evenFooter: storyHtml(doc, storyOf(references, "footer", "even")),
    pageSetup: setup,
  }
}

function storyOf(references: HeaderFooterRef[], kind: "header" | "footer", type: HeaderFooterType) {
  return references.find((item) => item.kind === kind && item.type === type)
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
    ...pageBorderSetup(section.pageBorders),
  }
}

type PageBorderSetup = Pick<
  PageSetup,
  | "border"
  | "borderColor"
  | "borderWidth"
  | "borderLine"
  | "borderDisplay"
  | "borderFrom"
  | "borderSpace"
  | "borderSides"
  | "borderInFront"
>

const PAGE_BORDER_SIDES = ["top", "right", "bottom", "left"] as const

/** The page setup's page border from a section's w:pgBorders; the first drawn side gives the line (22.4). */
function pageBorderSetup(borders: PageBorders | undefined): PageBorderSetup {
  const line = PAGE_BORDER_SIDES.map((side) => borders?.[side]).find(
    (border) => border && border.value !== "none" && border.value !== "nil",
  )
  if (!borders || !line) {
    return {
      border: "none",
      borderColor: DEFAULT_PAGE_SETUP.borderColor,
      borderWidth: DEFAULT_PAGE_SETUP.borderWidth,
      borderLine: DEFAULT_PAGE_SETUP.borderLine,
      borderDisplay: DEFAULT_PAGE_SETUP.borderDisplay,
      borderFrom: DEFAULT_PAGE_SETUP.borderFrom,
      borderSpace: DEFAULT_PAGE_SETUP.borderSpace,
      borderSides: DEFAULT_PAGE_SETUP.borderSides,
      borderInFront: DEFAULT_PAGE_SETUP.borderInFront,
    }
  }
  const value = line.value
  const borderLine =
    value === "dashed" || value === "dashSmallGap" || value === "dotDash" || value === "dotDotDash"
      ? "dashed"
      : value === "dotted"
        ? "dotted"
        : value === "threeDEngrave" || value === "inset"
          ? "groove"
          : value === "threeDEmboss" || value === "outset"
            ? "ridge"
            : "solid"
  return {
    border: value === "double" ? "double" : "single",
    borderColor: line.color && /^[0-9A-Fa-f]{6}$/.test(line.color) ? `#${line.color.toLowerCase()}` : "#1c1c1c",
    // w:sz counts eighths of a point.
    borderWidth: Math.round((((line.sz ?? 4) / 8) * 25.4 * 100) / 72) / 100,
    borderLine: value === "double" ? "solid" : borderLine,
    borderDisplay: borders.display === "firstPage" ? "first" : borders.display === "notFirstPage" ? "not-first" : "all",
    borderFrom: borders.offsetFrom === "page" ? "page" : "text",
    borderSpace: PAGE_BORDER_SIDES.map((side) => borders[side]?.space ?? 0),
    borderInFront: borders.zOrder !== "back",
    borderSides: PAGE_BORDER_SIDES.filter((side) => {
      const border = borders[side]
      return border && border.value !== "none" && border.value !== "nil"
    }),
  }
}

function samePageBorder(left: PageBorderSetup, right: PageBorderSetup) {
  return (
    left.border === right.border &&
    (left.border === "none" ||
      (left.borderColor === right.borderColor &&
        left.borderWidth === right.borderWidth &&
        left.borderLine === right.borderLine &&
        left.borderDisplay === right.borderDisplay &&
        left.borderFrom === right.borderFrom &&
        left.borderSpace.join(" ") === right.borderSpace.join(" ") &&
        left.borderSides.join(" ") === right.borderSides.join(" ") &&
        left.borderInFront === right.borderInFront))
  )
}

const PAGE_BORDER_VALUES: Record<PageSetup["borderLine"], Border["value"]> = {
  solid: "single",
  dashed: "dashed",
  dotted: "dotted",
  groove: "threeDEngrave",
  ridge: "threeDEmboss",
}

/**
 * The section's w:pgBorders from the page setup: what Word wrote while the setup still says the same (so its art and
 * per-side lines are kept), else the setup's line on all four sides.
 */
function pageBordersFrom(setup: PageSetup, base: PageBorders | undefined): PageBorders | undefined {
  if (samePageBorder(setup, pageBorderSetup(base))) {
    return base
  }
  if (setup.border === "none") {
    return undefined
  }
  const color = setup.borderColor.toLowerCase() === "#1c1c1c" ? "auto" : setup.borderColor.slice(1).toUpperCase()
  const sz = Math.min(96, Math.max(2, Math.round(((setup.borderWidth * 72) / 25.4) * 8)))
  const value = setup.border === "double" ? "double" : PAGE_BORDER_VALUES[setup.borderLine]
  const side = (index: number): Border => ({ value, sz, space: setup.borderSpace[index] ?? 0, color })
  return {
    ...(setup.borderDisplay === "first"
      ? { display: "firstPage" as const }
      : setup.borderDisplay === "not-first"
        ? { display: "notFirstPage" as const }
        : {}),
    ...(setup.borderInFront ? {} : { zOrder: "back" as const }),
    ...(setup.borderFrom === "page" ? { offsetFrom: "page" as const } : {}),
    ...(setup.borderSides.includes("top") ? { top: side(0) } : {}),
    ...(setup.borderSides.includes("left") ? { left: side(3) } : {}),
    ...(setup.borderSides.includes("bottom") ? { bottom: side(2) } : {}),
    ...(setup.borderSides.includes("right") ? { right: side(1) } : {}),
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

function sectionFromChrome(chrome: DocumentChrome, base: SectionProps | null): SectionProps {
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
    pageBorders: pageBordersFrom(setup, base?.pageBorders),
    titlePg: chrome.differentFirstPage ? true : undefined,
    type: sectionTypeFrom(setup.sectionStart) ?? base?.type,
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

/** A header or footer part as a document of its own, so the body's converters read and write it. */
function storyDocument(doc: WordDocument, story: HeaderFooterRef): WordDocument {
  return { ...doc, blocks: story.blocks, media: storyMedia(story), comments: undefined }
}

/** The pictures a header or footer part points at, as the body's media. */
function storyMedia(story: HeaderFooterRef): MediaPart[] {
  const media: MediaPart[] = []
  for (const relationship of story.links?.relationships ?? []) {
    const part = story.links?.parts.find((item) => item.name === relationship.partName)
    if (part?.contentType.startsWith("image/")) {
      media.push({ ...part, relId: relationship.id, type: relationship.type, target: relationship.target })
    }
  }
  return media
}

/** The part's links with its pictures replaced by `media`; what else it points at (charts, objects) stays. */
function storyLinks(story: HeaderFooterRef | undefined, media: MediaPart[]): HeaderFooterRef["links"] {
  const pictureIds = new Set(
    storyMedia(story ?? { kind: "header", type: "default", relId: "", blocks: [] }).map((item) => item.relId),
  )
  const kept = (story?.links?.relationships ?? []).filter((item) => !pictureIds.has(item.id))
  const keptNames = new Set(kept.map((item) => item.partName))
  const relationships = [
    ...kept,
    ...media.map((item) => ({
      id: item.relId,
      type: item.type,
      target: item.target,
      targetMode: "Internal" as const,
      partName: item.name,
    })),
  ]
  const parts = [
    ...(story?.links?.parts ?? []).filter((part) => keptNames.has(part.name)),
    ...media.map((item) => ({ name: item.name, contentType: item.contentType, data: item.data })),
  ]
  return relationships.length > 0 || parts.length > 0 ? { relationships, parts } : undefined
}

/** What the editor shows for a header or footer part: its HTML, empty when there is nothing to see. */
function storyHtml(doc: WordDocument, story: HeaderFooterRef | undefined) {
  if (!story) {
    return ""
  }
  const html = blocksToHtml(story.blocks, projectionFor(storyDocument(doc, story)))
  return chromeHasContent(html) ? html : ""
}

/** The blocks and pictures of a header or footer part from its HTML, built like the body's from the editor's JSON. */
function storyBlocks(
  html: string,
  original: HeaderFooterRef | undefined,
  source: WordDocument | null,
  shared: Build,
  page: boolean,
) {
  const base = source && original ? storyDocument(source, original) : null
  const origins = originsOf(base)
  const build: Build = {
    ...shared,
    media: [...(base?.media ?? [])],
    picture: 1,
    usedParts: shared.usedParts,
    origins,
    runs: origins.runs,
    links: origins.links,
    comments: new Map(),
    tags: new Map(),
  }
  for (const item of shared.media) {
    build.usedParts?.add(item.name.toLowerCase())
  }
  const json = chromeJson(html)
  shared.numbering = ensureListNumbering(shared.numbering, json, build)
  build.numbering = shared.numbering
  const blocks = html ? blocksFromNodes(json.content ?? [], build, 0) : []
  dropEditorTrailingParagraph(blocks)
  if (page) {
    const last = blocks[blocks.length - 1]
    if (last?.kind === "paragraph") {
      last.inlines.push({ kind: "simpleField", instr: " PAGE ", inlines: [plainRun("1")] })
    } else {
      blocks.push(storyParagraph("", true))
    }
  }
  for (const item of build.media) {
    build.usedParts?.add(item.name.toLowerCase())
  }
  return { blocks, media: build.media }
}

/**
 * The section's header and footer parts for the chrome the editor holds. A part whose HTML is what opening it gave
 * is kept as it was; an edited one is read back through the body's converter, pictures and styles included.
 */
function storiesFromChrome(
  chrome: DocumentChrome,
  source: WordDocument | null,
  shared: Build,
  synthesizePageNumber: boolean,
) {
  const existing = source?.section?.references ?? []
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
  for (const story of existing) {
    for (const part of story.links?.parts ?? []) {
      shared.usedParts?.add(part.name.toLowerCase())
    }
  }
  const stories = existing.map((story) => ({ ...story, blocks: story.blocks.map((block) => ({ ...block })) }))
  const ensure = (kind: "header" | "footer", type: HeaderFooterType, html: string) => {
    const current = stories.find((story) => story.kind === kind && story.type === type)
    const original = existing.find((story) => story.kind === kind && story.type === type)
    const projected = source ? storyHtml(source, original) : ""
    const page = pageFieldFor(kind, type, chrome, html, current, synthesizePageNumber)
    if (current && html === projected) {
      return
    }
    const rebuilt = storyBlocks(html, original, source, shared, page)
    const blocks = rebuilt.blocks.length > 0 ? rebuilt.blocks : current ? [emptyParagraph()] : []
    if (current) {
      current.blocks = blocks
      current.links = storyLinks(original, rebuilt.media)
      return
    }
    if (blocks.length === 0) {
      return
    }
    stories.push({ kind, type, relId: nextId(), blocks, links: storyLinks(undefined, rebuilt.media) })
  }
  ensure("header", "default", chrome.header)
  ensure("footer", "default", chrome.footer)
  if (chrome.differentFirstPage) {
    ensure("header", "first", chrome.firstHeader)
    ensure("footer", "first", chrome.firstFooter)
  }
  if (chrome.pageSetup.differentOddEven) {
    ensure("header", "even", chrome.evenHeader)
    ensure("footer", "even", chrome.evenFooter)
  }
  return stories
}

/**
 * Whether a part is given a page number the editor did not draw into it: a new document's footer with the page
 * number set for the bottom of the page. A part with a page number field of its own, or one opened from a file, has it.
 */
function pageFieldFor(
  kind: "header" | "footer",
  type: HeaderFooterType,
  chrome: DocumentChrome,
  html: string,
  current: HeaderFooterRef | undefined,
  synthesizePageNumber: boolean,
) {
  const place = chrome.pageSetup.pageNumber
  const wanted = place !== "none" && (kind === "footer" ? place.startsWith("bottom") : place.startsWith("top"))
  if (!wanted || current || !synthesizePageNumber || (type !== "default" && type !== "first")) {
    return false
  }
  return !chromeHasPageField(html)
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
  if (node.type === "columnBreak") {
    return {
      kind: "paragraph",
      pPr: {},
      markRPr: {},
      inlines: [{ kind: "run", rPr: {}, content: [{ kind: "break", breakType: "column" }] }],
    }
  }
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
          valign: child.attrs?.valign === "middle" || child.attrs?.valign === "bottom" ? child.attrs.valign : "top",
          editedMargins: typeof child.attrs?.cellMargins === "string" ? child.attrs.cellMargins : null,
          ...(child.attrs?.noWrap === true ? { noWrap: true } : {}),
          ...(child.attrs?.fitText === true ? { fitText: true } : {}),
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
          // Borders, margins, conditional formatting: everything tcPr says that the editor does not show.
          cell.source = match.source
        }
      }
      // The vertical alignment the editor shows wins over the one the source cell had: top is only written where the
      // source said it, as it is Word's default.
      for (const [index, cell] of cells.entries()) {
        const match = sourceCellAt(gridColumn(cells, index))
        const shown = cell.valign
        const wanted =
          shown === "middle"
            ? "center"
            : shown === "bottom"
              ? "bottom"
              : match?.look?.vAlign === "top"
                ? "top"
                : undefined
        if (wanted) {
          cell.look = { ...cell.look, vAlign: wanted }
        } else if (cell.look?.vAlign) {
          const { vAlign: _dropped, ...rest } = cell.look
          cell.look = rest
        }
      }
      // Cell Options' margins win over the ones the source cell had; "Same as the whole table" drops them.
      for (const cell of cells) {
        if (cell.vMerge === "continue") {
          continue
        }
        const margins = marginsToWord(cell.editedMargins, cell.look?.margins)
        if (margins) {
          cell.look = { ...cell.look, margins }
        } else if (cell.look?.margins) {
          const { margins: _dropped, ...rest } = cell.look
          cell.look = rest
        }
      }
      const editedHeight = Number(row.attrs?.height)
      const height =
        editedHeight > 0
          ? {
              value: Math.round(editedHeight * TWIP_PER_PX),
              ...(row.attrs?.heightRule === "exact"
                ? { rule: "exact" as const }
                : source?.height?.rule === "atLeast"
                  ? { rule: "atLeast" as const }
                  : {}),
            }
          : undefined
      return {
        ...(source?.header || (rowIndex === 0 && node.attrs?.headerRow === true) ? { header: true } : {}),
        ...(row.attrs?.cantSplit === true ? { cantSplit: true } : {}),
        // A height the source row had and the editor did not show stays; one the person set replaces it.
        ...(height ? { height } : source?.height ? { height: structuredClone(source.height) } : {}),
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
    ...(origin?.borders ? { borders: structuredClone(origin.borders) } : {}),
    ...(origin?.look ? { look: structuredClone(origin.look) } : {}),
    grid,
    rows: rows.map((row) => ({
      ...row,
      cells: row.cells.map(({ colwidth: _colwidth, valign: _valign, editedMargins: _margins, ...cell }, index) => {
        const at = gridColumn(row.cells, index)
        const width = grid.slice(at, at + (cell.gridSpan ?? 1)).reduce((sum, column) => sum + column, 0)
        return width > 0 ? { ...cell, width: { value: width, type: "dxa" as const } } : cell
      }),
    })),
  }
  if (key) {
    table.key = key
  }
  // Table Properties: preferred width, indent, cell spacing, default cell margins and automatic resizing.
  const attrs = node.attrs ?? {}
  const width = preferredToWord(attrs.prefWidth, origin?.width)
  if (width) {
    table.width = structuredClone(width)
  }
  const indent = lengthToWord(attrs.indent, origin?.indent)
  if (indent) {
    table.indent = structuredClone(indent)
  }
  const spacing = lengthToWord(attrs.cellSpacing, origin?.cellSpacing)
  if (spacing && spacing.value > 0) {
    table.cellSpacing = structuredClone(spacing)
  }
  const margins = marginsToWord(attrs.margins ?? presetAttrs(presetOf(attrs)).margins, origin?.cellMargins)
  if (margins) {
    table.cellMargins = structuredClone(margins)
  }
  const floated = floatToWord(attrs.float, origin)
  if (floated.position) {
    table.position = structuredClone(floated.position)
  }
  if (floated.overlap) {
    table.overlap = floated.overlap
  }
  const layout = attrs.autoResize === false ? "fixed" : origin?.layout === "fixed" ? "autofit" : origin?.layout
  if (layout) {
    table.layout = layout
  }
  const align = node.attrs?.align === "center" || node.attrs?.align === "right" ? node.attrs.align : "left"
  // Left is Word's default: an untouched table keeps what it had, and only a changed one writes w:jc.
  if (align !== "left" || origin?.align) {
    table.align = align
  }
  const title = typeof node.attrs?.altTitle === "string" ? node.attrs.altTitle.trim() : ""
  const description = typeof node.attrs?.altDesc === "string" ? node.attrs.altDesc.trim() : ""
  if (title) {
    table.caption = title
  }
  if (description) {
    table.description = description
  }
  if (!origin) {
    madeInApp(table, node.attrs?.frame)
  }
  return table
}

/** The fill and borders the person gave a cell in the editor. */
function shadedAndBordered(attrs: JsonNode["attrs"]) {
  const shading = editedShading(attrs)
  const borders = bordersOf(attrs?.borders, attrs?.borderPen, sidePensOf(attrs?.sidePens))
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

type EditedRow = Omit<TableRow, "cells"> & {
  cells: (TableCell & {
    colwidth?: number[] | null
    valign?: "top" | "middle" | "bottom"
    editedMargins?: string | null
  })[]
}

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
