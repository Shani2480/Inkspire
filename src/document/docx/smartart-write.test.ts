import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { renderDiagramDrawing } from "@/document/docx/smartart-import"
import {
  WORD_LAYOUTS,
  appLayoutOf,
  diagramDataXml,
  diagramDrawingXml,
  diagramLayoutXml,
  diagramRelIds,
  readDiagramData,
} from "@/document/docx/smartart-write"
import { decodeXml } from "@/document/docx/xml"
import { writeItems, type SmartArtItem } from "@/editor/smartart-model"

const ITEMS: SmartArtItem[] = [
  { text: "Board", level: 0 },
  { text: "Sales & Marketing", level: 1 },
  { text: "Field", level: 2 },
  { text: "Finance", level: 1 },
  { text: "Two\nlines", level: 0 },
]

const SHAPES = [
  {
    x: 0,
    y: 0,
    w: 120,
    h: 60,
    text: "Board",
    preset: "roundRect",
    fill: "#0f6cbd",
    line: "",
    color: "#ffffff",
    size: 14,
  },
]

function encode(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return btoa(String.fromCharCode(...bytes))
}

function graphicPicture(layout: string, items: SmartArtItem[], extra: Record<string, unknown> = {}) {
  const object = {
    type: "smartArt",
    attrs: { layout, ...writeItems(items), accent: "#0f6cbd" },
    shown: [400, 240],
    ...extra,
  }
  return {
    type: "image",
    attrs: {
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      width: 400,
      height: 240,
      objectNode: encode(object),
    },
  }
}

async function save(content: unknown[], word: Awaited<ReturnType<typeof openDocxBytes>> | null = null) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content },
    chrome: word?.view.chrome ?? emptyChrome(),
    props: word?.view.props,
    word: word?.word ?? null,
    unchanged: false,
    fileName: "d.docx",
  })
  return { bytes: saved.bytes, pkg: await openPackage(saved.bytes, "d.docx") }
}

describe("SmartArt as Word's diagram (21.36)", () => {
  it("writes the items as points joined to their parents, and reads them back", () => {
    const xml = diagramDataXml(ITEMS, "hierarchy", "rId9")
    expect(xml).toContain(`loTypeId="${WORD_LAYOUTS.hierarchy!.id}"`)
    expect(xml).toContain(
      '<dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rId9"',
    )
    expect(xml).toContain("<a:t>Sales &amp; Marketing</a:t>")
    // One parent-of connection, one parTrans and one sibTrans point per item.
    expect(xml.match(/<dgm:cxn /g)).toHaveLength(ITEMS.length)
    expect(xml.match(/type="parTrans"/g)).toHaveLength(ITEMS.length)
    const read = readDiagramData(xml)!
    expect(read.items).toEqual(ITEMS)
    expect(appLayoutOf(read.layoutId)).toBe("hierarchy")
  })

  it("gives every layout a definition under its own id", () => {
    for (const [layout, word] of Object.entries(WORD_LAYOUTS)) {
      const xml = diagramLayoutXml(layout)
      expect(xml, layout).toContain(`uniqueId="${word.id}"`)
      expect(xml, layout).toContain('<dgm:layoutNode name="diagram">')
      expect(appLayoutOf(word.id), layout).toBe(layout)
    }
    expect(appLayoutOf("urn:microsoft.com/office/officeart/2009/3/layout/CircleRelationship")).toBeNull()
  })

  it("draws the shapes as the app showed them, for programs that show the saved drawing", () => {
    const svg = renderDiagramDrawing(diagramDrawingXml(SHAPES), null, 400 * 9525, 240 * 9525)!
    expect(svg).toContain('fill="#0f6cbd"')
    expect(svg).toContain(">Board</text>")
  })

  it("saves the graphic as a diagram with its five parts, and opens it as the app's graphic", async () => {
    const { pkg, bytes } = await save([graphicPicture("process", ITEMS.slice(0, 3), { shapes: SHAPES })])
    const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    const ids = diagramRelIds(xml)!
    expect(ids.data && ids.layout && ids.style && ids.colors).toBeTruthy()
    const rels = pkg.relationships.find((group) => group.source === pkg.mainPartName)!.items
    const target = (id: string | undefined) => rels.find((item) => item.id === id)?.partName ?? ""
    expect(target(ids.data)).toMatch(/^\/word\/diagrams\/data\d+\.xml$/)
    expect(decodeXml(findPart(pkg, target(ids.layout))!.data)).toContain(WORD_LAYOUTS.process!.id)
    expect(decodeXml(findPart(pkg, target(ids.style))!.data)).toContain("quickstyle/simple1")
    expect(decodeXml(findPart(pkg, target(ids.colors))!.data)).toContain("colors/accent1_2")
    expect(
      rels.some((item) => item.type.endsWith("/diagramDrawing") && /drawing\d+\.xml$/.test(item.partName ?? "")),
    ).toBe(true)
    expect(pkg.parts.some((part) => part.contentType.includes("diagramData"))).toBe(true)
    const opened = await openDocxBytes(bytes, "d.docx")
    const object = /data-inkspire-object="([^"]+)"/.exec(opened.view.html)?.[1]
    const graphic = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(object!), (c) => c.charCodeAt(0))))
    expect(graphic.type).toBe("smartArt")
    expect(graphic.attrs.layout).toBe("process")
    expect(JSON.parse(graphic.attrs.labels)).toEqual(["Board", "Sales & Marketing", "Field"])
  })

  it("takes the text Word changed, and keeps Word's layout parts when the app changes the text", async () => {
    const first = await save([graphicPicture("hierarchy", ITEMS)])
    // Word edits a point's text: its data part reads "Board of directors".
    const dataName = first.pkg.parts.find((part) => /\/word\/diagrams\/data\d+\.xml$/.test(part.name))!.name
    const edited = new TextEncoder().encode(
      decodeXml(findPart(first.pkg, dataName)!.data).replace("<a:t>Board</a:t>", "<a:t>Board of directors</a:t>"),
    )
    const { writePackage } = await import("@/document/docx/opc")
    first.pkg.parts = first.pkg.parts.map((part) => (part.name === dataName ? { ...part, data: edited } : part))
    const bytes = await writePackage(first.pkg)
    const opened = await openDocxBytes(bytes, "d.docx")
    expect(opened.view.html).toContain("data-inkspire-object")
    const object = /data-inkspire-object="([^"]+)"/.exec(opened.view.html)![1]!
    const graphic = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(object), (c) => c.charCodeAt(0))))
    expect(JSON.parse(graphic.attrs.labels)[0]).toBe("Board of directors")
  })
})
