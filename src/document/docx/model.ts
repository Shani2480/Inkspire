import type { ElementSource } from "@/document/docx/element-source"

/** The namespace of the app's own objects kept in a drawing's docPr extension list. */
export const INKSPIRE_OBJECT_NS = "https://inkspire.app/2026/object"
/**
 * WordprocessingML model for paragraphs, runs, styles and settings (guide §8).
 * Property order follows ECMA-376-1 §17.7.2: document defaults, table style,
 * numbering, paragraph style, character style, then direct formatting.
 * Toggle properties flip at each style level. Direct formatting sets them.
 */

export const W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml"
export const COMPATIBILITY_URI = "http://schemas.microsoft.com/office/word"

export const UNDERLINE_VALUES = [
  "single",
  "words",
  "double",
  "thick",
  "dotted",
  "dottedHeavy",
  "dash",
  "dashedHeavy",
  "dashLong",
  "dashLongHeavy",
  "dotDash",
  "dotDashHeavy",
  "dotDotDash",
  "dotDotDashHeavy",
  "wave",
  "wavyHeavy",
  "wavyDouble",
  "none",
] as const

export const HIGHLIGHT_VALUES = [
  "black",
  "blue",
  "cyan",
  "green",
  "magenta",
  "red",
  "yellow",
  "white",
  "darkBlue",
  "darkCyan",
  "darkGreen",
  "darkMagenta",
  "darkRed",
  "darkYellow",
  "darkGray",
  "lightGray",
  "none",
] as const

export const JC_VALUES = [
  "left",
  "center",
  "right",
  "both",
  "start",
  "end",
  "distribute",
  "mediumKashida",
  "highKashida",
  "lowKashida",
  "thaiDistribute",
  "numTab",
] as const

export const LINE_RULES = ["auto", "exact", "atLeast"] as const
export const VERTICAL_ALIGNS = ["baseline", "superscript", "subscript"] as const
export const FONT_HINTS = ["default", "eastAsia", "cs"] as const
export const BREAK_TYPES = ["textWrapping", "page", "column"] as const
export const STYLE_TYPES = ["paragraph", "character", "table", "numbering"] as const
export const SECTION_TYPES = ["nextPage", "nextColumn", "continuous", "evenPage", "oddPage"] as const
export const PAGE_ORIENTATIONS = ["portrait", "landscape"] as const
export const TABLE_WIDTH_TYPES = ["nil", "pct", "dxa", "auto"] as const
export const TAB_ALIGNS = ["clear", "left", "center", "right", "decimal", "bar", "num"] as const
export const TAB_LEADERS = ["none", "dot", "hyphen", "underscore", "heavy", "middleDot"] as const
export const HEADER_FOOTER_TYPES = ["even", "default", "first"] as const
export const FIELD_CHAR_TYPES = ["begin", "separate", "end"] as const

export type UnderlineValue = (typeof UNDERLINE_VALUES)[number]
export type HighlightValue = (typeof HIGHLIGHT_VALUES)[number]
export type JcValue = (typeof JC_VALUES)[number]
export type LineRule = (typeof LINE_RULES)[number]
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number]
export type FontHint = (typeof FONT_HINTS)[number]
export type BreakType = (typeof BREAK_TYPES)[number]
export type StyleType = (typeof STYLE_TYPES)[number]
export type SectionType = (typeof SECTION_TYPES)[number]
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number]
export type TableWidthType = (typeof TABLE_WIDTH_TYPES)[number]
export type TabAlign = (typeof TAB_ALIGNS)[number]
export type TabLeader = (typeof TAB_LEADERS)[number]
export type HeaderFooterType = (typeof HEADER_FOOTER_TYPES)[number]
export type FieldCharType = (typeof FIELD_CHAR_TYPES)[number]

/** Toggle properties. bCs and iCs follow the same ECMA-376 rule as b and i. */
export const TOGGLE_PROPERTIES = [
  "b",
  "bCs",
  "i",
  "iCs",
  "caps",
  "smallCaps",
  "strike",
  "dstrike",
  "emboss",
  "imprint",
  "outline",
  "shadow",
  "vanish",
] as const

export type ToggleProperty = (typeof TOGGLE_PROPERTIES)[number]

export type RunFonts = {
  ascii?: string
  hAnsi?: string
  cs?: string
  eastAsia?: string
  hint?: FontHint
  asciiTheme?: string
  hAnsiTheme?: string
  eastAsiaTheme?: string
  csTheme?: string
}

export type Underline = {
  value: UnderlineValue
  color?: string
}

export type Language = {
  val?: string
  eastAsia?: string
  bidi?: string
}

export type RunProperties = {
  /** w:rPr as written, for the properties the model does not cover. */
  source?: ElementSource
  rFonts?: RunFonts
  b?: boolean
  bCs?: boolean
  i?: boolean
  iCs?: boolean
  caps?: boolean
  smallCaps?: boolean
  strike?: boolean
  dstrike?: boolean
  emboss?: boolean
  imprint?: boolean
  outline?: boolean
  shadow?: boolean
  noProof?: boolean
  vanish?: boolean
  color?: string
  spacing?: number
  w?: number
  kern?: number
  position?: number
  sz?: number
  szCs?: number
  highlight?: HighlightValue
  u?: Underline
  /** The box round the text (Borders and Shading > Apply to Text). */
  bdr?: Border
  /** The text's shading: fill and pattern. */
  shd?: Shading
  vertAlign?: VerticalAlign
  rStyle?: string
  lang?: Language
  /** Previous run properties, kept when a tracked formatting change is present. */
  rPrChange?: RunPropertyChange
}

export type RevisionMark = {
  id: number
  author?: string
  date?: string
}

export type RunPropertyChange = RevisionMark & { rPr: RunProperties }

export type Spacing = {
  before?: number
  after?: number
  line?: number
  lineRule?: LineRule
}

export type Indent = {
  left?: number
  right?: number
  hanging?: number
  firstLine?: number
}

export type NumberingRef = {
  ilvl?: number
  numId?: number
}

export type TabStop = { val: TabAlign; leader?: TabLeader; pos: number }

export type TightWrap = "none" | "allLines" | "firstAndLastLine" | "firstLineOnly" | "lastLineOnly"

export type ParagraphBorders = { top?: Border; left?: Border; bottom?: Border; right?: Border }

export type ParagraphProperties = {
  /** w:pPr as written (with pStyle, the mark's rPr, and sectPr when on a paragraph). */
  source?: ElementSource
  keepNext?: boolean
  keepLines?: boolean
  pageBreakBefore?: boolean
  widowControl?: boolean
  numPr?: NumberingRef
  tabs?: TabStop[]
  spacing?: Spacing
  ind?: Indent
  jc?: JcValue
  outlineLvl?: number
  /** w:suppressLineNumbers, w:suppressAutoHyphens, w:mirrorIndents (22.8). */
  suppressLineNumbers?: boolean
  suppressAutoHyphens?: boolean
  mirrorIndents?: boolean
  /** w:textboxTightWrap: how text in a text box wraps tightly around a shape. */
  textboxTightWrap?: TightWrap
  /** w:pBdr: the lines around the paragraph (21.30). */
  borders?: ParagraphBorders
  /** w:shd: the paragraph's fill. */
  shading?: Shading
  /** No space before or after when the neighbouring paragraph has the same style. */
  contextualSpacing?: boolean
}

/** How a section numbers its lines: every `countBy`th from `start`, `distance` twips from the text. */
export type LineNumbering = {
  countBy?: number
  start?: number
  distance?: number
  restart?: "continuous" | "newPage" | "newSection"
}

/** w:pgBorders: the section's page border, the pages that show it and what its distances are measured from. */
export type PageBorders = {
  display?: "allPages" | "firstPage" | "notFirstPage"
  offsetFrom?: "page" | "text"
  zOrder?: "front" | "back"
  top?: Border
  left?: Border
  bottom?: Border
  right?: Border
}

export type SectionProps = {
  /** w:sectPr as written. */
  source?: ElementSource
  type?: SectionType
  pageWidth?: number
  pageHeight?: number
  orient?: PageOrientation
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  header?: number
  footer?: number
  gutter?: number
  columnCount?: number
  columnSpace?: number
  /** w:cols/@w:sep: a line between the columns. */
  columnSeparator?: boolean
  titlePg?: boolean
  linePitch?: number
  /** w:lnNumType: the section's line numbers (21.37). */
  lineNumbers?: LineNumbering
  /** w:pgBorders (22.4). */
  pageBorders?: PageBorders
  /** Header and footer parts, in the order Word wrote the references. */
  references?: HeaderFooterRef[]
}

/** A4 defaults Word writes when a body has no sectPr (w01, w02). */
export const DEFAULT_SECTION: SectionProps = {
  pageWidth: 11906,
  pageHeight: 16838,
  marginTop: 1440,
  marginRight: 1440,
  marginBottom: 1440,
  marginLeft: 1440,
  header: 708,
  footer: 708,
  gutter: 0,
  columnSpace: 708,
  linePitch: 360,
}

export const NOTE_TYPES = ["separator", "continuationSeparator", "continuationNotice"] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export type RunContent =
  | { kind: "text"; text: string }
  | { kind: "delText"; text: string }
  | { kind: "tab" }
  | { kind: "break"; breakType: BreakType }
  | { kind: "instrText"; text: string }
  | { kind: "fldChar"; fieldType: FieldCharType }
  | { kind: "footnoteReference"; id: number }
  | { kind: "endnoteReference"; id: number }
  | { kind: "footnoteRef" }
  | { kind: "endnoteRef" }
  | { kind: "separator" }
  | { kind: "continuationSeparator" }
  | { kind: "commentReference"; id: number }
  | { kind: "annotationRef" }
  /** Run content the model does not cover (w:sym, w:object, w:noBreakHyphen, …), kept as written. */
  | { kind: "raw"; xml: string; text: string }
  | {
      kind: "drawing"
      /** Original w:drawing, w:pict, or mc:AlternateContent, written back unchanged. */
      xml: string
      /** Text from the wps Choice. The VML fallback is not included. */
      text: string
      floating?: boolean
      /** Where a floating drawing (wp:anchor) sits and how the text wraps around it. */
      layout?: DrawingLayout
      relId?: string
      name?: string
      cx?: number
      cy?: number
      /** a:xfrm rot, the turn clockwise in 60000ths of a degree. */
      rot?: number
      /** a:srcRect: how much of each side of the picture is cropped away, in 1000ths of a percent. */
      crop?: { l: number; t: number; r: number; b: number }
      /** An object the app saved as its picture (a shape, chart, 3D model…): its editor node, base64 JSON. */
      object?: string
    }

/** One axis of a wp:anchor position: an offset in EMU or an alignment, measured from `from`. */
export type AnchorAxis = { from: string; offset?: number; align?: string }

export type DrawingLayout = {
  wrap: "none" | "square" | "tight" | "through" | "topBottom"
  behind: boolean
  h: AnchorAxis
  v: AnchorAxis
  z?: number
  /** The wrap element's wrapText: bothSides, left, right or largest. */
  wrapText?: string
  /** distT, distB, distL and distR on wp:anchor, in EMU. */
  dist?: { t: number; b: number; l: number; r: number }
  allowOverlap?: boolean
  locked?: boolean
}

export type Run = {
  kind: "run"
  rsidR?: string
  rPr: RunProperties
  content: RunContent[]
  /** Editor anchor (data-docx-run) linking this run to the one it was opened from. Never written. */
  key?: string
}

export type BookmarkStart = { kind: "bookmarkStart"; id: number; name: string }
export type BookmarkEnd = { kind: "bookmarkEnd"; id: number }
export type SimpleField = { kind: "simpleField"; instr: string; inlines: Inline[] }
export type Hyperlink = {
  kind: "hyperlink"
  relId?: string
  /** External target. Present when the relationship resolved. */
  target?: string
  anchor?: string
  history?: boolean
  inlines: Inline[]
}
export type CommentRangeStart = { kind: "commentRangeStart"; id: number }
export type CommentRangeEnd = { kind: "commentRangeEnd"; id: number }
export type Revision = RevisionMark & { kind: "ins" | "del"; inlines: Inline[] }
/** Content control, equation, or other markup kept as the original XML. */
export type RawMarkup = {
  kind: "raw"
  xml: string
  text: string
  /**
   * A table of contents control's content as read. A control written with an empty w:sdtContent is filled with
   * these blocks.
   */
  blocks?: Block[]
}
export type Inline =
  | Run
  | BookmarkStart
  | BookmarkEnd
  | SimpleField
  | Hyperlink
  | CommentRangeStart
  | CommentRangeEnd
  | Revision
  | RawMarkup

export type Paragraph = {
  kind: "paragraph"
  paraId?: string
  textId?: string
  rsidR?: string
  rsidRPr?: string
  rsidP?: string
  styleId?: string
  pPr: ParagraphProperties
  /** Present when this paragraph ends a section that is not the last one. */
  sectionBreak?: SectionProps
  markRPr: RunProperties
  inlines: Inline[]
  /** Editor anchor (data-docx) linking this paragraph to the one it was opened from. Never written. */
  key?: string
}

export const BORDER_VALUES = [
  "nil",
  "none",
  "single",
  "thick",
  "double",
  "dotted",
  "dashed",
  "dotDash",
  "dotDotDash",
  "triple",
  "thinThickSmallGap",
  "thickThinSmallGap",
  "thinThickThinSmallGap",
  "thinThickMediumGap",
  "thickThinMediumGap",
  "thinThickThinMediumGap",
  "thinThickLargeGap",
  "thickThinLargeGap",
  "thinThickThinLargeGap",
  "wave",
  "doubleWave",
  "dashSmallGap",
  "dashDotStroked",
  "threeDEmboss",
  "threeDEngrave",
  "outset",
  "inset",
] as const

export const SHADING_VALUES = [
  "nil",
  "clear",
  "solid",
  "horzStripe",
  "vertStripe",
  "reverseDiagStripe",
  "diagStripe",
  "horzCross",
  "diagCross",
  "thinHorzStripe",
  "thinVertStripe",
  "thinReverseDiagStripe",
  "thinDiagStripe",
  "thinHorzCross",
  "thinDiagCross",
  "pct5",
  "pct10",
  "pct12",
  "pct15",
  "pct20",
  "pct25",
  "pct30",
  "pct35",
  "pct37",
  "pct40",
  "pct45",
  "pct50",
  "pct55",
  "pct60",
  "pct62",
  "pct65",
  "pct70",
  "pct75",
  "pct80",
  "pct85",
  "pct87",
  "pct90",
  "pct95",
] as const

export const NUMBER_FORMATS = [
  "decimal",
  "upperRoman",
  "lowerRoman",
  "upperLetter",
  "lowerLetter",
  "ordinal",
  "cardinalText",
  "ordinalText",
  "hex",
  "bullet",
  "decimalZero",
  "none",
  "numberInDash",
] as const

export const MULTI_LEVEL_TYPES = ["singleLevel", "multilevel", "hybridMultilevel"] as const
export const TABLE_LAYOUTS = ["fixed", "autofit"] as const
export const MERGE_VALUES = ["restart", "continue"] as const

export type BorderValue = (typeof BORDER_VALUES)[number]
export type ShadingValue = (typeof SHADING_VALUES)[number]
export type NumberFormat = (typeof NUMBER_FORMATS)[number]
export type MultiLevelType = (typeof MULTI_LEVEL_TYPES)[number]
export type TableLayout = (typeof TABLE_LAYOUTS)[number]
export type MergeValue = (typeof MERGE_VALUES)[number]

/** One w:top / w:bottom … border: its line, width in eighths of a point, gap in points, colour, and Word's shadow. */
export type Border = { value: BorderValue; sz?: number; space?: number; color?: string; shadow?: boolean }
export type TableBorders = {
  top?: Border
  left?: Border
  bottom?: Border
  right?: Border
  insideH?: Border
  insideV?: Border
  /** A cell's diagonal lines, top-left to bottom-right and top-right to bottom-left. */
  tl2br?: Border
  tr2bl?: Border
}
export type TableLook = {
  val?: string
  firstRow?: boolean
  lastRow?: boolean
  firstColumn?: boolean
  lastColumn?: boolean
  noHBand?: boolean
  noVBand?: boolean
}
export type CellMargin = { value: number; type: TableWidthType }
export type CellMargins = { top?: CellMargin; left?: CellMargin; bottom?: CellMargin; right?: CellMargin }
export type Shading = { value: ShadingValue; color?: string; fill?: string }
export type TableWidth = { value: number; type: TableWidthType }
/** How cells look beyond their shading. Shown in the editor; saving writes w:tcPr from its source. */
export type CellLook = { borders?: TableBorders; margins?: CellMargins; vAlign?: "top" | "center" | "bottom" }

/** One part of a table style: the whole table, or a conditional part such as the header row. */
export type TableStylePart = {
  pPr: ParagraphProperties
  rPr: RunProperties
  shading?: Shading
  /** w:tblBorders (whole table) or w:tcBorders (conditional parts). */
  borders?: TableBorders
  margins?: CellMargins
  vAlign?: CellLook["vAlign"]
}
export const TABLE_CONDITIONS = [
  "band1Vert",
  "band2Vert",
  "band1Horz",
  "band2Horz",
  "firstCol",
  "lastCol",
  "firstRow",
  "lastRow",
  "neCell",
  "nwCell",
  "seCell",
  "swCell",
] as const
export type TableCondition = (typeof TABLE_CONDITIONS)[number]
/** A table style's formatting, read for display. */
export type TableStyleFormat = {
  whole: TableStylePart
  conditions: Partial<Record<TableCondition, TableStylePart>>
}

export type TableCell = {
  /** Paragraphs, nested tables, and block content controls, in order. */
  blocks: Block[]
  width?: TableWidth
  gridSpan?: number
  vMerge?: MergeValue
  shading?: Shading
  look?: CellLook
  /** w:tcPr as written. */
  source?: ElementSource
}
export type TableRow = {
  header?: boolean
  /** w:trHeight: twips, and whether the row may grow past it (atLeast, the default) or not (exact). */
  height?: { value: number; rule?: "atLeast" | "exact" }
  cellMargins?: CellMargins
  cells: TableCell[]
  /** w:trPr as written. */
  source?: ElementSource
  /** w:tblPrEx as written. */
  exceptionSource?: ElementSource
}
export type Table = {
  kind: "table"
  /** w:tblStyle. */
  styleId?: string
  /** w:tblPr as written. */
  source?: ElementSource
  width?: TableWidth
  borders?: TableBorders
  layout?: TableLayout
  look?: TableLook
  /** w:jc: where a table narrower than the text sits. */
  align?: "left" | "center" | "right"
  /** w:tblCaption and w:tblDescription: the table's alt text. */
  caption?: string
  description?: string
  /** w:tblCellMar, shown in the editor; saving writes w:tblPr from its source. */
  cellMargins?: CellMargins
  grid: number[]
  rows: TableRow[]
  /** Editor anchor (data-docx) linking this table to the one it was opened from. Never written. */
  key?: string
}
export type Block = Paragraph | Table | RawMarkup

export type HeaderFooterRef = {
  kind: "header" | "footer"
  type: HeaderFooterType
  relId: string
  partName?: string
  rootAttributes?: RootAttribute[]
  blocks: Block[]
  links?: PartLinks
}

/**
 * A story part's own relationships other than hyperlinks (pictures, embedded objects), with the parts they
 * point at. Hyperlinks are modelled on the inline and written per part.
 */
export type PartLinks = {
  relationships: SavedRelationship[]
  parts: SavedPart[]
}

export type NumberingLevel = {
  ilvl: number
  start?: number
  format?: NumberFormat
  text?: string
  justify?: JcValue
  pPr: ParagraphProperties
  rPr: RunProperties
}
export type AbstractNumbering = {
  id: number
  restartAfterBreak?: boolean
  nsid?: string
  multiLevelType?: MultiLevelType
  tmpl?: string
  levels: NumberingLevel[]
}
export type NumberingInstance = { id: number; abstractNumId: number; durableId?: string }
export type NumberingDefinitions = {
  abstracts: AbstractNumbering[]
  instances: NumberingInstance[]
  /** Root declarations of a Transitional numbering.xml, written back unchanged. */
  rootAttributes?: RootAttribute[]
}

/** Declarations on the document root, kept so a Word file's namespaces survive a save. */
export type RootAttribute = { prefix: string; local: string; value: string }

export type Style = {
  id: string
  type: StyleType
  default?: boolean
  name?: string
  basedOn?: string
  next?: string
  link?: string
  pPr: ParagraphProperties
  rPr: RunProperties
  /** Borders, shading, and conditional formatting of a table style. */
  table?: TableStyleFormat
  /** The w:style element as read. Written back as-is while the modelled fields still match `model`. */
  raw?: SourceMarkup
}

export type StyleCatalog = {
  docDefaults: { pPr: ParagraphProperties; rPr: RunProperties }
  styles: Style[]
  /**
   * Every child of w:styles as written (latentStyles, docDefaults, styles), in source order, with the root's
   * namespace declarations, plus a fingerprint of docDefaults as read.
   */
  raw?: { rootAttributes: RootAttribute[]; children: { name: string; xml: string }[]; docDefaults: string }
}

/** Source markup plus a fingerprint of the model it was read into. */
export type SourceMarkup = { xml: string; model: string }

/** Fingerprint of a style's modelled fields, used to tell whether the source markup is still accurate. */
export function styleFingerprint(style: Style) {
  return JSON.stringify({ ...style, raw: undefined })
}

export function docDefaultsFingerprint(catalog: StyleCatalog) {
  return JSON.stringify(catalog.docDefaults)
}

export type Settings = {
  /** Stored value. Null means the element was absent; Word treats that as mode 12. */
  compatibilityMode: number | null
  rsidRoot?: string
  rsids: string[]
  defaultTabStop?: number
  /** Different odd and even pages. Absent means the element was not in settings. */
  evenAndOddHeaders?: boolean
  /** Separator note ids listed in w:footnotePr, including -1 and 0. */
  footnotePr?: number[]
  /** Separator note ids listed in w:endnotePr. */
  endnotePr?: number[]
  /**
   * Every child of w:settings as written, in source order, with the root's namespace declarations.
   * The writer swaps in the modelled elements and keeps the rest (zoom, compat flags, themeFontLang…) as they were.
   */
  raw?: { rootAttributes: RootAttribute[]; children: { name: string; xml: string }[] }
}

export type Note = {
  id: number
  type?: NoteType
  blocks: Block[]
}

export type NotePart = {
  relId?: string
  rootAttributes?: RootAttribute[]
  items: Note[]
  links?: PartLinks
}

export type Comment = {
  id: number
  author?: string
  date?: string
  initials?: string
  blocks: Block[]
}

export type CommentEx = {
  paraId: string
  parentParaId?: string
  done?: boolean
}

export type CommentId = {
  paraId: string
  durableId: string
}

export type CommentExtensible = {
  durableId: string
  dateUtc?: string
}

export type CommentPart = {
  relId?: string
  rootAttributes?: RootAttribute[]
  items: Comment[]
  links?: PartLinks
  extended?: CommentEx[]
  extendedRelId?: string
  extendedRoot?: RootAttribute[]
  ids?: CommentId[]
  idsRelId?: string
  idsRoot?: RootAttribute[]
  extensible?: CommentExtensible[]
  extensibleRelId?: string
  extensibleRoot?: RootAttribute[]
}

export type Person = {
  author: string
  providerId?: string
  userId?: string
}

export type PeoplePart = {
  relId?: string
  rootAttributes?: RootAttribute[]
  items: Person[]
}

export type WordNote = { code: string; message: string }

export type SavedPart = {
  name: string
  contentType: string
  data: Uint8Array
}

export type SavedRelationship = {
  id: string
  type: string
  target: string
  targetMode: "Internal" | "External"
  partName: string | null
}

export type MediaPart = SavedPart & {
  relId: string
  type: string
  target: string
  /** Parts this part points at with its own relationships: a chart's embedded workbook. */
  related?: MediaPart[]
}

/** Glossary sub-package copied as opaque parts, including its own relationships. */
export type GlossaryPackage = {
  relId: string
  type: string
  target: string
  partName: string
  parts: SavedPart[]
  relationships: { source: string; items: SavedRelationship[] }[]
}

export type WordDocument = {
  blocks: Block[]
  /** Null when w:body has no sectPr. */
  section: SectionProps | null
  styles: StyleCatalog
  numbering: NumberingDefinitions
  settings: Settings
  /** Present when the document was read from WordprocessingML. */
  rootAttributes?: RootAttribute[]
  footnotes?: NotePart
  endnotes?: NotePart
  comments?: CommentPart
  people?: PeoplePart
  media?: MediaPart[]
  glossary?: GlossaryPackage
  /** Parts Word keeps but this reader does not interpret, with the relationships that point at them. */
  preserved?: PreservedPackage
  notes: WordNote[]
}

export type PreservedPackage = {
  parts: SavedPart[]
  relationships: { source: string; items: SavedRelationship[] }[]
}

export function effectiveCompatibilityMode(settings: Settings) {
  return settings.compatibilityMode ?? 12
}

export function emptyNumbering(): NumberingDefinitions {
  return { abstracts: [], instances: [] }
}

export function numberingLevel(numbering: NumberingDefinitions, numId: number, ilvl: number) {
  const instance = numbering.instances.find((item) => item.id === numId)
  const abstract = numbering.abstracts.find((item) => item.id === instance?.abstractNumId)
  return abstract?.levels.find((level) => level.ilvl === ilvl)
}

/** U+F0B7 in the Symbol font is the bullet Word stores. Show it as •. */
export function numberingMarker(level: NumberingLevel) {
  if (level.text === "\uF0B7") {
    return "•"
  }
  return level.text ?? ""
}

export function emptyParagraph(): Paragraph {
  return { kind: "paragraph", pPr: {}, markRPr: {}, inlines: [] }
}

/** Every table, including tables nested in cells, outermost first. */
export function tablesIn(blocks: Block[]): Table[] {
  const tables: Table[] = []
  for (const block of blocks) {
    if (block.kind === "table") {
      tables.push(block, ...block.rows.flatMap((row) => row.cells.flatMap((cell) => tablesIn(cell.blocks))))
    }
  }
  return tables
}

export function paragraphsIn(blocks: Block[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const block of blocks) {
    if (block.kind === "paragraph") {
      paragraphs.push(block)
      continue
    }
    if (block.kind !== "table") {
      continue
    }
    for (const row of block.rows) {
      for (const cell of row.cells) {
        paragraphs.push(...paragraphsIn(cell.blocks))
      }
    }
  }
  return paragraphs
}

export function paragraphText(paragraph: Paragraph) {
  return inlineText(paragraph.inlines)
}

function inlineText(inlines: Inline[]): string {
  let text = ""
  for (const inline of inlines) {
    if (
      inline.kind === "simpleField" ||
      inline.kind === "hyperlink" ||
      inline.kind === "ins" ||
      inline.kind === "del"
    ) {
      text += inlineText(inline.inlines)
      continue
    }
    if (inline.kind === "raw") {
      text += inline.text
      continue
    }
    if (inline.kind !== "run") {
      continue
    }
    for (const content of inline.content) {
      if (content.kind === "text" || content.kind === "delText" || content.kind === "drawing") {
        text += content.text
      }
    }
  }
  return text
}

export function tableGrid(table: Pick<Table, "grid" | "rows">, section: SectionProps | null) {
  if (table.grid.length > 0) {
    return table.grid
  }
  const counts = table.rows.map((row) => row.cells.length)
  const columns = Math.max(1, ...counts)
  const width = contentWidth(section)
  const base = Math.floor(width / columns)
  const grid = Array.from({ length: columns }, () => base)
  grid[columns - 1] += width - base * columns
  return grid
}

export function resolveRunProperties(input: {
  styles: StyleCatalog
  paragraphStyleId?: string
  characterStyleId?: string
  direct?: RunProperties
  table?: RunProperties
  numbering?: RunProperties
}): RunProperties {
  let result = applyRunLayer({}, input.styles.docDefaults.rPr, "absolute")
  if (input.table) {
    result = applyRunLayer(result, input.table, "style")
  }
  if (input.numbering) {
    result = applyRunLayer(result, input.numbering, "style")
  }
  for (const style of styleChain(input.styles.styles, input.paragraphStyleId, "paragraph")) {
    result = applyRunLayer(result, style.rPr, "style")
  }
  for (const style of styleChain(input.styles.styles, input.characterStyleId, "character")) {
    result = applyRunLayer(result, style.rPr, "style")
  }
  if (input.direct) {
    result = applyRunLayer(result, input.direct, "absolute")
  }
  return compactRun(result)
}

export function resolveParagraphProperties(input: {
  styles: StyleCatalog
  paragraphStyleId?: string
  direct?: ParagraphProperties
  table?: ParagraphProperties
  numbering?: ParagraphProperties
}): ParagraphProperties {
  let result = compactParagraph(input.styles.docDefaults.pPr)
  if (input.table) {
    result = mergeParagraph(result, input.table)
  }
  if (input.numbering) {
    result = mergeParagraph(result, input.numbering)
  }
  for (const style of styleChain(input.styles.styles, input.paragraphStyleId, "paragraph")) {
    result = mergeParagraph(result, style.pPr)
  }
  if (input.direct) {
    result = mergeParagraph(result, input.direct)
  }
  return compactParagraph(result)
}

export function sameRunProperties(left: RunProperties, right: RunProperties) {
  return JSON.stringify(compactRun(left)) === JSON.stringify(compactRun(right))
}

function contentWidth(section: SectionProps | null) {
  if (!section) {
    return DEFAULT_SECTION.pageWidth! - DEFAULT_SECTION.marginLeft! - DEFAULT_SECTION.marginRight!
  }
  const width = section.pageWidth ?? DEFAULT_SECTION.pageWidth!
  const content = width - (section.marginLeft ?? 0) - (section.marginRight ?? 0)
  return content > 0 ? content : width
}

function styleChain(styles: Style[], id: string | undefined, type: StyleType) {
  const byId = new Map(styles.map((style) => [style.id, style]))
  const found: Style[] = []
  const seen = new Set<string>()
  let current = id ? byId.get(id) : undefined
  while (current && current.type === type && !seen.has(current.id)) {
    seen.add(current.id)
    found.push(current)
    current = current.basedOn ? byId.get(current.basedOn) : undefined
  }
  return found.reverse()
}

function applyRunLayer(base: RunProperties, next: RunProperties, mode: "absolute" | "style"): RunProperties {
  return {
    rFonts: mergeFonts(base.rFonts, next.rFonts),
    b: applyToggle(base.b, next.b, mode),
    bCs: applyToggle(base.bCs, next.bCs, mode),
    i: applyToggle(base.i, next.i, mode),
    iCs: applyToggle(base.iCs, next.iCs, mode),
    caps: applyToggle(base.caps, next.caps, mode),
    smallCaps: applyToggle(base.smallCaps, next.smallCaps, mode),
    strike: applyToggle(base.strike, next.strike, mode),
    dstrike: applyToggle(base.dstrike, next.dstrike, mode),
    emboss: applyToggle(base.emboss, next.emboss, mode),
    imprint: applyToggle(base.imprint, next.imprint, mode),
    outline: applyToggle(base.outline, next.outline, mode),
    shadow: applyToggle(base.shadow, next.shadow, mode),
    noProof: next.noProof ?? base.noProof,
    vanish: applyToggle(base.vanish, next.vanish, mode),
    color: next.color ?? base.color,
    spacing: next.spacing ?? base.spacing,
    w: next.w ?? base.w,
    kern: next.kern ?? base.kern,
    position: next.position ?? base.position,
    sz: next.sz ?? base.sz,
    szCs: next.szCs ?? base.szCs,
    highlight: next.highlight ?? base.highlight,
    u: next.u ?? base.u,
    vertAlign: next.vertAlign ?? base.vertAlign,
    lang: mergeLanguage(base.lang, next.lang),
  }
}

function applyToggle(current: boolean | undefined, specified: boolean | undefined, mode: "absolute" | "style") {
  if (specified === undefined) {
    return current
  }
  if (mode === "absolute") {
    return specified
  }
  return specified ? !current : false
}

function mergeFonts(base: RunFonts | undefined, next: RunFonts | undefined): RunFonts | undefined {
  if (!next) {
    return base
  }
  return {
    ascii: next.ascii ?? base?.ascii,
    hAnsi: next.hAnsi ?? base?.hAnsi,
    cs: next.cs ?? base?.cs,
    eastAsia: next.eastAsia ?? base?.eastAsia,
    hint: next.hint ?? base?.hint,
    asciiTheme: next.asciiTheme ?? base?.asciiTheme,
    hAnsiTheme: next.hAnsiTheme ?? base?.hAnsiTheme,
    eastAsiaTheme: next.eastAsiaTheme ?? base?.eastAsiaTheme,
    csTheme: next.csTheme ?? base?.csTheme,
  }
}

function mergeLanguage(base: Language | undefined, next: Language | undefined): Language | undefined {
  if (!next) {
    return base
  }
  return {
    val: next.val ?? base?.val,
    eastAsia: next.eastAsia ?? base?.eastAsia,
    bidi: next.bidi ?? base?.bidi,
  }
}

function compactRun(props: RunProperties): RunProperties {
  const result: RunProperties = {}
  const fonts = compactFonts(props.rFonts)
  if (fonts) {
    result.rFonts = fonts
  }
  assignToggle(result, "b", props.b)
  assignToggle(result, "bCs", props.bCs)
  assignToggle(result, "i", props.i)
  assignToggle(result, "iCs", props.iCs)
  assignToggle(result, "caps", props.caps)
  assignToggle(result, "smallCaps", props.smallCaps)
  assignToggle(result, "strike", props.strike)
  assignToggle(result, "dstrike", props.dstrike)
  assignToggle(result, "emboss", props.emboss)
  assignToggle(result, "imprint", props.imprint)
  assignToggle(result, "outline", props.outline)
  assignToggle(result, "shadow", props.shadow)
  if (props.noProof !== undefined) {
    result.noProof = props.noProof
  }
  assignToggle(result, "vanish", props.vanish)
  if (props.color !== undefined) {
    result.color = props.color
  }
  if (props.spacing !== undefined) {
    result.spacing = props.spacing
  }
  if (props.w !== undefined) {
    result.w = props.w
  }
  if (props.kern !== undefined) {
    result.kern = props.kern
  }
  if (props.position !== undefined) {
    result.position = props.position
  }
  if (props.sz !== undefined) {
    result.sz = props.sz
  }
  if (props.szCs !== undefined) {
    result.szCs = props.szCs
  }
  if (props.highlight !== undefined) {
    result.highlight = props.highlight
  }
  if (props.u) {
    result.u = props.u.color ? { value: props.u.value, color: props.u.color } : { value: props.u.value }
  }
  if (props.vertAlign !== undefined) {
    result.vertAlign = props.vertAlign
  }
  const lang = compactLanguage(props.lang)
  if (lang) {
    result.lang = lang
  }
  return result
}

function assignToggle(result: RunProperties, key: ToggleProperty, value: boolean | undefined) {
  if (value !== undefined) {
    result[key] = value
  }
}

function compactFonts(fonts: RunFonts | undefined): RunFonts | undefined {
  if (!fonts) {
    return undefined
  }
  const result: RunFonts = {}
  if (fonts.ascii) {
    result.ascii = fonts.ascii
  }
  if (fonts.hAnsi) {
    result.hAnsi = fonts.hAnsi
  }
  if (fonts.cs) {
    result.cs = fonts.cs
  }
  if (fonts.eastAsia) {
    result.eastAsia = fonts.eastAsia
  }
  if (fonts.hint) {
    result.hint = fonts.hint
  }
  if (fonts.asciiTheme) {
    result.asciiTheme = fonts.asciiTheme
  }
  if (fonts.hAnsiTheme) {
    result.hAnsiTheme = fonts.hAnsiTheme
  }
  if (fonts.eastAsiaTheme) {
    result.eastAsiaTheme = fonts.eastAsiaTheme
  }
  if (fonts.csTheme) {
    result.csTheme = fonts.csTheme
  }
  return result.ascii ||
    result.hAnsi ||
    result.cs ||
    result.eastAsia ||
    result.hint ||
    result.asciiTheme ||
    result.hAnsiTheme ||
    result.eastAsiaTheme ||
    result.csTheme
    ? result
    : undefined
}

function compactLanguage(lang: Language | undefined): Language | undefined {
  if (!lang) {
    return undefined
  }
  const result: Language = {}
  if (lang.val) {
    result.val = lang.val
  }
  if (lang.eastAsia) {
    result.eastAsia = lang.eastAsia
  }
  if (lang.bidi) {
    result.bidi = lang.bidi
  }
  return result.val || result.eastAsia || result.bidi ? result : undefined
}

function mergeParagraph(base: ParagraphProperties, next: ParagraphProperties): ParagraphProperties {
  return compactParagraph({
    keepNext: next.keepNext ?? base.keepNext,
    keepLines: next.keepLines ?? base.keepLines,
    pageBreakBefore: next.pageBreakBefore ?? base.pageBreakBefore,
    widowControl: next.widowControl ?? base.widowControl,
    numPr: mergeNumbering(base.numPr, next.numPr),
    spacing: mergeSpacing(base.spacing, next.spacing),
    ind: mergeIndent(base.ind, next.ind),
    jc: next.jc ?? base.jc,
    outlineLvl: next.outlineLvl ?? base.outlineLvl,
    contextualSpacing: next.contextualSpacing ?? base.contextualSpacing,
  })
}

function compactParagraph(props: ParagraphProperties): ParagraphProperties {
  const result: ParagraphProperties = {}
  if (props.keepNext !== undefined) {
    result.keepNext = props.keepNext
  }
  if (props.keepLines !== undefined) {
    result.keepLines = props.keepLines
  }
  if (props.pageBreakBefore !== undefined) {
    result.pageBreakBefore = props.pageBreakBefore
  }
  if (props.widowControl !== undefined) {
    result.widowControl = props.widowControl
  }
  if (props.numPr && (props.numPr.ilvl !== undefined || props.numPr.numId !== undefined)) {
    const numPr: NumberingRef = {}
    if (props.numPr.ilvl !== undefined) {
      numPr.ilvl = props.numPr.ilvl
    }
    if (props.numPr.numId !== undefined) {
      numPr.numId = props.numPr.numId
    }
    result.numPr = numPr
  }
  if (props.spacing && hasSpacing(props.spacing)) {
    result.spacing = props.spacing
  }
  if (props.ind && hasIndent(props.ind)) {
    result.ind = props.ind
  }
  if (props.jc !== undefined) {
    result.jc = props.jc
  }
  if (props.outlineLvl !== undefined) {
    result.outlineLvl = props.outlineLvl
  }
  if (props.contextualSpacing !== undefined) {
    result.contextualSpacing = props.contextualSpacing
  }
  return result
}

function mergeNumbering(base: NumberingRef | undefined, next: NumberingRef | undefined) {
  if (!next) {
    return base
  }
  return { ilvl: next.ilvl ?? base?.ilvl, numId: next.numId ?? base?.numId }
}

function mergeSpacing(base: Spacing | undefined, next: Spacing | undefined) {
  if (!next) {
    return base
  }
  return {
    before: next.before ?? base?.before,
    after: next.after ?? base?.after,
    line: next.line ?? base?.line,
    lineRule: next.lineRule ?? base?.lineRule,
  }
}

function mergeIndent(base: Indent | undefined, next: Indent | undefined) {
  if (!next) {
    return base
  }
  return {
    left: next.left ?? base?.left,
    right: next.right ?? base?.right,
    hanging: next.hanging ?? base?.hanging,
    firstLine: next.firstLine ?? base?.firstLine,
  }
}

function hasSpacing(spacing: Spacing) {
  return (
    spacing.before !== undefined ||
    spacing.after !== undefined ||
    spacing.line !== undefined ||
    spacing.lineRule !== undefined
  )
}

function hasIndent(indent: Indent) {
  return (
    indent.left !== undefined ||
    indent.right !== undefined ||
    indent.hanging !== undefined ||
    indent.firstLine !== undefined
  )
}

/*
 * What each property element is generated from. The reader snapshots these and the writer compares against them,
 * so both must build the same shape (see element-source.ts).
 */
export function paragraphPropertiesInput(paragraph: Paragraph) {
  return {
    styleId: paragraph.styleId,
    pPr: paragraph.pPr,
    markRPr: paragraph.markRPr,
    sectionBreak: paragraph.sectionBreak,
  }
}

export function tablePropertiesInput(table: Table) {
  return {
    styleId: table.styleId,
    width: table.width,
    borders: table.borders,
    layout: table.layout,
    look: table.look,
    align: table.align,
    caption: table.caption,
    description: table.description,
  }
}

export function rowPropertiesInput(row: TableRow) {
  return { header: row.header, height: row.height }
}

export function rowExceptionsInput(row: TableRow) {
  return { cellMargins: row.cellMargins }
}

export function cellPropertiesInput(cell: TableCell) {
  return {
    width: cell.width,
    gridSpan: cell.gridSpan,
    vMerge: cell.vMerge,
    borders: cell.look?.borders,
    shading: cell.shading,
    vAlign: cell.look?.vAlign,
  }
}
