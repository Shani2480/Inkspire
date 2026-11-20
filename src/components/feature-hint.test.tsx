import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FIRST_HINT_MS, FeatureHints, NEXT_HINT_MS } from "@/components/feature-hint"
import { useUserSettings } from "@/document/user-settings"
import { FEATURE_HINTS, HINTS_KEY, nextHint, useFeatureHints } from "@/lib/feature-hints"

/** A ribbon control as the browser lays it out (jsdom gives every element an empty box). */
function control(label: string) {
  const button = document.createElement("button")
  button.setAttribute("aria-label", label)
  button.getBoundingClientRect = () => ({ left: 100, top: 40, right: 160, bottom: 100, width: 60, height: 60 }) as DOMRect
  document.body.append(button)
  return button
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useFeatureHints.setState({ enabled: true, dismissed: [] })
  useUserSettings.setState({ setupDone: true })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  vi.useRealTimers()
})

describe("feature hints", () => {
  it("introduce only special features, each as news, with its own control", () => {
    const ids = FEATURE_HINTS.map((hint) => hint.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const hint of FEATURE_HINTS) {
      expect(hint.title.startsWith("New: ")).toBe(true)
      expect(hint.target).not.toBe("")
    }
    // Everyday commands get none.
    expect(FEATURE_HINTS.map((hint) => hint.target)).not.toContain("Bold")
  })

  it("pick the first one not dismissed whose control is on screen", () => {
    const shown = (target: string) => target === "Focus" || target === "Translate"
    expect(nextHint(FEATURE_HINTS, [], shown)?.id).toBe("focus")
    expect(nextHint(FEATURE_HINTS, ["focus"], shown)?.id).toBe("translate")
    expect(nextHint(FEATURE_HINTS, ["focus", "translate"], shown)).toBeNull()
  })

  it("show one at a time after a while, go for good on a tap, and wait before the next", () => {
    control("Focus")
    control("Translate")
    render(<FeatureHints />)
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => vi.advanceTimersByTime(FIRST_HINT_MS + 600))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.getByText("New: Focus")).toBeTruthy()

    fireEvent.click(screen.getByRole("dialog"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(useFeatureHints.getState().dismissed).toEqual(["focus"])
    expect(JSON.parse(localStorage.getItem(HINTS_KEY) ?? "{}")).toMatchObject({ dismissed: ["focus"] })

    act(() => vi.advanceTimersByTime(NEXT_HINT_MS - 1000))
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => vi.advanceTimersByTime(1600))
    expect(screen.getByText("New: Translate")).toBeTruthy()
  })

  it("go when the feature is used, and wait for a control that is not on screen", () => {
    const focus = control("Focus")
    render(<FeatureHints />)
    act(() => vi.advanceTimersByTime(FIRST_HINT_MS + 600))
    fireEvent.click(focus)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(useFeatureHints.getState().dismissed).toEqual(["focus"])
    act(() => vi.advanceTimersByTime(NEXT_HINT_MS + 600))
    // No other feature's control is on screen.
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("can be turned off, and shown again from the start", () => {
    control("Focus")
    useFeatureHints.getState().setEnabled(false)
    render(<FeatureHints />)
    act(() => vi.advanceTimersByTime(FIRST_HINT_MS + 600))
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => useFeatureHints.getState().showAgain())
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getByText("New: Focus")).toBeTruthy()
  })

  it("wait until the first-run setup is done", () => {
    control("Focus")
    useUserSettings.setState({ setupDone: false })
    render(<FeatureHints />)
    act(() => vi.advanceTimersByTime(FIRST_HINT_MS + 600))
    expect(screen.queryByText("New: Focus")).toBeNull()
  })
})
