import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  paragraphText,
  paragraphsIn,
  resolveParagraphProperties,
  resolveRunProperties,
  type Paragraph,
  type StyleCatalog,
  type WordDocument,
} from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readDocument, readWordXml } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")
function caseFile(id: string) {
  const match = readdirSync(CASES).find((name) => name.startsWith(`${id}_`) || (id === "00" && name.startsWith("00_")))
  if (!match) {
    throw new Error(`Missing fixture ${id}`)
  }
  return match
}

async function readCase(id: string) {
  const file = caseFile(id)
  return readDocument(await openPackage(new Uint8Array(readFileSync(path.join(CASES, file))), file))
}

async function writtenParts(doc: WordDocument) {
  const pkg = await openPackage(await writePackage(writeDocument(doc)))
  const styles = findPart(pkg, "/word/styles.xml")
  const settings = findPart(pkg, "/word/settings.xml")
  const document = findPart(pkg, "/word/document.xml")
  return {
    document: document ? decodeXml(document.data) : "",
    styles: styles ? decodeXml(styles.data) : "",
    settings: settings ? decodeXml(settings.data) : "",
  }
}

async function roundTrip(id: string) {
  const read = await readCase(id)
  const first = await writtenParts(read)
  const saved = await openPackage(await writePackage(writeDocument(read)))
  const second = await writtenParts(readDocument(saved))
  expect(second).toEqual(first)
  expect(first.settings).toContain('w:name="compatibilityMode"')
  expect(first.settings).toContain('w:val="15"')
  expect(first.document).toContain("<w:sectPr>")
  const root = first.document.split("\r\n")[1] ?? ""
  expect(root.startsWith("<w:document")).toBe(true)
  expect(root.includes("\n")).toBe(false)
  return { read, xml: first }
}

describe("wordprocessingml", () => {
  it("resolves toggle properties through style levels", () => {
    const styles: StyleCatalog = {
      docDefaults: { pPr: {}, rPr: { sz: 24 } },
      styles: [
        { id: "Parent", type: "paragraph", pPr: {}, rPr: { b: true, i: true } },
        { id: "Child", type: "paragraph", basedOn: "Parent", pPr: {}, rPr: { b: true } },
        { id: "Off", type: "paragraph", basedOn: "Parent", pPr: {}, rPr: { b: false } },
        { id: "Char", type: "character", pPr: {}, rPr: { i: true, color: "FF0000" } },
      ],
    }
    expect(resolveRunProperties({ styles, paragraphStyleId: "Child" })).toMatchObject({ b: false, i: true, sz: 24 })
    expect(resolveRunProperties({ styles, paragraphStyleId: "Off" }).b).toBe(false)
    expect(resolveRunProperties({ styles, paragraphStyleId: "Parent", direct: { b: false } }).b).toBe(false)
    expect(resolveRunProperties({ styles, paragraphStyleId: "Parent", direct: { b: true } }).b).toBe(true)
    expect(resolveRunProperties({ styles, paragraphStyleId: "Parent", characterStyleId: "Char" })).toMatchObject({
      b: true,
      i: false,
      color: "FF0000",
    })
    const paragraph = resolveParagraphProperties({
      styles,
      paragraphStyleId: "Parent",
      direct: { jc: "center", spacing: { before: 120 } },
      table: { spacing: { after: 80 } },
    })
    expect(paragraph).toMatchObject({ jc: "center", spacing: { before: 120, after: 80 } })
  })

  it("writes run and paragraph properties in schema order", async () => {
    const doc: WordDocument = {
      blocks: [
        {
          kind: "paragraph",
          styleId: "Heading1",
          pPr: {
            keepNext: true,
            spacing: { before: 240, line: 360, lineRule: "auto" },
            ind: { left: 720 },
            jc: "center",
          },
          markRPr: { b: true },
          inlines: [
            {
              kind: "run",
              rPr: {
                rStyle: "Emphasis",
                rFonts: { ascii: "Arial", hAnsi: "Arial" },
                i: true,
                b: true,
                color: "FF0000",
                sz: 28,
                u: { value: "single" },
                vertAlign: "superscript",
              },
              content: [
                { kind: "text", text: "styled" },
                { kind: "tab" },
                { kind: "break", breakType: "textWrapping" },
                { kind: "text", text: " after" },
              ],
            },
          ],
        },
      ],
      section: null,
      styles: {
        docDefaults: { pPr: {}, rPr: {} },
        styles: [{ id: "Heading1", type: "paragraph", name: "heading 1", pPr: {}, rPr: {} }],
      },
      settings: { compatibilityMode: 15, rsids: [] },
      notes: [],
    }
    const xml = (await writtenParts(doc)).document
    const run = xml.slice(xml.indexOf("<w:r>"), xml.indexOf("</w:r>"))
    expect(
      order(run, ["<w:rStyle", "<w:rFonts", "<w:b/>", "<w:i/>", "<w:color", "<w:sz", "<w:u", "<w:vertAlign"]),
    ).toBe(true)
    expect(run.indexOf("<w:t>styled</w:t>")).toBeLessThan(run.indexOf("<w:tab/>"))
    expect(run.indexOf("<w:tab/>")).toBeLessThan(run.indexOf("<w:br/>"))
    expect(run).toContain('xml:space="preserve"')
    const properties = xml.slice(xml.indexOf("<w:pPr>"), xml.indexOf("</w:pPr>"))
    expect(order(properties, ["<w:pStyle", "<w:keepNext/>", "<w:spacing", "<w:ind", "<w:jc", "<w:rPr>"])).toBe(true)
  })

  it("00", async () => {
    const { read, xml } = await roundTrip("00")
    expect(paragraphText(paragraphsIn(read.blocks)[0]!)).toBe("MARKER-BASE")
    expect(read.section).toMatchObject({ pageWidth: 11906, pageHeight: 16838, marginTop: 1440, gutter: 0 })
    expect(read.styles.docDefaults.rPr.sz).toBe(24)
    expect(read.styles.styles.map((style) => style.id)).toEqual(["Normal", "Heading1"])
    expect(read.settings.compatibilityMode).toBe(15)
    expect(resolveRunProperties({ styles: read.styles, paragraphStyleId: "Heading1" })).toMatchObject({
      b: true,
      sz: 32,
    })
    expect(resolveParagraphProperties({ styles: read.styles, paragraphStyleId: "Heading1" }).outlineLvl).toBe(0)
    expect(xml.styles).toContain('w:styleId="Heading1"')
    expect(xml.styles).toContain("<w:b/>")
    expect(xml.styles).toContain('<w:sz w:val="32"/>')
    expect(xml.document).toContain("MARKER-BASE")
  })

  it("w01", async () => {
    const { read, xml } = await roundTrip("w01")
    expect(read.section).toBeNull()
    expect(read.notes.some((note) => note.code === "missing-sect-pr")).toBe(true)
    expect(xml.document).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
    expect(xml.document).toContain('<w:cols w:space="708"/>')
    expect(xml.document).toContain('<w:docGrid w:linePitch="360"/>')
  })

  it("w02", async () => {
    const { read, xml } = await roundTrip("w02")
    expect(read.blocks).toEqual([])
    expect(xml.document).toContain("<w:body><w:p/><w:sectPr>")
  })

  it("w03", async () => {
    const { read, xml } = await roundTrip("w03")
    const text = paragraphsIn(read.blocks).map(paragraphText)
    expect(text).toEqual(["NOPRESERVE", "  PRESERVE  "])
    expect(xml.document).toContain("<w:t>NOPRESERVE</w:t>")
    expect(xml.document).toContain('<w:t xml:space="preserve">  PRESERVE  </w:t>')
    const internal = readWordXml({
      documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>a  b</w:t></w:r></w:p><w:p><w:r><w:t>  a  b  </w:t></w:r></w:p></w:body></w:document>`,
    })
    expect(paragraphsIn(internal.blocks).map(paragraphText)).toEqual(["a  b", "a  b"])
  })

  it("w04", async () => {
    const { read, xml } = await roundTrip("w04")
    const paragraphs = paragraphsIn(read.blocks)
    expect(paragraphs.map(paragraphText)).toEqual(["MARKER-P1", "MARKER-P2"])
    expect(paragraphs.map((paragraph) => paragraph.paraId)).toEqual(["12345678", "12345678"])
    expect(read.notes.some((note) => note.code === "duplicate-para-id")).toBe(true)
    const ids = xml.document.match(/w14:paraId="([0-9A-F]{8})"/g) ?? []
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids[0]).toBe('w14:paraId="12345678"')
    expect(xml.document).toContain('mc:Ignorable="w14"')
    expect(Number.parseInt((ids[1] ?? "").slice(-9, -1), 16)).toBeLessThan(0x80000000)
  })

  it("w05", async () => {
    const { read, xml } = await roundTrip("w05")
    expect(paragraphsIn(read.blocks)[0]?.paraId).toBeUndefined()
    expect(read.notes.some((note) => note.code === "invalid-para-id")).toBe(true)
    expect(xml.document).not.toContain("paraId")
    expect(xml.document).toContain("MARKER-P1")
  })

  it("w06", async () => {
    const { read, xml } = await roundTrip("w06")
    expect(paragraphsIn(read.blocks)[0]?.rsidR).toBe("00ABCDEF")
    expect(xml.document).toContain('w:rsidR="00ABCDEF"')
  })

  it("w07", async () => {
    const { read } = await roundTrip("w07")
    expect(read.settings.compatibilityMode).toBeNull()
    expect(read.notes.some((note) => note.code === "compatibility-mode")).toBe(true)
  })

  it("w08", async () => {
    const { read } = await roundTrip("w08")
    expect(read.settings.compatibilityMode).toBe(14)
  })

  it("w09", async () => {
    const { read, xml } = await roundTrip("w09")
    expect(paragraphsIn(read.blocks)[0]?.styleId).toBe("NoSuchStyle")
    expect(read.notes.some((note) => note.code === "undefined-style")).toBe(true)
    expect(xml.document).not.toContain("NoSuchStyle")
    expect(xml.document).toContain("MARKER-A")
  })

  it("w10", async () => {
    const { read, xml } = await roundTrip("w10")
    const table = read.blocks[0]
    expect(table?.kind).toBe("table")
    if (table?.kind === "table") {
      expect(table.grid).toEqual([9026])
      expect(table.width).toEqual({ value: 0, type: "auto" })
      expect(paragraphText(table.rows[0]!.cells[0]!.blocks[0] as Paragraph)).toBe("MARKER-CELL")
    }
    expect(read.notes.some((note) => note.code === "missing-table-grid")).toBe(true)
    expect(xml.document).toContain('<w:tblGrid><w:gridCol w:w="9026"/></w:tblGrid>')
  })

  it("w11", async () => {
    const { read, xml } = await roundTrip("w11")
    const table = read.blocks[0]
    expect(table?.kind).toBe("table")
    if (table?.kind === "table") {
      expect(table.rows[0]?.cells[0]?.blocks).toHaveLength(1)
    }
    expect(read.notes.some((note) => note.code === "cell-without-paragraph")).toBe(true)
    expect(xml.document).toContain("<w:tc><w:p/></w:tc>")
    expect(xml.document).toContain("MARKER-AFTER")
  })

  it("w12", async () => {
    const { read, xml } = await roundTrip("w12")
    expect(read.blocks.map((block) => block.kind)).toEqual(["table"])
    expect(xml.document).toContain("</w:tbl><w:p/><w:sectPr>")
    expect(xml.document).toContain("MARKER-CELL")
  })

  it("w13", async () => {
    const { read, xml } = await roundTrip("w13")
    const run = paragraphsIn(read.blocks)[0]?.inlines[0]
    expect(run?.kind).toBe("run")
    if (run?.kind === "run") {
      expect(run.rPr).toMatchObject({ b: true, sz: 40 })
    }
    const properties = xml.document.slice(xml.document.indexOf("<w:rPr>"), xml.document.indexOf("</w:rPr>"))
    expect(properties.indexOf("<w:b/>")).toBeLessThan(properties.indexOf('<w:sz w:val="40"/>'))
  })

  it("w14", async () => {
    const { read, xml } = await roundTrip("w14")
    const run = paragraphsIn(read.blocks)[0]?.inlines[0]
    expect(run?.kind).toBe("run")
    if (run?.kind === "run") {
      expect(run.rPr.b).toBeUndefined()
    }
    expect(read.notes.some((note) => note.code === "rpr-after-content")).toBe(true)
    expect(xml.document).not.toContain("<w:b/>")
    expect(xml.document).not.toContain("<w:b ")
    expect(xml.document).toContain("MARKER-A")
  })

  it("w15", async () => {
    const { read, xml } = await roundTrip("w15")
    expect(paragraphText(paragraphsIn(read.blocks)[0]!)).toBe("PAGEMARKER-A")
    expect(read.notes.some((note) => note.code === "unbalanced-field")).toBe(true)
    expect(xml.document).not.toContain("fldChar")
    expect(xml.document).not.toContain("instrText")
    expect(xml.document.indexOf("PAGE")).toBeLessThan(xml.document.indexOf("MARKER-A"))
  })

  it("w16", async () => {
    const { read, xml } = await roundTrip("w16")
    expect(paragraphsIn(read.blocks)[0]?.inlines.some((inline) => inline.kind !== "run")).toBe(false)
    expect(read.notes.some((note) => note.code === "unpaired-bookmark")).toBe(true)
    expect(xml.document).not.toContain("bookmark")
    expect(xml.document).toContain("MARKER-A")
  })

  it("w17", async () => {
    const { read, xml } = await roundTrip("w17")
    expect(read.styles.styles).toEqual([])
    expect(read.notes.some((note) => note.code === "missing-styles")).toBe(true)
    expect(paragraphText(paragraphsIn(read.blocks)[0]!)).toBe("MARKER-BASE")
    expect(xml.styles).toBe("")
    expect(xml.document).toContain("MARKER-BASE")
  })
})

function order(xml: string, tags: string[]) {
  let from = -1
  for (const tag of tags) {
    const at = xml.indexOf(tag)
    if (at <= from) {
      return false
    }
    from = at
  }
  return true
}
