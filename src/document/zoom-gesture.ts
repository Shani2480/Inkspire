import { flushSync } from "react-dom"
import { clampZoom, useViewStore } from "@/document/view"

/**
 * Zooms the document smoothly while a pinch or Ctrl+wheel gesture runs.
 *
 * Setting the zoom re-renders the page, rulers and comment markers, which is far too slow to do for every step of
 * a gesture. So while the gesture runs, the page stage is only scaled with a transform around the point being
 * zoomed; the zoom itself is set once the gesture pauses, and the view scrolls so that point stays put.
 */

const SETTLE_MS = 160

/** Sent on the window whenever the previewed page moves or grows, so what follows the page (the rulers) can too. */
export const ZOOM_PREVIEW_EVENT = "document-zoom-preview"

type Gesture = {
  stage: HTMLElement
  scroll: HTMLElement
  /** The zoom the page is rendered at. */
  base: number
  /** The zoom the gesture is heading for, unrounded, so many small steps add up instead of rounding away. */
  target: number
  /** The point being zoomed: in the window, and in the unscaled stage. */
  client: { x: number; y: number }
  origin: { x: number; y: number }
  /** The stage's unscaled box, and the scroll area's content box, in the window. */
  box: DOMRect
  content: { left: number; width: number }
  timer: number
}

let gesture: Gesture | null = null
let pointer: { x: number; y: number } | null = null

/** Remembers where the pointer is, so a pinch (which carries no position) zooms around it. */
export function notePointer(event: PointerEvent | MouseEvent) {
  pointer = { x: event.clientX, y: event.clientY }
}

/** Zooms by `factor` (or to `next(target)`) around a point in the window, or the pointer, or the view's centre. */
export function zoomGesture(next: number | ((target: number) => number), at?: { x: number; y: number }) {
  const step = typeof next === "number" ? (target: number) => target * next : next
  const current = gesture ?? beginGesture(at)
  if (!current) {
    const view = useViewStore.getState()
    view.setZoom(step(view.zoom))
    return
  }
  current.target = Math.min(2, Math.max(0.5, step(current.target)))
  current.stage.style.transform = previewTransform(current)
  window.dispatchEvent(new Event(ZOOM_PREVIEW_EVENT))
  window.clearTimeout(current.timer)
  current.timer = window.setTimeout(settle, SETTLE_MS)
}

function beginGesture(at?: { x: number; y: number }): Gesture | null {
  const stage = document.querySelector<HTMLElement>(".page-stage")
  const scroll = document.getElementById("document-scroll")
  if (!stage || !scroll) {
    return null
  }
  const view = scroll.getBoundingClientRect()
  const inside = (point: { x: number; y: number } | null | undefined) =>
    point && point.x >= view.left && point.x <= view.right && point.y >= view.top && point.y <= view.bottom
  const client = inside(at)
    ? at!
    : inside(pointer)
      ? pointer!
      : { x: view.left + view.width / 2, y: view.top + view.height / 2 }
  const box = stage.getBoundingClientRect()
  const origin = { x: client.x - box.left, y: client.y - box.top }
  const style = getComputedStyle(scroll)
  const paddingLeft = parseFloat(style.paddingLeft) || 0
  const content = {
    left: view.left + scroll.clientLeft + paddingLeft - scroll.scrollLeft,
    width: scroll.clientWidth - paddingLeft - (parseFloat(style.paddingRight) || 0),
  }
  stage.style.transformOrigin = "0 0"
  stage.style.willChange = "transform"
  const base = useViewStore.getState().zoom
  gesture = { stage, scroll, base, target: base, client, origin, box, content, timer: 0 }
  return gesture
}

/**
 * Where the page will be once the zoom is set: centred while it fits the width (as the layout centres it), and
 * otherwise with the zoomed point kept under the pointer, as it is vertically.
 */
function previewTransform({ base, target, client, origin, box, content }: Gesture) {
  const scale = clampZoom(target) / base
  const width = box.width * scale
  const left = width <= content.width ? content.left + (content.width - width) / 2 : client.x - origin.x * scale
  const top = client.y - origin.y * scale
  return `translate(${left - box.left}px, ${top - box.top}px) scale(${scale})`
}

function settle() {
  const done = gesture
  gesture = null
  if (!done) {
    return
  }
  const { stage, scroll, base, target, client, origin } = done
  const zoom = clampZoom(target)
  // Render at the new zoom and drop the transform in the same frame, so the page does not jump.
  flushSync(() => useViewStore.getState().setZoom(zoom))
  stage.style.transform = ""
  stage.style.transformOrigin = ""
  stage.style.willChange = ""
  const box = stage.getBoundingClientRect()
  const ratio = zoom / base
  scroll.scrollLeft += box.left + origin.x * ratio - client.x
  scroll.scrollTop += box.top + origin.y * ratio - client.y
  window.dispatchEvent(new Event(ZOOM_PREVIEW_EVENT))
}
