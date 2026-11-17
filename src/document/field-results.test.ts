import { describe, expect, it } from "vitest"
import { applyTextFormats, cardinal, formatNumber, infoFieldResult, numericPicture, ordinalText, type FieldInfo } from "@/document/field-results"
import { buildInstruction, FIELDS } from "@/document/field-catalog"

const info: FieldInfo = {
  now: new Date(2026, 10, 16, 14, 5, 9),
  locale: "en-US",
  props: {
    title: "Quarterly report",
    subject: "Sales",
    keywords: "north, south",
    comments: "Draft",
    author: "Alex Doe",
    company: "Example Ltd",
    category: "Reports",
    createdAt: new Date(2026, 0, 2, 9, 30, 0).toISOString(),
    savedAt: null,
    printedAt: null,
    editingMinutes: 42,
  },
  fileName: "report.docx",
  path: "/home/alex/Documents/report.docx",
  user: { name: "Alex Doe", initials: "AD", address: "" },
  pages: () => 12,
  words: () => 1234,
  characters: () => 5678,
  pageAt: () => "3",
  section: () => ({ number: 2, pages: 5 }),
  styleText: (style) => (style === "Heading 1" ? "Introduction" : null),
}

const result = (instr: string) => infoFieldResult(instr, info, 10)

describe("field results", () => {
  it("reads document properties, with text formats", () => {
    expect(result("AUTHOR")).toBe("Alex Doe")
    expect(result("AUTHOR \\* Upper \\* MERGEFORMAT")).toBe("ALEX DOE")
    expect(result("TITLE \\* Caps")).toBe("Quarterly Report")
    expect(result('DOCPROPERTY Company')).toBe("Example Ltd")
    expect(result('DOCPROPERTY "Category" \\* Lower')).toBe("reports")
    expect(result("KEYWORDS")).toBe("north, south")
    expect(result("INFO Subject")).toBe("Sales")
    expect(result("FILENAME")).toBe("report.docx")
    expect(result("FILENAME \\p")).toBe("/home/alex/Documents/report.docx")
    expect(result("USERINITIALS")).toBe("AD")
  })

  it("counts and numbers, in Word's number formats", () => {
    expect(result("NUMPAGES")).toBe("12")
    expect(result("NUMPAGES \\* roman")).toBe("xii")
    expect(result("NUMWORDS \\# \"#,##0\"")).toBe("1,234")
    expect(result("PAGE \\* ALPHABETIC")).toBe("C")
    expect(result("SECTION")).toBe("2")
    expect(result("SECTIONPAGES \\* CardText")).toBe("five")
    expect(result("EDITTIME")).toBe("42")
  })

  it("formats dates by their picture, or Word's default", () => {
    expect(result('DATE \\@ "d MMMM yyyy"')).toBe("16 November 2026")
    expect(result("DATE")).toBe("11/16/2026")
    expect(result('CREATEDATE \\@ "yyyy-MM-dd"')).toBe("2026-01-02")
    // Never saved: no result, the field keeps what it has.
    expect(result("SAVEDATE")).toBeNull()
  })

  it("other fields", () => {
    expect(result('QUOTE "hello there" \\* Upper')).toBe("HELLO THERE")
    expect(result("SYMBOL 169")).toBe("©")
    expect(result('STYLEREF "Heading 1"')).toBe("Introduction")
    expect(result("MERGEFIELD FirstName")).toBe("«FirstName»")
    expect(result('MACROBUTTON NoMacro "Click here"')).toBe('"Click here"')
    expect(result("REVNUM")).toBeNull()
  })

  it("number words and pictures", () => {
    expect(cardinal(123)).toBe("one hundred twenty-three")
    expect(cardinal(2005)).toBe("two thousand five")
    expect(ordinalText(21)).toBe("twenty-first")
    expect(ordinalText(12)).toBe("twelfth")
    expect(formatNumber(3, "Ordinal")).toBe("3rd")
    expect(formatNumber(13, "Ordinal")).toBe("13th")
    expect(formatNumber(255, "Hex")).toBe("FF")
    expect(formatNumber(12.5, "DollarText")).toBe("twelve and 50/100")
    expect(numericPicture(1234.5, "#,##0.00")).toBe("1,234.50")
    expect(numericPicture(-12, "$#,##0.00;($#,##0.00)")).toBe("($  12.00)")
    expect(numericPicture(0.25, "0%")).toBe("25%")
    expect(applyTextFormats("hello world", "\\* FirstCap")).toBe("Hello world")
  })

  it("builds the instruction from the Field dialog's choices", () => {
    const author = FIELDS.find((field) => field.name === "Author")!
    expect(buildInstruction(author, { args: ["Pat Lee"], textFormat: "Upper" }, [], true)).toBe(
      'AUTHOR "Pat Lee" \\* Upper \\* MERGEFORMAT',
    )
    const date = FIELDS.find((field) => field.name === "Date")!
    expect(buildInstruction(date, { args: [], datePicture: "d MMMM yyyy" }, [{ flag: "\\l" }], false)).toBe(
      'DATE \\@ "d MMMM yyyy" \\l',
    )
    const seq = FIELDS.find((field) => field.name === "Seq")!
    expect(buildInstruction(seq, { args: ["Figure"] }, [{ flag: "\\r", value: "3" }], false)).toBe("SEQ Figure \\r 3")
    const fill = FIELDS.find((field) => field.name === "Fill-in")!
    expect(buildInstruction(fill, { args: ["Your name?"] }, [], false)).toBe('FILLIN "Your name?"')
  })
})
