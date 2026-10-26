import { create } from "zustand"

/**
 * How far down the page the header reaches and how far up the footer reaches, in pixels from the page's edge. Word
 * moves the body's top margin down to clear a tall header (and its bottom margin up for a tall footer); the page
 * metrics take the larger of the margin and this reach. Every header and footer box on the pages reports its own,
 * and the tallest of each kind counts, so a tall first-page header pushes every page's body.
 */
export const useChromeExtent = create<{ header: number; footer: number }>(() => ({ header: 0, footer: 0 }))

const reaches = new Map<string, { kind: "header" | "footer"; reach: number }>()

/** A box's reach (`null` when it is gone); the store changes only when the tallest of its kind does. */
export function reportChromeReach(id: string, kind: "header" | "footer", reach: number | null) {
  if (reach === null) {
    reaches.delete(id)
  } else {
    reaches.set(id, { kind, reach: Math.ceil(reach) })
  }
  let header = 0
  let footer = 0
  for (const item of reaches.values()) {
    if (item.kind === "header") {
      header = Math.max(header, item.reach)
    } else {
      footer = Math.max(footer, item.reach)
    }
  }
  const current = useChromeExtent.getState()
  if (current.header !== header || current.footer !== footer) {
    useChromeExtent.setState({ header, footer })
  }
}
