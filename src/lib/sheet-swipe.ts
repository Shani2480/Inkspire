import { isPhone } from "@/lib/device"

/** The task panes that open as sheets from the bottom on a phone (index.css, "Task panes on a phone"). */
export const SHEETS =
  ".clipboard-pane, .recovery-rail, .comments-sidebar, .ai-pane, .nav-pane, .selection-pane, .styles-pane, .format-pane, .smartart-pane"

/** How far from a sheet's top a drag can start: its handle and heading. */
const GRIP = 64

/** Whether a drag of `dy` px down a sheet `height` px tall, at `speed` px/ms on release, closes it. */
export function closesSheet(dy: number, height: number, speed: number) {
  return dy > Math.min(140, height * 0.3) || (dy > 24 && speed > 0.6)
}

/**
 * On a phone a pane's sheet follows a finger dragged down from its handle or heading, and closes when let go far
 * enough down (or flicked), through the pane's own close button so the pane's state is what closing it always does.
 * Let go early, it settles back.
 */
export function installSheetSwipe() {
  const stop = (click: Event) => {
    click.stopPropagation()
    click.preventDefault()
  }
  let drag: {
    sheet: HTMLElement
    id: number
    x: number
    y: number
    dy: number
    moving: boolean
    lastY: number
    lastT: number
    speed: number
  } | null = null

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!isPhone() || event.pointerType === "mouse" || !(event.target instanceof Element)) {
        return
      }
      const sheet = event.target.closest<HTMLElement>(SHEETS)
      if (!sheet || event.target.closest("input, textarea, select, [contenteditable='true']")) {
        return
      }
      if (event.clientY - sheet.getBoundingClientRect().top > GRIP) {
        return
      }
      const now = performance.now()
      drag = {
        sheet,
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dy: 0,
        moving: false,
        lastY: event.clientY,
        lastT: now,
        speed: 0,
      }
    },
    { passive: true },
  )

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.id) {
        return
      }
      const dy = Math.max(0, event.clientY - drag.y)
      if (!drag.moving) {
        if (dy < 8 || dy < Math.abs(event.clientX - drag.x)) {
          return
        }
        drag.moving = true
        drag.sheet.style.transition = "none"
      }
      const now = performance.now()
      drag.speed = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastT)
      drag.lastY = event.clientY
      drag.lastT = now
      drag.dy = dy
      drag.sheet.style.transform = `translateY(${dy}px)`
    },
    { passive: true },
  )

  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) {
      return
    }
    const { sheet, moving, dy, speed } = drag
    drag = null
    if (!moving) {
      return
    }
    // The drag is not also a tap on what it started over: the click that follows it, if any, is dropped.
    window.addEventListener("click", stop, { capture: true, once: true })
    window.setTimeout(() => window.removeEventListener("click", stop, true), 400)
    sheet.style.transition = ""
    const close = sheet.querySelector<HTMLElement>("[data-sheet-close], button[aria-label^='Close']")
    const folds = close?.getAttribute("aria-expanded")
    if (event.type === "pointerup" && close && folds !== "false" && closesSheet(dy, sheet.offsetHeight, speed)) {
      sheet.style.transform = "translateY(100%)"
      window.setTimeout(() => {
        window.removeEventListener("click", stop, true)
        close.click()
        sheet.style.transform = ""
      }, 200)
    } else {
      sheet.style.transform = ""
    }
  }
  window.addEventListener("pointerup", end)
  window.addEventListener("pointercancel", end)
}
