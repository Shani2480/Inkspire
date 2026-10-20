// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { useViewStore } from "@/document/view"

afterEach(() => {
  localStorage.clear()
  useViewStore.getState().setColorMode("light")
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
})
