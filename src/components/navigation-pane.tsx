import { useBodyEditor } from "@/editor/document-editor"
import { listHeadings } from "@/editor/insert-blocks"
import { useViewStore } from "@/document/view"
import { useEditorState } from "@tiptap/react"

export function NavigationPane() {
  const open = useViewStore((state) => state.navPane)
  const editor = useBodyEditor()
  const headings = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listHeadings(current.state.doc) : []),
  })

  if (!open) {
    return null
  }

  return (
    <aside
      aria-label="Navigation Pane"
      className="nav-pane flex w-56 shrink-0 flex-col border-r border-[var(--app-divider)] bg-[var(--app-ribbon-bg)]"
    >
      <div className="border-b border-[var(--app-divider)] px-3 py-2 text-[12px] font-semibold text-[var(--app-ribbon-text)]">
        Navigation
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {(headings?.length ?? 0) === 0 ? (
          <p className="px-2 py-2 text-[11px] text-[var(--app-ribbon-muted)]">No headings in this document.</p>
        ) : (
          headings?.map((heading) => (
            <button
              key={`${heading.pos}-${heading.text}`}
              type="button"
              className="nav-pane-item"
              data-level={heading.level}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor
                  ?.chain()
                  .focus()
                  .setTextSelection(heading.pos + 1)
                  .scrollIntoView()
                  .run()
              }}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
