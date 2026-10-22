/**
 * Review > Compare: the differences between two versions of a document, written into the document as tracked
 * insertions and deletions (the same marks Track Changes writes), so the Review pane lists them and each can be
 * accepted or rejected. The documents are compared block by block (paragraphs, headings, tables…), and two blocks
 * that differ are compared word by word, so what a reader sees is the revised text with the words that changed marked.
 */
import { useReviewStore } from "@/document/review"
import { ignoreTracking } from "@/editor/track-changes"
import type { Editor } from "@tiptap/core"
import { DOMParser as ProseParser, Fragment, type Mark, type Node as ProseNode, type Schema } from "@tiptap/pm/model"

export type CompareChange = { kind: "insertion" | "deletion"; text: string }

export type CompareResult = { doc: ProseNode; changes: CompareChange[] }

/** Words, runs of spaces and runs of punctuation, each a token the two texts are lined up by. */
export function tokens(text: string) {
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? []
}

export type AlignStep =
  { op: "same"; left: number; right: number } | { op: "del"; left: number } | { op: "ins"; right: number }

/** The longest common subsequence of two lists, as the steps that turn the left one into the right one. */
export function align<T>(left: T[], right: T[], same: (a: T, b: T) => boolean): AlignStep[] {
  const n = left.length
  const m = right.length
  // Beyond what a table can hold in reason, everything on the left goes and everything on the right comes.
  if (n * m > 4_000_000) {
    return [
      ...left.map((_, index) => ({ op: "del", left: index }) as AlignStep),
      ...right.map((_, index) => ({ op: "ins", right: index }) as AlignStep),
    ]
  }
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = same(left[i], right[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const steps: AlignStep[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (same(left[i], right[j])) {
      steps.push({ op: "same", left: i, right: j })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      steps.push({ op: "del", left: i })
      i += 1
    } else {
      steps.push({ op: "ins", right: j })
      j += 1
    }
  }
  for (; i < n; i += 1) {
    steps.push({ op: "del", left: i })
  }
  for (; j < m; j += 1) {
    steps.push({ op: "ins", right: j })
  }
  return steps
}

/** A document of the editor's schema from HTML, as the other version is read. */
export function parseHtml(schema: Schema, html: string) {
  const host = document.createElement("div")
  host.innerHTML = html
  return ProseParser.fromSchema(schema).parse(host)
}

function stamp(author: string) {
  return { id: crypto.randomUUID(), author, time: new Date().toISOString() }
}

/** `node` with `mark` on every text in it, the way the whole of a block that came or went is marked. */
function markAll(node: ProseNode, mark: Mark): ProseNode {
  if (node.isText) {
    return node.mark(mark.addToSet(node.marks))
  }
  if (node.content.size === 0) {
    return node
  }
  const children: ProseNode[] = []
  node.content.forEach((child) => children.push(markAll(child, mark)))
  return node.copy(Fragment.from(children))
}

/**
 * Where each character of a block's text starts in its content: inline atoms (pictures, fields) have no characters,
 * so a slice between two characters carries the atoms between them along.
 */
function charStarts(block: ProseNode) {
  const starts: number[] = []
  let offset = 0
  block.content.forEach((child) => {
    if (child.isText) {
      for (let index = 0; index < (child.text ?? "").length; index += 1) {
        starts.push(offset + index)
      }
    }
    offset += child.nodeSize
  })
  starts.push(block.content.size)
  return starts
}

/** Whether two paragraphs are the same one edited (enough words in common), rather than one replaced by another. */
function sameParagraph(steps: AlignStep[], left: string[], right: string[]) {
  const isWord = (token: string) => /\S/.test(token)
  const words = left.filter(isWord).length + right.filter(isWord).length
  if (words === 0) {
    return true
  }
  const common = steps.filter((step) => step.op === "same" && isWord(left[step.left])).length
  return (common * 2) / words >= 0.5
}

/**
 * The revised block's inline content with the words that changed from the original block marked, or null when the
 * two have too little in common to be one paragraph edited.
 */
function diffInline(original: ProseNode, revised: ProseNode, author: string, changes: CompareChange[]) {
  const left = tokens(original.textContent)
  const right = tokens(revised.textContent)
  const leftStarts = charStarts(original)
  const rightStarts = charStarts(revised)
  const leftAt = (index: number) => left.slice(0, index).reduce((sum, token) => sum + token.length, 0)
  const rightAt = (index: number) => right.slice(0, index).reduce((sum, token) => sum + token.length, 0)
  const steps = align(left, right, (a, b) => a === b)
  if (!sameParagraph(steps, left, right)) {
    return null
  }
  const parts: Fragment[] = []
  const insertion = original.type.schema.marks.insertion
  const deletion = original.type.schema.marks.deletion
  let index = 0
  while (index < steps.length) {
    const op = steps[index].op
    let end = index
    while (end < steps.length && steps[end].op === op) {
      end += 1
    }
    const first = steps[index]
    const last = steps[end - 1]
    if (first.op === "same" && last.op === "same") {
      parts.push(original.content.cut(leftStarts[leftAt(first.left)], leftStarts[leftAt(last.left + 1)]))
    } else if (first.op === "del" && last.op === "del") {
      const slice = original.content.cut(leftStarts[leftAt(first.left)], leftStarts[leftAt(last.left + 1)])
      const text = left.slice(first.left, last.left + 1).join("")
      changes.push({ kind: "deletion", text })
      parts.push(markAll(original.copy(slice), deletion.create(stamp(author))).content)
    } else if (first.op === "ins" && last.op === "ins") {
      const slice = revised.content.cut(rightStarts[rightAt(first.right)], rightStarts[rightAt(last.right + 1)])
      const text = right.slice(first.right, last.right + 1).join("")
      changes.push({ kind: "insertion", text })
      parts.push(markAll(revised.copy(slice), insertion.create(stamp(author))).content)
    }
    index = end
  }
  let content = Fragment.empty
  for (const part of parts) {
    content = content.append(part)
  }
  return revised.copy(content)
}

function blockKey(block: ProseNode) {
  return `${block.type.name}\u0000${block.textContent}`
}

/**
 * The revised document with every change from the original marked: a block that is in both stays as it is, one that
 * went is kept with its text marked deleted, one that came has its text marked inserted, and a paragraph that was
 * edited shows the words that changed.
 */
export function compareDocs(original: ProseNode, revised: ProseNode, author: string): CompareResult {
  const changes: CompareChange[] = []
  const schema = original.type.schema
  const left: ProseNode[] = []
  const right: ProseNode[] = []
  original.content.forEach((block) => left.push(block))
  revised.content.forEach((block) => right.push(block))
  const steps = align(left, right, (a, b) => blockKey(a) === blockKey(b))
  const blocks: ProseNode[] = []
  let index = 0
  while (index < steps.length) {
    const step = steps[index]
    if (step.op === "same") {
      blocks.push(left[step.left])
      index += 1
      continue
    }
    // A run of blocks that differ: each one that went is paired with one that came, when both are paragraphs of a
    // kind, and compared word by word; the rest went or came whole.
    const gone: ProseNode[] = []
    const came: ProseNode[] = []
    while (index < steps.length && steps[index].op !== "same") {
      const current = steps[index]
      if (current.op === "del") {
        gone.push(left[current.left])
      } else if (current.op === "ins") {
        came.push(right[current.right])
      }
      index += 1
    }
    const pairs = Math.min(gone.length, came.length)
    for (let at = 0; at < pairs; at += 1) {
      const a = gone[at]
      const b = came[at]
      const edited = a.isTextblock && b.isTextblock && a.type === b.type ? diffInline(a, b, author, changes) : null
      if (edited) {
        blocks.push(edited)
      } else {
        changes.push({ kind: "deletion", text: a.textContent })
        changes.push({ kind: "insertion", text: b.textContent })
        blocks.push(markAll(a, schema.marks.deletion.create(stamp(author))))
        blocks.push(markAll(b, schema.marks.insertion.create(stamp(author))))
      }
    }
    for (const a of gone.slice(pairs)) {
      changes.push({ kind: "deletion", text: a.textContent })
      blocks.push(markAll(a, schema.marks.deletion.create(stamp(author))))
    }
    for (const b of came.slice(pairs)) {
      changes.push({ kind: "insertion", text: b.textContent })
      blocks.push(markAll(b, schema.marks.insertion.create(stamp(author))))
    }
  }
  return { doc: original.copy(Fragment.from(blocks)), changes }
}

/**
 * Writes the comparison into the editor: the document becomes the revised version with the changes marked, in one
 * history step, and the Review pane opens on them. `thisDocument` says which version the open document is.
 */
export function compareInto(
  editor: Editor,
  otherHtml: string,
  options: { author: string; thisDocument: "original" | "revised" },
) {
  const other = parseHtml(editor.schema, otherHtml)
  const current = editor.state.doc
  const result =
    options.thisDocument === "original"
      ? compareDocs(current, other, options.author)
      : compareDocs(other, current, options.author)
  const tr = editor.state.tr.replaceWith(0, current.content.size, result.doc.content)
  ignoreTracking(tr)
  editor.view.dispatch(tr)
  const review = useReviewStore.getState()
  review.setMarkup("all")
  review.setPanel(true)
  return result.changes
}

/** How many words came and went: the line under the summary. */
export function changeCounts(changes: CompareChange[]) {
  const insertions = changes.filter((change) => change.kind === "insertion").length
  const deletions = changes.length - insertions
  return { insertions, deletions }
}
