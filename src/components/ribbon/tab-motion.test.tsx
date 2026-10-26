import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TAB_MOTION_MS, useTabMotion } from "@/components/ribbon/tab-motion"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const card = { current: document.createElement("div") }
  const { result } = renderHook(() => useTabMotion(card))
  return { card: card.current, start: () => act(() => result.current.start()) }
}

describe("the ribbon tab animation (21.40)", () => {
  it("is still at first and moves only after a tab is chosen", () => {
    const { card, start } = setup()
    expect(card.dataset.tabMotion).toBeUndefined()
    start()
    expect(card.dataset.tabMotion).toBeDefined()
  })

  it("draws the new tab's first frame with its commands unseen, and slides them in from the next", () => {
    const { card, start } = setup()
    start()
    expect(card.dataset.tabMotion).toBe("waiting")
    vi.advanceTimersToNextFrame()
    expect(card.dataset.tabMotion).toBe("waiting")
    vi.advanceTimersToNextFrame()
    expect(card.dataset.tabMotion).toBe("on")
  })

  it("settles once the animation has run", () => {
    const { card, start } = setup()
    start()
    vi.advanceTimersByTime(TAB_MOTION_MS + 100)
    expect(card.dataset.tabMotion).toBeUndefined()
  })

  it("starts over when another tab is chosen at once, and the last choice settles last", () => {
    const { card, start } = setup()
    start()
    vi.advanceTimersByTime(TAB_MOTION_MS - 20)
    start()
    expect(card.dataset.tabMotion).toBe("waiting")
    vi.advanceTimersByTime(TAB_MOTION_MS - 20)
    expect(card.dataset.tabMotion).toBe("on")
    vi.advanceTimersByTime(100)
    expect(card.dataset.tabMotion).toBeUndefined()
  })

  it("stays still in the Linux desktop app, whose webview replays a frame of it after it has settled", () => {
    document.documentElement.setAttribute("data-no-entrance", "")
    try {
      const { card, start } = setup()
      start()
      expect(card.dataset.tabMotion).toBeUndefined()
    } finally {
      document.documentElement.removeAttribute("data-no-entrance")
    }
  })
})
