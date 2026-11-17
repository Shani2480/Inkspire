import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"

let editor: Editor
afterEach(() => editor?.destroy())

describe("a table of contents on the page", () => {
  it("draws each entry as a paragraph in its Word style, so it is spaced and placed as Word does", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content: "<p>Start</p><h1>Introduction</h1><p>Text.</p><h2>Detail</h2><p>More.</p>",
    })
    editor.commands.setTextSelection(1)
    editor.commands.insertTableOfContents()
    const rows = [...editor.view.dom.querySelectorAll(".toc-entry")]
    expect(
      rows.map((row) => [
        row.tagName,
        (row as HTMLElement).dataset.wordStyle,
        row.querySelector(".toc-label")?.textContent,
      ]),
    ).toEqual([
      ["P", "TOC1", "Introduction"],
      ["P", "TOC2", "Detail"],
    ])
  })
})
