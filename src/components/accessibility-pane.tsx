import {
  accessibilityItems,
  requestAccessibilitySuggestions,
  useAccessibility,
  type AccessibilitySuggestion,
} from "@/ai/accessibility-check"
import { useDocumentStore } from "@/document/store"
import { errorMessage } from "@/document/commands"
import { applyAccessibilityFix, applyAccessibilitySuggestion } from "@/editor/accessibility-fixes"
import { useBodyEditor } from "@/editor/document-editor"
import { checkAccessibility, type AccessibilityIssue, type AccessibilitySeverity } from "@/lib/accessibility"
import { useEditorState } from "@tiptap/react"
import { Sparkles, X } from "lucide-react"

const GROUPS: { severity: AccessibilitySeverity; title: string }[] = [
  { severity: "error", title: "Errors" },
  { severity: "warning", title: "Warnings" },
  { severity: "tip", title: "Tips" },
]

/** The Accessibility Checker pane: the checker's findings with one-click fixes, and AI-written text for what needs words. */
export function AccessibilityPane() {
  const editor = useBodyEditor()
  const open = useAccessibility((state) => state.open)
  const closePane = useAccessibility((state) => state.closePane)
  const dismissed = useAccessibility((state) => state.dismissed)
  const suggestions = useAccessibility((state) => state.suggestions)
  const running = useAccessibility((state) => state.running)
  const error = useAccessibility((state) => state.error)
  const pageColor = useDocumentStore((state) => state.pageSetup.pageColor)
  const found = useEditorState({
    editor,
    selector: ({ editor: current }) => (open && current ? checkAccessibility(current, { pageColor }) : []),
    equalityFn: (a, b) => (a ?? []).map((i) => i.id).join() === (b ?? []).map((i) => i.id).join(),
  })
  const issues = (found ?? []).filter((issue) => !dismissed.includes(issue.id))

  if (!open) {
    return null
  }

  const askable = issues.filter((issue) => issue.ai)

  async function suggestAll() {
    if (!editor) {
      return
    }
    const state = useAccessibility.getState()
    const requestId = crypto.randomUUID()
    state.setRequestId(requestId)
    state.setRunning(true)
    state.setError("")
    try {
      const result = await requestAccessibilitySuggestions(accessibilityItems(editor, askable), requestId)
      if (result.blocked) {
        state.setError(result.blocked)
      }
      for (const [id, suggestion] of Object.entries(result.suggestions)) {
        state.setSuggestion(id, suggestion)
      }
    } catch (failure) {
      state.setError(errorMessage(failure))
    } finally {
      state.setRunning(false)
    }
  }

  return (
    <aside
      aria-label="Accessibility Checker"
      className="comments-sidebar app-overlay flex min-h-0 w-80 shrink-0 flex-col"
    >
      <div className="comments-sidebar-header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--app-ribbon-text)]">Accessibility Checker</h2>
          <button
            type="button"
            className="comment-icon-btn"
            aria-label="Close accessibility checker"
            onClick={closePane}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--app-ribbon-muted)]">
          {issues.length === 0
            ? "No accessibility issues found."
            : `${issues.length} thing${issues.length === 1 ? "" : "s"} to look at.`}
        </p>
        {askable.length > 0 ? (
          <button
            type="button"
            className="dialog-btn mt-2 inline-flex items-center gap-1"
            disabled={running}
            onClick={() => void suggestAll()}
          >
            <Sparkles className="size-3.5" strokeWidth={2} />
            {running ? "Asking the AI…" : `Suggest text with AI (${askable.length})`}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[11px] text-[#b3261e]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2" data-testid="accessibility-list">
        {GROUPS.map((group) => {
          const rows = issues.filter((issue) => issue.severity === group.severity)
          return rows.length === 0 ? null : (
            <section key={group.severity} className="mb-3">
              <h3 className="mb-1 text-[11px] font-semibold uppercase text-[var(--app-ribbon-muted)]">{group.title}</h3>
              <ul className="space-y-2">
                {rows.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} suggestion={suggestions[issue.id]} />
                ))}
              </ul>
            </section>
          )
        })}
        {suggestions && Object.keys(suggestions).length > 0 ? (
          <p className="text-[11px] text-[var(--app-ribbon-muted)]">
            The AI cannot see pictures. Its text comes from file names and the words around each picture, so read it
            before you apply it.
          </p>
        ) : null}
      </div>
    </aside>
  )
}

function IssueCard({ issue, suggestion }: { issue: AccessibilityIssue; suggestion?: AccessibilitySuggestion }) {
  const editor = useBodyEditor()
  const setSuggestion = useAccessibility((state) => state.setSuggestion)
  const dismiss = useAccessibility((state) => state.dismiss)

  function goTo() {
    if (editor) {
      editor
        .chain()
        .focus()
        .setTextSelection(Math.min(issue.pos + 1, editor.state.doc.content.size))
        .scrollIntoView()
        .run()
    }
  }

  return (
    <li className="comment-card" data-issue={issue.kind}>
      <button type="button" className="w-full text-left text-[12px] text-[var(--app-ribbon-text)]" onClick={goTo}>
        {issue.message}
        {issue.excerpt && issue.kind !== "weak-alt" ? (
          <span className="mt-0.5 block truncate text-[11px] text-[var(--app-ribbon-muted)]">{issue.excerpt}</span>
        ) : null}
      </button>
      {suggestion ? (
        <div className="mt-2 space-y-1">
          {issue.ai === "table" ? (
            <input
              aria-label="Table title"
              className="w-full rounded border border-black/15 px-1.5 py-1 text-[12px] dark:border-white/20"
              value={suggestion.title ?? ""}
              onChange={(event) => setSuggestion(issue.id, { ...suggestion, title: event.target.value })}
            />
          ) : null}
          <textarea
            aria-label="Suggested text"
            rows={issue.ai === "link" ? 1 : 3}
            className="w-full rounded border border-black/15 px-1.5 py-1 text-[12px] dark:border-white/20"
            value={suggestion.text}
            onChange={(event) => setSuggestion(issue.id, { ...suggestion, text: event.target.value })}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              className="dialog-btn is-primary"
              onClick={() => {
                if (editor && applyAccessibilitySuggestion(editor, issue, suggestion)) {
                  setSuggestion(issue.id, null)
                }
              }}
            >
              Apply
            </button>
            <button type="button" className="dialog-btn" onClick={() => setSuggestion(issue.id, null)}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          {issue.fix ? (
            <button
              type="button"
              className="dialog-btn is-primary"
              onClick={() => editor && applyAccessibilityFix(editor, issue)}
            >
              {fixLabel(issue)}
            </button>
          ) : null}
          <button type="button" className="dialog-btn" onClick={() => dismiss(issue.id)}>
            Ignore
          </button>
        </div>
      )}
    </li>
  )
}

function fixLabel(issue: AccessibilityIssue) {
  switch (issue.fix?.type) {
    case "heading-level":
      return `Make it heading ${issue.fix.level}`
    case "table-header":
      return "Use first row as header"
    case "color":
      return "Darken the text"
    default:
      return "Remove them"
  }
}
