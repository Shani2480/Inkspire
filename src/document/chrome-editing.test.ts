import { beforeEach, describe, expect, it } from "vitest"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { useViewStore } from "@/document/view"

describe("editing the header and footer", () => {
  beforeEach(() => {
    useViewStore.setState({ editingChrome: false, chromeTarget: { part: "header", page: 0 } })
    useActiveChromeEditor.setState({ editor: null })
  })

  it("opens the chosen part on the chosen page", () => {
    useViewStore.getState().editChrome("footer", 2)
    expect(useViewStore.getState().editingChrome).toBe(true)
    expect(useViewStore.getState().chromeTarget).toEqual({ part: "footer", page: 2 })
  })

  it("starts on the first page when none is given", () => {
    useViewStore.getState().editChrome("header")
    expect(useViewStore.getState().chromeTarget).toEqual({ part: "header", page: 0 })
  })
})
