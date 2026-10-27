import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readWordTextBox } from "@/document/docx/word-text-box"
import { emptyChrome } from "@/document/header"
import { chainsAsWord, restoreObjects } from "@/document/object-pictures"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"

function editorFor(html: string) {
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  return new Editor({ extensions, content: html })
}

/** The document as saving gives it to the writer: each text box the picture carrying it (as `documentWithObjectPictures`). */
function asSaved(editor: Editor): JSONContent {
  const saved = chainsAsWord(editor.state.doc)
  const boxes = new Map<number, ProseNode>()
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "textBox") {
      boxes.set(pos, saved.get(pos) ?? node)
    }
    return node.type.name !== "textBox"
  })
  const content = [] as JSONContent[]
  editor.state.doc.forEach((node, offset) => {
    const box = boxes.get(offset)
    if (!box) {
      content.push(node.toJSON() as JSONContent)
      return
    }
    const width = Number(box.attrs.width)
    const height = Number(box.attrs.height) || 40
    const object = btoa(
      String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ ...box.toJSON(), shown: [width, height] }))),
    )
    const layout = Object.fromEntries(
      ["wrap", "x", "y", "dy", "anchoring", "relative", "page", "z", "docxKey", "rotate"].map((key) => [
        key,
        box.attrs[key],
      ]),
    )
    content.push({
      type: "image",
      attrs: { ...layout, src: "data:image/png;base64,AA==", width, height, objectNode: object },
    })
  })
  return { type: "doc", content }
}

async function save(editor: Editor, word: Awaited<ReturnType<typeof openDocxBytes>> | null) {
  const saved = await saveDocxBytes({
    json: asSaved(editor),
    chrome: word?.view.chrome ?? emptyChrome(),
    props: word?.view.props,
    word: word?.word ?? null,
    unchanged: false,
    fileName: "boxes.docx",
  })
  const pkg = await openPackage(saved.bytes, "boxes.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, "/word/document.xml")!.data) }
}

function textBoxes(editor: Editor) {
  const found: ProseNode[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "textBox") {
      found.push(node)
    }
  })
  return found
}

describe("Word's text boxes as text boxes", () => {
  it("reads the box's fill, outline, margins, alignment, direction and link", () => {
    const xml =
      `<a:graphicData uri="${WPS}"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:prstGeom prst="rect"/>` +
      `<a:noFill/><a:ln w="6350" cmpd="dbl"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></wps:spPr>` +
      `<wps:linkedTxbx id="3" seq="2"/><wps:bodyPr vert="vert270" wrap="none" lIns="0" tIns="12700" ` +
      `anchor="ctr"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData>`
    expect(readWordTextBox(xml, null)).toMatchObject({
      attrs: {
        fill: "none",
        stroke: "#000000",
        strokeWidth: 0.5,
        border: "double",
        insetL: 0,
        insetT: 1,
        insetR: 7.2,
        vAlign: "middle",
        textDirection: "rotate270",
        noWrap: true,
      },
      linked: { id: 3, seq: 2 },
      autoFit: false,
    })
    // A shape holding text is a shape, not a text box.
    expect(readWordTextBox(xml.replace(' txBox="1"', ""), null)).toBeNull()
  })

  it("opens Word's text box as one, and saves it untouched as Word wrote it", async () => {
    const file = readFileSync(path.join(AUTHORED, "f14_floating_shape.docx"))
    const opened = await openDocxBytes(new Uint8Array(file), "f14_floating_shape.docx")
    const editor = editorFor(opened.view.html)
    try {
      restoreObjects(editor)
      const [box] = textBoxes(editor)
      expect(box?.textContent).toBe("TEXTBOX-TEXT")
      expect(box?.attrs).toMatchObject({ fill: "none", stroke: "#000000", strokeWidth: 0.5, width: 200, height: 80 })
      const original = decodeXml(
        findPart(await openPackage(new Uint8Array(file), "f14.docx"), "/word/document.xml")!.data,
      )
      const kept = /<w:r><w:rPr><w:noProof\/><\/w:rPr><mc:AlternateContent>[\s\S]*?Text Box 1[\s\S]*?<\/w:r>/.exec(
        original,
      )![0]
      const { xml } = await save(editor, opened)
      // Back in its place after the paragraph's text, with Word's VML fallback.
      expect(xml).toContain(`<w:t>anchor paragraph</w:t></w:r>${kept}`)
    } finally {
      editor.destroy()
    }
  })

  it("saves an edited box as Word's own text box with its new text, centred", async () => {
    const file = readFileSync(path.join(AUTHORED, "f14_floating_shape.docx"))
    const opened = await openDocxBytes(new Uint8Array(file), "f14_floating_shape.docx")
    const editor = editorFor(opened.view.html)
    try {
      restoreObjects(editor)
      let at = 0
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "textBox") {
          at = pos
        }
      })
      editor
        .chain()
        .setTextSelection(at + 1 + "TEXTBOX".length)
        .insertContent(" EDITED")
        .run()
      editor
        .chain()
        .setTextSelection(at + 2)
        .setTextAlign("center")
        .run()
      const { xml, bytes } = await save(editor, opened)
      const box = /<wps:wsp[^>]*><wps:cNvSpPr txBox="1"\/>[\s\S]*?<\/wps:wsp>/.exec(xml)?.[0] ?? ""
      expect(box).toContain('<w:jc w:val="center"/>')
      expect(box).toContain("TEXTBOX EDITED-TEXT")
      expect(box).toContain('<a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/>')
      expect(box).toContain("<a:noFill/>")
      // Opened again, it is the same text box.
      const again = await openDocxBytes(bytes, "boxes.docx")
      const reopened = editorFor(again.view.html)
      try {
        restoreObjects(reopened)
        expect(textBoxes(reopened)[0]?.textContent).toBe("TEXTBOX EDITED-TEXT")
        expect(textBoxes(reopened)[0]?.attrs.textAlign).toBe("center")
      } finally {
        reopened.destroy()
      }
    } finally {
      editor.destroy()
    }
  })

  it("saves linked boxes as Word's chain, the text in the first, and opens them linked again", async () => {
    const editor = editorFor(
      `<div data-text-box data-link-id="chain-a" data-link-seq="0" data-width="200" data-height="40">one two</div>` +
        `<p>between</p>` +
        `<div data-text-box data-link-id="chain-a" data-link-seq="1" data-width="200" data-height="40">three</div>` +
        `<p>after</p>`,
    )
    try {
      const { xml, bytes } = await save(editor, null)
      expect(xml).toMatch(/<wps:txbx id="1000"><w:txbxContent><w:p>.*one two.*three.*<\/w:p><\/w:txbxContent>/)
      expect(xml).toContain('<wps:linkedTxbx id="1000" seq="1"/>')
      const again = await openDocxBytes(bytes, "boxes.docx")
      const reopened = editorFor(again.view.html)
      try {
        restoreObjects(reopened)
        const boxes = textBoxes(reopened)
        expect(boxes.map((box) => [box.attrs.linkId, box.attrs.linkSeq])).toEqual([
          ["word-1000", 0],
          ["word-1000", 1],
        ])
        expect(boxes.map((box) => box.textContent).join("")).toBe("one twothree")
      } finally {
        reopened.destroy()
      }
    } finally {
      editor.destroy()
    }
  })
})
