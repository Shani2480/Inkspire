import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SplashScreen, setSplashLoadingStatus } from "@/components/splash-screen"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const shownValue = (container: HTMLElement) =>
  Number(container.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"))

describe("the splash screen", () => {
  it("draws its mark, name and bar from the first frame, with no picture to wait for", () => {
    const { container } = render(<SplashScreen isLoaded={false} />)
    expect(container.querySelector(".splash-mark")).not.toBeNull()
    expect(container.querySelector(".splash-name")?.textContent).toBe("Inkspire")
    expect(container.querySelector("img")).toBeNull()
  })

  it("fills its bar as the app loads, and never goes back", () => {
    const { container } = render(<SplashScreen isLoaded={false} />)
    act(() => {
      setSplashLoadingStatus("Opening Inkspire...", 0.7)
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    const later = shownValue(container)
    expect(later).toBeGreaterThanOrEqual(60)
    expect(later).toBeLessThan(100)
    expect(container.querySelector(".splash-status")?.textContent).toBe("Opening Inkspire...")
    act(() => {
      setSplashLoadingStatus("Starting...", 0.1)
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(shownValue(container)).toBeGreaterThanOrEqual(later)
  })

  it("runs the bar to the end and goes at once when the app is ready, without fading over it", () => {
    const { container, rerender } = render(<SplashScreen isLoaded={false} />)
    rerender(<SplashScreen isLoaded />)
    // Still held for its minimum time, so it never just flashes.
    expect(container.querySelector(".splash-screen")).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(container.querySelector(".splash-screen")).toBeNull()
  })
})
