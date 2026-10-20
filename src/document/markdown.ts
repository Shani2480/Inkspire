import { marked } from "marked"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

marked.setOptions({
  gfm: true,
  breaks: false,
})

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
})
turndown.use(gfm)

export function markdownToHtml(markdown: string) {
  const html = marked.parse(markdown, { async: false })
  return typeof html === "string" && html.trim() ? html : "<p></p>"
}

export function htmlToMarkdown(html: string) {
  return turndown.turndown(html || "<p></p>").trim()
}
