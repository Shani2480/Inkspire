import { currentNoteLabels, watchNoteLabel } from "@/editor/note-labels"
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
    return ({ node, editor, getPos }) => {
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
        } else if (role === "note") {
          // A note's number in the document's options, as the app numbers its own notes alongside.
          const pos = getPos()
          const label = (typeof pos === "number" ? currentNoteLabels(editor).get(pos) : undefined) ?? text
          if (dom.textContent !== label) {
            dom.textContent = label
          }
        } else if (dom.textContent !== text) {
          dom.textContent = text
        }
      }
      let latest = node
      paint(node)
      const stop = node.attrs.role === "note" ? watchNoteLabel(() => paint(latest)) : undefined
      return {
        dom,
        destroy: stop,
        ignoreMutation: () => true,
        update(current) {
          if (current.type.name !== "wordInline" || (current.attrs.role === "note") !== (tag === "sup")) {
            return false
          }
          latest = current
          paint(current)
          return true
        },
      }
    }
  },
})

/** Markup a Word block shows, without anything that could run or navigate. */
function shownMarkup(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html
  template.content
    .querySelectorAll("script, style, iframe, object, embed, link, meta, form")
    .forEach((node) => node.remove())
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (
        /^on/i.test(attribute.name) ||
        ((attribute.name === "href" || attribute.name === "src") && !/^(#|data:image\/)/i.test(attribute.value))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return template.content
}

/** A block content control or display equation from a Word document. */
export const WordBlock = Node.create({
  name: "wordBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      ...preservedAttributes(),
      /** The control's content drawn as the body's paragraphs are (its styles, Placeholder Text); display only. */
      shown: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-shown") ?? "",
        renderHTML: (attributes: { shown?: string }) => (attributes.shown ? { "data-shown": attributes.shown } : {}),
      },
    }
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement("div")
      for (const [name, value] of Object.entries(
        mergeAttributes(HTMLAttributes, { "data-word-block": "", class: "word-block" }),
      )) {
        if (typeof value === "string" && name !== "data-shown" && name !== "data-payload") {
          dom.setAttribute(name, value)
        }
      }
      dom.contentEditable = "false"
      const shown = String(node.attrs.shown ?? "")
      if (shown) {
        dom.append(shownMarkup(shown))
      } else {
        for (const line of String(node.attrs.text ?? "").split("\n")) {
          const paragraph = document.createElement("p")
          paragraph.textContent = line
          dom.append(paragraph)
        }
      }
      return { dom, ignoreMutation: () => true }
    }
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
  // Outside the formatting marks (text style 101, bold 100): the character style it carries is drawn on its span,
  // so the run's direct formatting, on spans inside it, wins as in Word. Links (1000) stay outside it.
  priority: 200,
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
      /**
       * Toggles its styles give that the Word run turns off ("b i"), drawn by index.css. Never saved: the run's own
       * properties keep them.
       */
      off: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-run-off"),
        renderHTML: (attributes: { off?: string | null }) => (attributes.off ? { "data-run-off": attributes.off } : {}),
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
