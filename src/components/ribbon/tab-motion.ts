import { useCallback, useEffect, useRef, type RefObject } from "react"
import { playEntrance, prefersReducedMotion } from "@/document/motion"

/** How long a tab's commands take to settle, in ms. */
export const TAB_MOTION_MS = 250

/**
 * The ribbon's tab change animation (21.40). After the person switches tab, the new tab's commands fade and slide in
 * from a few pixels to the right; the first paint, and a ribbon opened again after being collapsed, show their tab at
 * once. Switching again before it settles starts over: the tab chosen last wins.
 *
 * It is drawn from script a frame at a time (playEntrance), not as a CSS animation: the desktop webview showed a CSS
 * one's first frame again as it ended, a jump after the tab had settled. Its clock starts after the new tab's first,
 * slow frame, so the slide is not spent before it shows.
 */
export function useTabMotion(card: RefObject<HTMLElement | null>) {
  const frame = useRef(0)
  const stop = useRef<(() => void) | null>(null)

  const start = useCallback(() => {
    if (!card.current || prefersReducedMotion()) {
      return
    }
    cancelAnimationFrame(frame.current)
    stop.current?.()
    // The new tab is shown once this event's render has committed, before the next frame is drawn.
    frame.current = requestAnimationFrame(() => {
      const panel = card.current?.querySelector<HTMLElement>('[data-slot="tabs-content"]:not([hidden])')
      if (panel) {
        stop.current = playEntrance(panel, { opacity: 0, x: 12 }, TAB_MOTION_MS)
      }
    })
  }, [card])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      stop.current?.()
    },
    [],
  )

  return { start }
}
