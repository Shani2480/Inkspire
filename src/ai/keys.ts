import { isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"

export type KeySource = "saved" | "environment" | "missing"

export type AiKeyStatus = {
  openai: KeySource
  anthropic: KeySource
  compatible: KeySource
  /** Where saved keys are kept: the system keyring, or a file only this user can read when there is none. */
  storage: "keyring" | "file"
}

const EMPTY_STATUS: AiKeyStatus = {
  openai: "missing",
  anthropic: "missing",
  compatible: "missing",
  storage: "keyring",
}

export async function loadAiKeyStatus() {
  if (!isTauriRuntime()) {
    return EMPTY_STATUS
  }

  return invoke<AiKeyStatus>("ai_key_status")
}

export type KeyProvider = "openai" | "anthropic" | "compatible"

export async function saveAiKey(provider: KeyProvider, key: string) {
  return invoke<"keyring" | "file" | "none">("save_ai_key", { provider, key })
}

export function keySourceLabel(source: KeySource) {
  if (source === "saved") {
    return "Saved on this computer"
  }
  if (source === "environment") {
    return "Using the environment variable"
  }
  return "Not set"
}
