import { useEffect, useState } from "react"
import splashArt from "@/assets/splash.png"

const INITIAL_STATUS = "Starting..."
const MIN_VISIBLE_MS = 250

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
  const [artReady, setArtReady] = useState(false)

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

  // It goes the moment the app is ready, as Word's does: fading it out over the start screen as that drew itself
  // showed both at once, and stale frames of each, in the desktop webview.
  if (isLoaded && !held) {
    return null
  }

  return (
    <div className="splash-screen" role="presentation">
      <div
        className={artReady ? "splash-card is-ready" : "splash-card"}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Inkspire"
      >
        <img
          className="splash-art"
          src={splashArt}
          alt=""
          draggable={false}
          onLoad={() => setArtReady(true)}
          onError={() => setArtReady(true)}
        />
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
