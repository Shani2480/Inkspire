import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useDocumentStore } from "@/document/store"
import { applyGrammarSuggestion, Grammar, listGrammarIssues, useEditorPane } from "@/editor/grammar"

/** Paragraphs from text runs (an HTML string would collapse the double spaces the rules look for). */
function createEditor(...paragraphs: (string | { bold: string })[][]) {
  return new Editor({
    extensions: [StarterKit, Grammar],
    content: {
      type: "doc",
      content: paragraphs.map((runs) => ({
        type: "paragraph",
        content: runs.map((run) =>
          typeof run === "string"
            ? { type: "text", text: run }
            : { type: "text", text: run.bold, marks: [{ type: "bold" }] },
        ),
      })),
    },
  })
}

describe("grammar on the page", () => {
  let editor: Editor | null = null

  beforeEach(() => {
    useDocumentStore.setState((state) => ({ pageSetup: { ...state.pageSetup, language: "en-US" } }))
    useEditorPane.setState({ checkGrammar: true, aiIssues: [], ignored: [], version: 0 })
  })

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it("lists rule issues with document positions and underlines them", () => {
    editor = createEditor(["Hello  world. it rained, and ", { bold: "i" }, " left."])
    const issues = listGrammarIssues(editor)
    expect(issues.map((issue) => issue.kind)).toEqual(["spacing", "capitalization", "pronoun"])
    const [spacing, capital, pronoun] = issues
    expect(editor.state.doc.textBetween(spacing.from, spacing.to)).toBe("  ")
    expect(editor.state.doc.textBetween(capital.from, capital.to)).toBe("it")
    expect(editor.state.doc.textBetween(pronoun.from, pronoun.to)).toBe("i")
    expect(editor.view.dom.querySelectorAll(".grammar-error").length).toBe(3)
  })

  it("applies a suggestion, keeps the marks, and refuses once the text has moved", () => {
    editor = createEditor(["Then ", { bold: "i" }, " left."])
    const [issue] = listGrammarIssues(editor)
    expect(applyGrammarSuggestion(editor, issue, "I")).toBe(true)
    expect(editor.getHTML()).toBe("<p>Then <strong>I</strong> left.</p>")
    expect(listGrammarIssues(editor)).toEqual([])
    expect(applyGrammarSuggestion(editor, issue, "I")).toBe(false)
  })

  it("ignores an issue for the session, and switching the rules off clears the page", () => {
    editor = createEditor(["a  b"])
    const [issue] = listGrammarIssues(editor)
    useEditorPane.getState().ignore(issue)
    expect(listGrammarIssues(editor)).toEqual([])
    useEditorPane.getState().clearIgnored()
    expect(listGrammarIssues(editor).length).toBe(1)
    useEditorPane.getState().setCheckGrammar(false)
    expect(listGrammarIssues(editor)).toEqual([])
    expect(editor.view.dom.querySelectorAll(".grammar-error").length).toBe(0)
  })

  it("flags what the AI found wherever that text is, and drops it once applied", () => {
    editor = createEditor(["They was late."], ["Again they was late."])
    useEditorPane.getState().setAiIssues([{ text: "they was", suggestion: "they were", reason: "Agreement" }], "")
    const issues = listGrammarIssues(editor)
    expect(issues.map((issue) => issue.source)).toEqual(["ai"])
    expect(editor.state.doc.textBetween(issues[0].from, issues[0].to)).toBe("they was")
    expect(applyGrammarSuggestion(editor, issues[0], "they were")).toBe(true)
    expect(editor.getText()).toContain("Again they were late.")
    expect(listGrammarIssues(editor)).toEqual([])
  })
})
