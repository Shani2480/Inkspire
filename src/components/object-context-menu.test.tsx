import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { ObjectContextMenu } from "@/components/object-context-menu"
import { PositionedImage } from "@/editor/objects"

afterEach(cleanup)

function setup() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [StarterKit, PositionedImage],
    content: '<p>before</p><p><img src="https://example.test/a.png"></p><p>after</p>',
  })
  render(<ObjectContextMenu editor={editor} />)
  let imagePos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      imagePos = pos
    }
  })
  return { editor, imagePos }
}

const menu = () => document.querySelector(".object-menu")

describe("the object menu opens only on a right-click (21.41)", () => {
  it("a click that selects an object does not open it", () => {
    const { editor, imagePos } = setup()
    act(() => {
      editor.commands.setNodeSelection(imagePos)
    })
    fireEvent.pointerDown(editor.view.dom)
    fireEvent.pointerUp(editor.view.dom)
    expect(menu()).toBeNull()
  })

  it("Shift+F10 opens it for the selected object", () => {
    const { editor, imagePos } = setup()
    act(() => {
      editor.commands.setNodeSelection(imagePos)
    })
    fireEvent.keyDown(editor.view.dom, { key: "F10", shiftKey: true })
    expect(menu()).not.toBeNull()
  })

  it("a right-click on the picture opens it and selects the picture", () => {
    const { editor } = setup()
    const image = editor.view.dom.querySelector(".image-frame, img") as HTMLElement
    expect(image).not.toBeNull()
    fireEvent.contextMenu(image)
    expect(menu()).not.toBeNull()
  })

  it("Escape closes it, and moving the selection away closes it", () => {
    const { editor, imagePos } = setup()
    act(() => {
      editor.commands.setNodeSelection(imagePos)
    })
    fireEvent.keyDown(editor.view.dom, { key: "F10", shiftKey: true })
    act(() => {
      editor.commands.setTextSelection(2)
    })
    expect(menu()).toBeNull()
  })

  it("Shift+F10 with no object selected opens nothing", () => {
    const { editor } = setup()
    fireEvent.keyDown(editor.view.dom, { key: "F10", shiftKey: true })
    expect(menu()).toBeNull()
  })
})
