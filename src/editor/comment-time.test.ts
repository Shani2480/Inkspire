import { afterEach, describe, expect, it, vi } from "vitest"
import { relativeCommentTime } from "@/editor/comments"

afterEach(() => vi.useRealTimers())

describe("relativeCommentTime (22.18)", () => {
  it("counts up as time passes", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"))
    const created = new Date().toISOString()
    expect(relativeCommentTime(created)).toBe("A few seconds ago")
    vi.setSystemTime(new Date("2026-10-19T10:03:10Z"))
    expect(relativeCommentTime(created)).toBe("3m ago")
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"))
    expect(relativeCommentTime(created)).toBe("2h ago")
  })
})
