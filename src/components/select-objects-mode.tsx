import { useDocumentEditor } from "@/editor/document-editor"
import { listObjects, useObjectSelection } from "@/editor/object-group"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { useEffect } from "react"
import { create } from "zustand"

/** Home > Select > Select Objects: a pointer that selects objects only, behind the text too, as in Word. */
export const useSelectObjects = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set: (on) => set({ on }),
}))

type Rect = { left: number; top: number; right: number; bottom: number }

/** The shown objects on the page with their boxes, top of the stack first (`listObjects`' order). */
function objectBoxes(editor: Editor) {
  const boxes: { pos: number; rect: Rect }[] = []
  for (const row of listObjects(editor.state.doc)) {
    if (row.hidden) {
      continue
    }
    const dom = editor.view.nodeDOM(row.pos)
    if (!(dom instanceof HTMLElement)) {
      continue
    }
    const box = dom.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) {
      boxes.push({ pos: row.pos, rect: box })
    }
  }
  return boxes
}

/** The objects a click at a point, or a dragged rectangle, takes: the topmost one hit, or all that lie inside it. */
export function objectsIn(boxes: { pos: number; rect: Rect }[], area: Rect) {
  const point = area.right - area.left < 4 && area.bottom - area.top < 4
  if (point) {
    const hit = boxes.find(
      ({ rect }) =>
        area.left >= rect.left && area.left <= rect.right && area.top >= rect.top && area.top <= rect.bottom,
    )
    return hit ? [hit.pos] : []
  }
  return boxes
    .filter(
      ({ rect }) =>
        rect.left >= area.left && rect.right <= area.right && rect.top >= area.top && rect.bottom <= area.bottom,
    )
    .map((box) => box.pos)
}

export function selectObjects(editor: Editor, positions: number[]) {
  const [first] = positions
  if (first === undefined) {
    // A click on nothing leaves the objects, as Word's does; the cursor stays where it was.
    useObjectSelection.getState().clear()
    if (editor.state.selection instanceof NodeSelection) {
      editor.commands.setTextSelection(editor.state.selection.from)
    }
    return
  }
  editor.chain().focus().setNodeSelection(first).run()
  useObjectSelection.setState({ picked: positions.length > 1 ? positions : [first] })
}

export function SelectObjectsMode() {
  const on = useSelectObjects((state) => state.on)
  const editor = useDocumentEditor()

  useEffect(() => {
    const scroller = document.getElementById("document-scroll")
    if (!on || !editor || !scroller) {
      return
    }
    scroller.dataset.selectObjects = "1"
    let start: { x: number; y: number; id: number } | null = null
    let marquee: HTMLDivElement | null = null
    const area = (event: PointerEvent): Rect => ({
      left: Math.min(start!.x, event.clientX),
      top: Math.min(start!.y, event.clientY),
      right: Math.max(start!.x, event.clientX),
      bottom: Math.max(start!.y, event.clientY),
    })
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      // The page only: the scroll bars, rulers and floating bars over it keep their own clicks.
      if (event.button !== 0 || !target?.closest(".page-editor, .document-page, .ProseMirror")) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
      scroller.setPointerCapture?.(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) {
        return
      }
      const box = area(event)
      if (!marquee && box.right - box.left < 4 && box.bottom - box.top < 4) {
        return
      }
      if (!marquee) {
        marquee = document.createElement("div")
        marquee.className = "select-objects-marquee"
        document.body.append(marquee)
      }
      Object.assign(marquee.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.right - box.left}px`,
        height: `${box.bottom - box.top}px`,
      })
    }
    const onUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const box = area(event)
      start = null
      marquee?.remove()
      marquee = null
      selectObjects(editor, objectsIn(objectBoxes(editor), box))
    }
    // The page's own mouse handling (text selection, object drags) is skipped while the pointer selects objects.
    const swallow = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest(".page-editor, .document-page, .ProseMirror")) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        useSelectObjects.getState().set(false)
      }
    }
    scroller.addEventListener("pointerdown", onDown, true)
    window.addEventListener("pointermove", onMove, true)
    window.addEventListener("pointerup", onUp, true)
    scroller.addEventListener("mousedown", swallow, true)
    scroller.addEventListener("dblclick", swallow, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      delete scroller.dataset.selectObjects
      marquee?.remove()
      scroller.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("pointermove", onMove, true)
      window.removeEventListener("pointerup", onUp, true)
      scroller.removeEventListener("mousedown", swallow, true)
      scroller.removeEventListener("dblclick", swallow, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [on, editor])

  return null
}
