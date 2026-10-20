import { afterEach, describe, expect, it } from "vitest"
import { useBackstage } from "@/document/backstage"

afterEach(() => {
  useBackstage.setState({ open: true, tab: "home", closed: false })
})

describe("File view with no document open", () => {
  it("cannot be left until a document is created or opened", () => {
    useBackstage.getState().setClosed(true)
    useBackstage.getState().openBackstage("home")
    useBackstage.getState().closeBackstage()
    expect(useBackstage.getState().open).toBe(true)

    useBackstage.getState().setClosed(false)
    useBackstage.getState().closeBackstage()
    expect(useBackstage.getState().open).toBe(false)
  })
})
