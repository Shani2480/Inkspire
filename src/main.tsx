import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { suppressBrowserContextMenu } from "./lib/context-menu-guard"
import { installEntrances } from "./document/entrances"
import { installAndroidBack } from "@/lib/android-back"
import { installSheetSwipe } from "@/lib/sheet-swipe"
import { installDevice } from "./lib/device"

installDevice()
// One device pixel, the thinnest line the screen draws (index.css, `--cell-bt`: Word's hairline table borders).
const setHair = () => document.documentElement.style.setProperty("--hair", `${1 / (window.devicePixelRatio || 1)}px`)
setHair()
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.("change", setHair)
installSheetSwipe()
installAndroidBack()
suppressBrowserContextMenu()
installEntrances()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
