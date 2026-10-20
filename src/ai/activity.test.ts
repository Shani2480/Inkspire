import { beforeEach, describe, expect, it } from "vitest"
import { useAiActivity } from "@/ai/activity"

describe("AI activity", () => {
  beforeEach(() => useAiActivity.setState({ count: 0 }))

  it("stays busy until every overlapping request has ended", () => {
    const { start, end } = useAiActivity.getState()
    start()
    start()
    end()
    expect(useAiActivity.getState().count).toBe(1)
    end()
    expect(useAiActivity.getState().count).toBe(0)
  })

  it("never goes below zero", () => {
    useAiActivity.getState().end()
    expect(useAiActivity.getState().count).toBe(0)
  })
})
