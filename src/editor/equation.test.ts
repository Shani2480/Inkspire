import { createExtensions } from "@/editor/extensions"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(html: string) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: html,
  })
  editors.push(editor)
  return editor
}

/** The range of `text` in the document. */
function find(editor: Editor, text: string) {
  let range = { from: 0, to: 0 }
  editor.state.doc.descendants((node, pos) => {
    const at = node.isText ? (node.text ?? "").indexOf(text) : -1
    if (at >= 0) {
      range = { from: pos + at, to: pos + at + text.length }
    }
  })
  return range
}

function equations(editor: Editor) {
  const found: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "equation") {
      found.push(node.attrs)
    }
  })
  return found
}

describe("converting selected text to an equation", () => {
  it("turns linear text within a line into an inline equation, built up", () => {
    const editor = editorWith("<p>So a^2+b^2=c^2 holds.</p>")
    editor.commands.setTextSelection(find(editor, "a^2+b^2=c^2"))
    expect(editor.commands.convertTextToEquation()).toBe(true)
    expect(equations(editor)).toEqual([expect.objectContaining({ tex: "a^{2}+b^{2}=c^{2}", display: false })])
    expect(editor.getText()).toContain("So ")
    expect(editor.getText()).toContain(" holds.")
    expect(editor.state.selection.toJSON()).toMatchObject({ type: "node" })
  })

  it("makes a whole paragraph a display equation", () => {
    const editor = editorWith("<p>(a+b)/2</p>")
    editor.commands.setTextSelection(find(editor, "(a+b)/2"))
    editor.commands.convertTextToEquation()
    expect(equations(editor)).toEqual([expect.objectContaining({ tex: "\\frac{a+b}{2}", display: true })])
  })

  it("does nothing without selected text, or across paragraphs", () => {
    const editor = editorWith("<p>x=1</p><p>y=2</p>")
    editor.commands.setTextSelection(2)
    expect(editor.commands.convertTextToEquation()).toBe(false)
    editor.commands.setTextSelection({ from: 2, to: 8 })
    expect(editor.commands.convertTextToEquation()).toBe(false)
    expect(equations(editor)).toHaveLength(0)
  })
})
