import { useEffect, useRef, useState } from "react"
import { SplashMark, SplashPicture } from "@/components/splash-art"

const INITIAL_STATUS = "Starting..."
const MIN_VISIBLE_MS = 250

type Status = { text: string; progress: number }
type StatusSetter = (status: Status) => void

let pending: Status = { text: INITIAL_STATUS, progress: 0.08 }
let statusSetter: StatusSetter | null = null

/**
 * Updates the splash copy and how far the bar has come (0–1). Safe to call from the boot loop before or after
 * mount. The bar never goes back.
 */
export function setSplashLoadingStatus(text: string, progress?: number) {
  pending = { text, progress: Math.max(pending.progress, Math.min(1, progress ?? pending.progress)) }
  statusSetter?.(pending)
}

const frame = (callback: (time: number) => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (window.setTimeout(() => callback(performance.now()), 16) as unknown as number)
const cancelFrame = (id: number) =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : window.clearTimeout(id)

type SplashScreenProps = {
  isLoaded: boolean
}

/**
 * Word's splash: a card with the app's mark and name and a bar that fills as the app loads, light or dark as the
 * system is. The bar is drawn from script, a frame at a time (CSS animations leave stale frames in the desktop
 * webview); it creeps on while a step takes long and runs to the end once the app is ready.
 */
export function SplashScreen({ isLoaded }: SplashScreenProps) {
  const [status, setStatus] = useState(pending)
  const [held, setHeld] = useState(true)
  const [filled, setFilled] = useState(false)
  const fill = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const goal = useRef({ progress: pending.progress, loaded: isLoaded })
  goal.current = { progress: status.progress, loaded: isLoaded }

  useEffect(() => {
    statusSetter = setStatus
    setStatus(pending)
    return () => {
      if (statusSetter === setStatus) {
        statusSetter = null
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setHeld(false), MIN_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    let shown = goal.current.progress
    let creep = 0
    let last: number | null = null
    let id = 0
    const draw = (value: number) => {
      fill.current?.style.setProperty("transform", `scaleX(${value.toFixed(4)})`)
      bar.current?.setAttribute("aria-valuenow", String(Math.round(value * 100)))
    }
    const step = (now: number) => {
      const elapsed = last === null ? 0 : Math.min(100, Math.max(0, now - last))
      last = now
      const { progress, loaded } = goal.current
      // While a step takes long, the bar keeps moving a little, slowing as it goes, so it never looks stuck.
      creep = loaded ? 0 : creep + (0.14 - creep) * (1 - Math.exp(-elapsed / 2600))
      const target = loaded ? 1 : Math.min(0.94, progress + creep)
      shown = reduced ? target : shown + (target - shown) * (1 - Math.exp(-elapsed / (loaded ? 55 : 220)))
      shown = Math.max(shown, 0)
      draw(shown)
      if (loaded && shown > 0.985) {
        draw(1)
        setFilled(true)
        return
      }
      id = frame(step)
    }
    draw(shown)
    id = frame(step)
    return () => cancelFrame(id)
  }, [])

  // It goes the moment the app is ready and the bar is full, as Word's does: fading it out over the start screen
  // as that drew itself showed both at once, and stale frames of each, in the desktop webview.
  if (isLoaded && !held && filled) {
    return null
  }

  return (
    <div className="splash-screen" role="presentation">
      <div className="splash-card" role="status" aria-live="polite" aria-busy="true" aria-label="Inkspire">
        <SplashPicture />
        <div className="splash-brand">
          <SplashMark size={52} />
          <span className="splash-name">Inkspire</span>
        </div>
        <div className="splash-foot">
          <div className="splash-status">{status.text}</div>
          <div
            ref={bar}
            className="splash-progress"
            role="progressbar"
            aria-label="Loading"
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span ref={fill} />
          </div>
        </div>
      </div>
    </div>
  )
}
