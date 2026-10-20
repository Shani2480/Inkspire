import { isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { create } from "zustand"

/** The engine Inkspire runs itself (a pinned llama.cpp server and a small model, downloaded on first use). */
export type LocalModel = { id: string; label: string; size: number; installed: boolean; default: boolean }

export type LocalStatus = {
  supported: boolean
  reason: string
  /** The build that will run: "vulkan" on a machine with a real Vulkan GPU, otherwise "cpu". */
  backend: "vulkan" | "cpu"
  vulkan: boolean
  engineInstalled: boolean
  engineSize: number
  engineTag: string
  models: LocalModel[]
  running: boolean
  installing: boolean
}

export type LocalProgress = { stage: "engine" | "model"; label: string; received: number; total: number }

export const NO_LOCAL_STATUS: LocalStatus = {
  supported: false,
  reason: "Open the desktop app to use the built-in engine.",
  backend: "cpu",
  vulkan: false,
  engineInstalled: false,
  engineSize: 0,
  engineTag: "",
  models: [],
  running: false,
  installing: false,
}

export async function loadLocalStatus(): Promise<LocalStatus> {
  if (!isTauriRuntime()) {
    return NO_LOCAL_STATUS
  }
  try {
    return await invoke<LocalStatus>("local_ai_status")
  } catch (caught) {
    return { ...NO_LOCAL_STATUS, reason: `The built-in engine could not be reached: ${String(caught)}` }
  }
}

/** Whether the engine and the chosen model are both on this computer, so a request can run. */
export function localReady(status: LocalStatus, modelId: string) {
  const model = status.models.find((item) => item.id === (modelId || defaultLocalModel(status)))
  return status.supported && status.engineInstalled && Boolean(model?.installed)
}

export function defaultLocalModel(status: LocalStatus) {
  return status.models.find((item) => item.default)?.id ?? status.models[0]?.id ?? ""
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

type DownloadState = {
  progress: LocalProgress | null
  installing: boolean
  error: string
  setProgress: (progress: LocalProgress | null) => void
  set: (patch: Partial<DownloadState>) => void
}

export const useLocalDownload = create<DownloadState>((set) => ({
  progress: null,
  installing: false,
  error: "",
  setProgress: (progress) => set({ progress }),
  set: (patch) => set(patch),
}))

let listening = false

/** Downloads the engine and the model (each is checked against its pinned checksum; a stopped download resumes). */
export async function installLocalEngine(modelId: string) {
  const download = useLocalDownload.getState()
  if (download.installing) {
    return
  }
  if (!listening) {
    listening = true
    await listen<LocalProgress>("local-ai-progress", (event) => useLocalDownload.getState().setProgress(event.payload))
  }
  useLocalDownload.getState().set({ installing: true, error: "", progress: null })
  try {
    await invoke("local_ai_install", { modelId })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    useLocalDownload.getState().set({ error: message === "Stopped." ? "" : message })
  } finally {
    useLocalDownload.getState().set({ installing: false, progress: null })
  }
}

export async function cancelLocalInstall() {
  await invoke("local_ai_cancel_install")
}

/** Deletes one downloaded model; the others stay. `engine` deletes the engine builds as well. */
export async function removeLocalModel(modelId: string, engine = false) {
  await invoke("local_ai_remove", { modelId, removeEngine: engine })
}
