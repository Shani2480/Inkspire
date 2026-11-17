import { describe, expect, it } from "vitest"
import { writeZip } from "@/document/docx/zip"
import { activeRecords, listedRecords } from "@/document/mail-merge"
import {
  parseDelimited,
  readContactsSource,
  readDelimitedSource,
  readExcelSource,
  writeCsv,
} from "@/document/merge-sources"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("recipient lists from text files", () => {
  it("reads quotes, line breaks in quotes, semicolons and tabs, and names blank headers", () => {
    expect(parseDelimited('a,"b, c","d ""e"""\r\n1,"two\nlines",3')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "two\nlines", "3"],
    ])
    const semi = readDelimitedSource(bytes("﻿Name;City;\nAlex;Delft;x\n\n"))
    expect(semi.fields).toEqual(["Name", "City", "Field3"])
    expect(semi.records).toEqual([{ Name: "Alex", City: "Delft", Field3: "x" }])
    expect(readDelimitedSource(bytes("Name\tCity\nSam\tLeeds\n")).records[0]).toEqual({ Name: "Sam", City: "Leeds" })
  })

  it("reads a CSV saved in Windows-1252, and writes one Word and Excel open", () => {
    const latin = new Uint8Array([...bytes("Name\n"), 0x4a, 0xfc, 0x72, 0x67, 0x65, 0x6e])
    expect(readDelimitedSource(latin).records[0]!.Name).toBe("Jürgen")
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(writeCsv({ fields: ["Name", "Note"], records: [{ Name: "Kim", Note: 'says "hi", ok' }] }))
    expect(csv).toBe('﻿Name,Note\r\nKim,"says ""hi"", ok"\r\n')
  })
})

describe("recipient lists from Excel", () => {
  it("reads every sheet with shared strings, inline strings, numbers and dates", async () => {
    const xml = (text: string) => ({ data: bytes(text), stored: false })
    const zip = await writeZip([
      { name: "[Content_Types].xml", ...xml("<Types/>") },
      {
        name: "xl/workbook.xml",
        ...xml(
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customers" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
        ),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        ...xml(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        ),
      },
      {
        name: "xl/sharedStrings.xml",
        ...xml('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>Joined</t></si><si><r><t>Al</t></r><r><t>ex</t></r></si></sst>'),
      },
      {
        name: "xl/styles.xml",
        ...xml('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
      },
      {
        name: "xl/worksheets/sheet1.xml",
        ...xml(
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
            '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Amount</t></is></c></row>' +
            '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>45245</v></c><c r="C2"><v>12.5</v></c></row>' +
            '<row r="3"><c r="A3" t="inlineStr"><is><t>Sam</t></is></c><c r="C3"><v>0.30000000000000004</v></c></row>' +
            "</sheetData></worksheet>",
        ),
      },
      { name: "xl/worksheets/sheet2.xml", ...xml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>') },
    ])
    const sheets = await readExcelSource(zip)
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Customers"])
    expect(sheets[0]!.table).toEqual({
      fields: ["Name", "Joined", "Amount"],
      records: [
        { Name: "Alex", Joined: "11/15/2023", Amount: "12.5" },
        { Name: "Sam", Joined: "", Amount: "0.3" },
      ],
    })
  })
})

describe("contacts as Outlook exports them", () => {
  it("reads a vCard file in Outlook's fields, unfolded, escaped and quoted-printable", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N:Rivera;Alex;;Ms.",
      "FN:Alex Rivera",
      "ORG:Contoso Ltd;Sales",
      "TITLE:Buyer",
      "ADR;WORK:;;12 Harbour Street;Delft;;2611 AB;Netherlands",
      "TEL;CELL:+31 6 0000 0000",
      "EMAIL;INTERNET:alex@example.com",
      "NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Caf=C3=A9 =",
      "visit",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Sam Lee",
      "ADR;TYPE=HOME:;;4 Elm Road\\, Flat 2;Leeds;;LS1 4AB;United Kingdom",
      "END:VCARD",
    ].join("\r\n")
    const table = readContactsSource(bytes(vcard))
    expect(table.records[0]).toMatchObject({
      Title: "Ms.",
      "First Name": "Alex",
      "Last Name": "Rivera",
      Company: "Contoso Ltd",
      Department: "Sales",
      "Job Title": "Buyer",
      "Business Street": "12 Harbour Street",
      "Business City": "Delft",
      "Business Postal Code": "2611 AB",
      "Mobile Phone": "+31 6 0000 0000",
      "E-mail Address": "alex@example.com",
      Notes: "Café visit",
    })
    expect(table.records[1]).toMatchObject({ "First Name": "Sam", "Last Name": "Lee", "Home Street": "4 Elm Road, Flat 2" })
    expect(table.fields).not.toContain("Web Page")
  })

  it("reads Outlook's CSV export, leaving out the columns no contact uses", () => {
    const table = readContactsSource(bytes('"First Name","Last Name","Web Page","E-mail Address"\r\nKim,Ng,,kim@example.com\r\n'))
    expect(table.fields).toEqual(["First Name", "Last Name", "E-mail Address"])
  })
})

describe("Edit Recipient List: ticks, sort and filter", () => {
  it("merges the ticked recipients in the list's order, and only those the filter keeps", () => {
    const records = [
      { Name: "Sam", City: "Leeds", Amount: "10" },
      { Name: "Alex", City: "Delft", Amount: "9" },
      { Name: "Kim", City: "", Amount: "100" },
    ]
    const source = { name: "list.csv", kind: "text" as const, fields: ["Name", "City", "Amount"], records }
    const base = { source, sort: null, filters: [], included: [true, true, true] }
    expect(listedRecords({ ...base, sort: { field: "Amount", descending: false } })).toEqual([1, 0, 2])
    expect(listedRecords({ ...base, sort: { field: "Name", descending: true } })).toEqual([0, 2, 1])
    expect(activeRecords({ ...base, included: [true, false, true] })).toEqual([0, 2])
    expect(listedRecords({ ...base, filters: [{ field: "City", operator: "notBlank", value: "" }] })).toEqual([0, 1])
    expect(listedRecords({ ...base, filters: [{ field: "Amount", operator: "greater", value: "9" }] })).toEqual([0, 2])
  })
})
