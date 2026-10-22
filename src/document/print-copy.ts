/**
 * Printing and the print preview show the pages the editor has laid out, copied: what is on screen (headers and
 * footers with their pictures and fields, page numbers, watermarks, borders, section breaks) is what comes out,
 * without the editing marks. Each printed page is one copy of the whole canvas, moved so that page is in view and
 * clipped to the paper, so the browser's own pagination never has to agree with the editor's.
 */

/** What the editor draws over its pages for editing, and is never printed. */
export const EDITING_ONLY = [
  ".page-first",
  ".page-margin-guide",
  ".page-column-guides",
  ".toc-update-tab",
  ".object-rotate",
  ".three-d-orbit",
  ".ProseMirror-gapcursor",
  ".ProseMirror-separator",
  ".ProseMirror-trailingBreak + .ProseMirror-separator",
].join(", ")

/** The classes the canvas carries only while editing: formatting marks, header and footer editing. */
const EDITING_CLASSES = [
  "formatting-marks",
  "fm-tabs",
  "fm-spaces",
  "fm-paras",
  "fm-hidden",
  "fm-hyphens",
  "is-chrome-editing",
]

/** The pages the editor has laid out, when it has: the page sheets of the canvas in Print Layout. */
export function pageSheets(canvas: HTMLElement) {
  return [...canvas.querySelectorAll<HTMLElement>(":scope > .page-sheet")]
}

/**
 * A copy of the page canvas with the pages and the text, without the toolbars, menus, handles and selection. Null
 * before the editor has drawn pages (Web Layout, Read Mode).
 */
export function printCopy(source: HTMLElement): HTMLElement | null {
  if (pageSheets(source).length === 0) {
    return null
  }
  const clone = source.cloneNode(true) as HTMLElement
  // Keep the pages, the text; drop the toolbars, menus and handles.
  for (const child of [...clone.children]) {
    const keep = child.classList.contains("page-sheet") || child.querySelector(".ProseMirror")
    if (!keep) {
      child.remove()
    }
  }
  clone.querySelectorAll(EDITING_ONLY).forEach((element) => element.remove())
  clone.classList.remove(...EDITING_CLASSES)
  clone.querySelectorAll(".spell-error").forEach((element) => element.classList.remove("spell-error"))
  clone.querySelectorAll(".grammar-error").forEach((element) => element.classList.remove("grammar-error"))
  clone
    .querySelectorAll(".ProseMirror-selectednode, .selectedCell, .is-current-table")
    .forEach((element) => element.classList.remove("ProseMirror-selectednode", "selectedCell", "is-current-table"))
  clone.querySelectorAll("[contenteditable]").forEach((element) => element.removeAttribute("contenteditable"))
  clone.removeAttribute("id")
  // Print Layout, whichever view the editor is in.
  clone.dataset.layout = "print"
  clone.classList.add("is-print-copy")
  Object.assign(clone.style, { position: "absolute", transform: "none", margin: "0" })
  return clone
}

/** Where a page sheet sits in its canvas, from the layout when there is one, else from the sheet's own style. */
function sheetOffset(sheet: HTMLElement) {
  if (sheet.offsetParent) {
    return { left: sheet.offsetLeft, top: sheet.offsetTop }
  }
  return { left: parseFloat(sheet.style.left) || 0, top: parseFloat(sheet.style.top) || 0 }
}

/** Moves the copy so its page `index` sits at the copy's parent's top-left corner. */
export function placeCopy(clone: HTMLElement, index: number) {
  const sheet = pageSheets(clone)[index]
  if (sheet) {
    const { left, top } = sheetOffset(sheet)
    clone.style.left = `${-left}px`
    clone.style.top = `${-top}px`
  }
}

/** The body's blocks, in order: the ones a page copy can leave out when they are not on that page. */
function bodyBlocks(canvas: HTMLElement) {
  const body = canvas.querySelector<HTMLElement>(".page-editor:not(.chrome-editor)")
  return body ? ([...body.children] as HTMLElement[]) : []
}

/**
 * Which pages each body block of `source` is on, from its drawn position: the first and last page it touches, or
 * null when it has no measure (not laid out) or it holds a floating object, which can sit on another page than
 * its anchor.
 */
function blockPages(source: HTMLElement, sheets: HTMLElement[]) {
  const origin = source.getBoundingClientRect()
  const bands = sheets.map((sheet) => {
    const { top } = sheetOffset(sheet)
    return { top, bottom: top + (parseFloat(sheet.style.height) || 0) }
  })
  return bodyBlocks(source).map((block) => {
    const rect = block.getBoundingClientRect()
    if (rect.height === 0 || block.querySelector(".object-frame")) {
      return null
    }
    const top = rect.top - origin.top
    const bottom = rect.bottom - origin.top
    let first = -1
    let last = -1
    bands.forEach((band, index) => {
      if (bottom > band.top && top < band.bottom) {
        first = first < 0 ? index : first
        last = index
      }
    })
    return first < 0 ? null : { first, last }
  })
}

/**
 * The pages to print: one `.print-page` box the size of the paper per page the editor has laid out, each holding a
 * copy of the canvas moved so that page shows, clipped. The copy keeps only its own page sheet, and the body's blocks
 * on other pages are hidden in it, so the text behind the clip is not in the printed file. Null when the editor has
 * not drawn pages.
 */
export function printPages(source: HTMLElement): HTMLElement | null {
  const copy = printCopy(source)
  if (!copy) {
    return null
  }
  const pages = blockPages(source, pageSheets(source))
  const count = pageSheets(copy).length
  const root = document.createElement("div")
  root.className = "print-pages"
  root.dataset.keepLight = ""
  for (let index = 0; index < count; index += 1) {
    const pageCopy = index === count - 1 ? copy : (copy.cloneNode(true) as HTMLElement)
    const sheets = pageSheets(pageCopy)
    sheets.forEach((sheet, at) => at !== index && sheet.remove())
    bodyBlocks(pageCopy).forEach((block, at) => {
      const on = pages[at]
      if (on && (index < on.first || index > on.last)) {
        block.style.visibility = "hidden"
      }
    })
    const page = document.createElement("div")
    page.className = "print-page"
    page.style.width = sheets[index].style.width
    page.style.height = sheets[index].style.height
    placeCopy(pageCopy, 0)
    page.append(pageCopy)
    root.append(page)
  }
  return root
}

/** The paper, as the first page sheet is drawn: the `@page` size that makes a print page one sheet. */
export function paperSize(source: HTMLElement) {
  const sheet = pageSheets(source)[0]
  return sheet ? { width: sheet.style.width, height: sheet.style.height } : null
}
