import { aiUnavailableReason } from "@/ai/availability"
import { cancelAiRequest, generateAiText, isAiCancelled } from "@/ai/generate"
import { unwrapPlain } from "@/ai/themes"
import type { AccessibilityIssue } from "@/lib/accessibility"
import type { Editor } from "@tiptap/core"
import { create } from "zustand"

export type AccessibilitySuggestion = {
  /** What the AI proposed. Tables carry a title as well as a description. */
  text: string
  title?: string
}

export type AccessibilityItem = {
  id: string
  kind: "alt" | "link" | "table"
  /** What the model is told about the object and where it sits in the document. */
  context: string
}

type AccessibilityState = {
  open: boolean
  suggestions: Record<string, AccessibilitySuggestion>
  dismissed: string[]
  running: boolean
  error: string
  requestId: string
  openPane: () => void
  closePane: () => void
  setSuggestion: (id: string, suggestion: AccessibilitySuggestion | null) => void
  dismiss: (id: string) => void
  setRunning: (running: boolean) => void
  setError: (error: string) => void
  setRequestId: (requestId: string) => void
}

export const useAccessibility = create<AccessibilityState>((set) => ({
  open: false,
  suggestions: {},
  dismissed: [],
  running: false,
  error: "",
  requestId: "",
  openPane: () => set({ open: true }),
  closePane: () => {
    const requestId = useAccessibility.getState().requestId
    if (requestId) {
      cancelAiRequest(requestId)
    }
    set({ open: false, running: false, requestId: "", error: "" })
  },
  setSuggestion: (id, suggestion) =>
    set((state) => {
      const next = { ...state.suggestions }
      if (suggestion) {
        next[id] = suggestion
      } else {
        delete next[id]
      }
      return { suggestions: next }
    }),
  dismiss: (id) => set((state) => ({ dismissed: [...state.dismissed, id] })),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
  setRequestId: (requestId) => set({ requestId }),
}))

const SYSTEM =
  "You write accessibility text for a document. You are given a JSON array of items, each with an id, a kind and a context. " +
  "You cannot see pictures: for kind alt, describe what the picture most likely shows from its file name, its current alt text and the surrounding text, in one plain sentence under 125 characters, with no “image of” or “picture of”. " +
  "For kind link, give link text of 2 to 6 words that says where the link goes, taken from the sentence and the address. " +
  "For kind table, give title (under 60 characters) and text (one or two sentences saying what the table shows and how it is organised). " +
  'Return only a JSON array of objects {"id", "text"} (kind table also has "title"), one per item, using the same ids. If you cannot tell, leave the item out. No markdown.'

const LIMITS = { alt: 150, link: 80, table: 300 } as const

function around(editor: Editor, pos: number, size: number) {
  const doc = editor.state.doc
  const before = doc.textBetween(Math.max(0, pos - 400), Math.min(pos, doc.content.size), " ", " ").trim()
  const node = doc.nodeAt(pos)
  const end = Math.min(doc.content.size, pos + (node?.nodeSize ?? 1) + 400)
  const after = doc.textBetween(Math.min(pos + (node?.nodeSize ?? 1), end), end, " ", " ").trim()
  return { before: before.slice(-size), after: after.slice(0, size) }
}

function headingAbove(editor: Editor, pos: number) {
  let found = ""
  editor.state.doc.nodesBetween(0, pos, (node) => {
    if (node.type.name === "heading" && node.textContent.trim()) {
      found = node.textContent.trim()
    }
    return true
  })
  return found.slice(0, 120)
}

/** The items the AI is asked about, with the text around each one. */
export function accessibilityItems(editor: Editor, issues: AccessibilityIssue[]): AccessibilityItem[] {
  const items: AccessibilityItem[] = []
  for (const issue of issues) {
    if (!issue.ai) {
      continue
    }
    const node = editor.state.doc.nodeAt(issue.pos)
    if (issue.ai === "link") {
      const $pos = editor.state.doc.resolve(issue.pos)
      const href = String(
        $pos.parent.maybeChild($pos.index())?.marks.find((m) => m.type.name === "link")?.attrs.href ?? "",
      )
      items.push({
        id: issue.id,
        kind: "link",
        context: JSON.stringify({
          linkText: issue.excerpt,
          address: href,
          sentence: $pos.parent.textContent.slice(0, 300),
        }),
      })
    } else if (issue.ai === "table" && node) {
      const rows: string[] = []
      node.forEach((row) => {
        if (rows.length < 4) {
          rows.push(row.textBetween(0, row.content.size, " | ", " "))
        }
      })
      items.push({
        id: issue.id,
        kind: "table",
        context: JSON.stringify({
          firstRows: rows,
          section: headingAbove(editor, issue.pos),
          ...around(editor, issue.pos, 200),
        }),
      })
    } else if (node) {
      items.push({
        id: issue.id,
        kind: "alt",
        context: JSON.stringify({
          object: node.type.name,
          currentAlt: String(node.attrs.alt || ""),
          fileName: String(node.attrs.fileName || node.attrs.title || ""),
          chart: node.type.name === "figure" ? String(node.attrs.chart || "").slice(0, 600) : undefined,
          section: headingAbove(editor, issue.pos),
          ...around(editor, issue.pos, 200),
        }),
      })
    }
  }
  return items
}

/** Reads the model's reply: only ids that were asked about, only text that is a string, clamped to a sensible length. */
export function parseSuggestions(raw: string, items: AccessibilityItem[]) {
  const result: Record<string, AccessibilitySuggestion> = {}
  const text = unwrapPlain(raw)
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) {
    return result
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return result
  }
  if (!Array.isArray(parsed)) {
    return result
  }
  const kinds = new Map(items.map((item) => [item.id, item.kind]))
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const record = entry as Record<string, unknown>
    const kind = typeof record.id === "string" ? kinds.get(record.id) : undefined
    const value = typeof record.text === "string" ? record.text.replace(/\s+/g, " ").trim() : ""
    if (!kind || !value || typeof record.id !== "string") {
      continue
    }
    const title = kind === "table" && typeof record.title === "string" ? record.title.trim().slice(0, 80) : undefined
    result[record.id] = { text: value.slice(0, LIMITS[kind]), ...(title ? { title } : {}) }
  }
  return result
}

export async function requestAccessibilitySuggestions(items: AccessibilityItem[], requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, suggestions: {} as Record<string, AccessibilitySuggestion> }
  }
  if (items.length === 0) {
    return { blocked: "There is nothing here the AI can help with.", suggestions: {} }
  }
  const batch = items.slice(0, 15)
  try {
    const raw = await generateAiText(
      "Write the accessibility text for these items. Reply with a JSON array only.",
      JSON.stringify(batch.map((item) => ({ id: item.id, kind: item.kind, context: JSON.parse(item.context) }))),
      { system: SYSTEM, plain: true, quiet: true, requestId },
    )
    if (isAiCancelled(requestId)) {
      return { blocked: null, suggestions: {} }
    }
    const suggestions = parseSuggestions(raw, batch)
    if (Object.keys(suggestions).length === 0) {
      return { blocked: "The model did not return any suggestions.", suggestions }
    }
    return { blocked: null, suggestions }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, suggestions: {} }
    }
    throw error
  }
}
