import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"
import {
  adjustListIndents,
  canContinueNumbering,
  continuedValue,
  continueNumbering,
  readListIndent,
  restartNumbering,
} from "@/editor/list-numbering"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function make(content: string) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

/** Puts the caret in the paragraph holding `text`. */
function caret(editor: Editor, text: string) {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(text)) {
      at = pos + node.text.indexOf(text) + 1
    }
  })
  expect(at, text).toBeGreaterThan(0)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)))
}

/** Each top-level numbered list's start and whether it continues. */
function lists(editor: Editor) {
  const found: { start: number; continues: boolean; items: number }[] = []
  editor.state.doc.forEach((node) => {
    if (node.type.name === "orderedList") {
      found.push({ start: Number(node.attrs.start) || 1, continues: node.attrs.continueList, items: node.childCount })
    }
  })
  return found
}

async function save(editor: Editor, word: Awaited<ReturnType<typeof openDocxBytes>>["word"] | null = null) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word,
    unchanged: false,
    fileName: "lists.docx",
  })
  const pkg = await openPackage(saved.bytes, "lists.docx")
  return {
    bytes: saved.bytes,
    xml: decodeXml(findPart(pkg, "/word/document.xml")!.data),
    numbering: decodeXml(findPart(pkg, "/word/numbering.xml")!.data),
  }
}

/** The numId of each numbered paragraph, in order. */
function numIds(xml: string) {
  return [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => Number(match[1]))
}

const TWO_LISTS =
  "<ol><li><p>one</p></li><li><p>two</p></li></ol><p>between</p><ol><li><p>three</p></li><li><p>four</p></li></ol>"

describe("Restart at 1, Continue Numbering, Set Numbering Value", () => {
  it("restarts at the caret's item, splitting the list there", async () => {
    const editor = make("<ol><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ol>")
    caret(editor, "three")
    restartNumbering(editor)
    expect(lists(editor)).toEqual([
      { start: 1, continues: false, items: 2 },
      { start: 1, continues: false, items: 1 },
    ])
    const { xml, numbering } = await save(editor)
    const ids = numIds(xml)
    expect(ids[2]).not.toBe(ids[0])
    expect(numbering).toMatch(new RegExp(`<w:num w:numId="${ids[2]}"[^>]*>.*?<w:startOverride w:val="1"/>`))
  })

  it("saves two separate lists so Word numbers each from 1, and a continued one on from the first", async () => {
    const editor = make(TWO_LISTS)
    let ids = numIds((await save(editor)).xml)
    expect(ids[2]).not.toBe(ids[0])
    caret(editor, "four")
    expect(canContinueNumbering(editor.state)).toBe(true)
    continueNumbering(editor)
    expect(lists(editor)[1]).toMatchObject({ start: 3, continues: true })
    ids = numIds((await save(editor)).xml)
    expect(new Set(ids).size).toBe(1)
  })

  it("keeps a continuing list's numbers right as items above it change, in the same undo step", () => {
    const editor = make(TWO_LISTS)
    caret(editor, "three")
    continueNumbering(editor)
    caret(editor, "two")
    editor.commands.splitListItem("listItem")
    expect(lists(editor)[1].start).toBe(4)
    editor.commands.undo()
    expect(lists(editor)[1].start).toBe(3)
  })

  it("sets a value: a new list at a number, or the previous list advanced", async () => {
    const editor = make(TWO_LISTS)
    caret(editor, "four")
    expect(continuedValue(editor.state)).toBe(4)
    continueNumbering(editor, 7)
    expect(lists(editor)[1]).toMatchObject({ start: 6, continues: false })
    const { numbering, xml } = await save(editor)
    const ids = numIds(xml)
    expect(numbering).toMatch(new RegExp(`<w:num w:numId="${ids[2]}"[^>]*>.*?<w:startOverride w:val="6"/>`))
    caret(editor, "one")
    expect(canContinueNumbering(editor.state)).toBe(false)
  })

  it("saves an opened list whose numbering was not changed with its own numbering", async () => {
    const first = make(TWO_LISTS)
    caret(first, "three")
    continueNumbering(first)
    const { bytes, xml } = await save(first)
    const opened = await openDocxBytes(bytes, "lists.docx")
    const editor = make(opened.view.html)
    expect(lists(editor)[1]).toMatchObject({ start: 3, continues: true })
    const again = await save(editor, opened.word)
    expect(numIds(again.xml)).toEqual(numIds(xml))
    caret(editor, "three")
    restartNumbering(editor)
    const restarted = numIds((await save(editor, opened.word)).xml)
    expect(restarted[2]).not.toBe(restarted[0])
  })
})

describe("Adjust List Indents", () => {
  it("draws the first level at the given indents and saves them as the items' own", async () => {
    const editor = make("<ol><li><p>one</p></li><li><p>two</p></li></ol>")
    caret(editor, "one")
    expect(readListIndent(editor)).toMatchObject({ follow: "tab", tab: null })
    adjustListIndents(editor, { number: 18, text: 54, follow: "tab", tab: 72 })
    expect(readListIndent(editor)).toEqual({ number: 18, text: 54, follow: "tab", tab: 72 })
    expect(editor.getHTML()).toContain("padding-left: 54pt")
    const item = editor.view.dom.querySelector("li")!
    expect(item.dataset.wordHang).toBe("36")
    const { xml } = await save(editor)
    expect(xml.match(/<w:ind w:left="1080" w:hanging="720"\/>/g)).toHaveLength(2)
    expect(xml).toContain('<w:tab w:val="num" w:pos="1440"/>')
  })

  it("gives a list followed by a space its own numbering with w:suff", async () => {
    const editor = make("<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>")
    caret(editor, "one")
    adjustListIndents(editor, { number: 0, text: 18, follow: "space", tab: null })
    expect(editor.view.dom.querySelector("li")!.dataset.wordSuffix).toBe("space")
    const { numbering, xml } = await save(editor)
    const [bullet] = numIds(xml)
    const abstractId = numbering.match(
      new RegExp(`<w:num w:numId="${bullet}"[^>]*><w:abstractNumId w:val="(\\d+)"`),
    )![1]
    expect(numbering).toMatch(
      new RegExp(`<w:abstractNum [^>]*w:abstractNumId="${abstractId}".*?<w:suff w:val="space"/>`),
    )
  })
})
