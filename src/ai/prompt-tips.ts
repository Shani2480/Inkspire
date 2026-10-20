/** Short advice for writing a request the AI can do well; shown in the chat and in the Ask AI prompt. */
export const PROMPT_TIPS = [
  "Say who it is for: “for new customers”, “for a school newsletter”.",
  "Name the tone: friendly, formal, plain, persuasive.",
  "Give a length: “in 3 sentences”, “under 100 words”, “5 bullet points”.",
  "Select the text first to work on just that part. Without a selection, the AI writes new text.",
  "Ask for one thing at a time, then refine: “shorter”, “more direct”, “add an example”.",
  "Include the facts it should use, such as names, dates and numbers. It will not know them otherwise.",
  "Say what to keep: “keep the first paragraph as it is”, “don't change the names”.",
  "Name the format you want: a list, a table, a heading with two paragraphs, an email.",
  "Not what you wanted? Edit your message and send it again with more detail.",
] as const

/** The tip for a position in a sequence, wrapping around, so the line changes as the person keeps working. */
export function promptTip(position: number) {
  const count = PROMPT_TIPS.length
  return PROMPT_TIPS[((position % count) + count) % count]!
}
