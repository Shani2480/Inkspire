import { useReviewStore } from "@/document/review"
import { Extension, Mark, type Editor } from "@tiptap/core"
import { isHistoryTransaction } from "@tiptap/pm/history"
import type { Node as ProseNode, Schema, Slice } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"
import { TextSelection, type Transaction } from "@tiptap/pm/state"
import { ReplaceStep } from "@tiptap/pm/transform"

export const TRACK_META = "track-changes"

export type TrackedChange = {
  id: string
  kind: "insertion" | "deletion"
  author: string
  time: string
  from: number
  to: number
  text: string
}

export function ignoreTracking(tr: Transaction) {
  return tr.setMeta(TRACK_META, "ignore")
}

function trackAttributes(kind: "insertion" | "deletion") {
  const data = kind === "insertion" ? "data-insertion" : "data-deletion"
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
      if (mark.type.name !== "insertion" && mark.type.name !== "deletion") {
        continue
      }
      const end = pos + node.nodeSize
      const last = changes[changes.length - 1]
      if (last && last.id === mark.attrs.id && last.kind === mark.type.name && last.to === pos) {
        last.to = end
        continue
      }
      changes.push({
        id: String(mark.attrs.id || `${mark.type.name}-${pos}`),
        kind: mark.type.name,
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

function markAttrs(previous: ProseNode | null, kind: "insertion" | "deletion") {
  const mark = previous?.marks.find((item) => item.type.name === kind)
  if (mark?.attrs.id) {
    return { id: mark.attrs.id, author: mark.attrs.author || "Me", time: mark.attrs.time || "" }
  }
  return freshAttrs()
}

function freshAttrs() {
  return {
    id: crypto.randomUUID(),
    author: "Me",
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
