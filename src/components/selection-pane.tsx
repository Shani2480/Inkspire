import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import { listObjects, toggleObjectHidden, useObjectSelection } from "@/editor/object-group"
import { useEditorState } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"

export function SelectionPane() {
  const open = useViewStore((state) => state.selectionPane)
  const toggle = useViewStore((state) => state.toggleSelectionPane)
  const editor = useDocumentEditor()
  const picked = useObjectSelection((state) => state.picked)
  const pick = useObjectSelection((state) => state.pick)
  const objects = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listObjects(current.state.doc) : []),
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

  return (
    <aside className="selection-pane" aria-label="Selection">
      <header className="selection-pane-title">
        <span>Selection</span>
        <button type="button" aria-label="Close selection pane" onClick={() => toggle()}>
          ×
        </button>
      </header>
      {objects && objects.length > 0 ? (
        <ul className="selection-pane-list">
          {objects.map((item) => {
            const active = selectedPos === item.pos || picked.includes(item.pos)
            return (
              <li key={item.pos}>
                <button
                  type="button"
                  className="selection-pane-eye"
                  aria-label={item.hidden ? `Show ${item.label}` : `Hide ${item.label}`}
                  aria-pressed={item.hidden}
                  onClick={() => editor && toggleObjectHidden(editor, item.pos)}
                >
                  <EyeIcon hidden={item.hidden} />
                </button>
                <button
                  type="button"
                  className={active ? "selection-pane-row is-active" : "selection-pane-row"}
                  aria-pressed={active}
                  onClick={(event) => {
                    pick(item.pos, event.shiftKey)
                    if (!event.shiftKey && editor) {
                      editor.chain().focus().setNodeSelection(item.pos).run()
                    }
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  {item.groupId ? <span className="selection-pane-group">Grouped</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="selection-pane-empty">This page has no objects yet.</p>
      )}
      <p className="selection-pane-note">Shift-click objects, then choose Group.</p>
    </aside>
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
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      {hidden ? <path d="M2.2 13.2 13.8 2.8" stroke="currentColor" strokeWidth="1.2" /> : null}
    </svg>
  )
}
