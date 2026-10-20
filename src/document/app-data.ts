import { isTauriRuntime } from "@/lib/platform"
import { BaseDirectory, exists, mkdir } from "@tauri-apps/plugin-fs"

let ready: Promise<void> | null = null

export async function ensureAppData() {
  if (!isTauriRuntime()) {
    return
  }
  if (!ready) {
    ready = (async () => {
      if (!(await exists(".", { baseDir: BaseDirectory.AppData }))) {
        await mkdir(".", { baseDir: BaseDirectory.AppData, recursive: true })
      }
      if (!(await exists("recovery", { baseDir: BaseDirectory.AppData }))) {
        await mkdir("recovery", { baseDir: BaseDirectory.AppData, recursive: true })
      }
    })().catch((error: unknown) => {
      ready = null
      throw error
    })
  }
  await ready
}

export const APP_DATA = {
  recoveryMeta: "recovery/draft.json",
  recoveryHtml: "recovery/draft.html",
} as const
