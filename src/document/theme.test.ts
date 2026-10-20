import { describe, expect, it } from "vitest"
import { THEME_OPTIONS, TEXT_CONTRAST, contextTabColor, contrastRatio } from "@/document/theme"

describe("contextual tab labels", () => {
  it("read clearly on the tab row for every theme, in light and dark mode", () => {
    for (const theme of THEME_OPTIONS) {
      expect(contrastRatio(contextTabColor(theme.value, "light"), "#ebebeb")).toBeGreaterThanOrEqual(TEXT_CONTRAST)
      expect(contrastRatio(contextTabColor(theme.value, "dark"), "#1e1e1e")).toBeGreaterThanOrEqual(TEXT_CONTRAST)
    }
  })

  it("keep the theme's own colour when it already reads well", () => {
    expect(contextTabColor("#2B579A", "light")).toBe("#2b579a")
    expect(contextTabColor("#0F172A", "dark")).not.toBe("#0f172a")
  })
})
