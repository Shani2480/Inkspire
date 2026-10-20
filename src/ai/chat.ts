import { aiUnavailableReason } from "@/ai/availability"
import { explainAiError } from "@/ai/errors"
import { generateAiText, isAiStopped, stopActiveGeneration } from "@/ai/generate"
import { rewritePreviewText } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import type { Editor } from "@tiptap/core"
import { create } from "zustand"

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  /** What the thread shows. */
  text: string
  /** The wording to put in the document: only what was asked for, none of the chat around it. */
  insertText: string
  /** The request had text selected, so the wording can replace it. */
  replaceable: boolean
}

/** The wording the model marked for the document, and the whole reply with the marks taken out. */
export function splitReply(raw: string) {
  const open = raw.search(/<insert>/i)
  if (open < 0) {
    return { shown: rewritePreviewText(raw).trim(), insertText: "" }
  }
  const after = raw.slice(open).replace(/^<insert>/i, "")
  const close = after.search(/<\/insert>/i)
  const inside = close < 0 ? after : after.slice(0, close)
  return {
    shown: rewritePreviewText(raw.replace(/<\/?insert>/gi, "")).trim(),
    insertText: rewritePreviewText(inside).trim(),
  }
}

type AiChat = {
  open: boolean
  messages: ChatMessage[]
  draft: string
  error: string
  /** The error is about the configuration, so the sidebar offers the AI settings. */
  errorSettings: boolean
  /** The user message whose request failed; it gets a Retry button. */
  failedId: string
  /** A request from the chat is being answered. */
  thinking: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  setDraft: (draft: string) => void
  setError: (error: string) => void
  send: (editor: Editor | null) => Promise<void>
  /** Sends a message of the thread again (optionally reworded), dropping it and the replies after it; `fromHere` also drops everything before it, so the context starts at that message. */
  resend: (editor: Editor | null, id: string, edit?: { text?: string; fromHere?: boolean }) => Promise<void>
  /** Puts a request made elsewhere (Rewrite) in the thread. */
  askAbout: (label: string, prompt: string, context: string) => Promise<void>
  stop: () => void
}

const WRITING_REQUEST =
  /\b(write|draft|compose|rewrite|rephrase|reword|paraphrase|shorten|expand|translate|summari[sz]e|proofread|fix|improve|polish|generate|create|continue|make|turn|convert|edit|outline|brainstorm|list)\b/i

/**
 * The wording to offer for the document when the model did not mark any: for a request that asks for writing, the
 * reply without its lead-in line ("Here is a story:") and its closing question ("Want a longer one?"). "" for an
 * answer to a question.
 */
export function wordingOf(request: string, shown: string) {
  if (!WRITING_REQUEST.test(request)) {
    return ""
  }
  const lines = shown.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (
    first >= 0 &&
    lines[first]!.trim().length < 120 &&
    lines[first]!.trim().endsWith(":") &&
    lines.length > first + 1
  ) {
    lines.splice(0, first + 1)
  }
  while (lines.length > 1 && lines[lines.length - 1]!.trim() === "") {
    lines.pop()
  }
  const last = lines[lines.length - 1]?.trim() ?? ""
  if (lines.length > 1 && last.endsWith("?") && last.length < 150) {
    lines.pop()
  }
  return lines.join("\n").trim()
}

const SYSTEM =
  "You are the assistant inside a word processor. Help the user write and edit the open document. Reply in plain text. Only when the user asks you to write or rewrite text for the document, put exactly that text, and nothing else, between <insert> and </insert>, and keep any comment outside the tags. Do not use the tags for answers, explanations or questions."

export const useAiChat = create<AiChat>((set, get) => {
  /** Runs one request for a message already in the thread, and files the reply or the error under it. */
  async function run(
    user: ChatMessage,
    prompt: string,
    context: string,
    request: { whole: boolean; selected: boolean },
  ) {
    set({ error: "", errorSettings: false, failedId: "", thinking: true })
    const fail = (error: unknown) => {
      const problem = explainAiError(error, useAiSettings.getState().provider)
      set({ error: problem.message, errorSettings: problem.settings, failedId: user.id })
    }
    try {
      const reason = await aiUnavailableReason()
      if (reason) {
        fail(reason)
        return
      }
      const html = await generateAiText(prompt, context, { system: SYSTEM, plain: true })
      const split = splitReply(html)
      // A rewrite asked from the ribbon is wording from end to end; in the chat only what the model marked is.
      const insertText = request.whole ? split.shown : split.insertText || wordingOf(prompt, split.shown)
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: split.shown || "Done.",
            insertText,
            replaceable: request.selected && insertText !== "",
          },
        ],
      }))
    } catch (error) {
      if (!isAiStopped(error)) {
        fail(error)
      }
    } finally {
      set({ thinking: false })
    }
  }

  return {
    open: false,
    messages: [],
    draft: "",
    error: "",
    errorSettings: false,
    failedId: "",
    thinking: false,
    setOpen: (open) => set({ open }),
    toggle: () => set((state) => ({ open: !state.open })),
    setDraft: (draft) => set({ draft }),
    setError: (error) => set({ error, errorSettings: false }),
    stop: () => stopActiveGeneration(),
    send: async (editor) => {
      const prompt = get().draft.trim()
      if (!prompt || useAiSettings.getState().running) {
        return
      }
      const history = get().messages
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: prompt,
        insertText: "",
        replaceable: false,
      }
      set({ draft: "", open: true, messages: [...history, user] })

      const selected =
        editor && !editor.state.selection.empty
          ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n").trim()
          : ""
      if (selected) {
        // The request is about the selected text and nothing else: the rest of the chat would only pull the model
        // back to what it wrote earlier ("rewrite it" is not a request for the story again).
        const task =
          `${prompt}\n\nApply this to the selected text given as the context, not to anything said earlier. ` +
          "Return only the resulting text, with no explanation."
        await run(user, task, selected, { whole: true, selected: true })
        return
      }
      const documentText = editor?.getText().trim().slice(0, 8000) ?? ""
      const recent = [...history].slice(-6).map((message) => {
        const text = message.text.length > 600 ? `${message.text.slice(0, 600)}…` : message.text
        return `${message.role === "user" ? "User" : "Assistant"}: ${text}`
      })
      const context = [
        documentText ? `Document:\n${documentText}` : "",
        recent.length ? `Earlier in this chat (background only; do not repeat it):\n${recent.join("\n\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
      await run(user, prompt, context, { whole: false, selected: false })
    },
    resend: async (editor, id, edit) => {
      const messages = get().messages
      const index = messages.findIndex((message) => message.id === id)
      const message = messages[index]
      if (!message || message.role !== "user" || useAiSettings.getState().running) {
        return
      }
      const text = edit?.text?.trim() || message.text
      set({ messages: edit?.fromHere ? [] : messages.slice(0, index), draft: text })
      await get().send(editor)
    },
    askAbout: async (label, prompt, context) => {
      if (useAiSettings.getState().running) {
        return
      }
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: label,
        insertText: "",
        replaceable: false,
      }
      set((state) => ({ open: true, messages: [...state.messages, user] }))
      await run(user, prompt, context, { whole: true, selected: true })
    },
  }
})
