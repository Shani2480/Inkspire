import { useAskAi } from "@/ai/ask-ai"
import { PROMPT_TIPS } from "@/ai/prompt-tips"
import { useAiSettings } from "@/ai/settings"
import { Button } from "@/components/ui/button"
import { selectionAnchor } from "@/components/rewrite-popover"
import { askAi } from "@/editor/actions"
import { useBodyEditor } from "@/editor/document-editor"
import { Sparkles } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const WIDTH = 320
const GAP = 8

const SELECTED = ["Rewrite", "Make it shorter", "Fix spelling and grammar", "Make it more formal"]
const CARET = ["Summarize this document", "Continue writing", "Write an introduction"]

/**
 * The AI button's prompt: a small box at the caret or the selection that asks what to do. The answer then opens in
 * the Rewrite popover at the same place, where it can be inserted, put in place of the selection, or discarded.
 */
export function AskAiPrompt() {
  const editor = useBodyEditor()
  const open = useAskAi((state) => state.open)
  const from = useAskAi((state) => state.from)
  const to = useAskAi((state) => state.to)
  const hide = useAskAi((state) => state.hide)
  const running = useAiSettings((state) => state.running)
  const [text, setText] = useState("")
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const field = useRef<HTMLInputElement>(null)
  // A different tip each time the prompt opens.
  const [tip, setTip] = useState(0)
  const selected = from !== to

  useEffect(() => {
    if (open) {
      setTip((current) => (current + 1) % PROMPT_TIPS.length)
      setText("")
      field.current?.focus()
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !editor) {
      return
    }
    const update = () => setAnchor(selectionAnchor(editor, from, to))
    update()
    const scroll = document.getElementById("document-scroll")
    scroll?.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      scroll?.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [open, editor, from, to])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, hide])

  if (!open || !editor) {
    return null
  }

  function submit(request: string) {
    const value = request.trim()
    if (!value || running || !editor) {
      return
    }
    hide()
    void askAi(editor, value, { from, to })
  }

  const top = Math.min(Math.max(GAP, anchor.top), window.innerHeight - 140)
  let left = anchor.left + GAP
  if (left + WIDTH > window.innerWidth - GAP) {
    left = Math.max(GAP, anchor.left - WIDTH - GAP)
  }

  return (
    <div
      role="dialog"
      aria-label="Ask AI"
      className="app-overlay rewrite-popover fixed z-50 rounded-lg text-sm text-popover-foreground"
      style={{ top, left, width: WIDTH }}
    >
      <div className="rewrite-frame">
        <div className="rewrite-panel">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              submit(text)
            }}
          >
            <Sparkles className="size-3.5 shrink-0 text-violet-600" aria-hidden />
            <input
              ref={field}
              value={text}
              aria-label="What should AI do?"
              placeholder={selected ? "What should AI do with this text?" : "What should AI write here?"}
              className="h-7 min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 text-xs outline-none focus:border-violet-400"
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="submit" size="xs" disabled={running || !text.trim()}>
              Go
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1">
            {(selected ? SELECTED : CARET).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={running}
                className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                onClick={() => submit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            <span className="font-medium">Tip:</span> {PROMPT_TIPS[tip]}
          </p>
        </div>
      </div>
    </div>
  )
}
