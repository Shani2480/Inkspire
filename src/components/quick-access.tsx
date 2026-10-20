import { useAiBusy } from "@/ai/activity"
import { useAiChat } from "@/ai/chat"
import { AiSpark } from "@/components/ai-spark"
import { useBackstage } from "@/document/backstage"
import { useDocumentEditor } from "@/editor/document-editor"
import { RibbonTipContent } from "@/components/ribbon/ribbon-button"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditorState } from "@tiptap/react"
import { ChevronDown } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { QUICK_COMMANDS } from "@/components/quick-commands"
import { openCustomize } from "@/components/customize-dialog"
import { SEPARATOR, addCommand, useCustomize } from "@/document/customize"

export function QuickAccessToolbar() {
  const editor = useDocumentEditor()
  const aiOpen = useAiChat((state) => state.open)
  const aiBusy = useAiBusy()
  const shown = useCustomize((state) => state.qatShown)
  const arrangement = useCustomize((state) => state.qat)
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  })

  if (!shown) {
    return null
  }
  return (
    <div role="toolbar" aria-label="Quick access" className="flex items-center gap-0.5">
      {arrangement.map((id, index) => {
        if (id === SEPARATOR) {
          return <span key={`sep-${index}`} aria-hidden className="mx-0.5 h-4 w-px bg-white/30" />
        }
        const command = QUICK_COMMANDS.find((item) => item.id === id)
        if (!command) {
          return null
        }
        return (
          <QuickButton
            key={id}
            label={command.label}
            disabled={
              command.enabled ? !command.enabled({ editor, ...(history ?? { undo: false, redo: false }) }) : false
            }
            pressed={id === "ai" && aiOpen}
            busy={id === "ai" && aiBusy}
            onClick={() => command.run(editor)}
          >
            {id === "ai" ? <AiSpark busy={aiBusy} /> : command.icon}
          </QuickButton>
        )
      })}
      <CustomizeMenu />
    </div>
  )
}

/** The small arrow at the toolbar's end: toggle commands on and off, or open the full dialog. */
function CustomizeMenu() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const arrangement = useCustomize((state) => state.qat)
  const set = useCustomize((state) => state.set)
  return (
    <div ref={anchor} className="relative">
      <QuickButton label="Customize Quick Access Toolbar" onClick={() => setOpen(!open)}>
        <ChevronDown />
      </QuickButton>
      {open
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[90]" onMouseDown={() => setOpen(false)} />
              <div
                role="menu"
                aria-label="Customize Quick Access Toolbar"
                style={{
                  top: (anchor.current?.getBoundingClientRect().bottom ?? 0) + 2,
                  left: anchor.current?.getBoundingClientRect().left ?? 0,
                }}
                className="quick-menu fixed z-[91] flex w-56 flex-col rounded-md border border-[var(--app-popover-border,#e1dfdd)] bg-[var(--app-popover-bg,#fff)] py-1 text-[12px] text-[var(--app-ribbon-text)] shadow-lg"
              >
                <div className="px-3 py-1 font-semibold">Customize Quick Access Toolbar</div>
                {QUICK_COMMANDS.map((command) => {
                  const on = arrangement.includes(command.id)
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      className="flex items-center gap-2 px-3 py-1 text-left hover:bg-[var(--app-hover)]"
                      onClick={() =>
                        set({
                          qat: on ? arrangement.filter((id) => id !== command.id) : addCommand(arrangement, command.id),
                        })
                      }
                    >
                      <span className="w-3">{on ? "✓" : ""}</span>
                      {command.label}
                    </button>
                  )
                })}
                <div className="my-1 border-t border-black/10" />
                <button
                  type="button"
                  role="menuitem"
                  className="px-3 py-1 text-left hover:bg-[var(--app-hover)]"
                  onClick={() => {
                    setOpen(false)
                    openCustomize("quick-access")
                  }}
                >
                  More Commands…
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}

export function FileMenu({
  className = "inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium text-white hover:bg-white/10",
}: {
  className?: string
}) {
  const open = useBackstage((state) => state.open)
  const openBackstage = useBackstage((state) => state.openBackstage)

  return (
    <button
      type="button"
      aria-label="File"
      aria-pressed={open || undefined}
      className={className}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => openBackstage("home")}
    >
      File
    </button>
  )
}

function QuickButton({
  label,
  onClick,
  disabled = false,
  pressed = false,
  busy = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  /** The AI is working; the button says so to assistive tech while its icon animates. */
  busy?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={pressed || undefined}
        aria-busy={busy || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className="inline-flex size-7 items-center justify-center rounded-md text-white hover:bg-white/10 aria-disabled:opacity-40 aria-pressed:bg-white/15 [&_svg]:size-3.5"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) {
            onClick()
          }
        }}
      >
        {children}
      </TooltipTrigger>
      <RibbonTipContent label={label} />
    </Tooltip>
  )
}
