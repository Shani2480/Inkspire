import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readTocEntries, styleHeadingLevel, tocLevelOf } from "@/document/toc"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

function paragraph(inner: string, style?: string, extra = "") {
  return `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>` : ""}${inner}</w:p>`
}

function link(anchor: string, text: string) {
  return `<w:hyperlink w:anchor="${anchor}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:hyperlink>`
}

function run(text: string) {
  return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`
}

/** f02 (which has Heading 1 and 2 styles) with its body replaced. */
async function documentWith(body: string) {
  const name = "f02_heading_style.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(part.data).replace(/<w:body>[\s\S]*?(<w:sectPr[\s\S]*<\/w:body>)/, `<w:body>${body}$1`)
  part.data = new TextEncoder().encode(xml)
  return writePackage(pkg)
}

function tocOf(html: string) {
  const nav = /<nav data-toc="([^"]*)"[^>]*data-toc-title="([^"]*)"/.exec(html)
  if (!nav) {
    return null
  }
  const decode = (text: string) =>
    text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
  return { entries: readTocEntries(decode(nav[1]!)), title: decode(nav[2]!) }
}

describe("tables of contents without a TOC field", () => {
  it("reads a title and link paragraphs ending in page numbers, with levels from the headings they name", async () => {
    const bytes = await documentWith(
      paragraph(run("Table of Contents")) +
        paragraph(link("_Toc1", "1. Purpose 3")) +
        paragraph(link("_Toc2", "1.1 Background 3")) +
        paragraph(link("_Toc3", "2. Scope 4")) +
        paragraph(run("1. Purpose"), "Heading1") +
        paragraph(run("1.1 Background"), "Heading2") +
        paragraph(run("2. Scope"), "Heading1"),
    )
    const { view } = await openDocxBytes(bytes, "t.docx")
    const toc = tocOf(view.html)
    expect(toc?.title).toBe("Table of Contents")
    expect(toc?.entries).toEqual([
      { level: 1, text: "1. Purpose", page: "3", anchor: "_Toc1" },
      { level: 2, text: "1.1 Background", page: "3", anchor: "_Toc2" },
      { level: 1, text: "2. Scope", page: "4", anchor: "_Toc3" },
    ])
    // The title paragraph became the table's title rather than staying a paragraph.
    expect(view.html.replace(/<nav[^>]*><\/nav>/, "")).not.toContain("Table of Contents")
  })

  it("reads TOC-styled paragraphs and keeps them as they were when saved unchanged", async () => {
    const bytes = await documentWith(
      paragraph(run("Introduction\t1"), "TOC1") + paragraph(run("Details\t2"), "TOC2") + paragraph(run("Body text")),
    )
    const opened = await openDocxBytes(bytes, "t.docx")
    expect(tocOf(opened.view.html)?.entries.map((entry) => [entry.level, entry.text, entry.page])).toEqual([
      [1, "Introduction", "1"],
      [2, "Details", "2"],
    ])
    expect(opened.view.html).toContain("Body text")
  })

  it("leaves a plain list of links alone", async () => {
    const bytes = await documentWith(
      paragraph(link("somewhere", "See the appendix")) + paragraph(link("other", "See the glossary")),
    )
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(tocOf(view.html)).toBeNull()
  })

  it("opens paragraphs with an outline level as headings of the table of contents", async () => {
    const bytes = await documentWith(paragraph(run("Annex"), undefined, `<w:outlineLvl w:val="1"/>`))
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-outline="2"')
    const saved = await saveDocxBytes({
      json: {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { outlineLevel: "3" }, content: [{ type: "text", text: "Level three" }] },
        ],
      },
      chrome: (await import("@/document/header")).emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "o.docx",
    })
    const pkg = await openPackage(saved.bytes, "o.docx")
    expect(decodeXml(findPart(pkg, pkg.mainPartName)!.data)).toContain('<w:outlineLvl w:val="2"/>')
  })

  it("counts a style based on a heading at that heading's level", () => {
    const styles = [
      { id: "custom-chapter", basedOn: "heading-1" },
      { id: "custom-sub", basedOn: "custom-chapter" },
      { id: "custom-note", basedOn: "normal" },
    ]
    expect(styleHeadingLevel("custom-sub", styles)).toBe(1)
    expect(tocLevelOf({ type: "paragraph", attrs: { namedStyle: "custom-chapter" } }, styles)).toBe(1)
    expect(tocLevelOf({ type: "paragraph", attrs: { namedStyle: "custom-note" } }, styles)).toBeNull()
  })
})
