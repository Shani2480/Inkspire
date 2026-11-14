import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { formatsFor, pasteClipAs, sourceOf } from "@/editor/paste-special"

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML makes one for its paste handlers.
if (typeof globalThis.ClipboardEvent === "undefined") {
  globalThis.ClipboardEvent = class extends Event {
    clipboardData = null
  } as unknown as typeof ClipboardEvent
}

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  return editor
}

const RICH = '<p><span style="color: #ff0000; font-size: 20pt"><strong>Red bold</strong></span> words</p>'

describe("Paste Special", () => {
  it("lists the formats the clipboard holds, in Word's words", () => {
    expect(formatsFor({ html: RICH, text: "Red bold words" }).map((item) => item.label)).toEqual([
      "HTML Format",
      "Unformatted Text",
      "Unformatted Unicode Text",
      "Picture (PNG)",
    ])
    expect(formatsFor({ image: new Blob() }).map((item) => item.label)).toEqual(["Picture (PNG)"])
    expect(formatsFor({ text: "plain" }).map((item) => item.id)).toEqual(["text", "unicode"])
  })

  it("names the source", () => {
    expect(sourceOf({ html: '<p data-pm-slice="1 1 []">x</p>' })).toBe("Inkspire document")
    expect(sourceOf({ html: '<html xmlns:w="urn:schemas-microsoft-com:office:word"><p class=MsoNormal>x</p>' })).toBe(
      "Microsoft Word document",
    )
    expect(sourceOf({ html: "<!--SourceURL: https://example.com/page --><p>x</p>" })).toBe("example.com")
    expect(sourceOf({ text: "x" })).toBe("Unknown")
  })

  it("pastes HTML with its formatting, merged, or as unformatted text", async () => {
    const clip = { html: RICH, text: "Red bold words" }
    make("<p>End</p>")
    editor.commands.setTextSelection(1)
    await pasteClipAs(editor, clip, "html")
    expect(editor.getHTML()).toContain("<strong>")
    expect(editor.getHTML()).toMatch(/color: (#ff0000|rgb\(255, 0, 0\))/)

    make("<p>End</p>")
    editor.commands.setTextSelection(1)
    await pasteClipAs(editor, clip, "merge")
    expect(editor.getHTML()).toContain("<strong>")
    expect(editor.getHTML()).not.toMatch(/color:/)

    make("<p>End</p>")
    editor.commands.setTextSelection(1)
    await pasteClipAs(editor, clip, "unicode")
    expect(editor.getHTML()).not.toContain("<strong>")
    expect(editor.state.doc.textContent).toBe("Red bold wordsEnd")
  })

  it("pastes several lines of text as paragraphs", async () => {
    make("<p></p>")
    await pasteClipAs(editor, { text: "one\ntwo" }, "text")
    expect(editor.state.doc.childCount).toBe(2)
  })
})
