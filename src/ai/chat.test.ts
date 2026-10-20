import { beforeEach, describe, expect, it, vi } from "vitest"

const generate = vi.fn()
vi.mock("@/ai/generate", () => ({
  generateAiText: (...args: unknown[]) => generate(...args),
  isAiStopped: (error: unknown) => error instanceof Error && error.message === "Stopped.",
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
})
