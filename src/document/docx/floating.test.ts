import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { floatingLayout, rotationDegrees, rotationRot } from "@/document/docx/inlines"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

// A 1×1 transparent PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

function picture(attrs: Record<string, unknown>) {
  return { type: "image", attrs: { src: PNG, width: 96, height: 48, ...attrs } }
}

async function save(content: unknown[]) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "f.docx",
  })
  const pkg = await openPackage(saved.bytes, "f.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("floating pictures", () => {
  it("writes a picture that moves with text into the paragraph it is anchored to", async () => {
    const { xml } = await save([
      picture({ wrap: "square", anchoring: "move", x: 40, dy: 10, z: 3 }),
      { type: "paragraph", content: [{ type: "text", text: "Beside the picture" }] },
    ])
    expect(xml).toContain("<wp:anchor")
    expect(xml).toContain('<wp:wrapSquare wrapText="bothSides"/>')
    expect(xml).toContain(`<wp:positionV relativeFrom="paragraph"><wp:posOffset>${10 * 9525}</wp:posOffset>`)
    expect(xml).toContain(`<wp:positionH relativeFrom="margin"><wp:posOffset>${40 * 9525}</wp:posOffset>`)
    // One paragraph holds both the picture and the text.
    expect(xml.match(/<w:p[ >]/g)).toHaveLength(1)
  })

  it("opens the picture again with its wrap and place, before its paragraph", async () => {
    const { bytes } = await save([
      { type: "paragraph", content: [{ type: "text", text: "Above" }] },
      picture({ wrap: "behind", anchoring: "move", x: 12, dy: 30 }),
      { type: "paragraph", content: [{ type: "text", text: "Anchor" }] },
    ])
    const { view } = await openDocxBytes(bytes, "f.docx")
    const html = view.html
    const img = /<img [^>]*>/.exec(html)?.[0] ?? ""
    expect(img).toContain('data-wrap="behind"')
    expect(img).toContain('data-anchoring="move"')
    expect(img).toContain('data-x="12"')
    expect(img).toContain('data-dy="30"')
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("Anchor"))
    expect(html.indexOf("<img")).toBeGreaterThan(html.indexOf("Above"))
  })

  it("keeps the Layout options: alignment, wrap sides, distances, overlap and lock", async () => {
    const { bytes, xml } = await save([
      picture({
        wrap: "square",
        anchoring: "fixed",
        x: 0,
        y: 0,
        alignH: "left",
        alignV: "top",
        wrapSide: "left",
        distT: 4,
        distB: 8,
        distL: 16,
        distR: 20,
        allowOverlap: false,
        lockAnchor: true,
      }),
      { type: "paragraph", content: [{ type: "text", text: "Beside" }] },
    ])
    expect(xml).toContain('<wp:positionH relativeFrom="margin"><wp:align>left</wp:align>')
    expect(xml).toContain('<wp:positionV relativeFrom="margin"><wp:align>top</wp:align>')
    expect(xml).toContain('<wp:wrapSquare wrapText="left"/>')
    expect(xml).toContain(`distT="${4 * 9525}" distB="${8 * 9525}" distL="${16 * 9525}" distR="${20 * 9525}"`)
    expect(xml).toContain('locked="1"')
    expect(xml).toContain('allowOverlap="0"')
    const { view } = await openDocxBytes(bytes, "f.docx")
    const img = /<img [^>]*>/.exec(view.html)?.[0] ?? ""
    expect(img).toContain('data-align-h="left"')
    expect(img).toContain('data-align-v="top"')
    expect(img).toContain('data-wrap-side="left"')
    expect(img).toContain('data-dist-l="16"')
    expect(img).toContain('data-allow-overlap="0"')
    expect(img).toContain('data-lock-anchor="1"')
  })

  it("writes the offset once the object no longer sits where its alignment puts it", async () => {
    const { xml } = await save([
      picture({ wrap: "square", anchoring: "fixed", x: 50, y: 0, alignH: "left", alignV: "top" }),
      { type: "paragraph", content: [{ type: "text", text: "Beside" }] },
    ])
    expect(xml).toContain(`<wp:positionH relativeFrom="margin"><wp:posOffset>${50 * 9525}</wp:posOffset>`)
  })

  it("keeps a picture's turn (a:xfrm rot) through save and open", async () => {
    const { bytes, xml } = await save([
      picture({ rotate: -30 }),
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ])
    expect(xml).toContain(`<a:xfrm rot="${330 * 60000}">`)
    const { view } = await openDocxBytes(bytes, "f.docx")
    expect(/<img [^>]*>/.exec(view.html)?.[0]).toContain('data-rotate="-30"')
    expect(rotationDegrees(45 * 60000)).toBe(45)
    expect(rotationRot(-90)).toBe(270 * 60000)
    expect(rotationRot(360)).toBe(0)
  })

  it("keeps an in line picture in line", async () => {
    const { xml } = await save([picture({}), { type: "paragraph", content: [{ type: "text", text: "After" }] }])
    expect(xml).toContain("<wp:inline")
    expect(xml).not.toContain("<wp:anchor")
  })

  it("reads Word's alignments and page offsets from the margins", () => {
    const section = { pageWidth: 12240, marginLeft: 1440, marginRight: 1440, marginTop: 1440 }
    const centred = floatingLayout(
      {
        wrap: "topBottom",
        behind: false,
        h: { from: "margin", align: "center" },
        v: { from: "page", offset: 1828800 },
      },
      96 * 9525,
      section as never,
    )
    expect(centred).toMatchObject({ wrap: "topBottom", x: Math.round((624 - 96) / 2), dy: 96, relative: "margin" })
    const onPage = floatingLayout(
      { wrap: "none", behind: true, h: { from: "page", offset: 914400 }, v: { from: "line", offset: 0 } },
      96 * 9525,
      section as never,
    )
    expect(onPage).toMatchObject({ wrap: "behind", x: 0, relative: "paragraph" })
  })

  it("keeps the app's own object inside the picture it is saved as", async () => {
    const object = btoa(JSON.stringify({ type: "figure", attrs: { kind: "shape", width: 300, height: 200 } }))
    const { bytes, xml } = await save([picture({ wrap: "square", x: 20, y: 30, objectNode: object })])
    expect(xml).toContain('<ink:object xmlns:ink="https://inkspire.app/2026/object"')
    expect(xml).toContain(`data="${object}"`)
    const { view } = await openDocxBytes(bytes, "f.docx")
    const img = /<img [^>]*>/.exec(view.html)?.[0] ?? ""
    expect(img).toContain(`data-inkspire-object="${object}"`)
    expect(img).toContain('data-wrap="square"')
  })
})

describe("picture formatting in .docx", () => {
  it("writes a picture's corrections, frame and effects as DrawingML", async () => {
    const { xml } = await save([
      picture({
        brightness: 20,
        transparency: 30,
        border: "#0f6cbd",
        borderWidth: 3,
        frame: "oval",
        shadow: "outer-br",
      }),
    ])
    expect(xml).toContain('<a:lum bright="20000" contrast="0"/>')
    expect(xml).toContain('<a:alphaModFix amt="70000"/>')
    expect(xml).toContain('<a:prstGeom prst="ellipse">')
    expect(xml).toContain('<a:ln w="38100"><a:solidFill><a:srgbClr val="0f6cbd"/>')
    expect(xml).toContain("<a:effectLst><a:outerShdw ")
  })

  it("leaves a plain picture without any of it", async () => {
    const { xml } = await save([picture({})])
    expect(xml).not.toContain("<a:lum")
    expect(xml).not.toContain("<a:effectLst>")
    expect(xml).toContain('<a:prstGeom prst="rect">')
  })

  it("keeps a crop as a:srcRect and reads it back, as the part that shows", async () => {
    const { bytes, xml } = await save([picture({ cropL: 20, cropB: 12.5, width: 80, height: 40 })])
    expect(xml).toContain('<a:srcRect l="20000" b="12500"/>')
    expect(xml).toContain(`<wp:extent cx="${80 * 9525}" cy="${40 * 9525}"/>`)
    const { view } = await openDocxBytes(bytes, "f.docx")
    const img = /<img [^>]*>/.exec(view.html)?.[0] ?? ""
    expect(img).toContain('data-crop-l="20"')
    expect(img).toContain('data-crop-b="12.5"')
    expect(img).not.toContain("data-crop-t")
  })

  it("keeps Crop to Shape as the picture's preset geometry and reads it back", async () => {
    const { bytes, xml } = await save([picture({ frame: "star" }), picture({ frame: "oval" })])
    expect(xml).toContain('<a:prstGeom prst="star5">')
    expect(xml).toContain('<a:prstGeom prst="ellipse">')
    const { view } = await openDocxBytes(bytes, "f.docx")
    const images = view.html.match(/<img [^>]*>/g) ?? []
    expect(images[0]).toContain('data-frame="star"')
    expect(images[1]).toContain('data-frame="oval"')
  })

  it("writes Fit's empty room as a negative a:srcRect and reads it back", async () => {
    const { bytes, xml } = await save([picture({ cropT: -25, cropB: -25 })])
    expect(xml).toContain('<a:srcRect t="-25000" b="-25000"/>')
    const img = /<img [^>]*>/.exec((await openDocxBytes(bytes, "f.docx")).view.html)?.[0] ?? ""
    expect(img).toContain('data-crop-t="-25"')
  })

  it("leaves an uncropped picture without a crop", async () => {
    const { xml } = await save([picture({})])
    expect(xml).not.toContain("a:srcRect")
  })
})
