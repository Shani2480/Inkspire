import { afterEach, describe, expect, it } from "vitest"
import { suppressBrowserContextMenu } from "@/lib/context-menu-guard"

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ""
})

function rightClick(element: Element) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe("no browser context menu (21.33)", () => {
  it("blocks a spot where the app has no menu", () => {
    stop = suppressBrowserContextMenu()
    const bar = document.body.appendChild(document.createElement("div"))
    expect(rightClick(bar).defaultPrevented).toBe(true)
  })

  it("leaves an app menu's own handler working", () => {
    stop = suppressBrowserContextMenu()
    const page = document.body.appendChild(document.createElement("div"))
    let opened = 0
    page.addEventListener("contextmenu", (event) => {
      opened += 1
      event.preventDefault()
    })
    expect(rightClick(page).defaultPrevented).toBe(true)
    expect(opened).toBe(1)
  })

  it("keeps the native menu on a text field and blocks it on a button or checkbox", () => {
    stop = suppressBrowserContextMenu()
    const input = document.body.appendChild(document.createElement("input"))
    const area = document.body.appendChild(document.createElement("textarea"))
    const box = document.body.appendChild(document.createElement("input"))
    box.type = "checkbox"
    expect(rightClick(input).defaultPrevented).toBe(false)
    expect(rightClick(area).defaultPrevented).toBe(false)
    expect(rightClick(box).defaultPrevented).toBe(true)
  })

  it("stops blocking once removed", () => {
    suppressBrowserContextMenu()()
    const bar = document.body.appendChild(document.createElement("div"))
    expect(rightClick(bar).defaultPrevented).toBe(false)
  })
})
