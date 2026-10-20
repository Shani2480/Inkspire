import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { paragraphText, paragraphsIn, type RunContent, type WordDocument } from "@/document/docx/model"
import { findPart, openPackage, relationshipsFor, writePackage } from "@/document/docx/opc"
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

function drawings(doc: WordDocument) {
  const found: Extract<RunContent, { kind: "drawing" }>[] = []
  for (const paragraph of paragraphsIn(doc.blocks)) {
    for (const inline of paragraph.inlines) {
      if (inline.kind !== "run") {
        continue
      }
      for (const content of inline.content) {
        if (content.kind === "drawing") {
          found.push(content)
        }
      }
    }
  }
  return found
}

describe("images, shapes, content controls, and equations", () => {
  it("round-trips an inline image and its stored media part", async () => {
    const { doc, original, written } = await roundTrip("f13_inline_image.docx")
    expect(normalize(partXml(written, "/word/document.xml"))).toBe(normalize(partXml(original, "/word/document.xml")))
    const picture = drawings(doc)[0]
    expect(picture).toMatchObject({
      relId: "rId4",
      name: "Picture 1",
      cx: 609600,
      cy: 304800,
      floating: false,
    })
    const media = findPart(written, "/word/media/image1.png")
    expect(Array.from(media?.data ?? [])).toEqual(Array.from(findPart(original, "/word/media/image1.png")?.data ?? []))
    expect(
      written.zipEntries.find((entry) => entry.normalizedName === "word/media/image1.png")?.compressionMethod,
    ).toBe(0)
    expect(relationshipsFor(written, "/word/document.xml").find((item) => item.id === "rId4")?.partName).toBe(
      "/word/media/image1.png",
    )
  })

  it("round-trips floating shapes inside AlternateContent and shows the text box", async () => {
    const { doc, original, written } = await roundTrip("f14_floating_shape.docx")
    expect(normalize(partXml(written, "/word/document.xml"))).toBe(normalize(partXml(original, "/word/document.xml")))
    const shapes = drawings(doc)
    expect(shapes.map((shape) => shape.name)).toEqual(["Text Box 1", "Oval 2"])
    expect(shapes.every((shape) => shape.floating)).toBe(true)
    expect(shapes[0]?.xml.startsWith("<mc:AlternateContent>")).toBe(true)
    expect(shapes[0]?.text).toBe("TEXTBOX-TEXT")
    expect(paragraphText(paragraphsIn(doc.blocks)[1]!)).toBe("anchor paragraphTEXTBOX-TEXT")
  })

  it("round-trips content controls as raw XML and keeps the glossary", async () => {
    const { doc, original, written } = await roundTrip("f16_content_control.docx")
    expect(normalize(partXml(written, "/word/document.xml"))).toBe(normalize(partXml(original, "/word/document.xml")))
    const controls = doc.blocks.filter((block) => block.kind === "raw")
    expect(controls.map((block) => block.text)).toEqual(["CC-TEXT", "Choose an item."])
    expect(partXml(written, "/word/glossary/document.xml")).toBe(partXml(original, "/word/glossary/document.xml"))
    expect(relationshipsFor(written, "/word/document.xml").some((item) => item.id === "rId5")).toBe(true)
  })

  it("round-trips an equation as raw OMML and shows its text", async () => {
    const { doc, original, written } = await roundTrip("f17_equation.docx")
    expect(normalize(partXml(written, "/word/document.xml"))).toBe(normalize(partXml(original, "/word/document.xml")))
    const paragraph = paragraphsIn(doc.blocks)[1]
    const math = paragraph?.inlines.find((inline) => inline.kind === "raw")
    expect(math?.kind === "raw" && math.xml.startsWith("<m:oMathPara>")).toBe(true)
    expect(paragraphText(paragraph!)).toBe("x=a+bc")
  })
})
