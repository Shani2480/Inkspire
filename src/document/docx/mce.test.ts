import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { filterMarkup, MC_NS, MceError, WORD_NS, type MarkupEvent } from "@/document/docx/mce"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")
const W14 = "http://schemas.microsoft.com/office/word/2010/wordml"

function documentXml(id: string) {
  const file = readdirSync(CASES).find((name) => name.startsWith(`${id}_`) && name.endsWith(".docx"))
  if (!file) {
    throw new Error(`Missing fixture ${id}`)
  }
  return openPackage(new Uint8Array(readFileSync(path.join(CASES, file))), file).then((pkg) => {
    const part = findPart(pkg, pkg.mainPartName)
    if (!part) {
      throw new Error(`${id} has no main part`)
    }
    return decodeXml(part.data)
  })
}

function read(xml: string) {
  const events: MarkupEvent[] = []
  filterMarkup(xml, (event) => events.push(event))
  return events
}

function textOf(events: MarkupEvent[]) {
  return events
    .filter((event) => event.type === "text")
    .map((event) => event.text)
    .join("")
}

describe("markup compatibility", () => {
  it("x01", async () => {
    const events = read(await documentXml("x01"))
    const root = events.find((event) => event.type === "start" && event.local === "document")
    expect(root).toMatchObject({ uri: WORD_NS })
    expect(textOf(events)).toContain("MARKER-BASE")
  })

  it("x02", async () => {
    const xml = await documentXml("x02")
    expect(() => read(xml)).toThrow(MceError)
    try {
      read(xml)
    } catch (error) {
      expect(error).toMatchObject({ code: "unknown-namespace", uri: "http://example.com/x" })
    }
  })

  it("x03", async () => {
    const events = read(await documentXml("x03"))
    expect(textOf(events)).toContain("MARKER-A")
    expect(textOf(events)).toContain("MARKER-B")
    expect(events.some((event) => event.type === "start" && event.local === "probe")).toBe(false)
    const paragraph = events.find((event) => event.type === "start" && event.local === "p")
    expect(paragraph?.type).toBe("start")
    if (paragraph?.type === "start") {
      expect(paragraph.attributes.some((attribute) => attribute.local === "attr")).toBe(false)
    }
  })

  it("x04", async () => {
    const events = read(await documentXml("x04"))
    const text = textOf(events)
    expect(text).toContain("MARKER-FALLBACK")
    expect(text).not.toContain("MARKER-CHOICE")
    expect(events.some((event) => event.type === "start" && event.local === "AlternateContent")).toBe(false)
  })

  it("x05", async () => {
    const events = read(await documentXml("x05"))
    const text = textOf(events)
    expect(text).toContain("MARKER-CHOICE")
    expect(text).not.toContain("MARKER-FALLBACK")
    const paragraph = events.find((event) => event.type === "start" && event.local === "p")
    expect(paragraph).toMatchObject({ uri: WORD_NS })
    expect(
      events.some((event) => event.type === "start" && (event.local === "Choice" || event.local === "Fallback")),
    ).toBe(false)
  })

  it("keeps children when ProcessContent names the ignorable prefix", () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:mc="${"http://schemas.openxmlformats.org/markup-compatibility/2006"}" xmlns:x="http://example.com/x" mc:Ignorable="x" mc:ProcessContent="x">
        <x:wrap><w:t>KEPT</w:t></x:wrap>
      </w:document>`
    const events = read(xml)
    expect(textOf(events)).toContain("KEPT")
    expect(events.some((event) => event.type === "start" && event.local === "wrap")).toBe(false)
    expect(events.some((event) => event.type === "start" && event.local === "t")).toBe(true)
  })

  it("rejects mc:MustUnderstand for an unknown namespace", () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:mc="${"http://schemas.openxmlformats.org/markup-compatibility/2006"}" xmlns:x="http://example.com/x" mc:MustUnderstand="x"/>`
    expect(() => read(xml)).toThrow(MceError)
    try {
      read(xml)
    } catch (error) {
      expect(error).toMatchObject({ code: "must-understand", uri: "http://example.com/x" })
    }
  })

  it("selects a Choice only when every required prefix is understood", () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:mc="${"http://schemas.openxmlformats.org/markup-compatibility/2006"}" xmlns:w14="${W14}" xmlns:x="http://example.com/x">
        <mc:AlternateContent>
          <mc:Choice Requires="w14 x"><w:t>BOTH</w:t></mc:Choice>
          <mc:Choice Requires="w14"><w:t>W14</w:t></mc:Choice>
          <mc:Fallback><w:t>FALL</w:t></mc:Fallback>
        </mc:AlternateContent>
      </w:document>`
    expect(textOf(read(xml))).toContain("W14")
    expect(textOf(read(xml))).not.toContain("BOTH")
    expect(textOf(read(xml))).not.toContain("FALL")
  })

  it("passes charts and drawing extensions through although Word never lists them as ignorable", () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId9"/>
          <v:thing xmlns:v="http://example.com/vendor"/>
        </a:graphicData></a:graphic>
        <a:extLst><a:ext uri="{X}"><x:new xmlns:x="http://example.com/x"/></a:ext></a:extLst>
      </w:document>`
    const events = read(xml)
    expect(events.some((event) => event.type === "start" && event.local === "chart")).toBe(true)
    expect(events.some((event) => event.type === "start" && event.local === "thing")).toBe(true)
    expect(events.some((event) => event.type === "start" && event.local === "new")).toBe(true)
  })

  it("reads the chart shapes Word writes: floating, chartex (its Choice, not the fallback), and inside a drawing canvas", () => {
    const a = "http://schemas.openxmlformats.org/drawingml/2006/main"
    const c = "http://schemas.openxmlformats.org/drawingml/2006/chart"
    const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    const wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    const wp14 = "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
    const wpc = "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
    const chart = `<a:graphic xmlns:a="${a}"><a:graphicData uri="${c}"><c:chart xmlns:c="${c}" xmlns:r="${r}" r:id="rId5"/></a:graphicData></a:graphic>`
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:wp="${wp}" xmlns:wp14="${wp14}" xmlns:wpc="${wpc}" xmlns:mc="${MC_NS}" mc:Ignorable="wp14">
        <w:body><w:p><w:r>
          <w:drawing><wp:anchor behindDoc="0" wp14:anchorId="1A2B3C4D"><wp:docPr id="1" name="Chart 1"/>${chart}</wp:anchor></w:drawing>
          <mc:AlternateContent>
            <mc:Choice xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" Requires="cx1">
              <w:drawing><wp:inline><a:graphic xmlns:a="${a}"><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex">
                <cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:r="${r}" r:id="rId6"/>
              </a:graphicData></a:graphic></wp:inline></w:drawing>
            </mc:Choice>
            <mc:Fallback><w:t>FALLBACK</w:t></mc:Fallback>
          </mc:AlternateContent>
          <w:drawing><wp:inline><a:graphic xmlns:a="${a}"><a:graphicData uri="${wpc}">
            <wpc:wpc><wpc:graphicFrame>${chart}</wpc:graphicFrame></wpc:wpc>
          </a:graphicData></a:graphic></wp:inline></w:drawing>
        </w:r></w:p></w:body>
      </w:document>`
    const events = read(xml)
    expect(events.filter((event) => event.type === "start" && event.local === "chart")).toHaveLength(3)
    expect(textOf(events)).not.toContain("FALLBACK")
  })

  it("still rejects an unknown namespace outside a drawing's open content", () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphic><a:graphicData uri="u"/></a:graphic><x:new xmlns:x="http://example.com/x"/>
      </w:document>`
    expect(() => read(xml)).toThrow(MceError)
  })
})
