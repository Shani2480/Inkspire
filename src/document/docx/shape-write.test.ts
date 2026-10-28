import { describe, expect, it } from "vitest"
import { shapeMarkup } from "@/editor/insert-blocks"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { readWordShape } from "@/document/docx/shape-import"
import { readDash } from "@/document/docx/shape-effects"
import { cssGradient, gradientVector, parseWordGradient } from "@/editor/shape-style"
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

  it("saves a shape with edited points as Word's freeform, and opens it again with them", async () => {
    const points = "M0 0 L100 20 L80 100 L10 90 Z"
    const { bytes, xml } = await save([shapeImage({ variant: "rect", points, fill: "#70ad47" })])
    expect(xml).toContain("<a:custGeom>")
    expect(xml).toContain('<a:lnTo><a:pt x="100000" y="20000"/></a:lnTo>')
    expect(xml).not.toContain("<a:prstGeom")
    const reopened = await openDocxBytes(bytes, "s.docx")
    const object = /data-inkspire-object="([^"]*)"/.exec(reopened.view.html)?.[1] ?? ""
    const figure = JSON.parse(atob(object)) as { attrs: Record<string, unknown> }
    expect(figure.attrs).toMatchObject({ points, fill: "#70ad47" })
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

  it("writes italic, underline, highlight and alignment, and reads them back", () => {
    const wsp = (attrs: Record<string, unknown>) => {
      const xml = wordShapeGraphic({ variant: "ellipse", text: "Hi", ...attrs }, 1000, 500)!
      return {
        xml,
        read: readWordShape(
          `<wps:wsp>${xml.slice(xml.indexOf("<wps:cNvSpPr/>"))}</wps:wsp><a:graphicData uri="${WPS_URI}">`,
          null,
        )!,
      }
    }
    const named = wsp({ textItalic: true, textUnderline: "double", textHighlight: "#ffff00", textAlign: "right" })
    expect(named.xml).toContain("<w:i/>")
    expect(named.xml).toContain('<w:u w:val="double"/>')
    expect(named.xml).toContain('<w:highlight w:val="yellow"/>')
    expect(named.xml).toContain('<w:jc w:val="right"/>')
    expect(named.read).toMatchObject({
      textItalic: true,
      textUnderline: "double",
      textHighlight: "#ffff00",
      textAlign: "right",
    })
    // A colour Word has no highlight for is the run's shading; centred text stays the default.
    const other = wsp({ textHighlight: "#fff2cc" })
    expect(other.xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFF2CC"/>')
    expect(other.xml).toContain('<w:jc w:val="center"/>')
    expect(other.read).toMatchObject({ textHighlight: "#fff2cc", textAlign: "", textItalic: false, textUnderline: "" })
  })

  it("reads a theme colour and theme font Word gave the text", () => {
    const theme =
      `<a:theme><a:clrScheme name="t"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
      `<a:accent2><a:srgbClr val="E97132"/></a:accent2></a:clrScheme><a:fontScheme name="f">` +
      `<a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont>` +
      `</a:fontScheme></a:theme>`
    const shape = (rPr: string) =>
      `<wps:wsp><wps:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:t>x</w:t></w:r></w:p>` +
      `</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp><a:graphicData uri="${WPS_URI}">`
    expect(
      readWordShape(
        shape('<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:color w:themeColor="accent2"/>'),
        theme,
      ),
    ).toMatchObject({ textFont: "Aptos Display", textColor: "#e97132", textAlign: "" })
    // A tint lightens the theme colour toward white, as Word draws it.
    expect(readWordShape(shape('<w:color w:themeColor="text1" w:themeTint="80"/>'), theme)?.textColor).toBe("#7f7f7f")
    // Word's own value wins when it wrote one.
    expect(readWordShape(shape('<w:color w:val="FF0000" w:themeColor="accent2"/>'), theme)?.textColor).toBe("#ff0000")
  })

  it("keeps a real text box whole", () => {
    const box = `<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:prstGeom prst="rect"/></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp><a:graphicData uri="${WPS_URI}">`
    expect(readWordShape(box, null)).toBeNull()
  })

  it("writes no text body for a shape without text", () => {
    expect(wordShapeGraphic({ variant: "ellipse" }, 1, 1)).not.toContain("txbx")
  })
})

describe("Word's own gradients and dashes", () => {
  const wsp = (spPr: string, style = "") =>
    `<wps:wsp><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${spPr}</wps:spPr>${style}</wps:wsp><a:graphicData uri="${WPS_URI}">`
  const THEME =
    `<a:theme><a:clrScheme name="t"><a:accent2><a:srgbClr val="E97132"/></a:accent2></a:clrScheme>` +
    `<a:fmtScheme><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="50000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst></a:fmtScheme></a:theme>`

  it("keeps a gradient with more stops and its own angle whole, and draws it", () => {
    const read = readWordShape(
      wsp(
        `<a:gradFill><a:gsLst><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>` +
          `<a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill>`,
      ),
      null,
    )!
    expect(read.gradient).toBe("word:45:0#ff0000;50#00ff00;100#0000ff")
    expect(read.fill).toBe("#ff0000")
    expect(gradientVector(read.gradient)).toEqual([0, 0, 1, 1])
    expect(gradientVector("word:90:0#000000;100#ffffff")).toEqual([0.5, 0, 0.5, 1])
    expect(cssGradient("", read.gradient)).toBe("linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)")
    expect(cssGradient("", "word:radial:0#ffffff;100#000000")).toBe("radial-gradient(circle, #ffffff 0%, #000000 100%)")
  })

  it("writes Word's gradient back with every stop and its angle", () => {
    const gradient = "word:30.5:0#ff0000;35#00ff00;100#0000ff"
    const xml = wordShapeGraphic({ variant: "rect", fill: "#ff0000", fillGradient: gradient }, 1, 1)!
    expect(xml).toContain('<a:gs pos="35000"><a:srgbClr val="00FF00"/></a:gs>')
    expect(xml).toContain('<a:lin ang="1830000" scaled="0"/>')
    const read = readWordShape(
      `<wps:wsp>${xml.slice(xml.indexOf("<wps:cNvSpPr/>"))}</wps:wsp><a:graphicData uri="${WPS_URI}">`,
      null,
    )!
    expect(read.gradient).toBe(gradient)
  })

  it("survives saving to a file and opening it again", async () => {
    const gradient = "word:270:0#0e4057;48#1c6586;100#73a0b4"
    const { bytes } = await save([
      shapeImage({ variant: "rect", fill: "#0e4057", fillGradient: gradient, strokeDash: "dash" }),
    ])
    const reopened = await openDocxBytes(bytes, "s.docx")
    const object = /data-inkspire-object="([^"]*)"/.exec(reopened.view.html)?.[1] ?? ""
    const figure = JSON.parse(atob(object)) as { attrs: Record<string, unknown> }
    expect(figure.attrs).toMatchObject({ fillGradient: gradient, strokeDash: "dash" })
  })

  it("reads the theme gradient a shape style refers to, in the style's colour", () => {
    const style = `<wps:style><a:lnRef idx="0"><a:schemeClr val="accent2"/></a:lnRef><a:fillRef idx="2"><a:schemeClr val="accent2"/></a:fillRef></wps:style>`
    const read = readWordShape(wsp("", style), THEME)!
    expect(parseWordGradient(read.gradient)).toEqual({
      angle: 90,
      stops: [
        [0, "#753919"],
        [100, "#e97132"],
      ],
    })
    // Its own fill wins over the style's.
    expect(readWordShape(wsp(`<a:solidFill><a:srgbClr val="123456"/></a:solidFill>`, style), THEME)!.gradient).toBe("")
  })

  it("reads Word's other dashes as the nearest one in the list", () => {
    expect(readDash('<a:ln><a:prstDash val="sysDashDot"/></a:ln>')).toBe("dash-dot")
    expect(readDash('<a:ln><a:prstDash val="sysDashDotDot"/></a:ln>')).toBe("long-dash-dot-dot")
    expect(readDash('<a:ln><a:custDash><a:ds d="100000" sp="50000"/></a:custDash></a:ln>')).toBe("dash")
    expect(readDash('<a:ln><a:prstDash val="lgDash"/></a:ln>')).toBe("long-dash")
    expect(readDash('<a:ln><a:prstDash val="solid"/></a:ln>')).toBe("")
  })
})
