import { Mark, type Editor } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"

/** Text marked with a language (w:lang) or "Do not check spelling or grammar" (w:noProof), as Word's Language dialog sets it. */
export type Proofing = { lang: string | null; noProof: boolean }

/**
 * The language and proofing of a run, as Word keeps them on the run itself. Text without the mark is in the
 * document's language (Review > Language, File > Options).
 */
export const ProofingMark = Mark.create({
  name: "proofing",
  addAttributes() {
    return {
      lang: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lang") || null,
        renderHTML: (attrs) => (attrs.lang ? { "data-lang": attrs.lang, lang: attrs.lang } : {}),
      },
      noProof: {
        default: false,
        parseHTML: (element) => element.hasAttribute("data-no-proof"),
        renderHTML: (attrs) => (attrs.noProof ? { "data-no-proof": "", spellcheck: "false" } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: "span[data-proofing]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", { "data-proofing": "", ...HTMLAttributes }, 0],
})

/** The language and proofing at the selection's start (or the caret, including what typing will use). */
export function proofingAt(state: EditorState): Proofing {
  const { selection } = state
  const marks = selection.empty
    ? (state.storedMarks ?? selection.$from.marks())
    : (state.doc.nodeAt(selection.from)?.marks ?? selection.$from.marks())
  const mark = marks.find((item) => item.type.name === "proofing")
  return { lang: (mark?.attrs.lang as string | null) ?? null, noProof: mark?.attrs.noProof === true }
}

/** The word around an empty selection, which Word's Language dialog marks when nothing is selected. */
function wordAround(state: EditorState) {
  const { $from } = state.selection
  const text = $from.parent.textContent
  const offset = $from.parentOffset
  // Plain text offsets match document offsets only in a paragraph of text; atoms take one position each.
  if ($from.parent.content.size !== text.length) {
    return null
  }
  const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}'’-]/u.test(char)
  let start = offset
  let end = offset
  while (isWord(text[start - 1])) {
    start -= 1
  }
  while (isWord(text[end])) {
    end += 1
  }
  if (start === end) {
    return null
  }
  const base = $from.start()
  return { from: base + start, to: base + end }
}

/**
 * Marks the selection (or the word at the caret, and what is typed next) with a language and proofing. A language
 * of null with proofing on takes the mark off, so the text follows the document's language again.
 */
export function setProofing(editor: Editor, proofing: Proofing) {
  const type = editor.schema.marks.proofing
  if (!type) {
    return
  }
  const { state } = editor
  const plain = !proofing.lang && !proofing.noProof
  const tr = state.tr
  const ranges = state.selection.empty
    ? [wordAround(state)].filter((range): range is { from: number; to: number } => range !== null)
    : state.selection.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos }))
  for (const { from, to } of ranges) {
    tr.removeMark(from, to, type)
    if (!plain) {
      tr.addMark(from, to, type.create(proofing))
    }
  }
  if (state.selection.empty) {
    const kept = (state.storedMarks ?? state.selection.$from.marks()).filter((mark) => mark.type !== type)
    tr.setStoredMarks(plain ? kept : [...kept, type.create(proofing)])
  }
  editor.view.dispatch(tr.scrollIntoView())
}
