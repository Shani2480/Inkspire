import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

/** Word's Word Count statistics. */
export type CountStats = {
  pages: number
  words: number
  /** Characters (no spaces). */
  characters: number
  /** Characters (with spaces). */
  charactersWithSpaces: number
  paragraphs: number
  lines: number
}

/** Text blocks counted as paragraphs, each with the part of it that is counted (document positions). */
type Piece = { from: number; to: number; text: string }

/** Words as Word counts them: runs of characters between spaces (a hyphenated word or "3.5" is one word). */
export function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function piecesOf(doc: ProseMirrorNode, from: number, to: number, extras: boolean) {
  const pieces: Piece[] = []
  const notes: string[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "textBox" && !extras) {
      return false
    }
    if (node.type.name === "note") {
      if (extras && typeof node.attrs.text === "string" && node.attrs.text) {
        notes.push(node.attrs.text)
      }
      return false
    }
    if (!node.isTextblock) {
      return true
    }
    const start = Math.max(from, pos + 1)
    const end = Math.min(to, pos + 1 + node.content.size)
    const text = start < end ? doc.textBetween(start, end, " ", " ") : ""
    pieces.push({ from: start, to: end, text })
    return false
  })
  return { pieces, notes }
}

/** Pages a range touches, from the paginator's page breaks (positions where a new page starts). */
function pagesOf(editor: Editor, from: number, to: number, whole: boolean) {
  const pagination = editor.storage.pagination as { pageCount?: number; breaks?: number[] } | undefined
  if (whole) {
    return pagination?.pageCount ?? 1
  }
  const pageAt = (pos: number) => 1 + (pagination?.breaks ?? []).filter((brk) => pos >= brk).length
  return pageAt(Math.max(from, to - 1)) - pageAt(from) + 1
}

/** Lines the text of a range takes on screen: its distinct line boxes, block by block. */
function linesOf(editor: Editor, pieces: Piece[]) {
  if (typeof document === "undefined" || editor.isDestroyed) {
    return 0
  }
  let lines = 0
  for (const piece of pieces) {
    if (!piece.text.trim()) {
      continue
    }
    try {
      const start = editor.view.domAtPos(piece.from)
      const end = editor.view.domAtPos(piece.to)
      const range = document.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      const tops: number[] = []
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) {
          continue
        }
        const middle = rect.top + rect.height / 2
        // Pieces of one line (bold, a link) share its middle; a new line starts below the last one's.
        if (!tops.some((top) => Math.abs(top - middle) < rect.height / 2)) {
          tops.push(middle)
        }
      }
      lines += Math.max(1, tops.length)
    } catch {
      lines += 1
    }
  }
  return lines
}

/**
 * The statistics Word's Word Count shows: for the selection when there is one, otherwise for the document. Text
 * boxes and footnote and endnote text count when `extras` is on (Word's "Include textboxes, footnotes and endnotes").
 * Lines are measured on the page, so they are left out (0) when `lines` is off.
 */
export function countStats(editor: Editor, options: { extras: boolean; lines?: boolean; whole?: boolean }): CountStats {
  const { doc, selection } = editor.state
  const whole = options.whole || selection.empty
  const from = whole ? 0 : selection.from
  const to = whole ? doc.content.size : selection.to
  const { pieces, notes } = piecesOf(doc, from, to, options.extras)
  const texts = [...pieces.map((piece) => piece.text), ...notes]
  let words = 0
  let characters = 0
  let charactersWithSpaces = 0
  let paragraphs = 0
  for (const text of texts) {
    words += countWords(text)
    characters += text.replace(/\s/g, "").length
    charactersWithSpaces += text.length
    if (text.trim()) {
      paragraphs += 1
    }
  }
  return {
    pages: pagesOf(editor, from, to, whole),
    words,
    characters,
    charactersWithSpaces,
    paragraphs,
    lines: options.lines ? linesOf(editor, pieces) + notes.length : 0,
  }
}
