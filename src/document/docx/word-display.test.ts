import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes } from "@/document/docx/io"
import { paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { borderCss, documentStyleSheet, singleLine, tableLookTokens } from "@/document/docx/word-styles"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { parseTabStops, serializeTabStops } from "@/editor/tab-stops"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const GRID_STYLE =
  `<w:style w:type="table" w:styleId="Grid1"><w:name w:val="Grid 1"/><w:basedOn w:val="TableNormal"/>` +
  `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="4472C4"/>` +
  `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="B4C6E7"/></w:tblBorders></w:tblPr>` +
  `<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>` +
  `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="4472C4"/></w:tcPr></w:tblStylePr>` +
  `<w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr></w:tblStylePr>` +
  `</w:style>`

async function edited(name: string, edits: Record<string, (xml: string) => string>) {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  for (const [partName, edit] of Object.entries(edits)) {
    const part = findPart(pkg, partName)!
    part.data = new TextEncoder().encode(edit(decodeXml(part.data)))
  }
  return writePackage(pkg)
}

/** f06 with a table style that has borders, a header row, and row banding, plus a cell with its own margins. */
function styledTable() {
  return edited("f06_table.docx", {
    "/word/styles.xml": (xml) => xml.replace("</w:styles>", `${GRID_STYLE}</w:styles>`),
    "/word/document.xml": (xml) =>
      xml
        .replace("<w:tblPr>", `<w:tblPr><w:tblStyle w:val="Grid1"/>`)
        .replace(/<w:tblLook [^>]*\/>/, `<w:tblLook w:val="04A0" w:firstRow="1" w:noVBand="1"/>`)
        .replace(
          `<w:gridSpan w:val="2"/>`,
          `<w:gridSpan w:val="2"/><w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>`,
        ),
  })
}

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(content: string) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content,
  })
  editors.push(editor)
  return editor
}

describe("line spacing", () => {
  it("measures Word's lines in the font's single line", async () => {
    const opened = await openDocxBytes(readFileSync(path.join(AUTHORED, "f02_heading_style.docx")), "f02.docx")
    const css = documentStyleSheet(opened.word)
    const page = css.split("\n").find((line) => line.startsWith(":root .page-editor {"))!
    const factor = Number(/--word-single-line: ([\d.]+)/.exec(page)?.[1])
    expect(factor).toBeGreaterThan(1.1)
    const body = css.split("\n").find((line) => line.startsWith(":root .page-editor p,"))!
    const normal = opened.word.styles.styles.find((style) => style.default && style.type === "paragraph")
    const line = normal?.pPr.spacing?.line ?? opened.word.styles.docDefaults.pPr.spacing?.line ?? 240
    expect(body).toContain(`line-height: ${Math.round((line / 240) * factor * 1000) / 1000}`)
    expect(singleLine("Calibri")).toBe(1.22)
  })

  it("scales a paragraph's own multiple by the document's single line and reads it back unscaled", () => {
    const editor = editorWith(`<p style="line-height: 1.5">spaced</p>`)
    const html = editor.getHTML()
    expect(html).toContain("line-height: calc(var(--word-single-line, 1) * 1.5)")
    expect(editorWith(html).getJSON().content?.[0]?.attrs?.lineHeight).toBe("1.5")
  })
})

describe("contextual spacing", () => {
  it("is read, written, and drops space between paragraphs of the same style", async () => {
    const bytes = await edited("f05_numbering.docx", {
      "/word/styles.xml": (xml) =>
        xml.includes("<w:contextualSpacing/>")
          ? xml
          : xml.replace(/(<w:style [^>]*w:styleId="ListParagraph"[^>]*>[\s\S]*?<w:pPr>)/, "$1<w:contextualSpacing/>"),
    })
    const doc = readDocument(await openPackage(bytes, "f05.docx"))
    expect(doc.styles.styles.find((style) => style.id === "ListParagraph")?.pPr.contextualSpacing).toBe(true)
    const css = documentStyleSheet(doc)
    expect(css).toContain(`p[data-word-style="ListParagraph"] + p[data-word-style="ListParagraph"]`)
    expect(css).toContain("margin-top: 0 !important")
    const written = writeDocument(doc)
    expect(decodeXml(findPart(written, "/word/styles.xml")!.data)).toContain("<w:contextualSpacing/>")
  })
})

describe("tables", () => {
  it("draws a table style's borders, header row, and banding", async () => {
    const opened = await openDocxBytes(await styledTable(), "styled.docx")
    const css = documentStyleSheet(opened.word)
    const table = `:root .page-editor table[data-word-table-style="Grid1"]`
    expect(css).toContain(`${table} { --wb-top: 1pt solid #4472C4; --wb-insideH: 0.5pt solid #B4C6E7`)
    expect(css).toContain(`${table}:where([data-word-look~="firstRow"]) :where(tr:first-child > td) {`)
    expect(css).toMatch(/firstRow"\]\) :where\(tr:first-child > td\) \{ background-color: #4472C4; \}/)
    expect(css).toMatch(/firstRow"\]\) :where\(tr:first-child > td p\) \{ color: #FFFFFF; font-weight: bold; \}/)
    expect(css).toContain(`:where(tr:nth-child(even) > td) { background-color: #D9E2F3; }`)
    // The table style's paragraph spacing reaches paragraphs in the default style.
    expect(css).toContain(`${table} :where(td p:not([data-word-style])) { margin-bottom: 0pt; line-height:`)
    const html = opened.view.html
    expect(html).toContain(`data-word-table-style="Grid1"`)
    expect(html).toContain(`data-word-look="firstRow noVBand"`)
    expect(html).toContain(`data-valign="middle"`)
    expect(html).toContain(`data-word-cell="padding-left: 10pt"`)
  })

  it("keeps the table style through the editor", async () => {
    const opened = await openDocxBytes(await styledTable(), "styled.docx")
    const html = editorWith(opened.view.html).getHTML()
    expect(html).toContain(`data-word-table-style="Grid1"`)
    expect(html).toContain(`data-word-cell="padding-left: 10pt`)
  })

  it("converts borders and look flags", () => {
    expect(borderCss({ value: "single", sz: 4, color: "auto" })).toBe("0.5pt solid #000000")
    expect(borderCss({ value: "nil" })).toBe("none")
    expect(borderCss({ value: "double", sz: 4 })).toBe("2.25pt double #000000")
    expect(tableLookTokens({ val: "0420" })).toBe("firstRow noVBand")
    expect(tableLookTokens(undefined)).toBe("firstRow firstColumn noVBand")
  })
})

describe("lists, tabs, and page breaks", () => {
  it("numbers a list on after a paragraph interrupts it and indents it as its level says", async () => {
    const bytes = await edited("f05_numbering.docx", {
      "/word/document.xml": (xml) =>
        xml.replace(/(<w:t>item one<\/w:t><\/w:r><\/w:p>)/, "$1<w:p><w:r><w:t>between</w:t></w:r></w:p>"),
    })
    const opened = await openDocxBytes(bytes, "f05.docx")
    const lists = opened.view.html.match(/<ol[^>]*>/g) ?? []
    expect(lists).toHaveLength(2)
    expect(lists[0]).not.toContain("start=")
    expect(lists[1]).toContain(`start="2"`)
    expect(lists[0]).toMatch(/data-word-indent="padding-left: \d+pt"/)
  })

  it("lays out Word's tab stops with their leaders", async () => {
    const bytes = await edited("f01_runs.docx", {
      "/word/document.xml": (xml) =>
        xml.replace(
          "<w:body>",
          `<w:body><w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9016"/></w:tabs></w:pPr><w:r><w:t>Item</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>1</w:t></w:r></w:p>`,
        ),
    })
    const opened = await openDocxBytes(bytes, "f01.docx")
    expect(opened.view.html).toContain(`data-tab-stops="601.1:right:dot"`)
    expect(serializeTabStops(parseTabStops("601.1:right:dot,20:left"))).toBe("20:left,601.1:right:dot")
  })

  it("shows a TOC field as a table of contents", async () => {
    const opened = await openDocxBytes(readFileSync(path.join(AUTHORED, "f12_fields_toc.docx")), "f12.docx")
    expect(opened.view.html).toContain(`data-toc-instruction="TOC \\o &quot;1-3&quot;"`)
    expect(opened.view.html).toContain(`&quot;text&quot;:&quot;Section Title&quot;`)
  })

  it("shows a page break that shares its paragraph with a bookmark, and keeps the bookmark", async () => {
    const bytes = await edited("f01_runs.docx", {
      "/word/document.xml": (xml) =>
        xml.replace(
          "<w:body>",
          `<w:body><w:p><w:r><w:br w:type="page"/></w:r><w:bookmarkStart w:id="77" w:name="_Toc1"/><w:bookmarkEnd w:id="77"/></w:p>`,
        ),
    })
    const opened = await openDocxBytes(bytes, "f01.docx")
    expect(opened.view.html).toMatch(/<div data-page-break="" data-docx="[^"]+" class="page-break"><\/div>/)
    expect(paragraphsIn(opened.word.blocks)[0]?.inlines.some((inline) => inline.kind === "bookmarkStart")).toBe(true)
  })
})
