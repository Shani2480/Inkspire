import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { beforeEach, describe, expect, it, vi } from "vitest"

const generate = vi.fn()
vi.mock("@/ai/generate", () => ({
  generateAiText: (...args: unknown[]) => generate(...args),
  isAiStopped: (error: unknown) => error instanceof Error && error.message === "Stopped.",
  isAiCancelled: () => false,
  cancelAiRequest: vi.fn(),
  stopActiveGeneration: vi.fn(),
}))
vi.mock("@/ai/availability", () => ({ aiUnavailableReason: async () => null }))

import { useAiChat, wordingOf } from "@/ai/chat"

describe("AI chat", () => {
  beforeEach(() => {
    generate.mockReset()
    useAiChat.setState({ open: true, messages: [], draft: "", error: "", errorSettings: false, failedId: "" })
  })

  it("explains a failed request and retries it from the same message", async () => {
    generate.mockRejectedValueOnce(new Error("OpenAI rejected the API key."))
    useAiChat.setState({ draft: "Tighten this" })
    await useAiChat.getState().send(null)
    const failed = useAiChat.getState()
    expect(failed.error).toContain("401")
    expect(failed.errorSettings).toBe(true)
    expect(failed.messages).toHaveLength(1)

    generate.mockResolvedValueOnce("<p>Tighter.</p>")
    await failed.resend(null, failed.failedId)
    const after = useAiChat.getState()
    expect(after.error).toBe("")
    expect(after.messages.map((message) => message.text)).toEqual(["Tighten this", "Tighter."])
  })

  it("resends an earlier message and drops the replies after it", async () => {
    generate.mockResolvedValue("<p>Reply</p>")
    for (const draft of ["one", "two"]) {
      useAiChat.setState({ draft })
      await useAiChat.getState().send(null)
    }
    const first = useAiChat.getState().messages[0]!
    await useAiChat.getState().resend(null, first.id)
    expect(useAiChat.getState().messages.map((message) => message.text)).toEqual(["one", "Reply"])
  })

  it("puts a rewrite in the thread with its reply", async () => {
    generate.mockResolvedValueOnce("<p>Clearer.</p>")
    await useAiChat.getState().askAbout("Rewrite:\nmurky", "Rewrite it.", "murky")
    const messages = useAiChat.getState().messages
    expect(messages[0]).toMatchObject({ role: "user", text: "Rewrite:\nmurky" })
    expect(messages[1]).toMatchObject({
      role: "assistant",
      text: "Clearer.",
      insertText: "Clearer.",
      replaceable: true,
    })
  })

  it("offers only the marked wording for insertion, and nothing for a plain answer", async () => {
    generate.mockResolvedValueOnce("Here you go:\n<insert>Once upon a time.</insert>\nWant a longer one?")
    useAiChat.setState({ draft: "Write a story" })
    await useAiChat.getState().send(null)
    generate.mockResolvedValueOnce("<p>It has 3 paragraphs.</p>")
    useAiChat.setState({ draft: "How long is it?" })
    await useAiChat.getState().send(null)
    const [, story, , answer] = useAiChat.getState().messages
    expect(story).toMatchObject({ insertText: "Once upon a time.", replaceable: false })
    expect(story!.text).toContain("Here you go")
    expect(answer).toMatchObject({ insertText: "", replaceable: false })
  })

  it("can replace a selection only when the request had one", async () => {
    const editor = {
      state: { selection: { empty: false, from: 1, to: 4 }, doc: { textBetween: () => "old" } },
      getText: () => "old text",
    }
    generate.mockResolvedValueOnce("<insert>new</insert>")
    useAiChat.setState({ draft: "Make it newer" })
    await useAiChat.getState().send(editor as never)
    expect(useAiChat.getState().messages[1]).toMatchObject({ insertText: "new", replaceable: true })
  })

  it("rewords a message and starts the context there or keeps what came before", async () => {
    generate.mockResolvedValue("<p>Reply</p>")
    for (const draft of ["one", "two"]) {
      useAiChat.setState({ draft })
      await useAiChat.getState().send(null)
    }
    const second = useAiChat.getState().messages[2]!
    await useAiChat.getState().resend(null, second.id, { text: "three" })
    expect(useAiChat.getState().messages.map((message) => message.text)).toEqual(["one", "Reply", "three", "Reply"])
    const third = useAiChat.getState().messages[2]!
    await useAiChat.getState().resend(null, third.id, { text: "four", fromHere: true })
    expect(useAiChat.getState().messages.map((message) => message.text)).toEqual(["four", "Reply"])
  })

  it("still offers the wording when the model forgets the marks, but not for an answer", async () => {
    generate.mockResolvedValueOnce(
      "Here is a short story:\n\nOnce upon a time there was a fox.\n\nWant me to make it longer?",
    )
    useAiChat.setState({ draft: "Write me a story" })
    await useAiChat.getState().send(null)
    expect(useAiChat.getState().messages[1]!.insertText).toBe("Once upon a time there was a fox.")
    expect(wordingOf("What does this paragraph mean?", "It means the fox is clever.")).toBe("")
    expect(wordingOf("Shorten it", "Brief.")).toBe("Brief.")
  })

  it("is thinking while a chat request runs, and not before or after", async () => {
    let release: (value: string) => void = () => undefined
    generate.mockReturnValueOnce(new Promise<string>((resolve) => (release = resolve)))
    expect(useAiChat.getState().thinking).toBe(false)
    useAiChat.setState({ draft: "Write a line" })
    const sending = useAiChat.getState().send(null)
    await Promise.resolve()
    await Promise.resolve()
    expect(useAiChat.getState().thinking).toBe(true)
    release("<p>Done.</p>")
    await sending
    expect(useAiChat.getState().thinking).toBe(false)
  })

  it("works on the selected text alone, so a follow-up is not about the earlier story", async () => {
    generate.mockResolvedValue("<p>Reply</p>")
    useAiChat.setState({ draft: "Write a short story" })
    await useAiChat.getState().send(null)
    const editor = {
      state: { selection: { empty: false, from: 1, to: 10 }, doc: { textBetween: () => "Once upon a time." } },
      getText: () => "Once upon a time.",
    }
    useAiChat.setState({ draft: "Rewrite it and format it" })
    generate.mockClear()
    await useAiChat.getState().send(editor as never)
    const [task, context] = generate.mock.calls[0] as [string, string]
    expect(context).toBe("Once upon a time.")
    expect(task).toContain("Rewrite it and format it")
    expect(task).toContain("not to anything said earlier")
    const reply = useAiChat.getState().messages.at(-1)!
    expect(reply).toMatchObject({ insertText: "Reply", replaceable: true })
  })

  function selecting(text: string) {
    return {
      state: { selection: { empty: false, from: 1, to: 1 + text.length }, doc: { textBetween: () => text } },
      getText: () => text,
    } as never
  }

  it("answers 'is this correct?' with a verdict first, and lists the fixes only after Yes", async () => {
    generate.mockResolvedValueOnce(
      '{"ok": false, "issues": [{"text": "He go", "suggestion": "He goes", "reason": "The verb must agree."}]}',
    )
    useAiChat.setState({ draft: "Is this sentence correct?" })
    await useAiChat.getState().send(selecting("He go to school."))
    const [question, verdict] = useAiChat.getState().messages
    expect(question).toMatchObject({ role: "user", text: "Is this sentence correct?" })
    expect(verdict).toMatchObject({ text: "There is a grammatical error in the sentence.", insertText: "" })
    expect(verdict!.review).toMatchObject({ stage: "status", ok: false, answered: "", range: { from: 1, to: 17 } })
    expect(generate).toHaveBeenCalledTimes(1)

    useAiChat.getState().suggestFixes(verdict!.id)
    const [, asked, fixes] = useAiChat.getState().messages
    expect(asked!.review!.answered).toBe("yes")
    expect(fixes).toMatchObject({ role: "assistant", text: "Here is the fix:" })
    expect(fixes!.review).toMatchObject({ stage: "fixes", corrections: [{ text: "He go", suggestion: "He goes" }] })
    // Yes is answered once.
    useAiChat.getState().suggestFixes(verdict!.id)
    expect(useAiChat.getState().messages).toHaveLength(3)
  })

  it("lists the corrections at once for a proofread, and says when there is nothing to fix", async () => {
    generate.mockResolvedValueOnce('{"ok": false, "issues": [{"text": "i like", "suggestion": "I like"}]}')
    useAiChat.setState({ draft: "proofread this" })
    await useAiChat.getState().send(selecting("He goes. i like it."))
    const proofread = useAiChat.getState().messages[1]!
    expect(proofread.text).toBe("There is a grammatical error in the text. Here are the corrections:")
    expect(proofread.review).toMatchObject({ stage: "fixes", ok: false })

    generate.mockResolvedValueOnce('{"ok": true, "issues": []}')
    useAiChat.setState({ draft: "is this right?" })
    await useAiChat.getState().send(selecting("He goes to school."))
    const fine = useAiChat.getState().messages[3]!
    expect(fine.text).toBe("The sentence is fine. There is nothing to fix.")
    expect(fine.review).toMatchObject({ stage: "fixes", ok: true, corrections: [] })
  })

  it("keeps No as the answer, and reports a failed check with a Retry", async () => {
    generate.mockResolvedValueOnce('[{"text": "He go", "suggestion": "He goes"}]')
    useAiChat.setState({ draft: "check the grammar" })
    await useAiChat.getState().send(selecting("He go."))
    const verdict = useAiChat.getState().messages[1]!
    useAiChat.getState().declineFixes(verdict.id)
    expect(useAiChat.getState().messages).toHaveLength(2)
    expect(useAiChat.getState().messages[1]!.review!.answered).toBe("no")

    generate.mockRejectedValueOnce(new Error("OpenAI rejected the API key."))
    useAiChat.setState({ draft: "proofread" })
    await useAiChat.getState().send(selecting("He go."))
    const state = useAiChat.getState()
    expect(state.error).toContain("401")
    expect(state.failedId).toBe(state.messages[2]!.id)
    expect(state.thinking).toBe(false)
  })

  it("applies every fix where it was flagged, moving the later ones as the text changes", async () => {
    const text = "Then i went home,and  stayed there. It was a honest mistake."
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    })
    editor.commands.selectAll()
    generate.mockResolvedValueOnce(
      JSON.stringify({
        ok: false,
        issues: [
          { text: "i", suggestion: "I" },
          { text: ",", suggestion: ", " },
          { text: "  ", suggestion: " " },
          { text: "a honest", suggestion: "an honest" },
        ],
      }),
    )
    useAiChat.setState({ draft: "proofread this" })
    await useAiChat.getState().send(editor)
    const fixes = useAiChat.getState().messages[1]!
    expect(fixes.review!.corrections.map((item) => item.at)).toEqual([5, 16, 20, 43])
    expect(useAiChat.getState().applyAllFixes(editor, fixes.id)).toBe(true)
    expect(editor.getText()).toBe("Then I went home, and stayed there. It was an honest mistake.")
    expect(useAiChat.getState().messages[1]!.review!.applied).toEqual([0, 1, 2, 3])
    editor.destroy()
  })

  it("still rewrites the selection for any other request", async () => {
    generate.mockResolvedValueOnce("<insert>He goes to school.</insert>")
    useAiChat.setState({ draft: "Make it more formal" })
    await useAiChat.getState().send(selecting("He go to school."))
    expect(useAiChat.getState().messages[1]).toMatchObject({ insertText: "He goes to school.", replaceable: true })
    expect(useAiChat.getState().messages[1]!.review).toBeUndefined()
  })
})
