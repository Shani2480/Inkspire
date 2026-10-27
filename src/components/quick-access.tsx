import { useAiBusy } from "@/ai/activity"
import { useAiChat } from "@/ai/chat"
import { AiSpark } from "@/components/ai-spark"
import { useBackstage } from "@/document/backstage"
import { useDocumentEditor } from "@/editor/document-editor"
import { RibbonTipContent } from "@/components/ribbon/ribbon-button"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditorState } from "@tiptap/react"
import { ChevronDown } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { QUICK_COMMANDS } from "@/components/quick-commands"
import { openCustomize } from "@/components/customize-dialog"
import { SEPARATOR, addCommand, parseRibbonCommandId, useCustomize } from "@/document/customize"
import { cleanIcon, ribbonCommandAt, ribbonCommandEnabled, runRibbonCommand } from "@/components/ribbon/ribbon-commands"
import { create } from "zustand"

/**
 * The Quick Access Toolbar: in the title bar, or under the ribbon when Toolbar Position says so (`placement` is where
 * this one is drawn; the other draws nothing).
 */
export function QuickAccessToolbar({ placement = "title" }: { placement?: "title" | "below" }) {
  const editor = useDocumentEditor()
  const aiOpen = useAiChat((state) => state.open)
  const aiBusy = useAiBusy()
  const shown = useCustomize((state) => state.qatShown)
  const below = useCustomize((state) => state.qatBelow)
  const labels = useCustomize((state) => state.qatLabels)
  const arrangement = useCustomize((state) => state.qat)
  const looks = useCustomize((state) => state.ribbon)
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  })
  const usable = useRibbonCommandsUsable(arrangement)

  if (!shown || below !== (placement === "below")) {
    return null
  }
  const tone = placement === "below" ? "below" : "title"
  const bar = (
    <div
      role="toolbar"
      aria-label="Quick access"
      className={`flex items-center gap-0.5${placement === "below" ? " quick-access-below" : ""}`}
    >
      {arrangement.map((id, index) => {
        if (id === SEPARATOR) {
          return (
            <span
              key={`sep-${index}`}
              aria-hidden
              className={`mx-0.5 h-4 w-px ${tone === "title" ? "bg-white/30" : "bg-[var(--app-ribbon-border)]"}`}
            />
          )
        }
        const look = looks[id]
        if (look) {
          const label = parseRibbonCommandId(id)?.label ?? id
          return (
            <QuickButton
              key={id}
              id={id}
              label={label}
              tip={`${label} (${look.tab})`}
              tone={tone}
              showLabel={labels}
              disabled={!usable.has(id)}
              onClick={() => runRibbonCommand(id)}
            >
              <RibbonIcon markup={look.icon} label={label} />
            </QuickButton>
          )
        }
        const command = QUICK_COMMANDS.find((item) => item.id === id)
        if (!command) {
          return null
        }
        return (
          <QuickButton
            key={id}
            id={id}
            label={command.label}
            tone={tone}
            showLabel={labels}
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
      <CustomizeMenu tone={tone} />
    </div>
  )
  return placement === "below" ? (
    <div className="quick-access-strip flex h-8 shrink-0 items-center px-1">{bar}</div>
  ) : (
    bar
  )
}

/**
 * Which of the toolbar's ribbon commands can be used now. Looked at after each change to the document or selection
 * (a tool tab comes and goes with its object) once the ribbon has drawn it.
 */
function useRibbonCommandsUsable(arrangement: string[]) {
  const editor = useDocumentEditor()
  const ribbonIds = arrangement.filter((id) => parseRibbonCommandId(id))
  const key = ribbonIds.join("\n")
  const [usable, setUsable] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!key) {
      return
    }
    const ids = key.split("\n")
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = new Set(ids.filter(ribbonCommandEnabled))
        setUsable((current) =>
          current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
        )
      })
    }
    check()
    editor?.on("transaction", check)
    // The ribbon builds its other tabs once the app is idle.
    const later = window.setTimeout(check, 3500)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(later)
      editor?.off("transaction", check)
    }
  }, [editor, key])
  return usable
}

/** A ribbon command's icon as it was on the ribbon, or its first letter when it had none. */
function RibbonIcon({ markup, label }: { markup: string; label: string }) {
  const clean = useMemo(() => cleanIcon(markup), [markup])
  return clean ? (
    <span className="quick-ribbon-icon inline-flex" dangerouslySetInnerHTML={{ __html: clean }} />
  ) : (
    <span className="text-[11px] font-semibold">{label.charAt(0)}</span>
  )
}

/** The small arrow at the toolbar's end: toggle commands on and off, or open the full dialog. */
function CustomizeMenu({ tone }: { tone: "title" | "below" }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const arrangement = useCustomize((state) => state.qat)
  const below = useCustomize((state) => state.qatBelow)
  const set = useCustomize((state) => state.set)
  return (
    <div ref={anchor} className="relative">
      <QuickButton label="Customize Quick Access Toolbar" tone={tone} onClick={() => setOpen(!open)}>
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
                <button
                  type="button"
                  role="menuitem"
                  className="px-3 py-1 text-left hover:bg-[var(--app-hover)]"
                  onClick={() => {
                    setOpen(false)
                    set({ qatBelow: !below })
                  }}
                >
                  {below ? "Show Above the Ribbon" : "Show Below the Ribbon"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="px-3 py-1 text-left hover:bg-[var(--app-hover)]"
                  onClick={() => {
                    setOpen(false)
                    set({ qatShown: false })
                  }}
                >
                  Hide Quick Access Toolbar
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
  id,
  label,
  tip,
  onClick,
  tone = "title",
  showLabel = false,
  disabled = false,
  pressed = false,
  busy = false,
  children,
}: {
  /** The command's id on the toolbar; the arrow at the end has none. */
  id?: string
  label: string
  /** The ScreenTip, when it says more than the label (a ribbon command names its tab). */
  tip?: string
  onClick: () => void
  tone?: "title" | "below"
  /** Always show command labels. */
  showLabel?: boolean
  disabled?: boolean
  pressed?: boolean
  /** The AI is working; the button says so to assistive tech while its icon animates. */
  busy?: boolean
  children: ReactNode
}) {
  const colours =
    tone === "title"
      ? "text-white hover:bg-white/10 aria-pressed:bg-white/15"
      : "text-[var(--app-ribbon-text)] hover:bg-[var(--app-hover)] aria-pressed:bg-[var(--app-hover)]"
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={pressed || undefined}
        aria-busy={busy || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={`inline-flex h-7 items-center justify-center gap-1 rounded-md ${showLabel && id ? "px-1.5 text-[12px]" : "w-7"} ${colours} aria-disabled:opacity-40 [&_svg]:size-3.5`}
        onMouseDown={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          event.preventDefault()
          openToolbarMenu(id ?? null, event.clientX, event.clientY)
        }}
        onClick={() => {
          if (!disabled) {
            onClick()
          }
        }}
      >
        {children}
        {showLabel && id ? <span className="whitespace-nowrap">{label}</span> : null}
      </TooltipTrigger>
      <RibbonTipContent label={tip ?? label} />
    </Tooltip>
  )
}

type MenuItem = { label: string; run: () => void; disabled?: boolean } | "-"

const useCommandMenu = create<{ at: { x: number; y: number } | null; items: MenuItem[] }>(() => ({
  at: null,
  items: [],
}))

/** The rows Word puts under any right-click on the ribbon or the toolbar. */
function toolbarRows(): MenuItem[] {
  const { qatShown, qatBelow, set } = useCustomize.getState()
  return [
    { label: "Customize Quick Access Toolbar…", run: () => openCustomize("quick-access") },
    qatShown
      ? {
          label: qatBelow ? "Show Quick Access Toolbar Above the Ribbon" : "Show Quick Access Toolbar Below the Ribbon",
          run: () => set({ qatBelow: !qatBelow }),
        }
      : { label: "Show Quick Access Toolbar", run: () => set({ qatShown: true }) },
    { label: "Customize the Ribbon…", run: () => openCustomize("ribbon") },
  ]
}

/** Right-click on a toolbar button: take it off, or arrange the toolbar. */
function openToolbarMenu(id: string | null, x: number, y: number) {
  const { qat, ribbon, set } = useCustomize.getState()
  const remove: MenuItem[] = id
    ? [
        {
          label: "Remove from Quick Access Toolbar",
          run: () => {
            const { [id]: _dropped, ...rest } = ribbon
            set({ qat: qat.filter((item) => item !== id), ribbon: rest })
          },
        },
        "-",
      ]
    : []
  useCommandMenu.setState({ at: { x, y }, items: [...remove, ...toolbarRows()] })
}

/**
 * Right-click on the ribbon: Add to Quick Access Toolbar for the command under the pointer (or Remove, when it is
 * there already), then the toolbar and ribbon rows; anywhere else on the ribbon, just those rows, as in Word.
 */
export function openRibbonCommandMenu(target: EventTarget | null, x: number, y: number) {
  const command = ribbonCommandAt(target)
  const { qat, ribbon, set } = useCustomize.getState()
  const add: MenuItem[] = command
    ? [
        qat.includes(command.id)
          ? {
              label: "Remove from Quick Access Toolbar",
              run: () => {
                const { [command.id]: _dropped, ...rest } = ribbon
                set({ qat: qat.filter((item) => item !== command.id), ribbon: rest })
              },
            }
          : {
              label: "Add to Quick Access Toolbar",
              run: () =>
                set({
                  qat: addCommand(qat, command.id),
                  ribbon: { ...ribbon, [command.id]: command.look },
                  qatShown: true,
                }),
            },
        "-",
      ]
    : []
  useCommandMenu.setState({ at: { x, y }, items: [...add, ...toolbarRows()] })
  return true
}

/** The right-click menu of the ribbon and the toolbar; drawn once, under the ribbon. */
export function CommandMenuHost() {
  const at = useCommandMenu((state) => state.at)
  const items = useCommandMenu((state) => state.items)
  const close = () => useCommandMenu.setState({ at: null })
  useEffect(() => {
    if (!at) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [at])
  if (!at) {
    return null
  }
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90]"
        onMouseDown={close}
        onContextMenu={(event) => {
          event.preventDefault()
          close()
        }}
      />
      <div
        role="menu"
        aria-label="Quick Access Toolbar"
        style={{ top: Math.min(at.y, window.innerHeight - 140), left: Math.min(at.x, window.innerWidth - 300) }}
        className="quick-menu fixed z-[91] flex min-w-56 flex-col rounded-md border border-[var(--app-popover-border,#e1dfdd)] bg-[var(--app-popover-bg,#fff)] py-1 text-[12px] text-[var(--app-ribbon-text)] shadow-lg"
      >
        {items.map((item, index) =>
          item === "-" ? (
            <div key={`sep-${index}`} className="my-1 border-t border-black/10" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="px-3 py-1 text-left hover:bg-[var(--app-hover)] disabled:opacity-40"
              onClick={() => {
                close()
                item.run()
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  )
}
