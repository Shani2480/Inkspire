import { QUICK_COMMANDS } from "@/components/quick-commands"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { ribbonCommandsOn } from "@/components/ribbon/ribbon-commands"
import {
  HIDEABLE_TABS,
  SEPARATOR,
  addCommand,
  defaults,
  moveCommand,
  parseRibbonCommandId,
  removeCommand,
  useCustomize,
  type RibbonCommandLook,
} from "@/document/customize"
import { useMemo, useState } from "react"
import { create } from "zustand"

type Page = "quick-access" | "ribbon"

/** Opens Customize the Ribbon and Quick Access Toolbar (22.5) on one of its two pages. */
export const useCustomizeDialog = create<{ open: Page | null }>(() => ({ open: null }))

export function openCustomize(page: Page = "quick-access") {
  useCustomizeDialog.setState({ open: page })
}

export function CustomizeDialogHost() {
  const open = useCustomizeDialog((state) => state.open)
  return open ? (
    <CustomizeDialog key={open} initial={open} onClose={() => useCustomizeDialog.setState({ open: null })} />
  ) : null
}

const LABELS = new Map(QUICK_COMMANDS.map((command) => [command.id, command.label]))

type Choice = { id: string; label: string; look?: RibbonCommandLook }

/**
 * Word's "Choose commands from": Popular Commands (the toolbar's own), each built tab's commands, and All Commands
 * (every one of those, by name).
 */
function commandSources(): { id: string; label: string; choices: () => Choice[] }[] {
  const popular = () => QUICK_COMMANDS.map((command) => ({ id: command.id, label: command.label }))
  const tabs = [...document.querySelectorAll<HTMLElement>("[data-ribbon-tab]")].map((panel) => ({
    id: panel.dataset.ribbonTab!,
    label: `${panel.dataset.ribbonTabLabel || panel.dataset.ribbonTab} Tab`,
    choices: (): Choice[] => ribbonCommandsOn(panel.dataset.ribbonTab!),
  }))
  return [
    { id: "popular", label: "Popular Commands", choices: popular },
    {
      id: "all",
      label: "All Commands",
      choices: () => {
        const all = [...popular(), ...tabs.flatMap((tab) => tab.choices())]
        // One of each name: a command on two tabs is the first one found.
        const seen = new Set<string>()
        return all
          .filter((choice) => !seen.has(choice.label) && seen.add(choice.label))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
    },
    ...tabs,
  ]
}

function CustomizeDialog({ initial, onClose }: { initial: Page; onClose: () => void }) {
  const stored = useCustomize()
  // Edits are kept in the dialog until OK, so Cancel leaves the toolbar and the tabs as they were.
  const [page, setPage] = useState<Page>(initial)
  const [shown, setShown] = useState(stored.qatShown)
  const [qat, setQat] = useState(stored.qat)
  const [hidden, setHidden] = useState(stored.hiddenTabs)
  const [below, setBelow] = useState(stored.qatBelow)
  const [labels, setLabels] = useState(stored.qatLabels)
  const [looks, setLooks] = useState(stored.ribbon)
  const [sources] = useState(commandSources)
  const [from, setFrom] = useState("popular")
  const choices = useMemo(
    () => [...(sources.find((source) => source.id === from)?.choices() ?? []), { id: SEPARATOR, label: "<Separator>" }],
    [sources, from],
  )
  const [left, setLeft] = useState<string>(QUICK_COMMANDS[0]!.id)
  const [right, setRight] = useState(-1)

  const labelOf = (id: string) => {
    if (id === SEPARATOR) {
      return "<Separator>"
    }
    const ribbon = parseRibbonCommandId(id)
    return ribbon ? `${ribbon.label} (${looks[id]?.tab ?? ribbon.tab})` : (LABELS.get(id) ?? id)
  }

  const add = () => {
    const choice = choices.find((item) => item.id === left)
    if (!choice) {
      return
    }
    setQat(addCommand(qat, choice.id))
    if (choice.look) {
      setLooks({ ...looks, [choice.id]: choice.look })
    }
  }

  const reset = () => {
    const base = defaults()
    setShown(base.qatShown)
    setQat(base.qat)
    setHidden(base.hiddenTabs)
    setBelow(base.qatBelow)
    setLabels(base.qatLabels)
    setLooks(base.ribbon)
    setRight(-1)
  }

  return (
    <DialogFrame
      title="Customize the Ribbon and Quick Access Toolbar"
      width={560}
      onClose={onClose}
      onSubmit={() => {
        // Only the looks of ribbon commands still on the toolbar are kept.
        const ribbon = Object.fromEntries(Object.entries(looks).filter(([id]) => qat.includes(id)))
        stored.set({ qatShown: shown, qat, hiddenTabs: hidden, qatBelow: below, qatLabels: labels, ribbon })
        onClose()
      }}
      tabs={[
        { id: "quick-access", label: "Quick Access Toolbar" },
        { id: "ribbon", label: "Customize Ribbon" },
      ]}
      tab={page}
      onTab={(id) => setPage(id as Page)}
      bodyHeight={400}
    >
      {page === "quick-access" ? (
        <div className="cz-panel">
          <label className="cz-check">
            <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} />
            Show Quick Access Toolbar
          </label>
          <label className="cz-from">
            Choose commands from:
            <select
              aria-label="Choose commands from"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setLeft("")
              }}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cz-lists">
            <div className="cz-column">
              <select size={9} aria-label="Commands" value={left} onChange={(event) => setLeft(event.target.value)}>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="cz-buttons">
              <button type="button" className="dialog-btn" disabled={!left} onClick={add}>
                Add &gt;&gt;
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={right < 0}
                onClick={() => {
                  setQat(removeCommand(qat, right))
                  setRight(-1)
                }}
              >
                &lt;&lt; Remove
              </button>
            </div>
            <div className="cz-column">
              <select
                size={9}
                aria-label="Quick Access Toolbar commands"
                value={right >= 0 ? String(right) : ""}
                onChange={(event) => setRight(Number(event.target.value))}
              >
                {qat.map((id, index) => (
                  <option key={`${id}-${index}`} value={index}>
                    {labelOf(id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cz-buttons">
              <button
                type="button"
                className="dialog-btn"
                aria-label="Move Up"
                disabled={right <= 0}
                onClick={() => {
                  setQat(moveCommand(qat, right, -1))
                  setRight(right - 1)
                }}
              >
                ▲
              </button>
              <button
                type="button"
                className="dialog-btn"
                aria-label="Move Down"
                disabled={right < 0 || right >= qat.length - 1}
                onClick={() => {
                  setQat(moveCommand(qat, right, 1))
                  setRight(right + 1)
                }}
              >
                ▼
              </button>
            </div>
          </div>
          <label className="cz-check">
            <input type="checkbox" checked={below} onChange={(event) => setBelow(event.target.checked)} />
            Show Quick Access Toolbar below the Ribbon
          </label>
          <label className="cz-check">
            <input type="checkbox" checked={labels} onChange={(event) => setLabels(event.target.checked)} />
            Always show command labels
          </label>
        </div>
      ) : (
        <div className="cz-panel">
          <span>Main tabs to show on the ribbon (Home always shows):</span>
          <ul className="cz-tabs">
            {HIDEABLE_TABS.map((tab) => (
              <li key={tab.id}>
                <label className="cz-check">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(tab.id)}
                    onChange={(event) =>
                      setHidden(event.target.checked ? hidden.filter((id) => id !== tab.id) : [...hidden, tab.id])
                    }
                  />
                  {tab.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DialogButtons submit onCancel={onClose}>
        <button type="button" className="dialog-btn" onClick={reset}>
          Reset
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}
