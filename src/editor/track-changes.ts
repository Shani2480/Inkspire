import { useReviewStore } from "@/document/review"
import { Extension, Mark, type Editor } from "@tiptap/core"
import { isHistoryTransaction } from "@tiptap/pm/history"
import type { Mark as ProseMark, Node as ProseNode, Schema, Slice } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"
import { TextSelection, type Transaction } from "@tiptap/pm/state"
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from "@tiptap/pm/transform"
import { useUserSettings } from "@/document/user-settings"

export const TRACK_META = "track-changes"

export type TrackedChange = {
  id: string
  kind: "insertion" | "deletion" | "format"
  author: string
  time: string
  from: number
  to: number
  text: string
  /** A formatting change as Word's balloon says it: "Formatted: Bold, Italic". */
  description?: string
}

/** Marks that are character formatting (what Word's w:rPrChange records); the rest are links, comments, anchors. */
export const FORMATTING_MARKS = [
  "textStyle",
  "bold",
  "code",
  "italic",
  "strike",
  "underline",
  "subscript",
  "superscript",
  "textBorder",
  "highlight",
]

export type SavedMark = { type: string; attrs?: Record<string, unknown> }

/** The formatting a text node has, in a stable order, as the formatChange mark records it. */
export function formattingOf(marks: readonly ProseMark[]): SavedMark[] {
  return marks
    .filter((mark) => FORMATTING_MARKS.includes(mark.type.name))
    .map((mark) => {
      const attrs = Object.fromEntries(Object.entries(mark.attrs).filter(([, value]) => value != null && value !== ""))
      return Object.keys(attrs).length > 0 ? { type: mark.type.name, attrs } : { type: mark.type.name }
    })
    .sort((left, right) => left.type.localeCompare(right.type))
}

export function readSavedMarks(value: unknown): SavedMark[] {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SavedMark => typeof (item as SavedMark)?.type === "string")
      : []
  } catch {
    return []
  }
}

const sameFormatting = (left: SavedMark[], right: SavedMark[]) => JSON.stringify(left) === JSON.stringify(right)

const MARK_NAMES: Record<string, string> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strike: "Strikethrough",
  subscript: "Subscript",
  superscript: "Superscript",
  highlight: "Highlight",
  code: "Font",
  textBorder: "Border",
}

/** Word's balloon text for a formatting change: what was added, and "Not Bold" for what was taken off. */
export function describeFormatting(before: SavedMark[], after: SavedMark[]) {
  const parts: string[] = []
  const names = (list: SavedMark[]) => new Set(list.map((mark) => mark.type))
  const was = names(before)
  const now = names(after)
  for (const mark of after) {
    if (mark.type === "textStyle") {
      const old = before.find((item) => item.type === "textStyle")?.attrs ?? {}
      for (const [key, value] of Object.entries(mark.attrs ?? {})) {
        if (old[key] !== value) {
          parts.push(textStyleLabel(key, value))
        }
      }
    } else if (!was.has(mark.type)) {
      parts.push(MARK_NAMES[mark.type] ?? mark.type)
    }
  }
  for (const mark of before) {
    if (mark.type !== "textStyle" && !now.has(mark.type)) {
      parts.push(`Not ${MARK_NAMES[mark.type] ?? mark.type}`)
    }
  }
  return parts.length > 0 ? `Formatted: ${parts.join(", ")}` : "Formatted"
}

function textStyleLabel(key: string, value: unknown) {
  if (key === "fontSize") {
    return `Font size: ${String(value).replace(/pt$/, "")} pt`
  }
  if (key === "fontFamily") {
    return `Font: ${String(value).split(",")[0]?.replace(/["']/g, "")}`
  }
  if (key === "color") {
    return "Font color"
  }
  return key
}

export function ignoreTracking(tr: Transaction) {
  return tr.setMeta(TRACK_META, "ignore")
}

function trackAttributes(kind: "insertion" | "deletion" | "format") {
  const data = kind === "insertion" ? "data-insertion" : kind === "deletion" ? "data-deletion" : "data-format-change"
  return {
    id: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-id") ?? "",
      renderHTML: (attributes: { id?: string }) => ({ "data-id": attributes.id ?? "" }),
    },
    author: {
      default: "Me",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-author") || "Me",
      renderHTML: (attributes: { author?: string }) => ({ "data-author": attributes.author || "Me" }),
    },
    time: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-time") ?? "",
      renderHTML: (attributes: { time?: string }) => ({ "data-time": attributes.time ?? "" }),
    },
    kind: {
      default: kind,
      parseHTML: () => kind,
      renderHTML: () => ({ [data]: "" }),
    },
  }
}

export const Insertion = Mark.create({
  name: "insertion",
  inclusive: false,
  excludes: "insertion deletion",
  keepOnSplit: false,
  addAttributes() {
    return trackAttributes("insertion")
  },
  parseHTML() {
    return [{ tag: "span[data-insertion]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "track-insertion" }, 0]
  },
})

/** A formatting change while tracking: the text's formatting before it, so Reject can put it back. */
export const FormatChange = Mark.create({
  name: "formatChange",
  inclusive: false,
  keepOnSplit: false,
  addAttributes() {
    return {
      ...trackAttributes("format"),
      before: {
        default: "[]",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-before") ?? "[]",
        renderHTML: (attributes: { before?: string }) => ({ "data-before": attributes.before ?? "[]" }),
      },
      /** The w:rPrChange it was read from, saved as it was while the change is the same. */
      source: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-source") ?? "",
        renderHTML: (attributes: { source?: string }) =>
          attributes.source ? { "data-source": attributes.source } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-format-change]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "track-format" }, 0]
  },
})

export const Deletion = Mark.create({
  name: "deletion",
  inclusive: false,
  excludes: "deletion insertion",
  keepOnSplit: false,
  addAttributes() {
    return trackAttributes("deletion")
  },
  parseHTML() {
    return [{ tag: "span[data-deletion]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "track-deletion" }, 0]
  },
})

export function listChanges(doc: ProseNode) {
  const changes: TrackedChange[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }
    for (const mark of node.marks) {
      if (mark.type.name !== "insertion" && mark.type.name !== "deletion" && mark.type.name !== "formatChange") {
        continue
      }
      const kind = mark.type.name === "formatChange" ? "format" : (mark.type.name as "insertion" | "deletion")
      const end = pos + node.nodeSize
      const last = changes[changes.length - 1]
      if (last && last.id === mark.attrs.id && last.kind === kind && last.to === pos) {
        last.to = end
        continue
      }
      changes.push({
        id: String(mark.attrs.id || `${mark.type.name}-${pos}`),
        kind,
        ...(kind === "format"
          ? { description: describeFormatting(readSavedMarks(mark.attrs.before), formattingOf(node.marks)) }
          : {}),
        author: String(mark.attrs.author || "Me"),
        time: String(mark.attrs.time ?? ""),
        from: pos,
        to: end,
        text: "",
      })
    }
  })
  return changes.map((change) => ({
    ...change,
    text: doc.textBetween(change.from, change.to, ""),
  }))
}

export function changeAtSelection(doc: ProseNode, from: number, to: number) {
  const changes = listChanges(doc)
  const head = from
  return (
    changes.find((change) => change.from <= head && head < change.to) ??
    changes.find((change) => from < change.to && to > change.from) ??
    null
  )
}

export function acceptChanges(editor: Editor, ids?: string[]) {
  return settleChanges(editor, "accept", ids)
}

export function rejectChanges(editor: Editor, ids?: string[]) {
  return settleChanges(editor, "reject", ids)
}

function settleChanges(editor: Editor, action: "accept" | "reject", ids?: string[]) {
  const changes = listChanges(editor.state.doc).filter((change) => !ids || ids.includes(change.id))
  if (changes.length === 0) {
    return false
  }
  const insertion = editor.schema.marks.insertion
  const deletion = editor.schema.marks.deletion
  if (!insertion || !deletion) {
    return false
  }
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      ignoreTracking(tr)
      const removals = changes
        .filter((change) => (action === "accept" ? change.kind === "deletion" : change.kind === "insertion"))
        .sort((left, right) => right.from - left.from)
      for (const change of removals) {
        const block = wholeBlock(tr.doc, change.from, change.to)
        if (block) {
          // A paragraph that came or went whole goes with its text, not leaving an empty line behind.
          tr.delete(block.from, block.to)
        } else {
          tr.delete(change.from, change.to)
        }
      }
      const formats = editor.schema.marks.formatChange
      for (const change of changes.filter((item) => item.kind === "format")) {
        if (formats) {
          settleFormat(tr, change, action, formats)
        }
      }
      const marks = changes.filter((change) =>
        action === "accept" ? change.kind === "insertion" : change.kind === "deletion",
      )
      for (const change of marks) {
        const from = tr.mapping.map(change.from)
        const to = tr.mapping.map(change.to)
        tr.removeMark(from, to, change.kind === "insertion" ? insertion : deletion)
      }
      return true
    })
    .run()
}

/** Accept keeps the new formatting; Reject puts back what each piece of text had before. */
function settleFormat(
  tr: Transaction,
  change: TrackedChange,
  action: "accept" | "reject",
  formats: NonNullable<Schema["marks"][string]>,
) {
  const from = tr.mapping.map(change.from)
  const to = tr.mapping.map(change.to)
  if (action === "reject") {
    const pieces: { from: number; to: number; before: SavedMark[] }[] = []
    tr.doc.nodesBetween(from, to, (node, pos) => {
      const mark = node.isText ? node.marks.find((item) => item.type === formats) : undefined
      if (mark) {
        pieces.push({
          from: Math.max(from, pos),
          to: Math.min(to, pos + node.nodeSize),
          before: readSavedMarks(mark.attrs.before),
        })
      }
    })
    for (const piece of pieces) {
      for (const name of FORMATTING_MARKS) {
        const type = tr.doc.type.schema.marks[name]
        if (type) {
          tr.removeMark(piece.from, piece.to, type)
        }
      }
      for (const saved of piece.before) {
        const type = tr.doc.type.schema.marks[saved.type]
        if (type) {
          tr.addMark(piece.from, piece.to, type.create(saved.attrs ?? {}))
        }
      }
    }
  }
  tr.removeMark(from, to, formats)
}

/**
 * The textblock from `from` to `to` is the whole content of, when its parent has other children too: settling the
 * change removes the block itself. Null otherwise.
 */
function wholeBlock(doc: ProseNode, from: number, to: number) {
  const $from = doc.resolve(from)
  const parent = $from.parent
  if (!parent.isTextblock || $from.parentOffset !== 0 || to !== $from.end() || $from.depth === 0) {
    return null
  }
  if ($from.node($from.depth - 1).childCount < 2) {
    return null
  }
  return { from: $from.before(), to: $from.after() }
}

export const TrackChanges = Extension.create({
  name: "trackChanges",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(tr, state) {
          if (!useReviewStore.getState().tracking) {
            return true
          }
          if (tr.getMeta(TRACK_META) === "ignore" || isHistoryTransaction(tr) || tr.getMeta("addToHistory") === false) {
            return true
          }
          if (tr.getMeta("trackOrigin") == null) {
            tr.setMeta("trackOrigin", state.selection.from)
          }
          return true
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!useReviewStore.getState().tracking) {
            return null
          }
          const fresh = transactions.filter(
            (tr) =>
              tr.docChanged &&
              tr.getMeta(TRACK_META) !== "ignore" &&
              !isHistoryTransaction(tr) &&
              tr.getMeta("addToHistory") !== false,
          )
          if (fresh.length === 0) {
            return null
          }
          try {
            const tr = newState.tr
            let changed = false
            for (const transaction of fresh) {
              if (rewriteTransaction(transaction, tr, newState.schema)) {
                changed = true
              }
              if (trackFormatting(transaction, tr, newState.schema)) {
                changed = true
              }
            }
            if (!changed) {
              return null
            }
            ignoreTracking(tr)
            return tr
          } catch (error) {
            console.error(error)
            return null
          }
        },
      }),
    ]
  },
})

function rewriteTransaction(transaction: Transaction, tr: Transaction, schema: Schema) {
  const insertion = schema.marks.insertion
  const deletion = schema.marks.deletion
  if (!insertion || !deletion) {
    return false
  }
  const origin = transaction.getMeta("trackOrigin")
  const lastIndex = transaction.steps.length - 1
  let changed = false
  const steps = transaction.steps.map((step, index) => ({ step, index })).reverse()
  for (const item of steps) {
    const step = item.step
    if (!(step instanceof ReplaceStep)) {
      continue
    }
    const before = transaction.docs[item.index]
    const removed = before.slice(step.from, step.to)
    if (!isInline(removed) || !isInline(step.slice)) {
      continue
    }
    if (step.from === step.to && step.slice.size === 0) {
      continue
    }
    const mapped = transaction.mapping.slice(item.index + 1).map(step.from)
    const at = tr.mapping.map(mapped)
    if (at < 0 || at > tr.doc.content.size) {
      continue
    }
    const $at = tr.doc.resolve(at)
    if (!$at.parent.inlineContent) {
      continue
    }
    const previous = $at.nodeBefore
    const dropRemoved = step.from < step.to && (covered(removed, "insertion") || covered(removed, "deletion"))
    let deletedSize = 0
    if (step.from < step.to && !dropRemoved) {
      const attrs = markAttrs(previous, "deletion")
      tr.insert(at, removed.content)
      deletedSize = removed.content.size
      tr.addMark(at, at + deletedSize, deletion.create(attrs))
      changed = true
    }
    if (step.slice.size > 0) {
      const start = at + deletedSize
      const attrs = deletedSize === 0 ? markAttrs(previous, "insertion") : freshAttrs()
      tr.addMark(start, start + step.slice.size, insertion.create(attrs))
      changed = true
    }
    if (item.index === lastIndex) {
      const caret =
        step.slice.size === 0 && typeof origin === "number" && origin >= step.to
          ? at + deletedSize
          : step.slice.size === 0
            ? at
            : at + deletedSize + step.slice.size
      placeCaret(tr, caret)
    }
  }
  return changed
}

/**
 * Formatting added or taken off while tracking: each piece of text gets a formatChange mark holding the formatting
 * it had before (the first change's, so Reject goes all the way back); text whose formatting is back where it
 * started loses the mark. Text the author inserted while tracking is not marked: it is new as a whole.
 */
function trackFormatting(transaction: Transaction, tr: Transaction, schema: Schema) {
  const formats = schema.marks.formatChange
  if (!formats) {
    return false
  }
  let changed = false
  transaction.steps.forEach((step, index) => {
    if (!(step instanceof AddMarkStep || step instanceof RemoveMarkStep)) {
      return
    }
    if (!FORMATTING_MARKS.includes(step.mark.type.name)) {
      return
    }
    const before = transaction.docs[index]!
    const after = transaction.mapping.slice(index + 1)
    before.nodesBetween(step.from, step.to, (node, pos) => {
      if (!node.isText) {
        return
      }
      const start = Math.max(step.from, pos)
      const end = Math.min(step.to, pos + node.nodeSize)
      const from = tr.mapping.map(after.map(start, 1))
      const to = tr.mapping.map(after.map(end, -1))
      if (from >= to || node.marks.some((mark) => mark.type.name === "insertion")) {
        return
      }
      tr.doc.nodesBetween(from, to, (current, at) => {
        if (!current.isText) {
          return
        }
        const a = Math.max(from, at)
        const b = Math.min(to, at + current.nodeSize)
        const existing = current.marks.find((mark) => mark.type === formats)
        const original = existing ? readSavedMarks(existing.attrs.before) : formattingOf(node.marks)
        if (sameFormatting(original, formattingOf(current.marks))) {
          if (existing) {
            tr.removeMark(a, b, formats)
            changed = true
          }
          return
        }
        if (!existing) {
          tr.addMark(a, b, formats.create({ ...freshAttrs(), before: JSON.stringify(original) }))
          changed = true
        }
      })
    })
  })
  return changed
}

function markAttrs(previous: ProseNode | null, kind: "insertion" | "deletion") {
  const mark = previous?.marks.find((item) => item.type.name === kind)
  if (mark?.attrs.id) {
    return { id: mark.attrs.id, author: mark.attrs.author || "Me", time: mark.attrs.time || "" }
  }
  return freshAttrs()
}

/** The reviewer's name: the user name from setup (File > Options), as Word stamps its changes. */
export function reviewerName() {
  return useUserSettings.getState().author?.trim() || "Me"
}

function freshAttrs() {
  return {
    id: crypto.randomUUID(),
    author: reviewerName(),
    time: new Date().toISOString(),
  }
}

function covered(slice: Slice, name: string) {
  let text = 0
  let marked = 0
  slice.content.descendants((node) => {
    if (!node.isText || !node.text) {
      return
    }
    text += node.text.length
    if (node.marks.some((mark) => mark.type.name === name)) {
      marked += node.text.length
    }
  })
  return text > 0 && marked === text
}

function isInline(slice: Slice) {
  let inline = true
  slice.content.forEach((node) => {
    if (!node.isInline) {
      inline = false
    }
  })
  return inline
}

function placeCaret(tr: Transaction, pos: number) {
  const max = tr.doc.content.size
  const clamped = Math.max(0, Math.min(pos, max))
  const $pos = tr.doc.resolve(clamped)
  const selection = TextSelection.findFrom($pos, 1, true) ?? TextSelection.findFrom($pos, -1, true)
  if (selection) {
    tr.setSelection(selection)
  }
}
