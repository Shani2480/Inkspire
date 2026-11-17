import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { codeText, parseCode } from "@/components/symbol-dialog"
import { createExtensions } from "@/editor/extensions"
import { keysForCommand, shortcutFor, SHORTCUTS, useShortcuts } from "@/editor/shortcuts"
import { insertSymbol, symbolCommandId, symbolOfCommand, titleCase, useRecentSymbols } from "@/editor/symbols"
import names from "@/components/symbol-names.json"
import { saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { writeFileSync } from "node:fs"
import path from "node:path"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
  useShortcuts.getState().reset()
})

function make(content: string) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content })
  editors.push(editor)
  return editor
}

describe("Symbol dialog", () => {
  it("names characters as Word does and lists its subsets", () => {
    expect(titleCase((names.names as Record<string, string>)["169"])).toBe("Copyright Sign")
    expect(titleCase("LATIN SMALL LETTER A WITH GRAVE")).toBe("Latin Small Letter A With Grave")
    expect(names.blocks.map((block) => block[0])).toContain("Currency Symbols")
    // No controls or combining marks in the grid.
    expect((names.names as Record<string, string>)["127"]).toBeUndefined()
    expect((names.names as Record<string, string>)["768"]).toBeUndefined()
  })

  it("shows and reads character codes in Unicode, ASCII decimal and ASCII hex", () => {
    expect(codeText(0xa9, "unicode")).toBe("00A9")
    expect(codeText(0xa9, "decimal")).toBe("169")
    expect(codeText(0xa9, "hex")).toBe("A9")
    expect(parseCode("20ac", "unicode")).toBe(0x20ac)
    expect(parseCode("169", "decimal")).toBe(169)
    expect(parseCode("zz", "unicode")).toBeNull()
  })

  it("inserts in the symbol's font, twice in a row without taking the first one back, and remembers it", () => {
    const editor = make("<p>ab</p>")
    editor.commands.setTextSelection(2)
    insertSymbol(editor, { char: "J", font: "Wingdings" })
    insertSymbol(editor, { char: "©" })
    expect(editor.getText()).toBe("aJ©b")
    expect(editor.getHTML()).toContain("font-family: Wingdings")
    expect(useRecentSymbols.getState().recent.slice(0, 2)).toEqual([{ char: "©" }, { char: "J", font: "Wingdings" }])
  })

  it("gives a symbol a key of its own (Shortcut Key…), which types it and leaves the command that had it", () => {
    const symbol = { char: "★" }
    const id = symbolCommandId(symbol)
    expect(symbolOfCommand(id)).toEqual(symbol)
    expect(symbolOfCommand(symbolCommandId({ char: "J", font: "Wingdings" }))).toEqual({ char: "J", font: "Wingdings" })
    useShortcuts.getState().bind(id, ["Mod+Alt+C"])
    expect(keysForCommand("copyright")).toEqual([])
    const editor = make("<p>x</p>")
    editor.commands.setTextSelection(2)
    shortcutFor("Mod+Alt+C")!.def.run(editor)
    expect(editor.getText()).toBe("x★")
    useShortcuts.getState().bind("copyright", ["Mod+Alt+C"])
    expect(keysForCommand(id)).toEqual([])
    expect(shortcutFor("Mod+Alt+C")!.def.id).toBe("copyright")
  })

  it("binds Word's symbol keys", () => {
    const keys = Object.fromEntries(SHORTCUTS.map((def) => [def.id, def.keys]))
    expect(keys.copyright).toEqual(["Mod+Alt+C"])
    expect(keys.trademark).toEqual(["Mod+Alt+T"])
    expect(keys["em-dash"]).toEqual(["Mod+Alt+Num -"])
  })

  it("saves symbols and a symbol font's glyph so Word shows them (SYMBOLS_OUT writes the file for the VM)", async () => {
    const editor = make("<p>Signs: </p><p>Fonts: </p>")
    editor.commands.setTextSelection(8)
    for (const char of ["€", "©", "™", "\u2014", "\u2026", "→", "★", "\u00A0", "Ω"]) {
      insertSymbol(editor, { char })
    }
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    insertSymbol(editor, { char: "J", font: "Wingdings" })
    insertSymbol(editor, { char: "p", font: "Symbol" })
    insertSymbol(editor, { char: "ü", font: "Wingdings" })
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "symbols.docx",
    })
    if (process.env.SYMBOLS_OUT) {
      writeFileSync(path.join(process.env.SYMBOLS_OUT, "symbols.docx"), saved.bytes)
    }
    const pkg = await openPackage(saved.bytes, "symbols.docx")
    const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
    expect(xml).toContain("€©™")
    expect(xml).toMatch(/w:ascii="Wingdings"/)
  })
})
