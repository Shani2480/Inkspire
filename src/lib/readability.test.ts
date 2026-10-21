import { describe, expect, it } from "vitest"
import { countSyllables, readability } from "@/lib/readability"

describe("readability", () => {
  it("counts syllables", () => {
    expect(countSyllables("cat")).toBe(1)
    expect(countSyllables("the")).toBe(1)
    expect(countSyllables("make")).toBe(1)
    expect(countSyllables("table")).toBe(2)
    expect(countSyllables("wanted")).toBe(2)
    expect(countSyllables("jumped")).toBe(1)
    expect(countSyllables("readability")).toBe(5)
    expect(countSyllables("123")).toBe(0)
  })

  it("scores a short plain sentence as very easy", () => {
    const result = readability("The cat sat on the mat.")
    expect(result).toMatchObject({ words: 6, sentences: 1, ease: 116.1 })
    expect(result!.grade).toBeLessThan(0)
  })

  it("counts sentences across punctuation and gives nothing for empty text", () => {
    expect(readability("Is it? Yes! It is.")?.sentences).toBe(3)
    expect(readability("   ")).toBeNull()
    expect(readability("...")).toBeNull()
  })
})
