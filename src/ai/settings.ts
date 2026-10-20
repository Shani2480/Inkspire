import { create } from "zustand"

/** `lmstudio` and `compatible` both talk to an OpenAI-compatible endpoint; LM Studio just starts from its usual address. */
export type AiProviderName = "builtin" | "ollama" | "lmstudio" | "compatible" | "openai" | "anthropic"

export const AI_PROVIDERS: AiProviderName[] = ["builtin", "ollama", "lmstudio", "compatible", "openai", "anthropic"]

/** Providers that take an address of their own. */
export type AddressedProvider = "ollama" | "lmstudio" | "compatible"

export const DEFAULT_ADDRESSES: Record<AddressedProvider, string> = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234/v1",
  compatible: "",
}

export type AiModels = Record<AiProviderName, string>

const STORAGE_KEY = "aiword.ai-settings"

type StoredAiSettings = {
  provider?: AiProviderName
  models?: Partial<AiModels>
  addresses?: Partial<Record<AddressedProvider, string>>
}

type AiSettings = {
  provider: AiProviderName
  models: AiModels
  addresses: Record<AddressedProvider, string>
  model: string
  running: boolean
  preview: string
  stream: string
  settledHtml: string
  requestId: string
  builderOpen: boolean
  variablesOpen: boolean
  keysOpen: boolean
  setProvider: (provider: AiProviderName) => void
  setModel: (model: string) => void
  setModelFor: (provider: AiProviderName, model: string) => void
  setAddress: (provider: AddressedProvider, address: string) => void
  setBuilderOpen: (open: boolean) => void
  setVariablesOpen: (open: boolean) => void
  setKeysOpen: (open: boolean) => void
  begin: (requestId?: string) => void
  addChunk: (text: string) => void
  settle: (html: string) => void
  finish: () => void
  clearResult: () => void
}

const DEFAULT_MODELS: AiModels = {
  builtin: "",
  ollama: "",
  lmstudio: "",
  compatible: "",
  openai: "",
  anthropic: "",
}

function loadStored(): {
  provider: AiProviderName
  models: AiModels
  addresses: Record<AddressedProvider, string>
} {
  const models = { ...DEFAULT_MODELS }
  const addresses = { ...DEFAULT_ADDRESSES }
  // Someone with nothing set up starts on the engine Inkspire runs itself.
  let provider: AiProviderName = "builtin"
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { provider, models, addresses }
    }
    const parsed = JSON.parse(raw) as StoredAiSettings
    if (parsed.provider && AI_PROVIDERS.includes(parsed.provider)) {
      provider = parsed.provider
    }
    if (parsed.models && typeof parsed.models === "object") {
      for (const name of AI_PROVIDERS) {
        const value = parsed.models[name]
        if (typeof value === "string") {
          models[name] = value
        }
      }
    }
    if (parsed.addresses && typeof parsed.addresses === "object") {
      for (const name of Object.keys(DEFAULT_ADDRESSES) as AddressedProvider[]) {
        const value = parsed.addresses[name]
        if (typeof value === "string") {
          addresses[name] = value
        }
      }
    }
  } catch {
    // Ignore bad local storage.
  }
  return { provider, models, addresses }
}

function persist(provider: AiProviderName, models: AiModels, addresses: Record<AddressedProvider, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, models, addresses } satisfies StoredAiSettings))
  } catch {
    // Quota / private mode.
  }
}

const initial = loadStored()

export const useAiSettings = create<AiSettings>((set, get) => ({
  provider: initial.provider,
  models: initial.models,
  addresses: initial.addresses,
  model: initial.models[initial.provider],
  running: false,
  preview: "",
  stream: "",
  settledHtml: "",
  requestId: "",
  builderOpen: false,
  variablesOpen: false,
  keysOpen: false,
  setProvider: (provider) => {
    const model = get().models[provider]
    persist(provider, get().models, get().addresses)
    set({ provider, model })
  },
  setModel: (model) => {
    const provider = get().provider
    const models = { ...get().models, [provider]: model }
    persist(provider, models, get().addresses)
    set({ model, models })
  },
  setModelFor: (provider, model) => {
    const models = { ...get().models, [provider]: model }
    const active = get().provider === provider ? model : get().model
    persist(get().provider, models, get().addresses)
    set({ models, model: active })
  },
  setAddress: (provider, address) => {
    const addresses = { ...get().addresses, [provider]: address }
    persist(get().provider, get().models, addresses)
    set({ addresses })
  },
  setBuilderOpen: (builderOpen) => set({ builderOpen }),
  setVariablesOpen: (variablesOpen) => set({ variablesOpen }),
  setKeysOpen: (keysOpen) => set({ keysOpen }),
  begin: (requestId = "") => set({ running: true, preview: "", stream: "", settledHtml: "", requestId }),
  addChunk: (text) =>
    set((state) => {
      const stream = `${state.stream}${text}`
      return { stream, preview: stream.slice(-160) }
    }),
  settle: (html) => set({ settledHtml: html, running: false }),
  finish: () => set({ running: false }),
  clearResult: () => set({ running: false, preview: "", stream: "", settledHtml: "", requestId: "" }),
}))

export function defaultModel(provider: AiProviderName) {
  if (provider === "openai") {
    return "gpt-5-mini"
  }
  if (provider === "anthropic") {
    return "claude-sonnet-5-5"
  }
  if (provider === "builtin") {
    return "qwen2.5-3b"
  }
  if (provider === "lmstudio" || provider === "compatible") {
    return "default"
  }
  return "llama3.2"
}

export function resolvedModel(provider: AiProviderName, model: string) {
  return model.trim() || defaultModel(provider)
}

/** What the desktop side needs to reach the chosen provider. */
export function providerConfig() {
  const { provider, model, addresses } = useAiSettings.getState()
  const name = provider === "lmstudio" ? "compatible" : provider
  const address =
    provider === "ollama" || provider === "lmstudio" || provider === "compatible" ? addresses[provider] : ""
  return {
    provider: name,
    model: model.trim() || null,
    baseUrl: address.trim() || null,
  }
}
