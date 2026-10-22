/**
 * A completely blank new document: nothing has been typed, inserted or opened. It is never unsaved, never gets a
 * recovery copy, and is never offered back under Unsaved Documents (22.9 follow-up, "Empty Document Guard").
 */

/** Anything that counts as content even though it has no text: pictures, tables, shapes, fields, breaks, notes. */
const CONTENT_SELECTOR = [
  "img",
  "table",
  "figure",
  "hr",
  "svg",
  "video",
  "iframe",
  "[data-figure]",
  "[data-word-inline]",
  "[data-word-block]",
  "[data-drawing]",
  "[data-smartart]",
  "[data-text-box]",
  "[data-page-break]",
  "[data-section-break]",
  "[data-date-field]",
  "[data-formula]",
  "[data-if-field]",
  "[data-toc]",
  "[data-note]",
  "[data-spreadsheet]",
  "[data-equation]",
  "[data-cover-page]",
].join(", ")

/** The quick way to tell: markup with no tag at all, or only the tags an empty page is written with. */
const EMPTY_MARKUP =
  /^(?:\s*<(?:p|div|br|span)(?:\s+(?:style|class|dir|lang)="[^"]*")*\s*\/?>\s*(?:<\/(?:p|div|span)>)?\s*)*$/i

/** True when `html` holds no text, picture, table or other content: only empty paragraphs, if anything. */
export function isBlankHtml(html: string) {
  const text = html.trim()
  if (!text) {
    return true
  }
  if (EMPTY_MARKUP.test(text)) {
    return true
  }
  if (typeof DOMParser === "undefined") {
    return false
  }
  const body = new DOMParser().parseFromString(`<body>${text}</body>`, "text/html").body
  if ((body.textContent ?? "").replace(/\u00a0/g, " ").trim()) {
    return false
  }
  return body.querySelector(CONTENT_SELECTOR) === null
}

type ProseNodeLike = {
  type: { name: string }
  isText: boolean
  text?: string
  childCount: number
  child: (index: number) => ProseNodeLike
}

const BLANK_NODE_TYPES = new Set(["doc", "paragraph", "hardBreak", "text"])

/** True when the editor's document holds only empty paragraphs: no text, and no node of any other kind. */
export function isBlankProseDoc(node: ProseNodeLike): boolean {
  if (node.isText) {
    return !(node.text ?? "").replace(/\u00a0/g, " ").trim()
  }
  if (!BLANK_NODE_TYPES.has(node.type.name)) {
    return false
  }
  for (let index = 0; index < node.childCount; index += 1) {
    if (!isBlankProseDoc(node.child(index))) {
      return false
    }
  }
  return true
}

type BlankCheck = {
  currentFilePath?: string | null
  documentHTML: string
  headerHtml: string
  footerHtml: string
  firstHeaderHtml: string
  evenHeaderHtml: string
  firstFooterHtml: string
  evenFooterHtml: string
}

/** True for a new document (no file yet) whose body, headers and footers are all empty. */
export function isBlankNewDocument(state: BlankCheck) {
  return (
    !state.currentFilePath &&
    isBlankHtml(state.documentHTML) &&
    isBlankHtml(state.headerHtml) &&
    isBlankHtml(state.footerHtml) &&
    isBlankHtml(state.firstHeaderHtml) &&
    isBlankHtml(state.evenHeaderHtml) &&
    isBlankHtml(state.firstFooterHtml) &&
    isBlankHtml(state.evenFooterHtml)
  )
}
