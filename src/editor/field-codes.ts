import { DATE_PICTURES, type DateFormat } from "@/editor/formula"

/**
 * Field codes (Options > Advanced > Show field codes instead of their values, Alt+F9). A field draws its result in a
 * `.field-value` span and carries its code in `data-field-code`; the page styles show one or the other.
 */

export function dateFieldCode(format: DateFormat) {
  return `DATE \\@ "${DATE_PICTURES[format]}"`
}

export function formulaFieldCode(expression: string) {
  return `= ${expression.trim().replace(/^=\s*/, "")}`
}

const IF_OPERATORS: Record<string, string> = { "≠": "<>", "≥": ">=", "≤": "<=" }

export function ifFieldCode(left: string, operator: string, right: string, thenText: string, elseText: string) {
  return `IF ${left} ${IF_OPERATORS[operator] ?? operator} ${right} "${thenText}" "${elseText}"`
}

/** The code of a field kept from a .docx: a simple field's instruction, or the instruction text of a complex one. */
export function preservedFieldCode(payload: string) {
  const parts: string[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (!value || typeof value !== "object") {
      return
    }
    const item = value as Record<string, unknown>
    if (item.kind === "simpleField" && typeof item.instr === "string") {
      parts.push(item.instr)
    } else if (item.kind === "instrText" && typeof item.text === "string") {
      parts.push(item.text)
    } else {
      Object.values(item).forEach(walk)
    }
  }
  try {
    walk(JSON.parse(payload))
  } catch {
    // Not a field the editor knows: no code to show.
  }
  return parts.join("").replace(/\s+/g, " ").trim()
}

/** Draws a field's result in its `.field-value` span (made on first use) and keeps its code on the element. */
export function paintField(dom: HTMLElement, text: string, code: string) {
  let value = dom.querySelector<HTMLElement>(":scope > .field-value")
  if (!value) {
    value = document.createElement("span")
    value.className = "field-value"
    dom.replaceChildren(value)
  }
  if (value.textContent !== text) {
    value.textContent = text
  }
  const shown = code ? `{ ${code} }` : ""
  if (dom.getAttribute("data-field-code") !== shown) {
    dom.setAttribute("data-field-code", shown)
  }
}
