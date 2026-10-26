import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { suppressBrowserContextMenu } from "./lib/context-menu-guard"
import { isWebKitGtk } from "./lib/platform"

suppressBrowserContextMenu()
// Read by the motion styles in index.css and by prefersReducedMotion.
document.documentElement.toggleAttribute("data-no-entrance", isWebKitGtk())

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
