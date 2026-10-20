import { describe, expect, it } from "vitest"
import { drawnMarkup } from "@/components/chrome-editors"

describe("drawnMarkup", () => {
  it("drops a selected picture's frame and handles from the copy shown on a closed header", () => {
    const dom = document.createElement("div")
    dom.innerHTML =
      '<div class="page-image ProseMirror-selectednode"><img src="x.png">' +
      '<div class="image-resize image-resize-n" data-resize="n"></div>' +
      '<button class="object-rotate" data-rotate></button></div><p>Text</p>'
    const html = drawnMarkup(dom)
    expect(html).toContain("<img")
    expect(html).toContain("Text")
    expect(html).not.toContain("ProseMirror-selectednode")
    expect(html).not.toContain("image-resize")
    expect(html).not.toContain("object-rotate")
    expect(dom.querySelector(".ProseMirror-selectednode")).not.toBeNull()
  })
})
