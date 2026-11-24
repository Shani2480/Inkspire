import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { selectedObject } from "@/editor/objects"

const SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const picture = { type: "linePicture", attrs: { src: SRC, width: 60, height: 40 } }
const words = (text: string) => ({ type: "text", text })
let editor: Editor | null = null

function open(content: unknown[]) {
  editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: { type: "doc", content },
  })
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "linePicture") {
      at = pos
    }
  })
  editor.commands.setNodeSelection(at)
  return editor
}

const shape = (current: Editor) =>
  current.getJSON().content!.map((node) => `${node.type}[${(node.content ?? []).map((child) => child.type).join(",")}]`)

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe("a picture among a line's words", () => {
  it("is formatted as a picture: the Picture Format commands change it", () => {
    const current = open([{ type: "paragraph", content: [words("One "), picture, words(" two")] }])
    expect(selectedObject(current)?.name).toBe("image")
    current.chain().updateObject({ brightness: 20 }).setObjectRotate(90).run()
    const node = current.state.doc.child(0).child(1)
    expect(node.type.name).toBe("linePicture")
    expect(node.attrs).toMatchObject({ brightness: 20, rotate: 90 })
  })

  it("leaves the line for the page with a wrap, standing just before its paragraph", () => {
    const current = open([
      { type: "paragraph", content: [words("Before")] },
      { type: "paragraph", content: [words("One "), picture, words(" two")] },
    ])
    expect(current.chain().setObjectWrap("square").run()).toBe(true)
    expect(shape(current)).toEqual(["paragraph[text]", "image[]", "paragraph[text]"])
    expect(current.state.doc.child(1).attrs).toMatchObject({ wrap: "square", width: 60, height: 40, anchoring: "move" })
    expect(current.state.doc.textContent).toBe("BeforeOne  two")
  })

  it("goes after the paragraph that must open its list item", () => {
    const current = open([
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [words("Item "), picture] }] }],
      },
    ])
    expect(current.chain().setObjectWrap("tight").run()).toBe(true)
    const item = current.getJSON().content![0]!.content![0]!
    expect(item.content!.map((node) => node.type)).toEqual(["paragraph", "image"])
  })
})
