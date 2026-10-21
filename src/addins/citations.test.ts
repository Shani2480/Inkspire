import { describe, expect, it } from "vitest"
import { parseCitations } from "@/addins/citations"

describe("parseCitations", () => {
  it("reads CSL-JSON", () => {
    const json = JSON.stringify([
      {
        author: [{ family: "Knuth", given: "Donald" }, { literal: "Lamport" }],
        title: "TeX",
        issued: { "date-parts": [[1984]] },
      },
      { title: "No author" },
    ])
    expect(parseCitations(json)).toEqual([{ author: "Knuth, Donald; Lamport", title: "TeX", year: "1984" }])
  })

  it("reads BibTeX with braces, quotes and several authors", () => {
    const bib = `@book{knuth84,
  author = {Knuth, Donald and Lamport, Leslie},
  title = {The {TeX}book},
  year = 1984
}
@comment{ignored}
@article{x, author = "Turing, Alan", title = "Computing", year = {1950}}`
    expect(parseCitations(bib)).toEqual([
      { author: "Knuth, Donald; Lamport, Leslie", title: "The TeXbook", year: "1984" },
      { author: "Turing, Alan", title: "Computing", year: "1950" },
    ])
  })

  it("gives nothing for text that is neither", () => {
    expect(parseCitations("hello")).toEqual([])
    expect(parseCitations("{ not json")).toEqual([])
  })
})
