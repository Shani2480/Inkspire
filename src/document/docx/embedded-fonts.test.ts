import { describe, expect, it } from "vitest"
import { deobfuscateFont, embeddedFonts } from "@/document/docx/embedded-fonts"
import { fontLineOf } from "@/document/docx/font-metrics"
import type { WordDocument } from "@/document/docx/model"
import { cssUrl, matchWebFont, parseCatalog, parseFaces, registeredWeight } from "@/document/web-fonts"

/** A font file with only the tables Word's line needs (head, hhea, OS/2), as Calibri's numbers are. */
function tinyFont({
  em = 2048,
  ascender = 1536,
  descender = -512,
  gap = 452,
  winAscent = 1950,
  winDescent = 550,
} = {}) {
  const tables = [
    ["head", 54],
    ["hhea", 36],
    ["OS/2", 96],
  ] as const
  const size = 12 + tables.length * 16 + tables.reduce((sum, [, length]) => sum + length, 0)
  const view = new DataView(new ArrayBuffer(size))
  view.setUint32(0, 0x00010000)
  view.setUint16(4, tables.length)
  let at = 12 + tables.length * 16
  const offsets: Record<string, number> = {}
  tables.forEach(([tag, length], index) => {
    const entry = 12 + index * 16
    ;[...tag].forEach((char, place) => view.setUint8(entry + place, char.charCodeAt(0)))
    view.setUint32(entry + 8, at)
    view.setUint32(entry + 12, length)
    offsets[tag] = at
    at += length
  })
  view.setUint16(offsets.head! + 18, em)
  view.setInt16(offsets.hhea! + 4, ascender)
  view.setInt16(offsets.hhea! + 6, descender)
  view.setInt16(offsets.hhea! + 8, gap)
  view.setUint16(offsets["OS/2"]! + 74, winAscent)
  view.setUint16(offsets["OS/2"]! + 76, winDescent)
  return new Uint8Array(view.buffer)
}

const KEY = "{0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0}"

/** Word's obfuscation is its own inverse: the same XOR. */
const obfuscate = (font: Uint8Array) => deobfuscateFont(font, KEY)!

function documentWith(parts: { name: string; data: Uint8Array }[], links: { id: string; target: string }[]) {
  return {
    preserved: {
      parts: parts.map((part) => ({ ...part, contentType: "" })),
      relationships: [
        {
          source: "/word/fontTable.xml",
          items: links.map((link) => ({ ...link, type: "font", targetMode: "Internal", partName: null })),
        },
      ],
    },
  } as unknown as WordDocument
}

describe("fonts embedded in a Word document (17.8.1)", () => {
  it("are read back from the font table and un-obfuscated with their keys", () => {
    const font = tinyFont()
    const table =
      '<w:fonts xmlns:w="w" xmlns:r="r"><w:font w:name="Test Sans">' +
      `<w:embedRegular r:id="rId1" w:fontKey="${KEY}"/><w:embedBold r:id="rId2" w:fontKey="${KEY}"/></w:font>` +
      '<w:font w:name="Plain"><w:panose1 w:val="0"/></w:font></w:fonts>'
    const doc = documentWith(
      [
        { name: "/word/fontTable.xml", data: new TextEncoder().encode(table) },
        { name: "/word/fonts/font1.odttf", data: obfuscate(font) },
        { name: "/word/fonts/font2.odttf", data: obfuscate(font) },
      ],
      [
        { id: "rId1", target: "fonts/font1.odttf" },
        { id: "rId2", target: "fonts/font2.odttf" },
      ],
    )
    const faces = embeddedFonts(doc)
    expect(faces.map((face) => [face.family, face.weight, face.style])).toEqual([
      ["Test Sans", "400", "normal"],
      ["Test Sans", "700", "normal"],
    ])
    expect([...faces[0]!.data]).toEqual([...font])
  })

  it("XOR the first 32 bytes with the key read from its end, and leave the rest", () => {
    const data = new Uint8Array(40)
    const out = deobfuscateFont(data, KEY)!
    // The GUID's last pair (F0) is the key's first byte; its first pair (0F) its sixteenth.
    expect(out[0]).toBe(0xf0)
    expect(out[15]).toBe(0x0f)
    expect(out[16]).toBe(0xf0)
    expect(out[32]).toBe(0)
    expect(deobfuscateFont(data, "not a key")).toBeNull()
  })

  it("give the line Word gives the font", () => {
    // Calibri's numbers: 1.22 lines, 0.27 below the baseline.
    expect(fontLineOf(tinyFont())).toEqual({ line: 1.221, descent: 0.269 })
    // Times New Roman's: its line gap is leading beyond the Windows ascent and descent.
    expect(
      fontLineOf(tinyFont({ ascender: 1825, descender: -443, gap: 87, winAscent: 1825, winDescent: 443 }))?.line,
    ).toBe(1.15)
    expect(fontLineOf(new Uint8Array(8))).toBeNull()
  })
})

describe("free fonts from Google Fonts", () => {
  const catalog = parseCatalog("Lato|13479|13479\nOpen Sans|345678|345678\nAbel|4|")

  it("match a document's font by family, or by family and Word's weight word", () => {
    expect(matchWebFont("Lato", catalog)).toEqual({
      name: "Lato",
      family: "Lato",
      weight: 400,
      bold: true,
      italic: true,
    })
    expect(matchWebFont("Lato Light", catalog)).toMatchObject({ family: "Lato", weight: 300, bold: false })
    expect(matchWebFont("Open Sans SemiBold", catalog)).toMatchObject({ family: "Open Sans", weight: 600 })
    expect(matchWebFont("Abel", catalog)).toMatchObject({ bold: false, italic: false })
    expect(matchWebFont("Avenir LT Std 35 Light", catalog)).toBeNull()
  })

  it("ask for the styles a document needs, and register a named weight as its regular", () => {
    expect(cssUrl(matchWebFont("Open Sans", catalog)!)).toBe(
      "https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap",
    )
    const light = matchWebFont("Lato Light", catalog)!
    expect(cssUrl(light)).toContain("family=Lato:ital,wght@0,300;1,300")
    expect(registeredWeight(light, 300)).toBe(400)
  })

  it("read the faces of Google's style sheet, only from its font host", () => {
    const css =
      "/* latin */\n@font-face {\n  font-family: 'Lato';\n  font-style: italic;\n  font-weight: 700;\n" +
      "  src: url(https://fonts.gstatic.com/s/lato/v25/a.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n" +
      "@font-face { font-family: 'X'; src: url(https://elsewhere.example/x.woff2); }"
    expect(parseFaces(css)).toEqual([
      {
        url: "https://fonts.gstatic.com/s/lato/v25/a.woff2",
        style: "italic",
        weight: 700,
        unicodeRange: "U+0000-00FF",
      },
    ])
  })
})
