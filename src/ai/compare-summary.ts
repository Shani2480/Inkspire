/** Review > Compare: a short, plain summary of what changed between the two versions, written by the AI. */
import { aiUnavailableReason } from "@/ai/availability"
import { generateAiText, isAiCancelled } from "@/ai/generate"
import { unwrapPlain } from "@/ai/themes"
import type { CompareChange } from "@/document/compare"

const SYSTEM =
  "You summarise the differences between two versions of a document for its author. You are given a JSON array of the changes, " +
  "each an insertion or a deletion with its text, in document order. Write at most five short lines, plain text, one change or " +
  "theme per line, starting with a dash. Say what changed in substance (facts, wording, structure), not how many words. " +
  "Name nothing that is not in the changes. No heading, no markdown, no closing remark."

const MOST_CHANGES = 60
const EACH_CHANGE = 240

/** The changes as the model is shown them: the first of them, each cut to a sensible length. */
export function summaryContext(changes: CompareChange[]) {
  return JSON.stringify(
    changes.slice(0, MOST_CHANGES).map((change) => ({ kind: change.kind, text: change.text.slice(0, EACH_CHANGE) })),
  )
}

/** The lines of the reply, cleaned up: one change each, nothing else. */
export function parseSummary(raw: string) {
  return unwrapPlain(raw)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => line.slice(0, 300))
}

export async function requestCompareSummary(changes: CompareChange[], requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, lines: [] as string[] }
  }
  if (changes.length === 0) {
    return { blocked: null, lines: [] as string[] }
  }
  try {
    const raw = await generateAiText("Summarise these changes. Reply with the lines only.", summaryContext(changes), {
      system: SYSTEM,
      plain: true,
      quiet: true,
      requestId,
    })
    if (isAiCancelled(requestId)) {
      return { blocked: null, lines: [] }
    }
    const lines = parseSummary(raw)
    return lines.length ? { blocked: null, lines } : { blocked: "The model did not return a summary.", lines }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, lines: [] }
    }
    throw error
  }
}
