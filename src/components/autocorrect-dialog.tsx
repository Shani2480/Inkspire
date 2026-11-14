import { useMemo, useState } from "react"
import { create } from "zustand"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useAutoCorrect } from "@/editor/autocorrect"
import type { AutoCorrectOptions } from "@/editor/autocorrect-rules"

/** Whether AutoCorrect Options is open (File > Options > Proofing > AutoCorrect Options…). */
export const useAutoCorrectDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

const AUTOCORRECT_CHECKS: [keyof AutoCorrectOptions, string][] = [
  ["twoInitialCaps", "Correct TWo INitial CApitals"],
  ["capsSentence", "Capitalize first letter of sentences"],
  ["capsTableCells", "Capitalize first letter of table cells"],
  ["capsDays", "Capitalize names of days"],
]

const REPLACE_AS_YOU_TYPE: [keyof AutoCorrectOptions, string][] = [
  ["smartQuotes", "“Straight quotes” with “smart quotes”"],
  ["ordinals", "Ordinals (1st) with superscript"],
  ["dashes", "Hyphens (--) with dash (—)"],
  ["autoLinks", "Internet and network paths with hyperlinks"],
]

const APPLY_AS_YOU_TYPE: [keyof AutoCorrectOptions, string][] = [
  ["autoBullets", "Automatic bulleted lists"],
  ["autoNumbers", "Automatic numbered lists"],
]

export function AutoCorrectDialogHost() {
  const open = useAutoCorrectDialog((state) => state.open)
  return open ? <AutoCorrectDialog /> : null
}

/** Word's AutoCorrect dialog: its AutoCorrect and AutoFormat As You Type tabs. Choices apply as they are made. */
function AutoCorrectDialog() {
  const hide = useAutoCorrectDialog((state) => state.hide)
  const options = useAutoCorrect((state) => state.options)
  const entries = useAutoCorrect((state) => state.entries)
  const set = useAutoCorrect((state) => state.set)
  const addEntry = useAutoCorrect((state) => state.addEntry)
  const deleteEntry = useAutoCorrect((state) => state.deleteEntry)
  const [tab, setTab] = useState("autocorrect")
  const [replace, setReplace] = useState("")
  const [withText, setWithText] = useState("")
  const sorted = useMemo(() => [...entries].sort(([a], [b]) => a.localeCompare(b)), [entries])
  const existing = entries.get(replace.trim())

  const check = ([name, label]: [keyof AutoCorrectOptions, string]) => (
    <label key={name} className="backstage-check">
      <input type="checkbox" checked={options[name]} onChange={(event) => set({ [name]: event.target.checked })} />{" "}
      {label}
    </label>
  )

  return (
    <DialogFrame
      title="AutoCorrect"
      level={100}
      width={480}
      onClose={hide}
      tabs={[
        { id: "autocorrect", label: "AutoCorrect" },
        { id: "autoformat", label: "AutoFormat As You Type" },
      ]}
      tab={tab}
      onTab={setTab}
    >
      {tab === "autocorrect" ? (
        <div className="autocorrect-tab">
          {AUTOCORRECT_CHECKS.map(check)}
          {check(["replaceText", "Replace text as you type"])}
          <div className="autocorrect-fields">
            <label>
              <span>Replace:</span>
              <input className="dialog-input" value={replace} onChange={(event) => setReplace(event.target.value)} />
            </label>
            <label>
              <span>With:</span>
              <input className="dialog-input" value={withText} onChange={(event) => setWithText(event.target.value)} />
            </label>
          </div>
          <ul className="autocorrect-list" role="listbox" aria-label="Replace list">
            {sorted.map(([key, value]) => (
              <li
                key={key}
                role="option"
                aria-selected={key === replace.trim()}
                className={key === replace.trim() ? "is-selected" : undefined}
                onClick={() => {
                  setReplace(key)
                  setWithText(value)
                }}
              >
                <span>{key}</span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
          <div className="autocorrect-actions">
            <button
              type="button"
              className="dialog-btn"
              disabled={!replace.trim() || !withText || existing === withText}
              onClick={() => addEntry(replace, withText)}
            >
              {existing === undefined ? "Add" : "Replace"}
            </button>
            <button
              type="button"
              className="dialog-btn"
              disabled={existing === undefined}
              onClick={() => {
                deleteEntry(replace.trim())
                setReplace("")
                setWithText("")
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="autocorrect-tab">
          <h3 className="autocorrect-heading">Replace as you type</h3>
          {REPLACE_AS_YOU_TYPE.map(check)}
          <h3 className="autocorrect-heading">Apply as you type</h3>
          {APPLY_AS_YOU_TYPE.map(check)}
        </div>
      )}
      <DialogButtons ok="OK" onOk={hide} cancel="Close" onCancel={hide} />
    </DialogFrame>
  )
}
