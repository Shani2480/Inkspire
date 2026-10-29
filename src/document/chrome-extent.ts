import { create } from "zustand"

type Reach = { header: number; footer: number }

/**
 * How far down the page the header reaches and how far up the footer reaches, in pixels from the page's edge. Word
 * moves the body's top margin down to clear a tall header (and its bottom margin up for a tall footer); the page
 * metrics take the larger of the margin and this reach. Every header and footer box on the pages reports its own,
 * and the tallest of each kind counts, so a tall first-page header pushes every page's body. `header` and `footer`
 * are the document's own (last) section's; `sections` holds the others' by section key.
 */
export const useChromeExtent = create<Reach & { sections: Record<string, Reach> }>(() => ({
  header: 0,
  footer: 0,
  sections: {},
}))

const reaches = new Map<string, { kind: "header" | "footer"; reach: number; section: string }>()

/** A box's reach (`null` when it is gone); the store changes only when the tallest of its kind does. */
export function reportChromeReach(id: string, kind: "header" | "footer", reach: number | null, section = "") {
  if (reach === null) {
    reaches.delete(id)
  } else {
    reaches.set(id, { kind, reach: Math.ceil(reach), section })
  }
  const all: Record<string, Reach> = {}
  for (const item of reaches.values()) {
    const entry = (all[item.section] ??= { header: 0, footer: 0 })
    entry[item.kind] = Math.max(entry[item.kind], item.reach)
  }
  const own = all[""] ?? { header: 0, footer: 0 }
  delete all[""]
  const current = useChromeExtent.getState()
  if (
    current.header !== own.header ||
    current.footer !== own.footer ||
    JSON.stringify(current.sections) !== JSON.stringify(all)
  ) {
    useChromeExtent.setState({ header: own.header, footer: own.footer, sections: all })
  }
}
