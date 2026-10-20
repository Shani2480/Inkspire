import { useEditingOptions } from "@/document/editing-options"
import { skippedBySpellingOptions } from "@/editor/spellcheck"
import { afterEach, describe, expect, it } from "vitest"

const skipped = (text: string, word: string, addresses: [number, number][] = []) =>
  skippedBySpellingOptions(word, text, text.indexOf(word), addresses)

describe("spelling options", () => {
  afterEach(() =>
    useEditingOptions.getState().set({ ignoreUppercase: true, ignoreNumbers: true, ignoreAddresses: true }),
  )

  it("skips words in capitals and words with digits", () => {
    expect(skipped("the NASAA team", "NASAA")).toBe(true)
    expect(skipped("a abc123 b", "abc")).toBe(true)
    expect(skipped("a abc b", "abc")).toBe(false)
    useEditingOptions.getState().set({ ignoreUppercase: false, ignoreNumbers: false })
    expect(skipped("the NASAA team", "NASAA")).toBe(false)
    expect(skipped("a abc123 b", "abc")).toBe(false)
  })

  it("skips words inside an address only while the option is on", () => {
    const text = "see www.exmple.com now"
    expect(skipped(text, "exmple", [[4, 17]])).toBe(true)
    useEditingOptions.getState().set({ ignoreAddresses: false })
    expect(skipped(text, "exmple", [[4, 17]])).toBe(false)
  })
})
