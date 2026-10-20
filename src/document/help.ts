import { isTauriRuntime } from "@/lib/platform"
import { create } from "zustand"

/** The Help tab's windows: Help topics, Contact Support, Feedback, Keyboard Shortcuts and What's New. */
export type HelpDialog = "help" | "support" | "feedback" | "shortcuts" | "whats-new"

type HelpState = {
  dialog: HelpDialog | null
  openHelp: (dialog: HelpDialog) => void
  closeHelp: () => void
}

export const useHelp = create<HelpState>((set) => ({
  dialog: null,
  openHelp: (dialog) => set({ dialog }),
  closeHelp: () => set({ dialog: null }),
}))

export const PROJECT_URL = "https://github.com/Shani2480/AiWord"
export const ISSUES_URL = `${PROJECT_URL}/issues`

/** A new issue on the project, with its title and text filled in. */
export function newIssueUrl(title: string, body: string) {
  const query = new URLSearchParams({ title, body })
  return `${ISSUES_URL}/new?${query}`
}

/** Opens a page in the system browser in the desktop app, or in a new tab on the web. */
export async function openExternal(url: string) {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}
