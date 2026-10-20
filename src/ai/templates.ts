import { generateAiText, isAiCancelled, isAiStopped } from "@/ai/generate"
import { useAiSettings } from "@/ai/settings"
import { isTauriRuntime } from "@/lib/platform"
import type { Editor } from "@tiptap/core"

const placeholderPattern = /\[[^\[\]\r\n]{1,80}\]/g

export const TEMPLATE_PRESETS = [
  {
    id: "nda",
    label: "Non-Disclosure Agreement",
    prompt:
      "Write a non-disclosure agreement with the parties, a definition of confidential information, obligations, the term, and signature lines. Use square-bracket placeholders such as [Disclosing Party], [Receiving Party], and [Effective Date].",
  },
  {
    id: "invoice",
    label: "Invoice",
    prompt:
      "Write an invoice with a heading, billing details, a table of line items, and a total. Use square-bracket placeholders such as [Client Name], [Invoice Number], and [Due Date].",
  },
  {
    id: "minutes",
    label: "Meeting Minutes",
    prompt:
      "Write meeting minutes with a title, the date, attendees, decisions, and next steps. Use square-bracket placeholders such as [Meeting Title], [Date], and [Attendee Name].",
  },
] as const

const LOCAL_TEMPLATES: Record<(typeof TEMPLATE_PRESETS)[number]["id"], string> = {
  nda: `
<h1>Non-Disclosure Agreement</h1>
<p>This agreement is between <strong>[Disclosing Party]</strong> and <strong>[Receiving Party]</strong> and begins on [Effective Date].</p>
<h2>Confidential information</h2>
<p>[Disclosing Party] may share information about [Subject Matter] with [Receiving Party].</p>
<h2>Obligations</h2>
<ul>
<li>Keep the information confidential.</li>
<li>Use it only for [Permitted Purpose].</li>
</ul>
<h2>Term</h2>
<p>These obligations last for [Term Length] from [Effective Date].</p>
`.trim(),
  invoice: `
<h1>Invoice</h1>
<p>Invoice [Invoice Number] for [Client Name].</p>
<p>Issued on [Issue Date]. Payment is due on [Due Date].</p>
<table>
<tbody>
<tr><th>Description</th><th>Amount</th></tr>
<tr><td>[Item Description]</td><td>[Amount]</td></tr>
<tr><td>[Second Item]</td><td>[Second Amount]</td></tr>
</tbody>
</table>
<p>Total due: <strong>[Total]</strong></p>
`.trim(),
  minutes: `
<h1>[Meeting Title]</h1>
<p>Held on [Date] at [Location].</p>
<h2>Attendees</h2>
<ul>
<li>[Attendee Name]</li>
<li>[Second Attendee]</li>
</ul>
<h2>Decisions</h2>
<p>[Decision Summary]</p>
<h2>Next steps</h2>
<ul>
<li>[Action Item], owned by [Owner].</li>
</ul>
`.trim(),
}

export function findPlaceholders(editor: Editor) {
  const found: string[] = []
  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text) {
      return
    }
    placeholderPattern.lastIndex = 0
    for (const match of node.text.matchAll(placeholderPattern)) {
      if (!found.includes(match[0])) {
        found.push(match[0])
      }
    }
  })
  return found
}

export function replacePlaceholders(editor: Editor, values: Record<string, string>) {
  const replacements: { from: number; to: number; text: string }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return
    }
    placeholderPattern.lastIndex = 0
    for (const match of node.text.matchAll(placeholderPattern)) {
      const token = match[0]
      const text = values[token]?.trim()
      if (!text) {
        continue
      }
      const from = pos + (match.index ?? 0)
      replacements.push({ from, to: from + token.length, text })
    }
  })

  if (replacements.length === 0) {
    return false
  }

  let transaction = editor.state.tr
  for (const item of replacements.sort((left, right) => right.from - left.from)) {
    transaction = transaction.insertText(item.text, item.from, item.to)
  }
  editor.view.dispatch(transaction)
  return true
}

export function streamingPreviewHtml(raw: string) {
  let value = raw.replace(/^\uFEFF/, "").trimStart()
  if (value.startsWith("```")) {
    const newline = value.indexOf("\n")
    value = newline === -1 ? "" : value.slice(newline + 1)
  }
  value = value
    .replace(/```\s*$/, "")
    .replace(/<[^>]*$/, "")
    .trim()
  if (!value) {
    return "<p></p>"
  }
  if (!value.includes("<")) {
    return `<p>${escapeHtml(value)}</p>`
  }
  return value.replace(/<\/?thead>/gi, "")
}

function localTemplateHtml(prompt: string) {
  const match = TEMPLATE_PRESETS.find((item) => item.prompt === prompt.trim())
  if (match) {
    return LOCAL_TEMPLATES[match.id]
  }

  const clipped = escapeHtml(prompt.trim().slice(0, 500))
  return `
<h1>[Document Title]</h1>
<p>Prepared for [Client Name] on [Date].</p>
<p>${clipped}</p>
<ul>
<li>[First Point]</li>
<li>[Second Point]</li>
</ul>
`.trim()
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function generateTemplateDraft(prompt: string, requestId: string) {
  if (useAiSettings.getState().running) {
    return "busy" as const
  }

  if (!isTauriRuntime()) {
    const html = localTemplateHtml(prompt)
    const settings = useAiSettings.getState()
    settings.begin(requestId)
    try {
      const step = 24
      for (let index = 0; index < html.length; index += step) {
        if (isAiCancelled(requestId) || useAiSettings.getState().requestId !== requestId) {
          return stoppedTemplate(requestId)
        }
        settings.addChunk(html.slice(index, index + step))
        await wait(40)
      }
      if (isAiCancelled(requestId) || useAiSettings.getState().requestId !== requestId) {
        return stoppedTemplate(requestId)
      }
      settings.settle(html)
      return "ok" as const
    } catch (error) {
      if (useAiSettings.getState().requestId === requestId) {
        settings.finish()
      }
      throw error
    }
  }

  try {
    const html = await generateAiText(prompt, "", { requestId })
    if (isAiCancelled(requestId) || useAiSettings.getState().requestId !== requestId) {
      return stoppedTemplate(requestId)
    }
    useAiSettings.getState().settle(html)
    return "ok" as const
  } catch (error) {
    if (isAiStopped(error) || isAiCancelled(requestId)) {
      return stoppedTemplate(requestId)
    }
    throw error
  }
}

function stoppedTemplate(requestId: string) {
  if (useAiSettings.getState().requestId !== requestId) {
    return "stopped" as const
  }
  const stream = useAiSettings.getState().stream
  if (stream.trim()) {
    useAiSettings.getState().settle(stream)
  } else {
    useAiSettings.getState().finish()
  }
  return "stopped" as const
}
