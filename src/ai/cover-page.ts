/**
 * Insert > Cover Page > Generate with AI: a first page written for the document from a title, a subtitle and a tone,
 * inserted as ordinary blocks (a Title paragraph, a Subtitle, a rule, a tagline and a byline, then a page break) so
 * it edits like any text; nothing is stored anywhere but the document.
 */
import { aiUnavailableReason } from "@/ai/availability"
import { generateAiText, isAiCancelled } from "@/ai/generate"
import { unwrapPlain } from "@/ai/themes"
import { useDocumentStore } from "@/document/store"
import type { Editor } from "@tiptap/core"

export type CoverBrief = { title: string; subtitle: string; tone: string }

export type CoverText = { title: string; subtitle: string; tagline: string; byline: string }

export const COVER_TONES = ["Formal", "Friendly", "Bold", "Academic", "Playful"] as const

const LIMITS: Record<keyof CoverText, number> = { title: 80, subtitle: 120, tagline: 160, byline: 80 }

const SYSTEM =
  "You write the cover page of a document. You are given the author's working title, an optional subtitle, the tone they " +
  "want, and sometimes the opening of the document. Reply with a JSON object only, with these string keys: " +
  '"title" (a polished title, keeping the author\'s meaning), "subtitle" (one line that says what the document is), ' +
  '"tagline" (one short sentence a reader sees under the rule; empty if nothing worth saying), ' +
  '"byline" (the author and date line, using only the name and date given; empty if none). ' +
  "Plain text, no markdown, no quotes around the values' contents, nothing invented about the document."

/** The author and date line a cover shows when the model is not asked, or gives none. */
export function defaultByline(now = new Date()) {
  const author = useDocumentStore.getState().documentProps.author.trim()
  const date = now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  return author ? `${author} · ${date}` : date
}

/** The cover written from the brief alone: what is inserted when the AI cannot be reached. */
export function plainCover(brief: CoverBrief): CoverText {
  return { title: brief.title.trim(), subtitle: brief.subtitle.trim(), tagline: "", byline: defaultByline() }
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : ""
}

/** The model's JSON as a cover, falling back to the brief for what it left out; null when there is no object. */
export function parseCoverText(raw: string, brief: CoverBrief): CoverText | null {
  const text = unwrapPlain(raw)
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") {
    return null
  }
  const record = parsed as Record<string, unknown>
  const fallback = plainCover(brief)
  return {
    title: clean(record.title, LIMITS.title) || fallback.title,
    subtitle: clean(record.subtitle, LIMITS.subtitle) || fallback.subtitle,
    tagline: clean(record.tagline, LIMITS.tagline),
    byline: clean(record.byline, LIMITS.byline) || fallback.byline,
  }
}

/** What the model is told about the document: the brief, the author and date, and the opening text. */
export function coverContext(brief: CoverBrief, editor: Editor | null) {
  const opening = editor ? editor.state.doc.textBetween(0, Math.min(editor.state.doc.content.size, 1500), "\n") : ""
  return JSON.stringify({
    title: brief.title.trim(),
    subtitle: brief.subtitle.trim(),
    tone: brief.tone,
    author: useDocumentStore.getState().documentProps.author.trim(),
    date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    opening: opening.trim().slice(0, 1500),
  })
}

export async function requestCoverText(brief: CoverBrief, editor: Editor | null, requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, cover: plainCover(brief) }
  }
  try {
    const raw = await generateAiText(
      "Write the cover page. Reply with the JSON object only.",
      coverContext(brief, editor),
      {
        system: SYSTEM,
        plain: true,
        quiet: true,
        requestId,
      },
    )
    if (isAiCancelled(requestId)) {
      return { blocked: null, cover: null }
    }
    const cover = parseCoverText(raw, brief)
    return cover
      ? { blocked: null, cover }
      : { blocked: "The model did not return a cover page.", cover: plainCover(brief) }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, cover: null }
    }
    throw error
  }
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** The cover as document blocks: Title and Subtitle styles, a rule, the tagline and byline, then a page break. */
export function coverHtml(cover: CoverText) {
  const centred = (style: string | null, text: string) =>
    `<p${style ? ` data-style="${style}"` : ""} style="text-align: center">${escape(text)}</p>`
  const parts = [centred("title", cover.title || "Document Title")]
  if (cover.subtitle) {
    parts.push(centred("subtitle", cover.subtitle))
  }
  parts.push("<hr>")
  if (cover.tagline) {
    parts.push(centred(null, cover.tagline))
  }
  if (cover.byline) {
    parts.push(centred(null, cover.byline))
  }
  parts.push("<div data-page-break></div>")
  return parts.join("")
}

/** Puts the cover at the front of the document, in place of a gallery cover page that is there. */
export function insertGeneratedCover(editor: Editor, cover: CoverText) {
  const first = editor.state.doc.firstChild
  if (first?.type.name === "coverPage") {
    editor.commands.removeCoverPage()
  }
  return editor.chain().focus().insertContentAt(0, coverHtml(cover)).setTextSelection(1).run()
}
