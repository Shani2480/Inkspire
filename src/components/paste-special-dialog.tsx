import { useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { DialogButtons, DialogFrame, Keyed } from "@/components/word-dialog"
import { formatsFor, pasteClipAs, readClipboard, sourceOf, type Clip, type PasteFormat } from "@/editor/paste-special"
import { useOptionsDialog } from "@/document/options-dialog"

/** Home > Paste > Paste Special… (Ctrl+Alt+V): the clipboard's formats, and Paste in the one chosen. */

type Open = { editor: Editor; clip: Clip | null } | null

const usePasteSpecial = create<{ open: Open }>(() => ({ open: null }))

export async function openPasteSpecial(editor: Editor | null) {
  if (editor) {
    usePasteSpecial.setState({ open: { editor, clip: await readClipboard() } })
  }
}

/** Set Default Paste…: Word opens Options > Advanced at Cut, copy, and paste. */
export function openDefaultPaste() {
  useOptionsDialog.getState().openOptions("advanced")
}

export function PasteSpecialHost() {
  const open = usePasteSpecial((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <PasteSpecialDialog
      editor={open.editor}
      clip={open.clip}
      onClose={() => usePasteSpecial.setState({ open: null })}
    />
  )
}

function PasteSpecialDialog({ editor, clip, onClose }: { editor: Editor; clip: Clip | null; onClose: () => void }) {
  const formats = clip ? formatsFor(clip) : []
  const [chosen, setChosen] = useState<PasteFormat | undefined>(formats[0]?.id)
  const current = formats.find((item) => item.id === chosen)
  const accept = () => {
    onClose()
    if (clip && chosen) {
      void pasteClipAs(editor, clip, chosen)
    }
  }
  return (
    <DialogFrame title="Paste Special" width={460} onClose={onClose} onSubmit={accept}>
      <div className="paste-special">
        <p className="paste-special-source">
          Source: <span>{clip ? sourceOf(clip) : "Unknown"}</span>
        </p>
        <div className="paste-special-main">
          <div className="paste-special-modes" role="radiogroup" aria-label="Paste or paste link">
            <label>
              <input type="radio" name="paste-mode" checked readOnly />
              <span>
                <Keyed text="Paste:" letter="P" />
              </span>
            </label>
            {/* Word links to the source document's object; the clipboard here never carries a link source. */}
            <label className="is-disabled" title="The clipboard holds nothing that can be linked to its source.">
              <input type="radio" name="paste-mode" disabled />
              <span>
                <Keyed text="Paste link:" letter="L" />
              </span>
            </label>
          </div>
          <div className="paste-special-as">
            <span id="paste-special-as">
              <Keyed text="As:" letter="A" />
            </span>
            <div
              className="paste-special-list"
              role="listbox"
              aria-labelledby="paste-special-as"
              tabIndex={0}
              onKeyDown={(event) => {
                const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
                if (step && formats.length > 0) {
                  event.preventDefault()
                  const at = formats.findIndex((item) => item.id === chosen)
                  setChosen(formats[Math.min(formats.length - 1, Math.max(0, at + step))]!.id)
                }
              }}
            >
              {formats.map((item) => (
                <div
                  key={item.label}
                  role="option"
                  aria-selected={item.id === chosen}
                  className={item.id === chosen ? "is-selected" : undefined}
                  onClick={() => setChosen(item.id)}
                  onDoubleClick={() => {
                    setChosen(item.id)
                    onClose()
                    if (clip) {
                      void pasteClipAs(editor, clip, item.id)
                    }
                  }}
                >
                  {item.label}
                </div>
              ))}
              {formats.length === 0 ? (
                <p className="paste-special-empty">The clipboard is empty, or Inkspire can't read it.</p>
              ) : null}
            </div>
          </div>
        </div>
        <fieldset className="paste-special-result">
          <legend>Result</legend>
          <p>{current?.result ?? "Nothing to paste."}</p>
        </fieldset>
      </div>
      <DialogButtons submit okDisabled={!current} onCancel={onClose} />
    </DialogFrame>
  )
}
