import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"

// A 1 by 1 PNG.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function editorWith(alt: string) {
  return new Editor({
    extensions: createExtensions().filter((item) => item.name !== "spellcheck"),
    content: `<p>Photo: <img src="${PIXEL}" alt="${alt}" width="40" height="30"></p>`,
  })
}

async function save(editor: Editor) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "photo.docx",
  })
  const pkg = await openPackage(saved.bytes, "photo.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, "/word/document.xml")!.data) }
}

function pictureAlt(editor: Editor) {
  let alt: unknown
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      alt = node.attrs.alt
    }
  })
  return alt
}

describe("A picture's alt text in Word", () => {
  it("saves the alt text as Word's description and reads it back", async () => {
    const { bytes, xml } = await save(editorWith("Harbour at dawn, by Sam Example & co"))
    expect(xml).toMatch(/<wp:docPr id="\d+" name="Picture \d+" descr="Harbour at dawn, by Sam Example &amp; co"\/>/)
    const opened = await openDocxBytes(bytes, "photo.docx")
    const editor = new Editor({
      extensions: createExtensions().filter((item) => item.name !== "spellcheck"),
      content: opened.view.html,
    })
    expect(pictureAlt(editor)).toBe("Harbour at dawn, by Sam Example & co")
    // Saved again unchanged, the description is written once, as it was.
    const again = await save(editor)
    expect(again.xml.match(/descr="/g)).toHaveLength(1)
  })

  it("writes no description for a picture without alt text", async () => {
    const { xml } = await save(editorWith(""))
    expect(xml).toMatch(/<wp:docPr id="\d+" name="Picture \d+"\/>/)
  })
})
