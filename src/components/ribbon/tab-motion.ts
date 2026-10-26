import { useCallback, useEffect, useRef, type RefObject } from "react"
import { prefersReducedMotion } from "@/document/motion"

/** How long a tab's commands take to settle, in ms; the same as `--motion-tab` in the stylesheet. */
export const TAB_MOTION_MS = 150

/**
 * The ribbon's tab change animation (21.40). After the person switches tab, the card's `data-tab-motion` makes the new
 * tab's commands fade and slide in; the first paint, and a ribbon opened again after being collapsed, show their tab
 * at once. Switching again before it settles starts over: the tab chosen last wins.
 *
 * Drawing the new tab's first frame (its style and layout) is the slow part, and in the desktop webview it took most
 * of the slide's time: started with the switch, the slide was nearly over when it first showed, and it jumped. So
 * that frame is drawn with the commands unseen ("waiting"), and the slide starts on the frame after it ("on"). The
 * attribute is set on the element itself, not through state, so the ribbon does not draw again while it slides.
 */
export function useTabMotion(card: RefObject<HTMLElement | null>) {
  const timer = useRef(0)
  const frame = useRef(0)

  const start = useCallback(() => {
    const element = card.current
    if (!element || prefersReducedMotion()) {
      return
    }
    window.clearTimeout(timer.current)
    window.cancelAnimationFrame(frame.current)
    element.dataset.tabMotion = "waiting"
    // The first callback runs before the new tab's first frame is drawn, the second before the frame after it.
    frame.current = window.requestAnimationFrame(() => {
      frame.current = window.requestAnimationFrame(() => {
        element.dataset.tabMotion = "on"
        timer.current = window.setTimeout(() => delete element.dataset.tabMotion, TAB_MOTION_MS + 50)
      })
    })
  }, [card])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.cancelAnimationFrame(frame.current)
    },
    [],
  )

  return { start }
}
