import {
  NO_LOCAL_STATUS,
  defaultLocalModel,
  loadLocalStatus,
  localReady,
  useLocalDownload,
  type LocalStatus,
} from "@/ai/local"
import { useAiSettings } from "@/ai/settings"
import { useEffect, useState } from "react"

/** What the built-in engine is doing, in a few words: shown under the model box while it is the chosen provider. */
export function engineChipText(status: LocalStatus, model: string, installing: boolean) {
  if (installing) {
    return "Downloading…"
  }
  if (!status.supported) {
    return "Not available here"
  }
  if (!localReady(status, model)) {
    return "Download needed"
  }
  const name = status.models
    .find((item) => item.id === (model || defaultLocalModel(status)))
    ?.label.split(":")[1]
    ?.trim()
  return `${status.running ? "Running" : "Ready"}${name ? ` · ${name}` : ""}`
}

export function EngineChip() {
  const provider = useAiSettings((state) => state.provider)
  const model = useAiSettings((state) => state.models.builtin)
  const generating = useAiSettings((state) => state.running)
  const installing = useLocalDownload((state) => state.installing)
  const open = useAiSettings((state) => state.keysOpen)
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)
  const [status, setStatus] = useState<LocalStatus>(NO_LOCAL_STATUS)

  useEffect(() => {
    if (provider !== "builtin") {
      return
    }
    let cancelled = false
    const refresh = () =>
      void loadLocalStatus().then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
    refresh()
    const timer = window.setInterval(refresh, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [provider, installing, generating, open])

  if (provider !== "builtin") {
    return null
  }
  return (
    <button
      type="button"
      className="max-w-36 truncate text-left text-[11px] text-[#616161] hover:text-[#0f6cbd] hover:underline"
      title="Open AI Settings to download or manage the built-in engine"
      aria-live="polite"
      onClick={() => setKeysOpen(true)}
    >
      {engineChipText(status, model, installing)}
    </button>
  )
}
