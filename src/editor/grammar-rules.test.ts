import { describe, expect, it } from "vitest"
import { findGrammarIssues } from "@/editor/grammar-rules"

const kinds = (text: string, language = "en-US") =>
  findGrammarIssues(text, language).map((issue) => `${issue.kind}:${issue.text}>${issue.suggestions[0]}`)

describe("grammar rules", () => {
  it("find spacing and punctuation slips in any language", () => {
    expect(kinds("Een  dubbele spatie , en komma,zonder spatie.", "nl")).toEqual([
      "spacing:  > ",
      "punctuation: >",
      "punctuation:,>, ",
    ])
    expect(kinds("Fin !", "fr")).toEqual([])
    expect(kinds("Fin !", "en-US")).toEqual(["punctuation: >"])
    expect(kinds("Costs 1,000 euros. See www.example.com or 10:30.")).toEqual([])
    expect(kinds("Wait,, what..")).toEqual(["punctuation:,,>,", "punctuation:..>."])
    expect(kinds("And then… nothing.")).toEqual([])
  })

  it("find English capitals, the pronoun I and the article", () => {
    expect(kinds("the day began. it rained.")).toEqual(["capitalization:the>The", "capitalization:it>It"])
    expect(kinds("Then i left, and i'm glad.")).toEqual(["pronoun:i>I", "pronoun:i>I"])
    expect(kinds("It was a honest answer and an big step.")).toEqual(["article:a>an", "article:an>a"])
    expect(kinds("A unicorn, an hour, a European, an MRI, a user.")).toEqual([])
    expect(kinds("Je suis a Paris, i.e. en France.", "fr")).toEqual([])
    expect(kinds("in Dutch dit is geen fout", "nl")).toEqual([])
  })

  it("return nothing for clean text and keep offsets right", () => {
    expect(findGrammarIssues("A clean sentence. Another one!", "en-US")).toEqual([])
    const [issue] = findGrammarIssues("Hello  world", "en-US")
    expect("Hello  world".slice(issue.from, issue.to)).toBe("  ")
  })
})
