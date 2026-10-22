import { aiUnavailableReason } from "@/ai/availability"
import { generateAiText, isAiCancelled } from "@/ai/generate"
import type { GrammarIssue } from "@/ai/proofing"
import { unwrapPlain } from "@/ai/themes"
import { languageThesaurusName } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { findGrammarIssues } from "@/editor/grammar-rules"
import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

/**
 * The assistant's answer to a question about the selected text. A question asked of a selection is read for what it
 * wants: "is this correct?" gets a verdict first and an offer of fixes; "proofread this" gets the verdict and the
 * fixes at once; anything else is a rewrite, as before. Each fix is put in the document by the sidebar's button, in
 * the place the checked text still occupies.
 */

export type AssistIntent = "check" | "proofread" | "other"

export type Correction = GrammarIssue & {
  /** Where the text sits in the checked text, so a short one ("a") is fixed where it was flagged, not at its first match. */
  at?: number
}

export type Review = {
  /** Nothing to fix. */
  ok: boolean
  corrections: Correction[]
  /** Why the verdict is the built-in rules' rather than the AI's, when it is. */
  note: string
}

/** Where the checked text sits in the document, so the fixes can be found there later. */
export type ReviewRange = {
  from: number
  to: number
  text: string
}

const CHECK =
  /\b(?:is|are|does|do|was|were)\b.{0,60}\b(?:correct|right|ok|okay|fine|grammatical|proper|accurate|good|well[- ]written|make sense|sound right|read well|read right)\b|\b(?:any|some)\b.{0,30}\b(?:errors?|mistakes?|typos?|issues?|problems?)\b|\b(?:check|review|look at|look over|verify)\b.{0,40}\b(?:grammar|spelling|punctuation|sentence|text|paragraph|this|it)\b|\bgrammar\b.{0,20}\b(?:check|ok|okay|fine|correct)\b|\bspell[- ]?check\b|\bgrammar[- ]?check\b/i

const PROOFREAD =
  /\bproof-?read\b|\b(?:fix|correct|repair|clean up|tidy up|sort out)\b.{0,40}\b(?:grammar|spelling|punctuation|typos?|mistakes?|errors?|sentence|text|paragraph|this|it)\b|\b(?:grammar|spelling|punctuation|typos?|mistakes?|errors?)\b.{0,30}\b(?:fix|fixed|correct|corrected)\b|\bcorrect\s+(?:this|it|the|my)\b/i

/** What a question asked of the selected text wants. */
export function assistIntent(prompt: string): AssistIntent {
  const text = prompt.trim()
  if (!text) {
    return "other"
  }
  if (PROOFREAD.test(text)) {
    return "proofread"
  }
  if (CHECK.test(text)) {
    return "check"
  }
  return "other"
}

const REVIEW_SYSTEM =
  "You are a proofreader inside a word processor. Check the text for spelling, grammar and punctuation mistakes. " +
  'Return only a JSON object: {"ok": true or false, "issues": [{"text": "...", "suggestion": "...", "reason": "..."}]}. ' +
  "ok is true only when there is nothing to fix. In each issue, text is the smallest phrase that contains the mistake, " +
  "copied exactly from the input; suggestion is that phrase corrected; reason is a short explanation in the document's " +
  "language. Do not rewrite for style or change the meaning. No markdown and no commentary."

/** The verdict and fixes in the model's reply. */
export function parseReview(raw: string, source: string): { ok: boolean; corrections: Correction[] } {
  const text = unwrapPlain(raw)
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
  if (start < 0 || end <= start) {
    return { ok: !/error|mistake|incorrect|wrong/i.test(text), corrections: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, corrections: [] }
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  const corrections = correctionsFrom(record ? record.issues : parsed, source)
  return { ok: corrections.length === 0, corrections }
}

/**
 * The fixes in a parsed reply: {text, suggestion, reason} records whose text is in the source, kept as written (a fix
 * can be about spaces alone, or remove the text). Anything else is skipped.
 */
function correctionsFrom(parsed: unknown, source: string): Correction[] {
  if (!Array.isArray(parsed)) {
    return []
  }
  const corrections: Correction[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue
    }
    const record = item as Record<string, unknown>
    const text = typeof record.text === "string" ? record.text.slice(0, 200) : ""
    const suggestion = typeof record.suggestion === "string" ? record.suggestion.slice(0, 200) : null
    const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, 240) : ""
    if (!text || suggestion === null || suggestion === text || !source.includes(text)) {
      continue
    }
    corrections.push({ text, suggestion, reason, at: source.indexOf(text) })
    if (corrections.length === 20) {
      break
    }
  }
  return corrections
}

function rulesReview(text: string): Correction[] {
  const language = useDocumentStore.getState().pageSetup.language
  return findGrammarIssues(text, language).map((issue) => ({
    text: issue.text,
    suggestion: issue.suggestions[0] ?? "",
    reason: issue.message,
    at: issue.from,
  }))
}

/** Checks the text with the AI, or with the built-in rules when the AI cannot be reached. */
export async function requestReview(text: string, requestId: string): Promise<Review> {
  const source = text.slice(0, 8_000)
  const reason = await aiUnavailableReason()
  if (reason) {
    const corrections = rulesReview(source)
    return { ok: corrections.length === 0, corrections, note: `${reason} Checked with the built-in rules instead.` }
  }
  const language = languageThesaurusName(useDocumentStore.getState().pageSetup.language)
  const raw = await generateAiText(`Proofread this ${language} text. Reply with the JSON object only.`, source, {
    system: REVIEW_SYSTEM,
    plain: true,
    quiet: true,
    requestId,
  })
  if (isAiCancelled(requestId)) {
    throw new Error("Stopped.")
  }
  return { ...parseReview(raw, source), note: "" }
}

/** One sentence, or more? "The sentence is fine" reads wrong under a paragraph. */
function sentenceCount(text: string) {
  const ends = text.trim().match(/[.!?…]+(?=\s|$)/g)
  return Math.max(1, ends ? ends.length : 1)
}

/** The verdict's first line. */
export function reviewStatus(review: Review, text: string) {
  const subject = sentenceCount(text) > 1 || text.includes("\n") ? "text" : "sentence"
  if (review.ok) {
    return `The ${subject} is fine.`
  }
  const spelling = review.corrections.every((item) => /spell|typo|misspel/i.test(item.reason))
  const kind = spelling ? "spelling" : "grammatical"
  return review.corrections.length === 1
    ? `There is a ${spelling ? "spelling" : "grammatical"} error in the ${subject}.`
    : `There are some ${kind} errors in the ${subject}.`
}

// --- putting the fixes in the document -----------------------------------------------------------------------------

/** The text between two positions and, for each character, the position it sits at. An atom counts as one. */
export function rangeText(doc: ProseMirrorNode, from: number, to: number) {
  let text = ""
  const map: number[] = []
  let blocks = 0
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      if (blocks > 0) {
        text += "\n"
        map.push(pos)
      }
      blocks += 1
      return true
    }
    if (node.isText && node.text) {
      const start = Math.max(from, pos)
      const end = Math.min(to, pos + node.nodeSize)
      for (let at = start; at < end; at += 1) {
        map.push(at)
      }
      text += node.text.slice(start - pos, end - pos)
      return false
    }
    if (node.isInline && node.isLeaf) {
      text += node.type.name === "hardBreak" ? "\n" : "￼"
      map.push(pos)
      return false
    }
    return true
  })
  return { text, map }
}

/**
 * Where a correction's text sits inside the checked range: the occurrence nearest to where it was flagged, or the
 * first. Null when it is no longer there. A fix spanning two paragraphs would merge them, so that is left to a rewrite.
 */
export function findCorrection(doc: ProseMirrorNode, range: ReviewRange, correction: Correction) {
  const max = doc.content.size
  const from = Math.max(0, Math.min(range.from, max))
  const to = Math.max(from, Math.min(range.to, max))
  const found = correction.text
  if (!found || found.includes("\n") || from === to) {
    return null
  }
  const { text, map } = rangeText(doc, from, to)
  let best: { offset: number; from: number; to: number } | null = null
  let at = text.indexOf(found)
  while (at >= 0) {
    const last = at + found.length - 1
    if (map[at] !== undefined && map[last] !== undefined) {
      const place = { offset: at, from: map[at], to: map[last] + 1 }
      if (correction.at === undefined) {
        return place
      }
      if (!best || Math.abs(at - correction.at) < Math.abs(best.offset - correction.at)) {
        best = place
      }
    }
    at = text.indexOf(found, at + 1)
  }
  return best
}

export type AppliedCorrection = {
  /** The checked range with its end moved by the fix. */
  range: ReviewRange
  /** Where the fix went, as an offset in the checked text, and how much longer or shorter the text is now. */
  offset: number
  delta: number
}

/** Puts a correction in the document, or null when its text is no longer there. */
export function applyCorrection(editor: Editor, range: ReviewRange, correction: Correction): AppliedCorrection | null {
  const place = findCorrection(editor.state.doc, range, correction)
  if (!place) {
    return null
  }
  const { state } = editor
  const marks = state.doc.resolve(Math.min(place.from + 1, place.to)).marks()
  const tr = correction.suggestion
    ? state.tr.replaceWith(place.from, place.to, state.schema.text(correction.suggestion, marks))
    : state.tr.delete(place.from, place.to)
  editor.view.dispatch(tr)
  const delta = correction.suggestion.length - (place.to - place.from)
  editor
    .chain()
    .focus()
    .setTextSelection({ from: place.from, to: place.from + correction.suggestion.length })
    .run()
  return { range: { ...range, to: range.to + delta }, offset: place.offset, delta }
}
