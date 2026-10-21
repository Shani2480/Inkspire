import { create } from "zustand"

const KEY = "aiword.addins"

/** Installed by default, so the Add-ins menu is not empty on first use. */
const DEFAULT_INSTALLED = ["markdown", "templates", "writing"]

function load(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : DEFAULT_INSTALLED
  } catch {
    return DEFAULT_INSTALLED
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // Without storage the choice lasts until the window closes.
  }
}

type AddinsState = {
  installed: string[]
  /** What the last add-in command did ("Added 3 sources"), shown where add-ins are listed. */
  notice: string
  install: (id: string) => void
  remove: (id: string) => void
  say: (notice: string) => void
}

/** Which add-ins are installed (Home > Add-ins, File > Get Add-ins). Kept in this browser. */
export const useAddins = create<AddinsState>((set, get) => ({
  installed: load(),
  notice: "",
  install: (id) => {
    const installed = get().installed.includes(id) ? get().installed : [...get().installed, id]
    save(installed)
    set({ installed })
  },
  remove: (id) => {
    const installed = get().installed.filter((item) => item !== id)
    save(installed)
    set({ installed })
  },
  say: (notice) => set({ notice }),
}))
