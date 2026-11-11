/**
 * The number each page shows in its PAGE fields, as Word counts them: a section whose page numbers start at a number
 * (Format Page Numbers > Start at, `w:pgNumType/@w:start`) restarts there on its first page; one that does not goes on
 * from the page before. Each section writes its numbers in its own format (`@w:fmt`).
 */

/** How a section numbers its pages: its first page's number (null: go on from the previous page) and the format. */
export type PageNumbering = { start: number | null; format: string }

/** The number formats the Format Page Numbers window offers, as Word's `w:fmt` values, with how each one looks. */
export const PAGE_NUMBER_FORMATS: { value: string; label: string }[] = [
  { value: "decimal", label: "1, 2, 3, …" },
  { value: "numberInDash", label: "- 1 -, - 2 -, - 3 -, …" },
  { value: "lowerLetter", label: "a, b, c, …" },
  { value: "upperLetter", label: "A, B, C, …" },
  { value: "lowerRoman", label: "i, ii, iii, …" },
  { value: "upperRoman", label: "I, II, III, …" },
]

function roman(value: number) {
  const digits: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ]
  let left = value
  let out = ""
  for (const [size, text] of digits) {
    while (left >= size) {
      out += text
      left -= size
    }
  }
  return out
}

/** Word's letters: a … z, then aa … zz, then aaa (the letter repeated, not a, b, … aa, ab). */
function letters(value: number) {
  const letter = String.fromCharCode(97 + ((value - 1) % 26))
  return letter.repeat(Math.floor((value - 1) / 26) + 1)
}

/** `value` written in the page number format `format`; Word writes 0 and negatives as decimals in every format. */
export function formatPageNumber(value: number, format: string) {
  if (value < 1) {
    return String(value)
  }
  switch (format) {
    case "lowerRoman":
      return roman(value)
    case "upperRoman":
      return roman(value).toUpperCase()
    case "lowerLetter":
      return letters(value)
    case "upperLetter":
      return letters(value).toUpperCase()
    case "numberInDash":
      return `- ${value} -`
    default:
      return String(value)
  }
}

/**
 * The number each of `count` pages shows: `sections[page]` is how the page's section numbers its pages and
 * `starts[page]` whether the page is its section's first. The first page starts at 1 unless its section says.
 */
export function pageNumberLabels(count: number, sections: PageNumbering[], starts: boolean[]): string[] {
  const labels: string[] = []
  let number = 0
  for (let page = 0; page < count; page += 1) {
    const numbering = sections[page] ?? sections[sections.length - 1] ?? { start: null, format: "decimal" }
    const first = page === 0 || starts[page] === true
    number = first && numbering.start !== null ? numbering.start : number + 1
    labels.push(formatPageNumber(number, numbering.format))
  }
  return labels
}

/**
 * The page numbers of a laid-out document: `keys[page]` is the key of the section before the last the page is in (""
 * for the document's own last section, numbered by `setup`) and `starts[page]` whether it is that section's first.
 */
export function sectionPageLabels(
  count: number,
  keys: string[],
  starts: boolean[],
  sections: { key: string; pageNumberStart?: number | null; pageNumberFormat?: string }[],
  setup: { pageNumberStart: number | null; pageNumberFormat: string },
): string[] {
  const numbering = Array.from({ length: count }, (_, page) => {
    const key = keys[page] ?? ""
    const section = key ? sections.find((item) => item.key === key) : undefined
    return section
      ? { start: section.pageNumberStart ?? null, format: section.pageNumberFormat ?? "decimal" }
      : { start: setup.pageNumberStart, format: setup.pageNumberFormat }
  })
  return pageNumberLabels(count, numbering, starts)
}
