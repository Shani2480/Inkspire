import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphText, paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const COVER =
  `<w:sdt><w:sdtPr><w:id w:val="712464288"/><w:docPartObj><w:docPartGallery w:val="Cover Pages"/>` +
  `<w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtEndPr/><w:sdtContent>`
const SECTION = `<w:sdt><w:sdtPr><w:alias w:val="Terms"/><w:id w:val="5"/></w:sdtPr><w:sdtContent>`

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** f01 with the whole body in a cover page control, as Word's cover gallery writes it, and a control inside it. */
async function covered() {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f01_runs.docx"))), "f01.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(part.data).replace(/<w:body>([\s\S]*?)(<w:sectPr[\s\S]*<\/w:body>)/, (_match, body, end) => {
    const paragraphs = String(body).match(/<w:p [\s\S]*?<\/w:p>/g) ?? []
    const [first, ...rest] = paragraphs
    return `<w:body>${COVER}${first}${SECTION}${rest.join("")}</w:sdtContent></w:sdt></w:sdtContent></w:sdt>${end}`
  })
  part.data = new TextEncoder().encode(xml)
  return { bytes: await writePackage(pkg), xml }
}

/** Drop revision and paragraph ids, as the other round trips do. */
function normalize(xml: string) {
  return xml.replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
}

function mainXml(pkg: Awaited<ReturnType<typeof openPackage>>) {
  return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
}

describe("block content controls", () => {
  it("open as their paragraphs and are written back around them", async () => {
    const { bytes, xml } = await covered()
    const doc = readDocument(await openPackage(bytes, "f01.docx"))
    expect(doc.blocks.some((block) => block.kind === "raw")).toBe(false)
    expect(paragraphText(paragraphsIn(doc.blocks)[0]!)).toBe("BEFORE")
    expect(doc.blocks.every((block) => block.controls?.[0]?.open.includes("Cover Pages"))).toBe(true)
    expect(doc.blocks.slice(1).every((block) => block.controls?.[1]?.open.includes("Terms"))).toBe(true)

    const written = mainXml(await openPackage(await writePackage(writeDocument(doc)), "f01.docx"))
    expect(normalize(written)).toBe(normalize(xml))
  })

  it("keep text typed into them inside them when saved from the editor", async () => {
    const { bytes } = await covered()
    const opened = await openDocxBytes(bytes, "f01.docx")
    expect(opened.view.html).not.toContain("data-word-block")
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    editors.push(editor)
    editor.commands.setTextSelection(3)
    editor.commands.insertContent("TYPED")
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const xml = mainXml(await openPackage(saved.bytes, "edited.docx"))
    expect(xml.match(/<w:sdt>/g)).toHaveLength(2)
    const typed = xml.indexOf("TYPED")
    expect(typed).toBeGreaterThan(xml.indexOf("Cover Pages"))
    expect(typed).toBeLessThan(xml.lastIndexOf("</w:sdtContent>"))
    const doc = readDocument(await openPackage(saved.bytes, "edited.docx"))
    expect(paragraphText(paragraphsIn(doc.blocks)[0]!)).toBe("BETYPEDFORE")
  })
})
