import { loadAiKeyStatus } from "@/ai/keys"
import { localReady, loadLocalStatus } from "@/ai/local"
import { useAiSettings } from "@/ai/settings"
import { isTauriRuntime } from "@/lib/platform"

export async function aiUnavailableReason() {
  if (!isTauriRuntime()) {
    return "Open the desktop app to use AI. Keys stay in the Rust process."
  }

  const { provider, addresses, model } = useAiSettings.getState()
  if (provider === "ollama") {
    return null
  }
  if (provider === "builtin") {
    const status = await loadLocalStatus()
    if (!status.supported) {
      return `${status.reason} Pick another provider in AI Tools.`
    }
    if (!localReady(status, model)) {
      return "Download the built-in model first: AI Tools → Provider settings → Built-in engine."
    }
    return null
  }
  if (provider === "lmstudio" || provider === "compatible") {
    return addresses[provider].trim() ? null : "Enter the endpoint's address in AI Tools → Provider settings."
  }

  const status = await loadAiKeyStatus()
  if (status[provider] === "missing") {
    const name = provider === "openai" ? "OpenAI" : "Anthropic"
    return `Add a ${name} key in AI Tools. The key stays in the Rust process.`
  }

  return null
}
