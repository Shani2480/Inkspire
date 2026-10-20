import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TAB_MOTION_MS, useTabMotion } from "@/components/ribbon/tab-motion"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("the ribbon tab animation (21.40)", () => {
  it("is still at first and moves only after a tab is chosen", () => {
    const { result } = renderHook(() => useTabMotion())
    expect(result.current.moving).toBe(false)
    act(() => result.current.start())
    expect(result.current.moving).toBe(true)
  })

  it("settles once the animation has run", () => {
    const { result } = renderHook(() => useTabMotion())
    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(TAB_MOTION_MS + 60)
    })
    expect(result.current.moving).toBe(false)
  })

  it("starts over when another tab is chosen at once, and the last choice settles last", () => {
    const { result } = renderHook(() => useTabMotion())
    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(TAB_MOTION_MS - 20)
    })
    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(TAB_MOTION_MS - 20)
    })
    expect(result.current.moving).toBe(true)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.moving).toBe(false)
  })
})
