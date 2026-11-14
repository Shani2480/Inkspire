import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { currentHeading, headingSections, moveSection } from "@/editor/heading-sections"
import { SearchHighlight, setSearchHighlight } from "@/editor/search-highlight"

let editor: Editor
afterEach(() => editor?.destroy())

const outline = "<h1>A</h1><p>a</p><h2>A1</h2><p>a1</p><h1>B</h1><p>b</p>"
const order = () => headingSections(editor.state.doc).map((section) => section.text)

describe("Navigation pane headings", () => {
  it("gives each heading the text under it, up to the next heading at its level or above", () => {
    editor = new Editor({ extensions: [StarterKit], content: outline })
    const [a, a1, b] = headingSections(editor.state.doc)
    expect([a!.level, a1!.level, b!.level]).toEqual([1, 2, 1])
    expect(a!.end).toBe(b!.pos)
    expect(a1!.end).toBe(b!.pos)
    expect(b!.end).toBe(editor.state.doc.content.size)
    expect(currentHeading(headingSections(editor.state.doc), a1!.pos + 3)?.text).toBe("A1")
  })

  it("moves a heading's section with its subheadings, as one undo step", () => {
    editor = new Editor({ extensions: [StarterKit], content: outline })
    const [a, , b] = headingSections(editor.state.doc)
    expect(moveSection(editor, b!.pos, a!.pos)).toBe(true)
    expect(editor.getText({ blockSeparator: "|" })).toBe("B|b|A|a|A1|a1")
    const [b2] = headingSections(editor.state.doc)
    expect(moveSection(editor, b2!.pos, null)).toBe(true)
    expect(order()).toEqual(["A", "A1", "B"])
  })

  it("refuses to move a section into itself", () => {
    editor = new Editor({ extensions: [StarterKit], content: outline })
    const [a, a1] = headingSections(editor.state.doc)
    expect(moveSection(editor, a!.pos, a1!.pos)).toBe(false)
    expect(order()).toEqual(["A", "A1", "B"])
  })
})

describe("Search highlight", () => {
  it("marks every match and follows edits until cleared", () => {
    editor = new Editor({ extensions: [StarterKit, SearchHighlight], content: "<p>cat and cat</p>" })
    setSearchHighlight(editor, "cat")
    expect(editor.view.dom.querySelectorAll(".search-hit")).toHaveLength(2)
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " cat")
    expect(editor.view.dom.querySelectorAll(".search-hit")).toHaveLength(3)
    setSearchHighlight(editor, "")
    expect(editor.view.dom.querySelectorAll(".search-hit")).toHaveLength(0)
  })
})
