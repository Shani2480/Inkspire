import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_PAGE_SETUP, pageMetrics } from "@/document/page-setup"
import { useViewStore } from "@/document/view"

describe("Web Layout", () => {
  beforeEach(() => useViewStore.setState({ layoutMode: "print", webWidth: 0, zoomMode: "manual", zoom: 1 }))

  it("measures the sheet in Print Layout and the window in Web Layout", () => {
    const sheet = pageMetrics(DEFAULT_PAGE_SETUP)
    useViewStore.setState({ layoutMode: "web", webWidth: 1200 })
    const web = pageMetrics(DEFAULT_PAGE_SETUP)
    expect(web.width).toBe(1200)
    // One page too tall to ever fill, so no break is made.
    expect(web.contentHeight).toBeGreaterThan(sheet.contentHeight * 100)
    // The sheet itself is still there for what needs the paper, such as the print preview.
    expect(pageMetrics(DEFAULT_PAGE_SETUP, true)).toEqual(sheet)
  })

  it("stays on the sheet until the window's width is known", () => {
    const sheet = pageMetrics(DEFAULT_PAGE_SETUP)
    useViewStore.setState({ layoutMode: "web", webWidth: 0 })
    expect(pageMetrics(DEFAULT_PAGE_SETUP)).toEqual(sheet)
  })

  it("drops a fit-to-page zoom, which measures a sheet, when the view has none", () => {
    useViewStore.setState({ zoomMode: "page", zoom: 0.7 })
    useViewStore.getState().setLayoutMode("web")
    expect(useViewStore.getState()).toMatchObject({ zoomMode: "manual", zoom: 1 })
  })
})

describe("Read Mode", () => {
  beforeEach(() => useViewStore.setState({ layoutMode: "print", focusMode: false }))

  it("no longer turns Focus on, since it has its own bar", () => {
    useViewStore.getState().setLayoutMode("read")
    expect(useViewStore.getState().focusMode).toBe(false)
  })

  it("keeps the View menu's choices as they were set", () => {
    const view = useViewStore.getState()
    view.setReadColumnWidth("wide")
    view.setReadPageColor("sepia")
    view.setReadLayout("paper")
    expect(useViewStore.getState()).toMatchObject({
      readColumnWidth: "wide",
      readPageColor: "sepia",
      readLayout: "paper",
    })
  })
})
