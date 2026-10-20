/** One command on a single line ribbon, as the fitting sees it. */
export type LineSlot = {
  /** Its width on the bar, including the gap after it. */
  width: number
  /** Higher stays on the bar longer. */
  priority: number
  /** Index of its group; groups are separated by a divider. */
  group: number
}

export type LineMetrics = {
  /** Width of the row the commands share. */
  available: number
  /** Width of the More options button that appears once anything is left out. */
  more: number
  /** Width of the divider between two groups that both show something. */
  divider: number
}

function lineWidth(slots: LineSlot[], shown: boolean[], divider: number) {
  let width = 0
  let lastGroup = -1
  slots.forEach((slot, index) => {
    if (!shown[index]) {
      return
    }
    if (lastGroup !== -1 && slot.group !== lastGroup) {
      width += divider
    }
    lastGroup = slot.group
    width += slot.width
  })
  return width
}

/**
 * Which commands stay on the row, as Word for the web decides: everything when it fits; otherwise, room is kept for
 * More options and commands leave lowest priority first, and right to left among equals.
 */
export function fitLine(slots: LineSlot[], { available, more, divider }: LineMetrics): boolean[] {
  const shown = slots.map(() => true)
  if (lineWidth(slots, shown, divider) <= available) {
    return shown
  }
  const order = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.priority - b.slot.priority || b.index - a.index)
  for (const { index } of order) {
    shown[index] = false
    if (lineWidth(slots, shown, divider) + more <= available) {
      break
    }
  }
  return shown
}
