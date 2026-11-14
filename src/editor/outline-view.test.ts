import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { createExtensions } from "@/editor/extensions"
import { saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import {
  BODY_LEVEL,
  hiddenPositions,
  outlineBlocks,
  outlineCollapse,
  outlineExpand,
  outlineMove,
  outlinePromoteDemote,
  outlineState,
  outlineToggle,
  setOutlineActive,
  setOutlineLevel,
  showOutlineLevel,
} from "@/editor/outline-view"

let editors: Editor[] = []
afterEach(() => {
  editors.forEach((editor) => editor.destroy())
  editors = []
})

const DOC =
  "<h1>Intro</h1><p>intro text</p>" +
  "<h2>Background</h2><p>background text</p>" +
  "<h3>Detail</h3><p>detail text</p>" +
  "<h1>Method</h1><p>method text</p>"

function make(content = DOC) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  setOutlineActive(editor, true)
  return editor
}

const texts = (editor: Editor) => outlineBlocks(editor.state.doc).map((block) => block.node.textContent)
const levels = (editor: Editor) => outlineBlocks(editor.state.doc).map((block) => block.level)

/** The text of the blocks shown (not collapsed). */
function shown(editor: Editor) {
  const hidden = hiddenPositions(editor.state)
  return outlineBlocks(editor.state.doc)
    .filter((block) => !hidden.has(block.pos))
    .map((block) => block.node.textContent)
}

/** Puts the caret in the block whose text is `text`. */
function caretIn(editor: Editor, text: string) {
  const block = outlineBlocks(editor.state.doc).find((item) => item.node.textContent === text)!
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, block.pos + 1)))
}

describe("Outline view", () => {
  it("marks each paragraph with its symbol and indent, and only while the view is on", () => {
    const editor = make()
    const dom = editor.view.dom
    expect(dom.hasAttribute("data-outline-view")).toBe(true)
    const marks = [...dom.querySelectorAll(":scope > .outline-block")].map((element) => [
      element.getAttribute("data-ol"),
      element.getAttribute("data-ol-depth"),
    ])
    expect(marks).toEqual([
      ["parent", "0"],
      ["body", "1"],
      ["parent", "1"],
      ["body", "2"],
      ["parent", "2"],
      ["body", "3"],
      ["parent", "0"],
      ["body", "1"],
    ])
    setOutlineActive(editor, false)
    expect(dom.hasAttribute("data-outline-view")).toBe(false)
    expect(dom.querySelectorAll(".outline-block")).toHaveLength(0)
  })

  it("collapses and expands a level at a time, body text first", () => {
    const editor = make()
    caretIn(editor, "Intro")
    outlineCollapse(editor)
    expect(shown(editor)).toEqual(["Intro", "Background", "Detail", "Method", "method text"])
    outlineCollapse(editor)
    expect(shown(editor)).toEqual(["Intro", "Background", "Method", "method text"])
    outlineCollapse(editor)
    expect(shown(editor)).toEqual(["Intro", "Method", "method text"])
    expect(editor.view.dom.querySelector(":scope > [data-ol-collapsed]")?.textContent).toBe("Intro")
    outlineExpand(editor)
    expect(shown(editor)).toEqual(["Intro", "Background", "Method", "method text"])
    outlineToggle(editor, 0)
    expect(shown(editor)).toEqual(texts(editor))
  })

  it("Show Level shows the headings down to a level, and All Levels everything", () => {
    const editor = make()
    showOutlineLevel(editor, 2)
    expect(shown(editor)).toEqual(["Intro", "Background", "Method"])
    expect(outlineState(editor.state).showLevel).toBe(2)
    showOutlineLevel(editor, BODY_LEVEL)
    expect(shown(editor)).toEqual(texts(editor))
  })

  it("promotes and demotes a collapsed heading with the headings under it", () => {
    const editor = make()
    caretIn(editor, "Background")
    outlineToggle(editor, 2)
    outlinePromoteDemote(editor, 1)
    expect(levels(editor)).toEqual([1, BODY_LEVEL, 3, BODY_LEVEL, 4, BODY_LEVEL, 1, BODY_LEVEL])
    outlinePromoteDemote(editor, -1)
    outlinePromoteDemote(editor, -1)
    expect(levels(editor)).toEqual([1, BODY_LEVEL, 1, BODY_LEVEL, 2, BODY_LEVEL, 1, BODY_LEVEL])
    // Body text is promoted to the heading above it, and Demote to Body Text makes a heading body text.
    caretIn(editor, "method text")
    const method = () => outlineBlocks(editor.state.doc).find((block) => block.node.textContent === "method text")!
    outlinePromoteDemote(editor, -1)
    expect(method().level).toBe(1)
    setOutlineLevel(editor, BODY_LEVEL)
    expect(method().level).toBe(BODY_LEVEL)
    expect(method().node.type.name).toBe("paragraph")
  })

  it("goes past Heading 6 as a paragraph with an outline level, saved as w:outlineLvl", async () => {
    const editor = make("<h6>Deep</h6><p>text</p>")
    caretIn(editor, "Deep")
    outlinePromoteDemote(editor, 1)
    expect(levels(editor)).toEqual([7, BODY_LEVEL])
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "outline.docx",
    })
    const pkg = await openPackage(saved.bytes, "outline.docx")
    const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
    expect(xml).toMatch(/<w:outlineLvl w:val="6"\/>[\s\S]*Deep/)
    outlinePromoteDemote(editor, -1)
    expect(editor.state.doc.firstChild?.type.name).toBe("heading")
    expect(levels(editor)).toEqual([6, BODY_LEVEL])
  })

  it("moves a collapsed heading with what is under it past the paragraph shown next to it", () => {
    const editor = make()
    showOutlineLevel(editor, 1)
    caretIn(editor, "Method")
    outlineMove(editor, -1)
    expect(texts(editor)).toEqual([
      "Method",
      "method text",
      "Intro",
      "intro text",
      "Background",
      "background text",
      "Detail",
      "detail text",
    ])
    // What was collapsed stays collapsed, and the caret moved with the heading.
    expect(shown(editor)).toEqual(["Method", "Intro"])
    expect(editor.state.selection.$from.parent.textContent).toBe("Method")
    // One step to undo.
    editor.commands.undo()
    expect(texts(editor)[0]).toBe("Intro")
    expect(shown(editor)).toEqual(["Intro", "Method"])
    editor.commands.redo()
    expect(shown(editor)).toEqual(["Method", "Intro"])
    outlineMove(editor, 1)
    expect(texts(editor)[0]).toBe("Intro")
    expect(shown(editor)).toEqual(["Intro", "Method"])
  })

  it("keeps the caret out of collapsed text", () => {
    const editor = make()
    showOutlineLevel(editor, 1)
    const hiddenBlock = outlineBlocks(editor.state.doc)[1]!
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, hiddenBlock.pos + 1)))
    expect(editor.state.selection.$from.parent.textContent).toBe("Method")
  })

  it("forgets what was collapsed when the view is left", () => {
    const editor = make()
    showOutlineLevel(editor, 1)
    setOutlineActive(editor, false)
    setOutlineActive(editor, true)
    expect(shown(editor)).toEqual(texts(editor))
  })
})
