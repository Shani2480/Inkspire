import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { paragraphText, paragraphsIn, type Paragraph } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

async function roundTrip(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, name)))
  const original = await openPackage(bytes, name)
  const doc = readDocument(original)
  const written = await openPackage(await writePackage(writeDocument(doc)), name)
  return { doc, original, written }
}

function partXml(pkg: Awaited<ReturnType<typeof openPackage>>, partName: string) {
  const part = findPart(pkg, partName)
  if (!part) {
    throw new Error(`Missing part ${partName}`)
  }
  return decodeXml(part.data)
}

/** Drop revision and paragraph ids. Everything else in the part has to match Word. */
function normalize(xml: string) {
  return xml.replace(/<([A-Za-z0-9:]+)((?:\s+[A-Za-z0-9:]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) => {
    const kept = String(attrs).replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
    const trimmed = kept.trim()
    return `<${name}${trimmed ? ` ${trimmed}` : ""}${slash}>`
  })
}

function expectParts(
  original: Awaited<ReturnType<typeof openPackage>>,
  written: Awaited<ReturnType<typeof openPackage>>,
  names: string[],
) {
  for (const name of names) {
    expect(normalize(partXml(written, name)), name).toBe(normalize(partXml(original, name)))
  }
}

function fieldMarks(paragraph: Paragraph) {
  const marks: string[] = []
  for (const inline of paragraph.inlines) {
    if (inline.kind === "simpleField") {
      marks.push(`simple:${inline.instr}`)
      continue
    }
    if (inline.kind !== "run") {
      continue
    }
    for (const content of inline.content) {
      if (content.kind === "fldChar") {
        marks.push(content.fieldType)
      } else if (content.kind === "instrText") {
        marks.push(content.text)
      }
    }
  }
  return marks
}

describe("sections, headers and fields", () => {
  it("f07", async () => {
    const { doc, original, written } = await roundTrip("f07_header_footer.docx")
    expectParts(original, written, [
      "/word/document.xml",
      "/word/header1.xml",
      "/word/header2.xml",
      "/word/header3.xml",
      "/word/footer1.xml",
      "/word/footer2.xml",
      "/word/footer3.xml",
    ])
    expect(doc.section?.titlePg).toBe(true)
    expect(doc.section?.references?.map((ref) => `${ref.kind}:${ref.type}:${ref.relId}`)).toEqual([
      "header:even:rId6",
      "header:default:rId7",
      "footer:even:rId8",
      "footer:default:rId9",
      "header:first:rId10",
      "footer:first:rId11",
    ])
    const story = (relId: string) => doc.section?.references?.find((ref) => ref.relId === relId)
    expect(paragraphText(paragraphsIn(story("rId7")?.blocks ?? [])[0]!)).toBe("HEADER-TEXT")
    expect(paragraphText(paragraphsIn(story("rId10")?.blocks ?? [])[0]!)).toBe("FIRST-PAGE-HEADER")
    const footer = paragraphsIn(story("rId9")?.blocks ?? [])[0]
    expect(paragraphText(footer!)).toBe("Page 1")
    expect(fieldMarks(footer!)).toEqual(["begin", " PAGE  \\* MERGEFORMAT ", "separate", "end"])
    expect(paragraphsIn(doc.blocks).map(paragraphText)).toEqual(["BEFORE", "body with headers", "AFTER"])
  })

  it("f12", async () => {
    const { doc, original, written } = await roundTrip("f12_fields_toc.docx")
    expectParts(original, written, ["/word/document.xml"])
    const paragraphs = paragraphsIn(doc.blocks)
    expect(paragraphs.map(paragraphText)).toEqual([
      "BEFORE",
      "Section Title",
      "Section Title1",
      "",
      "10/17/2026",
      "AFTER",
    ])
    const heading = paragraphs[1]
    expect(heading?.inlines.some((inline) => inline.kind === "bookmarkStart" && inline.name === "_Toc243131384")).toBe(
      true,
    )
    expect(paragraphs[2]?.pPr.tabs).toEqual([{ val: "right", leader: "dot", pos: 9016 }])
    expect(fieldMarks(paragraphs[2]!)).toEqual([
      "begin",
      ' TOC \\o "1-3" ',
      "separate",
      "begin",
      " PAGEREF _Toc243131384 \\h ",
      "separate",
      "end",
    ])
    expect(fieldMarks(paragraphs[3]!)).toEqual(["end"])
    expect(fieldMarks(paragraphs[4]!)).toEqual(["simple: DATE  \\* MERGEFORMAT "])
  })

  it("f15", async () => {
    const { doc, original, written } = await roundTrip("f15_sections.docx")
    expectParts(original, written, ["/word/document.xml"])
    const paragraphs = paragraphsIn(doc.blocks)
    expect(paragraphs.map(paragraphText)).toEqual([
      "BEFORE",
      "portrait section",
      "landscape section",
      "",
      "after page break",
      "AFTER",
    ])
    const portrait = paragraphs[1]
    expect(portrait?.sectionBreak?.pageWidth).toBe(11906)
    expect(portrait?.sectionBreak?.pageHeight).toBe(16838)
    expect(portrait?.sectionBreak?.orient).toBeUndefined()
    expect(doc.section?.orient).toBe("landscape")
    expect(doc.section?.pageWidth).toBe(16838)
    expect(doc.section?.pageHeight).toBe(11906)
    expect(doc.section?.columnCount).toBe(2)
    const pageBreak = paragraphs[3]?.inlines[0]
    expect(pageBreak?.kind).toBe("run")
    if (pageBreak?.kind === "run") {
      expect(pageBreak.content).toEqual([{ kind: "break", breakType: "page" }])
    }
  })
})
