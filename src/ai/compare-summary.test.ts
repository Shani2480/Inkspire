import { describe, expect, it, vi } from "vitest"

let unavailable: string | null = null
const generate = vi.fn()
vi.mock("@/ai/availability", () => ({ aiUnavailableReason: async () => unavailable }))
vi.mock("@/ai/generate", () => ({
  generateAiText: (...args: unknown[]) => generate(...args),
  isAiCancelled: () => false,
}))

import { parseSummary, requestCompareSummary, summaryContext } from "@/ai/compare-summary"

const changes = [
  { kind: "deletion" as const, text: "quick" },
  { kind: "insertion" as const, text: "slow" },
]

describe("the change summary", () => {
  it("reads the model's lines, without their dashes", () => {
    expect(parseSummary("```\n- The fox is slow now\n* A third paragraph was added\n\n```")).toEqual([
      "The fox is slow now",
      "A third paragraph was added",
    ])
  })

  it("shows the model the changes in order, each cut short", () => {
    const long = { kind: "insertion" as const, text: "x".repeat(500) }
    const context = JSON.parse(summaryContext([...changes, long])) as { kind: string; text: string }[]
    expect(context.map((change) => change.kind)).toEqual(["deletion", "insertion", "insertion"])
    expect(context[2].text).toHaveLength(240)
  })

  it("asks the model and returns its lines", async () => {
    unavailable = null
    generate.mockResolvedValueOnce("- The fox became slow")
    const summary = await requestCompareSummary(changes, "c1")
    expect(summary).toEqual({ blocked: null, lines: ["The fox became slow"] })
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining("Summarise"),
      summaryContext(changes),
      expect.objectContaining({ plain: true, quiet: true, requestId: "c1" }),
    )
  })

  it("says why there is no summary when the AI cannot be reached", async () => {
    unavailable = "Open the desktop app to use AI."
    generate.mockReset()
    const summary = await requestCompareSummary(changes, "c2")
    expect(summary).toEqual({ blocked: "Open the desktop app to use AI.", lines: [] })
    expect(generate).not.toHaveBeenCalled()
    unavailable = null
  })
})
