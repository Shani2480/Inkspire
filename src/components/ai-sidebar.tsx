import type { Correction } from "@/ai/assist"
import { useAiChat, type ReviewCard } from "@/ai/chat"
import { PROMPT_TIPS, promptTip } from "@/ai/prompt-tips"
import { AiThinking } from "@/components/ai-working"
import { rewritePreviewText } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import { useBodyEditor } from "@/editor/document-editor"
import { restoreSelection } from "@/editor/selection-memory"
import { useEffect, useRef, useState } from "react"

export function AiSidebar() {
  const editor = useBodyEditor()
  const open = useAiChat((state) => state.open)
  const messages = useAiChat((state) => state.messages)
  const draft = useAiChat((state) => state.draft)
  const error = useAiChat((state) => state.error)
  const setOpen = useAiChat((state) => state.setOpen)
  const setDraft = useAiChat((state) => state.setDraft)
  const send = useAiChat((state) => state.send)
  const resend = useAiChat((state) => state.resend)
  const errorSettings = useAiChat((state) => state.errorSettings)
  const failedId = useAiChat((state) => state.failedId)
  const thinking = useAiChat((state) => state.thinking)
  const suggestFixes = useAiChat((state) => state.suggestFixes)
  const declineFixes = useAiChat((state) => state.declineFixes)
  const applyFix = useAiChat((state) => state.applyFix)
  const applyAllFixes = useAiChat((state) => state.applyAllFixes)
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)
  const stop = useAiChat((state) => state.stop)
  const setError = useAiChat((state) => state.setError)
  const running = useAiSettings((state) => state.running)
  const stream = useAiSettings((state) => state.stream)
  const listRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  // The message being reworded, its new text, and whether the thread is being asked where the context starts.
  const [editing, setEditing] = useState<{ id: string; text: string; asking: boolean } | null>(null)

  useEffect(() => {
    if (open) {
      fieldRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages, stream, running])

  if (!open) {
    return null
  }

  function replaceSelection(text: string) {
    if (!editor) {
      return
    }
    restoreSelection(editor)
    const { from, to, empty } = editor.state.selection
    if (empty) {
      setError("Select text to replace.")
      return
    }
    editor.chain().focus().deleteRange({ from, to }).insertContent(text).run()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setError("Could not copy to the clipboard.")
    }
  }

  function finishEdit(id: string, fromHere: boolean) {
    const text = editing?.text ?? ""
    setEditing(null)
    void resend(editor, id, { text, fromHere })
  }

  const live = running ? rewritePreviewText(stream).trim() : ""

  return (
    <aside
      aria-label="AI"
      className="flex min-h-0 w-80 shrink-0 flex-col border-l border-[#d0d0d0] bg-white dark:border-[#3b3a39] dark:bg-[#292929]"
    >
      <div className="flex items-center justify-between border-b border-[#e5e5e5] px-3 py-2">
        <h2 className="text-sm font-semibold text-[#242424] dark:text-[#f3f2f1]">AI</h2>
        <button
          type="button"
          className="rounded px-2 py-1 text-[12px] text-[#444] hover:bg-[#f3f3f3] dark:text-[#e1dfdd] dark:hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3">
        {messages.length === 0 && !thinking ? (
          <div className="space-y-2 text-[13px] leading-5 text-[#616161] dark:text-[#a19f9d]">
            <p>Ask Inkspire to do something with this document.</p>
            <p className="font-medium text-[#242424] dark:text-[#f3f2f1]">Tips for better results</p>
            <ul className="list-disc space-y-1 pl-4 text-[12px]">
              {PROMPT_TIPS.slice(0, 5).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                message.role === "user"
                  ? "max-w-[90%] rounded-md bg-[#deecf9] dark:bg-[#1f3a52] px-2.5 py-1.5 text-[13px] leading-5 whitespace-pre-wrap text-[#242424] dark:text-[#f3f2f1]"
                  : "max-w-[95%] rounded-md bg-[#f5f5f5] dark:bg-[#383838] px-2.5 py-1.5 text-[13px] leading-5 whitespace-pre-wrap text-[#242424] dark:text-[#f3f2f1]"
              }
            >
              {editing?.id === message.id ? (
                <div className="space-y-1.5">
                  <textarea
                    aria-label="Edit message"
                    rows={3}
                    value={editing.text}
                    className="w-full resize-none rounded border border-[#d0d0d0] bg-white px-2 py-1.5 text-[13px] text-[#242424] outline-none focus:border-[#0f6cbd] dark:border-[#484644] dark:bg-[#1f1f1f] dark:text-[#f3f2f1]"
                    onChange={(event) => setEditing({ ...editing, text: event.target.value, asking: false })}
                  />
                  {editing.asking ? (
                    <div className="space-y-1">
                      <p className="text-[12px]">Where should the conversation start?</p>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded border border-[#0f6cbd] px-2 py-0.5 text-[12px] text-[#0f6cbd] hover:bg-[#f3f9fd] dark:hover:bg-white/10"
                          onClick={() => finishEdit(message.id, false)}
                        >
                          Keep earlier messages
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#0f6cbd] px-2 py-0.5 text-[12px] text-[#0f6cbd] hover:bg-[#f3f9fd] dark:hover:bg-white/10"
                          onClick={() => finishEdit(message.id, true)}
                        >
                          Start from this message
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white/60 dark:hover:bg-white/10"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!editing.text.trim() || editing.text.trim() === message.text}
                      className="rounded px-1.5 py-0.5 text-[11px] text-[#0f6cbd] hover:bg-white/60 disabled:opacity-40 dark:hover:bg-white/10"
                      onClick={() =>
                        index === 0 ? finishEdit(message.id, false) : setEditing({ ...editing, asking: true })
                      }
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                message.text
              )}
              {message.review ? (
                <ReviewReply
                  id={message.id}
                  review={message.review}
                  canApply={Boolean(editor)}
                  onYes={() => suggestFixes(message.id)}
                  onNo={() => declineFixes(message.id)}
                  onApply={(index) => editor && applyFix(editor, message.id, index)}
                  onApplyAll={() => editor && applyAllFixes(editor, message.id)}
                />
              ) : null}
              {message.role === "user" && !running && editing?.id !== message.id ? (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#0f6cbd] hover:bg-white/60 dark:hover:bg-white/10"
                    aria-label="Edit message"
                    onClick={() => setEditing({ id: message.id, text: message.text, asking: false })}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
              {message.insertText && editor ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="rounded border border-[#0f6cbd] px-2 py-0.5 text-[12px] text-[#0f6cbd] hover:bg-[#f3f9fd] dark:hover:bg-white/10"
                    onClick={() => {
                      restoreSelection(editor)
                      editor.chain().focus().insertContent(message.insertText).run()
                    }}
                  >
                    Insert into document
                  </button>
                  {message.replaceable ? (
                    <button
                      type="button"
                      className="rounded border border-[#d0d0d0] px-2 py-0.5 text-[12px] text-[#444] hover:bg-[#f3f3f3] dark:text-[#e1dfdd] dark:hover:bg-white/10"
                      onClick={() => replaceSelection(message.insertText)}
                    >
                      Replace selection
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded border border-[#d0d0d0] px-2 py-0.5 text-[12px] text-[#444] hover:bg-[#f3f3f3] dark:text-[#e1dfdd] dark:hover:bg-white/10"
                    onClick={() => void copy(message.insertText)}
                  >
                    Copy
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? <AiThinking>{live}</AiThinking> : null}
        {error ? (
          <div role="alert" className="space-y-1.5 text-[12px] text-[#a4262c]">
            <p>{error}</p>
            <div className="flex gap-1.5">
              {failedId ? (
                <button
                  type="button"
                  className="rounded border border-[#a4262c] px-2 py-0.5 hover:bg-[#fdf3f4] dark:hover:bg-white/10"
                  onClick={() => void resend(editor, failedId)}
                >
                  Retry
                </button>
              ) : null}
              {errorSettings ? (
                <button
                  type="button"
                  className="rounded border border-[#a4262c] px-2 py-0.5 hover:bg-[#fdf3f4] dark:hover:bg-white/10"
                  onClick={() => setKeysOpen(true)}
                >
                  Open AI settings
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <form
        className="border-t border-[#e5e5e5] p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send(editor)
        }}
      >
        {messages.length > 0 ? (
          <p className="mb-1.5 text-[11px] leading-4 text-[#616161] dark:text-[#a19f9d]">
            <span className="font-medium">Tip:</span> {promptTip(messages.length)}
          </p>
        ) : null}
        <textarea
          ref={fieldRef}
          aria-label="Ask AI"
          rows={3}
          value={draft}
          placeholder="Ask AI to do something"
          className="w-full resize-none rounded border border-[#d0d0d0] bg-white px-2 py-1.5 text-[13px] text-[#242424] dark:border-[#484644] dark:bg-[#1f1f1f] dark:text-[#f3f2f1] dark:placeholder:text-[#8a8886] outline-none focus:border-[#0f6cbd]"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send(editor)
            }
          }}
        />
        <div className="mt-2 flex justify-end gap-2">
          {running || thinking ? (
            <button
              type="button"
              className="rounded border border-[#d0d0d0] px-3 py-1 text-[12px] dark:border-[#484644] dark:text-[#e1dfdd]"
              onClick={stop}
            >
              Stop
            </button>
          ) : null}
          <button
            type="submit"
            disabled={running || thinking || !draft.trim()}
            className="rounded bg-[#0f6cbd] px-3 py-1 text-[12px] text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  )
}

const CHOICE =
  "rounded border border-[#0f6cbd] px-2 py-0.5 text-[12px] text-[#0f6cbd] hover:bg-[#f3f9fd] disabled:opacity-40 dark:hover:bg-white/10"
const PLAIN =
  "rounded border border-[#d0d0d0] px-2 py-0.5 text-[12px] text-[#444] hover:bg-[#f3f3f3] dark:text-[#e1dfdd] dark:hover:bg-white/10"

/** A fix that only adds or takes away a space, or removes the text, said in words: an arrow between spaces shows nothing. */
function fixLabel(item: Correction) {
  if (item.suggestion === "") {
    return `Remove “${item.text}”`
  }
  if (item.suggestion === " " && !item.text.trim()) {
    return "One space"
  }
  if (item.suggestion === `${item.text} `) {
    return `Add a space after “${item.text}”`
  }
  return null
}

/**
 * The verdict on the selected text. After "is this correct?" it asks whether to suggest fixes; after "proofread"
 * (or Yes) it lists each fix with what it replaces and an Apply button that puts it in the document.
 */
function ReviewReply({
  id,
  review,
  canApply,
  onYes,
  onNo,
  onApply,
  onApplyAll,
}: {
  id: string
  review: ReviewCard
  canApply: boolean
  onYes: () => void
  onNo: () => void
  onApply: (index: number) => void
  onApplyAll: () => void
}) {
  const left = review.corrections.filter((_, index) => !review.applied.includes(index)).length
  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`review-${review.stage}`}>
      {review.stage === "status" && !review.ok ? (
        review.answered ? (
          <p className="text-[12px] text-[#616161] dark:text-[#a19f9d]">
            Should I suggest fixes? {review.answered === "yes" ? "Yes" : "No"}
          </p>
        ) : (
          <div className="space-y-1">
            <p>Should I suggest fixes?</p>
            <div className="flex gap-1.5">
              <button type="button" className={CHOICE} onClick={onYes}>
                Yes
              </button>
              <button type="button" className={PLAIN} onClick={onNo}>
                No
              </button>
            </div>
          </div>
        )
      ) : null}
      {review.stage === "fixes" && review.corrections.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Corrections">
          {review.corrections.map((item, index) => {
            const applied = review.applied.includes(index)
            const label = fixLabel(item)
            return (
              <li
                key={`${id}-${index}`}
                className="rounded border border-black/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-[#2b2b2b]"
              >
                {label ? (
                  <p className="text-[13px] leading-5 font-medium">{label}</p>
                ) : (
                  <p className="text-[13px] leading-5">
                    <s className="text-[#a4262c] dark:text-[#f1707b]">{item.text}</s>
                    <span aria-hidden> → </span>
                    <span className="font-medium text-[#0f7b0f] dark:text-[#6ccb5f]">{item.suggestion}</span>
                  </p>
                )}
                {item.reason ? (
                  <p className="text-[11px] leading-4 text-[#616161] dark:text-[#a19f9d]">{item.reason}</p>
                ) : null}
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className={CHOICE}
                    disabled={applied || !canApply}
                    aria-label={`${applied ? "Applied" : "Apply"}: ${label ?? item.suggestion}`}
                    onClick={() => onApply(index)}
                  >
                    {applied ? "Applied" : "Apply"}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {review.stage === "fixes" && review.corrections.length > 1 ? (
        <div className="flex justify-end">
          <button type="button" className={CHOICE} disabled={left === 0 || !canApply} onClick={onApplyAll}>
            {left === 0 ? "All applied" : "Apply all"}
          </button>
        </div>
      ) : null}
      {review.note ? <p className="text-[11px] leading-4 text-[#616161] dark:text-[#a19f9d]">{review.note}</p> : null}
    </div>
  )
}
