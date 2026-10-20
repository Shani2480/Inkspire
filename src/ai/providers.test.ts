import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { explainAiError } from "@/ai/errors"
import { NO_LOCAL_STATUS, defaultLocalModel, formatBytes, localReady, type LocalStatus } from "@/ai/local"
import { DEFAULT_ADDRESSES, defaultModel, providerConfig, useAiSettings } from "@/ai/settings"

const READY: LocalStatus = {
  ...NO_LOCAL_STATUS,
  supported: true,
  reason: "",
  engineInstalled: true,
  models: [
    { id: "small", label: "Small", size: 1_000_000_000, installed: false, default: false },
    { id: "standard", label: "Standard", size: 2_000_000_000, installed: true, default: true },
  ],
}

describe("which provider a request goes to", () => {
  beforeEach(() => {
    useAiSettings.setState({
      provider: "builtin",
      models: { builtin: "", ollama: "", lmstudio: "", compatible: "", openai: "", anthropic: "" },
      addresses: { ...DEFAULT_ADDRESSES },
    })
  })
  afterEach(() => localStorage.clear())

  it("sends the built-in engine with no address and an empty model for its default", () => {
    expect(providerConfig()).toEqual({ provider: "builtin", model: null, baseUrl: null })
  })

  it("sends LM Studio and a custom endpoint as one compatible provider with their own address", () => {
    useAiSettings.getState().setProvider("lmstudio")
    expect(providerConfig()).toEqual({ provider: "compatible", model: null, baseUrl: "http://127.0.0.1:1234/v1" })
    useAiSettings.getState().setProvider("compatible")
    useAiSettings.getState().setAddress("compatible", " https://gateway.example/v1 ")
    useAiSettings.getState().setModel("my-model")
    expect(providerConfig()).toEqual({
      provider: "compatible",
      model: "my-model",
      baseUrl: "https://gateway.example/v1",
    })
  })

  it("keeps a model and an address per provider and remembers them", () => {
    useAiSettings.getState().setModelFor("openai", "gpt-x")
    useAiSettings.getState().setAddress("ollama", "http://localhost:11500")
    const stored = JSON.parse(localStorage.getItem("aiword.ai-settings") || "{}")
    expect(stored.models.openai).toBe("gpt-x")
    expect(stored.addresses.ollama).toBe("http://localhost:11500")
  })

  it("has a default model for each", () => {
    expect(defaultModel("builtin")).toBe("qwen2.5-3b")
    expect(defaultModel("compatible")).toBe("default")
    expect(defaultModel("anthropic")).toContain("claude")
  })
})

describe("the built-in engine's state", () => {
  it("is ready only with the engine and the chosen model on the computer", () => {
    expect(localReady(READY, "")).toBe(true)
    expect(localReady(READY, "standard")).toBe(true)
    expect(localReady(READY, "small")).toBe(false)
    expect(localReady({ ...READY, engineInstalled: false }, "")).toBe(false)
    expect(localReady({ ...READY, supported: false }, "")).toBe(false)
    expect(localReady(NO_LOCAL_STATUS, "")).toBe(false)
    expect(defaultLocalModel(READY)).toBe("standard")
  })

  it("shows sizes in megabytes and gigabytes", () => {
    expect(formatBytes(30_273_863)).toBe("29 MB")
    expect(formatBytes(2_104_932_768)).toBe("2.0 GB")
  })
})

describe("errors from the new providers", () => {
  it("point at the built-in engine's own setup", () => {
    const problem = explainAiError(new Error("Download the built-in model first (AI Tools)."), "builtin")
    expect(problem.settings).toBe(true)
    expect(problem.message).toContain("Download the built-in model")
  })

  it("ask for the address when a compatible server is not there", () => {
    const problem = explainAiError(new Error("Could not reach the AI provider."), "lmstudio")
    expect(problem.message).toContain("LM Studio")
    expect(problem.settings).toBe(true)
  })
})
