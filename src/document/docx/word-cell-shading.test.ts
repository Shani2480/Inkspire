import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { readScopedBorders, shadeScope } from "@/editor/table-tools"

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] }

/** A one-cell table saved with yellow and red Dk Up Diagonal, then opened as a Word document. */
async function wordCell() {
  const cell = {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, backgroundColor: "#ffff00", shadingPattern: "diagStripe #c00000" },
    content: [paragraph],
  }
  const made = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell] }] }] },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const opened = await openDocxBytes(made.bytes, "t.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
  })
  editors.push(editor)
  let inCell = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "x" && inCell < 0) {
      inCell = pos
    }
  })
  editor.commands.setTextSelection(inCell)
  const save = async () => {
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "t.docx",
    })
    const pkg = await openPackage(saved.bytes, "t.docx")
    return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
  }
  const cellStyle = () => editor.view.dom.querySelector("td")?.getAttribute("style") ?? ""
  return { editor, opened, save, cellStyle }
}

describe("a Word cell's own fill and pattern (22.4)", () => {
  it("opens Borders and Shading on them", async () => {
    const { editor, opened } = await wordCell()
    expect(opened.view.html).toContain('data-word-shading="#ffff00 diagStripe #c00000"')
    expect(readScopedBorders(editor, "cell")).toMatchObject({
      fill: "#ffff00",
      pattern: { pattern: "diagStripe", color: "#c00000" },
    })
  })

  it("shows a new fill over Word's and keeps Word's pattern with it", async () => {
    const { editor, save, cellStyle } = await wordCell()
    shadeScope(editor, "cell", "#ff0000")
    expect(cellStyle()).toMatch(/background-color: rgb\(255, 0, 0\)/)
    expect(await save()).toContain('<w:shd w:val="diagStripe" w:color="C00000" w:fill="FF0000"/>')
  })

  it("clears Word's fill or pattern on screen and in the saved cell", async () => {
    const { editor, save, cellStyle } = await wordCell()
    shadeScope(editor, "cell", null, null)
    expect(cellStyle()).toContain("background-color: transparent")
    expect(cellStyle()).toContain("background-image: none")
    expect(readScopedBorders(editor, "cell")).toMatchObject({ fill: null, pattern: null })
    expect(await save()).toContain('<w:shd w:val="clear" w:color="auto" w:fill="auto"/>')
  })

  it("draws a new pattern over Word's own", async () => {
    const { editor, save, cellStyle } = await wordCell()
    shadeScope(editor, "cell", undefined, "pct25")
    expect(cellStyle()).toContain("background-image: var(--cell-pattern)")
    expect(await save()).toContain('<w:shd w:val="pct25" w:color="auto" w:fill="FFFF00"/>')
  })
})
