import { createExtensions } from "@/editor/extensions"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

function inserted(layout: Parameters<Editor["commands"]["insertSmartArt"]>[0]) {
  const element = document.createElement("div")
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: "<p></p>",
  })
  editor.commands.insertSmartArt(layout)
  let attrs: Record<string, unknown> = {}
  editor.state.doc.descendants((node) => {
    if (node.type.name === "smartArt") {
      attrs = node.attrs
    }
  })
  return { editor, attrs, body: editor.view.dom.querySelector<HTMLElement>(".smartart")! }
}

describe("SmartArt layouts", () => {
  it("starts an organization chart with one shape over the others", () => {
    const { editor, attrs, body } = inserted("hierarchy")
    expect(JSON.parse(String(attrs.levels))).toEqual([0, 1, 1])
    expect(body.querySelectorAll(".smartart-children .smartart-cell")).toHaveLength(2)
    editor.destroy()
  })

  it("draws Basic Cycle round a ring with an arrow from each shape to the next", () => {
    const { editor, body } = inserted("cycle")
    const ring = body.querySelector(".smartart-ring")!
    expect(ring.querySelectorAll(".smartart-cell")).toHaveLength(4)
    expect(ring.querySelectorAll(".smartart-ring-arrow")).toHaveLength(4)
    const tops = [...ring.querySelectorAll<HTMLElement>(".smartart-cell")].map((cell) => parseFloat(cell.style.top))
    expect(tops[0]).toBeLessThan(tops[2]!)
    editor.destroy()
  })
})
