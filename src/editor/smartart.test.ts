import { createExtensions } from "@/editor/extensions"
import { cycleNodeSize } from "@/editor/smartart"
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

  it("draws Basic Cycle's shapes smaller as items are added, so neighbours on the ring never touch", () => {
    expect(cycleNodeSize(4)).toBe(92)
    for (const count of [6, 8, 10, 12]) {
      const neighbours = 2 * 105 * Math.sin(Math.PI / count)
      expect(cycleNodeSize(count)).toBeLessThan(neighbours)
    }
    expect(cycleNodeSize(12)).toBeLessThan(cycleNodeSize(8))
    const { editor, body } = inserted("cycle")
    expect(body.querySelector<HTMLElement>(".smartart-ring")!.style.getPropertyValue("--smartart-node")).toBe("92px")
    editor.destroy()
  })
})

describe("Picture Layout", () => {
  const PICTURE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg=="

  function withPicture(alt: string) {
    const element = document.createElement("div")
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: `<p>Before</p><p><img src="${PICTURE}" alt="${alt}" width="120" height="80"></p><p>After</p>`,
    })
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        editor.commands.setNodeSelection(pos)
      }
    })
    return editor
  }

  it("turns the selected picture into a picture layout holding it, captioned with its alt text", () => {
    const editor = withPicture("Harbour at dusk")
    expect(editor.commands.pictureToSmartArt("piclist")).toBe(true)
    const kinds: string[] = []
    let attrs: Record<string, unknown> = {}
    editor.state.doc.descendants((node) => {
      kinds.push(node.type.name)
      if (node.type.name === "smartArt") {
        attrs = node.attrs
      }
    })
    expect(kinds).not.toContain("image")
    expect(attrs.layout).toBe("piclist")
    expect(JSON.parse(String(attrs.labels))).toEqual(["Harbour at dusk"])
    expect(JSON.parse(String(attrs.pictures))).toEqual([PICTURE])
    expect(editor.getText()).toContain("Before")
    expect(editor.getText()).toContain("After")
    const slot = editor.view.dom.querySelector(".smartart .smartart-picture img")
    expect(slot?.getAttribute("src")).toBe(PICTURE)
    editor.destroy()
  })

  it("needs a selected picture and a picture layout", () => {
    const editor = withPicture("")
    expect(editor.commands.pictureToSmartArt("process")).toBe(false)
    editor.commands.setTextSelection(1)
    expect(editor.commands.pictureToSmartArt("vpiclist")).toBe(false)
    editor.destroy()
  })
})
