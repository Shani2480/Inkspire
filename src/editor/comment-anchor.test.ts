import { describe, expect, it } from "vitest"
import { commentAnchorPoints, markCommentEnds } from "@/editor/comment-anchor"

const range = { left: 100, top: 200, right: 160, bottom: 220 }

describe("commentAnchorPoints", () => {
  it("runs straight along the line into a card beside it", () => {
    expect(commentAnchorPoints(range, { left: 400, top: 180, right: 680, bottom: 300 })).toEqual([
      [160, 210],
      [400, 210],
    ])
  })

  it("bends to a card placed below the line", () => {
    expect(commentAnchorPoints(range, { left: 400, top: 260, right: 680, bottom: 380 })).toEqual([
      [160, 210],
      [388, 210],
      [400, 272],
    ])
  })

  it("starts at the range's start for a card on its left", () => {
    expect(commentAnchorPoints(range, { left: 0, top: 180, right: 60, bottom: 300 })).toEqual([
      [100, 210],
      [60, 210],
    ])
  })

  it("draws nothing when the card covers the range", () => {
    expect(commentAnchorPoints(range, { left: 120, top: 180, right: 400, bottom: 300 })).toBeNull()
  })
})

describe("markCommentEnds", () => {
  it("brackets only the first and last piece of the active comment", () => {
    const marks = ["a", "a", "a", "b"].map((id) => {
      const span = document.createElement("span")
      span.setAttribute("data-comment-id", id)
      return span
    })
    markCommentEnds(marks, "a")
    expect(marks.map((mark) => mark.className)).toEqual(["is-active is-first", "is-active", "is-active is-last", ""])
    markCommentEnds(marks, null)
    expect(marks.every((mark) => !mark.className)).toBe(true)
  })
})
