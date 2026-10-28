import type { Editor } from "@tiptap/core"
import { WrapGlyph } from "@/components/menu-icons"
import { useObjectPreview } from "@/components/object-preview-hook"
import { defaultPictureWrap, setDefaultPictureWrap, useLayoutDialog } from "@/document/object-layout"
import type { ObjectRun } from "@/editor/object-preview"
import { canEditWrapPoints, startEditWrapPoints } from "@/editor/edit-wrap-points"
import { objectAnchoring, objectWrap, selectedObject, wrapChoicesFor } from "@/editor/objects"
import { Check } from "lucide-react"
import { useState, type ReactNode } from "react"

/**
 * Word's Wrap Text menu, shared by every ribbon tab that formats an object: the seven wraps with their pictures
 * (the pointer over one shows the text flowing that way), Edit Wrap Points, whether a floating object moves with
 * its paragraph or keeps its place on the page, Set as Default Layout and More Layout Options….
 */
export function WrapTextMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const preview = useObjectPreview(editor)
  // Read once when the menu opens: previews change the object under it.
  const [object] = useState(() => selectedObject(editor))
  const [isDefault, setIsDefault] = useState(() => defaultPictureWrap())
  const wrap = objectWrap(object?.attrs.wrap)
  const floating = object?.name === "textBox" || (object !== null && wrap !== "inline")
  const anchoring = objectAnchoring(object?.attrs.anchoring)
  const choices = wrapChoicesFor(editor, object?.name)
  const choose = (run: ObjectRun) => {
    preview?.commit(run)
    close()
  }
  return (
    <div className="layout-menu is-list" role="menu" aria-label="Wrap Text" onMouseLeave={() => preview?.restore()}>
      {choices.map((choice) => {
        const run: ObjectRun = (chain) => chain.setObjectWrap(choice.id)
        return (
          <Row
            key={choice.id}
            checked={object !== null && wrap === choice.id}
            disabled={!object}
            icon={<WrapGlyph kind={choice.id} />}
            onEnter={() => preview?.preview(run)}
            onClick={() => choose(run)}
          >
            {choice.label}
          </Row>
        )
      })}
      <div className="layout-menu-separator" role="separator" />
      <Row
        disabled={!canEditWrapPoints(editor)}
        title={
          wrap === "tight" || wrap === "through"
            ? object?.attrs.rotate
              ? "Not for a turned object"
              : undefined
            : "For Tight and Through"
        }
        onEnter={() => preview?.restore()}
        onClick={() => {
          preview?.restore()
          close()
          if (editor) {
            startEditWrapPoints(editor)
          }
        }}
      >
        Edit Wrap Points
      </Row>
      <Row
        checked={floating && anchoring === "move"}
        disabled={!floating}
        onEnter={() => preview?.restore()}
        onClick={() => choose((chain) => chain.setObjectAnchoring("move"))}
      >
        Move with Text
      </Row>
      <Row
        checked={floating && anchoring === "fixed"}
        disabled={!floating}
        onEnter={() => preview?.restore()}
        onClick={() => choose((chain) => chain.setObjectAnchoring("fixed"))}
      >
        Fix Position on Page
      </Row>
      <div className="layout-menu-separator" role="separator" />
      <Row
        disabled={!object}
        onEnter={() => preview?.restore()}
        onClick={() => {
          preview?.restore()
          close()
          useLayoutDialog.getState().show("wrap")
        }}
      >
        More Layout Options…
      </Row>
      <Row
        checked={object !== null && isDefault === wrap && wrap !== "inline"}
        disabled={!object || object.name !== "image"}
        title="New pictures are put in with this wrap."
        onEnter={() => preview?.restore()}
        onClick={() => {
          setDefaultPictureWrap(wrap)
          setIsDefault(wrap)
          close()
        }}
      >
        Set as Default Layout
      </Row>
    </div>
  )
}

function Row({
  checked = false,
  disabled = false,
  icon,
  title,
  onEnter,
  onClick,
  children,
}: {
  checked?: boolean
  disabled?: boolean
  icon?: ReactNode
  title?: string
  onEnter: () => void
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className="layout-menu-row"
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onEnter}
      onClick={onClick}
    >
      <span className="layout-menu-icon">
        {icon ?? (checked ? <Check className="size-3.5" strokeWidth={2} /> : null)}
      </span>
      {children}
    </button>
  )
}
