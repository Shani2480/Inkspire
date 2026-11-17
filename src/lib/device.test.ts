import { describe, expect, it } from "vitest"
import { detectDevice } from "@/lib/device"
import { pointOnText } from "@/editor/tap-caret"

describe("the kind of screen", () => {
  it("is a phone when a touch screen's short side is under 600 css px, either way round", () => {
    expect(detectDevice({ width: 412, height: 915 }, true)).toBe("phone")
    expect(detectDevice({ width: 915, height: 412 }, true)).toBe("phone")
  })

  it("is a tablet when a touch screen is larger, and a desktop without a touch screen", () => {
    expect(detectDevice({ width: 1078, height: 1524 }, true)).toBe("tablet")
    expect(detectDevice({ width: 412, height: 915 }, false)).toBe("desktop")
    expect(detectDevice(null, true)).toBe("desktop")
  })
})

describe("a tap outside the text", () => {
  const text = { left: 100, top: 200, right: 500, bottom: 900 }

  it("lands on the line beside it from the margins, and on the first or last line above and below", () => {
    expect(pointOnText({ x: 20, y: 400 }, text)).toEqual({ x: 101, y: 400 })
    expect(pointOnText({ x: 600, y: 400 }, text)).toEqual({ x: 499, y: 400 })
    expect(pointOnText({ x: 300, y: 50 }, text)).toEqual({ x: 300, y: 201 })
    expect(pointOnText({ x: 300, y: 2000 }, text)).toEqual({ x: 300, y: 899 })
  })

  it("stays where it is inside the text", () => {
    expect(pointOnText({ x: 300, y: 400 }, text)).toEqual({ x: 300, y: 400 })
  })
})
