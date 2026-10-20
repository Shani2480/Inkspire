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
    border: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-border"),
      renderHTML: (attributes: { border?: string | null }) => borderRender(attributes.border ?? null),
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

function borderRender(value: string | null) {
  if (!value || value === "none") {
    return {}
  }
  const sides = value === "all" ? ["top", "right", "bottom", "left"] : value.split(",").filter(Boolean)
  if (sides.length === 0) {
    return {}
  }
  return {
    "data-border": value,
    style: sides.map((side) => `border-${side}: 1px solid #1c1c1c`).join("; "),
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
