import { describe, expect, it } from "vitest"
import { explainAiError } from "@/ai/errors"

describe("explainAiError", () => {
  it("names the cause and offers the settings when the configuration is at fault", () => {
    expect(explainAiError(new Error("OpenAI rejected the API key."), "openai")).toMatchObject({
      message: expect.stringContaining("(401)"),
      settings: true,
    })
    expect(explainAiError(new Error("Add a Anthropic key in AI Tools."), "anthropic").settings).toBe(true)
    const ollama = explainAiError(
      new Error("Could not reach the AI provider. For Local Ollama, start the Ollama app and try again."),
      "ollama",
    )
    expect(ollama.message).toContain("localhost:11434")
    expect(ollama.settings).toBe(true)
  })

  it("explains rate limits and timeouts without the settings button", () => {
    expect(explainAiError("The AI provider returned status 429.", "openai")).toMatchObject({
      message: expect.stringContaining("rate limiting"),
      settings: false,
    })
    expect(explainAiError(new Error("The AI provider took too long to respond."), "anthropic").message).toContain(
      "too long",
    )
  })

  it("keeps an unknown message as it is", () => {
    expect(explainAiError(new Error("The model returned no text."), "openai").message).toBe(
      "The model returned no text.",
    )
  })
})
