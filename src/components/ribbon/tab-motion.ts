import { useCallback, useEffect, useRef, useState } from "react"

/** How long a tab's commands take to settle, in ms; the same as `--motion-tab` in the stylesheet. */
export const TAB_MOTION_MS = 150

/**
 * The ribbon's tab change animation (21.40). `moving` is true for a moment after the person switches tab, so the
 * new tab's commands fade and slide in; the first paint, and a ribbon opened again after being collapsed, show their
 * tab at once. Switching again before it settles starts over: the tab chosen last wins.
 */
export function useTabMotion() {
  const [moving, setMoving] = useState(false)
  const timer = useRef(0)

  const start = useCallback(() => {
    window.clearTimeout(timer.current)
    setMoving(true)
    timer.current = window.setTimeout(() => setMoving(false), TAB_MOTION_MS + 50)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { moving, start }
}
