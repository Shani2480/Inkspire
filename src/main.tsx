import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { suppressBrowserContextMenu } from "./lib/context-menu-guard"
import { installEntrances } from "./document/entrances"

suppressBrowserContextMenu()
installEntrances()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
