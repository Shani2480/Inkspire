import type { Editor } from "@tiptap/core"
import { create } from "zustand"
import { chainWithSelection, syncSelectionMemory } from "@/editor/selection-memory"

/** A symbol as Word's Symbol dialog inserts it: its character and, for a font's own glyph, the font. */
export type SymbolChoice = { char: string; font?: string }

/** Word's recently used symbols on a new install (Insert > Symbol shows 20, the dialog the first 16). */
export const DEFAULT_RECENT: SymbolChoice[] = [..."€£¥©®™±≠≤≥÷×∞µαβπΩ∑☺"].map((char) => ({ char }))

/**
 * Fonts whose glyphs sit on the codes 32–255 rather than on their Unicode meaning (Word's Symbol, Wingdings…).
 * Word saves such a character as `w:sym` / a run in that font; the dialog shows codes, not Unicode subsets.
 */
export const SYMBOL_FONTS = ["Symbol", "Wingdings", "Wingdings 2", "Wingdings 3", "Webdings"]

const RECENT_KEY = "aiword.recentSymbols"
const RECENT_LIMIT = 20

function loadRecent(): SymbolChoice[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null") as unknown
    if (Array.isArray(parsed)) {
      const list = parsed.filter(
        (item): item is SymbolChoice =>
          !!item &&
          typeof item.char === "string" &&
          item.char.length > 0 &&
          item.char.length <= 4 &&
          (item.font === undefined || typeof item.font === "string"),
      )
      if (list.length > 0) {
        return list.slice(0, RECENT_LIMIT)
      }
    }
  } catch {
    // No storage: Word's defaults.
  }
  return DEFAULT_RECENT
}

const same = (a: SymbolChoice, b: SymbolChoice) => a.char === b.char && (a.font ?? "") === (b.font ?? "")

/** The recently used symbols, newest first, kept in this browser. */
export const useRecentSymbols = create<{ recent: SymbolChoice[]; use: (symbol: SymbolChoice) => void }>((set) => ({
  recent: loadRecent(),
  use: (symbol) =>
    set((state) => {
      const recent = [symbol, ...state.recent.filter((item) => !same(item, symbol))].slice(0, RECENT_LIMIT)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
      } catch {
        // Kept for the session.
      }
      return { recent }
    }),
}))

/** Inserts a symbol at the selection (in its font, if it has one) and puts it first in the recently used. */
export function insertSymbol(editor: Editor, symbol: SymbolChoice) {
  const content = symbol.font
    ? { type: "text", text: symbol.char, marks: [{ type: "textStyle", attrs: { fontFamily: symbol.font } }] }
    : symbol.char
  chainWithSelection(editor).insertContent(content).run()
  // The caret is now after the symbol: forget the selection it replaced, so a second Insert does not take it back.
  syncSelectionMemory(editor)
  useRecentSymbols.getState().use(symbol)
}

/**
 * Word's Special Characters tab, in its order. `command` is the shortcut command that types it (its keys are shown
 * as the app binds them); the rest have no key until one is assigned with Shortcut Key….
 */
export const SPECIAL_CHARACTERS: { char: string; name: string; command?: string }[] = [
  { char: "—", name: "Em Dash", command: "em-dash" },
  { char: "–", name: "En Dash", command: "en-dash" },
  { char: "‑", name: "Nonbreaking Hyphen", command: "nonbreaking-hyphen" },
  { char: "­", name: "Optional Hyphen", command: "optional-hyphen" },
  { char: " ", name: "Em Space" },
  { char: " ", name: "En Space" },
  { char: " ", name: "1/4 Em Space" },
  { char: " ", name: "Nonbreaking Space", command: "non-breaking-space" },
  { char: "©", name: "Copyright", command: "copyright" },
  { char: "®", name: "Registered", command: "registered" },
  { char: "™", name: "Trademark", command: "trademark" },
  { char: "§", name: "Section" },
  { char: "¶", name: "Paragraph" },
  { char: "…", name: "Ellipsis", command: "ellipsis" },
  { char: "‘", name: "Single Opening Quote" },
  { char: "’", name: "Single Closing Quote" },
  { char: "“", name: "Double Opening Quote" },
  { char: "”", name: "Double Closing Quote" },
  { char: "​", name: "No-Width Optional Break" },
  { char: "‍", name: "No-Width Non Break" },
]

/** The shortcut command id a symbol gets when a key is assigned to it (Shortcut Key…). */
export function symbolCommandId(symbol: SymbolChoice) {
  return `symbol:${symbol.font ?? ""}|${symbol.char}`
}

/** The symbol a `symbol:` shortcut command inserts, or null for any other id. */
export function symbolOfCommand(id: string): SymbolChoice | null {
  const match = /^symbol:([^|]*)\|(.+)$/su.exec(id)
  if (!match) {
    return null
  }
  return match[1] ? { char: match[2], font: match[1] } : { char: match[2] }
}

/** Word's name of a Unicode character ("COPYRIGHT SIGN" → "Copyright Sign"). */
export function titleCase(name: string) {
  return name.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}
