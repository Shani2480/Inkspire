import { formatBytes } from "@/ai/local"
import { isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { create } from "zustand"

/** Pandoc and Typst are not shipped with the app: the person chooses to download them. */
export type HelperTool = {
  id: string
  label: string
  purpose: string
  version: string
  size: number
  supported: boolean
  /** "downloaded" (by the app), "system" (already on this computer) or "missing". */
  source: "downloaded" | "system" | "missing"
}

type Progress = { id: string; received: number; total: number }

type HelperTools = {
  tools: HelperTool[]
  progress: Progress | null
  installing: boolean
  error: string
  /** The tools a feature needs and the person has been asked about; null while no question is open. */
  asking: { ids: string[]; answer: (download: boolean) => void } | null
  refresh: () => Promise<void>
  install: (ids: string[]) => Promise<boolean>
  ask: (ids: string[]) => Promise<boolean>
}

const MISSING = /TOOL_MISSING:([a-z,]+)/

let listening = false

export const useHelperTools = create<HelperTools>((set, get) => ({
  tools: [],
  progress: null,
  installing: false,
  error: "",
  asking: null,
  refresh: async () => {
    if (!isTauriRuntime()) {
      return
    }
    try {
      set({ tools: await invoke<HelperTool[]>("tools_status") })
    } catch {
      set({ tools: [] })
    }
  },
  install: async (ids) => {
    if (get().installing || ids.length === 0) {
      return false
    }
    if (!listening) {
      listening = true
      await listen<Progress>("tools-progress", (event) => set({ progress: event.payload }))
    }
    set({ installing: true, error: "", progress: null })
    try {
      await invoke("tools_install", { ids })
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      set({ error: message === "Stopped." ? "" : message })
      return false
    } finally {
      set({ installing: false, progress: null })
      await get().refresh()
    }
  },
  ask: (ids) =>
    new Promise<boolean>((resolve) => {
      set({ asking: { ids, answer: resolve }, error: "" })
    }),
}))

/** The tools a failed command named, or an empty list when it failed for another reason. */
export function missingTools(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return MISSING.exec(text)?.[1]?.split(",") ?? []
}

/**
 * Runs a command that needs Pandoc or Typst. When one is missing the person is asked whether to download it; on a
 * yes it is downloaded and the command runs again, on a no the command fails with a message saying what is needed.
 */
export async function invokeWithTools<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    const ids = missingTools(error)
    if (ids.length === 0) {
      throw error
    }
    await useHelperTools.getState().refresh()
    const names = ids.map((id) => useHelperTools.getState().tools.find((tool) => tool.id === id)?.label ?? id)
    if (!(await useHelperTools.getState().ask(ids)) || !(await useHelperTools.getState().install(ids))) {
      throw new Error(
        useHelperTools.getState().error ||
          `${names.join(" and ")} is needed for this. It can be downloaded when you try again.`,
      )
    }
    return await invoke<T>(command, args)
  }
}

export function toolDownloadLabel(tool: HelperTool) {
  return `${tool.label} (${formatBytes(tool.size)})`
}
