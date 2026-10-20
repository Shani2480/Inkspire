import { PositionGlyph } from "@/components/object-layout-icons"
import { useObjectPreview } from "@/components/object-preview-hook"
import { useLayoutDialog } from "@/document/object-layout"
import { OBJECT_ANCHORS, selectedObject, selectedPosition, type ObjectAnchor } from "@/editor/objects"
import type { ObjectRun } from "@/editor/object-preview"
import type { Editor } from "@tiptap/core"
import { useState } from "react"

/**
 * Word's Position gallery: In Line with Text, the nine places With Text Wrapping, and More Layout Options…. The
 * current place is highlighted, and the pointer over a tile shows the object there until it moves off.
 */
export function PositionMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const preview = useObjectPreview(editor)
  // Read once when the menu opens: previews change the object under it.
  const [current] = useState(() => selectedPosition(editor))
  const object = selectedObject(editor)
  const canInline = object?.name !== "textBox"
  const choose = (run: ObjectRun) => {
    preview?.commit(run)
    close()
  }
  const place =
    (anchor: ObjectAnchor): ObjectRun =>
    (chain) =>
      chain.setObjectAnchor(anchor)
  const inline: ObjectRun = (chain) => chain.setObjectWrap("inline")
  const label = (anchor: (typeof OBJECT_ANCHORS)[number]) =>
    `Position in ${anchor.label.replace(/\b\w/g, (letter) => letter.toUpperCase())} with Square Text Wrapping`
  return (
    <div className="layout-menu" role="menu" aria-label="Position" onMouseLeave={() => preview?.restore()}>
      {canInline ? (
        <>
          <div className="layout-menu-heading">In Line with Text</div>
          <div className="layout-menu-tiles">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={current === "inline"}
              aria-label="In Line with Text"
              title="In Line with Text"
              disabled={!object}
              className="layout-menu-tile"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => preview?.preview(inline)}
              onClick={() => choose(inline)}
            >
              <PositionGlyph anchor="inline" size={36} />
            </button>
          </div>
        </>
      ) : null}
      <div className="layout-menu-heading">With Text Wrapping</div>
      <div className="layout-menu-tiles is-grid">
        {OBJECT_ANCHORS.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            role="menuitemradio"
            aria-checked={current === anchor.id}
            aria-label={label(anchor)}
            title={label(anchor)}
            disabled={!object}
            className="layout-menu-tile"
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => preview?.preview(place(anchor.id))}
            onClick={() => choose(place(anchor.id))}
          >
            <PositionGlyph anchor={anchor.id} size={36} />
          </button>
        ))}
      </div>
      <div className="layout-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="layout-menu-row"
        disabled={!object}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => preview?.restore()}
        onClick={() => {
          preview?.restore()
          close()
          useLayoutDialog.getState().show("position")
        }}
      >
        <span className="layout-menu-icon" />
        More Layout Options…
      </button>
    </div>
  )
}
