/** Persisted Tell Me search scopes and recent query history. */

export type TellMeScope = "commands" | "text" | "comments" | "bookmarks"

export type TellMeScopes = Record<TellMeScope, boolean>

const SCOPES_KEY = "aiword.tell-me.scopes"
const HISTORY_KEY = "aiword.tell-me.history"
const HISTORY_LIMIT = 8

export const TELL_ME_SCOPE_OPTIONS: { id: TellMeScope; label: string; hint: string }[] = [
  { id: "commands", label: "Commands", hint: "Ribbon and app actions" },
  { id: "text", label: "Document text", hint: "Body text in the document" },
  { id: "comments", label: "Comments", hint: "Comment threads and replies" },
  { id: "bookmarks", label: "Bookmarks", hint: "Named bookmarks" },
]

const DEFAULT_SCOPES: TellMeScopes = {
  commands: true,
  text: true,
  comments: true,
  bookmarks: true,
}

export function loadTellMeScopes(): TellMeScopes {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SCOPES }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(SCOPES_KEY) ?? "null") as Partial<TellMeScopes> | null
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_SCOPES }
    }
    return {
      commands: parsed.commands !== false,
      text: parsed.text !== false,
      comments: parsed.comments !== false,
      bookmarks: parsed.bookmarks !== false,
    }
  } catch {
    return { ...DEFAULT_SCOPES }
  }
}

export function saveTellMeScopes(scopes: TellMeScopes) {
  if (typeof localStorage === "undefined") {
    return
  }
  localStorage.setItem(SCOPES_KEY, JSON.stringify(scopes))
}

export function loadTellMeHistory(): string[] {
  if (typeof localStorage === "undefined") {
    return []
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function pushTellMeHistory(query: string) {
  const trimmed = query.trim()
  if (!trimmed || typeof localStorage === "undefined") {
    return loadTellMeHistory()
  }
  const next = [
    trimmed,
    ...loadTellMeHistory().filter((item) => item.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()),
  ].slice(0, HISTORY_LIMIT)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

export function clearTellMeHistory() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(HISTORY_KEY)
  }
  return [] as string[]
}

export function tellMeSearchHint(scopes: TellMeScopes) {
  const labels = TELL_ME_SCOPE_OPTIONS.filter((option) => scopes[option.id]).map((option) => option.label.toLowerCase())
  if (labels.length === 0) {
    return "Turn on a search option with the button beside the search box."
  }
  if (labels.length === 1) {
    return `Search ${labels[0]}.`
  }
  if (labels.length === 2) {
    return `Search ${labels[0]} or ${labels[1]}.`
  }
  const last = labels[labels.length - 1]
  return `Search ${labels.slice(0, -1).join(", ")}, or ${last}.`
}
