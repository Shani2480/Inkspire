import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { numberingLevel } from "@/document/docx/model"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { parseWordLevels } from "@/editor/word-markers"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
/** A 1×1 red PNG. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
)
const PICTURE =
  '<w:numPicBullet w:numPicBulletId="0"><w:pict><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:18pt;height:9pt" o:bullet="t"><v:imagedata r:id="rId1" o:title="arrow"/></v:shape></w:pict></w:numPicBullet>'
const OVERRIDE = '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/></w:lvlOverride>'

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** f04's bullet list with its first level a picture bullet, and a second list that starts its first level at 4. */
async function pictureBullets() {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f04_bullets.docx"))), "f04.docx")
  const part = findPart(pkg, "/word/numbering.xml")!
  let xml = decodeXml(part.data)
  xml = xml.replace(/(<w:numbering\b[^>]*>)/, `$1${PICTURE}`)
  xml = xml.replace(/(<w:lvl w:ilvl="0"[^>]*>[\s\S]*?<w:lvlText [^>]*\/>)/, `$1<w:lvlPicBulletId w:val="0"/>`)
  xml = xml.replace(
    "</w:numbering>",
    `<w:num w:numId="2"><w:abstractNumId w:val="0"/>${OVERRIDE}</w:num><w:numIdMacAtCleanup w:val="1"/></w:numbering>`,
  )
  part.data = new TextEncoder().encode(xml)
  pkg.parts.push({ name: "/word/media/bullet1.png", contentType: "image/png", data: PNG })
  pkg.relationships.push({
    source: "/word/numbering.xml",
    items: [
      {
        id: "rId1",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        target: "media/bullet1.png",
        targetMode: "Internal",
        partName: "/word/media/bullet1.png",
      },
    ],
  })
  return openDocxBytes(await writePackage(pkg), "pictures.docx")
}

describe("a picture bullet", () => {
  it("opens with its picture, drawn as the level's marker", async () => {
    const { word, view } = await pictureBullets()
    expect(word.numbering.pictureBullets?.[0]?.image).toBe("rId1")
    expect(numberingLevel(word.numbering, 1, 0)?.pictureBullet).toBe(0)
    const attribute = /data-word-levels="([^"]+)"/
      .exec(view.html)![1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
    const [first] = parseWordLevels(attribute)
    expect(first?.picture).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(first?.pictureRatio).toBe(2)
  })

  it("is saved with its picture, its level's id, the list's override and Word's clean-up mark", async () => {
    const { word, view } = await pictureBullets()
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: view.html,
    })
    editors.push(editor)
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: view.chrome,
      props: view.props,
      word,
      unchanged: false,
      fileName: "saved.docx",
    })
    const pkg = await openPackage(saved.bytes, "saved.docx")
    const numbering = decodeXml(findPart(pkg, "/word/numbering.xml")!.data)
    expect(numbering).toContain(PICTURE)
    expect(numbering).toMatch(/<w:lvlPicBulletId w:val="0"\/>/)
    expect(numbering).toContain(`<w:num w:numId="2"><w:abstractNumId w:val="0"/>${OVERRIDE}</w:num>`)
    expect(numbering).toMatch(/<w:numIdMacAtCleanup w:val="1"\/><\/w:numbering>$/)
    // w:numPicBullet comes first in CT_Numbering.
    expect(numbering.indexOf("<w:numPicBullet")).toBeLessThan(numbering.indexOf("<w:abstractNum"))
    const rel = pkg.relationships.find((group) => group.source === "/word/numbering.xml")?.items[0]
    expect(rel?.id).toBe("rId1")
    expect(findPart(pkg, rel!.partName!)?.data).toEqual(PNG)

    const reopened = await openDocxBytes(saved.bytes, "saved.docx")
    expect(reopened.word.numbering.pictureBullets).toHaveLength(1)
  })
})

describe("a list's level override", () => {
  it("counts the level from its w:startOverride", async () => {
    const { word } = await pictureBullets()
    expect(word.numbering.instances.find((item) => item.id === 2)?.overrides?.[0]?.startOverride).toBe(4)
    expect(numberingLevel(word.numbering, 2, 0)?.start).toBe(4)
    expect(numberingLevel(word.numbering, 1, 0)?.start).not.toBe(4)
  })
})
