import { PX_PER_CM, type Margins } from "@/editor/table-props"

/**
 * Text wrapping around a table (Table Properties > Around, and Table Positioning), as Word's w:tblpPr: where the
 * table sits, measured from the column, margin or page across and from its paragraph, the margin or the page down,
 * and how far the text keeps from it. Lengths are in centimetres.
 */

export type FloatAcross = "left" | "center" | "right" | "inside" | "outside"
export type FloatDown = "top" | "center" | "bottom" | "inside" | "outside"

export type TableFloat = {
  /** A named place, or a distance from the left of `hFrom`. */
  h: FloatAcross | number
  hFrom: "column" | "margin" | "page"
  /** A named place, or a distance below the top of `vFrom` (a paragraph has only distances). */
  v: FloatDown | number
  vFrom: "paragraph" | "margin" | "page"
  /** Distance from the surrounding text. */
  gaps: Margins
  /** Allow overlap: another floating table may cover this one. */
  overlap: boolean
}

const ACROSS = new Set(["left", "center", "right", "inside", "outside"])
const DOWN = new Set(["top", "center", "bottom", "inside", "outside"])

/** Word's distances for a table set to Around: 0.32 cm at the sides, none above and below. */
export const FLOAT_GAPS: Margins = { top: 0, bottom: 0, left: 0.32, right: 0.32 }

/** What Around gives a table: where its alignment and indent put it, moving with its paragraph. */
export function defaultFloat(align: unknown, indent: number): TableFloat {
  return {
    h: align === "center" || align === "right" ? align : indent,
    hFrom: "column",
    v: 0,
    vFrom: "paragraph",
    gaps: { ...FLOAT_GAPS },
    overlap: true,
  }
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Reads a float from its data attribute (JSON), dropping anything malformed. */
export function parseFloatValue(value: unknown): TableFloat | null {
  let raw: unknown = value
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== "object") {
    return null
  }
  const item = raw as Record<string, unknown>
  const h = ACROSS.has(String(item.h)) ? (item.h as FloatAcross) : (finite(item.h) ?? 0)
  const v = DOWN.has(String(item.v)) ? (item.v as FloatDown) : (finite(item.v) ?? 0)
  const hFrom = item.hFrom === "margin" || item.hFrom === "page" ? item.hFrom : "column"
  const vFrom = item.vFrom === "margin" || item.vFrom === "page" ? item.vFrom : "paragraph"
  const gaps = (item.gaps ?? {}) as Record<string, unknown>
  const gap = (side: keyof Margins) => Math.max(0, finite(gaps[side]) ?? FLOAT_GAPS[side])
  return {
    h,
    hFrom,
    // Below a paragraph there is only a distance.
    v: vFrom === "paragraph" && typeof v === "string" ? 0 : v,
    vFrom,
    gaps: { top: gap("top"), bottom: gap("bottom"), left: gap("left"), right: gap("right") },
    overlap: item.overlap !== false,
  }
}

export function floatValue(float: TableFloat | null | undefined) {
  return float ? JSON.stringify(float) : null
}

export const tableFloatAttributes = {
  float: {
    default: null as TableFloat | null,
    parseHTML: (element: HTMLElement) => parseFloatValue(element.getAttribute("data-float")),
    renderHTML: (attributes: { float?: TableFloat | null }) =>
      attributes.float ? { "data-float": floatValue(attributes.float) } : {},
  },
}

export type FloatFrame = {
  /** The page's size and margins, in pixels. */
  pageWidth: number
  pageHeight: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  /** Odd pages put Inside on the left, as Word does. */
  page: number
  /** How far down the page the table's paragraph starts, from the top margin. */
  paragraphTop: number
}

/**
 * Where a floating table's top-left corner lands, in pixels from the top-left of the page's text area (as the
 * floating objects' x and y are).
 */
export function floatPlace(float: TableFloat, width: number, height: number, frame: FloatFrame) {
  const textWidth = frame.pageWidth - frame.marginLeft - frame.marginRight
  const textHeight = frame.pageHeight - frame.marginTop - frame.marginBottom
  const odd = frame.page % 2 === 1
  const across =
    float.hFrom === "page" ? { start: -frame.marginLeft, size: frame.pageWidth } : { start: 0, size: textWidth }
  const down =
    float.vFrom === "page"
      ? { start: -frame.marginTop, size: frame.pageHeight }
      : float.vFrom === "margin"
        ? { start: 0, size: textHeight }
        : { start: frame.paragraphTop, size: 0 }
  const named = (place: string, start: number, size: number, own: number) => {
    const first = place === "left" || place === "top" || (place === "inside" ? odd : place === "outside" ? !odd : false)
    if (first) {
      return start
    }
    return place === "center" ? start + (size - own) / 2 : start + size - own
  }
  const x =
    typeof float.h === "number" ? across.start + float.h * PX_PER_CM : named(float.h, across.start, across.size, width)
  const y =
    typeof float.v === "number" ? down.start + float.v * PX_PER_CM : named(float.v, down.start, down.size, height)
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * The room the text leaves beside a floating table: a float from the text area's left edge to the table's right
 * edge plus its gap (text on the right), or the other way round. Text goes on the roomier side; a table with too
 * little room on both sides for a line leaves the text above and below it only, as Word does.
 */
export function floatSide(x: number, width: number, gaps: Margins, textWidth: number) {
  const left = x - gaps.left * PX_PER_CM
  const right = textWidth - (x + width + gaps.right * PX_PER_CM)
  const textRight = right >= left
  const room = textRight ? right : left
  if (room < 1 * PX_PER_CM) {
    return { float: "left" as const, width: Math.round(textWidth) }
  }
  return textRight
    ? { float: "left" as const, width: Math.max(0, Math.round(x + width + gaps.right * PX_PER_CM)) }
    : { float: "right" as const, width: Math.max(0, Math.round(textWidth - x + gaps.left * PX_PER_CM)) }
}

/**
 * Takes a floating table out of the text and draws it where the paginator last placed it (`data-float-left` and
 * `data-float-top`, see `placeFloatingTables` in pages.ts). The <table> carries it: the table view leaves changes
 * to that element's attributes alone, and its wrapper then takes no room.
 */
export function drawTableFloat(table: HTMLElement, float: unknown) {
  if (!float) {
    delete table.dataset.float
    delete table.dataset.floatFlow
    for (const name of ["position", "left", "top", "z-index", "margin-left"]) {
      table.style.removeProperty(name)
    }
    return
  }
  table.dataset.float = "1"
  // Too tall for the rest of its page, the layout put it in the text to break between rows (placeFloatingTables).
  if (table.dataset.floatFlow) {
    return
  }
  table.style.position = "absolute"
  table.style.zIndex = "3"
  table.style.left = `${Number(table.dataset.floatLeft) || 0}px`
  table.style.top = `${Number(table.dataset.floatTop) || 0}px`
  table.style.marginLeft = ""
  // Out of the text, a table without fixed columns would stretch to the whole editor.
  if (!table.style.width) {
    table.style.width = table.style.minWidth
  }
}

export type FloatRect = { x: number; y: number; width: number; height: number }

/**
 * Where a floating table that may not overlap others (Allow overlap off, Word's w:tblOverlap "never") goes: down
 * past each floating table already on the page that it would cover, until it covers none.
 */
export function clearOfFloats(placed: FloatRect[], own: FloatRect) {
  let y = own.y
  for (let step = 0; step <= placed.length; step += 1) {
    const hit = placed.find(
      (other) =>
        own.x < other.x + other.width &&
        other.x < own.x + own.width &&
        y < other.y + other.height &&
        other.y < y + own.height,
    )
    if (!hit) {
      break
    }
    y = hit.y + hit.height
  }
  return y
}
