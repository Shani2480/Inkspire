import { useLayoutDialog } from "@/document/object-layout"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { WrapGlyph } from "@/components/menu-icons"
import {
  objectAnchoring,
  objectWrap,
  isChromeEditor,
  selectedObject,
  WRAP_CHOICES,
  wrapChoicesFor,
  type ObjectWrap,
} from "@/editor/objects"

type Place = { pos: number; name: string; wrap: ObjectWrap; anchoring: string; left: number; top: number }

const ANCHOR_TIPS = {
  move: "Moves the object up or down with the text it is anchored to, so they stay together on the page.",
  fixed: "Keeps the object at the same place on the page when the text around it changes.",
}

/**
 * Word's Layout Options button: a small square beside the selected picture, shape or text box. It opens the wraps
 * as pictures (In Line with Text on its own, then the six With Text Wrapping choices) and the Move with Text / Fix
 * Position on Page choice.
 */
export function LayoutOptions({ editor }: { editor: Editor }) {
  const [place, setPlace] = useState<Place | null>(null)
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const found = selectedObject(editor)
        const dom = found ? editor.view.nodeDOM(found.pos) : null
        const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
        const scroller = document.getElementById("document-scroll")?.getBoundingClientRect()
        if (!found || !rect || rect.width < 1 || !editor.isFocused) {
          setPlace(null)
          setOpen(false)
          return
        }
        const top = Math.max(rect.top, (scroller?.top ?? 0) + 4)
        if (scroller && (top > scroller.bottom - 28 || rect.bottom < scroller.top)) {
          setPlace(null)
          return
        }
        setPlace((last) => {
          if (last?.pos !== found.pos) {
            setOpen(false)
          }
          return {
            pos: found.pos,
            name: found.name,
            wrap: objectWrap(found.attrs.wrap),
            anchoring: objectAnchoring(found.attrs.anchoring),
            left: Math.min(rect.right + 8, window.innerWidth - 32),
            top,
          }
        })
      })
    }
    const scroller = document.getElementById("document-scroll")
    editor.on("selectionUpdate", sync)
    editor.on("transaction", sync)
    editor.on("focus", sync)
    editor.on("blur", sync)
    scroller?.addEventListener("scroll", sync, { passive: true })
    window.addEventListener("resize", sync)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      editor.off("selectionUpdate", sync)
      editor.off("transaction", sync)
      editor.off("focus", sync)
      editor.off("blur", sync)
      scroller?.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [editor])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLButtonElement>(".layout-options-tile:not(:disabled)")?.focus(),
      )
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        editor.commands.focus()
      }
    }
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !panel.current?.parentElement?.contains(event.target)) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [editor, open])

  if (!place) {
    return null
  }
  const floating = place.name === "textBox" || place.wrap !== "inline"
  const choose = (wrap: ObjectWrap) => editor.chain().focus().setObjectWrap(wrap).run()
  const tile = (id: ObjectWrap) => {
    const choice = WRAP_CHOICES.find((item) => item.id === id)!
    return (
      <button
        key={id}
        type="button"
        className="layout-options-tile"
        title={choice.label}
        aria-label={choice.label}
        aria-pressed={place.wrap === id}
        disabled={id === "inline" && place.name === "textBox"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(id)}
      >
        <WrapGlyph kind={id} />
      </button>
    )
  }
  return createPortal(
    <div className="layout-options" style={{ left: place.left, top: place.top }}>
      <button
        type="button"
        className="layout-options-button"
        title="Layout Options"
        aria-label="Layout Options"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <WrapGlyph kind="square" />
      </button>
      {open ? (
        <div
          ref={panel}
          className="layout-options-panel"
          role="dialog"
          aria-label="Layout Options"
          onKeyDown={(event) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
            const tiles = [
              ...(panel.current?.querySelectorAll<HTMLButtonElement>(".layout-options-tile:not(:disabled)") ?? []),
            ]
            const at = tiles.indexOf(document.activeElement as HTMLButtonElement)
            if (step && at >= 0) {
              event.preventDefault()
              tiles[(at + step + tiles.length) % tiles.length].focus()
            }
          }}
        >
          <div className="layout-options-title">
            Layout Options
            <button
              type="button"
              className="layout-options-close"
              aria-label="Close"
              title="Close"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false)
                editor.commands.focus()
              }}
            >
              ×
            </button>
          </div>
          <div className="layout-options-heading">In Line with Text</div>
          <div className="layout-options-row">{tile("inline")}</div>
          <div className="layout-options-heading">With Text Wrapping</div>
          <div className="layout-options-row">
            {(["square", "tight", "through", "topBottom", "behind", "front"] as const)
              .filter((id) => wrapChoicesFor(editor).some((choice) => choice.id === id))
              .map(tile)}
          </div>
          {(isChromeEditor(editor) ? [] : (["move", "fixed"] as const)).map((anchoring) => (
            <label key={anchoring} className="layout-options-radio" aria-disabled={!floating}>
              <input
                type="radio"
                name="layout-options-anchoring"
                disabled={!floating}
                checked={floating && place.anchoring === anchoring}
                onMouseDown={(event) => event.preventDefault()}
                onChange={() => editor.chain().focus().setObjectAnchoring(anchoring).run()}
              />
              {anchoring === "move" ? "Move with text" : "Fix position on page"}
              <span className="layout-options-info" role="img" aria-label="Information" title={ANCHOR_TIPS[anchoring]}>
                i
              </span>
            </label>
          ))}
          <button
            type="button"
            className="layout-options-more"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false)
              useLayoutDialog.getState().show("position")
            }}
          >
            See more…
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
