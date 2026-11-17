import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { Figure } from "@/editor/insert-blocks"

let editor: Editor
afterEach(() => editor?.destroy())

const figure = (wrap: string) => {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Figure],
    content: `<p>a</p><p>b</p><div data-figure data-kind="shape" data-variant="heart" data-wrap="${wrap}" data-y="36"></div>`,
  })
  return editor.view.dom.querySelector<HTMLElement>(".insert-figure")!
}

describe("a shape placed on the page", () => {
  it("sits exactly at its place, without the room a shape in the line keeps around it", () => {
    const placed = figure("front")
    expect(placed.style.position).toBe("absolute")
    expect(placed.style.margin).toBe("0px")
  })

  it("keeps that room in the line", () => {
    const inline = figure("inline")
    expect(inline.style.position).not.toBe("absolute")
    expect(inline.style.margin).toBe("")
  })
})
