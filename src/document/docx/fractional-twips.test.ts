import { describe, expect, it } from "vitest"
import { readWordXml } from "@/document/docx/wml-read"

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** Page setup, a pulled-left table and an indent the way Google Docs writes them: twips with fractions. */
const GOOGLE_DOCS =
  `<w:document ${W}><w:body>` +
  '<w:p><w:pPr><w:ind w:left="360.0" w:right="-141.73228346456688"/></w:pPr></w:p>' +
  '<w:tbl><w:tblPr><w:tblW w:w="10605.0" w:type="dxa"/><w:tblInd w:w="-283.46456692913375" w:type="dxa"/>' +
  '<w:tblCellMar><w:left w:w="100.0" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="10605"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>' +
  '<w:sectPr><w:pgSz w:h="16838" w:w="11906"/>' +
  '<w:pgMar w:bottom="561.6" w:top="1137.6000000000001" w:left="1137.6000000000001" w:right="1137.6000000000001" w:header="0" w:footer="720"/>' +
  "</w:sectPr></w:body></w:document>"

describe("twips with fractions", () => {
  const doc = readWordXml({ documentXml: GOOGLE_DOCS })

  it("keeps the page margins, rounded, instead of falling back to an inch", () => {
    expect(doc.section).toMatchObject({
      marginTop: 1138,
      marginRight: 1138,
      marginBottom: 562,
      marginLeft: 1138,
      header: 0,
      footer: 720,
    })
  })

  it("keeps the table's width, its negative indent and its cell margins", () => {
    const table = doc.blocks.find((block) => block.kind === "table")
    expect(table).toMatchObject({
      width: { value: 10605, type: "dxa" },
      indent: { value: -283, type: "dxa" },
    })
    expect(JSON.stringify(table)).toContain('"value":100')
  })

  it("keeps a paragraph's indents, a negative one too", () => {
    const paragraph = doc.blocks.find((block) => block.kind === "paragraph")
    expect(paragraph).toMatchObject({ pPr: { ind: { left: 360, right: -142 } } })
  })

  it("still refuses a table width below zero and text that is not a number", () => {
    const bad = readWordXml({
      documentXml: GOOGLE_DOCS.replace('w:w="10605.0"', 'w:w="-5.5"').replace('w:left="360.0"', 'w:left="3.6e2"'),
    })
    const table = bad.blocks.find((block) => block.kind === "table")
    expect(table && "width" in table ? table.width : undefined).toBeUndefined()
    const paragraph = bad.blocks.find((block) => block.kind === "paragraph")
    expect(JSON.stringify(paragraph)).not.toContain('"left"')
  })
})
