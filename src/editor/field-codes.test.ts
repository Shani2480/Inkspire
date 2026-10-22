import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { pageFieldHtml } from "@/document/chrome-html"
import { WordInline } from "@/editor/docx-preserved"
import { dateFieldCode, formulaFieldCode, ifFieldCode, paintField, preservedFieldCode } from "@/editor/field-codes"
import { DateField, FormulaField, IfField } from "@/editor/fields"

describe("field codes (22.9)", () => {
  it("write the editor's fields as Word does", () => {
    expect(dateFieldCode("date")).toBe('DATE \\@ "M/d/yyyy"')
    expect(formulaFieldCode(" = (1 + 2) * 3")).toBe("= (1 + 2) * 3")
    expect(ifFieldCode("a", "≠", "b", "yes", "no")).toBe('IF a <> b "yes" "no"')
    expect(ifFieldCode("1", "=", "1", "Yes", "No")).toBe('IF 1 = 1 "Yes" "No"')
  })

  it("read a simple or complex field kept from a .docx", () => {
    const simple = JSON.stringify([{ kind: "simpleField", instr: " PAGE ", inlines: [] }])
    expect(preservedFieldCode(simple)).toBe("PAGE")
    const complex = JSON.stringify([
      { kind: "run", rPr: {}, content: [{ kind: "fldChar", charType: "begin" }] },
      { kind: "run", rPr: {}, content: [{ kind: "instrText", text: " TOC \\o " }] },
      { kind: "run", rPr: {}, content: [{ kind: "instrText", text: '"1-3" \\h ' }] },
      { kind: "run", rPr: {}, content: [{ kind: "fldChar", charType: "separate" }] },
      { kind: "run", rPr: {}, content: [{ kind: "text", text: "Contents" }] },
      { kind: "run", rPr: {}, content: [{ kind: "fldChar", charType: "end" }] },
    ])
    expect(preservedFieldCode(complex)).toBe('TOC \\o "1-3" \\h')
    expect(preservedFieldCode("not json")).toBe("")
  })

  it("draw the result in a span of its own and keep the code on the field", () => {
    const dom = document.createElement("span")
    paintField(dom, "3", "= 1 + 2")
    expect(dom.innerHTML).toBe('<span class="field-value">3</span>')
    expect(dom.getAttribute("data-field-code")).toBe("{ = 1 + 2 }")
    paintField(dom, "4", "= 2 + 2")
    expect(dom.querySelectorAll(".field-value").length).toBe(1)
    expect(dom.textContent).toBe("4")
    expect(dom.getAttribute("data-field-code")).toBe("{ = 2 + 2 }")
  })
})

describe("fields on the page (22.9)", () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("carry their code beside their result, the page number field included", () => {
    editor = new Editor({
      extensions: [StarterKit, DateField, FormulaField, IfField, WordInline],
      content: `<p><span data-formula="2 + 2">4</span> ${pageFieldHtml("page")} <span data-word-inline data-role="note" data-text="1" data-payload="[]">1</span></p>`,
    })
    const formula = editor.view.dom.querySelector(".formula-field")
    expect(formula?.getAttribute("data-field-code")).toBe("{ = 2 + 2 }")
    expect(formula?.querySelector(".field-value")?.textContent).toBe("4")
    const page = editor.view.dom.querySelector('[data-page-field="page"]')
    expect(page?.getAttribute("data-field-code")).toBe("{ PAGE }")
    expect(page?.querySelector(".field-value")?.textContent).toBe("1")
    // A note reference is not a field: plain text, as before.
    const note = editor.view.dom.querySelector("sup.word-inline")
    expect(note?.innerHTML).toBe("1")
    // What is saved has no inner span.
    expect(editor.getHTML()).not.toContain("field-value")
  })
})
