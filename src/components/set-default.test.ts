import { afterEach, describe, expect, it } from "vitest"
import { styleFontAt, type Marks } from "@/components/ribbon/home-menus"
import { setNormalDefault } from "@/components/set-default-dialog"
import { BUILT_IN_STYLES, defaultStyles, resetDefaultStyles, useStyleStore } from "@/document/styles"

afterEach(() => {
  resetDefaultStyles()
  useStyleStore.getState().load(BUILT_IN_STYLES)
})

describe("Set As Default", () => {
  it("changes this document's Normal style only", () => {
    useStyleStore.getState().load(BUILT_IN_STYLES)
    setNormalDefault("document", { font: { family: "Georgia", size: 14 } })
    const normal = useStyleStore.getState().styles.find((style) => style.id === "normal")
    expect(normal).toMatchObject({ changed: true, font: { family: "Georgia", size: 14 } })
    expect(defaultStyles().find((style) => style.id === "normal")?.font.family).toBeUndefined()
  })

  it("saves the Normal style for new documents when asked", () => {
    useStyleStore.getState().load(BUILT_IN_STYLES)
    setNormalDefault("all", { paragraph: { after: 4, line: 1.15 } })
    expect(defaultStyles().find((style) => style.id === "normal")?.paragraph).toMatchObject({ after: 4, line: 1.15 })
  })

  it("carries a font saved the old way over to the Normal style, once", () => {
    localStorage.setItem("aiword-font-default", JSON.stringify({ family: "Verdana", size: "10", color: "#112233" }))
    const normal = defaultStyles().find((style) => style.id === "normal")
    expect(normal?.font).toMatchObject({ family: "Verdana", size: 10, color: "#112233" })
    expect(localStorage.getItem("aiword-font-default")).toBeNull()
  })
})

describe("styleFontAt", () => {
  it("shows the Normal style's font where the text has none of its own", () => {
    const styles = BUILT_IN_STYLES.map((style) =>
      style.id === "normal" ? { ...style, font: { ...style.font, family: "Georgia, serif", size: 16 } } : style,
    )
    const marks = { charStyle: "", headingLevel: 0, namedStyle: "", wordStyle: "" } as Marks
    expect(styleFontAt(marks, styles)).toEqual({ family: "Georgia, serif", size: "16pt" })
    expect(styleFontAt({ ...marks, headingLevel: 1 }, styles)).toEqual({ family: "Georgia, serif", size: "22pt" })
  })
})
