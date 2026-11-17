import { beforeEach, describe, expect, it } from "vitest"
import { pageSetupForNewDocument } from "@/document/design-format"
import { useLanguageSettings } from "@/document/language-settings"
import { activeCustomWords, newDictionary, readDicFile, useCustomDictionaries } from "@/editor/custom-dictionaries"
import { findGrammarIssues } from "@/editor/grammar-rules"
import { addToDictionary } from "@/editor/spellcheck"

describe("Frequently confused words", () => {
  const fixes = (text: string, confused = true) =>
    findGrammarIssues(text, "en-US", confused)
      .filter((issue) => issue.kind === "confused")
      .map((issue) => `${issue.text} → ${issue.suggestions[0]}`)

  it("flags the wrong one of a pair where the words around it decide", () => {
    expect(fixes("We could of left earlier.")).toEqual(["could of → could have"])
    expect(fixes("It is more then enough.")).toEqual(["more then → more than"])
    expect(fixes("Your welcome to stay.")).toEqual(["Your welcome → You're welcome"])
    expect(fixes("I think its a good plan.")).toEqual(["its a → it's a"])
    expect(fixes("The team has it's own room.")).toEqual(["it's own → its own"])
    expect(fixes("Their are three of them.")).toEqual(["Their are → There are"])
    expect(fixes("Thanks alot.")).toEqual(["alot → a lot"])
  })

  it("leaves right uses alone, and stays off when the option is off", () => {
    expect(fixes("Its colour is red, and then we left. Your plan is good. Their house is big.")).toEqual([])
    expect(fixes("We could of left earlier.", false)).toEqual([])
  })
})

describe("Custom Dictionaries", () => {
  beforeEach(() => {
    const first = newDictionary("CUSTOM.DIC")
    useCustomDictionaries.getState().replace([first], first.id)
  })

  it("adds words to the default dictionary, and uses only the dictionaries that are on, for their language", () => {
    addToDictionary("Inkspire")
    const names = newDictionary("Names", ["Zeebrugge"])
    const german = { ...newDictionary("German"), language: "de" as const, words: ["Schnitzelhaus"] }
    const { dictionaries, defaultId } = useCustomDictionaries.getState()
    useCustomDictionaries.getState().replace([...dictionaries, names, german], defaultId)
    expect([...activeCustomWords("en-US")].sort()).toEqual(["inkspire", "zeebrugge"])
    expect(activeCustomWords("de").has("schnitzelhaus")).toBe(true)
    // Switched off: its words are no longer accepted.
    useCustomDictionaries
      .getState()
      .replace(useCustomDictionaries.getState().dictionaries.map((item) => (item.name === "Names.dic" ? { ...item, enabled: false } : item)), defaultId)
    expect(activeCustomWords("en-US").has("zeebrugge")).toBe(false)
    // Change Default: Add to Dictionary goes to the new default.
    const namesId = useCustomDictionaries.getState().dictionaries.find((item) => item.name === "Names.dic")!.id
    useCustomDictionaries.getState().replace(useCustomDictionaries.getState().dictionaries, namesId)
    addToDictionary("Ostend")
    expect(useCustomDictionaries.getState().dictionaries.find((item) => item.id === namesId)!.words).toContain("Ostend")
  })

  it("reads a Word .dic file (UTF-16 with a byte-order mark) and a plain UTF-8 one", () => {
    const text = "Inkspire\r\nZürich\r\n\r\nInkspire\r\n"
    const utf16 = new Uint8Array(2 + text.length * 2)
    utf16.set([0xff, 0xfe])
    for (let i = 0; i < text.length; i += 1) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    expect(readDicFile(utf16)).toEqual(["Inkspire", "Zürich"])
    expect(readDicFile(new TextEncoder().encode("one\ntwo\n"))).toEqual(["one", "two"])
  })
})

describe("Options > Language", () => {
  it("proofs new documents in the preferred authoring language once one is set", () => {
    useLanguageSettings.getState().replace(["en-US", "nl"], false)
    expect(pageSetupForNewDocument().language).not.toBe("nl")
    useLanguageSettings.getState().replace(["nl", "en-US"], true)
    expect(pageSetupForNewDocument().language).toBe("nl")
    useLanguageSettings.getState().replace(["en-US"], false)
  })
})
