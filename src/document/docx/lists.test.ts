import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { numberingLevel, numberingMarker, paragraphText, paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, name)))
  const pkg = await openPackage(bytes, name)
  return { pkg, doc: readDocument(pkg) }
}

async function savedDocument(name: string) {
  const { doc } = await load(name)
  const written = await openPackage(await writePackage(writeDocument(doc)), name)
  const part = findPart(written, written.mainPartName)
  if (!part) {
    throw new Error(`${name} did not write a main part`)
  }
  return { doc, xml: decodeXml(part.data) }
}

function originalDocument(name: string) {
  return openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name).then((pkg) => {
    const part = findPart(pkg, pkg.mainPartName)
    if (!part) {
      throw new Error(`${name} has no main part`)
    }
    return decodeXml(part.data)
  })
}

/** Drop revision and paragraph ids. Everything else in document.xml has to match Word. */
function normalize(xml: string) {
  return xml.replace(/<([A-Za-z0-9:]+)((?:\s+[A-Za-z0-9:]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) => {
    const kept = String(attrs).replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
    const trimmed = kept.trim()
    return `<${name}${trimmed ? ` ${trimmed}` : ""}${slash}>`
  })
}

describe("lists and tables", () => {
  it("f04", async () => {
    const { doc, xml } = await savedDocument("f04_bullets.docx")
    expect(normalize(xml)).toBe(normalize(await originalDocument("f04_bullets.docx")))
    const level = numberingLevel(doc.numbering, 1, 0)
    expect(level?.format).toBe("bullet")
    expect(level?.text).toBe("\uF0B7")
    expect(numberingMarker(level!)).toBe("•")
    expect(level?.rPr.rFonts).toMatchObject({ ascii: "Symbol", hAnsi: "Symbol", hint: "default" })
    expect(level?.pPr.ind).toEqual({ left: 720, hanging: 360 })
    expect(paragraphsIn(doc.blocks).map(paragraphText)).toEqual(["BEFORE", "bullet one", "bullet two", "AFTER"])
  })

  it("f05", async () => {
    const { doc, xml } = await savedDocument("f05_numbering.docx")
    expect(normalize(xml)).toBe(normalize(await originalDocument("f05_numbering.docx")))
    const level = numberingLevel(doc.numbering, 1, 0)
    expect(level?.format).toBe("decimal")
    expect(level?.text).toBe("%1.")
    expect(level?.rPr).toEqual({})
    expect(paragraphsIn(doc.blocks).map(paragraphText)).toEqual(["BEFORE", "item one", "item two", "AFTER"])
    const second = paragraphsIn(doc.blocks)[2]
    expect(second?.pPr.ind).toEqual({ left: 1080 })
    expect(second?.pPr.numPr).toEqual({ ilvl: 0, numId: 1 })
  })

  it("f06", async () => {
    const { doc, xml } = await savedDocument("f06_table.docx")
    expect(normalize(xml)).toBe(normalize(await originalDocument("f06_table.docx")))
    const table = doc.blocks.find((block) => block.kind === "table")
    expect(table?.kind).toBe("table")
    if (table?.kind !== "table") {
      return
    }
    expect(table.grid).toEqual([3008, 3009, 3009])
    expect(table.width).toEqual({ value: 9026, type: "dxa" })
    expect(table.layout).toBe("fixed")
    expect(table.borders?.top).toEqual({ value: "single", sz: 4, space: 0, color: "auto" })
    expect(table.rows[0]?.header).toBe(true)
    expect(table.rows[0]?.cells[0]?.gridSpan).toBe(2)
    expect(table.rows[1]?.cells[2]?.vMerge).toBe("restart")
    expect(table.rows[2]?.cells[2]?.vMerge).toBe("continue")
    expect(table.rows[2]?.cells[2]?.blocks).toHaveLength(1)
    const texts = table.rows.flatMap((row) => row.cells.flatMap((cell) => paragraphsIn(cell.blocks).map(paragraphText)))
    expect(texts).toEqual(["c11", "c12", "c13", "c21", "c22", "c23", "c33", "c31", "c32", ""])
  })
})
