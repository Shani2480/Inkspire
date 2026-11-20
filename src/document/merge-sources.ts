import { decodeXml, parseXmlEvents } from "@/document/docx/xml"
import { readZip } from "@/document/docx/zip"

/**
 * Mail merge recipient lists, read as Word reads them: a CSV or text file (the first row names the fields), an Excel
 * workbook (one sheet, chosen in Select Table), and contacts as Outlook exports them (a vCard file, or Outlook's own
 * CSV export, whose headers are Outlook's field names).
 */

export type MergeRecord = Record<string, string>

export type MergeTable = { fields: string[]; records: MergeRecord[] }

export type MergeSourceKind = "text" | "excel" | "contacts" | "typed"

export class MergeSourceError extends Error {}

/* ---------- CSV and text ---------- */

/** The delimiter a text file uses: the one that splits its first line into the most fields (outside quotes). */
function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  let best = ","
  let bestCount = 0
  for (const candidate of [",", ";", "\t", "|"]) {
    let count = 0
    let quoted = false
    for (const char of firstLine) {
      if (char === '"') {
        quoted = !quoted
      } else if (char === candidate && !quoted) {
        count += 1
      }
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** Rows of a delimited text: quoted fields may hold the delimiter, doubled quotes and line breaks. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === "") {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

/** Field names from a header row: blanks get Word's "Field1"…, repeats get a number. */
function headerNames(cells: string[]) {
  const seen = new Map<string, number>()
  return cells.map((cell, index) => {
    const base = cell.trim() || `Field${index + 1}`
    const count = seen.get(base.toLowerCase()) ?? 0
    seen.set(base.toLowerCase(), count + 1)
    return count ? `${base}${count + 1}` : base
  })
}

function tableFromRows(rows: string[][]): MergeTable {
  if (!rows.length) {
    throw new MergeSourceError("The list is empty.")
  }
  const width = Math.max(...rows.map((cells) => cells.length))
  const header = rows[0]!
  const fields = headerNames(Array.from({ length: width }, (_, index) => header[index] ?? ""))
  const records = rows.slice(1).map((cells) => {
    const record: MergeRecord = {}
    fields.forEach((name, index) => {
      record[name] = (cells[index] ?? "").trim()
    })
    return record
  })
  return { fields, records }
}

export function decodeText(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2))
  }
  const utf8 = new TextDecoder("utf-8", { fatal: true })
  try {
    return utf8.decode(bytes).replace(/^\uFEFF/, "")
  } catch {
    // Excel on Windows saves CSV in the system's code page; Windows-1252 covers Western European names.
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

export function readDelimitedSource(bytes: Uint8Array): MergeTable {
  return tableFromRows(parseDelimited(decodeText(bytes)))
}

/* ---------- Excel ---------- */

export type ExcelSheet = { name: string; table: MergeTable }

/** Excel's built-in date formats, and custom ones that are dates (have d, m or y outside quotes and brackets). */
function isDateFormat(id: number, code: string | undefined) {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) {
    return true
  }
  if (!code) {
    return false
  }
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")
  return /[dmy]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** An Excel serial date as Word shows a date from a workbook: the day, and the time when there is one. */
function excelDate(serial: number, system1904: boolean) {
  const days = serial + (system1904 ? 1462 : 0)
  // Day 60 is Excel's 29 February 1900, which did not exist: before it, days count from 31 December 1899.
  const fromUnix = days - (days < 61 ? 25568 : 25569)
  const date = new Date(Math.round(fromUnix * 86400) * 1000)
  const day = `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
  const seconds = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds()
  return seconds ? `${day} ${date.getUTCHours()}:${pad(date.getUTCMinutes())}` : day
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "A"
  let index = 0
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64)
  }
  return index - 1
}

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

/** A small element tree, enough for workbook parts (local names, no namespaces). */
function parseTree(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" }
  const stack = [root]
  parseXmlEvents(xml, {
    start: (tag) => {
      const attrs: Record<string, string> = {}
      for (const attribute of tag.attributes) {
        attrs[attribute.prefix ? `${attribute.prefix}:${attribute.local}` : attribute.local] = attribute.value
      }
      const node: XmlNode = { name: tag.local, attrs, children: [], text: "" }
      stack[stack.length - 1]!.children.push(node)
      stack.push(node)
    },
    end: () => {
      stack.pop()
    },
    text: (text) => {
      stack[stack.length - 1]!.text += text
    },
  })
  return root
}

function* walk(node: XmlNode): Generator<XmlNode> {
  for (const child of node.children) {
    yield child
    yield* walk(child)
  }
}

function textOf(node: XmlNode): string {
  // A rich-text string is runs of <t>; phonetic runs (<rPh>) are not part of the text.
  if (node.name === "rPh") {
    return ""
  }
  if (node.name === "t") {
    return node.text
  }
  return node.children.map(textOf).join("")
}

function resolveTarget(base: string, target: string) {
  if (target.startsWith("/")) {
    return target.slice(1)
  }
  const parts = base.split("/").slice(0, -1)
  for (const piece of target.split("/")) {
    if (piece === "..") {
      parts.pop()
    } else if (piece !== ".") {
      parts.push(piece)
    }
  }
  return parts.join("/")
}

/** Every sheet of a workbook, with its first row as the field names (Word's "First row of data contains headers"). */
export async function readExcelSource(bytes: Uint8Array): Promise<ExcelSheet[]> {
  let entries
  try {
    entries = await readZip(bytes)
  } catch {
    throw new MergeSourceError("This isn't an Excel workbook Inkspire can read (.xlsx). Older .xls files need to be saved as .xlsx in Excel first.")
  }
  const parts = new Map(entries.map((entry) => [entry.normalizedName.toLowerCase(), entry.data]))
  const part = (name: string) => parts.get(name.toLowerCase())
  const workbookBytes = part("xl/workbook.xml")
  if (!workbookBytes) {
    throw new MergeSourceError("The workbook has no sheets Inkspire can read.")
  }
  const workbook = parseTree(decodeXml(workbookBytes))
  const rels = part("xl/_rels/workbook.xml.rels")
  const targets = new Map<string, string>()
  if (rels) {
    for (const node of walk(parseTree(decodeXml(rels)))) {
      if (node.name === "Relationship") {
        targets.set(node.attrs.Id ?? "", resolveTarget("xl/workbook.xml", node.attrs.Target ?? ""))
      }
    }
  }
  const system1904 = [...walk(workbook)].some(
    (node) => node.name === "workbookPr" && /^(1|true)$/i.test(node.attrs.date1904 ?? ""),
  )
  const shared: string[] = []
  const sharedBytes = part("xl/sharedStrings.xml")
  if (sharedBytes) {
    for (const node of parseTree(decodeXml(sharedBytes)).children[0]?.children ?? []) {
      if (node.name === "si") {
        shared.push(textOf(node))
      }
    }
  }
  // Which cell styles show a number as a date.
  const dateStyles = new Set<number>()
  const stylesBytes = part("xl/styles.xml")
  if (stylesBytes) {
    const styles = parseTree(decodeXml(stylesBytes))
    const codes = new Map<number, string>()
    for (const node of walk(styles)) {
      if (node.name === "numFmt") {
        codes.set(Number(node.attrs.numFmtId), node.attrs.formatCode ?? "")
      }
    }
    const cellXfs = [...walk(styles)].find((node) => node.name === "cellXfs")
    cellXfs?.children
      .filter((node) => node.name === "xf")
      .forEach((xf, index) => {
        const id = Number(xf.attrs.numFmtId ?? 0)
        if (isDateFormat(id, codes.get(id))) {
          dateStyles.add(index)
        }
      })
  }
  const sheets: ExcelSheet[] = []
  for (const node of walk(workbook)) {
    if (node.name !== "sheet") {
      continue
    }
    const target = targets.get(node.attrs["r:id"] ?? "") ?? ""
    const sheetBytes = part(target)
    if (!sheetBytes || (node.attrs.state ?? "visible") !== "visible") {
      continue
    }
    const rows: string[][] = []
    for (const row of walk(parseTree(decodeXml(sheetBytes)))) {
      if (row.name !== "row") {
        continue
      }
      const cells: string[] = []
      for (const cell of row.children.filter((child) => child.name === "c")) {
        const index = cell.attrs.r ? columnIndex(cell.attrs.r) : cells.length
        const type = cell.attrs.t ?? "n"
        const value = cell.children.find((child) => child.name === "v")?.text ?? ""
        let text: string
        if (type === "s") {
          text = shared[Number(value)] ?? ""
        } else if (type === "inlineStr") {
          text = textOf(cell.children.find((child) => child.name === "is") ?? cell)
        } else if (type === "b") {
          text = value === "1" ? "TRUE" : "FALSE"
        } else if (type === "n" && value !== "" && dateStyles.has(Number(cell.attrs.s ?? 0))) {
          text = excelDate(Number(value), system1904)
        } else if (type === "n" && value !== "") {
          // Excel keeps 17 significant digits; Word shows the number as Excel does without a format.
          text = String(Number(Number(value).toPrecision(15)))
        } else {
          text = value
        }
        while (cells.length < index) {
          cells.push("")
        }
        cells[index] = text
      }
      rows.push(cells)
    }
    const filled = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
    if (filled.length) {
      sheets.push({ name: node.attrs.name ?? `Sheet${sheets.length + 1}`, table: tableFromRows(filled) })
    }
  }
  if (!sheets.length) {
    throw new MergeSourceError("The workbook has no sheets with data.")
  }
  return sheets
}

/* ---------- Contacts (Outlook) ---------- */

/** Outlook's contact fields, in the order Outlook's export lists them, as a contacts list shows them in Word. */
export const OUTLOOK_FIELDS = [
  "Title",
  "First Name",
  "Middle Name",
  "Last Name",
  "Suffix",
  "Company",
  "Department",
  "Job Title",
  "Business Street",
  "Business City",
  "Business State",
  "Business Postal Code",
  "Business Country/Region",
  "Home Street",
  "Home City",
  "Home State",
  "Home Postal Code",
  "Home Country/Region",
  "Business Phone",
  "Home Phone",
  "Mobile Phone",
  "E-mail Address",
  "E-mail 2 Address",
  "Web Page",
  "Birthday",
  "Notes",
] as const

/** A vCard value with its escapes undone (\n, \, \; \\). */
function unescapeVcard(value: string) {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char))
}

function decodeQuotedPrintable(value: string, charset: string) {
  const bytes: number[] = []
  const text = value.replace(/=\r?\n/g, "")
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "=" && /^[0-9A-F]{2}$/i.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(text.charCodeAt(i))
    }
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes))
  } catch {
    return new TextDecoder().decode(new Uint8Array(bytes))
  }
}

/** The contacts of a vCard file (versions 2.1, 3.0 and 4.0, as Outlook and phones export them), in Outlook's fields. */
export function readVcardSource(text: string): MergeTable {
  // Unfold: a line that starts with a space or tab continues the one before.
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)
  const records: MergeRecord[] = []
  let card: MergeRecord | null = null
  let pendingQp = ""
  for (let raw of lines) {
    if (pendingQp) {
      raw = pendingQp + raw
      pendingQp = ""
    }
    if (/ENCODING=QUOTED-PRINTABLE/i.test(raw) && raw.endsWith("=")) {
      pendingQp = raw.slice(0, -1)
      continue
    }
    const colon = raw.indexOf(":")
    if (colon < 0) {
      continue
    }
    const head = raw.slice(0, colon)
    let value = raw.slice(colon + 1)
    const [nameWithGroup, ...params] = head.split(";")
    const name = (nameWithGroup ?? "").replace(/^.*\./, "").toUpperCase()
    const paramText = params.join(";").toUpperCase()
    if (name === "BEGIN" && value.toUpperCase() === "VCARD") {
      card = {}
      continue
    }
    if (name === "END" && card) {
      if (Object.values(card).some(Boolean)) {
        records.push(card)
      }
      card = null
      continue
    }
    if (!card) {
      continue
    }
    if (/ENCODING=QUOTED-PRINTABLE/.test(paramText)) {
      value = decodeQuotedPrintable(value, /CHARSET=([^;]+)/.exec(paramText)?.[1]?.toLowerCase() ?? "utf-8")
    }
    const parts = value.split(/(?<!\\);/).map(unescapeVcard)
    const set = (field: (typeof OUTLOOK_FIELDS)[number], text: string | undefined) => {
      if (text && !card![field]) {
        card![field] = text.trim()
      }
    }
    const home = /HOME/.test(paramText)
    switch (name) {
      case "N":
        set("Last Name", parts[0])
        set("First Name", parts[1])
        set("Middle Name", parts[2])
        set("Title", parts[3])
        set("Suffix", parts[4])
        break
      case "FN":
        if (!card["First Name"] && !card["Last Name"]) {
          const words = (parts[0] ?? "").trim().split(/\s+/)
          set("Last Name", words.length > 1 ? words.pop() : undefined)
          set("First Name", words.join(" "))
        }
        break
      case "ORG":
        set("Company", parts[0])
        set("Department", parts[1])
        break
      case "TITLE":
        set("Job Title", parts[0])
        break
      case "ADR": {
        const prefix = home ? "Home" : "Business"
        const street = [parts[1], parts[2]].filter(Boolean).join("\n")
        set(`${prefix} Street`, street)
        set(`${prefix} City`, parts[3])
        set(`${prefix} State`, parts[4])
        set(`${prefix} Postal Code`, parts[5])
        set(`${prefix} Country/Region`, parts[6])
        break
      }
      case "TEL":
        if (/CELL/.test(paramText)) {
          set("Mobile Phone", parts[0])
        } else if (home) {
          set("Home Phone", parts[0])
        } else {
          set("Business Phone", parts[0])
        }
        break
      case "EMAIL":
        if (card["E-mail Address"]) {
          set("E-mail 2 Address", parts[0])
        } else {
          set("E-mail Address", parts[0])
        }
        break
      case "URL":
        set("Web Page", value)
        break
      case "BDAY":
        set("Birthday", value)
        break
      case "NOTE":
        set("Notes", parts.join(";"))
        break
    }
  }
  if (!records.length) {
    throw new MergeSourceError("No contacts were found in the file.")
  }
  const fields = OUTLOOK_FIELDS.filter((field) => records.some((record) => record[field]))
  return {
    fields: [...fields],
    records: records.map((record) => Object.fromEntries(fields.map((field) => [field, record[field] ?? ""]))),
  }
}

/** A contacts file: a vCard, or the CSV Outlook exports (its headers are already Outlook's field names). */
export function readContactsSource(bytes: Uint8Array): MergeTable {
  const text = decodeText(bytes)
  if (/^\s*BEGIN:VCARD/im.test(text)) {
    return readVcardSource(text)
  }
  const table = tableFromRows(parseDelimited(text))
  // Outlook's export lists every field, mostly empty; leave out the columns no contact uses.
  const fields = table.fields.filter((field) => table.records.some((record) => record[field]))
  return { fields, records: table.records.map((record) => Object.fromEntries(fields.map((field) => [field, record[field] ?? ""]))) }
}

/** A recipient list as CSV (Word saves a typed list as an Access file; a CSV opens anywhere, Word included). */
export function writeCsv(table: MergeTable) {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = [table.fields.map(cell).join(",")]
  for (const record of table.records) {
    lines.push(table.fields.map((field) => cell(record[field] ?? "")).join(","))
  }
  return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`)
}
