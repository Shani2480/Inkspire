import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TAB_MOTION_MS, useTabMotion } from "@/components/ribbon/tab-motion"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  document.documentElement.removeAttribute("data-no-motion")
})

function setup() {
  const card = document.createElement("div")
  const hidden = document.createElement("div")
  hidden.dataset.slot = "tabs-content"
  hidden.hidden = true
  const panel = document.createElement("div")
  panel.dataset.slot = "tabs-content"
  card.append(hidden, panel)
  const { result } = renderHook(() => useTabMotion({ current: card }))
  return { panel, hidden, start: () => act(() => result.current.start()) }
}

describe("the ribbon tab animation (21.40)", () => {
  it("leaves the tab alone until one is chosen", () => {
    const { panel } = setup()
    vi.advanceTimersToNextFrame()
    expect(panel.style.opacity).toBe("")
  })

  it("brings the shown tab's commands in from unseen and a little to the right, frame by frame", () => {
    const { panel, hidden, start } = setup()
    start()
    // The tab is shown once the switch has rendered: the frame after, it starts out unseen.
    vi.advanceTimersToNextFrame()
    expect(panel.style.opacity).toBe("0")
    expect(panel.style.translate).toBe("12px 0px")
    expect(hidden.style.opacity).toBe("")
    vi.advanceTimersToNextFrame()
    const opacity = Number(panel.style.opacity)
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)
  })

  it("settles in place, with the motion's end written rather than removed", () => {
    const { panel, start } = setup()
    start()
    vi.advanceTimersByTime(TAB_MOTION_MS + 100)
    expect(panel.style.opacity).toBe("1")
    expect(panel.style.translate).toBe("0px 0px")
  })

  it("starts over when another tab is chosen at once", () => {
    const { panel, start } = setup()
    start()
    vi.advanceTimersByTime(TAB_MOTION_MS - 50)
    start()
    vi.advanceTimersToNextFrame()
    expect(panel.style.opacity).toBe("0")
  })

  it("does not move with animation turned off", () => {
    document.documentElement.setAttribute("data-no-motion", "")
    const { panel, start } = setup()
    start()
    vi.advanceTimersToNextFrame()
    expect(panel.style.opacity).toBe("")
  })
})
