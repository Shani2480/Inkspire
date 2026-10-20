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
    chromeText(html) !== "" || /<(?:img|svg|canvas|object|span[^>]*data-(?:field|date-field|docx-atom))\b/i.test(html)
  )
}

/** `html` with its text replaced by `text`; the pictures in it stay. */
export function chromeWithText(html: string, text: string) {
  const pictures = html.match(/<img\b[^>]*>/gi)?.join("") ?? ""
  return `${chromeHtml(text)}${pictures}`
}
