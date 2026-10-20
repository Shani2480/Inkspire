export type Box = { left: number; top: number; width: number; height: number }
export type Placement = { left: number; top: number; side: "right" | "left" | "below" | "above" }

const GAP = 8
const MARGIN = 8

/**
 * Where the data sheet sits against its chart: to the right if it fits, else to the left, else under the chart, else
 * over it; and the nearest edge of the window when none has room. Always clamped inside the window.
 */
export function placeChartSheet(
  chart: Box,
  sheet: { width: number; height: number },
  view: { width: number; height: number },
): Placement {
  const clampLeft = (x: number) => Math.max(MARGIN, Math.min(x, view.width - sheet.width - MARGIN))
  const clampTop = (y: number) => Math.max(MARGIN, Math.min(y, view.height - sheet.height - MARGIN))
  const right = chart.left + chart.width + GAP
  if (right + sheet.width + MARGIN <= view.width) {
    return { left: right, top: clampTop(chart.top), side: "right" }
  }
  const left = chart.left - GAP - sheet.width
  if (left >= MARGIN) {
    return { left, top: clampTop(chart.top), side: "left" }
  }
  const below = chart.top + chart.height + GAP
  if (below + sheet.height + MARGIN <= view.height) {
    return { left: clampLeft(chart.left), top: below, side: "below" }
  }
  const above = chart.top - GAP - sheet.height
  if (above >= MARGIN) {
    return { left: clampLeft(chart.left), top: above, side: "above" }
  }
  return { left: clampLeft(chart.left), top: clampTop(below), side: "below" }
}
