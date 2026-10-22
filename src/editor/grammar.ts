import { cancelAiRequest } from "@/ai/generate"
import { requestGrammar, type GrammarIssue as AiIssue } from "@/ai/proofing"
import { useDocumentStore } from "@/document/store"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import { findGrammarIssues, type GrammarKind } from "@/editor/grammar-rules"
import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { create } from "zustand"

/**
 * Grammar on the page and in the Editor pane. Rules (`grammar-rules.ts`) run as you type, like spelling; the AI pass
 * runs when asked, or when typing pauses if that is switched on. Both are underlined on the page, and listed in the
 * pane with their suggestions.
 */

const KEY = "aiword.editor-pane"

export type FlaggedIssue = {
  id: string
  from: number
  to: number
  text: string
  suggestions: string[]
  message: string
  kind: GrammarKind
  source: "rule" | "ai"
}

type EditorPaneState = {
  open: boolean
  /** The rules run as you type. */
  checkGrammar: boolean
  /** The AI pass runs by itself when typing pauses. */
  aiAuto: boolean
  aiIssues: AiIssue[]
  aiRunning: boolean
  aiNotice: string
  aiError: string
  aiRequestId: string
  /** What the last AI pass read, so an unchanged document is not sent again. */
  aiCheckedText: string
  /** Rule issues put aside for this session, as `kind:text`. */
  ignored: string[]
  /** Bumped whenever what is flagged changes for a reason other than an edit. */
  version: number
  openPane: () => void
  closePane: () => void
  setCheckGrammar: (checkGrammar: boolean) => void
  setAiAuto: (aiAuto: boolean) => void
  setAiIssues: (issues: AiIssue[], checkedText: string) => void
  setAiRunning: (running: boolean) => void
  setAiNotice: (notice: string) => void
  setAiError: (error: string) => void
  setAiRequestId: (requestId: string) => void
  ignore: (issue: FlaggedIssue) => void
  clearIgnored: () => void
  dismissAi: (issue: FlaggedIssue) => void
}

function loadChoices() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, unknown>
    return {
      checkGrammar: typeof parsed.checkGrammar === "boolean" ? parsed.checkGrammar : true,
      aiAuto: typeof parsed.aiAuto === "boolean" ? parsed.aiAuto : false,
    }
  } catch {
    return { checkGrammar: true, aiAuto: false }
  }
}

function saveChoices(state: Pick<EditorPaneState, "checkGrammar" | "aiAuto">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ checkGrammar: state.checkGrammar, aiAuto: state.aiAuto }))
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

export const ignoreKey = (issue: Pick<FlaggedIssue, "kind" | "text">) => `${issue.kind}:${issue.text}`

export const useEditorPane = create<EditorPaneState>((set, get) => ({
  open: false,
  ...loadChoices(),
  aiIssues: [],
  aiRunning: false,
  aiNotice: "",
  aiError: "",
  aiRequestId: "",
  aiCheckedText: "",
  ignored: [],
  version: 0,
  openPane: () => set({ open: true }),
  closePane: () => {
    stopAiCheck()
    set({ open: false })
  },
  setCheckGrammar: (checkGrammar) => {
    set((state) => ({ checkGrammar, version: state.version + 1 }))
    saveChoices(get())
  },
  setAiAuto: (aiAuto) => {
    set({ aiAuto })
    saveChoices(get())
  },
  setAiIssues: (aiIssues, aiCheckedText) => set((state) => ({ aiIssues, aiCheckedText, version: state.version + 1 })),
  setAiRunning: (aiRunning) => set({ aiRunning }),
  setAiNotice: (aiNotice) => set({ aiNotice }),
  setAiError: (aiError) => set({ aiError }),
  setAiRequestId: (aiRequestId) => set({ aiRequestId }),
  ignore: (issue) =>
    set((state) =>
      issue.source === "ai"
        ? { aiIssues: state.aiIssues.filter((item) => item.text !== issue.text), version: state.version + 1 }
        : { ignored: [...state.ignored, ignoreKey(issue)], version: state.version + 1 },
    ),
  clearIgnored: () => set((state) => ({ ignored: [], version: state.version + 1 })),
  dismissAi: (issue) =>
    set((state) => ({
      aiIssues: state.aiIssues.filter((item) => item.text !== issue.text),
      version: state.version + 1,
    })),
}))

// --- finding the issues ------------------------------------------------------------------------------------------

/** A paragraph's text with, for each character, the document position it sits at. An atom counts as one character. */
function blockText(block: ProseMirrorNode, pos: number) {
  let text = ""
  const map: number[] = []
  block.forEach((child, offset) => {
    const start = pos + 1 + offset
    if (child.isText && child.text) {
      for (let index = 0; index < child.text.length; index += 1) {
        map.push(start + index)
      }
      text += child.text
    } else {
      map.push(start)
      text += child.type.name === "hardBreak" ? "\n" : "￼"
    }
  })
  map.push(pos + 1 + block.content.size)
  return { text, map }
}

/** A run's rule issues, kept while the run is the same node and nothing that decides them changed. */
const checkedBlocks = new WeakMap<ProseMirrorNode, { key: string; issues: FlaggedIssue[] }>()
const listed = new WeakMap<ProseMirrorNode, { key: string; issues: FlaggedIssue[] }>()

function settingsKey() {
  const state = useEditorPane.getState()
  return `${useDocumentStore.getState().pageSetup.language}|${state.version}|${state.checkGrammar}`
}

function issuesIn(doc: ProseMirrorNode): FlaggedIssue[] {
  const key = settingsKey()
  const kept = listed.get(doc)
  if (kept && kept.key === key) {
    return kept.issues
  }
  const state = useEditorPane.getState()
  const language = useDocumentStore.getState().pageSetup.language
  const ignored = new Set(state.ignored)
  const issues: FlaggedIssue[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") {
      return false
    }
    if (!node.isTextblock) {
      return
    }
    const cached = checkedBlocks.get(node)
    let found: FlaggedIssue[]
    if (cached && cached.key === key) {
      found = cached.issues.map((issue) => ({ ...issue, from: issue.from + pos, to: issue.to + pos }))
    } else {
      const { text, map } = blockText(node, pos)
      const own: FlaggedIssue[] = []
      if (state.checkGrammar) {
        for (const issue of findGrammarIssues(text, language)) {
          if (ignored.has(ignoreKey(issue))) {
            continue
          }
          own.push({
            id: `rule:${issue.kind}:${map[issue.from]}`,
            from: map[issue.from] - pos,
            to: map[issue.to] - pos,
            text: issue.text,
            suggestions: issue.suggestions,
            message: issue.message,
            kind: issue.kind,
            source: "rule",
          })
        }
      }
      for (const issue of state.aiIssues) {
        let at = text.indexOf(issue.text)
        while (at >= 0) {
          own.push({
            id: `ai:${map[at]}`,
            from: map[at] - pos,
            to: map[at + issue.text.length] - pos,
            text: issue.text,
            suggestions: [issue.suggestion],
            message: issue.reason || "Suggested change",
            kind: "ai",
            source: "ai",
          })
          at = text.indexOf(issue.text, at + issue.text.length)
        }
      }
      checkedBlocks.set(node, { key, issues: own })
      found = own.map((issue) => ({ ...issue, from: issue.from + pos, to: issue.to + pos }))
    }
    issues.push(...found)
  })
  issues.sort((left, right) => left.from - right.from || left.to - right.to)
  listed.set(doc, { key, issues })
  return issues
}

/** Everything flagged on the page, in document order. */
export function listGrammarIssues(editor: Editor): FlaggedIssue[] {
  return editor.isDestroyed ? [] : issuesIn(editor.state.doc)
}

/** Puts a suggestion in place of the flagged text. False when the text is no longer there. */
export function applyGrammarSuggestion(editor: Editor, issue: FlaggedIssue, suggestion: string) {
  const { state } = editor
  if (issue.from < 0 || issue.to > state.doc.content.size || issue.from >= issue.to) {
    return false
  }
  if (state.doc.textBetween(issue.from, issue.to, "\n", "￼") !== issue.text) {
    return false
  }
  const marks = state.doc.resolve(Math.min(issue.from + 1, issue.to)).marks()
  const tr = suggestion
    ? state.tr.replaceWith(issue.from, issue.to, state.schema.text(suggestion, marks))
    : state.tr.delete(issue.from, issue.to)
  editor.view.dispatch(tr)
  if (issue.source === "ai") {
    useEditorPane.getState().dismissAi(issue)
  }
  editor.commands.focus()
  return true
}

// --- the AI pass ---------------------------------------------------------------------------------------------------

export function documentTextForAi(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n")
}

/** Sends the document to the AI for grammar and clarity, and keeps what comes back beside the rule issues. */
export async function runAiCheck(editor: Editor) {
  const pane = useEditorPane.getState()
  if (pane.aiRunning || editor.isDestroyed) {
    return
  }
  const requestId = crypto.randomUUID()
  pane.setAiRequestId(requestId)
  pane.setAiRunning(true)
  pane.setAiNotice("")
  pane.setAiError("")
  const text = documentTextForAi(editor)
  try {
    const result = await requestGrammar(text, requestId)
    if (useEditorPane.getState().aiRequestId !== requestId) {
      return
    }
    if (result.blocked) {
      useEditorPane.getState().setAiNotice(result.blocked)
      return
    }
    useEditorPane.getState().setAiIssues(result.issues, text)
    if (result.issues.length === 0) {
      useEditorPane.getState().setAiNotice("The AI found nothing to change.")
    }
  } catch (failure) {
    if (useEditorPane.getState().aiRequestId === requestId) {
      useEditorPane.getState().setAiError(failure instanceof Error ? failure.message : String(failure))
    }
  } finally {
    if (useEditorPane.getState().aiRequestId === requestId) {
      useEditorPane.getState().setAiRequestId("")
      useEditorPane.getState().setAiRunning(false)
    }
    refreshDisplayedMarks(editor)
  }
}

export function stopAiCheck() {
  const pane = useEditorPane.getState()
  if (pane.aiRequestId) {
    cancelAiRequest(pane.aiRequestId)
  }
  pane.setAiRequestId("")
  pane.setAiRunning(false)
}

// --- on the page ---------------------------------------------------------------------------------------------------

const grammarKey = new PluginKey("grammar")

function grammarDecorations(doc: ProseMirrorNode) {
  const state = useEditorPane.getState()
  if (!state.checkGrammar && state.aiIssues.length === 0) {
    return null
  }
  const issues = issuesIn(doc)
  if (issues.length === 0) {
    return null
  }
  return DecorationSet.create(
    doc,
    issues.map((issue) =>
      Decoration.inline(issue.from, issue.to, {
        class: `grammar-error is-${issue.source}`,
        "data-grammar-from": String(issue.from),
        "data-grammar-to": String(issue.to),
        title: issue.message,
      }),
    ),
  )
}

export const Grammar = Extension.create({
  name: "grammar",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: grammarKey,
        // Ignoring, the switches and a finished AI pass change what is underlined without an edit: redraw then.
        view: () => ({
          destroy: useEditorPane.subscribe((state, previous) => {
            if (state.version !== previous.version) {
              refreshDisplayedMarks(editor)
            }
          }),
        }),
        props: {
          decorations(state) {
            return grammarDecorations(state.doc)
          },
        },
      }),
    ]
  },
})
