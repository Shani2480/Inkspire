import { Check, DialogButtons, DialogFrame, Keyed, Label, SpinField, trimNumber } from "@/components/word-dialog"
import { applyNumbering } from "@/editor/home-actions"
import type { ListIndent } from "@/editor/lists"
import {
  adjustListIndents,
  canContinueNumbering,
  continuedValue,
  continueNumbering,
  currentValue,
  listAt,
  numberedListAt,
  readListIndent,
  restartNumbering,
} from "@/editor/list-numbering"
import { restoreSelection } from "@/editor/selection-memory"
import { appListLevels, formatNumber, parseWordLevels } from "@/editor/word-markers"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

type Open = { editor: Editor; dialog: "value" | "indents" } | null

const useListNumberingDialogs = create<{ open: Open }>(() => ({ open: null }))

/** Word's Set Numbering Value… (the numbered list's right-click menu, or the Numbering gallery). */
export function openSetNumberingValue(editor: Editor) {
  useListNumberingDialogs.setState({ open: { editor, dialog: "value" } })
}

/** Word's Adjust List Indents… (a list's right-click menu). */
export function openAdjustListIndents(editor: Editor) {
  if (listAt(editor.state)) {
    useListNumberingDialogs.setState({ open: { editor, dialog: "indents" } })
  }
}

export function ListNumberingHost() {
  const open = useListNumberingDialogs((state) => state.open)
  const close = () => useListNumberingDialogs.setState({ open: null })
  if (!open || open.editor.isDestroyed) {
    return null
  }
  return open.dialog === "value" ? (
    <SetNumberingValueDialog editor={open.editor} onClose={close} />
  ) : (
    <AdjustListIndentsDialog editor={open.editor} onClose={close} />
  )
}

/** The caret's list's first-level marker for `value`, for the dialog's preview. */
function markerText(editor: Editor, value: number) {
  const at = numberedListAt(editor.state)
  const marker = typeof at?.node.attrs.marker === "string" ? at.node.attrs.marker : null
  const level =
    (marker ? undefined : parseWordLevels(at?.node.attrs.wordLevels)[0]) ?? appListLevels("ordered", marker)[0]
  return level.text.replace(/%1/g, formatNumber(value, level.format)).replace(/%[2-9]/g, "1")
}

/**
 * Word's Set Numbering Value: start a new list at a number from the caret's item, or continue the list before it,
 * skipping numbers with Advance value.
 */
export function SetNumberingValueDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const canContinue = canContinueNumbering(editor.state)
  const continued = continuedValue(editor.state)
  const [mode, setMode] = useState<"start" | "continue">("start")
  const [advance, setAdvance] = useState(false)
  const [value, setValue] = useState(() => String(currentValue(editor.state)))
  const lockedToPrevious = mode === "continue" && !advance
  const shown = lockedToPrevious ? String(continued ?? 1) : value
  const number = Math.max(0, Math.floor(Number(shown)) || 0)
  const pick = (next: "start" | "continue") => {
    setMode(next)
    if (next === "continue") {
      setValue(String(continued ?? 1))
    }
  }
  const apply = () => {
    restoreSelection(editor)
    if (!numberedListAt(editor.state)) {
      applyNumbering(editor, "decimal")
    }
    if (mode === "start") {
      restartNumbering(editor, number)
    } else if (!advance) {
      continueNumbering(editor)
    } else if ((numberedListAt(editor.state)?.index ?? 0) > 0) {
      // The items above the caret's are the list it continues: it goes on from them at the number given.
      restartNumbering(editor, Math.max(number, continued ?? 0))
    } else {
      continueNumbering(editor, Math.max(number, continued ?? 0))
    }
    editor.commands.focus()
    onClose()
  }
  const radio = (id: "start" | "continue", text: string, letter: string, disabled = false) => (
    <label className={`word-dialog-check${disabled ? " is-disabled" : ""}`}>
      <input type="radio" name="numbering-value" checked={mode === id} disabled={disabled} onChange={() => pick(id)} />
      <span>
        <Keyed text={text} letter={letter} />
      </span>
    </label>
  )
  return (
    <DialogFrame title="Set Numbering Value" width={300} onClose={onClose} onSubmit={apply}>
      <div className="status-dialog list-value-dialog">
        {radio("start", "Start new list", "S")}
        {radio("continue", "Continue from previous list", "C", !canContinue)}
        <div className="list-value-advance">
          <Check
            id="numbering-advance"
            text="Advance value (skip numbers)"
            letter="A"
            checked={advance}
            disabled={mode !== "continue"}
            onChange={setAdvance}
          />
        </div>
        <Label htmlFor="numbering-value" text="Set value to:" letter="V" />
        <SpinField
          id="numbering-value"
          value={shown}
          unit=""
          step={1}
          min={mode === "continue" ? (continued ?? 0) : 0}
          max={32767}
          disabled={lockedToPrevious}
          keepValue
          onChange={setValue}
        />
        <p className="list-value-preview">
          Preview: <span data-keep-light>{markerText(editor, number)}</span>
        </p>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

const CM = 72 / 2.54
const toCm = (pt: number) => trimNumber(Math.round((pt / CM) * 100) / 100)
const toPt = (cm: string) => Math.max(0, Number(cm) || 0) * CM

/**
 * Word's Adjust List Indents for the caret's list's first level: where the number starts, where the text starts,
 * what follows the number, and a tab stop. Left out: deeper levels (Define New Multilevel List sets those).
 */
export function AdjustListIndentsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [start] = useState<ListIndent>(
    () => readListIndent(editor) ?? { number: 0, text: 18, follow: "tab", tab: null },
  )
  const [number, setNumber] = useState(toCm(start.number))
  const [text, setText] = useState(toCm(start.text))
  const [follow, setFollow] = useState(start.follow)
  const [addTab, setAddTab] = useState(start.tab !== null)
  const [tab, setTab] = useState(toCm(start.tab ?? start.text))
  const apply = () => {
    restoreSelection(editor)
    adjustListIndents(editor, {
      number: toPt(number),
      text: toPt(text),
      follow,
      tab: follow === "tab" && addTab ? toPt(tab) : null,
    })
    editor.commands.focus()
    onClose()
  }
  return (
    <DialogFrame title="Adjust List Indents" width={300} onClose={onClose} onSubmit={apply}>
      <div className="status-dialog list-indents-dialog">
        <Label htmlFor="list-number-position" text="Number position:" letter="P" />
        <SpinField id="list-number-position" value={number} unit="cm" step={0.1} max={55} onChange={setNumber} />
        <Label htmlFor="list-text-indent" text="Text indent:" letter="T" />
        <SpinField id="list-text-indent" value={text} unit="cm" step={0.1} max={55} onChange={setText} />
        <Label htmlFor="list-follow" text="Follow number with:" letter="w" />
        <select
          id="list-follow"
          value={follow}
          onChange={(event) => setFollow(event.target.value as ListIndent["follow"])}
        >
          <option value="tab">Tab character</option>
          <option value="space">Space</option>
          <option value="nothing">Nothing</option>
        </select>
        <Check
          id="list-add-tab"
          text="Add tab stop at:"
          letter="b"
          checked={follow === "tab" && addTab}
          disabled={follow !== "tab"}
          onChange={setAddTab}
        />
        <SpinField
          id="list-tab-stop"
          value={tab}
          unit="cm"
          step={0.1}
          max={55}
          disabled={follow !== "tab" || !addTab}
          keepValue
          onChange={setTab}
        />
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}
