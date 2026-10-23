import { describe, expect, it } from "vitest"
import { shapeMarkup } from "@/editor/insert-blocks"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { readWordShape } from "@/document/docx/shape-import"
import { WPS_URI, plainShapePreset, wordShapeGraphic } from "@/document/docx/shape-write"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function encode(value: unknown) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
}

function shapeImage(attrs: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const figure = { type: "figure", attrs: { kind: "shape", width: 160, height: 96, ...attrs } }
  return {
    type: "image",
    attrs: { src: PNG, width: 160, height: 96, objectNode: encode({ ...figure, shown: [160, 96] }), ...extra },
  }
}

async function save(content: unknown[]) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content: content.map((node) => ({ type: "paragraph", content: [node] })) },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "s.docx",
  })
  const pkg = await openPackage(saved.bytes, "s.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, "/word/document.xml")!.data) }
}

describe("shapes written as Word's own (22.11)", () => {
  it("knows which shapes are plain enough", () => {
    expect(plainShapePreset({ variant: "heart" })).toBe("heart")
    expect(plainShapePreset({ variant: "heart", fillImage: "data:x" })).toBeNull()
    expect(plainShapePreset({ variant: "heart", fill: "rgb(1,2,3)" })).toBeNull()
    expect(plainShapePreset({ variant: "star5" })).toBeNull()
    expect(plainShapePreset({ variant: "star" })).toBe("star5")
    expect(plainShapePreset({ variant: "heart", bevel: "circle" })).toBeNull()
    expect(plainShapePreset({ variant: "heart", shadow: "perspective" })).toBeNull()
    expect(plainShapePreset({ variant: "heart", shadow: "outer-br", glow: "#4472c4:8" })).toBe("heart")
  })

  it("draws Lightning and Explosion as Word's presets, filling their box", () => {
    expect(plainShapePreset({ variant: "lightning" })).toBe("lightningBolt")
    expect(plainShapePreset({ variant: "burst" })).toBe("irregularSeal1")
    // Word stretches a preset over its whole extent, so the drawings reach every edge of the 80 by 56 frame.
    for (const variant of ["lightning", "burst"]) {
      const points = [...shapeMarkup(variant).matchAll(/([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
      expect(Math.min(...points.map((p) => p[0]!))).toBe(0)
      expect(Math.max(...points.map((p) => p[0]!))).toBe(80)
      expect(Math.min(...points.map((p) => p[1]!))).toBe(0)
      expect(Math.max(...points.map((p) => p[1]!))).toBe(56)
    }
  })

  it("writes the preset, fill and outline as a wps shape", () => {
    const xml = wordShapeGraphic({ variant: "ellipse", fill: "#FFC000", stroke: "#c00000", strokeWidth: 2 }, 1000, 500)!
    expect(xml).toContain('prst="ellipse"')
    expect(xml).toContain('<a:srgbClr val="FFC000"/>')
    expect(xml).toContain('<a:ln w="25400">')
    expect(wordShapeGraphic({ variant: "rect", fill: "transparent", stroke: "none" }, 1, 1)).toContain(
      "<a:noFill/><a:ln><a:noFill/></a:ln>",
    )
  })

  it("saves a shape from the app as a wps drawing, not a picture, and opens it again as that shape", async () => {
    const { bytes, xml } = await save([
      shapeImage({ variant: "round", fill: "#70ad47", stroke: "#375623", strokeWidth: 3 }),
    ])
    expect(xml).toContain("wordprocessingShape")
    expect(xml).toContain('prst="roundRect"')
    expect(xml).not.toContain("<pic:pic")
    const reopened = await openDocxBytes(bytes, "s.docx")
    const object = /data-inkspire-object="([^"]*)"/.exec(reopened.view.html)?.[1] ?? ""
    const figure = JSON.parse(atob(object)) as { attrs: Record<string, unknown> }
    expect(figure.attrs).toMatchObject({
      variant: "round",
      fill: "#70ad47",
      stroke: "#375623",
      strokeWidth: 3,
      width: 160,
      height: 96,
    })
  })

  it("writes a dash and a gradient fill as DrawingML", () => {
    const xml = wordShapeGraphic(
      { variant: "rect", fill: "#4472c4", fillGradient: "light-diagonal", strokeDash: "dash-dot" },
      1,
      1,
    )!
    expect(xml).toContain('<a:prstDash val="dashDot"/>')
    expect(xml).toContain("<a:gradFill")
    expect(xml).toContain('<a:lin ang="2700000"')
    expect(wordShapeGraphic({ variant: "rect", fillGradient: "dark-radial" }, 1, 1)).toContain('<a:path path="circle">')
  })

  it("keeps a shape with a picture fill as a picture", async () => {
    const { xml } = await save([shapeImage({ variant: "rect", fillImage: "data:image/png;base64,AAAA" })])
    expect(xml).toContain("<pic:pic")
    expect(xml).not.toContain("wordprocessingShape")
  })
})

describe("look read back from Word's drawing (22.11)", () => {
  it("round-trips dash, gradient and effects", () => {
    const attrs = {
      variant: "rect",
      fill: "#4472c4",
      stroke: "#202020",
      strokeWidth: 2,
      strokeDash: "dash-dot",
      fillGradient: "light-diagonal",
      shadow: "outer-br",
      glow: "#ffc000:10",
      softEdge: 5,
      reflection: "half-offset",
    }
    const xml = wordShapeGraphic(attrs, 1000, 500)!
    expect(xml).toContain("<a:effectLst>")
    const read = readWordShape(
      `<wps:wsp>${xml.slice(xml.indexOf("<wps:cNvSpPr/>"))}</wps:wsp><a:graphicData uri="${WPS_URI}">`,
      null,
    )!
    expect(read).toMatchObject({
      variant: "rect",
      fill: "#4472c4",
      dash: "dash-dot",
      gradient: "light-diagonal",
      shadow: "outer-br",
      glow: "#ffc000:10",
      softEdge: 5,
      reflection: "half-offset",
    })
  })

  it("reads a dark gradient back", () => {
    const xml = wordShapeGraphic({ variant: "rect", fill: "#4472c4", fillGradient: "dark-down" }, 1, 1)!
    const read = readWordShape(
      `<wps:wsp>${xml.slice(xml.indexOf("<wps:cNvSpPr/>"))}</wps:wsp><a:graphicData uri="${WPS_URI}">`,
      null,
    )!
    expect(read.gradient).toBe("dark-down")
    expect(read.fill).toBe("#4472c4")
  })
})

describe("text in a shape", () => {
  it("is written as wps:txbx and read back, with its escapes", () => {
    const xml = wordShapeGraphic(
      {
        variant: "ellipse",
        text: "A & B\nsecond",
        textColor: "#ffffff",
        textSize: 20,
        textBold: true,
        textFont: "Georgia, serif",
      },
      1000,
      500,
    )!
    expect(xml).toContain("<wps:txbx><w:txbxContent>")
    expect(xml).toContain("A &amp; B")
    expect(xml).toContain('<w:sz w:val="40"/>')
    const read = readWordShape(
      `<wps:wsp>${xml.slice(xml.indexOf("<wps:cNvSpPr/>"))}</wps:wsp><a:graphicData uri="${WPS_URI}">`,
      null,
    )!
    expect(read).toMatchObject({
      text: "A & B\nsecond",
      textColor: "#ffffff",
      textSize: 20,
      textBold: true,
      textFont: "Georgia",
    })
  })

  it("keeps a real text box whole", () => {
    const box = `<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:prstGeom prst="rect"/></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp><a:graphicData uri="${WPS_URI}">`
    expect(readWordShape(box, null)).toBeNull()
  })

  it("writes no text body for a shape without text", () => {
    expect(wordShapeGraphic({ variant: "ellipse" }, 1, 1)).not.toContain("txbx")
  })
})
