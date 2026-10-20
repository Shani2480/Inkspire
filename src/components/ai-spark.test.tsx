import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AiSpark } from "@/components/ai-spark"
import { AiThinking } from "@/components/ai-working"

describe("AI spark", () => {
  it("animates only while the AI is busy", () => {
    const { container, rerender } = render(<AiSpark />)
    expect(container.querySelector("svg")?.classList.contains("is-busy")).toBe(false)
    rerender(<AiSpark busy />)
    expect(container.querySelector("svg")?.classList.contains("is-busy")).toBe(true)
  })

  it("shows the spark alone until the first words arrive, then the words with it", () => {
    const { container, rerender } = render(<AiThinking />)
    expect(container.querySelector(".is-busy")).not.toBeNull()
    expect(container.textContent).toBe("")
    rerender(<AiThinking>Hello</AiThinking>)
    expect(container.textContent).toBe("Hello")
    expect(container.querySelector(".is-busy")).not.toBeNull()
  })
})
