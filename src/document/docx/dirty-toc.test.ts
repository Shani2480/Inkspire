import { Editor } from "@tiptap/core"
import { DecorationSet } from "@tiptap/pm/view"
import { afterEach, describe, expect, it } from "vitest"
import { wordToEditor } from "@/document/docx/project"
import { readWordXml } from "@/document/docx/wml-read"
import { createExtensions } from "@/editor/extensions"
import { drawRowGaps, paginationKey } from "@/editor/pages"

// A table of contents a generator leaves empty and marked to be updated (w:dirty): Word builds it on opening, and so
// does the app once the pages are laid out (a generated report's table of contents was empty, its pages one short).
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const STYLES =
  `<w:styles ${W}>` +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/></w:style></w:styles>'

function dirtyToc(dirty = true) {
  const begin = dirty ? '<w:fldChar w:fldCharType="begin" w:dirty="true"/>' : '<w:fldChar w:fldCharType="begin"/>'
  const body =
    `<w:p><w:r>${begin}<w:instrText xml:space="preserve">TOC \\h \\o "1-3"</w:instrText>` +
    '<w:fldChar w:fldCharType="separate"/></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>1. Summary</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>1.1 Scope</w:t></w:r></w:p>'
  return readWordXml({ documentXml: `<w:document ${W}><w:body>${body}</w:body></w:document>`, stylesXml: STYLES })
}

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
  document.body.innerHTML = ""
})

function tocAttrs(editor: Editor) {
  let attrs: Record<string, unknown> | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableOfContents") {
      attrs = node.attrs
    }
  })
  return attrs as Record<string, unknown> | null
}

describe("a table of contents marked to be updated on opening", () => {
  it("opens empty and marked, and is built from the headings once the pages are laid out", async () => {
    const html = wordToEditor(dirtyToc()).html
    expect(html).toContain("data-toc-dirty")
    const element = document.createElement("div")
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: html,
    })
    editors.push(editor)
    expect(tocAttrs(editor)?.dirty).toBe(true)
    expect(tocAttrs(editor)?.entries).toEqual([])

    editor.view.dispatch(
      editor.state.tr.setMeta(paginationKey, { decorations: DecorationSet.empty, signature: "laid-out" }),
    )
    await Promise.resolve()
    const entries = tocAttrs(editor)?.entries as { level: number; text: string }[]
    expect(entries.map((entry) => `${entry.level}:${entry.text}`)).toEqual(["1:1. Summary", "2:1.1 Scope"])
  })

  it("is left as Word left it when not marked", () => {
    expect(wordToEditor(dirtyToc(false)).html).not.toContain("data-toc-dirty")
  })
})

describe("a table of contents across pages", () => {
  it("draws the page's end before the entry the next page starts with, once however often it is laid out", () => {
    const nav = document.createElement("nav")
    const tab = document.createElement("button")
    nav.append(tab)
    for (const text of ["Title", "One", "Two", "Three"]) {
      const row = document.createElement("p")
      row.textContent = text
      nav.append(row)
    }
    drawRowGaps(nav, [{ at: 2, height: 120 }])
    drawRowGaps(nav, [{ at: 2, height: 120 }])
    const gaps = nav.querySelectorAll(".page-gap")
    expect(gaps).toHaveLength(1)
    expect((gaps[0] as HTMLElement).style.height).toBe("120px")
    expect(gaps[0]?.nextElementSibling?.textContent).toBe("Two")
  })
})
