import { describe, expect, it } from "vitest"
import { createStepLock, pageForKey, wheelStep } from "@/components/backstage/preview-steps"

const fits = { scrollTop: 0, clientHeight: 400, scrollHeight: 400 }

describe("print preview page steps", () => {
  it("steps a page with the wheel when the page fits, and not on a pinch", () => {
    expect(wheelStep(100, fits)).toBe(1)
    expect(wheelStep(-100, fits)).toBe(-1)
    expect(wheelStep(100, fits, true)).toBe(0)
    expect(wheelStep(0, fits)).toBe(0)
  })

  it("scrolls inside a zoomed-in page first and steps at its edge", () => {
    const tall = { scrollTop: 100, clientHeight: 400, scrollHeight: 1000 }
    expect(wheelStep(100, tall)).toBe(0)
    expect(wheelStep(-100, tall)).toBe(0)
    expect(wheelStep(100, { ...tall, scrollTop: 600 })).toBe(1)
    expect(wheelStep(-100, { ...tall, scrollTop: 0 })).toBe(-1)
  })

  it("maps keys to pages and stays inside the document", () => {
    expect(pageForKey("PageDown", 0, 3)).toBe(1)
    expect(pageForKey("PageDown", 2, 3)).toBe(2)
    expect(pageForKey("PageUp", 0, 3)).toBe(0)
    expect(pageForKey("End", 0, 3)).toBe(2)
    expect(pageForKey("Home", 2, 3)).toBe(0)
    expect(pageForKey("a", 0, 3)).toBeNull()
  })

  it("turns one page per flick by ignoring the wheel events that follow a step", () => {
    let time = 0
    const lock = createStepLock(() => time)
    expect(lock.allow()).toBe(true)
    lock.stepped()
    for (time = 16; time < 600; time += 16) {
      expect(lock.allow()).toBe(false)
    }
    time += 200
    expect(lock.allow()).toBe(true)
  })
})
