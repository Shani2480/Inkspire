import { describe, expect, it } from "vitest"
import { fromTouch } from "@/components/popup-chip"

const press = (type: string) => window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: type }))

describe("a long press on a touch screen", () => {
  it("is not a right-click: the system's own selection bar shows instead of the full menu", () => {
    press("touch")
    expect(fromTouch(new MouseEvent("contextmenu"))).toBe(true)
    expect(fromTouch(new PointerEvent("contextmenu", { pointerType: "touch" }))).toBe(true)
  })

  it("leaves a mouse's right-click to open the menu, as in Word", () => {
    press("mouse")
    expect(fromTouch(new MouseEvent("contextmenu", { button: 2 }))).toBe(false)
    expect(fromTouch(new PointerEvent("contextmenu", { pointerType: "mouse" }))).toBe(false)
  })
})
