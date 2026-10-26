import { borderOf } from "@/document/docx/cell-edits"
import type { Border, RunProperties, Shading, ShadingValue } from "@/document/docx/model"
import { patternImage, patternOf, patternValue } from "@/document/docx/shading-pattern"

/**
 * Borders and Shading > Apply to Text (22.4): a run's box (w:bdr) and shading (w:shd), which the editor keeps as the
 * textBorder mark. Shared by the mark, the .docx projection and the writer, so each draws and saves the same thing.
 */
export type TextBox = {
  /** The box's line as the CSS shorthand ("1px solid #000000"); null for no box. */
  border: string | null
  /** Word's Shadow setting: the box casts a shadow to the bottom right. */
  shadow: boolean
  /** The fill as #rrggbb; null for none. */
  fill: string | null
  /** The shading pattern as `shading-pattern.ts` keeps it; null for Clear. */
  pattern: string | null
}

export const NO_TEXT_BOX: TextBox = { border: null, shadow: false, fill: null, pattern: null }

const CSS_STYLES: Record<string, string> = { single: "solid", dashed: "dashed", dotted: "dotted", double: "double" }
const HEX = /^[0-9A-Fa-f]{6}$/

/** Whether a text box draws anything. */
export function drawsTextBox(box: TextBox) {
  return Boolean(box.border || box.fill || patternOf(box.pattern))
}

/** The box and shading a run's properties draw; null when they draw neither. */
export function textBoxOfRun(props: Pick<RunProperties, "bdr" | "shd">): TextBox | null {
  const line = props.bdr && props.bdr.value !== "none" && props.bdr.value !== "nil" ? props.bdr : null
  let border: string | null = null
  if (line) {
    // w:sz counts eighths of a point; the editor draws in CSS pixels (0.75 pt).
    const px = Math.round(((line.sz ?? 4) / 8 / 0.75) * 100) / 100
    const color = line.color && HEX.test(line.color) ? line.color.toLowerCase() : "000000"
    border = `${px}px ${CSS_STYLES[line.value] ?? "solid"} #${color}`
  }
  const shading = props.shd
  const box: TextBox = {
    border,
    shadow: Boolean(line?.shadow),
    fill: shading?.fill && HEX.test(shading.fill) ? `#${shading.fill.toLowerCase()}` : null,
    pattern: shading
      ? patternValue(shading.value, shading.color && HEX.test(shading.color) ? `#${shading.color}` : null)
      : null,
  }
  return drawsTextBox(box) ? box : null
}

/** The w:bdr and w:shd that save a text box. */
export function runBoxOf(box: TextBox): { bdr?: Border; shd?: Shading } {
  const out: { bdr?: Border; shd?: Shading } = {}
  if (box.border) {
    out.bdr = { ...borderOf(box.border), ...(box.shadow ? { shadow: true } : {}) }
  }
  const pattern = patternOf(box.pattern)
  if (box.fill || pattern) {
    out.shd = {
      value: (pattern?.pattern ?? "clear") as ShadingValue,
      color: pattern?.color?.slice(1).toUpperCase() ?? "auto",
      fill: box.fill ? box.fill.slice(1).toUpperCase() : "auto",
    }
  }
  return out
}

/** The span attributes that draw a text box: what it is, as data attributes, and how it looks. */
export function textBoxAttributes(box: TextBox): Record<string, string> {
  const attributes: Record<string, string> = { "data-text-border": "" }
  const style: string[] = []
  if (box.border) {
    attributes["data-text-line"] = box.border
    // Each line of a box that wraps is closed, as Word draws it.
    style.push(`border: ${box.border}`, "box-decoration-break: clone", "-webkit-box-decoration-break: clone")
    if (box.shadow) {
      attributes["data-text-shadow"] = "1"
      style.push(`box-shadow: 2px 2px 0 0 ${box.border.split(" ")[2] ?? "#000000"}`)
    }
  }
  if (box.fill) {
    attributes["data-text-fill"] = box.fill
    style.push(`background-color: ${box.fill}`)
  }
  const image = patternImage(box.pattern)
  if (image) {
    attributes["data-text-pattern"] = String(box.pattern)
    style.push(`background-image: ${image}`)
  }
  if (style.length > 0) {
    attributes.style = style.join("; ")
  }
  return attributes
}

/** A text box as an element written by `textBoxAttributes` holds it. */
export function textBoxOfElement(element: HTMLElement): TextBox {
  return {
    border: element.getAttribute("data-text-line") || null,
    shadow: element.getAttribute("data-text-shadow") === "1",
    fill: element.getAttribute("data-text-fill") || null,
    pattern: element.getAttribute("data-text-pattern") || null,
  }
}
