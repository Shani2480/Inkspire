/**
 * What Word's Table Properties dialog sets that the table did not hold before (22.10): the table's preferred width,
 * indent from the left, cell spacing, default cell margins and automatic resizing; a row's height rule and whether it
 * may break across pages; a cell's own margins, and whether its text wraps or is fitted. Lengths are in centimetres.
 */

export const PX_PER_CM = 96 / 2.54

/** Cell margins in centimetres, as the Table Options and Cell Options dialogs show them. */
export type Margins = { top: number; bottom: number; left: number; right: number }

/** A preferred width: centimetres, or a percentage of the text width. */
export type PreferredWidth = { value: number; unit: "cm" | "pct" }

const SIDES = ["top", "bottom", "left", "right"] as const

export function parseMargins(value: string | null): Margins | null {
  const parts = (value ?? "").split(",").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null
  }
  return { top: parts[0]!, bottom: parts[1]!, left: parts[2]!, right: parts[3]! }
}

export function marginsValue(margins: Margins | null | undefined) {
  return margins ? SIDES.map((side) => round(margins[side])).join(",") : null
}

export function parsePreferredWidth(value: string | null): PreferredWidth | null {
  const match = /^([\d.]+)(cm|%)$/.exec(value ?? "")
  const number = Number(match?.[1])
  return match && number > 0 ? { value: number, unit: match[2] === "%" ? "pct" : "cm" } : null
}

export function preferredWidthValue(width: PreferredWidth | null | undefined) {
  return width && width.value > 0 ? `${round(width.value)}${width.unit === "pct" ? "%" : "cm"}` : null
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function numberAttribute(name: string) {
  return {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(`data-${name}`))
      return element.hasAttribute(`data-${name}`) && Number.isFinite(value) ? value : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
      const value = attributes[key]
      return typeof value === "number" ? { [`data-${name}`]: String(round(value)) } : {}
    },
  }
}

function flagAttribute(name: string, fallback = false) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(`data-${name}`)
      return value === null ? fallback : value === "1"
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
      const value = attributes[key] !== false && attributes[key] != null ? Boolean(attributes[key]) : false
      return value === fallback ? {} : { [`data-${name}`]: value ? "1" : "0" }
    },
  }
}

/** The table's attributes; the table view draws them (see `applyTableProps`). */
export const tablePropsAttributes = {
  prefWidth: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      preferredWidthValue(parsePreferredWidth(element.getAttribute("data-pref-width"))),
    renderHTML: (attributes: { prefWidth?: string | null }) =>
      attributes.prefWidth ? { "data-pref-width": attributes.prefWidth } : {},
  },
  indent: numberAttribute("indent"),
  cellSpacing: numberAttribute("cell-spacing"),
  autoResize: flagAttribute("auto-resize", true),
  margins: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => marginsValue(parseMargins(element.getAttribute("data-margins"))),
    renderHTML: (attributes: { margins?: string | null }) =>
      attributes.margins ? { "data-margins": attributes.margins } : {},
  },
}

/** Draws the table's indent, cell spacing and default cell margins on the table element the table view made. */
export function applyTableProps(table: HTMLElement, attrs: Record<string, unknown>) {
  const indent = typeof attrs.indent === "number" ? attrs.indent : null
  table.style.marginLeft = indent !== null && attrs.align !== "center" && attrs.align !== "right" ? `${indent}cm` : ""
  const spacing = typeof attrs.cellSpacing === "number" && attrs.cellSpacing > 0 ? attrs.cellSpacing : null
  table.style.borderCollapse = spacing !== null ? "separate" : ""
  table.style.borderSpacing = spacing !== null ? `${spacing}cm` : ""
  const margins = parseMargins(typeof attrs.margins === "string" ? attrs.margins : null)
  if (margins) {
    table.dataset.margins = marginsValue(margins)!
    for (const side of SIDES) {
      table.style.setProperty(`--cell-margin-${side}`, `${margins[side]}cm`)
    }
  } else {
    delete table.dataset.margins
    for (const side of SIDES) {
      table.style.removeProperty(`--cell-margin-${side}`)
    }
  }
}

export const rowPropsAttributes = {
  heightRule: {
    default: "atLeast",
    parseHTML: (element: HTMLElement) => (element.getAttribute("data-height-rule") === "exact" ? "exact" : "atLeast"),
    renderHTML: (attributes: { heightRule?: string }) =>
      attributes.heightRule === "exact" ? { "data-height-rule": "exact" } : {},
  },
  /** Word's "Allow row to break across pages", off. */
  cantSplit: flagAttribute("cant-split"),
}

export const cellPropsAttributes = {
  /** The cell's own margins, over the table's ("Same as the whole table" off). */
  cellMargins: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => marginsValue(parseMargins(element.getAttribute("data-cell-margins"))),
    renderHTML: (attributes: { cellMargins?: string | null }) => {
      const margins = parseMargins(attributes.cellMargins ?? null)
      return margins
        ? {
            "data-cell-margins": attributes.cellMargins,
            style: `padding: ${margins.top}cm ${margins.right}cm ${margins.bottom}cm ${margins.left}cm`,
          }
        : {}
    },
  },
  noWrap: flagAttribute("no-wrap"),
  fitText: flagAttribute("fit-text"),
}

/** Word's default cell margins (Table Grid): none above and below, 0.19 cm at the sides. */
export const WORD_MARGINS: Margins = { top: 0, bottom: 0, left: 0.19, right: 0.19 }

/** The margins the app's Narrow / Normal / Wide presets draw (see `data-cell-pad` in index.css), in centimetres. */
export function presetMargins(pad: unknown): Margins {
  if (pad === "narrow") {
    return { top: 0.03, bottom: 0.03, left: 0.08, right: 0.08 }
  }
  if (pad === "wide") {
    return { top: 0.26, bottom: 0.26, left: 0.37, right: 0.37 }
  }
  return WORD_MARGINS
}

/**
 * A table's attributes for the Narrow / Normal / Wide preset: its default cell margins are set to the preset's, so
 * they are saved in .docx (w:tblCellMar) and win over margins the table came with. Normal is Word's default, which
 * Word leaves out.
 */
export function presetAttrs(pad: "narrow" | "normal" | "wide") {
  return { cellPad: pad, margins: pad === "normal" ? null : marginsValue(presetMargins(pad)) }
}

/** The preset a table's margins match, so a table saved as Wide opens as Wide; any other margins count as Normal. */
export function presetOf(attrs: { cellPad?: unknown; margins?: unknown }): "narrow" | "normal" | "wide" {
  if (typeof attrs.margins === "string") {
    const margins = marginsValue(parseMargins(attrs.margins))
    return (["narrow", "wide"] as const).find((pad) => marginsValue(presetMargins(pad)) === margins) ?? "normal"
  }
  return attrs.cellPad === "narrow" || attrs.cellPad === "wide" ? attrs.cellPad : "normal"
}
