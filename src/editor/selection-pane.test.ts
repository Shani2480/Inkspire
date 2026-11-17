import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { objectsIn } from "@/components/select-objects-mode"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { patchDocPr } from "@/document/docx/inlines"
import { decodeXml } from "@/document/docx/xml"
import { restoreObjects } from "@/document/object-pictures"
import { createExtensions } from "@/editor/extensions"
import { listObjects, moveObjectInStack, renameObject, setAllObjectsHidden } from "@/editor/object-group"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(content: string) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content,
  })
  editors.push(editor)
  return editor
}

function labels(editor: Editor) {
  return listObjects(editor.state.doc).map((row) => row.label)
}

describe("Selection pane (U28)", () => {
  it("lists the top of the stack first, in-line objects last, and names objects by kind", () => {
    const editor = editorWith(
      `<p><img src="${PIXEL}" width="20" height="20"></p>` +
        `<p><img src="${PIXEL}" width="20" height="20" data-wrap="square" data-z="1"></p>` +
        `<p><img src="${PIXEL}" width="20" height="20" data-wrap="front" data-z="5" data-object-name="Logo"></p>`,
    )
    expect(labels(editor)).toEqual(["Logo", "Picture 2", "Picture 1"])
    const [logo, second] = listObjects(editor.state.doc)
    expect(logo?.floating && second?.floating).toBe(true)
    expect(listObjects(editor.state.doc)[2]?.floating).toBe(false)

    // Send Backward swaps the top two, and the in-line picture can't move.
    expect(moveObjectInStack(editor, logo!.pos, "down")).toBe(true)
    expect(labels(editor)).toEqual(["Picture 2", "Logo", "Picture 1"])
    expect(moveObjectInStack(editor, listObjects(editor.state.doc)[2]!.pos, "up")).toBe(false)
    // Dragging Logo onto the top row brings it back up.
    const rows = listObjects(editor.state.doc)
    expect(moveObjectInStack(editor, rows[1]!.pos, rows[0]!.pos)).toBe(true)
    expect(labels(editor)).toEqual(["Logo", "Picture 2", "Picture 1"])

    renameObject(editor, listObjects(editor.state.doc)[1]!.pos, "  Chart image ")
    expect(labels(editor)).toEqual(["Logo", "Chart image", "Picture 1"])
    renameObject(editor, listObjects(editor.state.doc)[1]!.pos, "")
    expect(labels(editor)[1]).toBe("Picture 2")
  })

  it("hides and shows every object in one step, and keeps behind-text objects under the others", () => {
    const editor = editorWith(
      `<p><img src="${PIXEL}" width="20" height="20" data-wrap="behind" data-z="9"></p>` +
        `<p><img src="${PIXEL}" width="20" height="20" data-wrap="front" data-z="1"></p>`,
    )
    expect(labels(editor)).toEqual(["Picture 2", "Picture 1"])
    const [front, behind] = listObjects(editor.state.doc)
    expect(moveObjectInStack(editor, behind!.pos, "up")).toBe(false)
    expect(moveObjectInStack(editor, front!.pos, behind!.pos)).toBe(false)

    setAllObjectsHidden(editor, true)
    expect(listObjects(editor.state.doc).every((row) => row.hidden)).toBe(true)
    expect(editor.view.dom.querySelectorAll('[data-hidden="1"]').length).toBe(2)
    editor.commands.undo()
    expect(listObjects(editor.state.doc).some((row) => row.hidden)).toBe(false)
  })

  it("Select Objects takes the topmost object clicked, or every object inside the rectangle", () => {
    const boxes = [
      { pos: 5, rect: { left: 0, top: 0, right: 50, bottom: 50 } },
      { pos: 9, rect: { left: 40, top: 40, right: 90, bottom: 90 } },
    ]
    expect(objectsIn(boxes, { left: 45, top: 45, right: 45, bottom: 45 })).toEqual([5])
    expect(objectsIn(boxes, { left: 60, top: 60, right: 61, bottom: 61 })).toEqual([9])
    expect(objectsIn(boxes, { left: 200, top: 200, right: 200, bottom: 200 })).toEqual([])
    expect(objectsIn(boxes, { left: -5, top: -5, right: 60, bottom: 60 })).toEqual([5])
    expect(objectsIn(boxes, { left: -5, top: -5, right: 95, bottom: 95 })).toEqual([5, 9])
  })

  it("writes the name and Hide on the drawing's wp:docPr", () => {
    expect(patchDocPr('<wp:docPr id="3" name="Picture 3"/>', "Logo & mark", true)).toBe(
      '<wp:docPr id="3" name="Logo &amp; mark" hidden="1"/>',
    )
    expect(patchDocPr('<wp:docPr id="3" name="Picture 3" hidden="1"><a:extLst/>', "", false)).toBe(
      '<wp:docPr id="3" name="Picture 3"><a:extLst/>',
    )
  })

  it("opens Word's object names and hidden objects, and saves a rename and Hide", async () => {
    const name = "f20_word_shapes.docx"
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
    // The app's own objects open as themselves again, keeping the file's names (as the app does after opening).
    const restored = editorWith(opened.view.html)
    restoreObjects(restored)
    expect(restored.state.doc.firstChild?.firstChild?.type.name).not.toBe("image")
    expect(labels(restored)).toEqual(expect.arrayContaining(["Frame 6", "Heart 7"]))
    const editor = editorWith(opened.view.html)
    const names = labels(editor)
    expect(names).toEqual(expect.arrayContaining(["Frame 6", "Heart 7"]))
    const heart = listObjects(editor.state.doc).find((row) => row.label === "Heart 7")!
    renameObject(editor, heart.pos, "Big heart")
    const frame = listObjects(editor.state.doc).find((row) => row.label === "Frame 6")!
    const node = editor.state.doc.nodeAt(frame.pos)!
    editor.view.dispatch(editor.state.tr.setNodeMarkup(frame.pos, undefined, { ...node.attrs, hidden: "1" }))
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: name,
    })
    if (process.env.PANE_OUT) {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(process.env.PANE_OUT, saved.bytes)
    }
    const xml = decodeXml(findPart(await openPackage(saved.bytes, name), "/word/document.xml")!.data)
    expect(xml).toMatch(/<wp:docPr id="7" name="Big heart"/)
    expect(xml).toMatch(/<wp:docPr id="6" name="Frame 6" hidden="1"/)

    const again = await openDocxBytes(saved.bytes, name)
    const reopened = editorWith(again.view.html)
    restoreObjects(reopened)
    const rows = listObjects(reopened.state.doc)
    expect(rows.find((row) => row.label === "Big heart")?.hidden).toBe(false)
    expect(rows.find((row) => row.label === "Frame 6")?.hidden).toBe(true)
  })
})
