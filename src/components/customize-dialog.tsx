import { QUICK_COMMANDS } from "@/components/quick-commands"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { HIDEABLE_TABS, SEPARATOR, addCommand, moveCommand, removeCommand, useCustomize } from "@/document/customize"
import { useState } from "react"
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
const labelOf = (id: string) => (id === SEPARATOR ? "<Separator>" : (LABELS.get(id) ?? id))

function CustomizeDialog({ initial, onClose }: { initial: Page; onClose: () => void }) {
  const stored = useCustomize()
  // Edits are kept in the dialog until OK, so Cancel leaves the toolbar and the tabs as they were.
  const [page, setPage] = useState<Page>(initial)
  const [shown, setShown] = useState(stored.qatShown)
  const [qat, setQat] = useState(stored.qat)
  const [hidden, setHidden] = useState(stored.hiddenTabs)
  const [left, setLeft] = useState<string>(QUICK_COMMANDS[0]!.id)
  const [right, setRight] = useState(-1)
  const choices = [...QUICK_COMMANDS.map((command) => command.id), SEPARATOR]

  const reset = () => {
    setShown(true)
    setQat(["save", "undo", "redo", "open", "save-as", "print", "ai"])
    setHidden([])
    setRight(-1)
  }

  return (
    <DialogFrame
      title="Customize the Ribbon and Quick Access Toolbar"
      width={560}
      onClose={onClose}
      onSubmit={() => {
        stored.set({ qatShown: shown, qat, hiddenTabs: hidden })
        onClose()
      }}
      tabs={[
        { id: "quick-access", label: "Quick Access Toolbar" },
        { id: "ribbon", label: "Customize Ribbon" },
      ]}
      tab={page}
      onTab={(id) => setPage(id as Page)}
      bodyHeight={330}
    >
      {page === "quick-access" ? (
        <div className="cz-panel">
          <label className="cz-check">
            <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} />
            Show Quick Access Toolbar
          </label>
          <div className="cz-lists">
            <div className="cz-column">
              <span>Choose commands from: All Commands</span>
              <select size={9} aria-label="Commands" value={left} onChange={(event) => setLeft(event.target.value)}>
                {choices.map((id) => (
                  <option key={id} value={id}>
                    {labelOf(id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cz-buttons">
              <button type="button" className="dialog-btn" onClick={() => setQat(addCommand(qat, left))}>
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
              <span>Customize Quick Access Toolbar: For all documents</span>
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
