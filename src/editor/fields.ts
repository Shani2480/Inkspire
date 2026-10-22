import { Node, mergeAttributes } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import type { Transaction } from "@tiptap/pm/state"
import { dateFieldCode, formulaFieldCode, ifFieldCode, paintField } from "@/editor/field-codes"
import {
  clipFieldText,
  dateFormat,
  evaluateFormula,
  evaluateIf,
  formatDate,
  isIfOperator,
  type DateFormat,
} from "@/editor/formula"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dateField: {
      insertDateField: (format: DateFormat) => ReturnType
      updateDateFields: () => ReturnType
    }
    formulaField: {
      insertFormula: () => ReturnType
    }
    ifField: {
      insertIf: () => ReturnType
    }
  }
}

export const DateField = Node.create({
  name: "dateField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      format: {
        default: "date",
        parseHTML: (element) => dateFormat(element.getAttribute("data-date-format")),
        renderHTML: (attributes) => ({ "data-date-format": dateFormat(attributes.format) }),
      },
      tick: {
        default: 0,
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-date-field]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-date-field": "", class: "date-field" }),
      formatDate(dateFormat(node.attrs.format)),
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      const paint = (current: typeof node) => {
        dom.className = "date-field"
        const format = dateFormat(current.attrs.format)
        paintField(dom, formatDate(format), dateFieldCode(format))
      }
      paint(node)
      return {
        dom,
        ignoreMutation: () => true,
        update(current) {
          if (current.type.name !== "dateField") {
            return false
          }
          paint(current)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertDateField:
        (format) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { format: dateFormat(format) } }),
      updateDateFields:
        () =>
        ({ state, tr }) => {
          const tick = Date.now()
          let found = false
          state.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) {
              return
            }
            found = true
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, tick })
          })
          return found
        },
    }
  },
})

export const FormulaField = Node.create({
  name: "formulaField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      expression: {
        default: "",
        parseHTML: (element) => clipFieldText(element.getAttribute("data-formula") ?? ""),
        renderHTML: (attributes) => ({ "data-formula": clipFieldText(String(attributes.expression ?? "")) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-formula]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const result = evaluateFormula(String(node.attrs.expression ?? ""))
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: result.ok ? "formula-field" : "formula-field is-error",
      }),
      result.ok ? result.value : result.error,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      const paint = (current: typeof node) => {
        const expression = String(current.attrs.expression ?? "")
        paintResult(dom, "formula-field", evaluateFormula(expression), formulaFieldCode(expression))
      }
      paint(node)
      return {
        dom,
        ignoreMutation: () => true,
        update(current) {
          if (current.type.name !== "formulaField") {
            return false
          }
          paint(current)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertFormula:
        () =>
        ({ commands, state, tr }) => {
          const from = state.selection.from
          if (!commands.insertContent({ type: this.name, attrs: { expression: "2 + 2" } })) {
            return false
          }
          selectInserted(tr, this.name, from)
          return true
        },
    }
  },
})

export const IfField = Node.create({
  name: "ifField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      left: fieldAttr("data-if-left", "1"),
      operator: {
        default: "=",
        parseHTML: (element) => {
          const value = element.getAttribute("data-if-op") ?? "="
          return isIfOperator(value) ? value : "="
        },
        renderHTML: (attributes) => ({
          "data-if-op": isIfOperator(String(attributes.operator)) ? attributes.operator : "=",
        }),
      },
      right: fieldAttr("data-if-right", "1"),
      thenText: fieldAttr("data-if-then", "Yes"),
      elseText: fieldAttr("data-if-else", "No"),
    }
  },

  parseHTML() {
    return [{ tag: "span[data-if-field]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const result = evaluateIf(
      String(node.attrs.left ?? ""),
      String(node.attrs.operator ?? "="),
      String(node.attrs.right ?? ""),
      String(node.attrs.thenText ?? ""),
      String(node.attrs.elseText ?? ""),
    )
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-if-field": "",
        class: result.ok ? "if-field" : "if-field is-error",
      }),
      result.ok ? result.value : result.error,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      const paint = (current: typeof node) => {
        const left = String(current.attrs.left ?? "")
        const operator = String(current.attrs.operator ?? "=")
        const right = String(current.attrs.right ?? "")
        const thenText = String(current.attrs.thenText ?? "")
        const elseText = String(current.attrs.elseText ?? "")
        paintResult(
          dom,
          "if-field",
          evaluateIf(left, operator, right, thenText, elseText),
          ifFieldCode(left, operator, right, thenText, elseText),
        )
      }
      paint(node)
      return {
        dom,
        ignoreMutation: () => true,
        update(current) {
          if (current.type.name !== "ifField") {
            return false
          }
          paint(current)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertIf:
        () =>
        ({ commands, state, tr }) => {
          const from = state.selection.from
          if (
            !commands.insertContent({
              type: this.name,
              attrs: { left: "1", operator: "=", right: "1", thenText: "Yes", elseText: "No" },
            })
          ) {
            return false
          }
          selectInserted(tr, this.name, from)
          return true
        },
    }
  },
})

function fieldAttr(name: string, fallback: string) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => clipFieldText(element.getAttribute(name) ?? fallback),
    renderHTML: (attributes: Record<string, unknown>) => ({
      [name]: clipFieldText(String(attributes[attrKey(name)] ?? fallback)),
    }),
  }
}

function attrKey(name: string) {
  switch (name) {
    case "data-if-left":
      return "left"
    case "data-if-right":
      return "right"
    case "data-if-then":
      return "thenText"
    case "data-if-else":
      return "elseText"
    default:
      return name
  }
}

function paintResult(
  dom: HTMLElement,
  className: string,
  result: { ok: true; value: string } | { ok: false; error: string },
  code: string,
) {
  dom.className = result.ok ? className : `${className} is-error`
  paintField(dom, result.ok ? result.value : result.error, code)
}

function selectInserted(tr: Transaction, typeName: string, from: number) {
  const after = tr.mapping.map(from)
  for (const pos of [after - 1, after, tr.mapping.map(from, -1)]) {
    if (pos < 0 || pos > tr.doc.content.size) {
      continue
    }
    if (tr.doc.nodeAt(pos)?.type.name === typeName) {
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return
    }
  }
}
