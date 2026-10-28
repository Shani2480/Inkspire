import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanIcon,
  ribbonCommandAt,
  ribbonCommandEnabled,
  ribbonCommandsOn,
  runRibbonCommand,
} from "@/components/ribbon/ribbon-commands"

function ribbon() {
  document.body.innerHTML = `
    <div data-ribbon-tab="insert" data-ribbon-tab-label="Insert">
      <button aria-label="Page Break"><svg viewBox="0 0 16 16" class="x" onclick="alert(1)"><path d="M0 0h16"/><script>alert(1)</script></svg></button>
      <button aria-label="Table" aria-disabled="true"><svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg></button>
      <button aria-label="Page Break"><svg/></button>
      <button aria-label="Scroll ribbon right"></button>
    </div>
    <button aria-label="Outside"></button>`
  return document.querySelector<HTMLElement>("[data-ribbon-tab]")!
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("ribbon commands on the Quick Access Toolbar (22.5)", () => {
  it("names a ribbon button by its tab and label and keeps its icon, safely", () => {
    const panel = ribbon()
    const command = ribbonCommandAt(panel.querySelector("path"))
    expect(command?.id).toBe("ribbon:insert:Page Break")
    expect(command?.look.tab).toBe("Insert")
    expect(command?.look.icon).toContain("<path")
    expect(command?.look.icon).not.toMatch(/script|onclick|class=/)
    // Not on the ribbon, or not a command.
    expect(ribbonCommandAt(document.querySelector("[aria-label=Outside]"))).toBeNull()
    expect(ribbonCommandAt(panel.querySelector("[aria-label^=Scroll]"))).toBeNull()
  })

  it("lists a tab's commands once each", () => {
    ribbon()
    expect(ribbonCommandsOn("insert").map((command) => command.label)).toEqual(["Page Break", "Table"])
  })

  it("runs a command by pressing its ribbon button, and not when it is off or gone", () => {
    const panel = ribbon()
    const pressed = vi.fn()
    panel.querySelector("[aria-label='Page Break']")!.addEventListener("click", pressed)
    expect(runRibbonCommand("ribbon:insert:Page Break")).toBe(true)
    expect(pressed).toHaveBeenCalledOnce()
    expect(ribbonCommandEnabled("ribbon:insert:Table")).toBe(false)
    expect(runRibbonCommand("ribbon:insert:Table")).toBe(false)
    expect(ribbonCommandEnabled("ribbon:ctx-picture:Crop")).toBe(false)
  })

  it("draws only plain SVG from saved settings", () => {
    expect(
      cleanIcon('<svg xmlns="http://www.w3.org/2000/svg"><image href="x"/><path d="M0 0" onload="x()"/></svg>'),
    ).toBe('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
    expect(cleanIcon("<div>no</div>")).toBe("")
    expect(cleanIcon("")).toBe("")
  })
})
