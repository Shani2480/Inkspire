import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TableRow } from "@tiptap/extension-table"
import { afterEach, describe, expect, it } from "vitest"
import { insertHorizontalLine } from "@/editor/home-actions"
import { IndentedParagraph } from "@/editor/indent"
import { FramedTable, ShadedTableCell, ShadedTableHeader } from "@/editor/table-tools"

describe("Borders → Horizontal Line (21.30)", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  const make = (content: string) =>
    new Editor({
      extensions: [
        StarterKit.configure({ paragraph: false }),
        IndentedParagraph,
        FramedTable,
        TableRow,
        ShadedTableCell,
        ShadedTableHeader,
      ],
      content,
    })
  const blocks = (current: Editor) =>
    current.state.doc.children.map((node) => `${node.type.name}${node.attrs.border ? `:${node.attrs.border}` : ""}`)

  it("adds a bordered empty paragraph below the cursor's paragraph and leaves the cursor after it", () => {
    editor = make("<p>one</p><p>two</p>")
    editor.commands.setTextSelection(2)
    insertHorizontalLine(editor)
    expect(blocks(editor)).toEqual(["paragraph", "paragraph:bottom", "paragraph", "paragraph"])
    expect(editor.state.selection.$from.parent.textContent).toBe("")
    expect(editor.state.selection.$from.parent.attrs.border).toBeNull()
  })

  it("goes below the whole table when the cursor is in a cell", () => {
    editor = make("<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table><p>after</p>")
    editor.commands.setTextSelection(4)
    insertHorizontalLine(editor)
    expect(blocks(editor)).toEqual(["table", "paragraph:bottom", "paragraph", "paragraph"])
  })
})
