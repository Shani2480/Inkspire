import type { AccessibilitySuggestion } from "@/ai/accessibility-check"
import type { AccessibilityIssue } from "@/lib/accessibility"
import type { Editor } from "@tiptap/core"

/** Where the issue's node is now, or null when the document moved on and the node is no longer there. */
function stillThere(editor: Editor, issue: AccessibilityIssue) {
  const doc = editor.state.doc
  if (issue.pos < 0 || issue.pos > doc.content.size) {
    return null
  }
  const node = doc.nodeAt(issue.pos)
  if (!node || node.type.name !== issue.node) {
    return null
  }
  if (issue.node === "text" && node.text?.trim().slice(0, 40) !== issue.excerpt.slice(0, 40)) {
    return null
  }
  return node
}

/** Makes the fix the checker proposed. False when the node it was found on has since changed. */
export function applyAccessibilityFix(editor: Editor, issue: AccessibilityIssue) {
  const fix = issue.fix
  const node = stillThere(editor, issue)
  if (!fix || !node) {
    return false
  }
  const { tr } = editor.state
  if (fix.type === "heading-level") {
    tr.setNodeMarkup(issue.pos, undefined, { ...node.attrs, level: fix.level })
  } else if (fix.type === "table-header") {
    tr.setNodeMarkup(issue.pos, undefined, { ...node.attrs, headerRow: true })
  } else if (fix.type === "color") {
    const mark = node.marks.find((m) => m.type.name === "textStyle")
    const type = editor.schema.marks.textStyle
    if (!type) {
      return false
    }
    tr.addMark(issue.pos, issue.pos + node.nodeSize, type.create({ ...(mark?.attrs ?? {}), color: fix.color }))
  } else {
    let end = issue.pos
    const doc = editor.state.doc
    while (end < doc.content.size) {
      const next = doc.nodeAt(end)
      if (!next || next.type.name !== "paragraph" || next.content.size > 0) {
        break
      }
      end += next.nodeSize
    }
    tr.delete(issue.pos, end)
  }
  editor.view.dispatch(tr)
  return true
}

/** Writes an AI suggestion (after the user has read and maybe edited it) into the document. */
export function applyAccessibilitySuggestion(
  editor: Editor,
  issue: AccessibilityIssue,
  suggestion: AccessibilitySuggestion,
) {
  const node = stillThere(editor, issue)
  const text = suggestion.text.trim()
  if (!node || !text) {
    return false
  }
  const { tr } = editor.state
  if (issue.ai === "alt") {
    tr.setNodeMarkup(issue.pos, undefined, { ...node.attrs, alt: text })
  } else if (issue.ai === "table") {
    tr.setNodeMarkup(issue.pos, undefined, { ...node.attrs, altTitle: suggestion.title?.trim() ?? "", altDesc: text })
  } else if (issue.ai === "link") {
    tr.replaceWith(issue.pos, issue.pos + node.nodeSize, editor.schema.text(text, node.marks))
  } else {
    return false
  }
  editor.view.dispatch(tr)
  return true
}
