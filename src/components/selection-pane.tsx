import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  listObjects,
  moveObjectInStack,
  renameObject,
  setAllObjectsHidden,
  toggleObjectHidden,
  useObjectSelection,
  type PaneObject,
} from "@/editor/object-group"
import { useEditorState } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { useEffect, useRef, useState } from "react"

/**
 * Word's Selection pane (Home > Select > Selection Pane, or Layout > Selection Pane): every object, top of the stack
 * first, with Show All, Hide All, Bring Forward and Send Backward. Click selects, Ctrl or Shift+click adds to the
 * picked objects, double-click renames, and dragging a row moves the object in the stack.
 */
export function SelectionPane() {
  const open = useViewStore((state) => state.selectionPane)
  const toggle = useViewStore((state) => state.toggleSelectionPane)
  const editor = useDocumentEditor()
  const picked = useObjectSelection((state) => state.picked)
  const pick = useObjectSelection((state) => state.pick)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropOn, setDropOn] = useState<number | null>(null)
  const objects = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listObjects(current.state.doc) : []),
    equalityFn: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  })
  const selectedPos = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection
      return selection instanceof NodeSelection ? selection.from : -1
    },
  })

  if (!open) {
    return null
  }

  const rows = objects ?? []
  const current = rows.find((row) => row.pos === selectedPos) ?? null
  const stack = rows.filter((row) => row.floating && row.behind === current?.behind)
  const at = current ? stack.findIndex((row) => row.pos === current.pos) : -1
  const canUp = current?.floating === true && at > 0
  const canDown = current?.floating === true && at >= 0 && at < stack.length - 1

  const select = (row: PaneObject, extend: boolean) => {
    if (!editor) {
      return
    }
    if (extend) {
      // The object selected before counts as picked, as Word's Ctrl+click on the pane.
      if (picked.length === 0 && selectedPos != null && selectedPos >= 0 && selectedPos !== row.pos) {
        pick(selectedPos, false)
      }
      pick(row.pos, true)
      return
    }
    pick(row.pos, false)
    if (row.hidden) {
      // A hidden object can't be selected on the page; the pane still marks it.
      return
    }
    editor.chain().focus().setNodeSelection(row.pos).run()
  }

  const move = (pos: number, to: number | "up" | "down") => {
    if (editor && moveObjectInStack(editor, pos, to)) {
      const moved = listObjects(editor.state.doc).find((row) => row.pos === pos)
      if (moved && !moved.hidden) {
        editor.commands.setNodeSelection(pos)
      }
    }
  }

  return (
    <aside className="selection-pane" aria-label="Selection">
      <header className="selection-pane-title">
        <span>Selection</span>
        <button type="button" aria-label="Close" title="Close" onClick={() => toggle()}>
          ×
        </button>
      </header>
      <div className="selection-pane-tools">
        <button
          type="button"
          className="selection-pane-tool"
          disabled={!rows.some((row) => row.hidden)}
          onClick={() => editor && setAllObjectsHidden(editor, false)}
        >
          Show All
        </button>
        <button
          type="button"
          className="selection-pane-tool"
          disabled={!rows.some((row) => !row.hidden)}
          onClick={() => editor && setAllObjectsHidden(editor, true)}
        >
          Hide All
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="selection-pane-tool is-icon"
          aria-label="Bring Forward"
          title="Bring Forward"
          disabled={!canUp}
          onClick={() => current && move(current.pos, "up")}
        >
          <ArrowIcon up />
        </button>
        <button
          type="button"
          className="selection-pane-tool is-icon"
          aria-label="Send Backward"
          title="Send Backward"
          disabled={!canDown}
          onClick={() => current && move(current.pos, "down")}
        >
          <ArrowIcon up={false} />
        </button>
      </div>
      {rows.length > 0 ? (
        <ul className="selection-pane-list" role="listbox" aria-label="Objects" aria-multiselectable>
          {rows.map((item) => {
            const active = selectedPos === item.pos || picked.includes(item.pos)
            const className = [
              "selection-pane-item",
              active ? "is-active" : "",
              item.hidden ? "is-hidden" : "",
              dropOn === item.pos && dragging !== item.pos ? "is-drop" : "",
            ]
              .filter(Boolean)
              .join(" ")
            return (
              <li
                key={item.pos}
                className={className}
                role="option"
                aria-selected={active}
                draggable={item.floating && renaming !== item.pos}
                onDragStart={(event) => {
                  setDragging(item.pos)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", item.label)
                }}
                onDragOver={(event) => {
                  const from = rows.find((row) => row.pos === dragging)
                  if (from && item.floating && from.behind === item.behind) {
                    event.preventDefault()
                    setDropOn(item.pos)
                  }
                }}
                onDragLeave={() => setDropOn((on) => (on === item.pos ? null : on))}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragging !== null) {
                    move(dragging, item.pos)
                  }
                  setDragging(null)
                  setDropOn(null)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setDropOn(null)
                }}
              >
                {renaming === item.pos ? (
                  <RenameBox
                    value={item.label}
                    onDone={(name) => {
                      setRenaming(null)
                      if (editor && name !== null && name !== item.label) {
                        renameObject(editor, item.pos, name)
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="selection-pane-row"
                    title={item.label}
                    onClick={(event) => {
                      // The second click of a double-click renames; it doesn't select again.
                      if (event.detail < 2) {
                        select(item, event.shiftKey || event.ctrlKey || event.metaKey)
                      }
                    }}
                    onDoubleClick={() => setRenaming(item.pos)}
                    onKeyDown={(event) => {
                      if (event.key === "F2") {
                        event.preventDefault()
                        setRenaming(item.pos)
                      }
                    }}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.groupId ? <span className="selection-pane-group">Grouped</span> : null}
                  </button>
                )}
                <button
                  type="button"
                  className="selection-pane-eye"
                  aria-label={item.hidden ? `Show ${item.label}` : `Hide ${item.label}`}
                  title={item.hidden ? "Show" : "Hide"}
                  aria-pressed={item.hidden}
                  onClick={() => editor && toggleObjectHidden(editor, item.pos)}
                >
                  <EyeIcon hidden={item.hidden} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="selection-pane-empty">There are no objects in this document.</p>
      )}
    </aside>
  )
}

/** The pane's rename box: Enter keeps the name, Esc or leaving it empty puts the old one back. */
function RenameBox({ value, onDone }: { value: string; onDone: (name: string | null) => void }) {
  const [text, setText] = useState(value)
  const box = useRef<HTMLInputElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    // After the editor's own focus, which the click that selected the object asked for a frame later.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        box.current?.focus()
        box.current?.select()
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  return (
    <input
      ref={box}
      className="selection-pane-rename"
      aria-label="Name"
      value={text}
      data-own-escape
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (focused.current) {
          onDone(text.trim() ? text : null)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          onDone(text.trim() ? text : null)
        } else if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onDone(null)
        }
      }}
    />
  )
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d={up ? "M8 13V3M4 7l4-4 4 4" : "M8 3v10M4 9l4 4 4-4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {hidden ? (
        <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      ) : (
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      )}
    </svg>
  )
}
