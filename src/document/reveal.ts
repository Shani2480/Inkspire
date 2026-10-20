import { describeFileProblem, useFileError } from "@/document/file-errors"
import { isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"

/** The tooltip for "Open containing folder": what it does, or why it is unavailable. */
export function revealTitle(tauri: boolean = isTauriRuntime()): string {
  return tauri
    ? "Open containing folder"
    : "Open containing folder (only in the desktop app, where the file's path is known)"
}

/**
 * Shows a recent file's folder in the desktop file manager (21.34). A file that is no longer there gets the app's
 * "couldn't find this file" message instead of opening a wrong folder.
 */
export async function revealDocument(path: string, forget?: (path: string) => void): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false
  }
  try {
    await invoke("reveal_document", { path })
    return true
  } catch (error) {
    const action = await useFileError
      .getState()
      .show(describeFileProblem(error, { operation: "open", file: path, recent: true }))
    if (action === "remove-recent") {
      forget?.(path)
    }
    return false
  }
}
