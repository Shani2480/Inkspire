import { changedAttrs, styleSpacing, type ParagraphDraft } from "@/components/paragraph-dialog"
import { useStyleStore } from "@/document/styles"
import { createExtensions } from "@/editor/extensions"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

const draft: ParagraphDraft = {
  align: "left",
  outline: "body",
  collapsed: false,
  leftCm: "0",
  rightCm: "0",
  special: "none",
  specialBy: "",
  mirror: false,
  before: "0",
  after: "8",
  lineSpacing: "multiple",
  lineAt: "1.15",
  contextual: false,
  widow: true,
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  suppressLines: false,
  dontHyphenate: false,
  tightWrap: "none",
}
const attrs = { textAlign: "left", spaceAfter: 8, lineRule: "multiple", lineHeight: "1.15", keepNext: true }

describe("Paragraph dialog applies what changed (22.8)", () => {
  it("writes Keep with next alone, leaving the paragraph's spacing as it was", () => {
    expect(changedAttrs(attrs, { ...draft, keepNext: true }, draft)).toEqual({ keepNext: true })
  })

  it("writes both line spacing attributes when either field changed, and nothing when none did", () => {
    expect(changedAttrs(attrs, { ...draft, lineAt: "2" }, draft)).toEqual({ lineRule: "multiple", lineHeight: "1.15" })
    expect(changedAttrs(attrs, draft, draft)).toEqual({})
  })
})

describe("Paragraph dialog shows the spacing the page draws", () => {
  const editorWith = (html: string) =>
    new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: html,
    })

  it("takes a plain paragraph's spacing from Normal, not a fixed 1.15", () => {
    const editor = editorWith("<p>Text</p>")
    editor.commands.setTextSelection(2)
    const normal = useStyleStore.getState().styles.find((style) => style.id === "normal")!
    expect(styleSpacing(editor)).toEqual({
      before: normal.paragraph.before,
      after: normal.paragraph.after,
      line: normal.paragraph.line,
    })
    editor.destroy()
  })

  it("takes a heading's from its own style, and what it leaves out from Normal", () => {
    const editor = editorWith("<h1>Title</h1>")
    editor.commands.setTextSelection(2)
    const heading = useStyleStore.getState().styles.find((style) => style.id === "heading-1")!
    expect(styleSpacing(editor).line).toBe(heading.paragraph.line)
    editor.destroy()
  })
})
