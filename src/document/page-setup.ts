import { useViewStore } from "@/document/view"

export type PaperSize = "letter" | "a4" | "legal"
export type PageOrientation = "portrait" | "landscape"
export type ColumnCount = 1 | 2 | 3
export type PageBorder = "none" | "single" | "double"
export type BorderLine = "solid" | "dashed" | "dotted" | "groove" | "ridge"
/** Which pages of the section show the page border (Borders and Shading > Page Border > Apply to). */
export type BorderDisplay = "all" | "first" | "not-first"
/** What the page border's distances are measured from (Page Border > Options… > Measure from). */
export type BorderFrom = "page" | "text"
export type PageSide = "top" | "right" | "bottom" | "left"
export const PAGE_SIDES: PageSide[] = ["top", "right", "bottom", "left"]
export type PageNumberPlace = "none" | "bottom-center" | "bottom-right" | "top-center" | "top-right"
export type SpacingPreset = "default" | "none" | "compact" | "tight" | "open" | "relaxed" | "double"
export type EffectPreset = "" | "office" | "subtle" | "moderate" | "intense"
export type BuiltInHeader = "blank" | "columns" | "austin" | "banded" | "facet"
export type GutterPosition = "left" | "right" | "top"
export type MultiplePages = "normal" | "mirror" | "2pages" | "book-fold"
export type SectionStart = "new-page" | "continuous" | "even" | "odd" | "new-column"
export type VerticalAlign = "top" | "center" | "justified" | "bottom"
export type PaperSource =
  "default" | "auto" | "printer-auto" | "tray" | "tray-1" | "manual" | "tray-2" | "tray-3" | "tray-4"

export type PageSetup = {
  paper: PaperSize
  orientation: PageOrientation
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  gutter: number
  gutterPosition: GutterPosition
  multiplePages: MultiplePages
  /** Custom paper width in mm; 0 uses the named paper size. */
  paperWidth: number
  /** Custom paper height in mm; 0 uses the named paper size. */
  paperHeight: number
  paperSourceFirst: PaperSource
  paperSourceOther: PaperSource
  sectionStart: SectionStart
  suppressEndnotes: boolean
  differentOddEven: boolean
  headerFromEdge: number
  footerFromEdge: number
  verticalAlign: VerticalAlign
  columns: ColumnCount
  columnGap: number
  /** A vertical line between the columns (Columns dialog: Line between). */
  columnLine: boolean
  lineNumbers: boolean
  /** When line numbers are on, restart numbering at the top of each page. */
  lineNumberRestart: "continuous" | "page"
  watermark: string
  border: PageBorder
  borderColor: string
  borderWidth: number
  borderLine: BorderLine
  borderDisplay: BorderDisplay
  borderFrom: BorderFrom
  /** The border's distance from the page edge or the text, in points: top, right, bottom, left. */
  borderSpace: number[]
  /** The sides of the page that have the border (Page Border's preview); all four unless some were clicked off. */
  borderSides: PageSide[]
  /**
   * Page Border > Options…: Always display in front (w:zOrder). Kept; the page draws its border under the text
   * either way.
   */
  borderInFront: boolean
  /** Options…: a border measured from the text reaches round the header and the footer. */
  borderSurroundHeader: boolean
  borderSurroundFooter: boolean
  /** Options…: Align paragraph borders and table edges with page border (kept; not drawn). */
  borderAlign: boolean
  pageColor: string
  pageNumber: PageNumberPlace
  hyphenation: boolean
  language: string
  bodyFont: string
  headingFont: string
  colorScheme: string
  effects: EffectPreset
  spacing: SpacingPreset
  headerStyle: BuiltInHeader
  footerStyle: BuiltInHeader
}

export type PageMetrics = {
  width: number
  height: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  contentHeight: number
}

const MM_TO_PX = 96 / 25.4
const MARGIN_MIN = 10
const MARGIN_MAX = 60

const PAPERS: Record<PaperSize, { width: number; height: number; label: string; detail: string }> = {
  letter: { width: 215.9, height: 279.4, label: "Letter", detail: "8.5 × 11 in" },
  a4: { width: 210, height: 297, label: "A4", detail: "210 × 297 mm" },
  legal: { width: 215.9, height: 355.6, label: "Legal", detail: "8.5 × 14 in" },
}

export const PAPER_SIZES = (Object.keys(PAPERS) as PaperSize[]).map((id) => ({
  id,
  label: PAPERS[id].label,
  detail: PAPERS[id].detail,
}))

export const MARGIN_PRESETS = [
  { id: "normal", label: "Normal", top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  { id: "narrow", label: "Narrow", top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  { id: "moderate", label: "Moderate", top: 25.4, right: 19.1, bottom: 25.4, left: 19.1 },
  { id: "wide", label: "Wide", top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
] as const

export const PAPER_SOURCES: { id: PaperSource; label: string }[] = [
  { id: "default", label: "Default tray (Printer auto select)" },
  { id: "auto", label: "Automatically Select" },
  { id: "printer-auto", label: "Printer auto select" },
  { id: "tray", label: "Tray" },
  { id: "tray-1", label: "Tray 1" },
  { id: "manual", label: "Manual Feed" },
  { id: "tray-2", label: "Tray 2" },
  { id: "tray-3", label: "Tray 3" },
  { id: "tray-4", label: "Tray 4" },
]

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: "letter",
  orientation: "portrait",
  marginTop: 25.4,
  marginRight: 25.4,
  marginBottom: 25.4,
  marginLeft: 25.4,
  gutter: 0,
  gutterPosition: "left",
  multiplePages: "normal",
  paperWidth: 0,
  paperHeight: 0,
  paperSourceFirst: "default",
  paperSourceOther: "default",
  sectionStart: "new-page",
  suppressEndnotes: false,
  differentOddEven: false,
  headerFromEdge: 12.5,
  footerFromEdge: 12.5,
  verticalAlign: "top",
  columns: 1,
  columnGap: 1.25,
  columnLine: false,
  lineNumbers: false,
  lineNumberRestart: "continuous",
  watermark: "",
  border: "none",
  borderColor: "#1c1c1c",
  borderWidth: 0.5,
  borderLine: "solid",
  // Word's own Options for a new page border: 24 pt in from the edge of the page.
  borderDisplay: "all",
  borderFrom: "page",
  borderSpace: [24, 24, 24, 24],
  borderSides: PAGE_SIDES,
  borderInFront: true,
  borderSurroundHeader: true,
  borderSurroundFooter: true,
  borderAlign: false,
  pageColor: "",
  // No page number until one is put in the header or footer (Insert > Page Number), as in Word.
  pageNumber: "none",
  hyphenation: false,
  language: "en-US",
  bodyFont: "",
  headingFont: "",
  colorScheme: "",
  effects: "",
  spacing: "default",
  headerStyle: "blank",
  footerStyle: "blank",
}

export const COLUMN_GAP_CM = 1.25
export const COLUMN_GAP = Math.round((COLUMN_GAP_CM * 96) / 2.54)
export const WATERMARK_LIMIT = 40

export function normalizePageSetup(setup: Partial<PageSetup> | null | undefined): PageSetup {
  return {
    ...DEFAULT_PAGE_SETUP,
    ...setup,
    gutter: clampNonNeg(setup?.gutter, DEFAULT_PAGE_SETUP.gutter),
    gutterPosition: gutterPosition(setup?.gutterPosition),
    multiplePages: multiplePages(setup?.multiplePages),
    paperWidth: clampNonNeg(setup?.paperWidth, 0),
    paperHeight: clampNonNeg(setup?.paperHeight, 0),
    paperSourceFirst: paperSource(setup?.paperSourceFirst),
    paperSourceOther: paperSource(setup?.paperSourceOther),
    sectionStart: sectionStart(setup?.sectionStart),
    suppressEndnotes: Boolean(setup?.suppressEndnotes),
    differentOddEven: Boolean(setup?.differentOddEven),
    headerFromEdge: clampNonNeg(setup?.headerFromEdge, DEFAULT_PAGE_SETUP.headerFromEdge),
    footerFromEdge: clampNonNeg(setup?.footerFromEdge, DEFAULT_PAGE_SETUP.footerFromEdge),
    verticalAlign: verticalAlign(setup?.verticalAlign),
    lineNumberRestart: setup?.lineNumberRestart === "page" ? "page" : "continuous",
    columnLine: Boolean(setup?.columnLine),
    borderDisplay: borderDisplay(setup?.borderDisplay),
    borderFrom: setup?.borderFrom === "text" ? "text" : "page",
    borderSpace: borderSpace(setup?.borderSpace) ?? DEFAULT_PAGE_SETUP.borderSpace,
    borderSides: pageSides(setup?.borderSides),
    borderInFront: setup?.borderInFront !== false,
    borderSurroundHeader: setup?.borderSurroundHeader !== false,
    borderSurroundFooter: setup?.borderSurroundFooter !== false,
    borderAlign: setup?.borderAlign === true,
  }
}

export function samePageSetup(left: PageSetup, right: PageSetup) {
  return (
    left.paper === right.paper &&
    left.orientation === right.orientation &&
    left.marginTop === right.marginTop &&
    left.marginRight === right.marginRight &&
    left.marginBottom === right.marginBottom &&
    left.marginLeft === right.marginLeft &&
    left.gutter === right.gutter &&
    left.gutterPosition === right.gutterPosition &&
    left.multiplePages === right.multiplePages &&
    left.paperWidth === right.paperWidth &&
    left.paperHeight === right.paperHeight &&
    left.paperSourceFirst === right.paperSourceFirst &&
    left.paperSourceOther === right.paperSourceOther &&
    left.sectionStart === right.sectionStart &&
    left.suppressEndnotes === right.suppressEndnotes &&
    left.differentOddEven === right.differentOddEven &&
    left.headerFromEdge === right.headerFromEdge &&
    left.footerFromEdge === right.footerFromEdge &&
    left.verticalAlign === right.verticalAlign &&
    left.columns === right.columns &&
    left.columnGap === right.columnGap &&
    left.columnLine === right.columnLine &&
    left.lineNumbers === right.lineNumbers &&
    left.lineNumberRestart === right.lineNumberRestart &&
    left.watermark === right.watermark &&
    left.border === right.border &&
    left.borderColor === right.borderColor &&
    left.borderWidth === right.borderWidth &&
    left.borderLine === right.borderLine &&
    left.borderDisplay === right.borderDisplay &&
    left.borderFrom === right.borderFrom &&
    left.borderSpace.join(" ") === right.borderSpace.join(" ") &&
    left.borderSides.join(" ") === right.borderSides.join(" ") &&
    left.borderInFront === right.borderInFront &&
    left.borderSurroundHeader === right.borderSurroundHeader &&
    left.borderSurroundFooter === right.borderSurroundFooter &&
    left.borderAlign === right.borderAlign &&
    left.pageColor === right.pageColor &&
    left.pageNumber === right.pageNumber &&
    left.hyphenation === right.hyphenation &&
    left.language === right.language &&
    left.bodyFont === right.bodyFont &&
    left.headingFont === right.headingFont &&
    left.colorScheme === right.colorScheme &&
    left.effects === right.effects &&
    left.spacing === right.spacing &&
    left.headerStyle === right.headerStyle &&
    left.footerStyle === right.footerStyle
  )
}

export function marginPresetId(setup: PageSetup) {
  return (
    MARGIN_PRESETS.find(
      (preset) =>
        preset.top === setup.marginTop &&
        preset.right === setup.marginRight &&
        preset.bottom === setup.marginBottom &&
        preset.left === setup.marginLeft,
    )?.id ?? null
  )
}

export function paperBox(setup: PageSetup) {
  const paper = PAPERS[setup.paper]
  const width = setup.paperWidth > 0 ? setup.paperWidth : paper.width
  const height = setup.paperHeight > 0 ? setup.paperHeight : paper.height
  const landscape = setup.orientation === "landscape"
  return {
    width: landscape ? height : width,
    height: landscape ? width : height,
  }
}

/** Millimeters → centimeters for Page Setup dialog fields. */
export function mmToCm(mm: number) {
  return Math.round((mm / 10) * 100) / 100
}

/** Centimeters → millimeters for Page Setup dialog fields. */
export function cmToMm(cm: number) {
  if (!Number.isFinite(cm)) {
    return 0
  }
  return Math.round(cm * 10 * 10) / 10
}

export function formatCm(mm: number) {
  return String(mmToCm(mm)).replace(".", ",")
}

/**
 * Web Layout has no pages: the text runs the width of the window and never breaks. The frame is one very tall "page"
 * with small gutters, so the paginator and everything placed by page metrics need no second code path.
 */
const WEB_HEIGHT = 1_000_000
const WEB_GUTTER_X = 32
const WEB_GUTTER_Y = 24

export function webMetrics(width: number): PageMetrics {
  return {
    width,
    height: WEB_HEIGHT,
    marginTop: WEB_GUTTER_Y,
    marginRight: WEB_GUTTER_X,
    marginBottom: WEB_GUTTER_Y,
    marginLeft: WEB_GUTTER_X,
    contentHeight: WEB_HEIGHT - 2 * WEB_GUTTER_Y,
  }
}

/** The page's size and margins in pixels; `paper` asks for the sheet itself, even where the view has no pages. */
export function pageMetrics(setup: PageSetup, paper = false): PageMetrics {
  if (!paper) {
    const { layoutMode, webWidth } = useViewStore.getState()
    if (layoutMode === "web" && webWidth > 0) {
      return webMetrics(webWidth)
    }
  }
  const box = paperBox(setup)
  const width = box.width * MM_TO_PX
  const height = box.height * MM_TO_PX
  const marginTop = setup.marginTop * MM_TO_PX
  const marginRight = setup.marginRight * MM_TO_PX
  const marginBottom = setup.marginBottom * MM_TO_PX
  const marginLeft = setup.marginLeft * MM_TO_PX
  return {
    width,
    height,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    contentHeight: Math.max(1, height - marginTop - marginBottom),
  }
}

export function clampMargin(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PAGE_SETUP.marginTop
  }
  const clamped = Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, value))
  return Math.round(clamped * 10) / 10
}

export type PageMarginEdge = "marginTop" | "marginRight" | "marginBottom" | "marginLeft"

const MIN_BODY_MM = 40

export function marginAlongEdge(setup: PageSetup, edge: PageMarginEdge, millimeters: number) {
  const box = paperBox(setup)
  const opposite =
    edge === "marginLeft"
      ? setup.marginRight
      : edge === "marginRight"
        ? setup.marginLeft
        : edge === "marginTop"
          ? setup.marginBottom
          : setup.marginTop
  const span = edge === "marginLeft" || edge === "marginRight" ? box.width : box.height
  return clampMargin(Math.min(millimeters, span - opposite - MIN_BODY_MM))
}

export function formatPageSetup(setup: PageSetup) {
  return [
    setup.paper,
    setup.orientation,
    setup.marginTop,
    setup.marginRight,
    setup.marginBottom,
    setup.marginLeft,
  ].join(",")
}

function readMargin(value: string | undefined) {
  if (!value?.trim()) {
    return DEFAULT_PAGE_SETUP.marginTop
  }
  return clampMargin(Number(value))
}

export function parsePageSetup(value: string): PageSetup {
  const [paper, orientation, top, right, bottom, left] = value.split(",")
  return normalizePageSetup({
    paper: paper === "a4" || paper === "legal" ? paper : "letter",
    orientation: orientation === "landscape" ? "landscape" : "portrait",
    marginTop: readMargin(top),
    marginRight: readMargin(right),
    marginBottom: readMargin(bottom),
    marginLeft: readMargin(left),
  })
}

export function builtInHeader(value: unknown): BuiltInHeader {
  return value === "columns" || value === "austin" || value === "banded" || value === "facet" || value === "blank"
    ? value
    : "blank"
}

export function pageNumberPlace(value: unknown): PageNumberPlace {
  return value === "none" ||
    value === "bottom-right" ||
    value === "top-center" ||
    value === "top-right" ||
    value === "bottom-center"
    ? value
    : "bottom-center"
}

export function spacingPreset(value: unknown): SpacingPreset {
  return value === "none" ||
    value === "compact" ||
    value === "tight" ||
    value === "open" ||
    value === "relaxed" ||
    value === "double"
    ? value
    : "default"
}

export function effectPreset(value: unknown): EffectPreset {
  return value === "office" || value === "subtle" || value === "moderate" || value === "intense" ? value : ""
}

export function borderLine(value: unknown): BorderLine {
  return value === "dashed" || value === "dotted" || value === "groove" || value === "ridge" ? value : "solid"
}

export function borderDisplay(value: unknown): BorderDisplay {
  return value === "first" || value === "not-first" ? value : "all"
}

/** Four distances in points (Word allows 0 to 31), or null when the value is not four numbers. */
export function borderSpace(value: unknown): number[] | null {
  const parts = Array.isArray(value) ? value.map(Number) : []
  return parts.length === 4 && parts.every((part) => Number.isFinite(part))
    ? parts.map((part) => Math.min(31, Math.max(0, Math.round(part))))
    : null
}

/** The page sides a value names, in order; all four when it names none it knows. */
export function pageSides(value: unknown): PageSide[] {
  const names = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : []
  const sides = PAGE_SIDES.filter((side) => names.includes(side))
  return sides.length > 0 ? sides : PAGE_SIDES
}

/** Whether the page border is drawn on the page at this index (0 for the first). */
export function showsPageBorder(setup: PageSetup, index: number) {
  if (setup.border === "none" || setup.borderSides.length === 0) {
    return false
  }
  return setup.borderDisplay === "first" ? index === 0 : setup.borderDisplay === "not-first" ? index > 0 : true
}

/** The CSS width of the page border's line, as the page draws it. */
export function pageBorderLineWidth(setup: Pick<PageSetup, "border" | "borderWidth">) {
  const width = Math.max(0.2, setup.borderWidth)
  return setup.border === "double" ? `max(3px, ${width * 3}mm)` : `${width}mm`
}

/**
 * Where the page border's box sits on the page: its distance in from the edge of the page, or out from the text
 * (the margins) to the inside of the line, as Word measures it.
 */
export function pageBorderInset(setup: PageSetup) {
  const sides = ["top", "right", "bottom", "left"] as const
  const line = pageBorderLineWidth(setup)
  return Object.fromEntries(
    sides.map((side, index) => {
      const space = setup.borderSpace[index] ?? 0
      // Measured from the text, the box reaches round the header and footer unless Options says not to.
      const edge =
        side === "top" && setup.borderSurroundHeader
          ? "var(--header-from-edge, 12.5mm)"
          : side === "bottom" && setup.borderSurroundFooter
            ? "var(--footer-from-edge, 12.5mm)"
            : `var(--page-margin-${side}, 24mm)`
      return [side, setup.borderFrom === "page" ? `${space}pt` : `calc(${edge} - ${space}pt - ${line})`]
    }),
  ) as Record<(typeof sides)[number], string>
}

/**
 * The page border's box as an inline style: its colour, where it sits (unless `placed` is false, as for the print
 * frame, which the print stylesheet places), and no line on the sides it leaves out.
 */
export function pageBorderStyle(setup: PageSetup, placed = true) {
  const off = Object.fromEntries(
    PAGE_SIDES.filter((side) => !setup.borderSides.includes(side)).map((side) => [
      `border${side[0].toUpperCase()}${side.slice(1)}Style`,
      "none",
    ]),
  )
  return { borderColor: setup.borderColor, ...(placed ? pageBorderInset(setup) : {}), ...off }
}

export function columnCount(value: unknown): ColumnCount {
  const count = Number(value)
  return count === 2 || count === 3 ? count : 1
}

export function pageBorder(value: unknown): PageBorder {
  return value === "single" || value === "double" ? value : "none"
}

function clampNonNeg(value: unknown, fallback: number) {
  const next = Number(value)
  if (!Number.isFinite(next) || next < 0) {
    return fallback
  }
  return Math.round(next * 10) / 10
}

function gutterPosition(value: unknown): GutterPosition {
  return value === "right" || value === "top" ? value : "left"
}

function multiplePages(value: unknown): MultiplePages {
  return value === "mirror" || value === "2pages" || value === "book-fold" ? value : "normal"
}

function paperSource(value: unknown): PaperSource {
  return PAPER_SOURCES.some((item) => item.id === value) ? (value as PaperSource) : "default"
}

function sectionStart(value: unknown): SectionStart {
  return value === "continuous" || value === "even" || value === "odd" || value === "new-column" ? value : "new-page"
}

function verticalAlign(value: unknown): VerticalAlign {
  return value === "center" || value === "justified" || value === "bottom" ? value : "top"
}

export function clipWatermark(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, WATERMARK_LIMIT)
}

export function applyPageChrome(setup: PageSetup) {
  const root = document.documentElement.style
  const metrics = pageMetrics(setup)
  root.setProperty("--page-margin-top", `${setup.marginTop}mm`)
  root.setProperty("--page-margin-right", `${setup.marginRight}mm`)
  root.setProperty("--page-margin-bottom", `${setup.marginBottom}mm`)
  root.setProperty("--page-margin-left", `${setup.marginLeft}mm`)
  root.setProperty("--header-from-edge", `${setup.headerFromEdge}mm`)
  root.setProperty("--footer-from-edge", `${setup.footerFromEdge}mm`)
  root.setProperty(
    "--page-vertical-align",
    setup.verticalAlign === "center" ? "center" : setup.verticalAlign === "bottom" ? "flex-end" : "flex-start",
  )
  root.setProperty("--page-content-height", `${metrics.contentHeight}px`)
  if (setup.pageColor) {
    root.setProperty("--page-color", setup.pageColor)
  } else {
    root.removeProperty("--page-color")
  }
  root.setProperty("--page-border-width", `${Math.max(0.2, setup.borderWidth)}mm`)
  root.setProperty("--page-border-style", setup.border === "double" ? "double" : setup.borderLine)
  root.setProperty("--page-border-color", setup.borderColor)
  if (setup.bodyFont) {
    root.setProperty("--doc-body-font", setup.bodyFont)
  } else {
    root.removeProperty("--doc-body-font")
  }
  if (setup.headingFont) {
    root.setProperty("--doc-heading-font", setup.headingFont)
  } else {
    root.removeProperty("--doc-heading-font")
  }

  const box = paperBox(setup)
  let style = document.getElementById("page-setup-print")
  if (!style) {
    style = document.createElement("style")
    style.id = "page-setup-print"
    document.head.appendChild(style)
  }
  const pageFill = setup.pageColor || "#ffffff"
  style.textContent = `@media print {
  @page {
    size: ${box.width}mm ${box.height}mm;
    margin: ${setup.marginTop}mm ${setup.marginRight}mm ${setup.marginBottom}mm ${setup.marginLeft}mm;
    background: ${pageFill};
  }
}`
}
