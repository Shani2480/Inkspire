import { patternImage } from "@/document/docx/shading-pattern"
import type { Editor } from "@tiptap/core"

const MM_TO_PX = 96 / 25.4

function pointValue(value: unknown) {
  if (value == null || value === "") {
    return null
  }
  const points = Number(value)
  return Number.isFinite(points) ? points : null
}

function millimeterValue(value: unknown) {
  const millimeters = Number(value)
  if (!Number.isFinite(millimeters) || millimeters <= 0) {
    return 0
  }
  return millimeters
}

export function blockFormatAttributes() {
  return {
    namedStyle: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-style"),
      renderHTML: (attributes: { namedStyle?: string | null }) => {
        if (!attributes.namedStyle) {
          return {}
        }
        return { "data-style": attributes.namedStyle }
      },
    },
    shading: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
      renderHTML: (attributes: { shading?: string | null }) => {
        if (!attributes.shading) {
          return {}
        }
        return { style: `background-color: ${attributes.shading}` }
      },
    },
    /** Word's shading pattern over the fill (22.4): its w:shd value and, unless automatic, its colour. */
    shadingPattern: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-shading-pattern"),
      renderHTML: (attributes: { shadingPattern?: string | null }) => {
        const image = patternImage(attributes.shadingPattern)
        if (!image) {
          return {}
        }
        return { "data-shading-pattern": attributes.shadingPattern, style: `background-image: ${image}` }
      },
    },
    border: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-border"),
      renderHTML: (attributes: { border?: string | null }) => borderRender(attributes.border ?? null),
    },
    /** The line the paragraph's border is drawn with, as the CSS shorthand; the app's own when unset (22.4). */
    borderPen: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.style.getPropertyValue("--para-border").trim() || null,
      renderHTML: (attributes: { borderPen?: string | null }) =>
        attributes.borderPen
          ? {
              style: `--para-border: ${attributes.borderPen}; --para-border-width: ${attributes.borderPen.split(" ")[0]}; --para-border-color: ${attributes.borderPen.split(" ")[2] ?? ""}`,
            }
          : {},
    },
    /**
     * The gap between the text and each side of its box, in points: "top right bottom left" (Word's w:space, set in
     * Borders and Shading > Options…); Word's 1, 4, 1, 4 when unset (22.4).
     */
    borderSpace: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-border-space"),
      renderHTML: (attributes: { borderSpace?: string | null }) => {
        const space = borderSpaceOf(attributes.borderSpace)
        if (!space) {
          return {}
        }
        return {
          "data-border-space": space.join(" "),
          style: BOX_SIDES.map((side, index) => `--para-space-${side}: ${space[index]}pt`).join("; "),
        }
      },
    },
    /** Word's Shadow border setting: a shadow to the bottom right of the box (22.4). */
    borderShadow: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-border-shadow") === "1",
      renderHTML: (attributes: { borderShadow?: boolean }) =>
        attributes.borderShadow ? { "data-border-shadow": "1" } : {},
    },
    /** Word's 3-D border setting: the frame effect, drawn here as the box (22.4). */
    borderFrame: {
      default: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-border-frame") === "1",
      renderHTML: (attributes: { borderFrame?: boolean }) =>
        attributes.borderFrame ? { "data-border-frame": "1" } : {},
    },
    spaceBefore: {
      default: null as number | null,
      parseHTML: (element: HTMLElement) => pointValue(element.style.marginTop.replace("pt", "")),
      renderHTML: (attributes: { spaceBefore?: number | null }) => {
        const points = pointValue(attributes.spaceBefore)
        if (points == null) {
          return {}
        }
        return { style: `margin-top: ${points}pt` }
      },
    },
    spaceAfter: {
      default: null as number | null,
      parseHTML: (element: HTMLElement) => pointValue(element.style.marginBottom.replace("pt", "")),
      renderHTML: (attributes: { spaceAfter?: number | null }) => {
        const points = pointValue(attributes.spaceAfter)
        if (points == null) {
          return {}
        }
        return { style: `margin-bottom: ${points}pt` }
      },
    },
    dropCap: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-drop-cap"),
      renderHTML: (attributes: { dropCap?: string | null }) => {
        if (attributes.dropCap !== "dropped" && attributes.dropCap !== "margin") {
          return {}
        }
        return { "data-drop-cap": attributes.dropCap }
      },
    },
    indentRight: {
      default: 0,
      parseHTML: (element: HTMLElement) => millimeterValue(element.getAttribute("data-indent-right")),
      renderHTML: (attributes: { indentRight?: number }) => {
        const millimeters = millimeterValue(attributes.indentRight)
        if (millimeters <= 0) {
          return {}
        }
        return {
          "data-indent-right": String(millimeters),
          style: `margin-right: ${millimeters * MM_TO_PX}px`,
        }
      },
    },
    outlineLevel: {
      default: "" as string,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-outline") ?? "",
      renderHTML: (attributes: { outlineLevel?: string }) =>
        attributes.outlineLevel ? { "data-outline": attributes.outlineLevel } : {},
    },
    collapsed: flagAttr("collapsed", "data-collapsed", false, () => ""),
    specialIndent: {
      default: "" as string,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-special") || "",
      renderHTML: (attributes: { specialIndent?: string }) => {
        const [kind, raw] = String(attributes.specialIndent || "").split(":")
        const amount = Number(raw)
        if ((kind !== "first" && kind !== "hanging") || !Number.isFinite(amount) || amount <= 0) {
          return {}
        }
        const indent =
          kind === "hanging" ? `text-indent: -${amount}cm; padding-left: ${amount}cm` : `text-indent: ${amount}cm`
        return { "data-special": `${kind}:${amount}`, style: indent }
      },
    },
    mirrorIndents: flagAttr("mirrorIndents", "data-mirror", false, () => ""),
    contextualSpacing: flagAttr("contextualSpacing", "data-context-spacing", false, () => ""),
    lineRule: {
      default: "multiple" as string,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-line-rule") || "multiple",
      renderHTML: (attributes: { lineRule?: string; lineHeight?: unknown }) => {
        const rule = attributes.lineRule
        if (rule !== "exact" && rule !== "at-least" && rule !== "multiple") {
          return {}
        }
        // Exact and at-least heights are points; LineHeight alone would render "18" as eighteen lines.
        // Node attributes render after LineHeight's, so this declaration wins.
        const points = rule === "multiple" ? null : pointValue(String(attributes.lineHeight ?? "").replace("pt", ""))
        return points ? { "data-line-rule": rule, style: `line-height: ${points}pt` } : { "data-line-rule": rule }
      },
    },
    widowControl: flagAttr("widowControl", "data-widow", true, (on) =>
      on ? "widows: 2; orphans: 2" : "widows: 1; orphans: 1",
    ),
    keepNext: flagAttr("keepNext", "data-keep-next", false, (on) => (on ? "break-after: avoid" : "")),
    keepLines: flagAttr("keepLines", "data-keep-lines", false, (on) => (on ? "break-inside: avoid" : "")),
    pageBreakBefore: flagAttr("pageBreakBefore", "data-page-break-before", false, (on) =>
      on ? "break-before: page" : "",
    ),
    suppressLineNumbers: flagAttr("suppressLineNumbers", "data-suppress-lines", false, () => ""),
    dontHyphenate: flagAttr("dontHyphenate", "data-no-hyphen", false, (on) => (on ? "hyphens: none" : "")),
    tightWrap: {
      default: "none" as string,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-tight-wrap") || "none",
      renderHTML: (attributes: { tightWrap?: string }) =>
        attributes.tightWrap && attributes.tightWrap !== "none" ? { "data-tight-wrap": attributes.tightWrap } : {},
    },
  }
}

function flagAttr(key: string, name: string, fallback: boolean, style: (on: boolean) => string) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(name)
      if (value == null || value === "") {
        return fallback
      }
      return value === "1"
    },
    renderHTML: (attributes: Record<string, boolean>) => {
      const on = attributes[key] !== false && (attributes[key] === true || fallback)
      if (!on && !fallback && !style(false)) {
        return {}
      }
      const css = style(Boolean(attributes[key] ?? fallback))
      if (!css && (attributes[key] ?? fallback) === fallback && !fallback) {
        return {}
      }
      return {
        [name]: (attributes[key] ?? fallback) ? "1" : "0",
        ...(css ? { style: css } : {}),
      }
    },
  }
}

const BOX_SIDES = ["top", "right", "bottom", "left"] as const

/** A `borderSpace` value as four points (top, right, bottom, left), or null when unset or not four numbers. */
export function borderSpaceOf(value: unknown): number[] | null {
  const parts = typeof value === "string" ? value.trim().split(/\s+/).map(Number) : []
  return parts.length === 4 && parts.every((part) => Number.isFinite(part) && part >= 0) ? parts : null
}

/**
 * The drawn sides of a paragraph's box. The box itself is a layer behind the text (`index.css`) that reaches out by
 * each side's gap and line, so the text keeps its place as in Word; only the top and bottom add to the paragraph.
 */
function borderRender(value: string | null) {
  if (!value || value === "none") {
    return {}
  }
  const sides = value === "all" ? [...BOX_SIDES] : value.split(",").filter(Boolean)
  if (sides.length === 0) {
    return {}
  }
  return {
    "data-border": value,
    style: sides
      .map((side) => `--para-${side}: var(--para-border, 1px solid #1c1c1c); --para-${side}-on: 1`)
      .join("; "),
  }
}

export function updateBlocks(editor: Editor, attrs: Record<string, unknown>) {
  const { state } = editor
  const { from, to, empty } = state.selection
  const positions: number[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      positions.push(pos)
    }
  })
  if (positions.length === 0 && empty) {
    positions.push(state.selection.$from.before())
  }
  if (positions.length === 0) {
    return
  }

  let transaction = state.tr
  for (const pos of positions) {
    const node = transaction.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    transaction = transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...attrs,
    })
  }
  editor.view.dispatch(transaction)
  editor.commands.focus()
}
