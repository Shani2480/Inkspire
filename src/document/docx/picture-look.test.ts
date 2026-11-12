import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readPictureLook } from "@/document/docx/picture-look"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

// Word's own Picture Format choices: Brightness +20%, Contrast -40%, 30% transparency, a 3 pt blue round-dot border,
// its Offset: Bottom Right shadow, a glow and soft edges. Word's shadow is not the app's own preset.
const BLIP = '<a:lum bright="20000" contrast="-40000"/><a:alphaModFix amt="70000"/>'
const LINE = '<a:ln w="38100"><a:solidFill><a:srgbClr val="0F6CBD"/></a:solidFill><a:prstDash val="sysDot"/></a:ln>'
const EFFECTS =
  '<a:effectLst><a:glow rad="101600"><a:srgbClr val="FFC000"><a:alpha val="40000"/></a:srgbClr></a:glow>' +
  '<a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0">' +
  '<a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw>' +
  '<a:softEdge rad="63500"/></a:effectLst>'

/** f13's picture with Word's formatting on it. */
async function formatted() {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f13_inline_image.docx"))), "f13.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(part.data)
    .replace(/(<a:blip r:embed="\w+">)/, `$1${BLIP}`)
    .replace(
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${LINE}${EFFECTS}`,
    )
  part.data = new TextEncoder().encode(xml)
  return openDocxBytes(await writePackage(pkg), "formatted.docx")
}

async function save(editor: Editor, opened: Awaited<ReturnType<typeof formatted>>) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  const pkg = await openPackage(saved.bytes, "edited.docx")
  return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
}

describe("a picture's formatting from Word", () => {
  it("reads Word's corrections, transparency, border and effects as the picture's own", () => {
    const look = readPictureLook(
      `<pic:pic><pic:blipFill><a:blip r:embed="rId4">${BLIP}</a:blip></pic:blipFill><pic:spPr>${LINE}${EFFECTS}</pic:spPr></pic:pic>`,
      null,
    )
    expect(look).toEqual({
      brightness: 20,
      contrast: -40,
      transparency: 30,
      border: "#0f6cbd",
      borderWidth: 3,
      borderDash: "dot",
      shadow: "outer-br",
      glow: "#ffc000:8",
      softEdge: 5,
    })
    expect(readPictureLook('<a:blip r:embed="x"><a:grayscl/></a:blip>', null)).toEqual({ recolor: "grayscale" })
    expect(readPictureLook('<a:blip r:embed="x"><a:lum bright="70000" contrast="-70000"/></a:blip>', null)).toEqual({
      recolor: "washout",
    })
    expect(readPictureLook('<a:blip r:embed="x"/>', null)).toEqual({})
  })

  it("opens with it, and saved unchanged keeps Word's own drawing", async () => {
    const opened = await formatted()
    const img = /<img [^>]*>/.exec(opened.view.html)?.[0] ?? ""
    expect(img).toContain('data-brightness="20"')
    expect(img).toContain('data-transparency="30"')
    expect(img).toContain('data-border="#0f6cbd"')
    expect(img).toContain('data-shadow="outer-br"')
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: opened.view.html,
    })
    editors.push(editor)
    const xml = await save(editor, opened)
    // Word's drawing as it was: its ids and the a14 extension the app does not write.
    expect(xml).toContain('wp14:anchorId="6B3D824A"')
    expect(xml).toContain(BLIP)
    expect(xml).toContain(EFFECTS)
  })

  it("is written anew with the change when one is made in the app", async () => {
    const opened = await formatted()
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: opened.view.html,
    })
    editors.push(editor)
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        at = pos
      }
    })
    const node = editor.state.doc.nodeAt(at)!
    editor.view.dispatch(editor.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, brightness: 40 }))
    const xml = await save(editor, opened)
    expect(xml).toContain('<a:lum bright="40000" contrast="-40000"/>')
    expect(xml).toContain('<a:alphaModFix amt="70000"/>')
    expect(xml).toContain('<a:ln w="38100"><a:solidFill><a:srgbClr val="0f6cbd"/>')
  })
})
