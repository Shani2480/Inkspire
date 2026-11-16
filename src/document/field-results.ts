/**
 * Results for the fields the Field dialog inserts that are not captions or cross-references: document information
 * (AUTHOR, TITLE, NUMPAGES…), dates (CREATEDATE, SAVEDATE…), user information and a few others (QUOTE, SYMBOL,
 * MERGEFIELD). Word's general switches are applied after: \* Upper/Lower/FirstCap/Caps, the number formats (\* roman,
 * \* CardText…), \# numeric pictures and \@ date pictures. Fields the app has no data for return null and keep the
 * result they have.
 */

import { formatPicture } from "@/document/field-date"
import { parseInstruction, type FieldInstruction } from "@/document/field-instructions"

/** What a field result may read. Counts are functions, so a document without such fields never counts its words. */
export type FieldInfo = {
  now: Date
  locale?: string
  props: {
    title: string
    subject: string
    keywords: string
    comments: string
    author: string
    company: string
    category: string
    createdAt: string
    savedAt: string | null
    printedAt: string | null
    editingMinutes: number
  }
  fileName: string
  path: string | null
  user: { name: string; initials: string; address: string }
  pages: () => number
  words: () => number
  characters: () => number
  /** The page label at a position ("iv", "3"). */
  pageAt: (pos: number) => string | null
  section: (pos: number) => { number: number; pages: number }
  /** STYLEREF: the text of the nearest paragraph in that style, above the field (or below when there is none). */
  styleText: (style: string, pos: number) => string | null
}

const DATE_FIELDS = new Set(["DATE", "TIME", "CREATEDATE", "SAVEDATE", "PRINTDATE"])

/** Fields the app works out a result for (here, or as captions, cross-references and citations). */
const COMPUTED = new Set([
  ...DATE_FIELDS,
  ..."EDITTIME AUTHOR LASTSAVEDBY TITLE SUBJECT KEYWORDS COMMENTS DOCPROPERTY FILENAME NUMPAGES NUMWORDS NUMCHARS".split(" "),
  ..."PAGE SECTION SECTIONPAGES TEMPLATE USERNAME USERINITIALS USERADDRESS QUOTE SYMBOL STYLEREF MERGEFIELD".split(" "),
  ..."MACROBUTTON GOTOBUTTON FILLIN ASK INFO SEQ REF PAGEREF CITATION XE TC TA RD".split(" "),
])

/** Whether an empty result is the field's real result (an AUTHOR with no author) rather than one not worked out. */
export function isComputedField(instr: string) {
  return COMPUTED.has(parseInstruction(instr).kind)
}

/** A field's own value, before the general switches; null for a field this module does not compute. */
function rawResult(
  parsed: FieldInstruction,
  instr: string,
  info: FieldInfo,
  pos: number,
): string | number | Date | { char: string } | null {
  const props = info.props
  const kind = parsed.kind === "INFO" ? parsed.argument.toUpperCase() : parsed.kind
  // A "New name:" argument (AUTHOR "Pat") sets the property in Word; the field shows it.
  const given = parsed.kind === "INFO" ? "" : parsed.argument
  switch (kind) {
    case "DATE":
    case "TIME":
      return info.now
    case "CREATEDATE":
      return dateOf(props.createdAt)
    case "SAVEDATE":
      return dateOf(props.savedAt)
    case "PRINTDATE":
      return dateOf(props.printedAt)
    case "EDITTIME":
      return props.editingMinutes
    case "AUTHOR":
      return given || props.author
    case "LASTSAVEDBY":
      return props.author
    case "TITLE":
      return given || props.title
    case "SUBJECT":
      return given || props.subject
    case "KEYWORDS":
      return given || props.keywords
    case "COMMENTS":
      return given || props.comments
    case "DOCPROPERTY": {
      const name = parsed.argument.toLowerCase()
      const map: Record<string, string> = {
        title: props.title,
        subject: props.subject,
        author: props.author,
        keywords: props.keywords,
        comments: props.comments,
        company: props.company,
        category: props.category,
      }
      return name in map ? map[name]! : null
    }
    case "FILENAME": {
      if (parsed.switches.has("p") && info.path) {
        return info.path
      }
      return info.fileName
    }
    case "NUMPAGES":
      return info.pages()
    case "NUMWORDS":
      return info.words()
    case "NUMCHARS":
      return info.characters()
    case "PAGE": {
      const label = info.pageAt(pos)
      return label === null ? null : /^\d+$/.test(label) ? Number(label) : label
    }
    case "SECTION":
      return info.section(pos).number
    case "SECTIONPAGES":
      return info.section(pos).pages
    case "TEMPLATE":
      return "Normal.dotm"
    case "USERNAME":
      return given || info.user.name
    case "USERINITIALS":
      return given || info.user.initials
    case "USERADDRESS":
      return given || info.user.address
    case "QUOTE":
      // An unquoted whole number is a character code in Word (QUOTE 65 is "A"; 12 would break the page).
      if (/^\d+$/.test(parsed.argument) && !/^\s*QUOTE\s+"/i.test(instr)) {
        const code = Number(parsed.argument)
        return code >= 32 ? { char: String.fromCodePoint(code) } : null
      }
      return parsed.argument
    case "SYMBOL": {
      const code = /^0x/i.test(parsed.argument) ? parseInt(parsed.argument, 16) : Number(parsed.argument)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : null
    }
    case "STYLEREF":
      return parsed.argument ? (info.styleText(parsed.argument, pos) ?? "Error! No text of specified style in document.") : null
    case "MERGEFIELD":
      // Without a data source Word shows the field's name in chevrons.
      return parsed.argument ? `«${parsed.argument}»` : null
    case "MACROBUTTON":
    case "GOTOBUTTON": {
      // The display text is everything after the macro name or destination.
      const rest = instr.trim().replace(/^\S+\s+(?:"[^"]*"|\S+)\s*/, "")
      return rest.replace(/\\\*\s*MERGEFORMAT/i, "").trim()
    }
    case "FILLIN":
    case "ASK":
      return parsed.switches.get("d") ?? ""
    default:
      return null
  }
}

function dateOf(value: string | null) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The result a non-app field shows, with its general switches applied; null when the app cannot compute it. */
export function infoFieldResult(instr: string, info: FieldInfo, pos: number): string | null {
  const parsed = parseInstruction(instr)
  const raw = rawResult(parsed, instr, info, pos)
  if (raw === null) {
    return null
  }
  const kind = parsed.kind === "INFO" ? parsed.argument.toUpperCase() : parsed.kind
  let text: string
  if (typeof raw === "object" && "char" in raw) {
    text = raw.char
  } else if (raw instanceof Date) {
    const picture = parsed.switches.get("@")
    text = picture ? formatPicture(raw, picture, info.locale) : defaultDate(kind, raw, info.locale)
  } else if (typeof raw === "number") {
    text = applyNumberSwitches(raw, parsed, instr)
  } else {
    // Numeric text (QUOTE 123) takes the number formats too, as in Word.
    text = /^-?\d+(\.\d+)?$/.test(raw.trim()) ? applyNumberSwitches(Number(raw), parsed, instr) : raw
  }
  return applyTextFormats(text, instr)
}

function defaultDate(kind: string, date: Date, locale?: string) {
  if (kind === "TIME") {
    return formatPicture(date, "h:mm AM/PM", locale)
  }
  if (DATE_FIELDS.has(kind) && kind !== "DATE") {
    // CREATEDATE, SAVEDATE and PRINTDATE show the date and time by default, as Word does.
    return formatPicture(date, "M/d/yyyy h:mm:ss AM/PM", locale)
  }
  return formatPicture(date, "M/d/yyyy", locale)
}

const NUMBER_FORMATS = new Set(["arabic", "roman", "alphabetic", "ordinal", "cardtext", "ordtext", "hex", "dollartext"])

function applyNumberSwitches(value: number, parsed: FieldInstruction, instr: string) {
  const picture = parsed.switches.get("#")
  if (picture) {
    return numericPicture(value, picture)
  }
  // Several \* may be given (\* roman \* MERGEFORMAT): the number format is the one that names one.
  const format = formatSwitches(instr).find((name) => NUMBER_FORMATS.has(name.toLowerCase()))
  return format ? formatNumber(value, format) : String(value)
}

/** Every `\* name` in the instruction (several may be given: `\* roman \* Upper`). */
function formatSwitches(instr: string) {
  return [...instr.matchAll(/\\\*\s*(\w+)/g)].map((match) => match[1]!)
}

/** Word's text formats: Upper, Lower, FirstCap (first letter of the result), Caps (each word). */
export function applyTextFormats(text: string, instr: string) {
  let out = text
  for (const format of formatSwitches(instr)) {
    switch (format.toLowerCase()) {
      case "upper":
        out = out.toUpperCase()
        break
      case "lower":
        out = out.toLowerCase()
        break
      case "firstcap":
        out = out.charAt(0).toUpperCase() + out.slice(1)
        break
      case "caps":
        out = out.replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())
        break
    }
  }
  return out
}

/** Word's number formats (`\* roman`, `\* ALPHABETIC`, `\* Ordinal`, `\* CardText`…); unknown ones leave it as is. */
export function formatNumber(value: number, format: string) {
  const whole = Math.trunc(value)
  switch (format) {
    case "roman":
    case "ROMAN": {
      const text = roman(whole)
      return format === "ROMAN" ? text.toUpperCase() : text
    }
    case "alphabetic":
    case "ALPHABETIC": {
      const letter = whole >= 1 ? String.fromCharCode(97 + ((whole - 1) % 26)).repeat(Math.floor((whole - 1) / 26) + 1) : ""
      return format === "ALPHABETIC" ? letter.toUpperCase() : letter
    }
    case "Ordinal":
    case "ordinal":
      return `${whole}${ordinalSuffix(whole)}`
    case "CardText":
    case "cardtext":
      return cardinal(whole)
    case "OrdText":
    case "ordtext":
      return ordinalText(whole)
    case "Hex":
    case "hex":
      return whole.toString(16).toUpperCase()
    case "DollarText":
    case "dollartext": {
      const cents = Math.round((value - whole) * 100)
      return `${cardinal(whole)} and ${String(cents).padStart(2, "0")}/100`
    }
    default:
      return String(value)
  }
}

function roman(value: number) {
  if (value < 1 || value > 3999) {
    return String(value)
  }
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ]
  let out = ""
  let rest = value
  for (const [amount, text] of table) {
    while (rest >= amount) {
      out += text
      rest -= amount
    }
  }
  return out
}

function ordinalSuffix(value: number) {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) {
    return "th"
  }
  return ["th", "st", "nd", "rd"][value % 10] ?? "th"
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

/** A number in words, as Word's CardText writes it: lower case, hyphenated tens ("one hundred twenty-three"). */
export function cardinal(value: number): string {
  if (value < 0) {
    return `minus ${cardinal(-value)}`
  }
  if (value < 20) {
    return ONES[value]!
  }
  if (value < 100) {
    return TENS[Math.floor(value / 10)]! + (value % 10 ? `-${ONES[value % 10]}` : "")
  }
  for (const [size, name] of [[1_000_000_000, "billion"], [1_000_000, "million"], [1000, "thousand"], [100, "hundred"]] as const) {
    if (value >= size) {
      const rest = value % size
      return `${cardinal(Math.floor(value / size))} ${name}${rest ? ` ${cardinal(rest)}` : ""}`
    }
  }
  return String(value)
}

const ORDINAL_WORDS: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth",
}

/** A number as an ordinal in words ("twenty-first"), as Word's OrdText writes it. */
export function ordinalText(value: number) {
  const words = cardinal(value)
  return words.replace(/(\w+)$/, (last: string) => {
    if (ORDINAL_WORDS[last]) {
      return ORDINAL_WORDS[last]!
    }
    if (last.endsWith("y")) {
      return `${last.slice(0, -1)}ieth`
    }
    return `${last}th`
  })
}

/**
 * Word's numeric picture (`\# "#,##0.00"`): 0 a digit always shown, # a digit shown when there is one, `,` groups,
 * `.` the decimal point, % and currency or other text kept; a second section after `;` is used for negatives.
 */
export function numericPicture(value: number, picture: string) {
  const [positive, negative] = picture.split(";")
  const pattern = value < 0 && negative !== undefined ? negative : positive!
  const sign = value < 0 && negative === undefined ? "-" : ""
  const percent = pattern.includes("%")
  const amount = Math.abs(value) * (percent ? 100 : 1)
  const spec = /[#0][#0,]*(?:\.[#0]+)?|\.[#0]+/.exec(pattern)?.[0] ?? "0"
  const [intSpec, decSpec = ""] = spec.split(".")
  const decimals = decSpec.length
  const fixed = amount.toFixed(decimals)
  let [intPart, decPart = ""] = fixed.split(".")
  const minInt = (intSpec!.match(/0/g) ?? []).length
  intPart = intPart!.padStart(minInt, "0")
  if (intPart === "0" && minInt === 0) {
    intPart = ""
  }
  // A # place with no digit shows as a space in Word ("$#,##0.00" makes 12 "$  12.00").
  const places = (intSpec!.match(/[#0]/g) ?? []).length
  const blanks = Math.max(0, places - intPart.length)
  if (intSpec!.includes(",")) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }
  intPart = " ".repeat(blanks) + intPart
  // Trailing # decimals drop their zeros.
  const optional = (decSpec.match(/#+$/)?.[0] ?? "").length
  for (let i = 0; i < optional && decPart.endsWith("0"); i += 1) {
    decPart = decPart.slice(0, -1)
  }
  const number = decPart ? `${intPart}.${decPart}` : intPart
  return sign + pattern.replace(spec, number)
}
