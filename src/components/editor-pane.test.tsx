import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let editor: Editor | null = null
vi.mock("@/editor/document-editor", () => ({ useBodyEditor: () => editor }))

import { EditorPane } from "@/components/editor-pane"
import { useDocumentStore } from "@/document/store"
import { Grammar, useEditorPane } from "@/editor/grammar"

describe("Editor pane", () => {
  beforeEach(() => {
    useDocumentStore.setState((state) => ({ pageSetup: { ...state.pageSetup, language: "en-US" } }))
    useEditorPane.setState({ open: true, checkGrammar: true, aiAuto: false, aiIssues: [], ignored: [], version: 0 })
    editor = new Editor({
      extensions: [StarterKit, Grammar],
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Then i left  here." }] }],
      },
    })
  })

  afterEach(() => {
    cleanup()
    editor?.destroy()
    editor = null
    useEditorPane.setState({ open: false })
  })

  it("lists what is flagged and applies a suggestion in one click", async () => {
    render(<EditorPane />)
    expect(screen.getByTestId("editor-summary").textContent).toContain("2 grammar")
    const list = screen.getByTestId("editor-list")
    expect(list.textContent).toContain("The pronoun “I” is always a capital.")
    fireEvent.click(screen.getByRole("button", { name: "I" }))
    expect(editor?.getText()).toBe("Then I left  here.")
    fireEvent.click(screen.getByRole("button", { name: "One space" }))
    expect(editor?.getText()).toBe("Then I left here.")
    // The list follows once typing has paused.
    await waitFor(() => expect(screen.getByTestId("editor-summary").textContent).toContain("Nothing to fix"))
  })

  it("ignores an issue for the session and can show it again", async () => {
    render(<EditorPane />)
    fireEvent.click(screen.getAllByRole("button", { name: "Ignore" })[0])
    await waitFor(() => expect(screen.getByTestId("editor-summary").textContent).toContain("1 grammar"))
    fireEvent.click(screen.getByRole("button", { name: "Show ignored (1)" }))
    await waitFor(() => expect(screen.getByTestId("editor-summary").textContent).toContain("2 grammar"))
  })

  it("has the document-wide switches and closes", () => {
    render(<EditorPane />)
    const grammar = screen.getByLabelText("Check grammar as you type") as HTMLInputElement
    expect(grammar.checked).toBe(true)
    fireEvent.click(grammar)
    expect(useEditorPane.getState().checkGrammar).toBe(false)
    expect(screen.getByTestId("editor-summary").textContent).toContain("Nothing to fix")
    expect(screen.getByRole("button", { name: "Check with AI" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close editor pane" }))
    expect(useEditorPane.getState().open).toBe(false)
  })
})
