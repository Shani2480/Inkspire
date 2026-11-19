/**
 * Where a paragraph may break between pages, as Word's paragraph options ask (22.8, widow/orphan control and keep
 * with next). Pure sums of line heights, so they can be tested without a browser.
 */

/**
 * How many of a paragraph's lines stay on this page: those that fit, less what widow/orphan control takes back.
 * `spills` (per line) is what of each line need not fit: a multiple's extra below the text (see `lineSpill`).
 */
export function linesOnPage(
  heights: number[],
  used: number,
  contentHeight: number,
  widowControl: boolean,
  spills: number[] = [],
) {
  const count = heights.length
  let fitted = 0
  let height = used
  while (
    fitted < count &&
    height + heights[fitted] - (spills[fitted] ?? 0) <= contentHeight + slackOf(spills[fitted])
  ) {
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
 * What of a line under a multiple of lines may run past the page's foot: Word keeps the line on the page when its
 * single line fits, the multiple's extra (all below the text, document/line-lead.ts) running past the bottom margin
 * (checked in Word 2026-11-19: triple-spaced Calibri 11 pt, a line kept with 14.5 pt left, moved on with 10).
 * `height` is the line's own height (without the paragraph's space before or after), `lines` the multiple.
 */
export function lineSpill(height: number, lines: number) {
  return lines > 1 && height > 0 ? (height * (lines - 1)) / lines : 0
}

/**
 * How far past the foot a block may reach and still count as fitting: 1 px for rounding, but a line whose extra runs
 * past the foot must have its text inside (Word moved a double-spaced Times line whose text reached 0.6 pt past).
 */
export function slackOf(lineExtra = 0) {
  return lineExtra > 0 ? 0.25 : 1
}

/**
 * Whether a block of `size` (after what is already `used`) runs past the page's foot. `spill`, a paragraph's space
 * after, need not fit: Word lets it run past the foot rather than move the paragraph's last line on.
 */
export function overrunsFoot(used: number, size: number, spill: number, contentHeight: number, slack = 1) {
  return used > 0 && used + size - Math.min(Math.max(0, spill), size) > contentHeight + slack
}

/** How much of a placed paragraph's space after runs past the foot: the next page's gap is that much shorter. */
export function spillPastFoot(used: number, spill: number, contentHeight: number) {
  return Math.max(0, Math.min(spill, used - contentHeight))
}
