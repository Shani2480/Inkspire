import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { NodeSelection } from "@tiptap/pm/state"
import { undo } from "@tiptap/pm/history"
import { describe, expect, it } from "vitest"
import { PositionedImage } from "@/editor/objects"
import { flattenCropped, sourceRect } from "@/editor/picture-flatten"

function make() {
  return new Editor({
    extensions: [StarterKit, PositionedImage],
    content:
      '<p><img src="https://example.test/a.png" width="240" height="160" data-crop-l="20" data-crop-b="20"></p>' +
      '<p><img src="https://example.test/b.png" width="100" height="100"></p>' +
      '<p><img src="https://example.test/c.png" width="100" height="50" data-crop-t="50"></p>',
  })
}

function pictures(editor: Editor) {
  const found: { pos: number; attrs: Record<string, unknown> }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      found.push({ pos, attrs: { ...node.attrs } })
    }
  })
  return found
}

const trim = async (src: string) => `${src}#trimmed`

describe("sourceRect (21.47)", () => {
  it("is the part of the picture's pixels that shows", () => {
    expect(sourceRect(1000, 500, { l: 0.2, t: 0, r: 0.1, b: 0.2 })).toEqual({ x: 200, y: 0, width: 700, height: 400 })
  })
})

describe("flattenCropped (21.47)", () => {
  it("flattens every cropped picture, leaves the rest, keeps the shown size, and is one undo step", async () => {
    const editor = make()
    expect(await flattenCropped(editor, "all", trim)).toBe(2)
    const [a, b, c] = pictures(editor)
    expect(a.attrs).toMatchObject({
      src: "https://example.test/a.png#trimmed",
      cropL: 0,
      cropB: 0,
      width: 240,
      height: 160,
    })
    expect(b.attrs.src).toBe("https://example.test/b.png")
    expect(c.attrs).toMatchObject({ src: "https://example.test/c.png#trimmed", cropT: 0 })
    expect(undo(editor.state, editor.view.dispatch)).toBe(true)
    expect(pictures(editor)[0].attrs).toMatchObject({ src: "https://example.test/a.png", cropL: 20 })
    editor.destroy()
  })

  it("flattens only the selected picture when asked, and nothing when it is not cropped", async () => {
    const editor = make()
    const [a, b] = pictures(editor)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, b.pos)))
    expect(await flattenCropped(editor, "selected", trim)).toBe(0)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, a.pos)))
    expect(await flattenCropped(editor, "selected", trim)).toBe(1)
    expect(pictures(editor)[2].attrs.cropT).toBe(50)
    editor.destroy()
  })
})
