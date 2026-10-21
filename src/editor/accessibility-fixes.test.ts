import { applyAccessibilityFix, applyAccessibilitySuggestion } from "@/editor/accessibility-fixes"
import { createExtensions } from "@/editor/extensions"
import { checkAccessibility } from "@/lib/accessibility"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

function editorOf(html: string) {
  return new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
}

describe("accessibility fixes", () => {
  it("lowers a skipped heading, and refuses once the document has moved on", () => {
    const editor = editorOf("<h1>A</h1><h3>B</h3>")
    const issue = checkAccessibility(editor)[0]!
    editor.commands.setContent("<p>x</p>")
    expect(applyAccessibilityFix(editor, issue)).toBe(false)
    editor.commands.setContent("<h1>A</h1><h3>B</h3>")
    expect(applyAccessibilityFix(editor, checkAccessibility(editor)[0]!)).toBe(true)
    expect(checkAccessibility(editor)).toEqual([])
  })

  it("makes the first row a header and darkens pale text", () => {
    const editor = editorOf('<table><tr><td>a</td></tr></table><p><span style="color: #eeeeee">pale</span></p>')
    for (const issue of checkAccessibility(editor).filter((i) => i.fix)) {
      applyAccessibilityFix(
        editor,
        checkAccessibility(editor).find((i) => i.kind === issue.kind)!,
      )
    }
    expect(checkAccessibility(editor).map((i) => i.kind)).toEqual(["table-alt"])
  })

  it("removes a run of empty paragraphs", () => {
    const editor = editorOf("<p>a</p><p></p><p></p><p></p><p>b</p>")
    applyAccessibilityFix(editor, checkAccessibility(editor)[0]!)
    expect(editor.getText()).toBe("a\n\nb")
  })

  it("writes picture, link and table suggestions", () => {
    const editor = editorOf(
      '<p><img src="data:image/png;base64,AA==" alt="a.png"> and <a href="https://a.com">here</a></p><table><tr><th>h</th></tr></table>',
    )
    const issues = checkAccessibility(editor)
    const alt = issues.find((i) => i.kind === "weak-alt")!
    expect(applyAccessibilitySuggestion(editor, alt, { text: "A kite" })).toBe(true)
    const link = checkAccessibility(editor).find((i) => i.kind === "link-text")!
    expect(applyAccessibilitySuggestion(editor, link, { text: "Open the pricing page" })).toBe(true)
    const table = checkAccessibility(editor).find((i) => i.kind === "table-alt")!
    expect(applyAccessibilitySuggestion(editor, table, { title: "Heads", text: "One heading" })).toBe(true)
    expect(editor.getHTML()).toContain('alt="A kite"')
    expect(editor.getHTML()).toContain("Open the pricing page")
    expect(editor.getHTML()).toContain('href="https://a.com"')
    expect(checkAccessibility(editor).map((i) => i.kind)).toEqual([])
  })
})
