import { Extension } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import type { ResolvedPos } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { create } from "zustand"
import { useEditingOptions } from "@/document/editing-options"
import {
  AUTOCORRECT_DEFAULTS,
  BUILT_IN_REPLACEMENTS,
  correctWord,
  listTrigger,
  smartQuote,
  symbolReplacement,
  WORD_END,
  type AutoCorrectOptions,
  type Correction,
} from "@/editor/autocorrect-rules"

const KEY = "aiword.autocorrect"

type Saved = {
  options: AutoCorrectOptions
  /** Entries the user added or changed in the Replace list. */
  added: Record<string, string>
  /** Built-in entries the user deleted. */
  removed: string[]
}

type AutoCorrectState = Saved & {
  /** The Replace list as it applies: the built-in entries, less the removed, plus the added. */
  entries: ReadonlyMap<string, string>
  set: (patch: Partial<AutoCorrectOptions>) => void
  addEntry: (replace: string, withText: string) => void
  deleteEntry: (replace: string) => void
}

function entriesOf(saved: Pick<Saved, "added" | "removed">) {
  const entries = new Map(BUILT_IN_REPLACEMENTS)
  for (const key of saved.removed) {
    entries.delete(key)
  }
  for (const [key, value] of Object.entries(saved.added)) {
    entries.set(key, value)
  }
  return entries
}

function load(): Saved {
  const fallback: Saved = { options: AUTOCORRECT_DEFAULTS, added: {}, removed: [] }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<Saved>
    return {
      options: { ...AUTOCORRECT_DEFAULTS, ...parsed.options },
      added: parsed.added && typeof parsed.added === "object" ? parsed.added : {},
      removed: Array.isArray(parsed.removed) ? parsed.removed.filter((key) => typeof key === "string") : [],
    }
  } catch {
    return fallback
  }
}

function store(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Without storage the choices last for the session.
  }
}

/** AutoCorrect's options and Replace list (File > Options > Proofing > AutoCorrect Options). Kept in this browser. */
export const useAutoCorrect = create<AutoCorrectState>((set, get) => {
  const saved = load()
  const save = (next: Saved) => {
    store(next)
    set({ ...next, entries: entriesOf(next) })
  }
  return {
    ...saved,
    entries: entriesOf(saved),
    set: (patch) => {
      const { options, added, removed } = get()
      save({ options: { ...options, ...patch }, added, removed })
    },
    addEntry: (replace, withText) => {
      const { options, added, removed } = get()
      const key = replace.trim()
      if (!key) {
        return
      }
      save({ options, added: { ...added, [key]: withText }, removed: removed.filter((item) => item !== key) })
    },
    deleteEntry: (replace) => {
      const { options, added, removed } = get()
      const nextAdded = { ...added }
      delete nextAdded[replace]
      const builtIn = BUILT_IN_REPLACEMENTS.some(([key]) => key === replace)
      save({ options, added: nextAdded, removed: builtIn ? [...new Set([...removed, replace])] : removed })
    },
  }
})

const autoCorrectKey = new PluginKey("autocorrect")

function inTable($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === "tableCell" || name === "tableHeader") {
      return true
    }
  }
  return false
}

function inList($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "listItem") {
      return true
    }
  }
  return false
}

/** Where AutoCorrect stays out: code, and text that is not a paragraph's or heading's own (fields, equations). */
function correctable($pos: ResolvedPos) {
  const parent = $pos.parent
  return parent.isTextblock && !parent.type.spec.code && !$pos.marks().some((mark) => mark.type.spec.code)
}

/** Applies corrections (offsets into the paragraph's text) as one undo step of their own. */
function applyCorrections(view: EditorView, start: number, corrections: Correction[]) {
  if (corrections.length === 0) {
    return false
  }
  const tr = closeHistory(view.state.tr)
  const superscript = view.state.schema.marks.superscript
  for (const correction of [...corrections].sort((a, b) => b.from - a.from)) {
    const from = start + correction.from
    const to = start + correction.to
    const marks = view.state.doc.resolve(from + (to > from ? 1 : 0)).marks()
    tr.replaceWith(from, to, view.state.schema.text(correction.text, marks))
    if (correction.superscript && superscript) {
      tr.addMark(from, from + correction.text.length, superscript.create())
    }
  }
  tr.setMeta(autoCorrectKey, "corrected")
  view.dispatch(tr)
  return true
}

/** Turns the paragraph into a bulleted or numbered list item, as AutoFormat As You Type does after "* " or "1. ". */
function startList(editor: Editor, start: number, end: number, trigger: NonNullable<ReturnType<typeof listTrigger>>) {
  const chain = editor.chain().command(({ tr }) => {
    closeHistory(tr)
    tr.delete(start, end)
    return true
  })
  if (trigger.kind === "bullet") {
    chain.toggleBulletList()
  } else {
    chain.toggleOrderedList()
    if (trigger.start !== 1 || trigger.marker) {
      chain.updateAttributes("orderedList", { start: trigger.start, marker: trigger.marker })
    }
  }
  return chain.run()
}

/**
 * Word's AutoCorrect and AutoFormat As You Type in the document: smart quotes, the Replace list, capitals, ordinals,
 * dashes and automatic lists (the rules are in `autocorrect-rules.ts`). Each correction is its own undo step, made
 * right after the character that set it off, so Ctrl+Z brings back exactly what was typed.
 */
export const AutoCorrect = Extension.create({
  name: "autocorrect",

  addProseMirrorPlugins() {
    const editor = this.editor
    // After a correction, the next typing starts an undo step of its own, so Undo takes back only the correction.
    let closeNext = false
    return [
      new Plugin({
        key: autoCorrectKey,
        props: {
          handleTextInput(view, from, to, text) {
            // Typing over a selection and overtype are the editor's own (`editing-behavior.ts`); they stay as typed.
            if (!editor.isEditable || view.composing || text.length !== 1 || from !== to) {
              return false
            }
            if (useEditingOptions.getState().overtype) {
              return false
            }
            const { state } = view
            const $from = state.doc.resolve(from)
            if (!correctable($from)) {
              return false
            }
            const { options, entries } = useAutoCorrect.getState()
            const start = from - $from.parentOffset
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼")

            const trigger =
              text === " " && !inList($from) && $from.parent.type.name === "paragraph" && to === from
                ? listTrigger(before, options)
                : null
            const corrections: Correction[] = []
            if (!trigger) {
              if (WORD_END.test(text)) {
                corrections.push(...correctWord(before, options, entries, { inTable: inTable($from) }))
              }
              if (options.replaceText) {
                const symbol = symbolReplacement(before + text, entries)
                if (symbol) {
                  corrections.push(symbol)
                }
              }
              if (
                options.smartQuotes &&
                (text === '"' || text === "'") &&
                !corrections.some((c) => c.to > before.length)
              ) {
                corrections.push({ from: before.length, to: before.length + 1, text: smartQuote(before, text) })
              }
            }
            if (!trigger && corrections.length === 0 && !closeNext) {
              return false
            }
            // The character goes in as typed first, then the correction as a step of its own.
            const typed = state.tr.insertText(text, from, to)
            view.dispatch(closeNext ? closeHistory(typed) : typed)
            closeNext = false
            if (trigger) {
              closeNext = startList(editor, start, start + before.length + 1, trigger)
              return true
            }
            closeNext = applyCorrections(view, start, corrections)
            return true
          },
          handleKeyDown(view, event) {
            // Enter and Tab end a word too: correct it, then let the key do its own work.
            if ((event.key !== "Enter" && event.key !== "Tab") || event.ctrlKey || event.metaKey || event.altKey) {
              return false
            }
            const { state } = view
            const { $from, empty } = state.selection
            if (!empty || !editor.isEditable || !correctable($from)) {
              return false
            }
            const { options, entries } = useAutoCorrect.getState()
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼")
            applyCorrections(
              view,
              $from.pos - $from.parentOffset,
              correctWord(before, options, entries, { inTable: inTable($from) }),
            )
            closeNext = false
            return false
          },
        },
      }),
    ]
  },
})
