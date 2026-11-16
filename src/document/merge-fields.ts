import { parseInstruction } from "@/document/field-instructions"
import type { MergeRecord } from "@/document/merge-sources"
import { evaluateIf } from "@/editor/formula"

/**
 * Mail merge field results, as Word works them out: MERGEFIELD (with its \b text before and \f text after), the
 * Address Block and Greeting Line formats, MERGEREC and MERGESEQ, NEXT, NEXTIF and SKIPIF, and IF comparing merge
 * fields. Checked against Word's own merge in the VM (see docs/changes.md, U25).
 */

/** Word's address fields, as Match Fields lists them; the Address Block and Greeting Line read these. */
export const ADDRESS_FIELDS = [
  "Courtesy Title",
  "First Name",
  "Middle Name",
  "Last Name",
  "Suffix",
  "Nickname",
  "Job Title",
  "Company",
  "Address 1",
  "Address 2",
  "City",
  "State",
  "Postal Code",
  "Country or Region",
  "Business Phone",
  "Home Phone",
  "E-mail Address",
  "Department",
] as const

export type AddressField = (typeof ADDRESS_FIELDS)[number]

/** Each address field's column in the recipient list; null when nothing matches it. */
export type FieldMap = Record<AddressField, string | null>

/** The column names, Word's and Outlook's and common ones, that Match Fields takes for each address field. */
const ALIASES: Record<AddressField, string[]> = {
  "Courtesy Title": ["courtesy title", "title", "salutation", "honorific", "prefix"],
  "First Name": ["first name", "firstname", "first", "given name", "forename"],
  "Middle Name": ["middle name", "middle"],
  "Last Name": ["last name", "lastname", "last", "surname", "family name"],
  Suffix: ["suffix"],
  Nickname: ["nickname", "nick name"],
  "Job Title": ["job title", "position", "role"],
  Company: ["company", "company name", "organization", "organisation", "business"],
  "Address 1": ["address 1", "address line 1", "address", "street", "street address", "business street", "home street", "address1"],
  "Address 2": ["address 2", "address line 2", "address2"],
  City: ["city", "town", "business city", "home city"],
  State: ["state", "province", "region", "county", "business state", "home state"],
  "Postal Code": ["postal code", "zip", "zip code", "postcode", "post code", "business postal code", "home postal code"],
  "Country or Region": ["country or region", "country", "country/region", "business country/region", "home country/region"],
  "Business Phone": ["business phone", "work phone", "phone"],
  "Home Phone": ["home phone"],
  "E-mail Address": ["e-mail address", "email address", "email", "e-mail", "mail"],
  Department: ["department"],
}

function key(name: string) {
  return name.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
}

/** Match Fields' first guess: each address field against the list's columns by name. */
export function autoMatch(fields: string[]): FieldMap {
  const byKey = new Map(fields.map((field) => [key(field), field]))
  const map = {} as FieldMap
  for (const field of ADDRESS_FIELDS) {
    map[field] = ALIASES[field].map((alias) => byKey.get(alias)).find(Boolean) ?? null
  }
  return map
}

/** What the merge reads: the record being merged, and moving on to the next for NEXT. */
export type MergeContext = {
  /** The record now, and its number in the list (MERGEREC); null past the last one or with no list. */
  current: () => { record: MergeRecord; number: number } | null
  /** The record's place among those merged (MERGESEQ). */
  sequence: () => number
  next: () => void
  fieldMap: FieldMap
  /** Merging: past the last record (the rest of a sheet of labels) fields are blank, not their names. */
  blankWhenDone?: boolean
}

/** The name a merge field uses for a column: Word's, with spaces as underscores (MERGEFIELD First_Name). */
export function mergeFieldName(column: string) {
  return column.trim().replace(/\s+/g, "_")
}

/** A column's value by a merge field's name (spaces and underscores alike, any case); mapped names via Match Fields. */
export function fieldValue(record: MergeRecord, name: string, fieldMap: FieldMap, mapped = false) {
  const wanted = key(name)
  const address = ADDRESS_FIELDS.find((field) => key(field) === wanted)
  if (mapped && address) {
    const column = fieldMap[address]
    return column ? (record[column] ?? "") : ""
  }
  const column = Object.keys(record).find((field) => key(field) === wanted)
  if (column !== undefined) {
    return record[column] ?? ""
  }
  if (address) {
    const matched = fieldMap[address]
    return matched ? (record[matched] ?? "") : ""
  }
  return null
}

const TOKENS: Record<string, AddressField> = {
  TITLE0: "Courtesy Title",
  FIRST0: "First Name",
  MIDDLE0: "Middle Name",
  LAST0: "Last Name",
  SUFFIX0: "Suffix",
  NICK0: "Nickname",
  JOB0: "Job Title",
  COMPANY: "Company",
  STREET1: "Address 1",
  STREET2: "Address 2",
  CITY: "City",
  STATE: "State",
  POSTAL: "Postal Code",
  COUNTRY: "Country or Region",
}

/** Word's Address Block format without \f: name, company, two street lines, city state postal, country. */
export const DEFAULT_ADDRESS_FORMAT =
  "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>\n<<_COMPANY_\n>><<_STREET1_\n>><<_STREET2_\n>><<_CITY_>><<, _STATE_>><< _POSTAL_>><<\n_COUNTRY_>>"

export const DEFAULT_GREETING_FORMAT = "<<_BEFORE_ Dear >><<_FIRST0_>><<_AFTER_ ,>>"

type Piece = { literal: string } | { token: string; before: string; after: string }

/** A format's pieces: text outside << >> as is; inside, one _TOKEN_ with the text around it, shown with it. */
export function parseFormat(format: string): Piece[] {
  const pieces: Piece[] = []
  const pattern = /<<([\s\S]*?)>>/g
  let at = 0
  for (const match of format.matchAll(pattern)) {
    if (match.index > at) {
      pieces.push({ literal: format.slice(at, match.index) })
    }
    const inner = match[1] ?? ""
    const token = /_([A-Z0-9]+)_/.exec(inner)
    if (token) {
      pieces.push({
        token: token[1]!,
        before: inner.slice(0, token.index),
        after: inner.slice(token.index + token[0].length),
      })
    } else {
      pieces.push({ literal: inner })
    }
    at = match.index + match[0].length
  }
  if (at < format.length) {
    pieces.push({ literal: format.slice(at) })
  }
  return pieces
}

function addressValue(record: MergeRecord, fieldMap: FieldMap, field: AddressField) {
  // Only what Match Fields matched: Word leaves an address field out when nothing is matched to it.
  const column = fieldMap[field]
  return column ? (record[column] ?? "").trim() : ""
}

/** An Address Block's lines for a record: empty lines left out, the country only where \c says. */
export function addressBlock(instr: string, record: MergeRecord, fieldMap: FieldMap) {
  const parsed = parseInstruction(instr)
  const format = parsed.switches.get("f") ?? DEFAULT_ADDRESS_FORMAT
  const countryRule = parsed.switches.get("c") ?? "2"
  const excluded = (parsed.switches.get("e") ?? "").trim().toLowerCase()
  const value = (token: string) => {
    const field = TOKENS[token]
    if (!field) {
      return ""
    }
    const text = addressValue(record, fieldMap, field)
    if (field === "Country or Region") {
      if (countryRule === "0" || (countryRule === "2" && text.toLowerCase() === excluded)) {
        return ""
      }
    }
    return text
  }
  const pieces = parseFormat(format)
  // Word (VM, U25): with a suffix in the name format and no last name, the title goes too ("Kim", not "Dr. Kim");
  // without a suffix it stays ("Dr. Kim").
  const dropTitle =
    pieces.some((piece) => "token" in piece && piece.token === "SUFFIX0") && !addressValue(record, fieldMap, "Last Name")
  let text = ""
  for (const piece of pieces) {
    if ("literal" in piece) {
      text += piece.literal
    } else {
      const found = dropTitle && piece.token === "TITLE0" ? "" : value(piece.token)
      if (found) {
        text += piece.before + found + piece.after
      }
    }
  }
  return text
    .split(/\r?\n|\r/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

const NAME_TOKENS = new Set(["TITLE0", "FIRST0", "MIDDLE0", "LAST0", "SUFFIX0", "NICK0"])

/**
 * A Greeting Line for a record. When a name part the format uses is missing, Word greets by first and last name
 * instead ("Dear Sam Lee," for "Dear Mr. Lee," without a title), and with no name at all it uses \e ("Dear Sir or
 * Madam,").
 */
export function greetingLine(instr: string, record: MergeRecord, fieldMap: FieldMap) {
  const parsed = parseInstruction(instr)
  const pieces = parseFormat(parsed.switches.get("f") ?? DEFAULT_GREETING_FORMAT)
  const invalid = parsed.switches.get("e") ?? "Dear Sir or Madam,"
  const value = (token: string) => {
    const field = TOKENS[token]
    return field ? addressValue(record, fieldMap, field) : ""
  }
  const used = pieces.filter((piece): piece is Extract<Piece, { token: string }> => "token" in piece && NAME_TOKENS.has(piece.token))
  const whole = used.length > 0 && used.every((piece) => value(piece.token))
  const fallback = [value("FIRST0"), value("LAST0")].filter(Boolean).join(" ")
  if (!whole && !fallback) {
    return invalid
  }
  let text = ""
  let named = false
  for (const piece of pieces) {
    if ("literal" in piece) {
      text += piece.literal
    } else if (piece.token === "BEFORE" || piece.token === "AFTER") {
      text += piece.before.replace(/^ /, "") + piece.after.replace(/^ /, "")
    } else if (NAME_TOKENS.has(piece.token) && !whole) {
      if (!named) {
        text += fallback
        named = true
      }
    } else {
      const found = value(piece.token)
      if (found) {
        text += piece.before + found + piece.after
      }
    }
  }
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim()
}

/**
 * Fields inside a field's code ({ MERGEFIELD City }) replaced by their results, innermost first. Outside quotes a
 * result goes in quotes, so an empty one still counts as a value in a comparison.
 */
export function resolveNested(instr: string, result: (code: string) => string) {
  let text = instr
  for (let guard = 0; guard < 50; guard += 1) {
    const inner = /\{([^{}]*)\}/.exec(text)
    if (!inner) {
      break
    }
    const before = text.slice(0, inner.index)
    const quoted = (before.match(/"/g)?.length ?? 0) % 2 === 1
    const value = result(inner[1]!.trim())
    text = before + (quoted ? value : `"${value.replace(/"/g, "'")}"`) + text.slice(inner.index + inner[0].length)
  }
  return text
}

const OPERATORS = ["<=", ">=", "<>", "=", "<", ">"]

/** Word's comparison in IF, NEXTIF and SKIPIF: numbers as numbers, text with * and ? wildcards on the right. */
export function compareValues(left: string, operator: string, right: string) {
  const op = operator === "<>" ? "≠" : operator
  if ((operator === "=" || operator === "<>") && /[*?]/.test(right)) {
    const pattern = new RegExp(`^${right.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i")
    return pattern.test(left) === (operator === "=")
  }
  const numeric = /^[-+]?(?:\d+\.?\d*|\.\d+)$/
  if (!numeric.test(left.trim()) || !numeric.test(right.trim())) {
    if (operator === "=" || operator === "<>") {
      return (left.toLowerCase() === right.toLowerCase()) === (operator === "=")
    }
    const order = left.localeCompare(right, undefined, { sensitivity: "base" })
    return operator === "<" ? order < 0 : operator === ">" ? order > 0 : operator === "<=" ? order <= 0 : order >= 0
  }
  const result = evaluateIf(left.trim(), op, right.trim(), "1", "0")
  return result.ok && result.value === "1"
}

function tokens(text: string) {
  return [...text.trim().matchAll(/"([^"]*)"|(<=|>=|<>|=|<|>)|([^\s"<>=]+)/g)].map((match) => ({
    text: match[1] ?? match[2] ?? match[3] ?? "",
    operator: match[2] !== undefined,
  }))
}

/** A condition ("left op right"), as IF, NEXTIF and SKIPIF have it after their name. */
function condition(parts: { text: string; operator: boolean }[]) {
  const at = parts.findIndex((part) => part.operator && OPERATORS.includes(part.text))
  if (at < 1 || at + 1 >= parts.length) {
    return null
  }
  return {
    result: compareValues(parts[at - 1]!.text, parts[at]!.text, parts[at + 1]!.text),
    rest: parts.slice(at + 2),
  }
}

/** Merge field results with no recipient list or outside Preview Results: the field's name in chevrons, as Word. */
const PLACEHOLDERS: Record<string, string> = {
  ADDRESSBLOCK: "«AddressBlock»",
  GREETINGLINE: "«GreetingLine»",
  NEXT: "«Next Record»",
  NEXTIF: "«Next Record If…»",
  SKIPIF: "«Skip Record If…»",
  MERGEREC: "«Merge Record #»",
  MERGESEQ: "«Merge Sequence #»",
}

/** What happened to the record while working a field out: NEXTIF or SKIPIF whose condition held. */
export type MergeEffect = { skip?: boolean }

/**
 * A merge field's result for the record being merged, or Word's placeholder when there is none (no list, or not
 * previewing). NEXT moves `context` on; SKIPIF reports the record is skipped through `effect`.
 */
export function mergeFieldResult(instr: string, context: MergeContext | null, effect: MergeEffect = {}): string {
  const kind = parseInstruction(instr).kind
  const now = context?.current() ?? null
  if (!now && context?.blankWhenDone) {
    return ""
  }
  const fieldMap = context?.fieldMap ?? autoMatch([])
  const lookup = (code: string): string => {
    const inner = parseInstruction(code)
    if (inner.kind === "MERGEFIELD") {
      return mergeFieldResult(code, context, effect)
    }
    return inner.kind ? "" : code
  }
  switch (kind) {
    case "MERGEFIELD": {
      const parsed = parseInstruction(instr)
      const before = parsed.switches.get("b") ?? ""
      const after = parsed.switches.get("f") ?? ""
      if (!now) {
        return `${before}«${parsed.argument}»${after}`
      }
      const value = fieldValue(now.record, parsed.argument, fieldMap, parsed.switches.has("m")) ?? ""
      return value ? `${before}${value}${after}` : ""
    }
    case "ADDRESSBLOCK":
      return now ? addressBlock(instr, now.record, fieldMap) : PLACEHOLDERS[kind]!
    case "GREETINGLINE":
      return now ? greetingLine(instr, now.record, fieldMap) : PLACEHOLDERS[kind]!
    case "MERGEREC":
      return now ? String(now.number) : PLACEHOLDERS[kind]!
    case "MERGESEQ":
      return now && context ? String(context.sequence()) : PLACEHOLDERS[kind]!
    case "NEXT":
      if (!now || !context) {
        return PLACEHOLDERS[kind]!
      }
      context.next()
      return ""
    case "NEXTIF":
    case "SKIPIF": {
      if (!now || !context) {
        return PLACEHOLDERS[kind]!
      }
      const parts = tokens(resolveNested(instr, lookup)).slice(1)
      if (condition(parts)?.result) {
        if (kind === "NEXTIF") {
          context.next()
        } else {
          effect.skip = true
        }
      }
      return ""
    }
    case "IF": {
      const parts = tokens(resolveNested(instr, lookup)).slice(1)
      const test = condition(parts)
      if (!test) {
        return "Error! Missing test condition."
      }
      return (test.result ? test.rest[0]?.text : test.rest[1]?.text) ?? ""
    }
    default:
      return ""
  }
}
