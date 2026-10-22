import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let editor: Editor | null = null
vi.mock("@/editor/document-editor", () => ({ useBodyEditor: () => editor }))
vi.mock("@/ai/generate", () => ({
  generateAiText: vi.fn(),
  isAiStopped: () => false,
  isAiCancelled: () => false,
  cancelAiRequest: vi.fn(),
  stopActiveGeneration: vi.fn(),
}))

import { useAiChat, type ChatMessage } from "@/ai/chat"
import { AiSidebar } from "@/components/ai-sidebar"

function verdict(stage: "status" | "fixes"): ChatMessage {
  return {
    id: "verdict",
    role: "assistant",
    text: stage === "status" ? "There are some grammatical errors in the sentence." : "Here are the fixes:",
    insertText: "",
    replaceable: false,
    review: {
      stage,
      ok: false,
      corrections: [
        { text: "He go", suggestion: "He goes", reason: "The verb must agree with He." },
        { text: "i like", suggestion: "I like", reason: "The pronoun I is capitalised." },
      ],
      range: { from: 1, to: 28, text: "He go to school. i like it." },
      applied: [],
      answered: "",
      note: "",
    },
  }
}

describe("the verdict in the AI sidebar", () => {
  beforeEach(() => {
    editor = new Editor({ extensions: [StarterKit], content: "<p>He go to school. i like it.</p>" })
    useAiChat.setState({ open: true, messages: [], draft: "", error: "", thinking: false })
  })

  afterEach(() => {
    cleanup()
    editor?.destroy()
    editor = null
  })

  it("asks whether to suggest fixes, and Yes lists them with Apply buttons", () => {
    useAiChat.setState({ messages: [verdict("status")] })
    render(<AiSidebar />)
    expect(screen.getByText("Should I suggest fixes?")).toBeTruthy()
    expect(screen.queryByRole("list", { name: "Corrections" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Yes" }))
    expect(screen.getByText("Should I suggest fixes? Yes")).toBeTruthy()
    expect(screen.getByText("Here are the fixes:")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: /^Apply: / })).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: "Apply: He goes" }))
    expect(editor!.getText()).toBe("He goes to school. i like it.")
    expect(screen.getByRole("button", { name: "Applied: He goes" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Apply all" }))
    expect(editor!.getText()).toBe("He goes to school. I like it.")
    expect(screen.getByRole("button", { name: "All applied" })).toBeTruthy()
  })

  it("says a fix about spaces in words", () => {
    const message = verdict("fixes")
    message.review!.corrections = [
      { text: "  ", suggestion: " ", reason: "Extra space between words." },
      { text: ",", suggestion: ", ", reason: "A space after “,”." },
      { text: " very", suggestion: "", reason: "Repeated word." },
    ]
    useAiChat.setState({ messages: [message] })
    render(<AiSidebar />)
    expect(screen.getByText("One space")).toBeTruthy()
    expect(screen.getByText("Add a space after “,”")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Apply: Remove “ very”" })).toBeTruthy()
  })

  it("keeps No as the answer", () => {
    useAiChat.setState({ messages: [verdict("status")] })
    render(<AiSidebar />)
    fireEvent.click(screen.getByRole("button", { name: "No" }))
    expect(screen.getByText("Should I suggest fixes? No")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull()
  })

  it("shows a proofread's corrections at once, and says when the text has changed", () => {
    useAiChat.setState({ messages: [verdict("fixes")] })
    render(<AiSidebar />)
    expect(screen.getByRole("list", { name: "Corrections" })).toBeTruthy()
    expect(screen.getByText("The verb must agree with He.")).toBeTruthy()
    expect(screen.getByText("He goes")).toBeTruthy()
    editor!.commands.setContent("<p>Something else.</p>")
    fireEvent.click(screen.getByRole("button", { name: "Apply: He goes" }))
    expect(screen.getByRole("alert").textContent).toContain("no longer in the document")
    expect(screen.getByRole("button", { name: "Apply: He goes" })).toBeTruthy()
  })
})
