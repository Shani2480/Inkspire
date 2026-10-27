import { useDocumentEditor } from "@/editor/document-editor"
import { QUICK_COMMANDS } from "@/components/quick-commands"
import { useRibbonCommandsUsable } from "@/components/quick-access"
import { RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { cleanIcon, runRibbonCommand } from "@/components/ribbon/ribbon-commands"
import type { LineGroup } from "@/components/ribbon/single-line"
import { parseRibbonCommandId, useCustomize } from "@/document/customize"
import { OWN, groupKeys, type CustomGroup } from "@/document/ribbon-layout"
import { useViewStore } from "@/document/view"
import { useEditorState } from "@tiptap/react"
import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** The tab a part of the ribbon is drawn on, so a tab's single line can add the user's groups to it. */
export const RibbonTabContext = createContext("")

/** A command in a group the user made, ready to draw on either ribbon. */
type CustomCommand = {
  id: string
  label: string
  description?: string
  icon: ReactNode
  /** The icon at the single line's 16 px. */
  lineIcon: ReactNode
  disabled: boolean
  run: () => void
}

/** What each of the user's groups holds, as commands; a toolbar command no longer known is left out. */
function useCustomCommands(groups: CustomGroup[]) {
  const editor = useDocumentEditor()
  const looks = useCustomize((state) => state.ribbon)
  const ids = useMemo(() => groups.flatMap((group) => group.commands), [groups])
  const usable = useRibbonCommandsUsable(ids)
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  })
  return groups.map((group) => ({
    group,
    commands: group.commands.flatMap((id): CustomCommand[] => {
      const ribbon = parseRibbonCommandId(id)
      if (ribbon) {
        const icon = <CommandIcon markup={looks[id]?.icon ?? ""} label={ribbon.label} />
        return [
          {
            id,
            label: ribbon.label,
            description: `From the ${looks[id]?.tab ?? ribbon.tab} tab.`,
            icon,
            lineIcon: <span className="line-custom-icon">{icon}</span>,
            disabled: !usable.has(id),
            run: () => runRibbonCommand(id),
          },
        ]
      }
      const command = QUICK_COMMANDS.find((item) => item.id === id)
      if (!command) {
        return []
      }
      return [
        {
          id,
          label: command.label,
          icon: <span className="ribbon-custom-icon">{command.icon}</span>,
          lineIcon: <span className="line-custom-icon">{command.icon}</span>,
          disabled: command.enabled
            ? !command.enabled({ editor, ...(history ?? { undo: false, redo: false }) })
            : false,
          run: () => command.run(editor),
        },
      ]
    }),
  }))
}

/** The user's groups as groups of the single line ribbon, each command a button with its icon. */
export function useCustomLineGroups(groups: CustomGroup[]): LineGroup[] {
  return useCustomCommands(groups).map(({ group, commands }) => ({
    id: `custom:${group.id}`,
    commands: commands.map((command) => ({
      id: `custom:${group.id}:${command.id}`,
      label: command.label,
      description: command.description,
      icon: command.lineIcon,
      // The user put them there: they stay on the row longer than the tab's least used commands.
      priority: 1,
      disabled: command.disabled,
      onClick: command.run,
    })),
  }))
}

const NO_NAMES: string[] = []

/**
 * A main tab's single line as the user arranged it: its own groups less those removed, and the user's groups after
 * them (the single line has groups of its own, so only the classic ribbon follows the order the user gave).
 */
export function useTabLineGroups(groups: LineGroup[]): LineGroup[] {
  const tab = useContext(RibbonTabContext)
  const custom = useCustomize((state) => (tab ? state.customGroups[tab] : undefined) ?? NONE)
  const hidden = useCustomize((state) => (tab ? state.hiddenGroups[tab] : undefined) ?? NO_NAMES)
  const extra = useCustomLineGroups(custom)
  return [...groups.filter((group) => !hidden.includes(group.id)), ...extra]
}

const NONE: CustomGroup[] = []

/**
 * The groups the user made in Customize Ribbon (22.5), drawn on the ribbon. A ribbon command in one presses the
 * ribbon's own button, as the Quick Access Toolbar does, so it does what the ribbon does; the toolbar's commands
 * run as they do there. Their `data-group` starts "custom:", which keeps them out of the lists of the ribbon's own
 * commands and groups.
 */
export function CustomGroups({ groups }: { groups: CustomGroup[] }) {
  return useCustomCommands(groups).map(({ group, commands }) => (
    <RibbonGroup key={group.id} name={`custom:${group.id}`} label={group.label} className="shrink-0">
      {commands.length ? null : <span className="ribbon-custom-empty" aria-hidden />}
      {commands.map((command) => (
        <RibbonCommand
          key={command.id}
          label={command.label}
          description={command.description}
          disabled={command.disabled}
          onClick={command.run}
        >
          {command.icon}
        </RibbonCommand>
      ))}
    </RibbonGroup>
  ))
}

/** A ribbon command's icon as it was on the ribbon, or its first letter when it had none. */
function CommandIcon({ markup, label }: { markup: string; label: string }) {
  const clean = useMemo(() => cleanIcon(markup), [markup])
  return clean ? (
    <span className="ribbon-custom-icon" dangerouslySetInnerHTML={{ __html: clean }} />
  ) : (
    <span className="ribbon-custom-icon text-[13px] font-semibold">{label.charAt(0)}</span>
  )
}

/**
 * The groups each main tab draws itself on the classic ribbon, by name (`data-group`) and caption, as the last
 * classic drawing of the tab had them: what Customize Ribbon lists under the tab.
 */
export const tabGroups = new Map<string, { name: string; label: string }[]>()

/**
 * The user's groups on a main tab of the classic ribbon: put in the tab's toolbar, found again when the tab is drawn
 * anew. The tab's groups then take the order the user gave them, and its own groups the user removed are hidden.
 * (The single line adds the user's groups itself: `useTabLineGroups`.)
 */
export function MainTabGroups({ tab }: { tab: string }) {
  const groups = useCustomize((state) => state.customGroups[tab] ?? NONE)
  const hidden = useCustomize((state) => state.hiddenGroups[tab] ?? NO_NAMES)
  const order = useCustomize((state) => state.groupOrder[tab] ?? NO_NAMES)
  const layout = useViewStore((state) => state.ribbonLayout)
  const [target, setTarget] = useState<Element | null>(null)
  const classic = layout !== "single"
  useLayoutEffect(() => {
    const panel = document.querySelector(`[data-ribbon-tab="${CSS.escape(tab)}"]`)
    const toolbar = panel?.querySelector<HTMLElement>("[role='toolbar']") ?? null
    setTarget(classic && groups.length ? toolbar : null)
    if (!toolbar || !classic) {
      return
    }
    const arrange = () => {
      const children = [...toolbar.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
      tabGroups.set(
        tab,
        children.flatMap((child) => {
          const name = child.dataset.group ?? ""
          const label =
            child.querySelector(":scope > .ribbon-caption > span")?.textContent?.trim() ||
            child.querySelector(".ribbon-collapsed")?.getAttribute("aria-label") ||
            name
          return name && !name.startsWith("custom:") ? [{ name, label }] : []
        }),
      )
      const own = [
        ...new Set(
          children.map((child) => child.dataset.group ?? "").filter((name) => name && !name.startsWith("custom:")),
        ),
      ]
      const keys = order.length
        ? groupKeys(
            {
              customTabs: [],
              customGroups: { [tab]: groups },
              tabNames: {},
              hiddenGroups: {},
              groupOrder: { [tab]: order },
            },
            tab,
            own,
          )
        : []
      for (const child of children) {
        const name = child.dataset.group ?? ""
        const key = name.startsWith("custom:") ? name.slice("custom:".length) : OWN + name
        const place = keys.indexOf(key)
        child.style.order = place >= 0 ? String(place) : ""
        child.style.display = name && !name.startsWith("custom:") && hidden.includes(name) ? "none" : ""
      }
    }
    arrange()
    // A tab draws a group anew as it collapses and expands with the window's width.
    const watch = new MutationObserver(arrange)
    watch.observe(toolbar, { childList: true })
    return () => watch.disconnect()
  }, [tab, groups, hidden, order, classic])
  return target && groups.length ? createPortal(<CustomGroups groups={groups} />, target) : null
}
