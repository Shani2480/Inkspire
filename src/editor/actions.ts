import { stepShapeTextSize } from "@/editor/shape-text"
import { assistIntent } from "@/ai/assist"
import { useAiChat } from "@/ai/chat"
import { generateAiText, isAiCancelled, isAiStopped } from "@/ai/generate"
import { useRewrite, type DraftInsert, type DraftKind } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import { FONT_SIZES } from "@/components/ribbon/options"
import { reportError } from "@/document/commands"
import { insertFittedImage } from "@/editor/image-fit"
import { restoreSelection } from "@/editor/selection-memory"
import { isTauriRuntime } from "@/lib/platform"
import type { Editor } from "@tiptap/core"
import type { Mark } from "@tiptap/pm/model"

const DOCUMENT_TEMPLATE = `
<h1>Untitled document</h1>
<p>Start with a short introduction that tells the reader what this document is about.</p>
<h2>Background</h2>
<p>Describe the context, the audience, and why this document exists.</p>
<h2>Main points</h2>
<ul>
  <li>First point worth keeping.</li>
  <li>Second point worth keeping.</li>
  <li>Third point worth keeping.</li>
</ul>
<h2>Next steps</h2>
<p>Close with the action you want the reader to take.</p>
`.trim()

export function setLineSpacing(editor: Editor, lineHeight: string | null) {
  restoreSelection(editor)
  const { state } = editor
  const { from, to } = state.selection
  let transaction = state.tr
  const positions: number[] = []

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      positions.push(pos)
    }
  })

  for (const pos of positions) {
    const node = transaction.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    transaction = transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      lineHeight,
    })
  }

  editor.view.dispatch(transaction)
  editor.commands.focus()
}

const DEFAULT_FONT_SIZE = 12

export type CaseKind = "sentence" | "lower" | "upper" | "title"

function pointSize(value: unknown) {
  if (typeof value !== "string" || !value) {
    return DEFAULT_FONT_SIZE
  }
  const size = Number.parseFloat(value)
  return Number.isFinite(size) ? size : DEFAULT_FONT_SIZE
}

function steppedSize(current: number, direction: 1 | -1) {
  if (direction > 0) {
    return FONT_SIZES.find((size) => size > current) ?? null
  }
  for (let index = FONT_SIZES.length - 1; index >= 0; index -= 1) {
    if (FONT_SIZES[index] < current) {
      return FONT_SIZES[index]
    }
  }
  return null
}

export function stepFontSize(editor: Editor, direction: 1 | -1) {
  restoreSelection(editor)
  if (stepShapeTextSize(editor, direction)) {
    return
  }
  const { state } = editor
  const { from, to, empty } = state.selection
  const markType = state.schema.marks.textStyle
  if (!markType) {
    return
  }

  if (empty) {
    const next = steppedSize(pointSize(editor.getAttributes("textStyle").fontSize), direction)
    if (next == null) {
      return
    }
    editor.chain().focus().setFontSize(`${next}pt`).run()
    return
  }

  let transaction = state.tr
  let changed = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) {
      return
    }
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    if (start >= end) {
      return
    }
    const currentMark = node.marks.find((mark) => mark.type === markType)
    const next = steppedSize(pointSize(currentMark?.attrs.fontSize), direction)
    if (next == null) {
      return
    }
    transaction = transaction.addMark(
      start,
      end,
      markType.create({
        ...(currentMark?.attrs ?? {}),
        fontSize: `${next}pt`,
      }),
    )
    changed = true
  })

  if (!changed) {
    return
  }
  editor.view.dispatch(transaction)
  editor.commands.focus()
}

function sentenceStart(before: string) {
  const trimmed = before.replace(/[\s"'“”‘’)\]]+$/u, "")
  if (!trimmed) {
    return true
  }
  return /[.!?]$/.test(trimmed)
}

function transformCase(text: string, kind: CaseKind, sentence: { next: boolean }) {
  if (kind === "lower") {
    return text.toLowerCase()
  }
  if (kind === "upper") {
    return text.toUpperCase()
  }
  if (kind === "title") {
    return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
  }

  let result = ""
  for (const char of text) {
    if (sentence.next && /[A-Za-z]/.test(char)) {
      result += char.toUpperCase()
      sentence.next = false
    } else {
      result += char.toLowerCase()
    }
    if (/[.!?]/.test(char)) {
      sentence.next = true
    }
  }
  return result
}

export function changeCase(editor: Editor, kind: CaseKind) {
  restoreSelection(editor)
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) {
    return
  }

  const slices: { from: number; to: number; text: string; marks: readonly Mark[] }[] = []
  const sentence = { next: true }
  let blockStart = -1

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) {
      return
    }
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    if (start >= end) {
      return
    }
    const $pos = state.doc.resolve(pos)
    const block = $pos.start()
    if (block !== blockStart) {
      const before = blockStart === -1 ? $pos.parent.textBetween(0, Math.max(0, start - $pos.start())) : ""
      sentence.next = blockStart === -1 ? sentenceStart(before) : true
      blockStart = block
    }
    const text = node.text.slice(start - pos, end - pos)
    slices.push({
      from: start,
      to: end,
      text: transformCase(text, kind, sentence),
      marks: node.marks,
    })
  })

  const replacements = slices.filter((slice) => {
    const original = state.doc.textBetween(slice.from, slice.to)
    return slice.text !== original
  })
  if (replacements.length === 0) {
    return
  }

  let transaction = state.tr
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const slice = replacements[index]
    transaction = transaction.replaceWith(slice.from, slice.to, state.schema.text(slice.text, slice.marks))
  }
  editor.view.dispatch(transaction)
  editor.commands.focus()
}

export { changeIndent } from "@/editor/indent"

export function replaceSpelling(editor: Editor, from: number, to: number, next: string) {
  const { state } = editor
  if (!next || from < 0 || to > state.doc.content.size || from >= to) {
    return
  }
  const current = state.doc.textBetween(from, to)
  if (!current) {
    return
  }
  const marks = state.doc.resolve(Math.min(from + 1, to)).marks()
  editor.view.dispatch(state.tr.replaceWith(from, to, state.schema.text(next, marks)))
  editor.commands.focus()
}

export function insertImageFile(editor: Editor, file: File, at?: number) {
  const reader = new FileReader()
  reader.onload = () => {
    const src = typeof reader.result === "string" ? reader.result : ""
    if (!src) {
      return
    }
    void insertFittedImage(editor, { src, alt: file.name, at })
  }
  reader.readAsDataURL(file)
}

export function applyLink(editor: Editor, href: string, range?: { from: number; to: number }) {
  const trimmed = href.trim()
  const chain = editor.chain()
  if (range && range.from !== range.to) {
    chain.setTextSelection(range)
  }
  chain.focus()
  if (!trimmed) {
    chain.extendMarkRange("link").unsetLink().run()
    return
  }
  const url = /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
  chain.extendMarkRange("link").setLink({ href: url }).run()
}

export async function summarizeDocument(editor: Editor, range?: { from: number; to: number }) {
  if (!range) {
    restoreSelection(editor)
  }
  const selection = range ?? editor.state.selection
  const text = editor.state.doc.textBetween(selection.from, selection.to, "\n").trim()
  const source = text || editor.getText().trim()
  if (!source || useAiSettings.getState().running || useRewrite.getState().open) {
    return
  }

  const at = text ? selection.to : editor.state.doc.content.size
  const prompt = "Summarize the document context. Return a short heading and one or two paragraphs."
  if (isTauriRuntime()) {
    await previewGenerated("summary", prompt, source, selection, "after", at)
    return
  }

  const summary = extractiveSummary(source)
  const html = `<blockquote><p><strong>Summary.</strong> ${escapeHtml(summary)}</p></blockquote>`
  await previewGenerated("summary", prompt, source, selection, "after", at, html)
}

const DEFAULT_REWRITE_PROMPT =
  "Rewrite the document context so it is clearer and tighter. Preserve the meaning and return only the rewritten passage."

function rewritePrompt(instruction?: string) {
  const text = instruction?.trim() ?? ""
  if (!text || /^rewrite$/i.test(text)) {
    return DEFAULT_REWRITE_PROMPT
  }
  return `${text} Return only the resulting text, with no explanation.`
}

export async function rewriteSelection(editor: Editor, range?: { from: number; to: number }, instruction?: string) {
  if (!range) {
    restoreSelection(editor)
  }
  const selection = range ?? {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  }
  let from = selection.from
  let to = selection.to

  if (from === to) {
    const $from = editor.state.doc.resolve(from)
    from = $from.start()
    to = $from.end()
  }

  const text = editor.state.doc.textBetween(from, to, "\n")
  if (!text.trim()) {
    return
  }

  if (useAiSettings.getState().running || useRewrite.getState().open) {
    return
  }

  // With the chat panel open the rewrite is a turn in the chat; its reply has the Replace selection button.
  if (useAiChat.getState().open) {
    const label = instruction?.trim() && !/^rewrite$/i.test(instruction.trim()) ? instruction.trim() : "Rewrite"
    editor.chain().setTextSelection({ from, to }).run()
    await useAiChat.getState().askAbout(`${label}:\n${text}`, rewritePrompt(instruction), text)
    return
  }

  const requestId = crypto.randomUUID()
  useRewrite.getState().openSession({
    kind: "rewrite",
    from,
    to,
    at: to,
    requestId,
    insert: "replace",
    anchorText: text,
  })
  try {
    if (!isTauriRuntime()) {
      await streamDraft(tighten(text), requestId)
      return
    }

    const html = await generateAiText(rewritePrompt(instruction), text, { requestId })
    if (!sessionStill(requestId) || isAiCancelled(requestId)) {
      settlePartial(requestId)
      return
    }
    useAiSettings.getState().settle(html)
  } catch (error) {
    if (isAiStopped(error) || isAiCancelled(requestId)) {
      settlePartial(requestId)
      return
    }
    if (useRewrite.getState().requestId === requestId) {
      useRewrite.getState().closeSession()
    }
    await reportError(error)
  }
}

/** `as: "after"` keeps the selected text and puts the result under it instead of in its place. */
export function applyDraft(editor: Editor, as?: "after") {
  const session = useRewrite.getState()
  if (!session.open) {
    return
  }

  const html = useAiSettings.getState().settledHtml || useAiSettings.getState().stream
  if (!html.trim()) {
    return
  }

  const max = editor.state.doc.content.size
  if (session.insert === "replace" && as === "after") {
    const to = Math.min(Math.max(session.to, 0), max)
    const $to = editor.state.doc.resolve(to)
    // After the block the selection ends in, so the new text starts a paragraph of its own.
    const after = $to.depth > 0 ? $to.after($to.depth) : to
    editor.chain().focus().insertContentAt(after, html).run()
  } else if (session.insert === "replace") {
    const from = Math.min(session.from, max)
    const to = Math.min(Math.max(session.to, from), max)
    const current = editor.state.doc.textBetween(from, to, "\n")
    if (current !== session.anchorText) {
      session.setNotice("The selection changed.")
      return
    }
    editor.chain().focus().setTextSelection({ from, to }).insertContent(html).run()
  } else if (session.insert === "document" && editor.isEmpty) {
    editor.chain().focus().setContent(html).run()
  } else {
    const at = Math.min(Math.max(session.at, 0), max)
    editor.chain().focus().insertContentAt(at, html).run()
  }
  session.closeSession()
}

async function previewGenerated(
  kind: DraftKind,
  prompt: string,
  context: string,
  range: { from: number; to: number },
  insert: DraftInsert,
  at: number,
  localHtml?: string,
) {
  const requestId = crypto.randomUUID()
  useRewrite.getState().openSession({
    kind,
    from: range.from,
    to: range.to,
    at,
    requestId,
    insert,
    anchorText: "",
  })
  try {
    if (localHtml !== undefined) {
      await streamDraft(localHtml, requestId)
      return
    }
    const html = await generateAiText(prompt, context, { requestId })
    if (!sessionStill(requestId) || isAiCancelled(requestId)) {
      settlePartial(requestId)
      return
    }
    useAiSettings.getState().settle(html)
  } catch (error) {
    if (isAiStopped(error) || isAiCancelled(requestId)) {
      settlePartial(requestId)
      return
    }
    if (useRewrite.getState().requestId === requestId) {
      useRewrite.getState().closeSession()
    }
    await reportError(error)
  }
}

function sessionStill(requestId: string) {
  const session = useRewrite.getState()
  return session.open && session.requestId === requestId
}

function settlePartial(requestId: string) {
  if (!sessionStill(requestId)) {
    return
  }
  const stream = useAiSettings.getState().stream
  if (stream.trim()) {
    useAiSettings.getState().settle(stream)
    return
  }
  useAiSettings.getState().finish()
}

async function streamDraft(text: string, requestId: string) {
  if (!sessionStill(requestId)) {
    return
  }
  const settings = useAiSettings.getState()
  settings.begin(requestId)
  const step = 16
  for (let index = 0; index < text.length; index += step) {
    if (!sessionStill(requestId)) {
      return
    }
    if (isAiCancelled(requestId)) {
      settlePartial(requestId)
      return
    }
    settings.addChunk(text.slice(index, index + step))
    await wait(80)
  }
  if (sessionStill(requestId) && !isAiCancelled(requestId)) {
    settings.settle(text)
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function askAi(editor: Editor, prompt: string, range?: { from: number; to: number }) {
  const trimmed = prompt.trim()
  if (!trimmed || useAiSettings.getState().running || useRewrite.getState().open) {
    return false
  }

  const chosen = range ?? currentRange(editor)
  // A question about the selected text ("is this correct?", "proofread this") is answered in the chat, with the
  // verdict and the fixes to apply; the Rewrite popover is for new wording.
  if (chosen.from !== chosen.to) {
    const intent = assistIntent(trimmed)
    if (intent !== "other") {
      await useAiChat.getState().reviewSelection(editor, trimmed, intent, chosen)
      return true
    }
  }
  // With text selected the request is about that text and its result replaces it; Insert below keeps it.
  if (chosen.from !== chosen.to || trimmed.toLowerCase().includes("rewrite")) {
    await rewriteSelection(editor, range, trimmed)
    return useRewrite.getState().open
  }

  const bounds = range ?? currentRange(editor)
  if (!isTauriRuntime()) {
    const normalized = trimmed.toLowerCase()
    if (normalized.includes("template")) {
      const at = bounds.from === bounds.to ? bounds.from : bounds.to
      await previewGenerated(
        "draft",
        trimmed,
        "",
        bounds,
        bounds.from === bounds.to ? "document" : "after",
        at,
        DOCUMENT_TEMPLATE,
      )
      return useRewrite.getState().open
    }
    if (normalized.includes("summar")) {
      await summarizeDocument(editor, range)
      return useRewrite.getState().open
    }
    await rewriteSelection(editor, range)
    return useRewrite.getState().open
  }

  const selected = bounds.from === bounds.to ? "" : editor.state.doc.textBetween(bounds.from, bounds.to, "\n").trim()
  const at = bounds.from === bounds.to ? bounds.from : bounds.to
  await previewGenerated(
    "draft",
    trimmed,
    selected || editor.getText().trim(),
    bounds,
    bounds.from === bounds.to ? "document" : "after",
    at,
  )
  return useRewrite.getState().open
}

function currentRange(editor: Editor) {
  const { from, to } = editor.state.selection
  return { from, to }
}

function extractiveSummary(text: string) {
  const sentences = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const match = paragraph.match(/^.*?[.!?](?:\s|$)/)
      return (match?.[0] ?? paragraph).trim()
    })
    .slice(0, 4)

  const summary = sentences.join(" ")
  return summary.length > 420 ? `${summary.slice(0, 417).trimEnd()}…` : summary
}

function tighten(text: string) {
  return text
    .replace(/\b(very|really|just|actually|basically|literally|quite|somewhat)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim()
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
