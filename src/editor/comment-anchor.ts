/** A screen box: the commented text's last line, or the comment card. */
export type AnchorBox = { left: number; top: number; right: number; bottom: number }

/**
 * Word's anchor line from the end of the commented range to its card (22.18): along the text line, then into the
 * card's nearer side at the same height when it can, or with a short bend to the card's top or bottom. No line when
 * the card covers the range's end.
 */
export function commentAnchorPoints(range: AnchorBox, card: AnchorBox) {
  const y = (range.top + range.bottom) / 2
  const inset = 12
  const cardY = Math.min(Math.max(y, card.top + inset), card.bottom - inset)
  if (card.left >= range.right) {
    const bend = Math.max(range.right, card.left - inset)
    return cardY === y
      ? [
          [range.right, y],
          [card.left, y],
        ]
      : [
          [range.right, y],
          [bend, y],
          [card.left, cardY],
        ]
  }
  if (card.right <= range.left) {
    const bend = Math.min(range.left, card.right + inset)
    return cardY === y
      ? [
          [range.left, y],
          [card.right, y],
        ]
      : [
          [range.left, y],
          [bend, y],
          [card.right, cardY],
        ]
  }
  return null
}

/**
 * The marks of one comment for drawing it as active: the first and last piece carry Word's brackets, as the range is
 * split into several marks wherever its formatting changes.
 */
export function markCommentEnds(marks: HTMLElement[], activeId: string | null) {
  const active = activeId ? marks.filter((mark) => mark.getAttribute("data-comment-id") === activeId) : []
  for (const mark of marks) {
    const index = active.indexOf(mark)
    mark.classList.toggle("is-active", index >= 0)
    mark.classList.toggle("is-first", index === 0)
    mark.classList.toggle("is-last", index >= 0 && index === active.length - 1)
  }
}
