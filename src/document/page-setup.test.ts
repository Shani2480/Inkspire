import { describe, expect, it } from "vitest"
import {
  clampMargin,
  columnCount,
  DEFAULT_PAGE_SETUP,
  formatPageSetup,
  pageBorder,
  pageMetrics,
  pageNumberPlace,
  paperBox,
  parsePageSetup,
  samePageSetup,
  spacingPreset,
} from "@/document/page-setup"

describe("page-setup", () => {
  it("round-trips paper size, orientation, and margins", () => {
    const setup = {
      ...DEFAULT_PAGE_SETUP,
      paper: "legal" as const,
      orientation: "landscape" as const,
      marginTop: 12.7,
      marginRight: 19.1,
      marginBottom: 25.4,
      marginLeft: 30,
    }
    const parsed = parsePageSetup(formatPageSetup(setup))
    expect(parsed.paper).toBe("legal")
    expect(parsed.orientation).toBe("landscape")
    expect(parsed.marginTop).toBe(12.7)
    expect(parsed.marginRight).toBe(19.1)
    expect(parsed.marginBottom).toBe(25.4)
    expect(parsed.marginLeft).toBe(30)
  })

  it("clamps margins and normalizes enums", () => {
    expect(clampMargin(5)).toBe(10)
    expect(clampMargin(100)).toBe(60)
    expect(clampMargin(Number.NaN)).toBe(DEFAULT_PAGE_SETUP.marginTop)
    expect(columnCount("2")).toBe(2)
    expect(columnCount("9")).toBe(9)
    expect(columnCount("40")).toBe(12)
    expect(columnCount("x")).toBe(1)
    expect(pageBorder("double")).toBe("double")
    expect(pageBorder("dashed")).toBe("none")
    expect(pageNumberPlace("top-center")).toBe("top-center")
    expect(pageNumberPlace("elsewhere")).toBe("bottom-center")
    expect(spacingPreset("open")).toBe("open")
    expect(spacingPreset("loose")).toBe("default")
  })

  it("computes paper box and metrics", () => {
    const portrait = paperBox(DEFAULT_PAGE_SETUP)
    const landscape = paperBox({ ...DEFAULT_PAGE_SETUP, orientation: "landscape" })
    expect(landscape.width).toBe(portrait.height)
    expect(landscape.height).toBe(portrait.width)

    const metrics = pageMetrics(DEFAULT_PAGE_SETUP)
    expect(metrics.width).toBeGreaterThan(0)
    expect(metrics.contentHeight).toBeLessThan(metrics.height)
    expect(samePageSetup(DEFAULT_PAGE_SETUP, { ...DEFAULT_PAGE_SETUP })).toBe(true)
    expect(samePageSetup(DEFAULT_PAGE_SETUP, { ...DEFAULT_PAGE_SETUP, paper: "a4" })).toBe(false)
  })
})
