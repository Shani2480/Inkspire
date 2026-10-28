import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { restoreObjects } from "@/document/object-pictures"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { readWordShape } from "@/document/docx/shape-import"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

async function open() {
  return openDocxBytes(
    new Uint8Array(readFileSync(path.join(AUTHORED, "f20_word_shapes.docx"))),
    "f20_word_shapes.docx",
  )
}

function objects(html: string) {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild as HTMLElement
  return [...root.querySelectorAll<HTMLImageElement>("img[data-inkspire-object]")].map((image) => ({
    image,
    figure: JSON.parse(atob(image.getAttribute("data-inkspire-object") ?? "")) as {
      attrs: Record<string, unknown>
    },
  }))
}

const THEME = `<a:clrScheme name="t"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="156082"/></a:accent1></a:clrScheme>`

describe("Word's drawn shapes (21.35)", () => {
  it("reads the preset, fill and outline from the shape's style references", () => {
    const xml =
      `<wps:wsp><wps:spPr><a:prstGeom prst="heart"><a:avLst/></a:prstGeom></wps:spPr>` +
      `<wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="15000"/></a:schemeClr></a:lnRef>` +
      `<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef></wps:style></wps:wsp>` +
      `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">`
    expect(readWordShape(xml, THEME)).toMatchObject({
      preset: "heart",
      variant: "heart",
      fill: "#156082",
      stroke: "#030e14",
      strokeWidth: 1,
      dash: "",
      gradient: "",
      shadow: "",
    })
  })

  it("prefers the shape's own fill and line, and leaves a text box alone", () => {
    const own =
      `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr>` +
      `<a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill>` +
      `<a:ln w="25400"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></a:ln></wps:spPr></wps:wsp>`
    expect(readWordShape(own, THEME)).toMatchObject({
      variant: "ellipse",
      fill: "#ffc000",
      stroke: "#c00000",
      strokeWidth: 2,
    })
    const box = own
      .replace("<wps:wsp>", '<wps:wsp><wps:cNvSpPr txBox="1"/>')
      .replace("</wps:wsp>", "<wps:txbx><w:txbxContent/></wps:txbx></wps:wsp>")
    expect(readWordShape(box, THEME)).toBeNull()
    // A preset the app has no drawing of opens drawn from Word's own geometry.
    expect(readWordShape(own.replace('prst="ellipse"', 'prst="mathMultiply"'), THEME)).toMatchObject({
      preset: "mathMultiply",
      variant: "rect",
    })
    expect(readWordShape(own.replace('prst="ellipse"', 'prst="noSuchShape"'), THEME)).toBeNull()
  })

  it("reads Explosion: 8 Points with a theme gradient and a theme glow as Word writes them", () => {
    const xml =
      `<wps:wsp><wps:spPr><a:prstGeom prst="irregularSeal1"><a:avLst/></a:prstGeom>` +
      `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>` +
      `<a:gs pos="0"><a:schemeClr val="accent1"><a:lumMod val="67000"/></a:schemeClr></a:gs>` +
      `<a:gs pos="48000"><a:schemeClr val="accent1"><a:lumMod val="97000"/><a:lumOff val="3000"/></a:schemeClr></a:gs>` +
      `<a:gs pos="100000"><a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr></a:gs>` +
      `</a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:ln><a:noFill/></a:ln>` +
      `<a:effectLst><a:glow rad="139700"><a:schemeClr val="accent1"><a:satMod val="175000"/><a:alpha val="40000"/></a:schemeClr></a:glow></a:effectLst>` +
      `</wps:spPr></wps:wsp><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">`
    const read = readWordShape(xml, THEME)
    // The three-stop theme gradient is not one of the app's, so it is kept whole: its stops and Word's angle.
    expect(read).toMatchObject({ preset: "irregularSeal1", variant: "burst", fill: "#0e4057", stroke: "none" })
    expect(read?.gradient).toBe("word:270:0#0e4057;48#1c6586;100#73a0b4")
    expect(read?.glow).toBe("#156082:11")
  })

  it("opens Word's Frame and Heart as editable shapes at their size and place", async () => {
    const opened = await open()
    const found = objects(opened.view.html)
    expect(found.map((item) => item.figure.attrs.variant)).toEqual(["frame", "heart"])
    expect(found[0]?.figure.attrs).toMatchObject({ kind: "shape", fill: "#156082", width: 213, height: 193 })
    expect(found[0]?.image.getAttribute("data-wrap")).toBe("front")
  })

  it("saves a shape Word drew and nobody formatted as Word's own drawing", async () => {
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
      const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
      expect(xml.match(/<wps:wsp[\s>]/g)).toHaveLength(2)
      expect(xml).toContain('prst="frame"')
      expect(xml).toContain('prst="heart"')
      expect(xml).not.toContain("<pic:pic")
    } finally {
      editor.destroy()
    }
  })

  it("opens a floating shape among a paragraph's text and saves it back there, the paragraph whole", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, "f20_word_shapes.docx")))
    const pkg = await openPackage(bytes, "f20_word_shapes.docx")
    const part = findPart(pkg, "/word/document.xml")!
    // Text before and after the Frame, in the Frame's own paragraph.
    const xml = decodeXml(part.data).replace(
      /(<w:p[ >](?:(?!<\/w:p>)[\s\S])*?)(<w:r>(?:(?!<\/w:r>)[\s\S])*?prst="frame"[\s\S]*?<\/w:r>)/,
      '$1<w:r><w:t xml:space="preserve">Before the frame </w:t></w:r>$2<w:r><w:t>and after it.</w:t></w:r>',
    )
    expect(xml).toContain("and after it.")
    part.data = new TextEncoder().encode(xml)
    const opened = await openDocxBytes(await writePackage(pkg), "text.docx")
    expect(objects(opened.view.html).map((item) => item.figure.attrs.variant)).toEqual(["frame", "heart"])

    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    try {
      // Saved as opened (the app draws each object's picture first, which jsdom cannot).
      const saved = await saveDocxBytes({
        json: editor.getJSON(),
        chrome: opened.view.chrome,
        props: opened.view.props,
        word: opened.word,
        unchanged: false,
        fileName: "edited.docx",
      })
      const out = decodeXml(findPart(await openPackage(saved.bytes, "edited.docx"), "/word/document.xml")!.data)
      const paragraph = [...out.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].find((match) => match[0].includes("and after"))
      expect(paragraph?.[0]).toMatch(/Before the frame [\s\S]*prst="frame"[\s\S]*and after it\./)
      restoreObjects(editor)
      const blocks = editor.getJSON().content ?? []
      // The shape is the block before its paragraph, which keeps all its text.
      const at = blocks.findIndex((block) => block.type === "figure")
      expect(blocks[at + 1]?.content?.map((item) => item.text).join("")).toBe("Before the frame and after it.")
    } finally {
      editor.destroy()
    }
  })

  it("opens a callout the app has no drawing of from Word's geometry and saves it back as Word's preset", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, "f20_word_shapes.docx")))
    const pkg = await openPackage(bytes, "f20_word_shapes.docx")
    const part = findPart(pkg, "/word/document.xml")!
    part.data = new TextEncoder().encode(decodeXml(part.data).replace('prst="heart"', 'prst="wedgeRoundRectCallout"'))
    const opened = await openDocxBytes(await writePackage(pkg), "callout.docx")
    const callout = objects(opened.view.html)[1]?.figure.attrs
    expect(callout).toMatchObject({ kind: "shape", variant: "rect" })
    expect(String(callout?.points)).toMatch(/^M/)
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
      const xml = decodeXml(findPart(await openPackage(saved.bytes, "edited.docx"), "/word/document.xml")!.data)
      expect(xml).toContain('prst="wedgeRoundRectCallout"')
      expect(xml).not.toContain("<a:custGeom")
    } finally {
      editor.destroy()
    }
  })
})
