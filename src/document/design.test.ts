import { describe, expect, it } from "vitest"
import { saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { documentStyleSheet, themeColor } from "@/document/docx/word-styles"
import { decodeXml } from "@/document/docx/xml"
import { designStyleSheet } from "@/document/docx/session"
import {
  builtInTheme,
  colorSchemeNamed,
  colorSetup,
  currentTheme,
  fontSchemeNamed,
  fontSetup,
  styleSetCatalog,
  STYLE_SETS,
  themeFromThmx,
  themeOfXml,
  themeSetup,
  themedXml,
  thmxEntries,
} from "@/document/design"
import { emptyChrome } from "@/document/header"
import { DEFAULT_PAGE_SETUP, type PageSetup } from "@/document/page-setup"
import { OFFICE_THEME_XML, WORD_COLOR_SCHEMES, WORD_FONT_SCHEMES, WORD_THEMES } from "@/document/word-design-data"
import type { JsonNode } from "@/document/docx/project"

const JSON_DOC: JsonNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Report" }] },
    { type: "paragraph", content: [{ type: "text", text: "Body text." }] },
  ],
}

async function save(setup: Partial<PageSetup>) {
  const chrome = emptyChrome()
  chrome.pageSetup = { ...DEFAULT_PAGE_SETUP, ...setup }
  const saved = await saveDocxBytes({ json: JSON_DOC, chrome, word: null, unchanged: false, fileName: "design.docx" })
  const pkg = await openPackage(saved.bytes, "design.docx")
  return { pkg, word: readDocument(pkg), saved }
}

describe("Word's design data", () => {
  it("has Word's themes, colour and font schemes", () => {
    expect(WORD_THEMES.map((theme) => theme.name)).toContain("Office")
    expect(WORD_THEMES.map((theme) => theme.name)).toContain("Facet")
    expect(colorSchemeNamed("Blue Warm")?.colors).toHaveLength(12)
    expect(fontSchemeNamed("Office")).toMatchObject({ major: "Aptos Display", minor: "Aptos" })
    expect(WORD_COLOR_SCHEMES.filter((scheme) => scheme.menu).length).toBeGreaterThan(20)
    expect(WORD_FONT_SCHEMES.length).toBeGreaterThan(20)
    expect(STYLE_SETS.map((set) => set.name)).toContain("Lines (Simple)")
  })

  it("draws theme colours as Word does: shade and tint move the luminance", () => {
    expect(themeColor("accent1", { accent1: "#4472c4" }, undefined, "BF")).toBe("#2f5496")
    expect(themeColor("text1", { dk1: "#000000" })).toBe("#000000")
    expect(themeColor("accent1", { accent1: "#4472c4" }, "99")).toBe("#8eaadb")
  })

  it("swaps a theme part's colours, fonts and names and keeps the rest", () => {
    const facet = builtInTheme("Facet")!
    const xml = themedXml(OFFICE_THEME_XML, facet)
    const read = themeOfXml(xml)
    expect(read).toEqual({ ...facet })
    expect(xml).toContain("<a:fmtScheme")
    expect(xml).toContain('script="Jpan"')
  })
})

describe("Design tab in a saved .docx", () => {
  it("writes a new document's theme part with the chosen colours and fonts", async () => {
    const blue = colorSchemeNamed("Blue")!
    const { pkg, word } = await save({
      ...colorSetup(blue),
      ...fontSetup(fontSchemeNamed("Georgia")!),
    })
    const part = findPart(pkg, "/word/theme/theme1.xml")
    expect(part).toBeTruthy()
    const theme = themeOfXml(decodeXml(part!.data))
    expect(theme.colorsName).toBe("Blue")
    expect(theme.colors).toEqual(blue.colors)
    expect(theme.major).toBe("Georgia")
    expect(relationshipsFor(pkg, "/word/document.xml").some((rel) => rel.target === "theme/theme1.xml")).toBe(true)
    // The headings follow the theme, as on the page.
    const heading = word.styles.styles.find((style) => style.id === "Heading1")!
    expect(heading.rPr.rFonts?.asciiTheme).toBe("majorHAnsi")
    expect(heading.rPr.colorTheme).toEqual({ name: "accent1", shade: "BF" })
  })

  it("writes a Style Set's styles and the Paragraph Spacing preset into styles.xml", async () => {
    const { pkg, word } = await save({ styleSet: "linessimple", spacing: "relaxed" })
    const xml = decodeXml(findPart(pkg, "/word/styles.xml")!.data)
    const set = styleSetCatalog("linessimple")!
    const heading = set.styles.find((style) => style.id === "Heading1")!
    // The set's own heading is written as the set has it.
    expect(word.styles.styles.find((style) => style.id === "Heading1")?.pPr.borders).toEqual(heading.pPr.borders)
    expect(word.styles.docDefaults.pPr.spacing).toMatchObject({ after: 120, line: 360, lineRule: "auto" })
    const normal = word.styles.styles.find((style) => style.id === "Normal")!
    expect(normal.pPr.spacing?.line ?? word.styles.docDefaults.pPr.spacing?.line).toBe(360)
    expect(xml).toContain('w:themeColor="accent1"')
  })

  it("changes an opened document's theme part in place", async () => {
    const first = await save({ ...themeSetup(builtInTheme("Office")!) })
    const chrome = emptyChrome()
    chrome.pageSetup = { ...DEFAULT_PAGE_SETUP, ...themeSetup(builtInTheme("Wisp")!) }
    const saved = await saveDocxBytes({
      json: JSON_DOC,
      chrome,
      word: first.word,
      unchanged: true,
      fileName: "design.docx",
    })
    const pkg = await openPackage(saved.bytes, "design.docx")
    const themes = pkg.parts.filter((part) => /theme\d*\.xml$/.test(part.name))
    expect(themes).toHaveLength(1)
    expect(themeOfXml(decodeXml(themes[0]!.data)).name).toBe("Wisp")
    expect(currentTheme(DEFAULT_PAGE_SETUP, readDocument(pkg)).fontsName).toBe("Wisp")
  })

  it("draws the page from the Style Set and the theme", async () => {
    const setup = { ...DEFAULT_PAGE_SETUP, styleSet: "linessimple", ...colorSetup(colorSchemeNamed("Red")!) }
    const css = designStyleSheet(null, setup)!
    const red = colorSchemeNamed("Red")!.colors[4]!
    expect(css).toContain(themeColor("accent1", { accent1: red }, undefined, "BF"))
    // A document made in the app without a Style Set is left to the app's stylesheet.
    expect(designStyleSheet(null, { ...DEFAULT_PAGE_SETUP, spacing: "open" })).toBeNull()
    const { word } = await save({})
    expect(designStyleSheet(word, DEFAULT_PAGE_SETUP)).toBe(documentStyleSheet(word))
  })

  it("draws theme fills and lines from the theme after saving and opening again", async () => {
    // Shaded keeps Office's hex next to w:themeFill; Word draws the theme's colour, and so must the app.
    const id = STYLE_SETS.find((set) => set.name === "Shaded")!.id
    const red = colorSchemeNamed("Red")!.colors[4]!
    const { word, pkg } = await save({ styleSet: id, ...colorSetup(colorSchemeNamed("Red")!) })
    const heading = word.styles.styles.find((style) => style.id === "Heading1")!
    expect(heading.pPr.shading?.fillTheme).toEqual({ name: "accent1" })
    expect(heading.pPr.borders?.top?.colorTheme).toEqual({ name: "accent1" })
    const css = documentStyleSheet(word)
    expect(css).toContain(`background-color: ${red}`)
    expect(css).toContain(`solid ${red}`)
    const tinted = word.styles.styles.find((style) => style.id === "Heading2")!.pPr.shading!.fillTheme!
    expect(css).toContain(`background-color: ${themeColor("accent1", { accent1: red }, tinted.tint)}`)
    // The references are written back as read.
    expect(decodeXml(findPart(pkg, "/word/styles.xml")!.data)).toContain('w:themeFill="accent1"')
  })

  it("keeps a paragraph's and a cell's theme fill and line colour through a save", async () => {
    const { pkg } = await save({})
    const main = findPart(pkg, pkg.mainPartName)!
    const shd = '<w:shd w:val="clear" w:color="auto" w:fill="DEEAF6" w:themeFill="accent1" w:themeFillTint="33"/>'
    const line =
      '<w:bottom w:val="single" w:sz="4" w:space="1" w:color="2E74B5" w:themeColor="accent1" w:themeShade="BF"/>'
    main.data = new TextEncoder().encode(
      decodeXml(main.data).replace(
        "<w:body>",
        `<w:body><w:p><w:pPr><w:pBdr>${line}</w:pBdr>${shd}</w:pPr><w:r><w:t>a</w:t></w:r></w:p>` +
          `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>` +
          `<w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${shd}</w:tcPr><w:p/></w:tc></w:tr></w:tbl>`,
      ),
    )
    const word = readDocument(pkg)
    const xml = decodeXml(findPart(writeDocument(word), "/word/document.xml")!.data)
    expect(xml.split('w:themeFill="accent1" w:themeFillTint="33"')).toHaveLength(3)
    expect(xml).toContain('w:color="2E74B5" w:themeColor="accent1" w:themeShade="BF"')
  })

  it("saves a theme as a .thmx and reads it back", () => {
    const theme = { ...builtInTheme("Ion")!, name: "My Theme" }
    const entries = thmxEntries(theme)
    expect(entries.map((entry) => entry.name)).toContain("theme/theme/theme1.xml")
    expect(themeFromThmx(entries, "My Theme.thmx")).toEqual(theme)
  })
})
