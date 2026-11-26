import { describe, expect, it } from "vitest"
import { wordToEditor } from "@/document/docx/project"
import { readWordXml } from "@/document/docx/wml-read"

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const read = (body: string) => readWordXml({ documentXml: `<w:document ${W}><w:body>${body}</w:body></w:document>` })

describe("a tab typed into the text", () => {
  it("is a tab, to the next tab stop, as Word sets it", () => {
    const doc = read(
      '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr>' +
        '<w:r><w:t xml:space="preserve">Confidential\t5</w:t></w:r></w:p>',
    )
    const paragraph = doc.blocks[0]
    const run = paragraph?.kind === "paragraph" ? paragraph.inlines[0] : undefined
    expect(run?.kind === "run" ? run.content.map((item) => item.kind) : []).toEqual(["text", "tab", "text"])
  })
})

describe("a Word table's header row", () => {
  it("is marked to go again at the top of each page, without the Header Row look", () => {
    const row = (text: string, header = false) =>
      `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc></w:tr>`
    const html = wordToEditor(
      read(`<w:tbl><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>${row("Activity", true)}${row("One")}</w:tbl>`),
    ).html
    expect(html).toContain('data-repeat-header="1"')
    expect(html).not.toContain('data-header-row="1"')
  })
})
