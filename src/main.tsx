import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { suppressBrowserContextMenu } from "./lib/context-menu-guard"
import { installEntrances } from "./document/entrances"
import { installSheetSwipe } from "@/lib/sheet-swipe"
import { installDevice } from "./lib/device"

installDevice()
installSheetSwipe()
suppressBrowserContextMenu()
installEntrances()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
