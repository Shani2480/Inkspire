import { useAutoCorrectDialog } from "@/components/autocorrect-dialog"
import { RESERVED, showCombo } from "@/components/backstage/shortcut-settings"
import { FONT_FAMILIES } from "@/components/ribbon/options"
import { DialogFrame, Label } from "@/components/word-dialog"
import { comboFromEvent, keysForCommand, shortcutFor, useShortcuts } from "@/editor/shortcuts"
import {
  insertSymbol,
  SPECIAL_CHARACTERS,
  SYMBOL_FONTS,
  symbolCommandId,
  titleCase,
  useRecentSymbols,
  type SymbolChoice,
} from "@/editor/symbols"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

type Names = { blocks: [string, number, number][]; names: Record<string, string> }
type CodeFrom = "unicode" | "decimal" | "hex"

/** Spaces, hyphens and breaks that draw nothing: their row shows only the name, as in Word. */
const INVISIBLE = /[\s\u00AD\u200B\u200D]/
const COLUMNS = 16
const CELL = 30
const ROWS = 4
let namesCache: Names | null = null

/** The Unicode blocks and names (`tools/gen-symbol-names.py`), loaded when the dialog first opens. */
function useNames() {
  const [names, setNames] = useState<Names | null>(namesCache)
  useEffect(() => {
    if (namesCache) {
      return
    }
    let live = true
    void import("@/components/symbol-names.json").then((module) => {
      namesCache = module.default as unknown as Names
      if (live) {
        setNames(namesCache)
      }
    })
    return () => {
      live = false
    }
  }, [])
  return names
}

const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, "0")

/** The code Word's Character code box shows for a character, in the chosen form. */
export function codeText(code: number, from: CodeFrom | "symbol") {
  if (from === "decimal" || from === "symbol") {
    return String(code)
  }
  return from === "hex" ? code.toString(16).toUpperCase().padStart(2, "0") : hex(code)
}

/** The character a typed code names, or null: hex for Unicode and ASCII (hex), decimal otherwise. */
export function parseCode(text: string, from: CodeFrom | "symbol") {
  const value = from === "decimal" || from === "symbol" ? Number(text) : Number.parseInt(text, 16)
  if (!/^[0-9a-f]+$/i.test(text.trim()) || !Number.isInteger(value)) {
    return null
  }
  return value
}

/**
 * Word's Symbol dialog (Insert > Symbol > More Symbols…). Symbols: a font, a subset that follows the grid as it
 * scrolls, recently used symbols, the Unicode name, the character code in Unicode or ASCII, AutoCorrect… and Shortcut
 * Key…; Special Characters: Word's list with the keys the app binds. Insert keeps the dialog open (Cancel becomes
 * Close), as in Word; a double click inserts too. Fonts are the app's list plus Word's symbol fonts, whose glyphs sit
 * on codes 32–255 (they show as the fallback font where they are not installed).
 */
export function SymbolDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [tab, setTab] = useState("symbols")
  const [inserted, setInserted] = useState(false)
  const [shortcutFor_, setShortcutFor] = useState<{ symbol: SymbolChoice; name: string } | null>(null)
  const names = useNames()
  const recent = useRecentSymbols((state) => state.recent)
  const [font, setFont] = useState("")
  const [from, setFrom] = useState<CodeFrom>("unicode")
  const symbolFont = SYMBOL_FONTS.includes(font)
  const codeFrom = symbolFont ? "symbol" : from
  const chars = useMemo(() => {
    if (symbolFont) {
      return Array.from({ length: 224 }, (_, index) => 32 + index)
    }
    const all = names ? Object.keys(names.names).map(Number) : []
    return from === "unicode" ? all : all.filter((code) => code <= 255)
  }, [names, symbolFont, from])
  const [selected, setSelected] = useState(() => recent[0]?.char.codePointAt(0) ?? 0xa9)
  const [code, setCode] = useState("")
  const [special, setSpecial] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollSource = useRef<"subset" | null>(null)
  const [subset, setSubset] = useState("")
  const custom = useShortcuts((state) => state.custom)

  const index = Math.max(0, chars.indexOf(selected))
  const current = chars[index] ?? selected
  const choice: SymbolChoice = font
    ? { char: String.fromCodePoint(current), font }
    : { char: String.fromCodePoint(current) }
  const blockOf = (value: number) => names?.blocks.find(([, start, end]) => value >= start && value <= end)?.[0] ?? ""

  useEffect(() => {
    setCode(codeText(current, codeFrom))
  }, [current, codeFrom])

  // Keep the selected character in view; the Subset box names the block it is in.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || tab !== "symbols") {
      return
    }
    const row = Math.floor(index / COLUMNS)
    if (row * CELL < grid.scrollTop) {
      grid.scrollTop = row * CELL
    } else if ((row + 1) * CELL > grid.scrollTop + grid.clientHeight) {
      grid.scrollTop = (row + 1) * CELL - grid.clientHeight
    }
    setSubset(blockOf(current))
  }, [index, tab, chars])

  const insert = (symbol: SymbolChoice) => {
    insertSymbol(editor, symbol)
    setInserted(true)
    gridRef.current?.focus()
  }

  const keysOfSymbol = (symbol: SymbolChoice) => {
    const own = keysForCommand(symbolCommandId(symbol), custom)
    const named = symbol.font ? undefined : SPECIAL_CHARACTERS.find((item) => item.char === symbol.char)?.command
    return [...(named ? keysForCommand(named, custom) : []), ...own]
  }
  const shownKeys = (symbol: SymbolChoice) => keysOfSymbol(symbol).map(showCombo).join(", ")

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLUMNS,
      ArrowDown: COLUMNS,
      PageUp: -COLUMNS * ROWS,
      PageDown: COLUMNS * ROWS,
    }
    if (event.key in step) {
      event.preventDefault()
      setSelected(chars[Math.min(chars.length - 1, Math.max(0, index + step[event.key]))])
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setSelected(chars[event.key === "Home" ? 0 : chars.length - 1])
    } else if (event.key === "Enter") {
      event.preventDefault()
      insert(choice)
    }
  }

  const specialChoice = { char: SPECIAL_CHARACTERS[special].char }
  const name = symbolFont ? `${font}: ${current}` : titleCase(names?.names[String(current)] ?? "")

  return (
    <>
      <DialogFrame
        title="Symbol"
        width={560}
        onClose={onClose}
        tabs={[
          { id: "symbols", label: "Symbols" },
          { id: "special", label: "Special Characters" },
        ]}
        tab={tab}
        onTab={setTab}
        bodyHeight={346}
        onSubmit={(event) => {
          event.preventDefault()
          insert(tab === "symbols" ? choice : specialChoice)
        }}
      >
        {tab === "symbols" ? (
          <div className="symbol-dialog">
            <div className="symbol-dialog-row">
              <Label htmlFor="symbol-font" text="Font:" letter="F" />
              <select
                id="symbol-font"
                value={font}
                onChange={(event) => {
                  setFont(event.target.value)
                  setSelected(SYMBOL_FONTS.includes(event.target.value) ? 32 : current)
                }}
              >
                <option value="">(normal text)</option>
                {FONT_FAMILIES.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
                {SYMBOL_FONTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <Label htmlFor="symbol-subset" text="Subset:" letter="u" />
              <select
                id="symbol-subset"
                value={symbolFont ? "" : subset}
                disabled={symbolFont}
                onChange={(event) => {
                  const block = names?.blocks.find(([blockName]) => blockName === event.target.value)
                  const first = block ? chars.find((value) => value >= block[1] && value <= block[2]) : undefined
                  if (first !== undefined && gridRef.current) {
                    scrollSource.current = "subset"
                    gridRef.current.scrollTop = Math.floor(chars.indexOf(first) / COLUMNS) * CELL
                    setSelected(first)
                  }
                }}
              >
                {symbolFont ? <option value="" /> : null}
                {(names?.blocks ?? [])
                  .filter(([, start, end]) => chars.some((value) => value >= start && value <= end))
                  .map(([blockName]) => (
                    <option key={blockName} value={blockName}>
                      {blockName}
                    </option>
                  ))}
              </select>
            </div>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Symbols"
              tabIndex={0}
              className="symbol-grid"
              style={{ fontFamily: font ? `"${font}"` : undefined, height: CELL * ROWS }}
              onKeyDown={onGridKey}
              onScroll={(event) => {
                if (scrollSource.current) {
                  scrollSource.current = null
                  return
                }
                const top = chars[Math.round(event.currentTarget.scrollTop / CELL) * COLUMNS]
                if (top !== undefined && !symbolFont) {
                  setSubset(blockOf(top))
                }
              }}
            >
              {chars.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  aria-selected={value === current}
                  aria-label={titleCase(names?.names[String(value)] ?? String.fromCodePoint(value))}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelected(value)
                    gridRef.current?.focus()
                  }}
                  onDoubleClick={() =>
                    insert(font ? { char: String.fromCodePoint(value), font } : { char: String.fromCodePoint(value) })
                  }
                >
                  {String.fromCodePoint(value)}
                </button>
              ))}
            </div>
            <p className="symbol-dialog-label">
              <span className="underline">R</span>ecently used symbols:
            </p>
            <div className="symbol-recent" role="listbox" aria-label="Recently used symbols">
              {Array.from({ length: COLUMNS }, (_, slot) => recent[slot]).map((item, slot) =>
                item ? (
                  <button
                    key={`${slot}-${item.char}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    title={item.font ? `${item.font}: ${item.char}` : item.char}
                    style={{ fontFamily: item.font ? `"${item.font}"` : undefined }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setFont(item.font ?? "")
                      setSelected(item.char.codePointAt(0) ?? 32)
                    }}
                    onDoubleClick={() => insert(item)}
                  >
                    {item.char}
                  </button>
                ) : (
                  <span key={slot} aria-hidden />
                ),
              )}
            </div>
            <div className="symbol-dialog-code">
              <div className="min-w-0">
                <p className="symbol-dialog-label">Unicode name:</p>
                <p className="symbol-dialog-name" aria-live="polite">
                  {name}
                </p>
              </div>
              <Label htmlFor="symbol-code" text="Character code:" letter="C" />
              <input
                id="symbol-code"
                className="dialog-input"
                value={code}
                spellCheck={false}
                onChange={(event) => {
                  setCode(event.target.value)
                  const value = parseCode(event.target.value, codeFrom)
                  if (value !== null && chars.includes(value)) {
                    setSelected(value)
                  }
                }}
              />
              <Label htmlFor="symbol-from" text="from:" letter="m" />
              <select
                id="symbol-from"
                value={symbolFont ? "symbol" : from}
                disabled={symbolFont}
                onChange={(event) => {
                  const next = event.target.value as CodeFrom
                  setFrom(next)
                  if (next !== "unicode" && current > 255) {
                    setSelected(32)
                  }
                }}
              >
                {symbolFont ? <option value="symbol">Symbol (decimal)</option> : null}
                <option value="unicode">Unicode (hex)</option>
                <option value="decimal">ASCII (decimal)</option>
                <option value="hex">ASCII (hex)</option>
              </select>
            </div>
            <div className="symbol-dialog-keys">
              <button
                type="button"
                className="dialog-btn"
                onClick={() => useAutoCorrectDialog.getState().show(choice.char)}
              >
                <span className="underline">A</span>utoCorrect…
              </button>
              <button
                type="button"
                className="dialog-btn"
                onClick={() => setShortcutFor({ symbol: choice, name: name || choice.char })}
              >
                Shortcut <span className="underline">K</span>ey…
              </button>
              <span className="symbol-dialog-shortcut">
                {shownKeys(choice) ? `Shortcut key: ${shownKeys(choice)}` : ""}
              </span>
            </div>
          </div>
        ) : (
          <div className="symbol-dialog">
            <div className="symbol-special" role="listbox" aria-label="Special characters">
              <div className="symbol-special-head" aria-hidden>
                <span />
                <span>Character:</span>
                <span>Shortcut key:</span>
              </div>
              {SPECIAL_CHARACTERS.map((item, row) => (
                <button
                  key={item.name}
                  type="button"
                  role="option"
                  aria-selected={row === special}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSpecial(row)}
                  onDoubleClick={() => insert({ char: item.char })}
                >
                  <span className="symbol-special-glyph">{INVISIBLE.test(item.char) ? "" : item.char}</span>
                  <span>{item.name}</span>
                  <span>{shownKeys({ char: item.char })}</span>
                </button>
              ))}
            </div>
            <div className="symbol-dialog-keys">
              <button
                type="button"
                className="dialog-btn"
                onClick={() => useAutoCorrectDialog.getState().show(specialChoice.char)}
              >
                <span className="underline">A</span>utoCorrect…
              </button>
              <button
                type="button"
                className="dialog-btn"
                onClick={() => setShortcutFor({ symbol: specialChoice, name: SPECIAL_CHARACTERS[special].name })}
              >
                Shortcut <span className="underline">K</span>ey…
              </button>
            </div>
          </div>
        )}
        <div className="word-dialog-actions">
          <span className="flex-1" />
          <button type="submit" className="dialog-btn is-primary">
            Insert
          </button>
          <button type="button" className="dialog-btn" onClick={onClose}>
            {inserted ? "Close" : "Cancel"}
          </button>
        </div>
      </DialogFrame>
      {shortcutFor_ ? (
        <CustomizeKeyboardDialog
          symbol={shortcutFor_.symbol}
          name={shortcutFor_.name}
          onClose={() => setShortcutFor(null)}
        />
      ) : null}
    </>
  )
}

/**
 * Word's Customize Keyboard for a symbol (the Symbol dialog's Shortcut Key…): its current keys, a box that records
 * a new one and says what it is assigned to now, Assign and Remove. A key moves from the command that had it, as in
 * Word. Left out: the Categories and Commands lists (it opens on the symbol) and Save changes in (keys are kept in
 * this browser or app, not in a template).
 */
export function CustomizeKeyboardDialog({
  symbol,
  name,
  onClose,
}: {
  symbol: SymbolChoice
  name: string
  onClose: () => void
}) {
  const custom = useShortcuts((state) => state.custom)
  const bind = useShortcuts((state) => state.bind)
  const special = symbol.font ? undefined : SPECIAL_CHARACTERS.find((item) => item.char === symbol.char)?.command
  const id = special ?? symbolCommandId(symbol)
  const keys = keysForCommand(id, custom)
  const [pressed, setPressed] = useState("")
  const [chosen, setChosen] = useState<string | null>(null)
  const owner = pressed ? shortcutFor(pressed, custom) : null
  const reserved = pressed !== "" && RESERVED.has(pressed)
  return (
    <DialogFrame title="Customize Keyboard" width={420} level={100} onClose={onClose}>
      <div className="customize-keyboard">
        <p className="symbol-dialog-label">Command:</p>
        <p className="customize-keyboard-command">
          <span style={{ fontFamily: symbol.font ? `"${symbol.font}"` : undefined }}>{symbol.char}</span> {name}
        </p>
        <Label htmlFor="keyboard-current" text="Current keys:" letter="u" />
        <select id="keyboard-current" size={4} value={chosen ?? ""} onChange={(event) => setChosen(event.target.value)}>
          {keys.map((key) => (
            <option key={key} value={key}>
              {showCombo(key)}
            </option>
          ))}
        </select>
        <Label htmlFor="keyboard-new" text="Press new shortcut key:" letter="n" />
        <input
          id="keyboard-new"
          className="dialog-input"
          readOnly
          value={pressed ? showCombo(pressed) : ""}
          onKeyDown={(event) => {
            if (event.key === "Tab" || (event.key === "Escape" && !event.ctrlKey)) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            const combo = comboFromEvent(event)
            // A key needs Ctrl, Alt or a function key, as in Word; Backspace clears the box.
            if (event.key === "Backspace" && !event.ctrlKey && !event.altKey) {
              setPressed("")
            } else if (combo && (/^(Mod|Alt)\+/.test(combo) || /^F\d+$/.test(combo))) {
              setPressed(combo)
            }
          }}
        />
        <p className="customize-keyboard-owner" aria-live="polite">
          {pressed
            ? reserved
              ? "Currently assigned to: the application (cannot be changed)"
              : `Currently assigned to: ${owner && owner.def.id !== id ? owner.def.label : "[unassigned]"}`
            : ""}
        </p>
      </div>
      <div className="word-dialog-actions">
        <button
          type="button"
          className="dialog-btn"
          disabled={!pressed || reserved || keys.includes(pressed)}
          onClick={() => {
            bind(id, [...keys, pressed])
            setPressed("")
          }}
        >
          Assign
        </button>
        <button
          type="button"
          className="dialog-btn"
          disabled={!chosen || !keys.includes(chosen)}
          onClick={() => {
            bind(
              id,
              keys.filter((key) => key !== chosen),
            )
            setChosen(null)
          }}
        >
          Remove
        </button>
        <span className="flex-1" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}
