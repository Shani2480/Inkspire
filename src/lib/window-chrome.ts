import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { isTauriRuntime } from "@/lib/platform"

const MAXIMIZED_CLASS = "is-maximized"

function applyMaximizedClass(active: boolean) {
  document.documentElement.classList.toggle(MAXIMIZED_CLASS, active)
  document.getElementById("root")?.classList.toggle(MAXIMIZED_CLASS, active)
}

async function readExpandedState() {
  const appWindow = getCurrentWindow()
  const [maximized, fullscreen] = await Promise.all([appWindow.isMaximized(), appWindow.isFullscreen()])
  return maximized || fullscreen
}

/** Tracks maximized/fullscreen and mirrors `.is-maximized` onto `html` / `#root`. */
export function useWindowChrome() {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!isTauriRuntime()) {
      applyMaximizedClass(false)
      return
    }

    const appWindow = getCurrentWindow()
    let disposed = false
    let unlistenResize: (() => void) | undefined

    const sync = () => {
      void readExpandedState()
        .then((value) => {
          if (disposed) {
            return
          }
          setExpanded(value)
          applyMaximizedClass(value)
        })
        .catch(() => undefined)
    }

    sync()

    void appWindow
      .onResized(() => {
        sync()
      })
      .then((dispose) => {
        if (disposed) {
          dispose()
        } else {
          unlistenResize = dispose
        }
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlistenResize?.()
      applyMaximizedClass(false)
    }
  }, [])

  return expanded
}
