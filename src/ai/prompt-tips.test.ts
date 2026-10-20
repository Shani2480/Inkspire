import { describe, expect, it } from "vitest"
import { PROMPT_TIPS, promptTip } from "@/ai/prompt-tips"

describe("prompt tips", () => {
  it("wraps around and never runs out", () => {
    expect(promptTip(0)).toBe(PROMPT_TIPS[0])
    expect(promptTip(PROMPT_TIPS.length)).toBe(PROMPT_TIPS[0])
    expect(promptTip(-1)).toBe(PROMPT_TIPS[PROMPT_TIPS.length - 1])
  })

  it("keeps each tip short", () => {
    for (const tip of PROMPT_TIPS) {
      expect(tip.length).toBeLessThan(130)
    }
  })
})
