/**
 * A page's header or footer is held as editor HTML, the same markup the body uses, so a picture or a styled line in it
 * is a normal node. These helpers read the older plain-text form and ask simple questions of the markup.
 */

const BLOCK_MARKUP = /<(?:p|div|h[1-6]|ul|ol|table|nav|figure)\b/i

function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** HTML for a header or footer given either HTML or the plain text older files and the built-in styles hold. */
export function chromeHtml(value: string) {
  if (!value.trim()) {
    return ""
  }
  if (BLOCK_MARKUP.test(value)) {
    return value
  }
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${escapeText(line)}</p>`)
    .join("")
}

/** The text a header or footer shows, one line per paragraph. */
export function chromeText(html: string) {
  return html
    .replace(/<\/(?:p|div|h[1-6]|li|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

/** Whether there is anything to show: text, a picture, a field or an object. */
export function chromeHasContent(html: string) {
  return (
    chromeText(html) !== "" ||
    /<(?:img|svg|canvas|object|span[^>]*data-(?:field|date-field|docx-atom|word-inline))\b/i.test(html)
  )
}

/** A page number or page count field, as the editor writes one. */
export function chromeHasPageField(html: string) {
  return /data-page-field="(?:page|pages)"/.test(html)
}

/** `html` without its page number and page count fields. */
export function chromeWithoutPageFields(html: string) {
  return html.replace(/<span\b[^>]*data-page-field="(?:page|pages)"[^>]*>[^<]*<\/span>/g, "")
}

/** Each page number and page count field in `html` showing the number of the page it is drawn on. */
export function chromeOnPage(html: string, page: number, pages: number) {
  const number = (_match: string, open: string, kind: string, close: string) =>
    `${open}${kind === "pages" ? pages : page}${close}`
  // As the editor draws a field (its result in a .field-value span), then as it is saved (the number alone).
  return html
    .replace(/(<span\b[^>]*data-page-field="(page|pages)"[^>]*><span class="field-value">)[^<]*(<\/span>)/g, number)
    .replace(/(<span\b[^>]*data-page-field="(page|pages)"[^>]*>)[^<]*(<\/span>)/g, number)
}

/** A page number or page count field as the editor holds one, kept as Word's PAGE or NUMPAGES; in a paragraph when `align` is given. */
export function pageFieldHtml(field: "page" | "pages", align: "left" | "center" | "right" | "" = "") {
  const instr = field === "page" ? " PAGE " : " NUMPAGES "
  const payload = JSON.stringify([
    { kind: "simpleField", instr, inlines: [{ kind: "run", rPr: {}, content: [{ kind: "text", text: "1" }] }] },
  ])
  const attrs = `data-word-inline data-role="field" data-payload="${payload.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" data-text="1" data-page-field="${field}"`
  const span = `<span ${attrs} class="word-inline" contenteditable="false">1</span>`
  return align ? `<p style="text-align: ${align}">${span}</p>` : span
}
