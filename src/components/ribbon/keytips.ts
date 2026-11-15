/**
 * Word's KeyTips: the letters shown on the ribbon after Alt (or F10). Level one badges the File button, the tabs and
 * the Quick Access Toolbar; typing a tab's letters opens it and badges its commands. Word's own letters are used where
 * known (`TAB_KEYS`, `COMMAND_KEYS`, taken from Word 365 from memory: no screenshot of them is in the repo); every
 * other control gets letters of its own name. Keys on one level never start with another key of that level, so typing
 * stops at the first full match, as in Word.
 */

export const TAB_KEYS: Record<string, string> = {
  File: "F",
  Home: "H",
  Insert: "N",
  Draw: "JI",
  Design: "G",
  Layout: "P",
  References: "S",
  Mailings: "M",
  Review: "R",
  View: "W",
  Help: "Y2",
  "Table Design": "JT",
  "Table Layout": "JL",
  "Picture Format": "JP",
  "Shape Format": "JD",
  "Header & Footer": "JH",
  "Chart Design": "JC",
  "Chart Format": "JO",
  "SmartArt Design": "JS",
  "SmartArt Format": "JF",
  Equation: "JE",
  "3D Model": "JM",
  Outlining: "U",
}

/**
 * Word's command letters by tab, then by the control's name. "@Name" is a group's dialog launcher; `menu` sends the
 * key to a split button's arrow, as Word's key opens that menu (Paste, Font Color, Bullets…).
 */
export const COMMAND_KEYS: Record<string, Record<string, string | { key: string; menu: true }>> = {
  home: {
    Paste: { key: "V", menu: true },
    Cut: "X",
    Copy: "C",
    "Format Painter": "FP",
    "@Clipboard": "FO",
    Font: "FF",
    "Font size": "FS",
    "Grow Font": "FG",
    "Shrink Font": "FK",
    "Change Case": "7",
    "Clear All Formatting": "E",
    Bold: "1",
    Italic: "2",
    Underline: "3",
    Strikethrough: "4",
    Subscript: "5",
    Superscript: "6",
    "Text Effects and Typography": "FT",
    "Text Highlight Color": { key: "I", menu: true },
    "Font Color": { key: "FC", menu: true },
    "@Font": "FN",
    Bullets: { key: "U", menu: true },
    Numbering: { key: "N", menu: true },
    "Multilevel List": { key: "M", menu: true },
    "Decrease Indent": "AO",
    "Increase Indent": "AI",
    Sort: "SO",
    "Show/Hide ¶": "8",
    "Align Left": "AL",
    Center: "AC",
    "Align Right": "AR",
    Justify: "AJ",
    "Line and Paragraph Spacing": "K",
    Shading: "H",
    Borders: { key: "B", menu: true },
    "@Paragraph": "PG",
    "More styles": "L",
    "@Styles": "FY",
    Find: "FD",
    Replace: "R",
    Select: "SL",
  },
  insert: {
    "Cover Page": "V",
    "Blank Page": "NP",
    "Page Break": "B",
    Table: "T",
    Pictures: "P",
    Shapes: "SH",
    Icons: "Y",
    "3D Models": "3",
    SmartArt: "M",
    Chart: "C",
    Screenshot: "SC",
    Link: "I",
    Bookmark: "K",
    "Cross-reference": "RF",
    Comment: "L",
    Header: "H",
    Footer: "O",
    "Page Number": "NU",
    "Text Box": "X",
    "Quick Parts": "Q",
    WordArt: "W",
    "Drop Cap": "RC",
    "Signature Line": "G",
    "Date & Time": "D",
    Object: "J",
    Equation: "E",
    Symbol: "U",
  },
  design: {
    Themes: "TH",
    Colors: "TC",
    Fonts: "TF",
    "Paragraph Spacing": "PS",
    Effects: "TE",
    "Set as Default": "D",
    Watermark: "PW",
    "Page Color": "PC",
    "Page Borders": "PB",
  },
  layout: {
    Margins: "M",
    Orientation: "O",
    Size: "SZ",
    Columns: "J",
    Breaks: "B",
    "Line Numbers": "LN",
    Hyphenation: "H",
    "@Page Setup": "SP",
    "Indent Left": "IL",
    "Indent Right": "IR",
    "Spacing Before": "SB",
    "Spacing After": "SA",
    "@Paragraph": "PG",
    Position: "PO",
    "Wrap Text": "TW",
    "Bring Forward": "AF",
    "Send Backward": "AE",
    "Selection Pane": "AP",
    Align: "AA",
    Group: "GP",
    Rotate: "AY",
  },
  references: {
    "Table of Contents": "T",
    "Update Table": "U",
    "Add Text": "A",
    "Insert Footnote": "F",
    "Insert Endnote": "E",
    "Next Footnote": "O",
    "Show Notes": "H",
    "Insert Citation": "C",
    "Manage Sources": "M",
    Style: "L",
    Bibliography: "B",
    "Insert Caption": "P",
    "Insert Table of Figures": "G",
    "Cross-reference": "RF",
    "Mark Entry": "N",
    "Insert Index": "X",
    "Mark Citation": "I",
  },
  review: {
    "Word Count": "W",
    Thesaurus: "E",
    Translate: "L",
    Language: "U",
    "New Comment": "C",
    "Track Changes": "G",
    Accept: "A2",
    Reject: "J",
    Compare: "M",
    "Restrict Editing": "PE",
  },
  view: {
    "Read Mode": "F",
    "Print Layout": "P",
    "Web Layout": "L",
    Outline: "U",
    Draft: "E",
    Ruler: "R",
    Gridlines: "G",
    "Navigation Pane": "K",
    Zoom: "Q",
    "100%": "J",
    "One Page": "1",
    "Multiple Pages": "M",
    "Page Width": "I",
    "New Window": "N",
    "Arrange All": "A",
    Split: "S",
  },
}

/** A control as the KeyTips layer found it: its name, Word's letters if known, and whether it may be pressed. */
export type KeyTipTarget = { label: string; key?: string }

/** Whether `key` can join `taken` keeping the level prefix-free. */
function fits(key: string, taken: Iterable<string>) {
  for (const other of taken) {
    if (other.startsWith(key) || key.startsWith(other)) {
      return false
    }
  }
  return true
}

/** Letters of a name a generated key may use, most telling first: word initials, then the first word's letters. */
function candidates(label: string) {
  const words = label
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  const first = words[0] ?? "X"
  const out: string[] = []
  if (words.length > 1) {
    out.push(first[0] + words[1][0])
  }
  for (const letter of first.slice(1)) {
    out.push(first[0] + letter)
  }
  for (const word of words.slice(1)) {
    for (const letter of word) {
      out.push(first[0] + letter)
    }
  }
  // When the first letter is taken (a one-letter key), pairs that start later in the name, in order.
  const letters = words.join("")
  for (let i = 1; i < letters.length; i += 1) {
    for (let j = i + 1; j < letters.length; j += 1) {
      out.push(letters[i] + letters[j])
    }
  }
  return out
}

/**
 * Gives every target a key: its known one when that keeps the level prefix-free, else two letters of its name,
 * else a letter and a digit. Known keys are placed first so a generated one never takes them.
 */
export function assignKeys(targets: KeyTipTarget[]): string[] {
  const keys: (string | undefined)[] = targets.map(() => undefined)
  const taken = new Set<string>()
  targets.forEach((target, index) => {
    const key = target.key?.toUpperCase()
    if (key && !taken.has(key) && fits(key, taken)) {
      keys[index] = key
      taken.add(key)
    }
  })
  targets.forEach((target, index) => {
    if (keys[index]) {
      return
    }
    const pick =
      candidates(target.label).find((key) => fits(key, taken)) ??
      [..."QZXJVWYK0123456789"]
        .flatMap((a) => [..."123456789"].map((b) => a + b))
        .find((key) => fits(key, taken))
    keys[index] = pick ?? ""
    if (pick) {
      taken.add(pick)
    }
  })
  return keys as string[]
}

/** Word numbers the Quick Access Toolbar 1 to 9, then 09, 08… 01. */
export function quickAccessKey(index: number) {
  return index < 9 ? String(index + 1) : `0${Math.max(1, 18 - index)}`
}

/** What typing `typed` does on a level: the one key it completes, or whether any key still starts with it. */
export function matchKey(keys: string[], typed: string): { done: number } | { open: boolean } {
  const exact = keys.indexOf(typed)
  if (exact >= 0) {
    return { done: exact }
  }
  return { open: keys.some((key) => key.startsWith(typed)) }
}
