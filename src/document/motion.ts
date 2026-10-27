export function prefersReducedMotion() {
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-no-motion")) {
    return true
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/** A cubic-bezier easing as a function of progress, solved by bisection (it only ever runs once a frame). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0 || x >= 1) {
      return x <= 0 ? 0 : 1
    }
    let low = 0
    let high = 1
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2
      if (at(mid, x1, x2) < x) {
        low = mid
      } else {
        high = mid
      }
    }
    return at((low + high) / 2, y1, y2)
  }
}

/**
 * The entrances' curve. Fluent's decelerate (0.1, 0.9, 0.2, 1) is nearly done by the first frame the desktop webview
 * draws, so its motion was never seen, only a snap; this one still has three quarters of its way to go at that point.
 */
export const easeEntrance = cubicBezier(0.2, 0, 0, 1)

/**
 * Calls `draw` with the eased progress (0 to 1) once now and then every frame for `duration` ms, and `done` after the
 * last. Returns a function that stops it at once, without calling `done`.
 *
 * Motion is drawn from script, not as CSS animations or the Web Animations API: the desktop webview (WebKitGTK) runs
 * those on a layer of its own and, the frame one ends, shows its first frame again, so things jumped back for a frame
 * after they had settled. The call's own frame is usually the slow one that lays new content out: it is drawn at the
 * start, and the clock starts a frame in with the next, so none of the motion is spent unseen.
 */
export function playFrames(duration: number, draw: (progress: number) => void, done?: () => void) {
  let frame = 0
  let start = 0
  const tick = (now: number) => {
    start ||= now - 16
    const progress = Math.min(1, (now - start) / duration)
    draw(easeEntrance(progress))
    if (progress < 1) {
      frame = requestAnimationFrame(tick)
    } else {
      done?.()
    }
  }
  draw(0)
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

export type FrameMotion = { opacity?: number; x?: number; y?: number }

/** The px offset an element's own `translate` already gives it (a centred dialog's, say), which the motion adds to. */
function ownTranslate(element: HTMLElement) {
  const [x = "0", y = "0"] = getComputedStyle(element).translate.split(" ")
  const px = (value: string) => (value === "none" ? 0 : Number.parseFloat(value) || 0)
  return { x: px(x), y: px(y) }
}

/**
 * Brings `element` in from `from` (an opacity, and an offset in px) to where it is. Returns a function that stops it.
 *
 * It ends at opacity 1 and a zero offset written on the element, rather than removing them: the desktop webview,
 * when an element went from having an offset to having none, drew one stale frame of it from earlier in the motion.
 * An element with an offset of its own (a centred dialog, say) keeps one either way, so that one is given back to
 * the stylesheet, which then follows the window.
 */
export function playEntrance(element: HTMLElement, from: FrameMotion, duration: number) {
  const own = from.x || from.y ? ownTranslate(element) : null
  const settle = () => {
    element.style.opacity = "1"
    if (own) {
      element.style.translate = own.x || own.y ? "" : "0px 0px"
    }
  }
  const stop = playFrames(
    duration,
    (progress) => {
      const left = 1 - progress
      element.style.opacity = String(1 - (1 - (from.opacity ?? 1)) * left)
      if (own) {
        element.style.translate = `${own.x + (from.x ?? 0) * left}px ${own.y + (from.y ?? 0) * left}px`
      }
    },
    settle,
  )
  return () => {
    stop()
    settle()
  }
}

/**
 * A document that was just created, opened or recovered fades in. The pages themselves never animate: a cover in
 * the workspace colour fades away over them. Animating the pages put them on a layer the desktop webview dropped
 * on the last frame, repainting every page at once (a blink as the animation ended).
 */
export function playDocumentEntrance() {
  if (prefersReducedMotion()) {
    return
  }
  requestAnimationFrame(() => {
    const scroller = document.getElementById("document-scroll")
    if (!scroller) {
      return
    }
    const box = scroller.getBoundingClientRect()
    const cover = document.createElement("div")
    cover.className = "document-entrance-cover"
    Object.assign(cover.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
    document.body.appendChild(cover)
    playFrames(
      280,
      (progress) => {
        cover.style.opacity = String(1 - progress)
      },
      () => cover.remove(),
    )
  })
}
