import { Editor } from "@tiptap/core"
import { readFileSync, writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { ENVELOPE_SIZES, envelopeHtml, envelopePageSetup, LABEL_PRODUCTS, labelsHtml, labelsPageSetup } from "@/document/envelopes-labels"
import { generateJSON } from "@tiptap/core"
import { addressBlockCode, greetingLineCode, ruleCode } from "@/components/mailings-dialogs"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { mergeContext } from "@/document/mail-merge"
import { mergeDocument, missingFields, type JsonNode } from "@/document/merge-output"
import { autoMatch, mergeFieldResult } from "@/document/merge-fields"
import { readDelimitedSource } from "@/document/merge-sources"

/** The list Word merged in the VM (tests/docx-fixtures/mail-merge, see docs/changes.md). */
const PEOPLE =
  "Title,First Name,Last Name,Company,Address 1,City,Postal Code,Country or Region\r\n" +
  "Ms.,Alex,Rivera,Contoso Ltd,12 Harbour Street,Delft,2611 AB,Netherlands\r\n" +
  ",Sam,Lee,,4 Elm Road,Leeds,LS1 4AB,United Kingdom\r\n" +
  "Dr.,Kim,,Fabrikam,,Utrecht,,Netherlands\r\n"

const ADDRESS =
  'ADDRESSBLOCK \\f "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>>\n<<_COMPANY_\n>><<_STREET1_\n>><<_POSTAL_ >><<_CITY_>><<\n_COUNTRY_>>" \\l 1033 \\c 2 \\e "Netherlands"'
const GREETING = 'GREETINGLINE \\f "<<_BEFORE_ Dear >><<_TITLE0_ >><<_LAST0_>><<_AFTER_ ,>>" \\l 1033 \\e "Dear Sir or Madam,"'
const COMPANY = 'MERGEFIELD Company \\b "at " \\f "!"'

function mergeState(postalMatched: boolean) {
  const table = readDelimitedSource(new TextEncoder().encode(PEOPLE))
  const fieldMap = autoMatch(table.fields)
  if (!postalMatched) {
    fieldMap["Postal Code"] = null
  }
  return {
    type: "letters" as const,
    position: 0,
    source: { name: "people.csv", kind: "text" as const, ...table },
    included: table.records.map(() => true),
    sort: null,
    filters: [],
    fieldMap,
  }
}

function contexts(postalMatched: boolean) {
  const table = readDelimitedSource(new TextEncoder().encode(PEOPLE))
  const fieldMap = autoMatch(table.fields)
  if (!postalMatched) {
    // Word's own Match Fields left Postal Code unmatched for this list.
    fieldMap["Postal Code"] = null
  }
  const state = {
    source: { name: "people.csv", kind: "text" as const, ...table },
    included: table.records.map(() => true),
    sort: null,
    filters: [],
    fieldMap,
  }
  return table.records.map((_, index) => mergeContext(state, index))
}

describe("merge field results, as Word's merge gave them", () => {
  it("matches Word's Address Block, Greeting Line, MERGEFIELD \\b \\f and MERGEREC for each record", () => {
    const results = contexts(false).map((context) => [
      mergeFieldResult(ADDRESS, context),
      mergeFieldResult(GREETING, context),
      mergeFieldResult(COMPANY, context),
      mergeFieldResult("MERGEREC", context),
      mergeFieldResult("MERGEFIELD First_Name", context),
    ])
    // Word: "Ms. Alex Rivera|Contoso Ltd|12 Harbour Street|Delft|Dear Ms. Rivera,|at Contoso Ltd!|1|Alex" …
    expect(results).toEqual([
      ["Ms. Alex Rivera\nContoso Ltd\n12 Harbour Street\nDelft", "Dear Ms. Rivera,", "at Contoso Ltd!", "1", "Alex"],
      ["Sam Lee\n4 Elm Road\nLeeds\nUnited Kingdom", "Dear Sam Lee,", "", "2", "Sam"],
      ["Dr. Kim\nFabrikam\nUtrecht", "Dear Kim,", "at Fabrikam!", "3", "Kim"],
    ])
  })

  it("puts the postal code in once Match Fields finds it, and shows names in chevrons without a list", () => {
    expect(mergeFieldResult(ADDRESS, contexts(true)[0]!)).toBe("Ms. Alex Rivera\nContoso Ltd\n12 Harbour Street\n2611 AB Delft")
    expect(mergeFieldResult(COMPANY, null)).toBe("at «Company»!")
    expect(mergeFieldResult(ADDRESS, null)).toBe("«AddressBlock»")
    expect(mergeFieldResult("NEXT", null)).toBe("«Next Record»")
  })

  it("drops the title with no last name when the format has a suffix, as Word does", () => {
    const kim = contexts(true)[2]!
    const formats = [
      "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>>",
      "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>",
      "<<_TITLE0_ >><<_FIRST0_>>",
      "<<_TITLE0_ >><<_FIRST0_>><< _MIDDLE0_>><< _LAST0_>><< _SUFFIX0_>>",
    ]
    // Word's merge in the VM: "Dr. Kim|Kim|Dr. Kim|Kim".
    expect(formats.map((format) => mergeFieldResult(`ADDRESSBLOCK \\f "${format}" \\c 0`, kim))).toEqual(["Dr. Kim", "Kim", "Dr. Kim", "Kim"])
  })

  it("works out IF with a merge field inside it, NEXT and SKIPIF", () => {
    const [alex, sam] = contexts(true)
    const rule = 'IF { MERGEFIELD City } = "Delft" "Local delivery" "By post"'
    expect(mergeFieldResult(rule, alex!)).toBe("Local delivery")
    expect(mergeFieldResult(rule, sam!)).toBe("By post")
    expect(mergeFieldResult('IF { MERGEFIELD Company } = "" "No company" "{ MERGEFIELD Company }"', sam!)).toBe("No company")
    expect(mergeFieldResult('IF { MERGEFIELD City } = "Del*" "D" "other"', alex!)).toBe("D")
    const effect: { skip?: boolean } = {}
    mergeFieldResult('SKIPIF { MERGEFIELD Country_or_Region } = "United Kingdom"', sam!, effect)
    expect(effect.skip).toBe(true)
    const context = contexts(true)[0]!
    mergeFieldResult("NEXT", context)
    expect(mergeFieldResult("MERGEFIELD First_Name", context)).toBe("Sam")
  })
})

/** The codes of the editor's fields in an opened document's HTML, in order. */
function fieldCodes(html: string) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
  const codes: string[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "wordField") {
      codes.push(String(node.attrs.instr ?? ""))
    }
  })
  editor.destroy()
  return codes
}

describe("merge fields in .docx", { timeout: 60_000 }, () => {
  it("reads Word's merge fields as fields the app fills in, keeping the Address Block's lines, and writes them back", async () => {
    const bytes = readFileSync("tests/docx-fixtures/mail-merge/word-merge-fields.docx")
    const opened = await openDocxBytes(new Uint8Array(bytes), "letter.docx")
    const fields = fieldCodes(opened.view.html)
    expect(fields[0]).toContain("ADDRESSBLOCK")
    expect(fields[0]).toContain("<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>>\n<<_COMPANY_")
    expect(fields).toContain('MERGEFIELD Company \\b "at " \\f "!"')
    expect(fields.some((code) => code.startsWith("GREETINGLINE"))).toBe(true)

    // A field made in the app with a line break and a field inside it goes out as Word's complex field.
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "wordField", attrs: { instr: ADDRESS, result: "«AddressBlock»" } },
            { type: "wordField", attrs: { instr: 'IF { MERGEFIELD City } = "Delft" "Local" "Post"', result: "Post" } },
          ],
        },
      ],
    }
    const saved = await saveDocxBytes({ json: json as never, chrome: emptyChrome(), word: null, unchanged: false, fileName: "a.docx" })
    const xml = decodeXml(findPart(await openPackage(saved.bytes, "a.docx"), "/word/document.xml")!.data)
    expect(xml).toContain("<w:cr/>")
    expect(xml).toMatch(/<w:instrText[^>]*> IF <\/w:instrText>.*<w:fldChar w:fldCharType="begin"\/>.*MERGEFIELD City/s)
    const again = await openDocxBytes(saved.bytes, "a.docx")
    const codes = fieldCodes(again.view.html)
    expect(codes).toEqual([ADDRESS, 'IF { MERGEFIELD City } = "Delft" "Local" "Post"'])
  })
})

const field = (instr: string): JsonNode => ({ type: "wordField", attrs: { instr, result: "" } })
const text = (value: string): JsonNode => ({ type: "text", text: value })
const paragraph = (...content: JsonNode[]): JsonNode => ({ type: "paragraph", content })

/** The merged document's paragraphs as lines of text, "---" for each page break. */
function lines(json: JsonNode) {
  return (json.content ?? []).map((node) =>
    node.type === "pageBreak" ? "---" : (node.content ?? []).map((item) => (item.type === "text" ? item.text : `[${item.attrs?.instr}]`)).join(""),
  )
}

describe("Finish & Merge, as Word's Edit Individual Documents", () => {
  const letter: JsonNode = {
    type: "doc",
    content: [
      paragraph(field(ADDRESS)),
      paragraph(field(GREETING)),
      paragraph(text("Thank you for shopping "), field(COMPANY), text(" Record "), field("MERGEREC"), text(".")),
      paragraph(field("MERGEFIELD Company")),
      paragraph(field("DATE")),
    ],
  }

  it("gives one letter per record: address lines as paragraphs, empty field-only paragraphs dropped, other fields kept", () => {
    const merged = mergeDocument(letter, { kind: "all" }, mergeState(false) as never)
    expect(merged.copies).toBe(3)
    expect(lines(merged.json)).toEqual([
      "Ms. Alex Rivera",
      "Contoso Ltd",
      "12 Harbour Street",
      "Delft",
      "Dear Ms. Rivera,",
      "Thank you for shopping at Contoso Ltd! Record 1.",
      "Contoso Ltd",
      "[DATE]",
      "---",
      "Sam Lee",
      "4 Elm Road",
      "Leeds",
      "United Kingdom",
      "Dear Sam Lee,",
      "Thank you for shopping  Record 2.",
      "[DATE]",
      "---",
      "Dr. Kim",
      "Fabrikam",
      "Utrecht",
      "Dear Kim,",
      "Thank you for shopping at Fabrikam! Record 3.",
      "Fabrikam",
      "[DATE]",
    ])
  })

  it("merges a range or the current record, leaves out unticked and skipped records, and fills a label sheet with NEXT", () => {
    const state = mergeState(true)
    expect(mergeDocument(letter, { kind: "current" }, { ...state, position: 1 } as never).copies).toBe(1)
    expect(mergeDocument(letter, { kind: "range", from: 2, to: 3 }, state as never).copies).toBe(2)
    expect(mergeDocument(letter, { kind: "all" }, { ...state, included: [true, false, true] } as never).copies).toBe(2)
    const skipping: JsonNode = { type: "doc", content: [paragraph(field('SKIPIF { MERGEFIELD City } = "Leeds"'), field("MERGEFIELD First_Name"))] }
    expect(lines(mergeDocument(skipping, { kind: "all" }, state as never).json)).toEqual(["Alex", "---", "Kim"])
    const labels: JsonNode = {
      type: "doc",
      content: [paragraph(field("MERGEFIELD First_Name")), paragraph(field("NEXT"), field("MERGEFIELD First_Name"))],
    }
    // Two labels a sheet: Alex and Sam on the first, Kim and an empty label on the second.
    expect(lines(mergeDocument(labels, { kind: "all" }, state as never).json)).toEqual(["Alex", "Sam", "---", "Kim", ""])
  })

  it("Check for Errors finds merge fields the list does not have", () => {
    const doc: JsonNode = { type: "doc", content: [paragraph(field("MERGEFIELD First_Name"), field("MERGEFIELD Phone"), field('IF { MERGEFIELD Phone } = "" "a" "b"'))] }
    const state = mergeState(true)
    expect(missingFields(doc, state.source.fields, state.fieldMap)).toEqual([{ name: "Phone", count: 2 }])
  })
})

describe("a main document made with the Mailings dialogs", { timeout: 60_000 }, () => {
  it("saves the dialogs' field codes so Word merges them (MAIN_OUT writes the file for the Word VM check)", async () => {
    const address = addressBlockCode({ name: "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>", company: true, postal: true, country: 2, except: "Netherlands" })
    const greeting = greetingLineCode("Dear", "<<_TITLE0_ >><<_LAST0_>>", ",", "Dear Sir or Madam,")
    const rule = ruleCode("IF", "City", "=", "Delft", "Local delivery", "By post")
    expect(rule).toBe('IF { MERGEFIELD City } = "Delft" "Local delivery" "By post"')
    const json = {
      type: "doc",
      content: [
        paragraph(field(address)),
        paragraph(field(greeting)),
        paragraph(text("Your order "), field('MERGEFIELD Company \\b "for " \\f "!"'), text(" Record "), field("MERGEREC"), text(".")),
        paragraph(field(rule)),
        paragraph(field("MERGEFIELD Company")),
      ],
    }
    const saved = await saveDocxBytes({ json: json as never, chrome: emptyChrome(), word: null, unchanged: false, fileName: "main.docx" })
    if (process.env.MAIN_OUT) {
      writeFileSync(process.env.MAIN_OUT, saved.bytes)
    }
    const state = mergeState(true)
    const merged = mergeDocument(json, { kind: "all" }, state as never)
    // Word merged this file in the VM (Postal Code left unmatched, as Word's own Match Fields did): the same text.
    expect(lines(mergeDocument(json, { kind: "all" }, mergeState(false) as never).json).join("|").replace(/\|---\|/g, "<FF>")).toBe(
      "Ms. Alex Rivera|Contoso Ltd|12 Harbour Street|Delft|Dear Ms. Rivera,|Your order for Contoso Ltd! Record 1.|Local delivery|Contoso Ltd" +
        "<FF>Sam Lee|4 Elm Road|Leeds|United Kingdom|Dear Sam Lee,|Your order  Record 2.|By post|" +
        "<FF>Kim|Fabrikam|Utrecht|Dear Kim,|Your order for Fabrikam! Record 3.|By post|Fabrikam",
    )
    if (process.env.MAIN_OUT) {
      writeFileSync(`${process.env.MAIN_OUT}.txt`, lines(merged.json).join("|"))
    }
    expect(lines(merged.json).slice(0, 8)).toEqual([
      "Ms. Alex Rivera",
      "Contoso Ltd",
      "12 Harbour Street",
      "Delft 2611 AB",
      "Dear Ms. Rivera,",
      "Your order for Contoso Ltd! Record 1.",
      "Local delivery",
      "Contoso Ltd",
    ])
  })
})

describe("Envelopes and Labels documents", { timeout: 60_000 }, () => {
  it("saves an envelope of its own page size and a label sheet of exact rows (MAIN_OUT writes them for Word)", async () => {
    const extensions = createExtensions().filter((e) => e.name !== "spellcheck")
    const size = ENVELOPE_SIZES[0]!
    const envelope = await saveDocxBytes({
      json: generateJSON(envelopeHtml(size, "Alex Rivera\n12 Harbour Street\nDelft", "Sam Lee\n4 Elm Road\nLeeds"), extensions) as never,
      chrome: { ...emptyChrome(), pageSetup: envelopePageSetup(size) },
      word: null,
      unchanged: false,
      fileName: "envelope.docx",
    })
    const envelopeXml = decodeXml(findPart(await openPackage(envelope.bytes, "e.docx"), "/word/document.xml")!.data)
    // Size 10: 9.5 x 4.125 in, in twips.
    expect(envelopeXml).toMatch(/<w:pgSz w:w="1368\d" w:h="59\d\d"/)
    const product = LABEL_PRODUCTS[0]!
    const labels = await saveDocxBytes({
      json: generateJSON(labelsHtml(product, { text: "Alex Rivera\n12 Harbour Street" }), extensions) as never,
      chrome: { ...emptyChrome(), pageSetup: labelsPageSetup(product) },
      word: null,
      unchanged: false,
      fileName: "labels.docx",
    })
    const labelsXml = decodeXml(findPart(await openPackage(labels.bytes, "l.docx"), "/word/document.xml")!.data)
    expect(labelsXml.match(/<w:trHeight [^>]*w:hRule="exact"/g)?.length).toBe(product.rows)
    expect(labelsXml.match(/Alex Rivera/g)?.length).toBe(product.rows * product.columns)
    if (process.env.MAIN_OUT) {
      writeFileSync(`${process.env.MAIN_OUT}.envelope.docx`, envelope.bytes)
      writeFileSync(`${process.env.MAIN_OUT}.labels.docx`, labels.bytes)
    }
  })
})
