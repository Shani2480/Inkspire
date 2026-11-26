import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { wrapPush } from "@/components/chrome-editors"
import { createExtensions } from "@/editor/extensions"

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe("a row of exact height", () => {
  it("keeps its height for what its cells show (Word cuts off the rest)", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content:
        '<table><tbody><tr style="height: 23px" data-height-rule="exact"><td><p>One</p><p>Two</p></td></tr>' +
        '<tr style="height: 23px"><td><p>Three</p></td></tr></tbody></table>',
    })
    editors.push(editor)
    const html = editor.getHTML()
    expect(html).toContain("--row-exact: 23px")
    // An "at least" row grows with its text, as before.
    expect(html.match(/--row-exact/g)).toHaveLength(1)
    expect(html).toContain("--row-min: 23px")
  })

  it("gives the rows the cell's top and bottom margins, which Word adds to a set height", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content:
        '<table><tbody><tr style="height: 29px" data-height-rule="exact">' +
        '<td data-word-cell="padding-top: 4pt; padding-bottom: 4pt; padding-left: 6pt"><p>Owner</p></td></tr></tbody></table>',
    })
    editors.push(editor)
    const html = editor.getHTML()
    expect(html).toContain("--cell-top: 4pt")
    expect(html).toContain("--cell-bottom: 4pt")
  })
})

/** An element with the box a browser would give it (jsdom lays nothing out). */
function boxed<T extends HTMLElement>(element: T, box: { left?: number; top: number; width: number; height: number }) {
  for (const [name, value] of Object.entries({
    offsetLeft: box.left ?? 0,
    offsetTop: box.top,
    offsetWidth: box.width,
    offsetHeight: box.height,
  })) {
    Object.defineProperty(element, name, { configurable: true, value })
  }
  return element
}

describe("a footer's text below a picture it wraps around", () => {
  function footer(left: number, width: number) {
    const editor = document.createElement("div")
    Object.defineProperty(editor, "clientWidth", { configurable: true, value: 600 })
    const frame = boxed(document.createElement("div"), { left, top: -13, width, height: 31 })
    frame.className = "object-frame"
    frame.dataset.wrapping = "0"
    const paragraph = boxed(document.createElement("p"), { top: 0, width: 600, height: 18 })
    editor.append(frame, paragraph)
    document.body.append(editor)
    return editor
  }

  it("starts below a picture as wide as the text (Word moves the line under it)", () => {
    expect(wrapPush(footer(-65, 763))).toBe(18)
  })

  it("stays beside a picture that leaves room beside it", () => {
    expect(wrapPush(footer(0, 200))).toBe(0)
  })
})
