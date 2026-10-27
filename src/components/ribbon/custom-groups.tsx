import { useDocumentEditor } from "@/editor/document-editor"
import { QUICK_COMMANDS } from "@/components/quick-commands"
import { useRibbonCommandsUsable } from "@/components/quick-access"
import { RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { cleanIcon, runRibbonCommand } from "@/components/ribbon/ribbon-commands"
import { parseRibbonCommandId, useCustomize } from "@/document/customize"
import type { CustomGroup } from "@/document/ribbon-layout"
import { useViewStore } from "@/document/view"
import { useEditorState } from "@tiptap/react"
import { useLayoutEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

/**
 * The groups the user made in Customize Ribbon (22.5), drawn on the ribbon. A ribbon command in one presses the
 * ribbon's own button, as the Quick Access Toolbar does, so it does what the ribbon does; the toolbar's commands
 * run as they do there. Their `data-group` starts "custom:", which keeps them out of the lists of the ribbon's own
 * commands and groups.
 */
export function CustomGroups({ groups }: { groups: CustomGroup[] }) {
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
  return groups.map((group) => (
    <RibbonGroup key={group.id} name={`custom:${group.id}`} label={group.label} className="shrink-0">
      {group.commands.length ? null : <span className="ribbon-custom-empty" aria-hidden />}
      {group.commands.map((id) => {
        const ribbon = parseRibbonCommandId(id)
        if (ribbon) {
          return (
            <RibbonCommand
              key={id}
              label={ribbon.label}
              description={`From the ${looks[id]?.tab ?? ribbon.tab} tab.`}
              disabled={!usable.has(id)}
              onClick={() => runRibbonCommand(id)}
            >
              <CommandIcon markup={looks[id]?.icon ?? ""} label={ribbon.label} />
            </RibbonCommand>
          )
        }
        const command = QUICK_COMMANDS.find((item) => item.id === id)
        if (!command) {
          return null
        }
        return (
          <RibbonCommand
            key={id}
            label={command.label}
            disabled={
              command.enabled ? !command.enabled({ editor, ...(history ?? { undo: false, redo: false }) }) : false
            }
            onClick={() => command.run(editor)}
          >
            <span className="ribbon-custom-icon">{command.icon}</span>
          </RibbonCommand>
        )
      })}
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

const NONE: CustomGroup[] = []

/**
 * The user's groups on a main tab, after the tab's own: put at the end of the tab's toolbar, found again when the
 * ribbon's layout (classic or single line) draws the tab anew.
 */
export function MainTabGroups({ tab }: { tab: string }) {
  const groups = useCustomize((state) => state.customGroups[tab] ?? NONE)
  const layout = useViewStore((state) => state.ribbonLayout)
  const [target, setTarget] = useState<Element | null>(null)
  useLayoutEffect(() => {
    const panel = document.querySelector(`[data-ribbon-tab="${CSS.escape(tab)}"]`)
    setTarget(groups.length ? (panel?.querySelector("[role='toolbar']") ?? null) : null)
  }, [tab, groups.length, layout])
  return target && groups.length ? createPortal(<CustomGroups groups={groups} />, target) : null
}
