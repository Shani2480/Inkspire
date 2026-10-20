import type { AiProviderName } from "@/ai/settings"

export type AiProblem = {
  message: string
  /** The setting is the cause, so the error offers a button that opens the AI settings. */
  settings: boolean
}

const NAMES: Record<AiProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Local Ollama",
  builtin: "the built-in engine",
  lmstudio: "LM Studio",
  compatible: "the endpoint",
}

/** What went wrong with an AI request, in words the user can act on. */
export function explainAiError(error: unknown, provider: AiProviderName): AiProblem {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const text = raw.toLowerCase()
  const name = NAMES[provider]
  if (/add a .* key|key is missing|no api key/.test(text)) {
    return { message: `There is no ${name} API key yet. Add one in the AI settings.`, settings: true }
  }
  if (/rejected the api key|\b401\b|\b403\b|invalid api key|incorrect api key/.test(text)) {
    return { message: `${name} rejected the API key (401). Check the key in the AI settings.`, settings: true }
  }
  if (/rate limit|too many requests|\b429\b|quota/.test(text)) {
    return { message: `${name} is rate limiting requests (429). Wait a moment and try again.`, settings: false }
  }
  if (provider === "ollama" && /could not reach|connection refused|econnrefused|failed to connect/.test(text)) {
    return {
      message: "Ollama is not reachable at localhost:11434. Start the Ollama app, then try again.",
      settings: true,
    }
  }
  if (
    provider === "builtin" &&
    /download the built-in|engine did not start|could not be started|gpu engine/.test(text)
  ) {
    return { message: raw, settings: true }
  }
  if (
    (provider === "lmstudio" || provider === "compatible") &&
    /could not reach|connection refused|econnrefused|failed to connect/.test(text)
  ) {
    return {
      message: `Could not reach ${name}. Check the address in the AI settings and that the server is running.`,
      settings: true,
    }
  }
  if (/not installed/.test(text)) {
    return { message: `${raw} You can pick another model in the AI settings.`, settings: true }
  }
  if (/took too long|timed out|timeout/.test(text)) {
    return { message: `${name} took too long to answer. Check the connection and try again.`, settings: false }
  }
  if (/could not reach|network|offline|failed to fetch/.test(text)) {
    return { message: `Could not reach ${name}. Check the internet connection and try again.`, settings: false }
  }
  return { message: raw || `The request to ${name} failed.`, settings: false }
}
