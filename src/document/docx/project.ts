import { BUILT_IN_STYLES, catalogWithStyles, wordIdForNamedStyle, type StyleDef } from "@/document/styles"
import type { DocumentChrome } from "@/document/header"
import { emptyChrome } from "@/document/header"
import {
  CHROME_SLOTS,
  SECTION_COLUMN_FIELDS,
  SECTION_PAPER_FIELDS,
  type ChromeSlot,
  type SectionChrome,
} from "@/document/sections"
import type { WordLevel } from "@/editor/word-markers"
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
import { columnCount, DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import type { DocumentProps } from "@/document/store"
import {
  blockFromAttrs,
  blockFromProperties,
  blockHtmlAttributes,
  propertiesFromBlock,
  withoutListIndent,
} from "@/document/docx/block-format"
import {
  blockAtomHtml,
  commentsFromEditor,
  imageRun,
  inlinesFromEditor,
  diagramSvg,
  inlinesHtml,
  mediaFor,
  encodeBase64,
  numberAttr,
  payloadBlock,
  payloadInlines,
  placeCommentRanges,
  projectionFor,
  type InlineBuild,
  type JsonNode,
  type Projection,
  visibleText,
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
  type PageNumbering,
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
  /** The source document's Word styles, for what a paragraph took from its style when it was opened. */
  wordStyles: Style[]
  bulletId: number
  orderedId: number
  origins: Origins
  numbering: NumberingDefinitions
  toc: TocLinks
  /** Sections made in the editor, ended at these paragraphs (`placeEditorSections`). */
  sectionEnds: EditorSectionEnd[]
  /** Paragraphs ending a section whose columns a block of columns filling it set: Page Setup's do not overwrite them. */
  blockColumns?: Set<Paragraph>
  /** A block of columns filling the body's last section: its columns are that section's. */
  bodyColumns?: { count: number; gapCm: number; line: boolean }
  /** A block of columns filling a section the next editor break ends: its columns, for that break's section. */
  pendingColumns?: { count: number; gapCm: number; line: boolean }
}

/**
 * A section the editor made, ended at `paragraph`: a section break (`kind`, the break after it), or a block of
 * columns (Columns > Selected text), whose end has the block's `columns` and whose start is a continuous break.
 */
type EditorSectionEnd = {
  paragraph: Paragraph
  kind: string
  columns?: { count: number; gapCm: number; line: boolean }
  /** The paragraph already ends a section read from Word: only its columns are the block's. */
  own?: boolean
  /** The break's section key, for its Page Setup and headers and footers (`insertSection`). */
  key?: string
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
    html: sectionsHtml(doc, projectionFor(doc)),
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
  const blocks = blocksFromNodes(json.content ?? [], build, 0, true)
  dropEditorTrailingParagraph(blocks)
  const nextId = storyIds(source)
  const stories = storiesFromChrome(chrome, source, build, source === null, nextId)
  if (build.bodyColumns) {
    Object.assign(section, blockColumnProps(build.bodyColumns, source?.section ?? section))
  }
  placeEditorSections(blocks, build.sectionEnds, section)
  // A section made in the editor is found by its break's key, as one read from Word is by its paragraph's.
  const editorKeys = new Map(
    build.sectionEnds.filter((end) => end.key).map((end) => [end.paragraph, end.key!] as const),
  )
  sectionStoriesFromChrome(blocks, chrome.sections ?? [], source, build, nextId, editorKeys, build.blockColumns)
  const numbering = build.numbering
  section.references = stories.length > 0 ? stories : undefined
  const sectionStories = paragraphsIn(blocks).flatMap((paragraph) => paragraph.sectionBreak?.references ?? [])
  const partBlocks = [...blocks, ...[...stories, ...sectionStories].flatMap((story) => story.blocks)]
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

/**
 * Gives each section made in the editor its w:sectPr, at the paragraph it ends at: a copy of the section that follows
 * (the one the editor drew it with), without its header and footer parts (it shows the previous section's, as a new
 * section in Word does) or a page-number restart. Word's w:type says how a section starts, so the break after the
 * paragraph goes on the next section's. A block of columns has its own; a section before one has the columns around.
 */
function placeEditorSections(blocks: Block[], made: EditorSectionEnd[], body: SectionProps) {
  if (made.length === 0) {
    return
  }
  const byParagraph = new Map(made.map((end) => [end.paragraph, end]))
  const ends = paragraphsIn(blocks).filter((paragraph) => paragraph.sectionBreak || byParagraph.has(paragraph))
  const propsAt = (index: number) => (index < ends.length ? ends[index]!.sectionBreak! : body)
  for (let index = ends.length - 1; index >= 0; index -= 1) {
    const end = byParagraph.get(ends[index]!)
    if (!end) {
      continue
    }
    if (end.own && end.columns) {
      const props = ends[index]!.sectionBreak!
      const count = end.columns.count
      // What Word wrote stays when the block's columns read back the same (twips, unequal widths).
      if (
        columnsKey(props) !==
        columnsKey({
          columnCount: count,
          columnSpace: mmToTwips(end.columns.gapCm * 10),
          columnSeparator: count > 1 && end.columns.line,
        })
      ) {
        const sameCount = ((props.columnCount ?? 1) > 1 ? props.columnCount : 1) === count
        const sameGap = Math.round(((props.columnSpace ?? 720) / 567) * 100) / 100 === end.columns.gapCm
        ends[index]!.sectionBreak = {
          ...props,
          columnCount: count > 1 ? count : undefined,
          columnSpace: sameGap ? props.columnSpace : mmToTwips(end.columns.gapCm * 10),
          columnSeparator:
            count > 1 && end.columns.line ? true : props.columnSeparator === undefined ? undefined : false,
          columnWidths: sameCount && sameGap ? props.columnWidths : undefined,
        }
      }
      continue
    }
    const next = propsAt(index + 1)
    const { references: _references, source: _source, ...rest } = next
    const props: SectionProps = structuredClone(rest)
    if (props.pageNumbers) {
      delete props.pageNumbers.start
    }
    // The columns: the block's own, else those of the first section after that is not a block of columns.
    let around = index + 1
    while (around < ends.length && byParagraph.get(ends[around]!)?.columns) {
      around += 1
    }
    const columns = end.columns
    const from = propsAt(around)
    Object.assign(
      props,
      columns
        ? {
            columnCount: columns.count > 1 ? columns.count : undefined,
            columnSpace: mmToTwips(columns.gapCm * 10),
            columnSeparator: columns.count > 1 && columns.line ? true : undefined,
            columnWidths: undefined,
          }
        : {
            columnCount: from.columnCount,
            columnSpace: from.columnSpace,
            columnSeparator: from.columnSeparator,
            columnWidths: structuredClone(from.columnWidths),
          },
    )
    ends[index]!.sectionBreak = props
    next.type = sectionTypeOfBreak(end.kind)
  }
}

/** A block of columns as `w:cols`; what Word wrote stays when the block's columns read back the same. */
function blockColumnProps(
  columns: { count: number; gapCm: number; line: boolean },
  props: SectionProps,
): Pick<SectionProps, "columnCount" | "columnSpace" | "columnSeparator" | "columnWidths"> {
  const count = columns.count
  const same =
    columnsKey(props) ===
    columnsKey({
      columnCount: count,
      columnSpace: mmToTwips(columns.gapCm * 10),
      columnSeparator: count > 1 && columns.line,
    })
  if (same) {
    return {
      columnCount: props.columnCount,
      columnSpace: props.columnSpace,
      columnSeparator: props.columnSeparator,
      columnWidths: props.columnWidths,
    }
  }
  const sameCount = ((props.columnCount ?? 1) > 1 ? props.columnCount : 1) === count
  const sameGap = Math.round(((props.columnSpace ?? 720) / 567) * 100) / 100 === columns.gapCm
  return {
    columnCount: count > 1 ? count : undefined,
    columnSpace: sameGap ? props.columnSpace : mmToTwips(columns.gapCm * 10),
    columnSeparator: count > 1 && columns.line ? true : props.columnSeparator === undefined ? undefined : false,
    columnWidths: sameCount && sameGap ? props.columnWidths : undefined,
  }
}

/** The w:type of the section after an editor's section break of `kind`. */
function sectionTypeOfBreak(kind: string): SectionProps["type"] {
  return kind === "continuous" || kind === "evenPage" || kind === "oddPage" ? kind : undefined
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
    wordStyles: source?.styles.styles ?? [],
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
    sectionEnds: [],
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
      html += sectionBreakHtml(items[items.length - 1]!, ctx.doc)
      continue
    }
    if (block) {
      html += blockHtml(block, ctx) + sectionBreakHtml(block, ctx.doc)
    }
    index += 1
  }
  return html || "<p></p>"
}

/** A numbered paragraph's text sits where its list puts it, so the editor gets it without its own indent. */
function shownProperties(pPr: ParagraphProperties) {
  return pPr.numPr?.numId ? withoutListIndent(pPr) : pPr
}

/** The list a w:num counts in: its abstract numbering's, which every w:num of that abstract shares. */
function listKey(numId: number, ctx: Projection) {
  const instance = ctx.doc.numbering.instances.find((item) => item.id === numId)
  return instance ? `a${instance.abstractNumId}` : `n${numId}`
}

/**
 * The number the first first-level item of this run of `numId` takes: on from the list's last item, or the level's
 * start when the list has not been shown yet or when this w:num, first used here, restarts it (w:startOverride).
 */
function listStart(numId: number, ctx: Projection) {
  const key = listKey(numId, ctx)
  const first = !ctx.listSeen.has(numId)
  ctx.listSeen.add(numId)
  const instance = ctx.doc.numbering.instances.find((item) => item.id === numId)
  const restarts = instance?.overrides?.some((item) => item.ilvl === 0 && item.startOverride !== undefined) ?? false
  const next = ctx.listNext.get(key)
  if (next === undefined || (first && restarts)) {
    return numberingLevel(ctx.doc.numbering, numId, 0)?.start ?? 1
  }
  return next
}

/**
 * Where Word numbers the list from, and where its text starts: the paragraph's own left indent or else its numbering
 * level's, for the first level and as the step to each deeper one.
 */
function listAttributes(tag: string, numId: number, items: Paragraph[], ctx: Projection) {
  const level = numberingLevel(ctx.doc.numbering, numId, 0)
  const start = listStart(numId, ctx)
  ctx.listNext.set(listKey(numId, ctx), start + items.filter((item) => (item.pPr.numPr?.ilvl ?? 0) === 0).length)
  const leftOf = (item: Paragraph) =>
    item.pPr.ind?.left ?? numberingLevel(ctx.doc.numbering, numId, item.pPr.numPr?.ilvl ?? 0)?.pPr.ind?.left
  const first = items.find((item) => (item.pPr.numPr?.ilvl ?? 0) === 0) ?? items[0]
  const left = (first && leftOf(first)) ?? level?.pPr.ind?.left
  const deeper = items.find((item) => (item.pPr.numPr?.ilvl ?? 0) > 0)
  const deeperLeft = deeper ? leftOf(deeper) : numberingLevel(ctx.doc.numbering, numId, 1)?.pPr.ind?.left
  const depth = deeper?.pPr.numPr?.ilvl ?? 1
  const step = left !== undefined && deeperLeft !== undefined ? (deeperLeft - left) / depth : undefined
  const indent =
    left !== undefined
      ? `padding-left: ${left / 20}pt${step !== undefined && step > 0 ? `; --list-indent-step: ${step / 20}pt` : ""}`
      : ""
  return `${tag === "ol" && start !== 1 ? ` start="${start}"` : ""} data-word-list="1"${
    indent ? ` data-word-indent="${indent}"` : ""
  }${wordLevelsAttribute(ctx.doc.numbering, numId, ctx.doc.settings.defaultTabStop)}`
}

/**
 * Each level's marker as Word defines it (`editor/word-markers.ts`): its text, number format, start, the hanging
 * indent it sits in and its font, so the editor draws Word's own bullets and numbers.
 */
function wordLevelsAttribute(numbering: NumberingDefinitions, numId: number, defaultTab = 720) {
  const levels: WordLevel[] = []
  for (let ilvl = 0; ilvl < 9; ilvl += 1) {
    const level = numberingLevel(numbering, numId, ilvl)
    if (!level) {
      break
    }
    const ind = level.pPr.ind
    const run = level.rPr
    const font = run.rFonts?.ascii ?? run.rFonts?.hAnsi
    const color = run.color && /^[0-9A-Fa-f]{6}$/.test(run.color) ? `#${run.color.toLowerCase()}` : undefined
    const justify =
      level.justify === "center" ? "center" : level.justify === "right" || level.justify === "end" ? "right" : undefined
    levels.push({
      text: level.text ?? "",
      format: level.format ?? "decimal",
      start: level.start ?? 1,
      hang: (ind?.hanging ?? 0) / 20,
      ...(font ? { font } : {}),
      ...(justify ? { justify } : {}),
      ...(level.suffix && level.suffix !== "tab" ? { suffix: level.suffix } : {}),
      ...(level.legal ? { legal: true } : {}),
      ...(level.restart !== undefined ? { restart: level.restart } : {}),
      ...(run.sz ? { size: run.sz / 2 } : {}),
      ...(color ? { color } : {}),
      ...(run.b !== undefined ? { bold: run.b } : {}),
      ...(run.i !== undefined ? { italic: run.i } : {}),
      ...pictureBulletOf(numbering, level.pictureBullet),
    })
  }
  if (levels.length === 0) {
    return ""
  }
  // The default tab stops, which the text after a marker too wide for its hanging indent moves on to.
  return ` data-word-levels="${escapeAttribute(JSON.stringify(levels))}" data-word-tab="${defaultTab / 20}"`
}

/** Image types a browser draws; a picture bullet in another (EMF, WMF) is drawn as its level's text. */
const DRAWN_IMAGES = /^image\/(png|jpeg|gif|bmp|svg\+xml|webp)$/

/**
 * A level's picture bullet as `WordLevel` draws it: the picture numbering.xml points at, and its shape's width over
 * its height (VML `style="width:…;height:…"`, or DrawingML `wp:extent`).
 */
function pictureBulletOf(numbering: NumberingDefinitions, id: number | undefined) {
  const bullet = id === undefined ? undefined : numbering.pictureBullets?.find((item) => item.id === id)
  const relationship = bullet?.image
    ? numbering.links?.relationships.find((item) => item.id === bullet.image)
    : undefined
  const part = relationship?.partName
    ? numbering.links?.parts.find((item) => item.name.toLowerCase() === relationship.partName!.toLowerCase())
    : undefined
  const type = part?.contentType || (part?.name.toLowerCase().endsWith(".png") ? "image/png" : "")
  if (!bullet || !part || !DRAWN_IMAGES.test(type)) {
    return {}
  }
  const vml = /width:\s*([\d.]+)(pt|px|in)?[^"]*?height:\s*([\d.]+)(pt|px|in)?/.exec(bullet.xml)
  const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(bullet.xml)
  const ratio = vml ? Number(vml[1]) / Number(vml[3]) : extent ? Number(extent[1]) / Number(extent[2]) : 1
  return {
    picture: `data:${type};base64,${encodeBase64(part.data)}`,
    pictureRatio: Number.isFinite(ratio) && ratio > 0 ? Math.round(ratio * 1000) / 1000 : 1,
  }
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

const breakTypes = new WeakMap<WordDocument, Map<Paragraph, SectionProps["type"]>>()
/** Section ends next to a block of columns (`sectionsHtml`), whose continuous break the block stands for. */
const quietEnds = new WeakSet<Paragraph>()

const startsOnSamePage = (type: SectionProps["type"]) => type === "continuous" || type === "nextColumn"

/** A section's columns, for telling whether two sections have the same. */
function columnsKey(props: SectionProps) {
  const count = (props.columnCount ?? 1) > 1 ? props.columnCount! : 1
  return count > 1
    ? `${count}:${props.columnSpace ?? DEFAULT_SECTION.columnSpace ?? 720}:${props.columnSeparator ? 1 : 0}:${JSON.stringify(props.columnWidths ?? null)}`
    : "1"
}

const blockPages = new WeakMap<WordDocument, boolean>()

/** The text width of a section's pages, in twips (what it leaves out is the body's): `w:w` is the page's own width. */
function sectionTextWidth(props: SectionProps, body: SectionProps | null) {
  const width = props.pageWidth ?? body?.pageWidth ?? DEFAULT_SECTION.pageWidth ?? 12240
  return width - (props.marginLeft ?? body?.marginLeft ?? 1440) - (props.marginRight ?? body?.marginRight ?? 1440)
}

/**
 * Whether the sections that start a page open with their columns as blocks of columns (option 2, phase 2): their
 * equal columns differ (two in one section, three in the next), which one flow in the browser's columns cannot draw.
 * Each such section's text then flows through its own block's columns, split between them as Word splits it; the
 * pages themselves are one column. Unequal widths, or pages of other text widths, keep the block-by-block layout.
 */
export function pageSectionsAsBlocks(doc: WordDocument) {
  const known = blockPages.get(doc)
  if (known !== undefined) {
    return known
  }
  const ends = paragraphsIn(doc.blocks).filter((item) => item.sectionBreak)
  const all = [...ends.map((item) => item.sectionBreak!), doc.section ?? {}]
  const pages = all.filter((_, index) => {
    const next = all[index + 1]
    return !next || !startsOnSamePage(next.type)
  })
  const columned = pages.filter((props) => (props.columnCount ?? 1) > 1)
  const widths = new Set(columned.map((props) => sectionTextWidth(props, doc.section ?? null)))
  const answer =
    !all.some((props) => (props.columnCount ?? 1) > 1 && props.columnWidths?.length) &&
    widths.size <= 1 &&
    new Set(columned.map(columnsKey)).size > 1
  blockPages.set(doc, answer)
  return answer
}

/** A section's columns as its pages have them: one when its columns are drawn as a block (`pageSectionsAsBlocks`). */
function pageColumnsOf(doc: WordDocument, props: SectionProps): SectionProps {
  return pageSectionsAsBlocks(doc) && (props.columnCount ?? 1) > 1
    ? { ...props, columnCount: undefined, columnWidths: undefined, columnSeparator: undefined }
    : props
}

/**
 * The body, with Word's continuous sections of other columns as blocks of columns. The editor's pages between two
 * breaks that start a page have one section's columns, the last Word section's there (its w:sectPr starts the next
 * page). A section before it on those pages with other columns (a title of one column above two) is drawn as a block
 * of its own columns, balanced as Word balances columns before a continuous break; one longer than a page goes on
 * across the pages (pages.ts, `placeColumnBlock`).
 */
function sectionsHtml(doc: WordDocument, ctx: Projection) {
  const blocks = doc.blocks
  const ends: number[] = []
  blocks.forEach((block, index) => {
    if (block.kind === "paragraph" && block.sectionBreak) {
      ends.push(index)
    }
  })
  if (ends.length === 0) {
    return blocksToHtml(blocks, ctx)
  }
  const sections = [
    ...ends.map((end, index) => ({
      from: index > 0 ? ends[index - 1]! + 1 : 0,
      to: end + 1,
      props: (blocks[end] as Paragraph).sectionBreak!,
    })),
    { from: ends[ends.length - 1]! + 1, to: blocks.length, props: doc.section ?? {} },
  ]
  const wrapped = new Set<number>()
  /** Sections that start a page drawn as a block: their own break follows the block (`sectionBreakHtml`). */
  const pageBlocks = new Set<number>()
  const asBlocks = pageSectionsAsBlocks(doc)
  let start = 0
  sections.forEach((section, index) => {
    const next = sections[index + 1]
    if (next && startsOnSamePage(next.props.type)) {
      return
    }
    // The pages' own columns: one where the sections' columns are drawn as blocks.
    const pageKey = asBlocks ? "1" : columnsKey(section.props)
    if (asBlocks && columnsKey(section.props) !== "1") {
      wrapped.add(index)
      pageBlocks.add(index)
      if (index > start) {
        quietEnds.add(blocks[section.from - 1] as Paragraph)
      }
    }
    for (let at = start; at < index; at += 1) {
      const item = sections[at]!
      if (columnsKey(item.props) !== pageKey) {
        wrapped.add(at)
        quietEnds.add(blocks[item.to - 1] as Paragraph)
        if (at > start) {
          quietEnds.add(blocks[item.from - 1] as Paragraph)
        }
      }
    }
    start = index + 1
  })
  if (wrapped.size === 0) {
    return blocksToHtml(blocks, ctx)
  }
  return sections
    .map((section, index) => {
      if (section.from >= section.to) {
        return ""
      }
      const end = blocks[section.to - 1]
      const own = pageBlocks.has(index) && end?.kind === "paragraph" && end.sectionBreak ? end : null
      if (own) {
        // Its break, to the next page, goes after the block, not inside it.
        quietEnds.add(own)
      }
      const html = blocksToHtml(blocks.slice(section.from, section.to), ctx)
      if (!wrapped.has(index)) {
        return html
      }
      const after = own ? sectionBreakMarkup(own, doc) : ""
      const props = section.props
      const count = (props.columnCount ?? 1) > 1 ? props.columnCount! : 1
      const gap = Math.round(((props.columnSpace ?? DEFAULT_SECTION.columnSpace ?? 720) / 567) * 100) / 100
      const line = count > 1 && props.columnSeparator ? ' data-line="1"' : ""
      return `<div data-column-section="" data-columns="${count}" data-gap="${gap}"${line} class="column-section">${html}</div>${after}`
    })
    .join("")
}

/**
 * How the section after each paragraph that ends one starts: Word's `w:type` is the section's own, how it starts
 * after the one before, so the break after a paragraph is the next section's (the next paragraph's `w:sectPr`, or the
 * body's last one).
 */
export function breakAfter(doc: WordDocument, paragraph: Paragraph): SectionProps["type"] {
  let types = breakTypes.get(doc)
  if (!types) {
    types = new Map()
    const ends = paragraphsIn(doc.blocks).filter((item) => item.sectionBreak)
    ends.forEach((item, index) => {
      types!.set(item, index + 1 < ends.length ? ends[index + 1]!.sectionBreak!.type : doc.section?.type)
    })
    breakTypes.set(doc, types)
  }
  return types.get(paragraph)
}

/**
 * A paragraph that ends a section is followed by the editor's section break, so the next section's text starts the
 * next page (or goes on below, for a continuous one) as in Word. Saving takes the break from the paragraph, not from
 * the editor.
 */
function sectionBreakHtml(block: Block, doc: WordDocument) {
  if (block.kind !== "paragraph" || !block.sectionBreak || quietEnds.has(block)) {
    return ""
  }
  return sectionBreakMarkup(block, doc)
}

function sectionBreakMarkup(block: Paragraph, doc: WordDocument) {
  const type = breakAfter(doc, block)
  if (type === "nextColumn") {
    return ""
  }
  const kind = type === "evenPage" || type === "oddPage" || type === "continuous" ? type : "nextPage"
  // The paragraph's anchor ties the break to the section's own margins and headers and footers (`chrome.sections`).
  const section = block.key ? ` data-section="${escapeAttribute(block.key)}"` : ""
  return `<div data-section-break="" data-kind="${kind}"${section} class="section-break"></div>`
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
  // Text of its own, not a shape's or a text box's: a paragraph holding only a shape with text is not a line of text.
  ctx.textParagraph = paragraphText(paragraph, false).trim() !== ""
  const floatingOnly = paragraph.inlines.every(
    (inline) => inline.kind !== "run" || inline.content.every((item) => item.kind !== "drawing" || item.layout),
  )
  if (picturesOnly(paragraph, ctx.doc) && !floatingOnly) {
    // The editor's images are blocks; a <p> around one would open as an extra empty paragraph. They take the
    // paragraph's alignment instead.
    const align = pictureAlign(paragraph, ctx.doc.styles.styles)
    const html = inlinesHtml(paragraph.inlines, ctx)
    return align === "center" || align === "right"
      ? html.replace(/<img (?![^>]*data-wrap=)/g, `<img style="text-align: ${align}" `)
      : html
  }
  const tag = headingTag(paragraph.styleId)
  const outline = tag === "p" ? outlineLevelOf(paragraph, ctx.doc) : null
  const attrs =
    blockHtmlAttributes(blockFromProperties(shownProperties(paragraph.pPr)), paragraph.key) +
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

/**
 * Where a picture alone in its paragraph sits: the paragraph's own alignment, else its style's (through basedOn,
 * then the default paragraph style). "" for the left, which is what the editor draws without one.
 */
function pictureAlign(paragraph: Paragraph, styles: Style[]): "center" | "right" | "" {
  let jc = paragraph.pPr.jc
  const seen = new Set<string>()
  for (
    let style = paragraph.styleId
      ? styles.find((item) => item.id === paragraph.styleId)
      : styles.find((item) => item.type === "paragraph" && item.default);
    jc === undefined && style && !seen.has(style.id);
    style = styles.find((item) => item.id === style?.basedOn)
  ) {
    seen.add(style.id)
    jc = style.pPr.jc
  }
  const align = blockFromProperties({ jc }).textAlign
  return align === "center" || align === "right" ? align : ""
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
  const setup = section ? pageSetupFromSection(pageColumnsOf(doc, section)) : { ...DEFAULT_PAGE_SETUP }
  if (doc.settings.evenAndOddHeaders) {
    setup.differentOddEven = true
  }
  setup.borderAlign = doc.settings.alignBordersAndEdges === true
  setup.borderSurroundHeader = doc.settings.bordersDoNotSurroundHeader !== true
  setup.borderSurroundFooter = doc.settings.bordersDoNotSurroundFooter !== true
  // A page number in a Word document is a field in its header or footer, which is shown there.
  setup.pageNumber = "none"
  // The last section's header or footer of a kind it has none of is its previous section's (Link to Previous).
  const last = (slot: ChromeSlot) => storyHtml(doc, section ? slotStory(doc, section, slot) : undefined)
  return {
    ...emptyChrome(),
    header: last("header"),
    footer: last("footer"),
    differentFirstPage: Boolean(section?.titlePg),
    firstHeader: last("firstHeader"),
    firstFooter: last("firstFooter"),
    evenHeader: last("evenHeader"),
    evenFooter: last("evenFooter"),
    pageSetup: setup,
    sections: sectionsChrome(doc),
    linked: section
      ? CHROME_SLOTS.filter((slot) => !storyOf(section.references ?? [], SLOT_STORY[slot].kind, SLOT_STORY[slot].type))
      : [],
  }
}

const SLOT_STORY: Record<ChromeSlot, { kind: "header" | "footer"; type: HeaderFooterType }> = {
  header: { kind: "header", type: "default" },
  footer: { kind: "footer", type: "default" },
  firstHeader: { kind: "header", type: "first" },
  firstFooter: { kind: "footer", type: "first" },
  evenHeader: { kind: "header", type: "even" },
  evenFooter: { kind: "footer", type: "even" },
}

function sameStory(story: HeaderFooterRef, slot: ChromeSlot) {
  return story.kind === SLOT_STORY[slot].kind && story.type === SLOT_STORY[slot].type
}

/** Every section's properties in order: those ended by a paragraph's section break, then the document's last. */
function sectionList(doc: WordDocument) {
  const list: SectionProps[] = []
  for (const paragraph of paragraphsIn(doc.blocks)) {
    if (paragraph.sectionBreak) {
      list.push(paragraph.sectionBreak)
    }
  }
  if (doc.section) {
    list.push(doc.section)
  }
  return list
}

/** The part a section shows for a slot: its own, else the nearest previous section's (Link to Previous). */
function slotStory(doc: WordDocument, section: SectionProps, slot: ChromeSlot) {
  const { kind, type } = SLOT_STORY[slot]
  const list = sectionList(doc)
  for (let index = list.indexOf(section); index >= 0; index -= 1) {
    const found = storyOf(list[index]!.references ?? [], kind, type)
    if (found) {
      return found
    }
  }
  return undefined
}

/**
 * The sections before the last that start a page of their own, each with its margins and the headers and footers it
 * has of its own. A continuous section starts no page: what it has of its own goes to the next one that does.
 */
function sectionsChrome(doc: WordDocument): SectionChrome[] {
  const sections: SectionChrome[] = []
  let carried: Partial<Record<ChromeSlot, string>> = {}
  for (const paragraph of paragraphsIn(doc.blocks)) {
    const props = paragraph.sectionBreak
    if (!props) {
      continue
    }
    const own: Partial<Record<ChromeSlot, string>> = { ...carried }
    for (const slot of CHROME_SLOTS) {
      const story = storyOf(props.references ?? [], SLOT_STORY[slot].kind, SLOT_STORY[slot].type)
      if (story) {
        own[slot] = storyHtml(doc, story)
      }
    }
    const type = breakAfter(doc, paragraph)
    if (type === "continuous" || type === "nextColumn" || !paragraph.key) {
      carried = own
      continue
    }
    carried = {}
    sections.push({
      key: paragraph.key,
      marginTop: twipsToMm(props.marginTop ?? doc.section?.marginTop ?? 1440),
      marginBottom: twipsToMm(props.marginBottom ?? doc.section?.marginBottom ?? 1440),
      headerFromEdge: twipsToMm(props.header ?? doc.section?.header ?? 720),
      footerFromEdge: twipsToMm(props.footer ?? doc.section?.footer ?? 720),
      differentFirstPage: Boolean(props.titlePg),
      ...sectionPaper(props, doc.section),
      ...sectionColumnsOf(pageColumnsOf(doc, props)),
      pageNumberStart: props.pageNumbers?.start ?? null,
      pageNumberFormat: props.pageNumbers?.format ?? "decimal",
      parts: own,
      opened: { ...own },
    })
  }
  return sections
}

/**
 * A section's paper, orientation and side margins as Page Setup holds them; what its w:sectPr leaves out is the
 * document's (the body's last w:sectPr).
 */
function sectionPaper(
  props: SectionProps,
  body: SectionProps | null,
): Pick<SectionChrome, (typeof SECTION_PAPER_FIELDS)[number]> {
  const sized = props.pageWidth !== undefined || props.pageHeight !== undefined
  const setup = pageSetupFromSection({
    pageWidth: props.pageWidth ?? body?.pageWidth,
    pageHeight: props.pageHeight ?? body?.pageHeight,
    orient: sized ? props.orient : (props.orient ?? body?.orient),
    marginLeft: props.marginLeft ?? body?.marginLeft,
    marginRight: props.marginRight ?? body?.marginRight,
  })
  return {
    paper: setup.paper,
    orientation: setup.orientation,
    paperWidth: setup.paperWidth,
    paperHeight: setup.paperHeight,
    marginLeft: setup.marginLeft,
    marginRight: setup.marginRight,
  }
}

/** A section's columns as Page Setup holds them, from its own `w:cols` (none: one column, as in Word). */
function sectionColumnsOf(props: SectionProps): Pick<SectionChrome, (typeof SECTION_COLUMN_FIELDS)[number]> {
  const setup = pageSetupFromSection(props)
  return {
    columns: setup.columns,
    columnGap: setup.columnGap,
    columnLine: setup.columnLine,
    ...(setup.columnWidths ? { columnWidths: setup.columnWidths } : {}),
  }
}

/**
 * Writes the headers and footers edited in sections before the last into their section breaks: a section that had
 * the part gets it rewritten, one that was linked to the previous section gets a part of its own.
 */
function sectionStoriesFromChrome(
  blocks: Block[],
  sections: SectionChrome[],
  source: WordDocument | null,
  shared: Build,
  nextId: () => string,
  editorKeys: Map<Paragraph, string> = new Map(),
  blockColumns: Set<Paragraph> = new Set(),
) {
  // Continuous sections since the last section that starts a page: what they have of their own shows in the next one.
  let carried: Paragraph[] = []
  for (const paragraph of paragraphsIn(blocks)) {
    const key = editorKeys.get(paragraph) ?? paragraph.key
    const section = key ? sections.find((item) => item.key === key) : undefined
    if (!section || !paragraph.sectionBreak) {
      if (paragraph.sectionBreak) {
        carried.push(paragraph)
      }
      continue
    }
    paragraph.sectionBreak = sectionSetupFromChrome(
      paragraph.sectionBreak,
      section,
      source?.section ?? null,
      blockColumns.has(paragraph),
    )
    const before = carried
    carried = []
    for (const slot of CHROME_SLOTS) {
      const html = section.parts[slot]
      const { kind: storyKind, type: storyType } = SLOT_STORY[slot]
      if (html === undefined && section.opened[slot] !== undefined) {
        // Linked to Previous since it was opened: the section's own part is dropped, here and where it came from.
        for (const item of [...before, paragraph]) {
          const props = item.sectionBreak!
          const references = props.references ?? []
          const own = storyOf(references, storyKind, storyType)
          if (own) {
            item.sectionBreak = { ...props, references: references.filter((ref) => ref !== own) }
          }
        }
        continue
      }
      if (html === undefined || html === section.opened[slot]) {
        continue
      }
      const { kind, type } = SLOT_STORY[slot]
      const references: HeaderFooterRef[] = paragraph.sectionBreak.references ?? []
      const current = storyOf(references, kind, type)
      const rebuilt = storyBlocks(html, current, source, shared, false)
      const blocks = rebuilt.blocks.length > 0 ? rebuilt.blocks : [emptyParagraph()]
      const story = current
        ? { ...current, blocks, links: storyLinks(current, rebuilt.media) }
        : { kind, type, relId: nextId(), blocks, links: storyLinks(undefined, rebuilt.media) }
      paragraph.sectionBreak = {
        ...paragraph.sectionBreak,
        references: [...references.filter((item) => item !== current), story],
      }
    }
  }
}

/**
 * A section break's w:sectPr with what Page Setup and Format Page Numbers changed in its section: each value that
 * reads back the same as it opened keeps what Word wrote (twips, attributes it does not show).
 */
function sectionSetupFromChrome(
  props: SectionProps,
  section: SectionChrome,
  body: SectionProps | null,
  blockColumns = false,
): SectionProps {
  const next: SectionProps = { ...props }
  const measure = (name: "marginTop" | "marginBottom" | "header" | "footer", mm: number, fallback: number) => {
    if (twipsToMm(props[name] ?? body?.[name] ?? fallback) !== mm) {
      next[name] = mmToTwips(mm)
    }
  }
  measure("marginTop", section.marginTop, 1440)
  measure("marginBottom", section.marginBottom, 1440)
  measure("header", section.headerFromEdge, 720)
  measure("footer", section.footerFromEdge, 720)
  // Paper and side margins: written only when they no longer read back as they opened.
  const opened = sectionPaper(props, body)
  const paper = { ...opened }
  for (const field of SECTION_PAPER_FIELDS) {
    if (section[field] !== undefined) {
      Object.assign(paper, { [field]: section[field] })
    }
  }
  if (
    paper.paper !== opened.paper ||
    paper.orientation !== opened.orientation ||
    paper.paperWidth !== opened.paperWidth ||
    paper.paperHeight !== opened.paperHeight
  ) {
    const base = props.pageWidth !== undefined ? props : body
    Object.assign(next, paperTwips(paper as Required<typeof paper>, base))
  }
  if (paper.marginLeft !== opened.marginLeft) {
    next.marginLeft = keepTwips(props.marginLeft ?? body?.marginLeft, paper.marginLeft!)
  }
  if (paper.marginRight !== opened.marginRight) {
    next.marginRight = keepTwips(props.marginRight ?? body?.marginRight, paper.marginRight!)
  }
  // Columns: written only when they no longer read back as they opened.
  const columns = { ...sectionColumnsOf(props) }
  for (const field of SECTION_COLUMN_FIELDS) {
    if (section[field] !== undefined) {
      Object.assign(columns, { [field]: section[field] })
    }
  }
  // A block of columns filling the section set them; the section's pages are one column.
  if (!blockColumns && JSON.stringify(columns) !== JSON.stringify(sectionColumnsOf(props))) {
    Object.assign(next, columnProps(columns as Required<typeof columns>, props))
  }
  if (Boolean(props.titlePg) !== section.differentFirstPage) {
    next.titlePg = section.differentFirstPage ? true : undefined
  }
  const start = section.pageNumberStart ?? null
  const format = section.pageNumberFormat ?? "decimal"
  if ((props.pageNumbers?.start ?? null) !== start || (props.pageNumbers?.format ?? "decimal") !== format) {
    const pages = { ...props.pageNumbers }
    if (start === null) {
      delete pages.start
    } else {
      pages.start = start
    }
    if (format === "decimal") {
      delete pages.format
    } else {
      pages.format = format
    }
    next.pageNumbers = Object.keys(pages).length ? pages : undefined
  }
  return next
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
  const columns = columnCount(section.columnCount ?? 1)
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
    lineNumberRestart:
      section.lineNumbers?.restart === "newPage"
        ? "page"
        : section.lineNumbers?.restart === "newSection"
          ? "section"
          : "continuous",
    // Word counts w:start from 0: start="4" numbers the first line 5.
    lineNumberStart: (section.lineNumbers?.start ?? 0) + 1,
    lineNumberCountBy: section.lineNumbers?.countBy ?? 1,
    lineNumberDistance: section.lineNumbers?.distance ? twipsToMm(section.lineNumbers.distance) : 0,
    pageNumberStart: section.pageNumbers?.start ?? null,
    pageNumberFormat: section.pageNumbers?.format ?? "decimal",
    gutter: twipsToMm(section.gutter ?? 0),
    headerFromEdge: twipsToMm(section.header ?? 708),
    footerFromEdge: twipsToMm(section.footer ?? 708),
    columns,
    columnGap: section.columnSpace
      ? Math.round((section.columnSpace / 1440) * 254) / 100
      : DEFAULT_PAGE_SETUP.columnGap,
    columnLine: columns > 1 && section.columnSeparator === true,
    columnWidths:
      columns > 1 && section.columnWidths?.length === columns
        ? section.columnWidths.map((column, index) => ({
            width: twipsToCm(column.width),
            space: index < columns - 1 ? twipsToCm(column.space ?? 0) : 0,
          }))
        : undefined,
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

/** A value the user left alone keeps the source twips; converting through millimetres would round it. */
function keepTwips(source: number | undefined, mm: number) {
  return source !== undefined && twipsToMm(source) === mm ? source : mmToTwips(mm)
}

/** `w:pgSz` for Page Setup's paper and orientation; a custom size the user left alone keeps `base`'s twips. */
function paperTwips(
  setup: Pick<PageSetup, "paper" | "orientation" | "paperWidth" | "paperHeight">,
  base: SectionProps | null,
): Pick<SectionProps, "pageWidth" | "pageHeight" | "orient"> {
  const named = PAPER_TWIPS[setup.paper] ?? PAPER_TWIPS.letter
  const custom = setup.paperWidth > 0 && setup.paperHeight > 0
  const portrait =
    base && base.orient === "landscape"
      ? { w: base.pageHeight, h: base.pageWidth }
      : { w: base?.pageWidth, h: base?.pageHeight }
  let width = custom ? keepTwips(portrait.w, setup.paperWidth) : named.w
  let height = custom ? keepTwips(portrait.h, setup.paperHeight) : named.h
  if (setup.orientation === "landscape") {
    const swap = width
    width = height
    height = swap
  }
  return { pageWidth: width, pageHeight: height, orient: setup.orientation === "landscape" ? "landscape" : undefined }
}

function sectionFromChrome(chrome: DocumentChrome, base: SectionProps | null): SectionProps {
  const setup = chrome.pageSetup
  const keep = keepTwips
  const section: SectionProps = {
    ...(base ?? {}),
    ...paperTwips(setup, base),
    marginTop: keep(base?.marginTop, setup.marginTop),
    marginRight: keep(base?.marginRight, setup.marginRight),
    marginBottom: keep(base?.marginBottom, setup.marginBottom),
    marginLeft: keep(base?.marginLeft, setup.marginLeft),
    gutter: keep(base?.gutter, setup.gutter),
    header: keep(base?.header, setup.headerFromEdge),
    footer: keep(base?.footer, setup.footerFromEdge),
    ...columnProps(setup, base),
    linePitch: base?.linePitch ?? DEFAULT_SECTION.linePitch,
    lineNumbers: lineNumberingFrom(setup, base?.lineNumbers),
    pageBorders: pageBordersFrom(setup, base?.pageBorders),
    pageNumbers: pageNumberingFrom(setup, base?.pageNumbers),
    titlePg: chrome.differentFirstPage ? true : undefined,
    type: sectionTypeFrom(setup.sectionStart) ?? base?.type,
  }
  return section
}

function twipsToCm(twips: number) {
  return Math.round((twips / 1440) * 254) / 100
}

/** Unequal columns as Word's w:col list (twips); what Word wrote stays when the widths are still the same. */
/** `w:cols` for Page Setup's columns; a gap the user left alone keeps `base`'s twips. */
function columnProps(
  setup: Pick<PageSetup, "columns" | "columnGap" | "columnLine" | "columnWidths">,
  base: SectionProps | null,
): Pick<SectionProps, "columnCount" | "columnSpace" | "columnSeparator" | "columnWidths"> {
  return {
    columnCount: setup.columns > 1 ? setup.columns : undefined,
    columnSpace:
      setup.columns > 1
        ? base?.columnSpace !== undefined && Math.round((base.columnSpace / 1440) * 254) / 100 === setup.columnGap
          ? base.columnSpace
          : mmToTwips(setup.columnGap * 10)
        : (base?.columnSpace ?? DEFAULT_SECTION.columnSpace),
    columnSeparator:
      setup.columns > 1 && setup.columnLine ? true : base?.columnSeparator === undefined ? undefined : false,
    columnWidths: columnWidthsFrom(setup, base?.columnWidths),
  }
}

function columnWidthsFrom(
  setup: Pick<PageSetup, "columns" | "columnWidths">,
  base: SectionProps["columnWidths"],
): SectionProps["columnWidths"] {
  const widths = setup.columns > 1 ? setup.columnWidths : undefined
  if (!widths) {
    return undefined
  }
  const same =
    base?.length === widths.length &&
    base.every(
      (column, index) =>
        twipsToCm(column.width) === widths[index].width &&
        (index === widths.length - 1 || twipsToCm(column.space ?? 0) === widths[index].space),
    )
  if (same) {
    return base
  }
  return widths.map((column, index) =>
    index < widths.length - 1
      ? { width: mmToTwips(column.width * 10), space: mmToTwips(column.space * 10) }
      : { width: mmToTwips(column.width * 10) },
  )
}

/**
 * The section's line numbers from the page setup: what Word wrote (count by, start, distance) while the setup still
 * says the same, else numbering every line, restarting where the setup says.
 */
function lineNumberingFrom(setup: PageSetup, base: LineNumbering | undefined): LineNumbering | undefined {
  if (!setup.lineNumbers) {
    return undefined
  }
  const restart =
    setup.lineNumberRestart === "page" ? "newPage" : setup.lineNumberRestart === "section" ? "newSection" : "continuous"
  const start = setup.lineNumberStart > 1 ? setup.lineNumberStart - 1 : undefined
  const distance = setup.lineNumberDistance > 0 ? mmToTwips(setup.lineNumberDistance) : undefined
  const same =
    base &&
    (base.restart === "newPage" || base.restart === "newSection" ? base.restart : "continuous") === restart &&
    (base.start ?? 0) + 1 === setup.lineNumberStart &&
    (base.countBy ?? 1) === setup.lineNumberCountBy &&
    (base.distance ? twipsToMm(base.distance) : 0) === setup.lineNumberDistance
  if (same) {
    return base
  }
  return {
    countBy: setup.lineNumberCountBy,
    ...(start !== undefined ? { start } : {}),
    ...(distance !== undefined ? { distance } : {}),
    restart,
  }
}

/** The section's w:pgNumType from Format Page Numbers: what Word wrote while the start and format are the same. */
function pageNumberingFrom(setup: PageSetup, base: PageNumbering | undefined): PageNumbering | undefined {
  const start = setup.pageNumberStart ?? undefined
  const format = setup.pageNumberFormat === "decimal" ? undefined : setup.pageNumberFormat
  if (base && base.start === start && (base.format === "decimal" ? undefined : base.format) === format) {
    return base
  }
  if (start === undefined && format === undefined && !base?.chapStyle && !base?.chapSep) {
    return undefined
  }
  return {
    ...(format !== undefined ? { format } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(base?.chapStyle !== undefined ? { chapStyle: base.chapStyle } : {}),
    ...(base?.chapSep ? { chapSep: base.chapSep } : {}),
  }
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
  nextId: () => string,
) {
  const existing = source?.section?.references ?? []
  for (const story of existing) {
    for (const part of story.links?.parts ?? []) {
      shared.usedParts?.add(part.name.toLowerCase())
    }
  }
  const linked = chrome.linked ?? []
  // Linked to Previous where a section before has the part: the last section shows that one and has none of its own.
  const follows = (slot: ChromeSlot) =>
    linked.includes(slot) && (chrome.sections ?? []).some((section) => section.parts[slot] !== undefined)
  const stories = existing
    .filter((story) => !CHROME_SLOTS.some((slot) => follows(slot) && sameStory(story, slot)))
    .map((story) => ({ ...story, blocks: story.blocks.map((block) => ({ ...block })) }))
  const ensure = (slot: ChromeSlot, html: string) => {
    if (follows(slot)) {
      return
    }
    const { kind, type } = SLOT_STORY[slot]
    const current = stories.find((story) => story.kind === kind && story.type === type)
    const original = existing.find((story) => story.kind === kind && story.type === type)
    // A kind the last section has none of shows the previous section's; unchanged, it stays linked to it.
    const shown = original ?? (source?.section ? slotStory(source, source.section, slot) : undefined)
    const projected = source ? storyHtml(source, shown) : ""
    const page = pageFieldFor(kind, type, chrome, html, current, synthesizePageNumber)
    // Unlinked since it was opened, the part is written as its own even when it is the one it showed.
    if ((current || (shown && linked.includes(slot))) && html === projected) {
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
  ensure("header", chrome.header)
  ensure("footer", chrome.footer)
  if (chrome.differentFirstPage) {
    ensure("firstHeader", chrome.firstHeader)
    ensure("firstFooter", chrome.firstFooter)
  }
  if (chrome.pageSetup.differentOddEven) {
    ensure("evenHeader", chrome.evenHeader)
    ensure("evenFooter", chrome.evenFooter)
  }
  return stories
}

/**
 * New relationship ids for header and footer parts. They are named apart (`rIdHf1`…) from the document's own
 * `rId` numbers, which its pictures, styles and kept parts already use, and none is one a section already points at.
 */
function storyIds(source: WordDocument | null) {
  const used = new Set(
    (source ? sectionList(source) : []).flatMap((item) => (item.references ?? []).map((story) => story.relId)),
  )
  return () => {
    let number = 1
    while (used.has(`rIdHf${number}`)) {
      number += 1
    }
    const id = `rIdHf${number}`
    used.add(id)
    return id
  }
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

type Float = { run: Inline; key?: string }

/**
 * Floating pictures into the paragraph they are anchored to: each back where it was among the paragraph's text
 * while the text before it is as it was, else at the paragraph's start.
 */
function placeFloats(block: Paragraph, floats: Float[], build: Build) {
  const places = floats.map((float) => floatIndex(block, float.key, build))
  for (let index = floats.length - 1; index >= 0; index -= 1) {
    block.inlines.splice(places[index]!, 0, floats[index]!.run)
  }
}

function floatIndex(block: Paragraph, key: string | undefined, build: Build) {
  const origin = key ? build.origins.runParagraphs.get(key) : undefined
  if (!origin || origin.key === undefined || origin.key !== block.key) {
    return 0
  }
  const at = origin.inlines.findIndex((inline) => inline.kind === "run" && inline.key === key)
  const before = at > 0 ? visibleText(origin.inlines.slice(0, at)) : ""
  if (!before) {
    return 0
  }
  for (let index = 1; index <= block.inlines.length; index += 1) {
    const text = visibleText(block.inlines.slice(0, index))
    if (text === before) {
      return index
    }
    if (!before.startsWith(text)) {
      return 0
    }
  }
  return 0
}

/** Whether an editor section break starts a page (every kind but continuous). */
const pageBreakNode = (node: JsonNode | undefined) =>
  node?.type === "sectionBreak" && String(node.attrs?.kind || "nextPage") !== "continuous"

/** An empty paragraph: what the editor keeps at the document's end. */
const emptyNode = (node: JsonNode) => node.type === "paragraph" && !(node.content ?? []).length

function blocksFromNodes(nodes: JsonNode[], build: Build, level: number, top = false): Block[] {
  const blocks: Block[] = []
  let floats: Float[] = []
  /** The paragraph a section made in the editor ends at: the block before, or a new empty one. */
  const endingParagraph = () => {
    const previous = blocks[blocks.length - 1]
    if (
      previous?.kind === "paragraph" &&
      !previous.sectionBreak &&
      !build.sectionEnds.some((end) => end.paragraph === previous)
    ) {
      return previous
    }
    const empty = emptyParagraph()
    blocks.push(empty)
    return empty
  }
  for (const [index, node] of nodes.entries()) {
    if (node.type === "sectionBreak") {
      const previous = blocks[blocks.length - 1]
      // A break read from Word is saved from its paragraph's w:sectPr, which that paragraph keeps (its first half,
      // when it was split: the break's section is that paragraph's key).
      const key = String(node.attrs?.sectionId || "")
      const fromWord = Boolean(key && build.origins.paragraphs.get(key)?.sectionBreak)
      const columns = build.pendingColumns
      build.pendingColumns = undefined
      if (!fromWord && (previous?.kind !== "paragraph" || !previous.sectionBreak)) {
        const paragraph = endingParagraph()
        build.sectionEnds.push({ paragraph, kind: String(node.attrs?.kind || "nextPage"), key, columns })
        if (columns) {
          build.blockColumns?.add(paragraph)
        }
      }
      continue
    }
    if (node.type === "columnSection") {
      const columns = {
        count: Math.max(1, Math.round(Number(node.attrs?.columns) || 2)),
        gapCm: Number(node.attrs?.gap) || 1.25,
        line: node.attrs?.line === true,
      }
      // A block filling a section (a page-starting break or the start before it, one or the end after it) is that
      // section's columns, saved as its own w:cols rather than as a continuous section of its own.
      const rest = nodes.slice(index + 1)
      const atEnd = top && rest.every(emptyNode)
      const whole = top && (index === 0 || pageBreakNode(nodes[index - 1])) && (atEnd || pageBreakNode(rest[0]))
      if (whole) {
        build.blockColumns ??= new Set()
        blocks.push(...blocksFromNodes(node.content ?? [], build, level))
        const last = blocks[blocks.length - 1]
        if (last?.kind === "paragraph" && last.sectionBreak) {
          build.sectionEnds.push({ paragraph: last, kind: "continuous", columns, own: true })
          build.blockColumns.add(last)
        } else if (atEnd) {
          build.bodyColumns = columns
        } else {
          build.pendingColumns = columns
        }
        continue
      }
      // Word has columns only per section: the block is a continuous section of its own.
      if (blocks.length > 0) {
        const previous = blocks[blocks.length - 1]
        const pending = build.sectionEnds.find((end) => end.paragraph === previous)
        if (!pending && !(previous?.kind === "paragraph" && previous.sectionBreak)) {
          build.sectionEnds.push({ paragraph: endingParagraph(), kind: "continuous" })
        }
      }
      blocks.push(...blocksFromNodes(node.content ?? [], build, level))
      const last = blocks[blocks.length - 1]
      if (last?.kind === "paragraph" && last.sectionBreak) {
        // A section read from Word, drawn as a block (`sectionsHtml`): its own w:sectPr, with the block's columns.
        build.sectionEnds.push({ paragraph: last, kind: "continuous", columns, own: true })
        ;(build.blockColumns ??= new Set()).add(last)
      } else {
        build.sectionEnds.push({ paragraph: endingParagraph(), kind: "continuous", columns })
      }
      continue
    }
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
        floats.push({ run: drawing, key: typeof node.attrs.docxKey === "string" ? node.attrs.docxKey : undefined })
      }
      continue
    }
    const block = blockFromNode(node, build)
    if (floats.length > 0 && block?.kind === "paragraph") {
      placeFloats(block, floats, build)
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
    blocks.push({ kind: "paragraph", pPr: {}, markRPr: {}, inlines: floats.map((float) => float.run) })
  }
  // A paragraph or table read from inside a content control goes back inside it.
  for (const block of blocks) {
    const origin =
      block.kind === "paragraph" && block.key
        ? build.origins.paragraphs.get(block.key)
        : block.kind === "table" && block.key
          ? build.origins.tables.get(block.key)
          : undefined
    if (origin?.controls && !block.controls) {
      block.controls = structuredClone(origin.controls)
    }
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
    const align = typeof node.attrs?.textAlign === "string" ? node.attrs.textAlign : ""
    const jc = align === "center" ? "center" : align === "right" ? "right" : undefined
    if (!origin?.key || !picturesOnlySource(origin)) {
      return { kind: "paragraph", pPr: jc ? { jc } : {}, markRPr: {}, inlines: [drawing] }
    }
    const pPr = structuredClone(origin.pPr)
    // The alignment the picture was opened with stays as Word wrote it; one set in the editor replaces it.
    if (pictureAlign(origin, build.wordStyles) !== (jc ?? "")) {
      if (jc) {
        pPr.jc = jc
      } else {
        delete pPr.jc
        // Left of a paragraph whose style centres it is said in the paragraph.
        if (pictureAlign({ ...origin, pPr }, build.wordStyles)) {
          pPr.jc = "left"
        }
      }
    }
    const paragraph: Paragraph = {
      kind: "paragraph",
      pPr,
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
  const pPr = propertiesFromBlock(
    blockFromAttrs(node.attrs),
    origin?.pPr,
    origin?.pPr ? shownProperties(origin.pPr) : undefined,
  )
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
        if (match.width) {
          // Kept while the columns are as read (below): Word's preferred width need not equal the grid.
          cell.width = structuredClone(match.width)
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
  const resized =
    !origin || origin.grid.length !== grid.length || origin.grid.some((width, index) => width !== grid[index])
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
        if (cell.width && !resized) {
          return cell
        }
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
