import { useRewrite } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import { applyLink, askAi } from "@/editor/actions"
import { useActiveMarks } from "@/editor/use-active-marks"
import { RibbonButton } from "@/components/ribbon/ribbon-button"
import { Button } from "@/components/ui/button"
import type { Editor } from "@tiptap/core"
import { BubbleMenu } from "@tiptap/react/menus"
import { useEditorState } from "@tiptap/react"
import { Bold, Italic, Link, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

export function SelectionBubbleMenu({ editor }: { editor: Editor }) {
  const marks = useActiveMarks(editor)
  const running = useAiSettings((state) => state.running)
  const rewriteOpen = useRewrite((state) => state.open)
  const [panel, setPanel] = useState<"none" | "link" | "ai">("none")
  const [href, setHref] = useState("")
  const [prompt, setPrompt] = useState("")
  const [range, setRange] = useState<{ from: number; to: number } | null>(null)

  const collapsed = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.state.selection.empty ?? true,
  })

  useEffect(() => {
    if (collapsed || rewriteOpen) {
      setPanel("none")
    }
  }, [collapsed, rewriteOpen])

  useEffect(() => {
    if (!rewriteOpen) {
      return
    }
    editor.view.dispatch(editor.state.tr.setMeta("selectionBubbleMenu", "hide").setMeta("addToHistory", false))
  }, [rewriteOpen, editor])

  function rememberSelection() {
    const { from: start, to: end } = editor.state.selection
    setRange({ from: start, to: end })
    return { from: start, to: end }
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selectionBubbleMenu"
      updateDelay={0}
      appendTo={() => document.body}
      shouldShow={({ editor: current, from: start, to: end, state }) => {
        if (useRewrite.getState().open || !current.isEditable || start === end) {
          return false
        }
        return state.doc.textBetween(start, end).length > 0
      }}
      options={{
        strategy: "fixed",
        placement: "bottom",
        offset: 8,
        flip: true,
        scrollTarget: document.getElementById("document-scroll") ?? window,
      }}
      className="app-overlay z-30"
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-black/10 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
        {panel === "none" ? (
          <>
            <RibbonButton
              label="Bold"
              side="top"
              active={marks.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold />
            </RibbonButton>
            <RibbonButton
              label="Italic"
              side="top"
              active={marks.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic />
            </RibbonButton>
            <RibbonButton
              label="Link"
              side="top"
              active={marks.link}
              onClick={() => {
                rememberSelection()
                setHref(editor.getAttributes("link").href ?? "")
                setPanel("link")
              }}
            >
              <Link />
            </RibbonButton>
            <span className="mx-0.5 h-4 w-px bg-black/10" />
            <RibbonButton
              label="Ask AI"
              side="top"
              onClick={() => {
                rememberSelection()
                setPrompt("")
                setPanel("ai")
              }}
            >
              <Sparkles className="text-violet-600" />
            </RibbonButton>
          </>
        ) : null}

        {panel === "link" ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              applyLink(editor, href, range ?? undefined)
              setPanel("none")
            }}
          >
            <input
              autoFocus
              value={href}
              aria-label="Link address"
              placeholder="https://example.com"
              className="h-7 w-56 rounded-md border border-black/10 px-2 text-xs outline-none focus:border-neutral-400"
              onChange={(event) => setHref(event.target.value)}
            />
            <Button type="submit" size="xs">
              Apply
            </Button>
            {marks.link ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  applyLink(editor, "", range ?? undefined)
                  setPanel("none")
                }}
              >
                Remove
              </Button>
            ) : null}
          </form>
        ) : null}

        {panel === "ai" ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              const saved = range ?? rememberSelection()
              const request = prompt
              if (request.toLowerCase().includes("rewrite")) {
                setPrompt("")
                setPanel("none")
              }
              void askAi(editor, request, saved).then((inserted) => {
                if (inserted) {
                  setPrompt("")
                  setPanel("none")
                }
              })
            }}
          >
            <Sparkles className="ml-1 size-3.5 text-violet-600" />
            <input
              autoFocus
              value={prompt}
              aria-label="Ask AI"
              placeholder="Summarize or rewrite this selection"
              className="h-7 w-64 rounded-md border border-black/10 px-2 text-xs outline-none focus:border-neutral-400"
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button type="submit" size="xs" disabled={running || !prompt.trim()}>
              {running ? "Generating…" : "Apply"}
            </Button>
          </form>
        ) : null}
      </div>
    </BubbleMenu>
  )
}
