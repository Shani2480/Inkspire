/** How long after a page step a wheel or touchpad stream is ignored, so one flick turns one page. */
export const STEP_LOCK_MS = 350
/** A stream of wheel events keeps the lock until it has been quiet this long (touchpad inertia). */
export const WHEEL_QUIET_MS = 120

type Scroller = { scrollTop: number; clientHeight: number; scrollHeight: number }

/**
 * The page step a wheel event asks for: 1 for the next page, -1 for the previous, 0 when the page still has
 * room to scroll inside the pane (a zoomed-in page) or the event is a pinch.
 */
export function wheelStep(deltaY: number, scroller: Scroller, ctrl = false) {
  if (ctrl || deltaY === 0) {
    return 0
  }
  const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
  const atTop = scroller.scrollTop <= 0
  if (deltaY > 0) {
    return atBottom ? 1 : 0
  }
  return atTop ? -1 : 0
}

/** The page to show for a key, or null when the key is not one of the preview's. */
export function pageForKey(key: string, current: number, pages: number) {
  const last = Math.max(0, pages - 1)
  switch (key) {
    case "PageDown":
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(last, current + 1)
    case "PageUp":
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(0, current - 1)
    case "Home":
      return 0
    case "End":
      return last
    default:
      return null
  }
}

/** Remembers when the last page step happened and swallows the wheel events that follow it. */
export function createStepLock(now: () => number = () => performance.now()) {
  let until = 0
  return {
    /** True when the event may step; while locked, every event pushes the end of the lock out. */
    allow() {
      const time = now()
      if (time < until) {
        until = Math.max(until, time + WHEEL_QUIET_MS)
        return false
      }
      return true
    },
    stepped() {
      until = now() + STEP_LOCK_MS
    },
  }
}
