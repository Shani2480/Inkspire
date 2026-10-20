import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage, relationshipsFor, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

type Package = Awaited<ReturnType<typeof openPackage>>

function source(name: string) {
  return new Uint8Array(readFileSync(path.join(AUTHORED, name)))
}

async function roundTrip(name: string) {
  const original = await openPackage(source(name), name)
  const doc = readDocument(original)
  const written = await openPackage(await writePackage(writeDocument(doc)), name)
  return { doc, original, written }
}

function partXml(pkg: Package, partName: string) {
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

/** The writer declares its own namespace list on numbering.xml; the content below the root has to match. */
const OWN_ROOT = new Set(["/word/numbering.xml"])

function belowRoot(xml: string) {
  return xml.replace(/^[\s\S]*?<(w:[A-Za-z]+)\b[^>]*>/, "<$1>")
}

/** Every part Word wrote comes back: XML equal up to ids, everything else byte for byte. */
function expectEveryPart(original: Package, written: Package) {
  for (const part of original.parts) {
    const copy = findPart(written, part.name)
    expect(copy, part.name).toBeDefined()
    if (part.name.endsWith(".xml")) {
      const shape = OWN_ROOT.has(part.name) ? belowRoot : (xml: string) => xml
      expect(shape(normalize(decodeXml(copy!.data))), part.name).toBe(shape(normalize(decodeXml(part.data))))
    } else {
      expect(copy!.data, part.name).toEqual(part.data)
    }
  }
}

function text(pkg: Package) {
  return paragraphsIn(readDocument(pkg).blocks)
    .map((paragraph) => paragraphText(paragraph))
    .join("\n")
}

describe("golden round-trips of Word-authored files", () => {
  it.each(["f01_runs", "f02_heading_style", "f03_para_format", "f18_properties", "f19_styles_custom", "combined"])(
    "%s keeps every part",
    async (name) => {
      const { original, written } = await roundTrip(`${name}.docx`)
      expectEveryPart(original, written)
    },
  )

  it("f18 keeps core, app, and custom properties with their package relationships", async () => {
    const { original, written } = await roundTrip("f18_properties.docx")
    for (const name of ["/docProps/core.xml", "/docProps/app.xml", "/docProps/custom.xml"]) {
      expect(findPart(written, name)?.data, name).toEqual(findPart(original, name)?.data)
    }
    const types = relationshipsFor(written, "")
      .map((item) => item.type.split("/").pop())
      .sort()
    expect(types).toEqual(["core-properties", "custom-properties", "extended-properties", "officeDocument"])
  })

  it("f19 keeps custom styles and the latent style table", async () => {
    const { doc, written } = await roundTrip("f19_styles_custom.docx")
    expect(doc.styles.styles.some((style) => style.id !== "Normal" && !style.id.startsWith("Heading"))).toBe(true)
    const styles = partXml(written, "/word/styles.xml")
    expect(styles).toContain("<w:latentStyles")
    expect(styles).toContain("<w:qFormat/>")
  })

  it("regenerates an edited style from the model and keeps the others as written", async () => {
    const original = await openPackage(source("f02_heading_style.docx"), "f02.docx")
    const doc = readDocument(original)
    const heading = doc.styles.styles.find((style) => style.id === "Heading1")!
    heading.rPr = { ...heading.rPr, b: true }
    const written = await openPackage(await writePackage(writeDocument(doc)), "f02.docx")
    const styles = partXml(written, "/word/styles.xml")
    const before = partXml(original, "/word/styles.xml")
    const editedXml = /<w:style\b[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/.exec(styles)?.[0] ?? ""
    expect(editedXml).toContain("<w:b/>")
    expect(editedXml).not.toBe(/<w:style\b[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/.exec(before)?.[0])
    expect(styles).toContain(/<w:latentStyles[\s\S]*?<\/w:latentStyles>/.exec(before)?.[0])
    const normal = /<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/
    expect(normal.exec(styles)?.[0]).toBe(normal.exec(before)?.[0])
  })

  it("puts a newly enabled settings element at its schema position", async () => {
    const original = await openPackage(source("f01_runs.docx"), "f01.docx")
    const doc = readDocument(original)
    doc.settings.evenAndOddHeaders = true
    const written = await openPackage(await writePackage(writeDocument(doc)), "f01.docx")
    const settings = partXml(written, "/word/settings.xml")
    const order = ["<w:zoom", "<w:defaultTabStop", "<w:evenAndOddHeaders/>", "<w:characterSpacingControl", "<w:compat>"]
    const positions = order.map((tag) => settings.indexOf(tag))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it("keeps theme, font table, and settings when an opened file is edited and saved", async () => {
    const name = "combined.docx"
    const bytes = source(name)
    const opened = await openDocxBytes(bytes, name)
    const saved = await saveDocxBytes({
      json: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Edited marker" }] }],
      },
      chrome: opened.view.chrome,
      props: { ...opened.view.props, title: "Edited title" },
      word: opened.word,
      unchanged: false,
      fileName: name,
    })
    const original = await openPackage(bytes, name)
    const written = await openPackage(saved.bytes, name)
    for (const part of [
      "/word/theme/theme1.xml",
      "/word/fontTable.xml",
      "/word/webSettings.xml",
      "/docProps/app.xml",
    ]) {
      expect(findPart(written, part)?.data, part).toEqual(findPart(original, part)?.data)
    }
    expect(normalize(partXml(written, "/word/settings.xml"))).toBe(normalize(partXml(original, "/word/settings.xml")))
    expect(written.parts.filter((part) => part.name === "/docProps/core.xml")).toHaveLength(1)
    expect(partXml(written, "/docProps/core.xml")).toContain("Edited title")
    expect(relationshipsFor(written, "").filter((item) => item.type.endsWith("/core-properties"))).toHaveLength(1)
    expect(text(written)).toContain("Edited marker")
  })

  it("reads combined-strict as the same text as its Transitional twin and writes Transitional", async () => {
    const strict = await roundTrip("combined-strict.docx")
    const transitional = await openPackage(source("combined.docx"), "combined.docx")
    expect(text(strict.original)).toBe(text(transitional))
    expect(text(strict.written)).toBe(text(transitional))
    for (const part of strict.written.parts.filter((item) => item.name.endsWith(".xml"))) {
      const root = /<[A-Za-z0-9:]+(?:\s[^>]*)?>/.exec(decodeXml(part.data).replace(/^<\?xml[^>]*\?>\s*/, ""))?.[0]
      expect(root, part.name).not.toContain("purl.oclc.org/ooxml")
    }
  })

  it("writes combined-strict as the same Transitional markup as its twin", async () => {
    const strict = await roundTrip("combined-strict.docx")
    const transitional = await openPackage(source("combined.docx"), "combined.docx")
    // Root declarations differ by source, and Strict files omit tblLook's legacy hex value.
    const body = (xml: string) =>
      normalize(xml)
        .replace(/^[\s\S]*?<w:(document|styles|numbering|footnotes|endnotes)\b[^>]*>/, "")
        .replace(/ w:val="0000"(?= w:firstRow)/g, "")
    for (const part of [
      "/word/document.xml",
      "/word/styles.xml",
      "/word/numbering.xml",
      "/word/footnotes.xml",
      "/word/endnotes.xml",
    ]) {
      expect(body(partXml(strict.written, part)), part).toBe(body(partXml(transitional, part)))
    }
    for (const part of ["/word/theme/theme1.xml", "/word/webSettings.xml", "/docProps/app.xml"]) {
      expect(partXml(strict.written, part), part).toBe(partXml(transitional, part))
    }
    const settings = partXml(strict.written, "/word/settings.xml")
    expect(settings).toContain('<w:zoom w:percent="100"/>')
    expect(settings).toContain('<w:defaultTabStop w:val="720"/>')
    for (const part of strict.written.parts) {
      const text = decodeXml(part.data)
      expect(text, part.name).not.toContain("purl.oclc.org/ooxml")
      expect(text, part.name).not.toContain("conformance=")
    }
    for (const group of strict.written.relationships) {
      for (const item of group.items) {
        expect(item.type, item.target).not.toContain("purl.oclc.org")
      }
    }
  })
})
