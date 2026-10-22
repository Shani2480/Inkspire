import { Mark, Node, mergeAttributes } from "@tiptap/core"
import { paintField, preservedFieldCode } from "@/editor/field-codes"

/**
 * Word content the editor shows but does not edit. The original model is carried as JSON in `payload` and written
 * back on save; `text` is what the page shows (a field result, a note number, a content control's text).
 */
function preservedAttributes() {
  return {
    payload: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-payload") ?? "",
      renderHTML: (attributes: { payload?: string }) => ({ "data-payload": attributes.payload ?? "" }),
    },
    text: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-text") ?? element.textContent ?? "",
      renderHTML: (attributes: { text?: string }) => ({ "data-text": attributes.text ?? "" }),
    },
    role: {
      default: "raw",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-role") || "raw",
      renderHTML: (attributes: { role?: string }) => ({ "data-role": attributes.role || "raw" }),
    },
  }
}

/** A field, bookmark, note reference, inline content control, or equation from a Word document. */
export const WordInline = Node.create({
  name: "wordInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      ...preservedAttributes(),
      /** A PAGE or NUMPAGES field: a header or footer shows the number of the page it is drawn on. */
      pageField: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-page-field") ?? "",
        renderHTML: (attributes: { pageField?: string }) =>
          attributes.pageField ? { "data-page-field": attributes.pageField } : {},
      },
    }
  },

  parseHTML() {
    // Above the superscript mark, which would otherwise claim a note reference's <sup> as formatted text.
    return [
      { tag: "span[data-word-inline]", priority: 100 },
      { tag: "sup[data-word-inline]", priority: 100 },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = node.attrs.role === "note" ? "sup" : "span"
    return [
      tag,
      mergeAttributes(HTMLAttributes, { "data-word-inline": "", class: "word-inline", contenteditable: "false" }),
      String(node.attrs.text ?? ""),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.text ?? "")
  },

  addNodeView() {
    return ({ node }) => {
      const tag = node.attrs.role === "note" ? "sup" : "span"
      const dom = document.createElement(tag)
      dom.setAttribute("data-word-inline", "")
      dom.className = "word-inline"
      dom.contentEditable = "false"
      const paint = (current: typeof node) => {
        const text = String(current.attrs.text ?? "")
        const payload = String(current.attrs.payload ?? "")
        const role = String(current.attrs.role || "raw")
        dom.setAttribute("data-role", role)
        dom.setAttribute("data-payload", payload)
        dom.setAttribute("data-text", text)
        if (current.attrs.pageField) {
          dom.setAttribute("data-page-field", String(current.attrs.pageField))
        } else {
          dom.removeAttribute("data-page-field")
        }
        if (role === "field") {
          // The result in a span of its own, and the code beside it, for Show field codes (Alt+F9).
          paintField(dom, text, preservedFieldCode(payload))
        } else if (dom.textContent !== text) {
          dom.textContent = text
        }
      }
      paint(node)
      return {
        dom,
        ignoreMutation: () => true,
        update(current) {
          if (current.type.name !== "wordInline" || (current.attrs.role === "note") !== (tag === "sup")) {
            return false
          }
          paint(current)
          return true
        },
      }
    }
  },
})

/** A block content control or display equation from a Word document. */
export const WordBlock = Node.create({
  name: "wordBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return preservedAttributes()
  },

  parseHTML() {
    return [{ tag: "div[data-word-block]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const lines = String(node.attrs.text ?? "").split("\n")
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-word-block": "", class: "word-block", contenteditable: "false" }),
      ...lines.map((line) => ["p", {}, line]),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.text ?? "")
  },
})

/**
 * Links text to the Word run it was opened from, so saving keeps run properties the editor cannot show
 * (character styles, language, tracked formatting). Typing inside a run extends it, as in Word.
 */
export const DocxRun = Mark.create({
  name: "docxRun",
  inclusive: true,
  spanning: true,

  addAttributes() {
    return {
      key: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-docx-run"),
        renderHTML: (attributes: { key?: string | null }) =>
          attributes.key ? { "data-docx-run": attributes.key } : {},
      },
      /** The Word character style, shown by the document stylesheet. */
      rstyle: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-word-rstyle"),
        renderHTML: (attributes: { rstyle?: string | null }) =>
          attributes.rstyle ? { "data-word-rstyle": attributes.rstyle } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-docx-run]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0]
  },
})
