import { beforeEach, describe, expect, it } from "vitest"
import { COVER_PAGES, deleteSavedCover, saveCover, savedCovers } from "@/editor/cover-page"

describe("Cover page gallery (22.16)", () => {
  beforeEach(() => localStorage.clear())

  it("has Word's set of covers, each once", () => {
    const ids = COVER_PAGES.map((cover) => cover.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      "austin",
      "filigree",
      "grid",
      "integral",
      "ion-dark",
      "ion-light",
      "retrospect",
      "semaphore",
      "slice",
    ]) {
      expect(ids).toContain(id)
    }
  })

  it("keeps a saved cover and replaces one with the same name", () => {
    saveCover({ name: "Mine", variant: "grid", title: "A", subtitle: "B" })
    saveCover({ name: "Mine", variant: "slice", title: "C", subtitle: "D" })
    expect(savedCovers()).toEqual([{ name: "Mine", variant: "slice", title: "C", subtitle: "D" }])
  })

  it("deletes a saved cover from the gallery", () => {
    saveCover({ name: "A", variant: "grid", title: "", subtitle: "" })
    saveCover({ name: "B", variant: "slice", title: "", subtitle: "" })
    deleteSavedCover("A")
    expect(savedCovers().map((cover) => cover.name)).toEqual(["B"])
  })

  it("ignores damaged stored covers", () => {
    localStorage.setItem(
      "aiword.cover-gallery",
      JSON.stringify([{ name: 1 }, { name: "x", variant: "nope", title: "", subtitle: "" }]),
    )
    expect(savedCovers()).toEqual([])
  })
})
