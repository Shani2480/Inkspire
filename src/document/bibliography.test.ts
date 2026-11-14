import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  bibliographyEntries,
  citationContext,
  citationInstruction,
  formatCitation,
  makeTag,
  parseCitation,
  parseNames,
  readSourcesXml,
  sourcesXml,
  styleFromWord,
  type BibStyleId,
} from "@/document/bibliography"

// Sources and what Word 365 showed for each citation and the bibliography, in each style (made in Word through COM).
const WORD_SOURCES = readFileSync("tests/bibliography/word-sources.xml", "utf8")
const WORD_OUTPUT = JSON.parse(readFileSync("tests/bibliography/word-output.json", "utf8")) as Record<
  string,
  { cit: [string, string][]; bib: string }
>

const sources = readSourcesXml(WORD_SOURCES)!.sources
// The citations in document order, as Word numbers them for IEEE.
const order = ["Smi20", "Smi18", "Bro19", "Wor21", "Gre17", "Doe15", "Kim22", "Ano10"]

describe("Word's sources part", () => {
  it("reads people, corporate authors, editors and fields", () => {
    expect(sources.map((source) => source.tag)).toEqual([...order, "Placeholder1"])
    expect(sources[0]!.names.Author?.people[0]).toEqual({ last: "Smith", first: "John", middle: "A." })
    expect(sources[3]!.names.Author?.corporate).toBe("World Health Organization")
    expect(sources[4]!.names.Editor?.people[0]?.last).toBe("White")
    expect(sources[2]!.fields).toMatchObject({ JournalName: "Journal of Tests", Volume: "12", Issue: "3" })
    expect(sources[8]!.type).toBe("")
    expect(styleFromWord("\\APASixthEditionOfficeOnline.xsl", "APA")).toBe("APA")
    expect(styleFromWord("\\MLASeventhEditionOfficeOnline.xsl")).toBe("MLA")
  })

  it("writes them back as Word wrote them, RefOrder from the citations", () => {
    const again = sourcesXml(sources, "APA", order)
    expect(again).toBe(WORD_SOURCES.replace(/^<\?xml[^>]*\?>/, '<?xml version="1.0" standalone="no"?>'))
    expect(readSourcesXml(again)!.sources).toEqual(sources)
  })
})

describe("citations and bibliography as Word formats them", () => {
  for (const [style, expected] of Object.entries(WORD_OUTPUT)) {
    it(style, () => {
      const context = citationContext(sources, style as BibStyleId, order)
      for (const [instr, shown] of expected.cit) {
        expect(`${instr} => ${formatCitation(instr, context)}`).toBe(`${instr} => ${shown}`)
      }
      const entries = bibliographyEntries(sources, style as BibStyleId, order).map(
        (entry) => (entry.label ? `${entry.label} ` : "") + entry.parts.map((part) => part.text).join(""),
      )
      // Word's result text: entries as paragraphs (IEEE: table cells), a line break inside Harvard's web entry.
      const normal = (text: string) => text.replace(/[|]/g, " ").replace(/\s+/g, " ").trim()
      expect(normal(entries.join(" "))).toBe(normal(expected.bib))
    })
  }

  it("sets titles in italic where Word does", () => {
    const apa = bibliographyEntries(sources, "APA", order)
    expect(apa.find((entry) => entry.tag === "Bro19")!.parts).toEqual([
      { text: "Brown, A., Lee, B., & Clark, C. (2019). Measuring Things Well. " },
      { text: "Journal of Tests, 12", italic: true },
      { text: "(3), 45-67." },
    ])
    expect(apa.find((entry) => entry.tag === "Smi20")!.parts[1]).toEqual({ text: "The Art of Testing.", italic: true })
  })
})

describe("the CITATION field", () => {
  it("parses and writes Word's switches", () => {
    const citation = parseCitation('CITATION Smi20 \\f "see " \\s ", ch. 2" \\v 3 \\l 1033 \\m Bro19 \\m Kim22')
    expect(citation).toEqual({
      tags: ["Smi20", "Bro19", "Kim22"],
      prefix: "see ",
      suffix: ", ch. 2",
      volume: "3",
      lcid: "1033",
    })
    expect(citationInstruction(citation!)).toBe(
      'CITATION Smi20 \\f "see " \\s ", ch. 2" \\v 3 \\l 1033 \\m Bro19 \\m Kim22',
    )
    expect(citationInstruction({ tags: ["Smi20"], pages: "12", noYear: true })).toBe(
      "CITATION Smi20 \\p 12 \\y \\l 1033",
    )
  })

  it("makes Word's tags and reads typed names", () => {
    expect(makeTag(sources[0]!, [])).toBe("Smi20")
    expect(makeTag(sources[0]!, ["smi20"])).toBe("Smi201")
    expect(parseNames("Smith, John A.; Mary Jones").people).toEqual([
      { last: "Smith", first: "John", middle: "A." },
      { last: "Jones", first: "Mary", middle: "" },
    ])
    expect(formatCitation("CITATION Nope \\l 1033", citationContext(sources, "APA"))).toBe("Invalid source specified.")
  })
})
