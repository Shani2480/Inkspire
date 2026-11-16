/**
 * Word's Field dialog (Insert > Quick Parts > Field…): its categories, every field in them with Word's one-line
 * description, the options its Field properties area shows, and the field-specific switches of Field options.
 * Taken from Word 365 from memory (no screenshot of the dialog is in the repo).
 */

export const FIELD_CATEGORIES = [
  "(All)",
  "Date and Time",
  "Document Automation",
  "Document Information",
  "Equations and Formulas",
  "Index and Tables",
  "Links and References",
  "Mail Merge",
  "Numbering",
  "User Information",
] as const

export type FieldCategory = Exclude<(typeof FIELD_CATEGORIES)[number], "(All)">

/** What the Field properties area asks for, turned into the field's argument or a general switch. */
export type FieldProperty =
  | { kind: "date" }
  | { kind: "text-format" }
  | { kind: "number-format" }
  | { kind: "text"; label: string; quoted?: boolean }
  | { kind: "property" }
  | { kind: "bookmark" }
  | { kind: "style" }
  | { kind: "info" }

/** A field-specific switch: a check box, with a value box when it takes one. */
export type FieldSwitch = { flag: string; label: string; value?: string }

export type FieldSpec = {
  name: string
  categories: FieldCategory[]
  description: string
  properties?: FieldProperty[]
  switches?: FieldSwitch[]
}

const textFormat: FieldProperty = { kind: "text-format" }
const numberFormat: FieldProperty = { kind: "number-format" }
const date: FieldProperty = { kind: "date" }

export const FIELDS: FieldSpec[] = [
  { name: "=", categories: ["Equations and Formulas"], description: "Calculate the result of an expression", properties: [{ kind: "text", label: "Formula:" }, numberFormat] },
  { name: "AddressBlock", categories: ["Mail Merge"], description: "Insert a mail merge address block" },
  { name: "Advance", categories: ["Equations and Formulas"], description: "Offset subsequent text within a line to the left, right, up, or down", switches: [{ flag: "\\d", label: "Down", value: "Points" }, { flag: "\\l", label: "Left", value: "Points" }, { flag: "\\r", label: "Right", value: "Points" }, { flag: "\\u", label: "Up", value: "Points" }, { flag: "\\x", label: "From the left margin", value: "Points" }, { flag: "\\y", label: "From the top", value: "Points" }] },
  { name: "Ask", categories: ["Mail Merge"], description: "Prompt the user to assign text to a bookmark", properties: [{ kind: "text", label: "Bookmark name:" }, { kind: "text", label: "Prompt:", quoted: true }], switches: [{ flag: "\\d", label: "Default response to prompt", value: "Text" }, { flag: "\\o", label: "Prompt before merging each record" }] },
  { name: "Author", categories: ["Document Information"], description: "The name of the document's author from the Document Properties", properties: [textFormat, { kind: "text", label: "New name:", quoted: true }] },
  { name: "AutoNum", categories: ["Numbering"], description: "Insert an automatic number", switches: [{ flag: "\\s", label: "Separator character", value: "Character" }] },
  { name: "AutoNumLgl", categories: ["Numbering"], description: "Insert an automatic number in legal format", switches: [{ flag: "\\e", label: "Display number without trailing period" }, { flag: "\\s", label: "Separator character", value: "Character" }] },
  { name: "AutoNumOut", categories: ["Numbering"], description: "Insert an automatic number in outline format" },
  { name: "AutoText", categories: ["Links and References"], description: "Insert an AutoText entry", properties: [{ kind: "text", label: "AutoText entry:" }] },
  { name: "AutoTextList", categories: ["Links and References"], description: "Insert text based on style", properties: [{ kind: "text", label: "Text to display:", quoted: true }], switches: [{ flag: "\\s", label: "Style name", value: "Style" }, { flag: "\\t", label: "ScreenTip text", value: "Text" }] },
  { name: "Bibliography", categories: ["Links and References"], description: "Insert the bibliography of the document's sources" },
  { name: "Citation", categories: ["Links and References"], description: "Insert a citation of a source", properties: [{ kind: "text", label: "Source tag:" }] },
  { name: "Comments", categories: ["Document Information"], description: "The comments from the Document Properties", properties: [textFormat, { kind: "text", label: "New comments:", quoted: true }] },
  { name: "Compare", categories: ["Document Automation", "Mail Merge"], description: "Compare two values and insert the result 1 if true, or 0 if false", properties: [{ kind: "text", label: "Comparison:" }] },
  { name: "CreateDate", categories: ["Date and Time"], description: "The date the document was created", properties: [date] },
  { name: "Database", categories: ["Mail Merge"], description: "Insert data from an external database" },
  { name: "Date", categories: ["Date and Time"], description: "Today's date", properties: [date], switches: [{ flag: "\\l", label: "Use the date format last used by Insert Date and Time" }, { flag: "\\h", label: "Use the Hijri/Lunar calendar" }, { flag: "\\s", label: "Use the Saka Era calendar" }] },
  { name: "DocProperty", categories: ["Document Information"], description: "Insert the value of the property chosen in Options", properties: [{ kind: "property" }, textFormat] },
  { name: "DocVariable", categories: ["Document Automation"], description: "Insert the value of the document variable", properties: [{ kind: "text", label: "Name:" }, textFormat] },
  { name: "EditTime", categories: ["Date and Time"], description: "The total document editing time", properties: [numberFormat] },
  { name: "Eq", categories: ["Equations and Formulas"], description: "Create a mathematical equation", properties: [{ kind: "text", label: "Equation:" }] },
  { name: "FileName", categories: ["Document Information"], description: "The document's name and location", properties: [textFormat], switches: [{ flag: "\\p", label: "Add path to filename" }] },
  { name: "FileSize", categories: ["Document Information"], description: "The size on disk of the active document", properties: [numberFormat], switches: [{ flag: "\\k", label: "Display file size in kilobytes" }, { flag: "\\m", label: "Display file size in megabytes" }] },
  { name: "Fill-in", categories: ["Mail Merge"], description: "Prompt the user for text to insert in the document", properties: [{ kind: "text", label: "Prompt:", quoted: true }], switches: [{ flag: "\\d", label: "Default response to prompt", value: "Text" }, { flag: "\\o", label: "Prompt before merging each record" }] },
  { name: "GoToButton", categories: ["Document Automation"], description: "Insert a jump command", properties: [{ kind: "text", label: "Destination:" }, { kind: "text", label: "Display text:" }] },
  { name: "GreetingLine", categories: ["Mail Merge"], description: "Insert a mail merge greeting line" },
  { name: "Hyperlink", categories: ["Links and References"], description: "Open and jump to the specified file", properties: [{ kind: "text", label: "Address:", quoted: true }], switches: [{ flag: "\\l", label: "Location in the file", value: "Text" }, { flag: "\\o", label: "ScreenTip text", value: "Text" }, { flag: "\\t", label: "Target frame", value: "Text" }, { flag: "\\n", label: "Open in a new window" }] },
  { name: "If", categories: ["Document Automation", "Mail Merge"], description: "Evaluate arguments conditionally", properties: [{ kind: "text", label: "Expression:" }] },
  { name: "IncludePicture", categories: ["Links and References"], description: "Insert a picture from a file", properties: [{ kind: "text", label: "Filename or URL:", quoted: true }], switches: [{ flag: "\\d", label: "Data not stored with document" }] },
  { name: "IncludeText", categories: ["Links and References"], description: "Insert text from a file", properties: [{ kind: "text", label: "Filename or URL:", quoted: true }], switches: [{ flag: "\\!", label: "Prevent fields in the included text from updating" }] },
  { name: "Index", categories: ["Index and Tables"], description: "Create an index" },
  { name: "Info", categories: ["Document Information"], description: "Data from Document Properties", properties: [{ kind: "info" }, textFormat] },
  { name: "Keywords", categories: ["Document Information"], description: "The keywords from the Document Properties", properties: [textFormat, { kind: "text", label: "New keywords:", quoted: true }] },
  { name: "LastSavedBy", categories: ["Document Information"], description: "Name of user who last saved the document", properties: [textFormat] },
  { name: "Link", categories: ["Links and References"], description: "Insert part of a file using OLE", properties: [{ kind: "text", label: "Class, file and item:" }] },
  { name: "ListNum", categories: ["Numbering"], description: "Insert an element in a list", switches: [{ flag: "\\l", label: "Level in the list", value: "Level" }, { flag: "\\s", label: "Start-at value", value: "Number" }] },
  { name: "MacroButton", categories: ["Document Automation"], description: "Run a macro", properties: [{ kind: "text", label: "Macro name:" }, { kind: "text", label: "Display text:" }] },
  { name: "MergeField", categories: ["Mail Merge"], description: "Insert a mail merge field", properties: [{ kind: "text", label: "Field name:" }, textFormat], switches: [{ flag: "\\b", label: "Text to be inserted before", value: "Text" }, { flag: "\\f", label: "Text to be inserted after", value: "Text" }, { flag: "\\m", label: "Mapped field" }, { flag: "\\v", label: "Vertical formatting" }] },
  { name: "MergeRec", categories: ["Mail Merge"], description: "The number of the current merge record", properties: [numberFormat] },
  { name: "MergeSeq", categories: ["Mail Merge"], description: "The number of records merged so far", properties: [numberFormat] },
  { name: "Next", categories: ["Mail Merge"], description: "Go to the next record in a mail merge" },
  { name: "NextIf", categories: ["Mail Merge"], description: "Conditionally go to the next record in a mail merge", properties: [{ kind: "text", label: "Comparison:" }] },
  { name: "NoteRef", categories: ["Links and References"], description: "Insert the number of a footnote or endnote", properties: [{ kind: "bookmark" }, textFormat], switches: [{ flag: "\\f", label: "Insert the reference mark with the footnote's formatting" }, { flag: "\\h", label: "Insert hyperlink to bookmark" }, { flag: "\\p", label: "Insert relative position" }] },
  { name: "NumChars", categories: ["Document Information"], description: "The number of characters in the document", properties: [numberFormat] },
  { name: "NumPages", categories: ["Document Information"], description: "The number of pages in the document", properties: [textFormat, numberFormat] },
  { name: "NumWords", categories: ["Document Information"], description: "The number of words in the document", properties: [numberFormat] },
  { name: "Page", categories: ["Numbering"], description: "Insert the number of the current page", properties: [textFormat] },
  { name: "PageRef", categories: ["Links and References"], description: "Insert the number of the page containing the specified bookmark", properties: [{ kind: "bookmark" }, textFormat], switches: [{ flag: "\\h", label: "Insert hyperlink to bookmark" }, { flag: "\\p", label: "Insert relative position" }] },
  { name: "Print", categories: ["Document Automation"], description: "Send a command to the printer", properties: [{ kind: "text", label: "Printer instructions:", quoted: true }] },
  { name: "PrintDate", categories: ["Date and Time"], description: "The date the document was last printed", properties: [date] },
  { name: "Quote", categories: ["Links and References"], description: "Insert literal text", properties: [{ kind: "text", label: "Text:", quoted: true }, textFormat] },
  { name: "RD", categories: ["Index and Tables"], description: "Create an index, table of contents, or table of figures with multiple documents", properties: [{ kind: "text", label: "Filename or URL:", quoted: true }] },
  { name: "Ref", categories: ["Links and References"], description: "Insert the text of the specified bookmark", properties: [{ kind: "bookmark" }, textFormat], switches: [{ flag: "\\f", label: "Increment footnote, endnote, or comment number" }, { flag: "\\h", label: "Insert hyperlink to bookmark" }, { flag: "\\n", label: "Insert paragraph number" }, { flag: "\\p", label: "Insert relative position" }, { flag: "\\r", label: "Insert paragraph number in relative context" }, { flag: "\\w", label: "Insert paragraph number in full context" }] },
  { name: "RevNum", categories: ["Numbering"], description: "The number of times the document has been saved", properties: [numberFormat] },
  { name: "SaveDate", categories: ["Date and Time"], description: "The date the document was last saved", properties: [date] },
  { name: "Section", categories: ["Numbering"], description: "Insert the number of the current section", properties: [textFormat] },
  { name: "SectionPages", categories: ["Numbering"], description: "Insert the total number of pages in the section", properties: [textFormat] },
  { name: "Seq", categories: ["Numbering"], description: "Insert an automatic sequence number", properties: [{ kind: "text", label: "Identifier:" }, textFormat], switches: [{ flag: "\\c", label: "Insert the nearest preceding sequence number" }, { flag: "\\h", label: "Hide field result" }, { flag: "\\n", label: "Insert the next sequence number" }, { flag: "\\r", label: "Reset the sequence number", value: "Number" }, { flag: "\\s", label: "Reset the number at a heading level", value: "Level" }] },
  { name: "Set", categories: ["Mail Merge"], description: "Assign new text to a bookmark", properties: [{ kind: "text", label: "Bookmark name:" }, { kind: "text", label: "Value:", quoted: true }] },
  { name: "SkipIf", categories: ["Mail Merge"], description: "Conditionally skip a record in a mail merge", properties: [{ kind: "text", label: "Comparison:" }] },
  { name: "StyleRef", categories: ["Links and References"], description: "Insert the text from a like-style paragraph", properties: [{ kind: "style" }, textFormat], switches: [{ flag: "\\l", label: "Search from bottom of page to top" }, { flag: "\\n", label: "Insert paragraph number" }, { flag: "\\p", label: "Insert relative position" }] },
  { name: "Subject", categories: ["Document Information"], description: "The document's subject from the Document Properties", properties: [textFormat, { kind: "text", label: "New subject:", quoted: true }] },
  { name: "Symbol", categories: ["Equations and Formulas"], description: "Insert a symbol character", properties: [{ kind: "text", label: "Character code:" }], switches: [{ flag: "\\f", label: "Font name", value: "Font" }, { flag: "\\s", label: "Font size", value: "Points" }, { flag: "\\u", label: "Unicode character" }, { flag: "\\h", label: "Do not change line spacing" }] },
  { name: "TA", categories: ["Index and Tables"], description: "Mark a table of authorities entry", properties: [{ kind: "text", label: "Long citation:", quoted: true }], switches: [{ flag: "\\s", label: "Short citation", value: "Text" }, { flag: "\\c", label: "Category", value: "Number" }, { flag: "\\b", label: "Bold page number" }, { flag: "\\i", label: "Italic page number" }] },
  { name: "TC", categories: ["Index and Tables"], description: "Mark a table of contents entry", properties: [{ kind: "text", label: "Text entry:", quoted: true }], switches: [{ flag: "\\l", label: "Outline level", value: "Level" }, { flag: "\\n", label: "Suppress page number" }, { flag: "\\f", label: "Table identifier", value: "Identifier" }] },
  { name: "Template", categories: ["Document Information"], description: "The name of the document's template", properties: [textFormat], switches: [{ flag: "\\p", label: "Add path to filename" }] },
  { name: "Time", categories: ["Date and Time"], description: "The current time", properties: [date] },
  { name: "Title", categories: ["Document Information"], description: "The document's title from the Document Properties", properties: [textFormat, { kind: "text", label: "New title:", quoted: true }] },
  { name: "TOA", categories: ["Index and Tables"], description: "Create a table of authorities", switches: [{ flag: "\\c", label: "Category", value: "Number" }, { flag: "\\h", label: "Include the category heading" }, { flag: "\\p", label: "Replace five or more page references with passim" }] },
  { name: "TOC", categories: ["Index and Tables"], description: "Create a table of contents", switches: [{ flag: "\\o", label: "Heading levels", value: "Levels" }, { flag: "\\h", label: "Make entries hyperlinks" }, { flag: "\\n", label: "Omit page numbers", value: "Levels" }, { flag: "\\z", label: "Hide tab leader and page numbers in Web layout view" }, { flag: "\\u", label: "Use outline levels" }, { flag: "\\c", label: "Table of figures caption label", value: "Label" }] },
  { name: "UserAddress", categories: ["User Information"], description: "Your postal address from Office Personal Options", properties: [textFormat, { kind: "text", label: "New address:", quoted: true }] },
  { name: "UserInitials", categories: ["User Information"], description: "Your initials from Office Personal Options", properties: [textFormat, { kind: "text", label: "New initials:", quoted: true }] },
  { name: "UserName", categories: ["User Information"], description: "Your name from Office Personal Options", properties: [textFormat, { kind: "text", label: "New name:", quoted: true }] },
  { name: "XE", categories: ["Index and Tables"], description: "Mark an index entry", properties: [{ kind: "text", label: "Text:", quoted: true }], switches: [{ flag: "\\b", label: "Bold page number" }, { flag: "\\i", label: "Italic page number" }, { flag: "\\t", label: "Text in place of a page number", value: "Text" }, { flag: "\\f", label: "Entry type", value: "Type" }] },
]

/** Word's Format list for text and numbers (`\* …`). */
export const TEXT_FORMATS: [string, string][] = [
  ["(none)", ""],
  ["Uppercase", "Upper"],
  ["Lowercase", "Lower"],
  ["First capital", "FirstCap"],
  ["Title case", "Caps"],
]

export const NUMBER_FORMATS: [string, string][] = [
  ["(none)", ""],
  ["1, 2, 3, …", "Arabic"],
  ["a, b, c, …", "alphabetic"],
  ["A, B, C, …", "ALPHABETIC"],
  ["i, ii, iii, …", "roman"],
  ["I, II, III, …", "ROMAN"],
  ["1st, 2nd, 3rd …", "Ordinal"],
  ["One, Two, Three …", "CardText"],
  ["First, Second, Third …", "OrdText"],
  ["hex …", "Hex"],
  ["Dollar Text …", "DollarText"],
]

/** Word's Numeric format list (`\# …`). */
export const NUMERIC_PICTURES = ["0", "#,##0", "#,##0.00", "$#,##0.00;($#,##0.00)", "0%", "0.00%"]

/** Word's Date formats list (`\@ …`). */
export const DATE_PICTURES = [
  "M/d/yyyy",
  "dddd, MMMM d, yyyy",
  "MMMM d, yyyy",
  "M/d/yy",
  "yyyy-MM-dd",
  "d-MMM-yy",
  "M.d.yyyy",
  "MMM. d, yy",
  "d MMMM yyyy",
  "MMMM yy",
  "MMM-yy",
  "M/d/yyyy h:mm am/pm",
  "M/d/yyyy h:mm:ss am/pm",
  "h:mm am/pm",
  "h:mm:ss am/pm",
  "HH:mm",
  "HH:mm:ss",
]

/** DocProperty's Property list: the properties this app keeps (Word lists more, which it has no model for). */
export const DOC_PROPERTIES = ["Author", "Category", "Comments", "Company", "Keywords", "Subject", "Title"]

/** Info's Info categories list (`INFO Author`). */
export const INFO_TYPES = [
  "Author",
  "Comments",
  "CreateDate",
  "EditTime",
  "FileName",
  "FileSize",
  "Keywords",
  "LastSavedBy",
  "NumChars",
  "NumPages",
  "NumWords",
  "PrintDate",
  "RevNum",
  "SaveDate",
  "Subject",
  "Template",
  "Title",
]

/** The field's name as Word writes it in the instruction: upper case (Fill-in is FILLIN). */
export function fieldKeyword(name: string) {
  return name === "=" ? "=" : name.replace(/-/g, "").toUpperCase()
}

/** Builds the instruction from the dialog's choices: the field, its arguments, then switches as Word orders them. */
export function buildInstruction(
  spec: FieldSpec,
  choices: { args: string[]; datePicture?: string; textFormat?: string; numberPicture?: string },
  switches: { flag: string; value?: string }[],
  preserve: boolean,
) {
  const parts = [fieldKeyword(spec.name)]
  const quotedArgs = (spec.properties ?? []).filter((item) => item.kind !== "date" && item.kind !== "text-format" && item.kind !== "number-format")
  quotedArgs.forEach((property, index) => {
    const value = (choices.args[index] ?? "").trim()
    if (!value) {
      return
    }
    const quote = (property.kind === "text" && property.quoted) || /\s/.test(value)
    parts.push(quote ? `"${value.replace(/"/g, '\\"')}"` : value)
  })
  if (choices.datePicture) {
    parts.push(`\\@ "${choices.datePicture}"`)
  }
  if (choices.numberPicture) {
    parts.push(`\\# "${choices.numberPicture}"`)
  }
  if (choices.textFormat) {
    parts.push(`\\* ${choices.textFormat}`)
  }
  for (const item of switches) {
    parts.push(item.value !== undefined && item.value !== "" ? `${item.flag} ${/\s/.test(item.value) ? `"${item.value}"` : item.value}` : item.flag)
  }
  if (preserve) {
    parts.push("\\* MERGEFORMAT")
  }
  return parts.join(" ")
}
