import { useAiSettings } from "@/ai/settings"
import { requestThemes, stopThemeRequest, type DocumentTheme } from "@/ai/themes"
import { RibbonGroup, RibbonTipContent } from "@/components/ribbon/ribbon-button"
import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { errorMessage } from "@/document/commands"
import { useDocumentEditor } from "@/editor/document-editor"
import { themeChoices } from "@/editor/document-theme"
import { cn } from "@/lib/utils"
import { useEditorState } from "@tiptap/react"
import { Palette, Square } from "lucide-react"
import { useRef, useState } from "react"

export function ThemesMenu() {
  const editor = useDocumentEditor()
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)
  const choices = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? themeChoices(current.state) : []),
  })
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState("")
  const requestRef = useRef("")

  function clearPreview() {
    editor?.commands.previewTheme(null)
  }

  function stop() {
    if (requestRef.current) {
      stopThemeRequest(requestRef.current)
    }
    requestRef.current = ""
    setRunning(false)
  }

  async function load() {
    if (!editor) {
      return
    }
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setRunning(true)
    setNotice("")
    editor.commands.showThemeChoices([])
    try {
      const { from, to, empty } = editor.state.selection
      const text = empty
        ? editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n")
        : editor.state.doc.textBetween(from, to, "\n")
      const result = await requestThemes(text, requestId)
      if (requestRef.current !== requestId) {
        return
      }
      if (result.blocked) {
        setNotice(result.blocked)
        return
      }
      editor.commands.showThemeChoices(result.themes)
    } catch (error) {
      if (requestRef.current === requestId) {
        setNotice(errorMessage(error))
      }
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = ""
        setRunning(false)
      }
    }
  }

  return (
    <RibbonGroup>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            stop()
            clearPreview()
            editor?.commands.showThemeChoices([])
            setNotice("")
            return
          }
          void load()
        }}
      >
        <Tooltip>
          <TooltipTrigger
            aria-label="AI Themes"
            aria-pressed={open}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "w-auto gap-1.5 rounded-[4px] px-2 text-neutral-700 hover:bg-[#F3F4F6] hover:text-neutral-900",
              open && "is-menu-open",
              !editor && "pointer-events-none opacity-50",
            )}
            render={<PopoverTrigger />}
          >
            <Palette className="size-3.5" />
            <span className="text-xs">AI Themes</span>
          </TooltipTrigger>
          <RibbonTipContent label="AI Themes" />
        </Tooltip>
        <PopoverContent
          align="start"
          sideOffset={0}
          className="ribbon-menu w-72 p-2 shadow-none ring-0 data-open:animate-none data-closed:animate-none"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              clearPreview()
            }
          }}
        >
          <div
            className="flex flex-col gap-2"
            onMouseDown={(event) => event.preventDefault()}
            onMouseLeave={clearPreview}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-neutral-800">Themes</p>
              {running ? (
                <button type="button" className="text-xs text-neutral-600 underline" onClick={stop}>
                  Stop
                </button>
              ) : null}
            </div>
            {running ? <p className="text-xs text-neutral-500">Finding themes…</p> : null}
            {!running && (choices ?? []).length === 0 && notice ? (
              <div className="space-y-2">
                <p className="text-xs text-neutral-600">{notice}</p>
                <button type="button" className="text-xs text-neutral-800 underline" onClick={() => setKeysOpen(true)}>
                  AI keys
                </button>
              </div>
            ) : null}
            {(choices ?? []).map((theme) => (
              <ThemeCard
                key={theme.name}
                theme={theme}
                onPreview={() => editor?.commands.previewTheme(theme)}
                onClear={clearPreview}
                onApply={() => {
                  if (!editor) {
                    return
                  }
                  editor.commands.previewTheme(null)
                  editor.commands.applyTheme(theme)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </RibbonGroup>
  )
}

function ThemeCard({
  theme,
  onPreview,
  onClear,
  onApply,
}: {
  theme: DocumentTheme
  onPreview: () => void
  onClear: () => void
  onApply: () => void
}) {
  return (
    <div className="rounded-md border border-black/10 p-2" onMouseEnter={onPreview} onMouseLeave={onClear}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-neutral-900">{theme.name}</p>
          <p className="text-[11px] text-neutral-500">
            {theme.headingSizes.h1}/{theme.headingSizes.h2}/{theme.headingSizes.h3} pt · {theme.paragraphSpacing}
          </p>
        </div>
        <button type="button" className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white" onClick={onApply}>
          Apply
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Square className="size-3" style={{ color: theme.textColor, fill: theme.textColor }} />
        <Square className="size-3" style={{ color: theme.accent, fill: theme.accent }} />
      </div>
    </div>
  )
}
