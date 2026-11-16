import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import { paintField, preservedFieldCode } from "@/editor/field-codes"
import { pageLabelAt } from "@/editor/toc"
import { formatSequence, parseInstruction, wordBookmarkName } from "@/document/field-instructions"
import { citationContext, formatCitation, parseCitation } from "@/document/bibliography"
import { useBibliography } from "@/document/bibliography-store"
import { infoFieldResult, isComputedField, type FieldInfo } from "@/document/field-results"
import { useDocumentStore } from "@/document/store"
import { previewContext, useMailMerge } from "@/document/mail-merge"
import { isMergeField } from "@/document/field-instructions"
import { useUserSettings } from "@/document/user-settings"
import { styleName } from "@/editor/style-inspect"
import { countWords } from "@/editor/word-count"

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

type Context = {
  bookmarks: Map<string, BookmarkPlace>
  pageAt: (pos: number) => string | null
  /** A CITATION field's result in the document's style, from its sources. */
  citation?: (instr: string) => string
  /** Document properties, counts and the like, for the Field dialog's other fields (AUTHOR, NUMPAGES…). */
  info?: FieldInfo
}

/** The sources cited in a document, in the order first cited (IEEE numbers them so). */
export function citedTags(doc: ProseNode) {
  const order: string[] = []
  doc.descendants((node) => {
    if (node.type.name === "wordField") {
      order.push(...(parseCitation(String(node.attrs.instr ?? ""))?.tags ?? []))
      return false
    }
    return true
  })
  return order
}

/** Formats citations from the document's sources and style, as they are now. */
export function citationFormatter(doc: ProseNode) {
  const { sources, style } = useBibliography.getState()
  const context = citationContext(sources, style, citedTags(doc))
  return (instr: string) => formatCitation(instr, context)
}

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
    } else if (parsed.kind === "CITATION" && context.citation) {
      result = context.citation(instr)
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
    } else if (parsed.kind !== "SEQ" && parsed.kind !== "XE" && node.type.name === "wordField" && context.info) {
      result = infoFieldResult(instr, context.info, pos)
    }
    if (node.type.name === "wordField" && result !== null) {
      results.set(pos, result)
    }
    return false
  })
  return results
}

/** The editor's document properties, counts and page layout, as the Field dialog's other fields read them. */
export function fieldInfo(editor: Editor, doc: ProseNode): FieldInfo {
  const store = useDocumentStore.getState()
  const props = store.documentProps
  const user = useUserSettings.getState()
  const pagination = editor.storage.pagination as { breaks?: number[]; pageCount?: number; sectionStarts?: boolean[] } | undefined
  const pageIndex = (pos: number) => (pagination?.breaks ?? []).filter((at) => at <= pos).length
  const pageCount = () => Math.max(1, pagination?.pageCount ?? 1)
  let text: string | null = null
  const allText = () => (text ??= doc.textBetween(0, doc.content.size, "\n", " "))
  return {
    now: new Date(),
    locale: user.locale || undefined,
    props: {
      title: props.title,
      subject: props.subject,
      keywords: props.tags,
      comments: props.comments,
      author: props.author || user.author,
      company: props.company,
      category: props.category,
      createdAt: props.createdAt,
      savedAt: store.lastSavedTimestamp,
      printedAt: props.lastPrintedAt,
      editingMinutes: Math.round(props.totalEditingMs / 60000),
    },
    fileName: store.fileName,
    path: store.currentFilePath,
    merge: previewContext(),
    user: { name: user.author, initials: user.initials, address: "" },
    pages: pageCount,
    words: () => countWords(allText()),
    characters: () => allText().replace(/\s/g, "").length,
    pageAt: (pos) => pageAt(editor, pos),
    section: (pos) => {
      // A page that starts a section (sectionStarts[i]) begins the next one; the first page begins section 1.
      const starts = pagination?.sectionStarts ?? []
      const page = pageIndex(pos)
      let number = 1
      let first = 0
      for (let index = 1; index <= page; index += 1) {
        if (starts[index]) {
          number += 1
          first = index
        }
      }
      let last = first
      while (last + 1 < pageCount() && !starts[last + 1]) {
        last += 1
      }
      return { number, pages: last - first + 1 }
    },
    styleText: (style, pos) => {
      const wanted = style.toLowerCase()
      let before: string | null = null
      let after: string | null = null
      doc.descendants((node, at) => {
        if (!node.isTextblock) {
          return true
        }
        const id = node.type.name === "heading" ? `heading-${Number(node.attrs.level) || 1}` : String(node.attrs.namedStyle || "normal")
        if (styleName(id).toLowerCase() === wanted || id.toLowerCase() === wanted) {
          if (at < pos) {
            before = node.textContent
          } else if (after === null) {
            after = node.textContent
          }
        }
        return false
      })
      return before ?? after
    },
  }
}

function pageAt(editor: Editor, pos: number) {
  return pageLabelAt(editor, pos)
}

const fieldKey = new PluginKey("wordFields")
const REFRESH = "refreshFields"
/** Citations only: the sources or the style changed, which Word shows in every citation at once. */
export const REFRESH_CITATIONS = "refreshCitations"
/** Merge fields only: Preview Results, the record shown, the list or Match Fields changed. */
export const REFRESH_MERGE = "refreshMergeFields"

/** Brings every field's result up to date in `tr` (nothing when they already are). */
function refresh(
  tr: Transaction,
  pageAt: Context["pageAt"],
  forced: boolean,
  citations = forced,
  info?: (doc: ProseNode) => FieldInfo,
  merge = false,
) {
  // Twice: a reference to "Figure 1" reads the caption's number, which the first pass may have just changed.
  for (let pass = 0; pass < 2; pass += 1) {
    const results = fieldResults(tr.doc, {
      bookmarks: collectBookmarks(tr.doc),
      pageAt,
      citation: citationFormatter(tr.doc),
      info: info?.(tr.doc),
    })
    let changed = false
    for (const [pos, result] of results) {
      const node = tr.doc.nodeAt(pos)
      const isCitation = /^\s*CITATION\b/i.test(String(node?.attrs.instr ?? ""))
      const isMerge = merge && isMergeField(String(node?.attrs.instr ?? ""))
      // A field read from Word keeps the result Word gave it until F9, as in Word; the app's own follow every edit.
      if (node && node.attrs.result !== result && (forced || (citations && isCitation) || isMerge || !node.attrs.source)) {
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
        // Mailings: Highlight Merge Fields shades these; an Address Block keeps its lines.
        dom.classList.toggle("is-merge-field", isMergeField(dom.dataset.instr))
        // A field the app has no result for (FILESIZE, a TOC inserted from the Field dialog) shows its code faintly,
        // so it is not lost; Word would show its own result there after F9.
        const empty = !String(current.attrs.result ?? "") && !isComputedField(dom.dataset.instr)
        dom.classList.toggle("is-empty", empty)
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
          const citations = forced || transactions.some((tr) => tr.getMeta(REFRESH_CITATIONS))
          const merge = transactions.some((tr) => tr.getMeta(REFRESH_MERGE))
          if (!citations && !merge && !transactions.some((tr) => tr.docChanged)) {
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
          const tr = refresh(state.tr, pageAt, forced, citations, (doc) => fieldInfo(editor, doc), merge)
          return tr.docChanged ? tr : null
        },
        view(view) {
          // Editing a source or choosing another style changes every citation, as in Word.
          const unsubscribe = useBibliography.subscribe((next, previous) => {
            if (
              next.sources !== previous.sources ||
              next.style !== previous.style ||
              next.refresh !== previous.refresh
            ) {
              queueMicrotask(() => {
                if (!view.isDestroyed) {
                  view.dispatch(view.state.tr.setMeta(REFRESH_CITATIONS, true).setMeta("addToHistory", false))
                }
              })
            }
          })
          // Preview Results shows the record's values in every merge field (Mailings).
          const unsubscribeMerge = useMailMerge.subscribe((next, previous) => {
            if (
              next.preview !== previous.preview ||
              next.position !== previous.position ||
              next.source !== previous.source ||
              next.fieldMap !== previous.fieldMap ||
              next.included !== previous.included ||
              next.sort !== previous.sort ||
              next.filters !== previous.filters
            ) {
              queueMicrotask(() => {
                if (!view.isDestroyed) {
                  view.dispatch(view.state.tr.setMeta(REFRESH_MERGE, true).setMeta("addToHistory", false))
                }
              })
            }
          })
          return {
            destroy: () => {
              unsubscribe()
              unsubscribeMerge()
            },
          }
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
