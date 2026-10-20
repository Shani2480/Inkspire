import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { renderDiagramDrawing } from "@/document/docx/smartart-import"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const NAME = "f21_smartart.docx"

async function open() {
  return openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
}

const DRAWING =
  `<dsp:drawing xmlns:dsp="x" xmlns:a="y"><dsp:spTree>` +
  `<dsp:sp><dsp:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="3000" cy="2000"/></a:xfrm><a:prstGeom prst="roundRect"/>` +
  `<a:solidFill><a:srgbClr val="FFC000"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></dsp:spPr>` +
  `<dsp:txBody><a:p><a:r><a:rPr sz="2400"/><a:t>Plan</a:t></a:r></a:p></dsp:txBody>` +
  `<dsp:txXfrm><a:off x="150" y="250"/><a:ext cx="2900" cy="1900"/></dsp:txXfrm></dsp:sp>` +
  `<dsp:sp><dsp:spPr><a:xfrm rot="5400000"><a:off x="4000" y="0"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="rightArrow"/>` +
  `<a:noFill/></dsp:spPr></dsp:sp></dsp:spTree></dsp:drawing>`

describe("SmartArt from Word (21.36)", () => {
  it("draws each shape of the saved drawing with its fill, outline and text", () => {
    const svg = renderDiagramDrawing(DRAWING, null, 5000, 3000)!
    expect(svg).toContain('viewBox="0 0 5000 3000"')
    expect(svg.match(/<path /g)).toHaveLength(2)
    expect(svg).toContain('fill="#ffc000"')
    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toContain('stroke-width="19050"')
    expect(svg).toContain("rotate(90)")
    expect(svg).toContain(">Plan</text>")
    expect(renderDiagramDrawing("<dsp:drawing/>", null, 1, 1)).toBeNull()
  })

  it("opens the graphic from Word's own drawing instead of a text stand-in", async () => {
    const html = (await open()).view.html
    expect(html).not.toContain("[Diagram 9]")
    const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body
    const picture = root.querySelector<HTMLImageElement>("img[alt='Diagram 9']")
    expect(picture).not.toBeNull()
    const svg = decodeURIComponent(escape(atob(picture!.src.split(",")[1]!)))
    expect(svg.match(/<path /g)).toHaveLength(14)
  })

  it("keeps the diagram parts and the graphic as written on save", async () => {
    const opened = await open()
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    try {
      const saved = await saveDocxBytes({
        json: editor.getJSON(),
        chrome: opened.view.chrome,
        props: opened.view.props,
        word: opened.word,
        unchanged: false,
        fileName: "edited.docx",
      })
      const pkg = await openPackage(saved.bytes, "edited.docx")
      const original = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
      for (const part of ["data1", "layout1", "quickStyle1", "colors1", "drawing1"]) {
        const name = `/word/diagrams/${part}.xml`
        expect(findPart(pkg, name)?.data, name).toEqual(findPart(original, name)?.data)
      }
      const xml = new TextDecoder().decode(findPart(pkg, "/word/document.xml")!.data)
      expect(xml).toContain("drawingml/2006/diagram")
      expect(xml).not.toContain("<pic:pic")
    } finally {
      editor.destroy()
    }
  })
})
