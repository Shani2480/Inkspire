/**
 * Where a paragraph may break between pages, as Word's paragraph options ask (22.8, widow/orphan control and keep
 * with next). Pure sums of line heights, so they can be tested without a browser.
 */

/** How many of a paragraph's lines stay on this page: those that fit, less what widow/orphan control takes back. */
export function linesOnPage(heights: number[], used: number, contentHeight: number, widowControl: boolean) {
  const count = heights.length
  let fitted = 0
  let height = used
  while (fitted < count && height + heights[fitted] <= contentHeight + 1) {
    height += heights[fitted]
    fitted += 1
  }
  if (fitted === count || !widowControl) {
    return fitted
  }
  // Two lines at the foot of a page and two at the top of the next: a shorter paragraph is not split at all.
  if (count < 4 || fitted < 2) {
    return 0
  }
  return count - fitted < 2 ? count - 2 : fitted
}

/**
 * Whether a paragraph kept with the next one must start on the next page: it and the start of what follows do not
 * fit what is left, but would on a page of their own.
 */
export function keepWithNextMustMove(used: number, own: number, following: number, contentHeight: number) {
  return used > 0 && following > 0 && used + own + following > contentHeight + 1 && own + following <= contentHeight
}

/**
 * Whether a block of `size` (after what is already `used`) runs past the page's foot. `spill`, a paragraph's space
 * after, need not fit: Word lets it run past the foot rather than move the paragraph's last line on.
 */
export function overrunsFoot(used: number, size: number, spill: number, contentHeight: number) {
  return used > 0 && used + size - Math.min(Math.max(0, spill), size) > contentHeight + 1
}

/** How much of a placed paragraph's space after runs past the foot: the next page's gap is that much shorter. */
export function spillPastFoot(used: number, spill: number, contentHeight: number) {
  return Math.max(0, Math.min(spill, used - contentHeight))
}
