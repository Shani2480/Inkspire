import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { PositionedImage } from "@/editor/objects"
import { applyCrop, beginCrop, cancelCrop, hasPendingCrop, previewCrop, resetPendingCrop } from "@/editor/picture-crop"
import { undo } from "@tiptap/pm/history"

function make() {
  return new Editor({
    extensions: [StarterKit, PositionedImage],
    content: '<p><img src="https://example.test/a.png" width="300" height="200"></p>',
  })
}

function picture(editor: Editor) {
  let found: { pos: number; attrs: Record<string, unknown> } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      found = { pos, attrs: { ...node.attrs } }
    }
  })
  return found as unknown as { pos: number; attrs: Record<string, unknown> }
}

afterEach(() => {
  if (hasPendingCrop()) {
    cancelCrop()
  }
})

describe("a crop in progress (21.46)", () => {
  it("previews without history, cancel restores the picture, apply is one undo step", () => {
    const editor = make()
    const before = picture(editor)
    beginCrop(editor.view, before.pos, before.attrs)
    previewCrop(editor.view, before.pos, { ...before.attrs, cropL: 20, width: 240 })
    expect(picture(editor).attrs.cropL).toBe(20)
    expect(hasPendingCrop()).toBe(true)

    cancelCrop()
    expect(picture(editor).attrs).toMatchObject({ cropL: 0, width: before.attrs.width })
    expect(hasPendingCrop()).toBe(false)

    beginCrop(editor.view, before.pos, before.attrs)
    previewCrop(editor.view, before.pos, { ...before.attrs, cropL: 20, width: 240 })
    applyCrop()
    expect(picture(editor).attrs.cropL).toBe(20)
    expect(undo(editor.state, editor.view.dispatch)).toBe(true)
    expect(picture(editor).attrs.cropL).toBe(0)
    editor.destroy()
  })

  it("reset shows the whole picture again, still pending", () => {
    const editor = make()
    const before = picture(editor)
    beginCrop(editor.view, before.pos, before.attrs)
    previewCrop(editor.view, before.pos, { ...before.attrs, cropL: 20, width: 240 })
    resetPendingCrop()
    expect(picture(editor).attrs).toMatchObject({ cropL: 0, width: 300 })
    expect(hasPendingCrop()).toBe(true)
    editor.destroy()
  })
})
