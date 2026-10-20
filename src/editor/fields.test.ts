import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { DateField, FormulaField, IfField } from "@/editor/fields"

function createFieldEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, DateField, FormulaField, IfField],
    content,
  })
}

describe("field serialization", () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("round-trips formula and if field attributes through HTML", () => {
    editor = createFieldEditor(
      '<p><span data-formula="(1 + 2) * 3">9</span> <span data-if-field="" data-if-left="a" data-if-op="≠" data-if-right="b" data-if-then="yes" data-if-else="no">yes</span></p>',
    )

    const html = editor.getHTML()
    editor.commands.setContent(html)

    const formula = findAttrs(editor, "formulaField")
    const ifField = findAttrs(editor, "ifField")

    expect(formula?.expression).toBe("(1 + 2) * 3")
    expect(ifField).toMatchObject({
      left: "a",
      operator: "≠",
      right: "b",
      thenText: "yes",
      elseText: "no",
    })
    expect(html).toContain('data-formula="(1 + 2) * 3"')
    expect(html).toContain('data-if-op="≠"')
  })

  it("round-trips date field format", () => {
    editor = createFieldEditor('<p><span data-date-field="" data-date-format="datetime">now</span></p>')
    const html = editor.getHTML()
    editor.commands.setContent(html)
    expect(findAttrs(editor, "dateField")?.format).toBe("datetime")
    expect(html).toContain('data-date-format="datetime"')
  })
})

function findAttrs(editor: Editor, typeName: string) {
  let attrs: Record<string, unknown> | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === typeName) {
      attrs = { ...node.attrs }
      return false
    }
  })
  return attrs
}
