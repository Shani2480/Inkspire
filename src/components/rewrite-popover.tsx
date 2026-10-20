import { rewritePreviewText, useRewrite, type DraftKind } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import { Button } from "@/components/ui/button"
import { applyDraft } from "@/editor/actions"
import { useBodyEditor } from "@/editor/document-editor"
import type { Editor } from "@tiptap/core"
import { AiSpark } from "@/components/ai-spark"
import { useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from "react"

const TEXT_MIN = 20
const TEXT_MAX = 220
const POPOVER_WIDTH = 288
const VIEWPORT_GAP = 8

export function RewritePopover() {
  const editor = useBodyEditor()
  const open = useRewrite((state) => state.open)
  const kind = useRewrite((state) => state.kind)
  const from = useRewrite((state) => state.from)
  const to = useRewrite((state) => state.to)
  const notice = useRewrite((state) => state.notice)
  const closeSession = useRewrite((state) => state.closeSession)
  const stopSession = useRewrite((state) => state.stopSession)
  const running = useAiSettings((state) => state.running)
  const stream = useAiSettings((state) => state.stream)
  const settledHtml = useAiSettings((state) => state.settledHtml)
  const source = !running && settledHtml ? settledHtml : stream
  const preview = rewritePreviewText(source).trim()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followTail = useRef(true)
  const programmatic = useRef(false)
  const lastScrollTop = useRef(0)
  const [textHeight, setTextHeight] = useState(TEXT_MIN)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) {
      return
    }
    followTail.current = true
    setTextHeight(TEXT_MIN)

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSession()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, closeSession])

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

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !open) {
      return
    }
    const needed = content.scrollHeight
    setTextHeight(Math.min(Math.max(needed, TEXT_MIN), TEXT_MAX))
  }, [open, preview])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !open || !running || !followTail.current) {
      return
    }
    programmatic.current = true
    scroller.scrollTop = scroller.scrollHeight
    lastScrollTop.current = scroller.scrollTop
    programmatic.current = false
  }, [open, preview, textHeight, running])

  if (!open || !editor) {
    return null
  }

  const title = draftTitle(kind)
  const top = Math.min(anchor.top, window.innerHeight - textHeight - 108)
  let left = anchor.left + VIEWPORT_GAP
  if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_GAP) {
    left = Math.max(VIEWPORT_GAP, anchor.left - POPOVER_WIDTH - VIEWPORT_GAP)
  }

  function onScroll() {
    const scroller = scrollerRef.current
    if (!scroller || !running) {
      return
    }
    const next = scroller.scrollTop
    const previous = lastScrollTop.current
    lastScrollTop.current = next
    if (programmatic.current) {
      return
    }
    if (atBottom(scroller)) {
      followTail.current = true
      return
    }
    if (next < previous - 1) {
      followTail.current = false
    }
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!running) {
      return
    }
    if (event.deltaY < 0) {
      followTail.current = false
    }
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-busy={running}
      className={`app-overlay rewrite-popover fixed z-50 w-72 rounded-lg text-sm text-popover-foreground ${running ? "is-running" : ""}`}
      style={{ top: Math.max(VIEWPORT_GAP, top), left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="rewrite-frame">
        <div className="rewrite-border" aria-hidden />
        <div className="rewrite-panel">
          <div className="mb-2 flex items-center gap-1.5">
            <AiSpark busy={running} className="size-3.5 text-violet-600" />
            <span className="text-xs font-medium">{running ? `${title}…` : title}</span>
          </div>
          <div
            ref={scrollerRef}
            className="rewrite-stream overflow-x-hidden overflow-y-auto"
            style={{ height: textHeight }}
            onScroll={onScroll}
            onWheel={onWheel}
          >
            <div ref={contentRef} className="whitespace-pre-wrap">
              {preview ? <RevealedText text={preview} /> : running ? `${title}…` : ""}
            </div>
          </div>
          {notice ? <p className="mt-2 text-xs text-red-700">{notice}</p> : null}
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="xs" onClick={() => closeSession()}>
              Discard
            </Button>
            {running ? (
              <Button type="button" variant="outline" size="xs" onClick={() => stopSession()}>
                Stop
              </Button>
            ) : null}
            {kind === "rewrite" ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={running || !preview.trim()}
                onClick={() => applyDraft(editor, "after")}
              >
                Insert below
              </Button>
            ) : null}
            <Button type="button" size="xs" disabled={running || !preview.trim()} onClick={() => applyDraft(editor)}>
              {kind === "rewrite" ? "Replace" : "Insert"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function draftTitle(kind: DraftKind) {
  if (kind === "summary") {
    return "Summary"
  }
  if (kind === "draft") {
    return "Draft"
  }
  return "Rewrite"
}

function RevealedText({ text }: { text: string }) {
  const revealed = useRef<{ text: string; parts: { id: number; value: string }[] }>({
    text: "",
    parts: [],
  })
  if (text !== revealed.current.text) {
    const previous = revealed.current.text
    if (text.startsWith(previous)) {
      const addition = text.slice(previous.length)
      if (addition) {
        revealed.current.parts.push({ id: revealed.current.parts.length, value: addition })
      }
    } else {
      revealed.current.parts = [{ id: 0, value: text }]
    }
    revealed.current.text = text
  }

  return revealed.current.parts.map((part) => (
    <span key={part.id} className="rewrite-reveal">
      {part.value}
    </span>
  ))
}

function atBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 2
}

export function selectionAnchor(editor: Editor, from: number, to: number) {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  try {
    const fromDOM = editor.view.domAtPos(start)
    const toDOM = editor.view.domAtPos(end)
    const range = document.createRange()
    range.setStart(fromDOM.node, fromDOM.offset)
    range.setEnd(toDOM.node, toDOM.offset)
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0)
    if (rects.length > 0) {
      return {
        top: Math.min(...rects.map((rect) => rect.top)),
        left: Math.max(...rects.map((rect) => rect.right)),
      }
    }
  } catch {
    // Fall through to the caret when the selection has no client rects yet.
  }

  const caret = editor.view.coordsAtPos(start)
  return { top: caret.top, left: caret.right }
}
