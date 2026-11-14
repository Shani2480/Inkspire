import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { goBack, moveParagraph, promoteDemote, redoOrRepeat, repeatLast, noteRepeatable } from "@/editor/word-keys"
import { shortcutFor } from "@/editor/shortcuts"

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions(), content })
  return editor
}
const caretIn = (text: string, offset = 1) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) {
      at = pos + node.text!.indexOf(text) + offset
    }
  })
  editor.commands.setTextSelection(at)
}
const blocks = () => {
  const out: string[] = []
  editor.state.doc.forEach((node) => out.push(node.textContent))
  return out
}

describe("Word's paragraph keys", () => {
  it("moves a paragraph up and down with the caret, as one undo step", () => {
    make("<p>one</p><p>two</p><p>three</p>")
    caretIn("two")
    expect(moveParagraph(editor, -1)).toBe(true)
    expect(blocks()).toEqual(["two", "one", "three"])
    expect(editor.state.doc.resolve(editor.state.selection.from).parent.textContent).toBe("two")
    expect(moveParagraph(editor, -1)).toBe(false)
    moveParagraph(editor, 1)
    moveParagraph(editor, 1)
    expect(blocks()).toEqual(["one", "three", "two"])
    editor.commands.undo()
    expect(blocks()).toEqual(["one", "two", "three"])
  })

  it("moves a list item among its siblings", () => {
    make("<ul><li><p>a</p></li><li><p>b</p></li></ul><p>after</p>")
    caretIn("b", 0)
    moveParagraph(editor, -1)
    const items: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "listItem") {
        items.push(node.textContent)
      }
    })
    expect(items).toEqual(["b", "a"])
  })

  it("promotes and demotes headings, body text and list items", () => {
    make("<h1>Top</h1><h2>Sub</h2><p>body</p><ul><li><p>first item</p></li><li><p>second item</p></li></ul>")
    caretIn("Sub")
    promoteDemote(editor, -1)
    expect(editor.state.doc.child(1).attrs.level).toBe(1)
    caretIn("body")
    promoteDemote(editor, 1)
    expect(editor.state.doc.child(2).type.name).toBe("heading")
    expect(editor.state.doc.child(2).attrs.level).toBe(2)
    caretIn("second", 0)
    promoteDemote(editor, 1)
    expect(editor.getHTML()).toMatch(/first item<\/p><ul><li><p[^>]*>second item/)
    promoteDemote(editor, -1)
    expect(editor.getHTML()).toMatch(/first item<\/p><\/li><li><p[^>]*>second item/)
  })
})

describe("Repeat and Go Back", () => {
  it("repeats the last command, and Ctrl+Y redoes first", () => {
    make("<p>alpha beta</p>")
    editor.commands.setTextSelection({ from: 1, to: 6 })
    const bold = shortcutFor("Mod+B")!.def
    bold.run(editor)
    noteRepeatable(bold.run)
    editor.commands.setTextSelection({ from: 7, to: 11 })
    repeatLast(editor)
    expect(editor.getHTML()).toContain("<strong>beta</strong>")
    editor.commands.undo()
    expect(editor.getHTML()).not.toContain("<strong>beta</strong>")
    redoOrRepeat(editor)
    expect(editor.getHTML()).toContain("<strong>beta</strong>")
  })

  it("goes back to the places of the last edits", () => {
    make("<p>first</p><p>second</p><p>third</p>")
    caretIn("first", 5)
    editor.commands.insertContent("!")
    caretIn("third", 5)
    editor.commands.insertContent("?")
    caretIn("second", 0)
    goBack(editor)
    expect(editor.state.doc.resolve(editor.state.selection.head).parent.textContent).toBe("third?")
    goBack(editor)
    expect(editor.state.doc.resolve(editor.state.selection.head).parent.textContent).toBe("first!")
  })

  it("binds Word's keys", () => {
    for (const [combo, id] of [
      ["Alt+Shift+ArrowUp", "move-up"],
      ["Alt+Shift+ArrowLeft", "promote"],
      ["Mod+Alt+F", "footnote"],
      ["Mod+Alt+D", "endnote"],
      ["F4", "repeat"],
      ["Mod+Y", "redo-repeat"],
      ["Shift+F5", "go-back"],
      ["Shift+F7", "thesaurus"],
      ["F9", "update-fields"],
      ["Mod+Shift+F9", "unlink-fields"],
      ["Mod+Shift+F5", "bookmark"],
    ]) {
      expect(shortcutFor(combo!)?.def.id).toBe(id)
    }
  })
})
