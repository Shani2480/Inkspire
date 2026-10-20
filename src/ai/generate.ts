import { providerConfig, useAiSettings } from "@/ai/settings"
import { isTauriRuntime } from "@/lib/platform"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

type AiTextChunk = {
  requestId: string
  text: string
}

export type GenerateOptions = {
  system?: string
  plain?: boolean
  requestId?: string
  quiet?: boolean
  onChunk?: (text: string) => void
}

const cancelledIds = new Set<string>()

export function cancelAiRequest(requestId: string) {
  if (!requestId) {
    return
  }
  cancelledIds.add(requestId)
  if (isTauriRuntime()) {
    void invoke("cancel_ai_text", { requestId }).catch((error: unknown) => {
      console.warn("Failed to cancel AI request.", error)
    })
  }
}

export function isAiCancelled(requestId: string) {
  return cancelledIds.has(requestId)
}

export function isAiStopped(error: unknown) {
  return error instanceof Error && error.message === "Stopped."
}

export function stopActiveGeneration() {
  const requestId = useAiSettings.getState().requestId
  if (requestId) {
    cancelAiRequest(requestId)
  }
}

function throwIfCancelled(requestId: string) {
  if (cancelledIds.has(requestId)) {
    throw new Error("Stopped.")
  }
}

export async function generateAiText(prompt: string, context: string, options?: GenerateOptions) {
  const settings = useAiSettings.getState()
  const requestId = options?.requestId ?? crypto.randomUUID()
  const quiet = options?.quiet === true
  if (!quiet) {
    settings.begin(requestId)
  }

  let unlisten: UnlistenFn | undefined
  try {
    throwIfCancelled(requestId)
    const onChunk = options?.onChunk
    if (!quiet || onChunk) {
      unlisten = await listen<AiTextChunk>("ai-text-chunk", (event) => {
        if (event.payload.requestId !== requestId || cancelledIds.has(requestId)) {
          return
        }
        if (!quiet) {
          useAiSettings.getState().addChunk(event.payload.text)
        }
        onChunk?.(event.payload.text)
      })
    }

    throwIfCancelled(requestId)
    const html = await invoke<string>("generate_ai_text", {
      prompt,
      context,
      requestId,
      systemPrompt: options?.system ?? null,
      plain: options?.plain === true,
      providerConfig: providerConfig(),
    })
    throwIfCancelled(requestId)
    return html
  } finally {
    unlisten?.()
    if (!quiet && useAiSettings.getState().requestId === requestId) {
      useAiSettings.getState().finish()
    }
  }
}

export async function testAiConnection() {
  return invoke<string>("test_ai_connection", {
    providerConfig: providerConfig(),
  })
}
