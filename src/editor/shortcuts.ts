import { askText } from "@/components/text-prompt"
import { requestFormatDialog } from "@/components/format-dialogs"
import { useEditorPane } from "@/editor/grammar"
import { useEditingOptions } from "@/document/editing-options"
import { useReviewStore } from "@/document/review"
import { changeCase, changeIndent, setLineSpacing, stepFontSize } from "@/editor/actions"
import { addComment } from "@/editor/comments"
import {
  applyBullet,
  applyParagraphStyle,
  clearFormatting,
  clearList,
  copyFormatting,
  currentBulletMarker,
  pasteFormatting,
} from "@/editor/home-actions"
import { updateBlocks } from "@/editor/block-format"
import type { Editor } from "@tiptap/core"
import { create } from "zustand"

export type ShortcutDef = {
  id: string
  label: string
  group: "Text" | "Paragraph" | "Insert" | "Tools"
  /** Word's keys, as "Mod+Shift+L" (Mod is Ctrl, or Cmd on a Mac). */
  keys: string[]
  run: (editor: Editor) => boolean
  /** Keys the editor's own keymap also binds to this command; they stop working once it is rebound. */
  native?: string[]
}

const align = (kind: "left" | "center" | "right" | "justify") => (editor: Editor) =>
  editor.chain().focus().setTextAlign(kind).run()

const spacing = (value: string) => (editor: Editor) => {
  setLineSpacing(editor, value)
  return true
}

function toggleBullets(editor: Editor) {
  if (editor.isActive("bulletList")) {
    clearList(editor)
  } else {
    applyBullet(editor, currentBulletMarker())
  }
  return true
}

/** Word's Ctrl+Shift+D: double underline on, or off again where it already is. */
function toggleDoubleUnderline(editor: Editor) {
  const chain = editor.chain().focus()
  return editor.getAttributes("underline").style === "double"
    ? chain.unsetUnderline().run()
    : chain.setMark("underline", { style: "double" }).run()
}

/** A character format kept on the text style (small caps, hidden), on or off as Word's Ctrl+Shift+K and H. */
const toggleTextStyle = (name: string, on: string) => (editor: Editor) => {
  const next = editor.getAttributes("textStyle")[name] === on ? null : on
  return editor
    .chain()
    .focus()
    .setMark("textStyle", { [name]: next })
    .removeEmptyTextStyle()
    .run()
}

/** Word moves a hanging indent a default tab stop (1.27 cm) at a time. */
const HANGING_STEP = 1.27

/** Ctrl+T makes the hanging indent a step deeper, Ctrl+Shift+T a step shallower, down to none. */
const stepHanging = (direction: 1 | -1) => (editor: Editor) => {
  const { $from, from, to } = editor.state.selection
  // The first paragraph chosen (with the whole document selected, the selection starts outside any).
  let first = $from.parent.isTextblock ? $from.parent : null
  editor.state.doc.nodesBetween(from, to, (node) => {
    first ??= node.isTextblock ? node : null
    return !first
  })
  const [kind, raw] = String(first?.attrs.specialIndent || "").split(":")
  const current = kind === "hanging" ? Number(raw) || 0 : 0
  const next = Math.round((current + direction * HANGING_STEP) * 100) / 100
  updateBlocks(editor, { specialIndent: next > 0 ? `hanging:${next}` : "" })
  editor.commands.focus()
  return true
}

/** The paragraph formatting Ctrl+Q takes off, back to what the paragraph's style gives it. */
const PARAGRAPH_FORMAT = [
  "textAlign",
  "lineHeight",
  "lineRule",
  "spaceBefore",
  "spaceAfter",
  "indent",
  "indentRight",
  "specialIndent",
  "mirrorIndents",
  "contextualSpacing",
  "shading",
  "shadingPattern",
  "border",
  "borderPen",
  "borderSpace",
  "borderShadow",
  "borderFrame",
  "keepNext",
  "keepLines",
  "pageBreakBefore",
  "widowControl",
]

function resetParagraph(editor: Editor) {
  const attrs = editor.schema.nodes.paragraph?.spec.attrs ?? {}
  const defaults = Object.fromEntries(
    PARAGRAPH_FORMAT.filter((key) => key in attrs).map((key) => [key, attrs[key]?.default ?? null]),
  )
  updateBlocks(editor, defaults)
  editor.commands.focus()
  return true
}

/** Word's Shift+F3: Sentence case, then lowercase, then UPPERCASE, and round again. */
function cycleCase(editor: Editor) {
  const { from, to, empty } = editor.state.selection
  if (empty) {
    return false
  }
  const text = editor.state.doc.textBetween(from, to, "\n")
  const upper = text === text.toUpperCase() && text !== text.toLowerCase()
  const lower = text === text.toLowerCase() && text !== text.toUpperCase()
  changeCase(editor, upper ? "sentence" : lower ? "upper" : "lower")
  return true
}

function insertLink(editor: Editor) {
  void askText({ title: "Insert Hyperlink", label: "Address:", value: "https://" }).then((href) => {
    if (href) {
      editor.chain().focus().setLink({ href }).run()
    }
  })
  return true
}

function newComment(editor: Editor) {
  void askText({ title: "New Comment", label: "Comment", multiline: true, ok: "Post" }).then((text) => {
    if (text?.trim()) {
      addComment(editor, text)
    }
  })
  return true
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "bold",
    label: "Bold",
    group: "Text",
    keys: ["Mod+B"],
    native: ["Mod+B"],
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italic",
    group: "Text",
    keys: ["Mod+I"],
    native: ["Mod+I"],
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    id: "underline",
    label: "Underline",
    group: "Text",
    keys: ["Mod+U"],
    native: ["Mod+U"],
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    id: "subscript",
    label: "Subscript",
    group: "Text",
    keys: ["Mod+="],
    run: (e) => e.chain().focus().toggleMark("subscript").run(),
  },
  {
    id: "superscript",
    label: "Superscript",
    group: "Text",
    keys: ["Mod+Shift+="],
    run: (e) => e.chain().focus().toggleMark("superscript").run(),
  },
  {
    id: "grow-font",
    label: "Increase Font Size",
    group: "Text",
    keys: ["Mod+Shift+.", "Mod+]"],
    run: (e) => (stepFontSize(e, 1), true),
  },
  {
    id: "shrink-font",
    label: "Decrease Font Size",
    group: "Text",
    keys: ["Mod+Shift+,", "Mod+["],
    run: (e) => (stepFontSize(e, -1), true),
  },
  {
    id: "all-caps",
    label: "All Caps",
    group: "Text",
    keys: ["Mod+Shift+A"],
    run: (e) => (changeCase(e, "upper"), true),
  },
  { id: "change-case", label: "Change Case", group: "Text", keys: ["Shift+F3"], run: cycleCase },
  {
    id: "clear-formatting",
    label: "Clear Formatting",
    group: "Text",
    keys: ["Mod+Space"],
    run: (e) => (clearFormatting(e), true),
  },
  {
    id: "non-breaking-space",
    label: "Non-breaking Space",
    group: "Text",
    keys: ["Mod+Shift+Space"],
    run: (e) => e.chain().focus().insertContent(" ").run(),
  },
  {
    id: "format-painter",
    label: "Copy Formatting",
    group: "Text",
    keys: ["Mod+Shift+C"],
    run: copyFormatting,
  },
  { id: "paste-formatting", label: "Paste Formatting", group: "Text", keys: ["Mod+Shift+V"], run: pasteFormatting },
  {
    id: "double-underline",
    label: "Double Underline",
    group: "Text",
    keys: ["Mod+Shift+D"],
    run: toggleDoubleUnderline,
  },
  {
    id: "small-caps",
    label: "Small Caps",
    group: "Text",
    keys: ["Mod+Shift+K"],
    run: toggleTextStyle("fontVariant", "small-caps"),
  },
  { id: "hidden-text", label: "Hidden", group: "Text", keys: ["Mod+Shift+H"], run: toggleTextStyle("hidden", "1") },
  { id: "font-dialog", label: "Font…", group: "Text", keys: ["Mod+D"], run: () => (requestFormatDialog("font"), true) },
  { id: "align-left", label: "Align Left", group: "Paragraph", keys: ["Mod+L"], run: align("left") },
  { id: "align-center", label: "Center", group: "Paragraph", keys: ["Mod+E"], run: align("center") },
  { id: "align-right", label: "Align Right", group: "Paragraph", keys: ["Mod+R"], run: align("right") },
  { id: "justify", label: "Justify", group: "Paragraph", keys: ["Mod+J"], run: align("justify") },
  { id: "bullets", label: "Bullets", group: "Paragraph", keys: ["Mod+Shift+L"], run: toggleBullets },
  { id: "indent", label: "Indent", group: "Paragraph", keys: ["Mod+M"], run: (e) => (changeIndent(e, 1), true) },
  {
    id: "outdent",
    label: "Decrease Indent",
    group: "Paragraph",
    keys: ["Mod+Shift+M"],
    run: (e) => (changeIndent(e, -1), true),
  },
  { id: "hanging-indent", label: "Hanging Indent", group: "Paragraph", keys: ["Mod+T"], run: stepHanging(1) },
  {
    id: "reduce-hanging-indent",
    label: "Reduce Hanging Indent",
    group: "Paragraph",
    keys: ["Mod+Shift+T"],
    run: stepHanging(-1),
  },
  {
    id: "reset-paragraph",
    label: "Reset Paragraph Formatting",
    group: "Paragraph",
    keys: ["Mod+Q"],
    run: resetParagraph,
  },
  { id: "single-spacing", label: "Single Line Spacing", group: "Paragraph", keys: ["Mod+1"], run: spacing("1") },
  { id: "double-spacing", label: "Double Line Spacing", group: "Paragraph", keys: ["Mod+2"], run: spacing("2") },
  { id: "one-half-spacing", label: "1.5 Line Spacing", group: "Paragraph", keys: ["Mod+5"], run: spacing("1.5") },
  {
    id: "style-normal",
    label: "Normal Style",
    group: "Paragraph",
    keys: ["Mod+Shift+N"],
    run: (e) => (applyParagraphStyle(e, "normal"), true),
  },
  {
    id: "heading-1",
    label: "Heading 1",
    group: "Paragraph",
    keys: ["Mod+Alt+1"],
    native: ["Mod+Alt+1"],
    run: (e) => (applyParagraphStyle(e, "heading-1"), true),
  },
  {
    id: "heading-2",
    label: "Heading 2",
    group: "Paragraph",
    keys: ["Mod+Alt+2"],
    native: ["Mod+Alt+2"],
    run: (e) => (applyParagraphStyle(e, "heading-2"), true),
  },
  {
    id: "heading-3",
    label: "Heading 3",
    group: "Paragraph",
    keys: ["Mod+Alt+3"],
    native: ["Mod+Alt+3"],
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  { id: "link", label: "Insert Hyperlink", group: "Insert", keys: ["Mod+K"], run: insertLink },
  { id: "comment", label: "New Comment", group: "Insert", keys: ["Mod+Alt+M"], run: newComment },
  {
    id: "track-changes",
    label: "Track Changes",
    group: "Tools",
    keys: ["Mod+Shift+E"],
    run: () => (useReviewStore.getState().setTracking(!useReviewStore.getState().tracking), true),
  },
  {
    id: "spelling",
    label: "Spelling and Grammar",
    group: "Tools",
    keys: ["F7"],
    run: () => (useEditorPane.getState().openPane(), true),
  },
  {
    id: "field-codes",
    label: "Toggle Field Codes",
    group: "Tools",
    keys: ["Alt+F9"],
    run: () => (useEditingOptions.getState().set({ fieldCodes: !useEditingOptions.getState().fieldCodes }), true),
  },
]

// --- keys --------------------------------------------------------------------------------------------------------

const CODE_NAMES: Record<string, string> = {
  Period: ".",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Slash: "/",
  Backslash: "\\",
  Backquote: "`",
  Space: "Space",
}

/** The key of an event as the registry writes it: "Mod+Shift+L", "F7", "Mod+Alt+1". Null for a bare modifier. */
export function comboFromEvent(
  event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) {
  let key = CODE_NAMES[event.code]
  if (!key) {
    if (/^Key[A-Z]$/.test(event.code)) {
      key = event.code.slice(3)
    } else if (/^Digit\d$/.test(event.code)) {
      key = event.code.slice(5)
    } else if (/^Numpad\d$/.test(event.code)) {
      key = event.code.slice(6)
    } else if (/^(F\d{1,2}|Arrow\w+|Enter|Tab|Home|End|Page\w+|Delete|Backspace|Insert)$/.test(event.code)) {
      key = event.code
    } else if (/^(Control|Shift|Alt|Meta)/.test(event.key) || !event.key) {
      return null
    } else {
      key = event.key.length === 1 ? event.key.toUpperCase() : event.key
    }
  }
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) {
    parts.push("Mod")
  }
  if (event.altKey) {
    parts.push("Alt")
  }
  if (event.shiftKey) {
    parts.push("Shift")
  }
  parts.push(key)
  return parts.join("+")
}

// --- the user's bindings -----------------------------------------------------------------------------------------

const STORAGE_KEY = "aiword.shortcuts"

type ShortcutStore = {
  /** Command id to its keys; an empty list unbinds it. Commands missing here keep Word's keys. */
  custom: Record<string, string[]>
  bind: (id: string, keys: string[]) => void
  reset: (id?: string) => void
}

function loadCustom(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>
    const custom: Record<string, string[]> = {}
    for (const [id, keys] of Object.entries(parsed)) {
      if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) {
        custom[id] = keys as string[]
      }
    }
    return custom
  } catch {
    return {}
  }
}

function persist(custom: Record<string, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
  } catch {
    // The bindings stay for this session.
  }
}

export const useShortcuts = create<ShortcutStore>((set) => ({
  custom: loadCustom(),
  bind: (id, keys) =>
    set((state) => {
      // A key belongs to one command: it is taken from whichever other command had it.
      const custom = { ...state.custom }
      for (const other of SHORTCUTS) {
        if (other.id !== id && keysOf(other, custom).some((key) => keys.includes(key))) {
          custom[other.id] = keysOf(other, custom).filter((key) => !keys.includes(key))
        }
      }
      custom[id] = keys
      persist(custom)
      return { custom }
    }),
  reset: (id) =>
    set((state) => {
      const custom = id ? { ...state.custom } : {}
      if (id) {
        delete custom[id]
      }
      persist(custom)
      return { custom }
    }),
}))

export function keysOf(def: ShortcutDef, custom: Record<string, string[]> = useShortcuts.getState().custom) {
  return custom[def.id] ?? def.keys
}

/** The command a key runs, or null; and whether it is a native key of a command that has been rebound. */
export function shortcutFor(combo: string, custom: Record<string, string[]> = useShortcuts.getState().custom) {
  const bound = SHORTCUTS.find((def) => keysOf(def, custom).includes(combo))
  if (bound) {
    return { def: bound, blocked: false }
  }
  const orphan = SHORTCUTS.find((def) => def.native?.includes(combo))
  return orphan ? { def: orphan, blocked: true } : null
}
