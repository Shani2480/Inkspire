import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SplashScreen } from "@/components/splash-screen"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("the splash screen", () => {
  it("keeps its card hidden until the picture has loaded", () => {
    const { container } = render(<SplashScreen isLoaded={false} />)
    const card = container.querySelector(".splash-card")!
    expect(card.classList.contains("is-ready")).toBe(false)
    fireEvent.load(container.querySelector(".splash-art")!)
    expect(card.classList.contains("is-ready")).toBe(true)
  })

  it("goes at once when the app is ready, without fading over it", () => {
    const { container, rerender } = render(<SplashScreen isLoaded={false} />)
    rerender(<SplashScreen isLoaded />)
    // Still held for its minimum time, so it never just flashes.
    expect(container.querySelector(".splash-screen")).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(container.querySelector(".splash-screen")).toBeNull()
  })
})
