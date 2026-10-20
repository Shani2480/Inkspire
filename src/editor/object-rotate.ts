import { NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

const STEP = 1
const SHIFT_STEP = 15

/** Corner rotate grip shown while an object node is selected. */
export function ensureRotateHandle(dom: HTMLElement) {
  if (dom.querySelector("[data-rotate]")) {
    return
  }
  const handle = document.createElement("button")
  handle.type = "button"
  handle.className = "object-rotate"
  handle.dataset.rotate = ""
  handle.contentEditable = "false"
  handle.tabIndex = -1
  handle.title = "Drag to rotate · hold Shift for 15° steps"
  handle.setAttribute("aria-label", "Rotate")
  handle.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 3.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.7 6.5a5.5 5.5 0 1 1-1.4-3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  dom.append(handle)
}

/**
 * Drag the rotate handle to turn the object live, as in Word: the angle is written without history on each animation
 * frame, so the frame, its handles and the text wrapped around it follow; on release the original comes back and the
 * final angle goes in as one undo step. 1° steps; Shift snaps to 15°. Esc cancels.
 */
export function bindRotate(dom: HTMLElement, view: EditorView, getPos: () => number | undefined) {
  const onDown = (event: PointerEvent) => {
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-rotate]") : null
    if (event.button !== 0 || !handle || !dom.contains(handle)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    const original = pos == null ? null : view.state.doc.nodeAt(pos)
    if (pos == null || !original || !("rotate" in original.attrs)) {
      return
    }

    const rect = dom.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const originRotate = Number(original.attrs.rotate) || 0
    const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx)
    let angle = originRotate
    let frame = 0
    let pointer = { x: event.clientX, y: event.clientY, shift: false }

    const tip = document.createElement("div")
    tip.className = "object-size-tip"
    tip.setAttribute("role", "status")
    document.body.append(tip)
    document.body.classList.add("object-resizing")
    dom.classList.add("is-rotating")

    const write = (degrees: number, history: boolean) => {
      const current = view.state.doc.nodeAt(pos)
      if (!current || current.type !== original.type) {
        return
      }
      const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, rotate: degrees })
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      if (!history) {
        tr.setMeta("addToHistory", false)
      }
      view.dispatch(tr)
    }

    const paint = () => {
      frame = 0
      const turned = ((Math.atan2(pointer.y - cy, pointer.x - cx) - startAngle) * 180) / Math.PI
      const next = normalizeDegrees(snapDegrees(originRotate + turned, pointer.shift ? SHIFT_STEP : STEP))
      tip.textContent = `${next}°`
      tip.style.left = `${pointer.x + 16}px`
      tip.style.top = `${pointer.y + 18}px`
      if (next !== angle) {
        angle = next
        write(angle, false)
      }
    }

    const move = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey }
      if (!frame) {
        frame = requestAnimationFrame(paint)
      }
    }

    const finish = (keep: boolean) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", onKey, true)
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      tip.remove()
      document.body.classList.remove("object-resizing")
      dom.classList.remove("is-rotating")
      write(originRotate, false)
      if (keep && angle !== originRotate) {
        write(angle, true)
      }
    }
    const up = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey }
      paint()
      finish(true)
    }
    const cancel = () => finish(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault()
        ev.stopPropagation()
        finish(false)
      }
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", onKey, true)
  }

  dom.addEventListener("pointerdown", onDown)
  return () => dom.removeEventListener("pointerdown", onDown)
}

export function snapDegrees(degrees: number, step: number) {
  return Math.round(degrees / step) * step
}

export function normalizeDegrees(degrees: number) {
  let normalized = ((degrees % 360) + 360) % 360
  if (normalized > 180) {
    normalized -= 360
  }
  return normalized === 0 ? 0 : normalized
}

/** The upright box a `width` × `height` object turned by `degrees` covers, about the same centre. */
export function rotatedBounds(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const turnedWidth = width * cos + height * sin
  const turnedHeight = width * sin + height * cos
  return {
    width: turnedWidth,
    height: turnedHeight,
    dx: (width - turnedWidth) / 2,
    dy: (height - turnedHeight) / 2,
  }
}
