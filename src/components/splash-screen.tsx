import { useEffect, useState, type TransitionEvent } from "react"
import splashArt from "@/assets/splash.png"

const INITIAL_STATUS = "Starting..."
const MIN_VISIBLE_MS = 900

type StatusSetter = (status: string) => void

let pendingStatus = INITIAL_STATUS
let statusSetter: StatusSetter | null = null

/** Updates the splash copy. Safe to call from the boot loop before or after mount. */
export function setSplashLoadingStatus(status: string) {
  pendingStatus = status
  statusSetter?.(status)
}

type SplashScreenProps = {
  isLoaded: boolean
}

export function SplashScreen({ isLoaded }: SplashScreenProps) {
  const [loadingStatus, setLoadingStatus] = useState(pendingStatus)
  const [held, setHeld] = useState(true)
  const [present, setPresent] = useState(true)
  const closing = isLoaded && !held

  useEffect(() => {
    statusSetter = setLoadingStatus
    setLoadingStatus(pendingStatus)
    return () => {
      if (statusSetter === setLoadingStatus) {
        statusSetter = null
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setHeld(false), MIN_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "opacity" || !closing) {
      return
    }
    setPresent(false)
  }

  if (!present) {
    return null
  }

  return (
    <div
      className={closing ? "splash-screen is-loaded" : "splash-screen"}
      role="presentation"
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="splash-card" role="status" aria-live="polite" aria-busy={!closing} aria-label="Inkspire">
        <img className="splash-art" src={splashArt} alt="" draggable={false} />
        <div className="splash-overlay">
          <div className="splash-progress" aria-hidden="true">
            <span />
          </div>
          <div className="splash-status">{loadingStatus}</div>
        </div>
      </div>
    </div>
  )
}
