import { describe, expect, it } from "vitest"
import { findInPieces, readPageAt, readPageCount, readPageStep, useReadFind } from "@/document/read-pages"

describe("Read Mode pages", () => {
  it("steps by the view's width plus the gap", () => {
    expect(readPageStep(1000, 64)).toBe(1064)
  })

  it("counts the screens that hold the columns", () => {
    expect(readPageCount(1000, 1000, 64)).toBe(1)
    expect(readPageCount(2064, 1000, 64)).toBe(2)
    expect(readPageCount(2065, 1000, 64)).toBe(2)
    expect(readPageCount(3200, 1000, 64)).toBe(4)
    expect(readPageCount(3128, 1000, 64)).toBe(3)
  })

  it("finds the page a scroll position is on", () => {
    expect(readPageAt(0, 1000, 64)).toBe(0)
    expect(readPageAt(1064, 1000, 64)).toBe(1)
    expect(readPageAt(1500, 1000, 64)).toBe(1)
    expect(readPageAt(1700, 1000, 64)).toBe(2)
  })
})

describe("Find in Read Mode", () => {
  it("finds every match, ignoring case, across the pieces the text comes in", () => {
    const found = findInPieces(["The cat sat. ", "A C", "AT ran."], "cat")
    expect(found).toEqual([
      { start: { piece: 0, offset: 4 }, end: { piece: 0, offset: 7 } },
      { start: { piece: 1, offset: 2 }, end: { piece: 2, offset: 2 } },
    ])
  })

  it("finds nothing for an empty query, and skips empty pieces", () => {
    expect(findInPieces(["abc"], "")).toEqual([])
    expect(findInPieces(["ab", "", "c"], "c")).toEqual([
      { start: { piece: 2, offset: 0 }, end: { piece: 2, offset: 1 } },
    ])
  })

  it("steps through the matches round and round", () => {
    const find = useReadFind.getState()
    find.show()
    find.setQuery("x")
    useReadFind.getState().setCount(3)
    useReadFind.getState().move(-1)
    expect(useReadFind.getState().current).toBe(2)
    useReadFind.getState().move(1)
    expect(useReadFind.getState().current).toBe(0)
    useReadFind.getState().hide()
    expect(useReadFind.getState()).toMatchObject({ open: false, query: "", count: 0 })
  })
})
