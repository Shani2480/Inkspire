import { create } from "zustand"

export type MergeRecord = Record<string, string>

export const STANDARD_FIELDS = [
  "FirstName",
  "LastName",
  "Company",
  "Address",
  "City",
  "PostalCode",
  "Email",
  "Title",
] as const

export type StandardField = (typeof STANDARD_FIELDS)[number]

export type FieldMap = Partial<Record<StandardField, string>>

type MailMergeState = {
  mode: "letters" | "envelopes" | "labels" | "directory" | "email" | null
  recipients: MergeRecord[]
  fields: string[]
  fieldMap: FieldMap
  index: number
  preview: boolean
  setMode: (mode: MailMergeState["mode"]) => void
  setRecipients: (recipients: MergeRecord[]) => void
  setFieldMap: (fieldMap: FieldMap) => void
  setIndex: (index: number) => void
  setPreview: (preview: boolean) => void
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
  clear: () => void
}

function autoMap(fields: string[]): FieldMap {
  const map: FieldMap = {}
  const lower = fields.map((name) => ({ name, key: name.toLowerCase().replace(/[\s_]+/g, "") }))
  const aliases: Record<StandardField, string[]> = {
    FirstName: ["firstname", "first", "givenname", "name"],
    LastName: ["lastname", "last", "surname", "familyname"],
    Company: ["company", "organization", "org"],
    Address: ["address", "street", "address1", "addr"],
    City: ["city", "town"],
    PostalCode: ["postalcode", "zip", "zipcode", "postcode"],
    Email: ["email", "mail", "e-mail"],
    Title: ["title", "salutation", "honorific"],
  }
  for (const field of STANDARD_FIELDS) {
    const hit = lower.find((item) => aliases[field].includes(item.key))
    if (hit) {
      map[field] = hit.name
    }
  }
  return map
}

export const useMailMerge = create<MailMergeState>((set, get) => ({
  mode: null,
  recipients: [],
  fields: [],
  fieldMap: {},
  index: 0,
  preview: false,
  setMode: (mode) => set({ mode }),
  setRecipients: (recipients) => {
    const fields = recipients[0] ? Object.keys(recipients[0]) : []
    set({ recipients, fields, fieldMap: autoMap(fields), index: 0 })
  },
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setIndex: (index) => {
    const max = Math.max(0, get().recipients.length - 1)
    set({ index: Math.min(max, Math.max(0, index)) })
  },
  setPreview: (preview) => set({ preview }),
  next: () => get().setIndex(get().index + 1),
  prev: () => get().setIndex(get().index - 1),
  first: () => get().setIndex(0),
  last: () => get().setIndex(get().recipients.length - 1),
  clear: () => set({ mode: null, recipients: [], fields: [], fieldMap: {}, index: 0, preview: false }),
}))

export function parseRecipientCsv(text: string): MergeRecord[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    return []
  }
  const headers = splitCsvLine(lines[0]).map((header) => header.trim() || "Field")
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row: MergeRecord = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ""
    })
    return row
  })
}

function splitCsvLine(line: string) {
  const out: string[] = []
  let current = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (ch === "," && !quoted) {
      out.push(current)
      current = ""
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}

export function applyMergeToHtml(html: string, record: MergeRecord) {
  let next = html
  for (const [name, value] of Object.entries(record)) {
    const pattern = new RegExp(`«\\s*${escapeRegExp(name)}\\s*»`, "gi")
    next = next.replace(pattern, escapeHtml(value))
    next = next.replace(new RegExp(`data-merge="${escapeRegExp(name)}"[^>]*>[^<]*`, "gi"), (match) =>
      match.replace(/>[^<]*$/, `>${escapeHtml(value)}`),
    )
  }
  return next
}

export function resolveField(
  record: MergeRecord,
  fieldMap: FieldMap,
  standard: StandardField,
  fallbackNames: string[] = [],
) {
  const mapped = fieldMap[standard]
  if (mapped && record[mapped] != null && record[mapped] !== "") {
    return record[mapped]
  }
  for (const name of [standard, ...fallbackNames]) {
    if (record[name] != null && record[name] !== "") {
      return record[name]
    }
  }
  return ""
}

export function mappedFieldName(fieldMap: FieldMap, standard: StandardField, fields: string[]) {
  return fieldMap[standard] || (fields.includes(standard) ? standard : fields[0] || standard)
}

export function addressBlockHtml(fieldMap: FieldMap, fields: string[]) {
  const line = (standard: StandardField, extras: string[] = []) => {
    const name = mappedFieldName(fieldMap, standard, fields.length ? fields : [standard, ...extras])
    return `«${name}»`
  }
  const first = line("FirstName", ["Name"])
  const last = line("LastName")
  const company = line("Company")
  const address = line("Address")
  const city = line("City")
  const postal = line("PostalCode", ["Postal code"])
  return `<p>${first} ${last}<br>${company}<br>${address}<br>${city} ${postal}</p>`
}

export function greetingLineHtml(fieldMap: FieldMap, fields: string[]) {
  const title = mappedFieldName(fieldMap, "Title", fields)
  const first = mappedFieldName(fieldMap, "FirstName", fields.length ? fields : ["FirstName", "Name"])
  const last = mappedFieldName(fieldMap, "LastName", fields)
  return `<p>Dear «${title}» «${first}» «${last}»,</p>`
}

export function insertMergeMark(name: string) {
  return { type: "text" as const, text: `«${name}»`, marks: [{ type: "mergeField", attrs: { name } }] }
}

export function findRecipientIndex(recipients: MergeRecord[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return -1
  }
  return recipients.findIndex((row) => Object.values(row).some((value) => value.toLowerCase().includes(needle)))
}

export function checkMergeErrors(html: string, fields: string[]) {
  const used = new Set<string>()
  const pattern = /«\s*([^»]+?)\s*»/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    used.add(match[1].trim())
  }
  const htmlFields = [...html.matchAll(/data-merge="([^"]+)"/g)].map((item) => item[1])
  for (const name of htmlFields) {
    used.add(name)
  }
  const available = new Set(fields.map((name) => name.toLowerCase()))
  const missing = [...used].filter((name) => !available.has(name.toLowerCase()) && name !== "MergeRecord#")
  const emptyColumns = fields.filter((name) => !html.includes(`«${name}»`) && !html.includes(`data-merge="${name}"`))
  return {
    used: [...used],
    missing,
    unused: emptyColumns,
    ok: missing.length === 0,
  }
}

export function labelsTableHtml(recipients: MergeRecord[], columns = 2) {
  if (recipients.length === 0) {
    return ""
  }
  const cells = recipients.map((row) => {
    const lines = [
      row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Name || row.FirstName || "",
      row.Company,
      row.Address,
      [row.City, row.PostalCode || row["Postal code"]].filter(Boolean).join(" "),
      row.Email,
    ]
      .filter(Boolean)
      .map(escapeHtml)
    return `<td><p>${lines.join("<br>") || "&nbsp;"}</p></td>`
  })
  while (cells.length % columns !== 0) {
    cells.push("<td><p>&nbsp;</p></td>")
  }
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += columns) {
    rows.push(`<tr>${cells.slice(i, i + columns).join("")}</tr>`)
  }
  return `<table>${rows.join("")}</table>`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
