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
  note(id, kind, reach, section)
  publish()
}

function note(id: string, kind: "header" | "footer", reach: number | null, section: string) {
  if (reach === null) {
    reaches.delete(id)
  } else {
    reaches.set(id, { kind, reach: Math.ceil(reach), section })
  }
}

type ChromeReport = { id: string; kind: "header" | "footer"; reach: number | null; section: string }

/** Boxes waiting to be measured: a read (layout only) that returns the write (styles) and what it reports. */
const waiting = new Map<HTMLElement, () => () => ChromeReport>()
let frame = 0

/**
 * Measures a header or footer box with all the others that asked in the same frame: every box is read first, then
 * every box's style is written and the reaches published once, so the document is laid out once, not once a box.
 */
export function measureChrome(element: HTMLElement, read: () => () => ChromeReport) {
  waiting.set(element, read)
  if (!frame) {
    frame = requestAnimationFrame(flushChrome)
  }
}

export function forgetChrome(element: HTMLElement) {
  waiting.delete(element)
}

export function flushChrome() {
  frame = 0
  const reads = [...waiting.values()]
  waiting.clear()
  const writes = reads.map((read) => read())
  for (const write of writes) {
    const { id, kind, reach, section } = write()
    note(id, kind, reach, section)
  }
  publish()
}

function publish() {
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
