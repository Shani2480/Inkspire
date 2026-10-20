import { cancelAiRequest } from "@/ai/generate"
import { useAiSettings } from "@/ai/settings"
import { create } from "zustand"

export type DraftKind = "rewrite" | "summary" | "draft"
export type DraftInsert = "replace" | "after" | "document"

type DraftSession = {
  kind: DraftKind
  from: number
  to: number
  at: number
  requestId: string
  insert: DraftInsert
  anchorText: string
}

type RewriteState = DraftSession & {
  open: boolean
  notice: string
  openSession: (session: DraftSession) => void
  closeSession: () => void
  stopSession: () => void
  setNotice: (notice: string) => void
}

const closedSession: DraftSession = {
  kind: "rewrite",
  from: 0,
  to: 0,
  at: 0,
  requestId: "",
  insert: "replace",
  anchorText: "",
}

export const useRewrite = create<RewriteState>((set, get) => ({
  open: false,
  notice: "",
  ...closedSession,
  openSession: (session) => {
    const previous = get().requestId
    if (previous) {
      cancelAiRequest(previous)
    }
    set({ open: true, notice: "", ...session })
  },
  closeSession: () => {
    const requestId = get().requestId
    if (requestId) {
      cancelAiRequest(requestId)
    }
    if (requestId && useAiSettings.getState().requestId === requestId) {
      useAiSettings.getState().clearResult()
    }
    set({ open: false, notice: "", ...closedSession })
  },
  stopSession: () => {
    const requestId = get().requestId
    if (requestId) {
      cancelAiRequest(requestId)
    }
  },
  setNotice: (notice) => set({ notice }),
}))

export function rewritePreviewText(raw: string) {
  let value = raw.replace(/^\uFEFF/, "").replace(/```(?:html)?/gi, "")
  value = value.replace(/<[^>]*$/, "")
  value = value.replace(/<br\s*\/?>/gi, "\n")
  value = value.replace(/<\/(?:p|h1|h2|h3|li|div|blockquote)>/gi, "\n")
  value = value.replace(/<[^>]+>/g, "")
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
}
