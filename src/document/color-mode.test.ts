// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_THEME_BACKGROUND, THEME_OPTIONS } from "@/document/theme"
import { useViewStore } from "@/document/view"

afterEach(() => {
  localStorage.clear()
  useViewStore.getState().setColorMode("light")
  useViewStore.getState().setThemeBackground(DEFAULT_THEME_BACKGROUND)
})

describe("light and dark across windows", () => {
  it("follows another window that changes it, and applies it to the page", () => {
    useViewStore.getState().setColorMode("light")
    window.dispatchEvent(new StorageEvent("storage", { key: "aiword-color-mode", newValue: "dark" }))
    expect(useViewStore.getState().colorMode).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.dataset.theme).toBe("dark")
    window.dispatchEvent(new StorageEvent("storage", { key: "aiword-color-mode", newValue: "light" }))
    expect(useViewStore.getState().colorMode).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("ignores other keys", () => {
    useViewStore.getState().setColorMode("light")
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "dark" }))
    expect(useViewStore.getState().colorMode).toBe("light")
  })

  it("follows another window's accent colour, and keeps what this window chooses for the others", () => {
    const green = THEME_OPTIONS[2].value
    useViewStore.getState().setThemeBackground(green)
    expect(localStorage.getItem("inkspire-theme-accent")).toBe(green)
    const amber = THEME_OPTIONS[3].value
    window.dispatchEvent(new StorageEvent("storage", { key: "inkspire-theme-accent", newValue: amber }))
    // The event carries the other window's write; this window reads the shared value back.
    localStorage.setItem("inkspire-theme-accent", amber)
    window.dispatchEvent(new StorageEvent("storage", { key: "inkspire-theme-accent", newValue: amber }))
    expect(useViewStore.getState().themeBackground).toBe(amber)
  })

  it("ignores a colour that is not one of the themes", () => {
    localStorage.setItem("inkspire-theme-accent", "red")
    window.dispatchEvent(new StorageEvent("storage", { key: "inkspire-theme-accent", newValue: "red" }))
    expect(useViewStore.getState().themeBackground).toBe(DEFAULT_THEME_BACKGROUND)
  })
})
