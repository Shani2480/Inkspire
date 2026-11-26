/**
 * A font's line as Word measures it, read from the font file (an embedded font): Word's single line is the font's
 * Windows ascent and descent (OS/2 usWinAscent, usWinDescent) and its external leading, the line gap left beyond
 * them (hhea), over its em. Calibri gives 1.22 and Times New Roman 1.15, as Word's lines are.
 */
export type FontLine = { line: number; descent: number }

function table(view: DataView, tag: string) {
  const count = view.getUint16(4)
  for (let index = 0; index < count; index += 1) {
    const at = 12 + index * 16
    const name = String.fromCharCode(...[0, 1, 2, 3].map((offset) => view.getUint8(at + offset)))
    if (name === tag) {
      return view.getUint32(at + 8)
    }
  }
  return undefined
}

export function fontLineOf(data: Uint8Array): FontLine | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const head = table(view, "head")
    const hhea = table(view, "hhea")
    const os2 = table(view, "OS/2")
    if (head === undefined || hhea === undefined || os2 === undefined) {
      return null
    }
    const em = view.getUint16(head + 18)
    const ascender = view.getInt16(hhea + 4)
    const descender = view.getInt16(hhea + 6)
    const gap = view.getInt16(hhea + 8)
    const winAscent = view.getUint16(os2 + 74)
    const winDescent = view.getUint16(os2 + 76)
    if (!em || !(winAscent + winDescent)) {
      return null
    }
    const leading = Math.max(0, gap - (winAscent + winDescent - (ascender - descender)))
    const round = (value: number) => Math.round(value * 1000) / 1000
    return { line: round((winAscent + winDescent + leading) / em), descent: round(winDescent / em) }
  } catch {
    return null
  }
}

/** Lines of fonts read from files (a document's embedded fonts), by lower-case name. */
export const fontLines = new Map<string, FontLine>()

/**
 * The family the open document's font table gives each font (`w:family`: roman, swiss, modern, script,
 * decorative), by lower-case name. Word draws a font it does not have in Cambria when its family is roman and in
 * Calibri otherwise (checked in Word 365: panose and the theme play no part).
 */
export const fontFamilies = new Map<string, string>()
