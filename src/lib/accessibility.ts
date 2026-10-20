import type { Editor } from "@tiptap/core"

export function listAccessibilityIssues(editor: Editor | null) {
  if (!editor) {
    return [] as string[]
  }
  const issues: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image" && !String(node.attrs.alt || "").trim()) {
      issues.push("A picture is missing alternative text.")
    }
    if (node.type.name === "heading" && !node.textContent.trim()) {
      issues.push(`Heading ${node.attrs.level || ""} is empty.`)
    }
    if ((node.type.name === "paragraph" || node.type.name === "heading") && node.textContent.length > 800) {
      issues.push("A paragraph is very long. Consider shorter paragraphs for readability.")
    }
    if (node.type.name === "figure" && node.attrs.kind === "chart") {
      issues.push("A chart should include a text description or caption.")
    }
  })
  return [...new Set(issues)].slice(0, 12)
}

export function accessibilityStatus(editor: Editor | null) {
  const issues = listAccessibilityIssues(editor)
  if (issues.length === 0) {
    return { label: "Accessibility: Good to go", ok: true, issues }
  }
  return {
    label: `Accessibility: ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    ok: false,
    issues,
  }
}
