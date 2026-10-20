import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { SplashScreen, setSplashLoadingStatus } from "@/components/splash-screen"
import { isLaunchWindow } from "@/document/windows"
import { useWindowChrome } from "@/lib/window-chrome"

const Workspace = lazy(() => import("@/workspace"))

/** Decided once, before the first render: only the app's first window shows the splash screen. */
const SHOW_SPLASH = isLaunchWindow()

function App() {
  const [startWorkspace, setStartWorkspace] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const isMaximized = useWindowChrome()
  const handleReady = useCallback(() => {
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    setSplashLoadingStatus("Loading modules...")
    setStartWorkspace(true)
  }, [])

  return (
    <div className={`app-window-frame${isMaximized ? " is-maximized" : ""}`}>
      {SHOW_SPLASH ? <SplashScreen isLoaded={isLoaded} /> : null}
      {startWorkspace ? (
        <Suspense fallback={null}>
          <Workspace onReady={handleReady} />
        </Suspense>
      ) : null}
    </div>
  )
}

export default App
