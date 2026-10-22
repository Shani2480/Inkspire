import { useAiSettings } from "@/ai/settings"
import { languageLabel } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import {
  applyGrammarSuggestion,
  documentTextForAi,
  listGrammarIssues,
  runAiCheck,
  stopAiCheck,
  useEditorPane,
  type FlaggedIssue,
} from "@/editor/grammar"
import { replaceSpelling } from "@/editor/actions"
import {
  addToDictionary,
  checkSpellingNow,
  ignoreSpelling,
  listSpellingErrors,
  spellingSuggestions,
  type SpellingError,
} from "@/editor/spellcheck"
import { useSettledEditorValue } from "@/editor/use-settled"
import type { Editor } from "@tiptap/core"
import { Sparkles, X } from "lucide-react"
import { useEffect } from "react"

const AI_PAUSE_MS = 2500

/**
 * The Editor pane: spelling and grammar found in the background, each with its suggestions to apply in one click,
 * and the document-wide proofing switches. Replaces the Grammar dialog.
 */
export function EditorPane() {
  const editor = useBodyEditor()
  const open = useEditorPane((state) => state.open)
  const closePane = useEditorPane((state) => state.closePane)
  const checkGrammar = useEditorPane((state) => state.checkGrammar)
  const setCheckGrammar = useEditorPane((state) => state.setCheckGrammar)
  const aiAuto = useEditorPane((state) => state.aiAuto)
  const setAiAuto = useEditorPane((state) => state.setAiAuto)
  const aiRunning = useEditorPane((state) => state.aiRunning)
  const aiNotice = useEditorPane((state) => state.aiNotice)
  const aiError = useEditorPane((state) => state.aiError)
  const ignoredCount = useEditorPane((state) => state.ignored.length)
  const version = useEditorPane((state) => state.version)
  const spellCheck = useViewStore((state) => state.spellCheck)
  const setSpellCheck = useViewStore((state) => state.setSpellCheck)
  const language = useDocumentStore((state) => state.pageSetup.language)
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)

  const grammar = useSettledEditorValue(
    editor,
    (current) => (open ? listGrammarIssues(current) : []),
    [] as FlaggedIssue[],
    [open, version, language],
  )
  const spelling = useSettledEditorValue(
    editor,
    (current) => (open ? listSpellingErrors(current) : []),
    [] as SpellingError[],
    [open, version, spellCheck, language],
  )

  // The AI pass runs by itself once typing pauses, when that is on and the text has changed since the last pass.
  useEffect(() => {
    if (!open || !aiAuto || !editor) {
      return
    }
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const state = useEditorPane.getState()
        if (!state.aiRunning && documentTextForAi(editor) !== state.aiCheckedText) {
          void runAiCheck(editor)
        }
      }, AI_PAUSE_MS)
    }
    schedule()
    editor.on("update", schedule)
    return () => {
      editor.off("update", schedule)
      window.clearTimeout(timer)
    }
  }, [open, aiAuto, editor])

  if (!open) {
    return null
  }

  const total = spelling.length + grammar.length
  const summary =
    total === 0
      ? "Nothing to fix."
      : [spelling.length ? `${spelling.length} spelling` : "", grammar.length ? `${grammar.length} grammar` : ""]
          .filter(Boolean)
          .join(", ")

  function recheck() {
    if (!editor) {
      return
    }
    if (!spellCheck) {
      void checkSpellingNow(editor)
    }
    refreshDisplayedMarks(editor)
    if (aiAuto) {
      void runAiCheck(editor)
    }
  }

  return (
    <aside aria-label="Editor" className="comments-sidebar app-overlay flex min-h-0 w-80 shrink-0 flex-col">
      <div className="comments-sidebar-header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--app-ribbon-text)]">Editor</h2>
          <button type="button" className="comment-icon-btn" aria-label="Close editor pane" onClick={closePane}>
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--app-ribbon-muted)]" data-testid="editor-summary">
          {summary} · {languageLabel(language)}
        </p>
        <div className="mt-2 flex flex-col gap-1 text-[12px] text-[var(--app-ribbon-text)]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={spellCheck} onChange={(event) => setSpellCheck(event.target.checked)} />
            Check spelling as you type
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={checkGrammar} onChange={(event) => setCheckGrammar(event.target.checked)} />
            Check grammar as you type
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={aiAuto} onChange={(event) => setAiAuto(event.target.checked)} />
            Ask the AI when typing pauses
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="dialog-btn inline-flex items-center gap-1"
            disabled={!editor || aiRunning}
            onClick={() => editor && void runAiCheck(editor)}
          >
            <Sparkles className="size-3.5" strokeWidth={2} />
            {aiRunning ? "Asking the AI…" : "Check with AI"}
          </button>
          {aiRunning ? (
            <button type="button" className="dialog-btn" onClick={stopAiCheck}>
              Stop
            </button>
          ) : null}
          <button type="button" className="dialog-btn" disabled={!editor} onClick={recheck}>
            Recheck
          </button>
          {ignoredCount > 0 ? (
            <button type="button" className="dialog-btn" onClick={() => useEditorPane.getState().clearIgnored()}>
              Show ignored ({ignoredCount})
            </button>
          ) : null}
        </div>
        {aiNotice ? (
          <p className="mt-2 text-[11px] text-[var(--app-ribbon-muted)]">
            {aiNotice}{" "}
            {aiNotice !== "The AI found nothing to change." ? (
              <button type="button" className="underline" onClick={() => setKeysOpen(true)}>
                AI keys
              </button>
            ) : null}
          </p>
        ) : null}
        {aiError ? (
          <p role="alert" className="mt-2 text-[11px] text-[#b3261e]">
            {aiError}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2" data-testid="editor-list">
        {spelling.length > 0 ? (
          <section className="mb-3">
            <h3 className="mb-1 text-[11px] font-semibold uppercase text-[var(--app-ribbon-muted)]">Spelling</h3>
            <ul className="space-y-2">
              {spelling.map((error) => (
                <SpellingCard key={`${error.from}:${error.word}`} error={error} editor={editor} />
              ))}
            </ul>
          </section>
        ) : null}
        {grammar.length > 0 ? (
          <section className="mb-3">
            <h3 className="mb-1 text-[11px] font-semibold uppercase text-[var(--app-ribbon-muted)]">Grammar</h3>
            <ul className="space-y-2">
              {grammar.map((issue) => (
                <GrammarCard key={issue.id} issue={issue} editor={editor} />
              ))}
            </ul>
          </section>
        ) : null}
        {total === 0 ? (
          <p className="text-[12px] text-[var(--app-ribbon-muted)]">
            {spellCheck || checkGrammar
              ? "The page is checked as you type. Ask the AI for a closer read of grammar and clarity."
              : "Checking as you type is off. Switch it on above, or ask the AI."}
          </p>
        ) : null}
      </div>
    </aside>
  )
}

/** The words around a flagged range, with the range itself in bold. */
function Excerpt({ editor, from, to }: { editor: Editor | null; from: number; to: number }) {
  if (!editor || to > editor.state.doc.content.size) {
    return null
  }
  const $from = editor.state.doc.resolve(from)
  const start = $from.start()
  const text = $from.parent.textContent
  const head = text.slice(Math.max(0, from - start - 28), from - start)
  const flagged = editor.state.doc.textBetween(from, to, "\n", "￼")
  const tail = text.slice(to - start, to - start + 28)
  return (
    <span className="mt-0.5 block truncate text-[11px] text-[var(--app-ribbon-muted)]">
      {from - start > 28 ? "…" : ""}
      {head}
      <b className="text-[var(--app-ribbon-text)]">{flagged || "␣"}</b>
      {tail}
      {text.length > to - start + 28 ? "…" : ""}
    </span>
  )
}

function goTo(editor: Editor | null, from: number, to: number) {
  if (editor && to <= editor.state.doc.content.size) {
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()
  }
}

function SpellingCard({ error, editor }: { error: SpellingError; editor: Editor | null }) {
  const suggestions = spellingSuggestions(error.word)
  return (
    <li className="comment-card" data-issue="spelling">
      <button
        type="button"
        className="w-full text-left text-[12px] text-[var(--app-ribbon-text)]"
        onClick={() => goTo(editor, error.from, error.to)}
      >
        Not in the dictionary: <b>{error.word}</b>
        <Excerpt editor={editor} from={error.from} to={error.to} />
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="dialog-btn is-primary"
            onClick={() => editor && replaceSpelling(editor, error.from, error.to, suggestion)}
          >
            {suggestion}
          </button>
        ))}
        {suggestions.length === 0 ? (
          <span className="text-[11px] text-[var(--app-ribbon-muted)]">No suggestions</span>
        ) : null}
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            ignoreSpelling(error.word)
            if (editor) {
              refreshDisplayedMarks(editor)
            }
            useEditorPane.setState((state) => ({ version: state.version + 1 }))
          }}
        >
          Ignore
        </button>
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            addToDictionary(error.word)
            if (editor) {
              refreshDisplayedMarks(editor)
            }
            useEditorPane.setState((state) => ({ version: state.version + 1 }))
          }}
        >
          Add to dictionary
        </button>
      </div>
    </li>
  )
}

/** What a suggestion chip says: the replacement itself, or words for one that is only spacing. */
function chipLabel(issue: FlaggedIssue, suggestion: string) {
  if (suggestion === "") {
    return "Remove"
  }
  if (suggestion === " ") {
    return "One space"
  }
  if (suggestion === `${issue.text} `) {
    return "Add a space"
  }
  return suggestion
}

function GrammarCard({ issue, editor }: { issue: FlaggedIssue; editor: Editor | null }) {
  const ignore = useEditorPane((state) => state.ignore)
  return (
    <li className="comment-card" data-issue={issue.kind}>
      <button
        type="button"
        className="w-full text-left text-[12px] text-[var(--app-ribbon-text)]"
        onClick={() => goTo(editor, issue.from, issue.to)}
      >
        {issue.source === "ai" ? (
          <span className="mr-1 inline-flex align-middle text-[var(--app-ribbon-muted)]" aria-label="From the AI">
            <Sparkles className="size-3" strokeWidth={2} />
          </span>
        ) : null}
        {issue.message}
        <Excerpt editor={editor} from={issue.from} to={issue.to} />
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {issue.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="dialog-btn is-primary"
            onClick={() => editor && applyGrammarSuggestion(editor, issue, suggestion)}
          >
            {chipLabel(issue, suggestion)}
          </button>
        ))}
        <button type="button" className="dialog-btn" onClick={() => ignore(issue)}>
          {issue.source === "ai" ? "Dismiss" : "Ignore"}
        </button>
      </div>
    </li>
  )
}
