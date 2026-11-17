import { describe, expect, it } from "vitest"
import { parseCitations } from "@/addins/citations"

describe("parseCitations", () => {
  it("reads CSL-JSON as Word's sources", () => {
    const json = JSON.stringify([
      {
        type: "article-journal",
        author: [
          { family: "Knuth", given: "Donald E." },
          { family: "Lamport", given: "Leslie" },
        ],
        title: "TeX",
        "container-title": "Journal of Typesetting",
        volume: 3,
        page: "1-9",
        issued: { "date-parts": [[1984]] },
      },
      { author: [{ literal: "World Health Organization" }], title: "Report", issued: { "date-parts": [[2020]] } },
      { title: "No author" },
    ])
    expect(parseCitations(json)).toEqual([
      {
        tag: "Knu84",
        type: "JournalArticle",
        names: {
          Author: {
            people: [
              { last: "Knuth", first: "Donald", middle: "E." },
              { last: "Lamport", first: "Leslie", middle: "" },
            ],
          },
        },
        fields: { Title: "TeX", Year: "1984", JournalName: "Journal of Typesetting", Volume: "3", Pages: "1-9" },
      },
      {
        tag: "Wor20",
        type: "Book",
        names: { Author: { people: [], corporate: "World Health Organization" } },
        fields: { Title: "Report", Year: "2020" },
      },
    ])
  })

  it("reads BibTeX with braces, quotes, several authors and entry types", () => {
    const bib = `@book{knuth84,
  author = {Knuth, Donald and Lamport, Leslie},
  title = {The {TeX}book},
  publisher = {Addison-Wesley},
  year = 1984
}
@comment{ignored}
@article{x, author = "Turing, Alan", title = "Computing", journal = {Mind}, pages = {433--460}, year = {1950}}`
    const sources = parseCitations(bib)
    expect(sources.map((source) => [source.tag, source.type])).toEqual([
      ["Knu84", "Book"],
      ["Tur50", "JournalArticle"],
    ])
    expect(sources[0]!.names.Author?.people.map((person) => person.last)).toEqual(["Knuth", "Lamport"])
    expect(sources[0]!.fields).toEqual({ Title: "The TeXbook", Year: "1984", Publisher: "Addison-Wesley" })
    expect(sources[1]!.fields).toMatchObject({ JournalName: "Mind", Pages: "433-460" })
  })

  it("gives nothing for text that is neither", () => {
    expect(parseCitations("hello")).toEqual([])
    expect(parseCitations("{ not json")).toEqual([])
  })
})
