import { afterEach, describe, expect, it } from "vitest"
import { reportChromeReach, useChromeExtent } from "@/document/chrome-extent"
import { DEFAULT_PAGE_SETUP, pageMetrics } from "@/document/page-setup"

describe("chrome-extent", () => {
  afterEach(() => {
    for (const id of ["h1", "h2", "f1"]) {
      reportChromeReach(id, "header", null)
    }
  })

  it("keeps the tallest header and footer, and forgets a box that is gone", () => {
    reportChromeReach("h1", "header", 120.2)
    reportChromeReach("h2", "header", 300)
    reportChromeReach("f1", "footer", 80)
    expect(useChromeExtent.getState()).toEqual({ header: 300, footer: 80 })
    reportChromeReach("h2", "header", null)
    expect(useChromeExtent.getState().header).toBe(121)
  })

  it("pushes the body's margins only when the header or footer reaches past them", () => {
    const margin = pageMetrics(DEFAULT_PAGE_SETUP).marginTop
    reportChromeReach("h1", "header", margin - 20)
    expect(pageMetrics(DEFAULT_PAGE_SETUP).marginTop).toBe(margin)
    reportChromeReach("h1", "header", margin + 200)
    reportChromeReach("f1", "footer", 400)
    const pushed = pageMetrics(DEFAULT_PAGE_SETUP)
    expect(pushed.marginTop).toBe(Math.ceil(margin + 200))
    expect(pushed.marginBottom).toBe(400)
    expect(pushed.contentHeight).toBe(pushed.height - pushed.marginTop - 400)
  })
})
