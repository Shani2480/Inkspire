import type { CellMargins, TablePosition, TableWidth } from "@/document/docx/model"
import { floatValue, parseFloatValue, type TableFloat } from "@/editor/table-float"
import {
  WORD_MARGINS,
  marginsValue,
  parseMargins,
  parsePreferredWidth,
  preferredWidthValue,
} from "@/editor/table-props"

/**
 * Table Properties (22.10) between Word's lengths (twips, or fiftieths of a percent) and the editor's centimetres.
 * Saving keeps Word's exact value whenever the editor still shows the same centimetres, so a table nobody changed is
 * written back unchanged.
 */

const TWIP_PER_CM = 1440 / 2.54

function cm(twips: number) {
  return Math.round((twips / TWIP_PER_CM) * 100) / 100
}

function twips(centimetres: number) {
  return Math.round(centimetres * TWIP_PER_CM)
}

/** A length in centimetres, from a twips (dxa) width; other kinds have none. */
export function lengthFromWord(width: TableWidth | undefined) {
  return width?.type === "dxa" ? cm(width.value) : null
}

export function lengthToWord(centimetres: unknown, origin: TableWidth | undefined): TableWidth | undefined {
  if (typeof centimetres !== "number" || !Number.isFinite(centimetres)) {
    return undefined
  }
  return lengthFromWord(origin) === Math.round(centimetres * 100) / 100
    ? origin
    : { value: twips(centimetres), type: "dxa" }
}

/** The editor's preferred width ("12cm", "80%") from Word's w:tblW; auto and nil are no preferred width. */
export function preferredFromWord(width: TableWidth | undefined) {
  if (width?.type === "dxa" && width.value > 0) {
    return preferredWidthValue({ value: cm(width.value), unit: "cm" })
  }
  if (width?.type === "pct" && width.value > 0) {
    return preferredWidthValue({ value: width.value / 50, unit: "pct" })
  }
  return null
}

/**
 * Word's w:tblW for the editor's preferred width. None set keeps an auto or nil width the file had (it is not a
 * preferred width the dialog shows), and drops a measured one the person cleared.
 */
export function preferredToWord(value: unknown, origin: TableWidth | undefined): TableWidth | undefined {
  const width = parsePreferredWidth(typeof value === "string" ? value : null)
  if (!width) {
    return origin && (origin.type === "auto" || origin.type === "nil") ? origin : undefined
  }
  if (preferredFromWord(origin) === preferredWidthValue(width)) {
    return origin
  }
  return width.unit === "pct"
    ? { value: Math.round(width.value * 50), type: "pct" }
    : { value: twips(width.value), type: "dxa" }
}

/** Margins in the editor's form ("top,bottom,left,right" in cm); a side Word leaves out is Word's default. */
export function marginsFromWord(margins: CellMargins | undefined) {
  if (!margins) {
    return null
  }
  const side = (edge: keyof CellMargins, fallback: number) => {
    const width = margins[edge]
    return width?.type === "dxa" ? cm(width.value) : fallback
  }
  return marginsValue({
    top: side("top", WORD_MARGINS.top),
    bottom: side("bottom", WORD_MARGINS.bottom),
    left: side("left", WORD_MARGINS.left),
    right: side("right", WORD_MARGINS.right),
  })
}

export function marginsToWord(value: unknown, origin: CellMargins | undefined): CellMargins | undefined {
  const margins = parseMargins(typeof value === "string" ? value : null)
  if (!margins) {
    return undefined
  }
  if (marginsFromWord(origin) === marginsValue(margins)) {
    return origin
  }
  return {
    top: { value: twips(margins.top), type: "dxa" },
    left: { value: twips(margins.left), type: "dxa" },
    bottom: { value: twips(margins.bottom), type: "dxa" },
    right: { value: twips(margins.right), type: "dxa" },
  }
}

const ANCHOR_ACROSS = { text: "column", margin: "margin", page: "page" } as const
const ANCHOR_DOWN = { text: "paragraph", margin: "margin", page: "page" } as const

/**
 * The editor's float from Word's w:tblpPr and w:tblOverlap. Word leaves out what is its default: across from the
 * column (text), down from the margin, and no distance from the text.
 */
export function floatFromWord(position: TablePosition | undefined, overlap?: "never" | "overlap"): TableFloat | null {
  if (!position) {
    return null
  }
  const vFrom = ANCHOR_DOWN[position.vertAnchor ?? "margin"]
  const ySpec = position.tblpYSpec && position.tblpYSpec !== "inline" ? position.tblpYSpec : null
  return {
    h: position.tblpXSpec ?? cm(position.tblpX ?? 0),
    hFrom: ANCHOR_ACROSS[position.horzAnchor ?? "text"],
    v: ySpec && vFrom !== "paragraph" ? ySpec : cm(position.tblpY ?? 0),
    vFrom,
    gaps: {
      top: cm(position.topFromText ?? 0),
      bottom: cm(position.bottomFromText ?? 0),
      left: cm(position.leftFromText ?? 0),
      right: cm(position.rightFromText ?? 0),
    },
    overlap: overlap !== "never",
  }
}

/** Word's w:tblpPr and w:tblOverlap for the editor's float; the file's own while the editor shows the same. */
export function floatToWord(
  value: unknown,
  origin: { position?: TablePosition; overlap?: "never" | "overlap" } | undefined,
): { position?: TablePosition; overlap?: "never" | "overlap" } {
  const float = parseFloatValue(value)
  if (!float) {
    return {}
  }
  const before = floatFromWord(origin?.position, origin?.overlap)
  if (before && floatValue(before) === floatValue(float)) {
    return { position: origin?.position, ...(origin?.overlap ? { overlap: origin.overlap } : {}) }
  }
  const across = { column: "text", margin: "margin", page: "page" } as const
  const down = { paragraph: "text", margin: "margin", page: "page" } as const
  const position: TablePosition = {
    leftFromText: twips(float.gaps.left),
    rightFromText: twips(float.gaps.right),
    ...(float.gaps.top ? { topFromText: twips(float.gaps.top) } : {}),
    ...(float.gaps.bottom ? { bottomFromText: twips(float.gaps.bottom) } : {}),
    vertAnchor: down[float.vFrom],
    horzAnchor: across[float.hFrom],
    ...(typeof float.h === "number" ? { tblpX: twips(float.h) } : { tblpXSpec: float.h }),
    ...(typeof float.v === "number" ? { tblpY: twips(float.v) } : { tblpYSpec: float.v }),
  }
  return { position, ...(float.overlap ? {} : { overlap: "never" as const }) }
}
