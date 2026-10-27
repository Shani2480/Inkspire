import { create } from "zustand"

/** The Quick Access Toolbar and the ribbon's tabs as the user arranged them (22.5), kept in the user's config. */
export type Customization = {
  /** Show the Quick Access Toolbar at all. */
  qatShown: boolean
  /** Command ids in order; "|" is a separator. */
  qat: string[]
  /** Ids of the main tabs the user hid. */
  hiddenTabs: string[]
}

export const SEPARATOR = "|"
export const DEFAULT_QAT = ["save", "undo", "redo", "open", "save-as", "print", "ai"]
export const KEY = "aiword.customize"

/** The main tabs that can be hidden; Home stays, as the ribbon needs one tab to open on. */
export const HIDEABLE_TABS = [
  { id: "insert", label: "Insert" },
  { id: "design", label: "Design" },
  { id: "layout", label: "Layout" },
  { id: "references", label: "References" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
  { id: "help", label: "Help" },
  { id: "ai", label: "AI Tools" },
]

export function defaults(): Customization {
  return { qatShown: true, qat: [...DEFAULT_QAT], hiddenTabs: [] }
}

/** Reads what was saved, ignoring anything that is not the right shape. */
export function readCustomization(raw: string | null, known: (id: string) => boolean): Customization {
  const base = defaults()
  try {
    const parsed = JSON.parse(raw ?? "null") as Partial<Customization> | null
    if (!parsed || typeof parsed !== "object") {
      return base
    }
    const qat = Array.isArray(parsed.qat)
      ? parsed.qat.filter((id): id is string => typeof id === "string" && (id === SEPARATOR || known(id)))
      : base.qat
    const tabs = Array.isArray(parsed.hiddenTabs)
      ? parsed.hiddenTabs.filter((id): id is string => HIDEABLE_TABS.some((tab) => tab.id === id))
      : []
    return { qatShown: parsed.qatShown !== false, qat, hiddenTabs: tabs }
  } catch {
    return base
  }
}

/** Add: a command goes at the end, once; a separator may go in again and again. */
export function addCommand(list: string[], id: string) {
  return id === SEPARATOR || !list.includes(id) ? [...list, id] : list
}

export function removeCommand(list: string[], index: number) {
  return list.filter((_, position) => position !== index)
}

export function moveCommand(list: string[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return list
  }
  const next = [...list]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}

type Store = Customization & {
  set: (patch: Partial<Customization>) => void
  reset: () => void
}

let known: (id: string) => boolean = () => true

/** Tells the store which command ids exist, so a saved id for a command that is gone is dropped on load. */
export function registerKnownCommands(check: (id: string) => boolean) {
  known = check
}

function load(): Customization {
  try {
    return readCustomization(localStorage.getItem(KEY), known)
  } catch {
    return defaults()
  }
}

function save(value: Customization) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Storage can be blocked; the arrangement then lasts for this session only.
  }
}

export const useCustomize = create<Store>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    const { qatShown, qat, hiddenTabs } = get()
    save({ qatShown, qat, hiddenTabs })
  },
  reset: () => {
    const next = defaults()
    set(next)
    save(next)
  },
}))
