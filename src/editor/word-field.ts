import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import { paintField, preservedFieldCode } from "@/editor/field-codes"
import { pageLabelAt } from "@/editor/toc"
import { formatSequence, parseInstruction, wordBookmarkName } from "@/document/field-instructions"

export { formatSequence, isAppField, parseInstruction, wordBookmarkName } from "@/document/field-instructions"

/**
 * Word's caption and cross-reference fields, kept as fields: SEQ (the number in "Figure 1"), REF (a bookmark's text,
 * or "above"/"below" with \p) and PAGEREF (the page a bookmark is on). The node holds the instruction and the result
 * it shows; results follow the document as it changes, as Word's do after F9. A field read from a .docx keeps the
 * markup it was read from (`source`) and is saved as it was while neither its instruction nor its result changed.
 */

// --- bookmarks ---------------------------------------------------------------------------------------------------

export type BookmarkPlace = { name: string; pos: number; end: number; text: string }

function payloadBookmarks(payload: unknown) {
  const out: { kind: "start" | "end"; id: number; name?: string }[] = []
  try {
    const items = JSON.parse(String(payload ?? "")) as { kind?: string; id?: number; name?: string }[]
    for (const item of Array.isArray(items) ? items : []) {
      if (item.kind === "bookmarkStart" && typeof item.id === "number") {
        out.push({ kind: "start", id: item.id, name: String(item.name ?? "") })
      } else if (item.kind === "bookmarkEnd" && typeof item.id === "number") {
        out.push({ kind: "end", id: item.id })
      }
    }
  } catch {
    // Not a bookmark.
  }
  return out
}

/** Text an inline node contributes to a bookmark or caption: text, a field's result, a kept field's text. */
function inlineText(node: ProseNode) {
  if (node.isText) {
    return node.text ?? ""
  }
  if (node.type.name === "wordField") {
    return String(node.attrs.result ?? "")
  }
  if (node.type.name === "wordInline" && node.attrs.role === "field") {
    return String(node.attrs.text ?? node.textContent ?? "")
  }
  if (node.type.name === "docTab") {
    return "\t"
  }
  return ""
}

/**
 * Every bookmark in the document by Word name, with where it starts and the text it holds: the editor's own
 * (a `bookmark` mark; the first range of each name) and the ones kept from a .docx (start and end markers).
 */
export function collectBookmarks(doc: ProseNode) {
  const found = new Map<string, BookmarkPlace>()
  const open = new Map<number, BookmarkPlace>()
  const marked = new Set<string>()
  const closedMarks = new Set<string>()
  doc.descendants((node, pos) => {
    if (node.isBlock) {
      return true
    }
    if (node.type.name === "wordInline" && node.attrs.role === "bookmark") {
      for (const item of payloadBookmarks(node.attrs.payload)) {
        if (item.kind === "start" && item.name && !found.has(item.name)) {
          const place = { name: item.name, pos, end: pos, text: "" }
          found.set(item.name, place)
          open.set(item.id, place)
        } else if (item.kind === "end") {
          open.delete(item.id)
        }
      }
      return false
    }
    const text = inlineText(node)
    for (const place of open.values()) {
      place.text += text
      place.end = pos + node.nodeSize
    }
    const names = new Set(
      node.marks.filter((mark) => mark.type.name === "bookmark").map((mark) => wordBookmarkName(String(mark.attrs.id))),
    )
    for (const name of marked) {
      if (!names.has(name)) {
        closedMarks.add(name)
      }
    }
    for (const name of names) {
      if (closedMarks.has(name)) {
        continue
      }
      const place = found.get(name) ?? { name, pos, end: pos, text: "" }
      found.set(name, place)
      if (!marked.has(name)) {
        marked.add(name)
      }
      place.text += text
      place.end = pos + node.nodeSize
    }
    for (const name of [...marked]) {
      if (!names.has(name)) {
        marked.delete(name)
      }
    }
    return false
  })
  for (const place of found.values()) {
    place.text = place.text.replace(/\u200b/g, "").trim()
  }
  return found
}

// --- results -----------------------------------------------------------------------------------------------------

type Context = { bookmarks: Map<string, BookmarkPlace>; pageAt: (pos: number) => string | null }

/**
 * The result every field should show, in document order: SEQ numbers counted per identifier (reset by \r n, by a
 * heading at level ≤ n with \s n; \c repeats; \h hides), REF and PAGEREF from the bookmarks. Fields kept from a .docx
 * count towards the SEQ numbers but are not changed.
 */
export function fieldResults(doc: ProseNode, context: Context) {
  const counters = new Map<string, number>()
  const resets: { identifier: string; level: number }[] = []
  const results = new Map<number, string>()
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level) || 1
      for (const reset of resets) {
        if (level <= reset.level) {
          counters.set(reset.identifier, 0)
        }
      }
      return true
    }
    let instr: string
    if (node.type.name === "wordField") {
      instr = String(node.attrs.instr ?? "")
    } else if (node.type.name === "wordInline" && node.attrs.role === "field") {
      instr = preservedFieldCode(String(node.attrs.payload ?? ""))
    } else {
      return true
    }
    const parsed = parseInstruction(instr)
    let result: string | null = null
    if (parsed.kind === "SEQ" && parsed.argument) {
      const identifier = parsed.argument.toLowerCase()
      const level = Number(parsed.switches.get("s"))
      if (level > 0 && !resets.some((reset) => reset.identifier === identifier)) {
        resets.push({ identifier, level })
      }
      const current = counters.get(identifier) ?? 0
      const reset = parsed.switches.get("r")
      const next =
        reset !== undefined && reset !== "" ? Number(reset) : parsed.switches.has("c") ? current : current + 1
      counters.set(identifier, Number.isFinite(next) ? next : current + 1)
      result = parsed.switches.has("h") ? "" : formatSequence(counters.get(identifier)!, parsed.switches.get("*"))
    } else if (parsed.kind === "REF" || parsed.kind === "PAGEREF") {
      const target = context.bookmarks.get(parsed.argument)
      if (target) {
        const relative = target.pos < pos ? "above" : "below"
        if (parsed.kind === "REF") {
          result = parsed.switches.has("p") ? relative : target.text
        } else {
          const page = context.pageAt(target.pos)
          const here = context.pageAt(pos)
          result = parsed.switches.has("p") && page && page === here ? relative : page
          if (result && parsed.switches.has("p") && page !== here) {
            result = `on page ${page}`
          }
        }
      }
    }
    if (node.type.name === "wordField" && result !== null) {
      results.set(pos, result)
    }
    return false
  })
  return results
}

const fieldKey = new PluginKey("wordFields")
const REFRESH = "refreshFields"

/** Brings every field's result up to date in `tr` (nothing when they already are). */
function refresh(tr: Transaction, pageAt: Context["pageAt"], forced: boolean) {
  // Twice: a reference to "Figure 1" reads the caption's number, which the first pass may have just changed.
  for (let pass = 0; pass < 2; pass += 1) {
    const results = fieldResults(tr.doc, { bookmarks: collectBookmarks(tr.doc), pageAt })
    let changed = false
    for (const [pos, result] of results) {
      const node = tr.doc.nodeAt(pos)
      // A field read from Word keeps the result Word gave it until F9, as in Word; the app's own follow every edit.
      if (node && node.attrs.result !== result && (forced || !node.attrs.source)) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, result })
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }
  return tr
}

/** F9 and the dialogs: update every field now (also the page numbers, which change with layout, not edits). */
export function refreshFields(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(REFRESH, true))
}

export const WordField = Node.create({
  name: "wordField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      instr: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-instr") ?? "",
        renderHTML: (attributes) => ({ "data-instr": String(attributes.instr ?? "") }),
      },
      result: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-result") ?? element.textContent ?? "",
        renderHTML: (attributes) => ({ "data-result": String(attributes.result ?? "") }),
      },
      /** The Word markup it was read from, and the result it showed then: saved as read while both still match. */
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-source") ?? "",
        renderHTML: (attributes) => (attributes.source ? { "data-source": String(attributes.source) } : {}),
      },
      readResult: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-read") ?? "",
        renderHTML: (attributes) => (attributes.readResult ? { "data-read": String(attributes.readResult) } : {}),
      },
      readInstr: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-read-instr") ?? "",
        renderHTML: (attributes) => (attributes.readInstr ? { "data-read-instr": String(attributes.readInstr) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-word-field]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-word-field": "", class: "word-field" }),
      String(node.attrs.result ?? ""),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.result ?? "")
  },

  extendNodeSchema(extension) {
    // The result counts as the paragraph's text (find, word count, a caption's text for references).
    return extension.name === "wordField" ? { leafText: (node: ProseNode) => String(node.attrs.result ?? "") } : {}
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      dom.className = "word-field"
      const paint = (current: ProseNode) => {
        dom.dataset.instr = String(current.attrs.instr ?? "")
        // An index entry is hidden text in Word: shown only with formatting marks on.
        dom.classList.toggle("is-index-entry", /^\s*XE\b/i.test(dom.dataset.instr))
        paintField(dom, String(current.attrs.result ?? ""), String(current.attrs.instr ?? "").trim())
      }
      paint(node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "wordField") {
            return false
          }
          paint(next)
          return true
        },
      }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const pageAt = (pos: number) => pageLabelAt(editor, pos)
    return [
      new Plugin({
        key: fieldKey,
        appendTransaction(transactions, _old, state) {
          const forced = transactions.some((tr) => tr.getMeta(REFRESH))
          if (!forced && !transactions.some((tr) => tr.docChanged)) {
            return null
          }
          let has = false
          state.doc.descendants((node) => {
            has ||= node.type.name === "wordField"
            return !has
          })
          if (!has) {
            return null
          }
          const tr = refresh(state.tr, pageAt, forced)
          return tr.docChanged ? tr : null
        },
        props: {
          // Ctrl+click on a cross-reference inserted as a hyperlink (\h) goes to what it refers to.
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type.name !== "wordField" || !(event.ctrlKey || event.metaKey)) {
              return false
            }
            const parsed = parseInstruction(String(node.attrs.instr ?? ""))
            if ((parsed.kind !== "REF" && parsed.kind !== "PAGEREF") || !parsed.switches.has("h")) {
              return false
            }
            const target = collectBookmarks(view.state.doc).get(parsed.argument)
            if (!target || target.pos === nodePos) {
              return false
            }
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target.pos))).scrollIntoView(),
            )
            return true
          },
        },
      }),
    ]
  },
})
