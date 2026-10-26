import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome, packDocument, unpackDocument } from "@/document/header"
import { pageBorderInset, pageBorderStyle, showsPageBorder, type PageSetup } from "@/document/page-setup"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const NAME = "f20_word_shapes.docx"

/** A dashed red box on every page but the first, 24 pt in from the edge, as Word's Page Border tab writes it. */
const WORD_BORDERS =
  '<w:pgBorders w:display="notFirstPage" w:offsetFrom="page">' +
  '<w:top w:val="dashed" w:sz="12" w:space="24" w:color="C00000"/>' +
  '<w:left w:val="dashed" w:sz="12" w:space="24" w:color="C00000"/>' +
  '<w:bottom w:val="dashed" w:sz="12" w:space="24" w:color="C00000"/>' +
  '<w:right w:val="dashed" w:sz="12" w:space="24" w:color="C00000"/>' +
  "</w:pgBorders>"
/** Word's Art border, which the page border panel does not draw. */
const ART_BORDERS =
  '<w:pgBorders w:offsetFrom="page"><w:top w:val="apples" w:sz="20" w:space="24"/>' +
  '<w:left w:val="apples" w:sz="20" w:space="24"/><w:bottom w:val="apples" w:sz="20" w:space="24"/>' +
  '<w:right w:val="apples" w:sz="20" w:space="24"/></w:pgBorders>'

async function withBorders(borders: string) {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
  const part = findPart(pkg, "/word/document.xml")!
  part.data = new TextEncoder().encode(decodeXml(part.data).replace("<w:lnNumType", `${borders}<w:lnNumType`))
  return openDocxBytes(await writePackage(pkg), NAME)
}

async function saved(borders: string, change: Partial<PageSetup>) {
  const opened = borders
    ? await withBorders(borders)
    : await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
  const result = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "paragraph" }] },
    chrome: { ...opened.view.chrome, pageSetup: { ...opened.view.chrome.pageSetup, ...change } },
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  const pkg = await openPackage(result.bytes, "edited.docx")
  return decodeXml(findPart(pkg, "/word/document.xml")!.data)
}

describe("page borders in .docx (22.4)", () => {
  it("reads w:pgBorders into the page setup", async () => {
    const setup = (await withBorders(WORD_BORDERS)).view.chrome.pageSetup
    expect(setup).toMatchObject({
      border: "single",
      borderLine: "dashed",
      borderColor: "#c00000",
      borderWidth: 0.53,
      borderDisplay: "not-first",
      borderFrom: "page",
      borderSpace: [24, 24, 24, 24],
    })
  })

  it("keeps Word's element while the setup is as it was, art included", async () => {
    expect(await saved(WORD_BORDERS, {})).toContain(WORD_BORDERS)
    expect(await saved(ART_BORDERS, {})).toContain(ART_BORDERS)
  })

  it("writes the setup's border, in schema order, and drops it when it is None", async () => {
    const xml = await saved("", {
      border: "double",
      borderColor: "#1c1c1c",
      borderWidth: 0.5,
      borderDisplay: "first",
      borderFrom: "text",
      borderSpace: [1, 4, 1, 4],
    })
    expect(xml).toContain(
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
        '<w:pgBorders w:display="firstPage">' +
        '<w:top w:val="double" w:sz="11" w:space="1" w:color="auto"/>' +
        '<w:left w:val="double" w:sz="11" w:space="4" w:color="auto"/>' +
        '<w:bottom w:val="double" w:sz="11" w:space="1" w:color="auto"/>' +
        '<w:right w:val="double" w:sz="11" w:space="4" w:color="auto"/>' +
        "</w:pgBorders><w:lnNumType",
    )
    expect(await saved(WORD_BORDERS, { border: "none" })).not.toContain("pgBorders")
    expect(await saved(WORD_BORDERS, { borderLine: "dotted" })).toContain(
      '<w:pgBorders w:display="notFirstPage" w:offsetFrom="page"><w:top w:val="dotted" w:sz="12" w:space="24" w:color="C00000"/>',
    )
  })
})

describe("a page border on some sides (22.4)", () => {
  const TOP_AND_BOTTOM =
    '<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="4" w:space="24" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="24" w:color="auto"/></w:pgBorders>'

  it("reads the sides Word drew, and writes only the sides the setup has", async () => {
    expect((await withBorders(TOP_AND_BOTTOM)).view.chrome.pageSetup.borderSides).toEqual(["top", "bottom"])
    const xml = await saved("", { border: "single", borderSides: ["left", "right"] })
    const borders = /<w:pgBorders.*<\/w:pgBorders>/.exec(xml)?.[0] ?? ""
    expect(borders).toContain("<w:left ")
    expect(borders).toContain("<w:right ")
    expect(borders).not.toContain("<w:top ")
    expect(borders).not.toContain("<w:bottom ")
  })

  it("draws no line on the sides left out, and keeps them in the app's own file", () => {
    const setup = { ...emptyChrome().pageSetup, border: "single" as const, borderSides: ["top" as const] }
    expect(pageBorderStyle(setup)).toMatchObject({
      borderRightStyle: "none",
      borderBottomStyle: "none",
      borderLeftStyle: "none",
    })
    expect(pageBorderStyle(setup)).not.toHaveProperty("borderTopStyle")
    const chrome = { ...emptyChrome(), pageSetup: setup }
    expect(unpackDocument(packDocument("<p>x</p>", chrome)).pageSetup.borderSides).toEqual(["top"])
  })
})

describe("page border Options check boxes (22.4)", () => {
  async function settingsXml(change: Partial<PageSetup>) {
    const opened = await withBorders(WORD_BORDERS)
    const result = await saveDocxBytes({
      json: { type: "doc", content: [{ type: "paragraph" }] },
      chrome: { ...opened.view.chrome, pageSetup: { ...opened.view.chrome.pageSetup, ...change } },
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const pkg = await openPackage(result.bytes, "edited.docx")
    return {
      settings: decodeXml(findPart(pkg, "/word/settings.xml")!.data),
      document: decodeXml(findPart(pkg, "/word/document.xml")!.data),
      reopened: (await openDocxBytes(result.bytes, "edited.docx")).view.chrome.pageSetup,
    }
  }

  it("opens on Word's defaults: in front, round the header and footer, not aligned", async () => {
    expect((await withBorders(WORD_BORDERS)).view.chrome.pageSetup).toMatchObject({
      borderInFront: true,
      borderSurroundHeader: true,
      borderSurroundFooter: true,
      borderAlign: false,
    })
  })

  it("writes the check boxes to settings.xml and w:zOrder, and opens them again", async () => {
    const { settings, document, reopened } = await settingsXml({
      borderInFront: false,
      borderSurroundHeader: false,
      borderSurroundFooter: false,
      borderAlign: true,
    })
    expect(settings).toMatch(
      /<w:alignBordersAndEdges\/><w:bordersDoNotSurroundHeader\/><w:bordersDoNotSurroundFooter\/>/,
    )
    expect(document).toContain('<w:pgBorders w:zOrder="back"')
    expect(reopened).toMatchObject({
      borderInFront: false,
      borderSurroundHeader: false,
      borderSurroundFooter: false,
      borderAlign: true,
    })
    expect((await settingsXml({})).settings).not.toContain("bordersDoNotSurround")
  })

  it("reaches round the header and footer when measured from the text, unless told not to", () => {
    const setup = { ...emptyChrome().pageSetup, border: "single" as const, borderFrom: "text" as const }
    expect(pageBorderInset({ ...setup, borderSpace: [1, 4, 1, 4] }).top).toBe(
      "calc(var(--header-from-edge, 12.5mm) - 1pt - 0.5mm)",
    )
    expect(pageBorderInset({ ...setup, borderSpace: [1, 4, 1, 4], borderSurroundFooter: false }).bottom).toBe(
      "calc(var(--page-margin-bottom, 24mm) - 1pt - 0.5mm)",
    )
  })

  it("keeps them in the app's own file", () => {
    const chrome = {
      ...emptyChrome(),
      pageSetup: { ...emptyChrome().pageSetup, border: "single" as const, borderInFront: false, borderAlign: true },
    }
    expect(unpackDocument(packDocument("<p>x</p>", chrome)).pageSetup).toMatchObject({
      borderInFront: false,
      borderAlign: true,
      borderSurroundHeader: true,
    })
  })
})

describe("page border placement (22.4)", () => {
  const setup = { ...emptyChrome().pageSetup, border: "single" as const }

  it("shows on the pages Apply to names", () => {
    expect([0, 1, 2].map((index) => showsPageBorder({ ...setup, borderDisplay: "first" }, index))).toEqual([
      true,
      false,
      false,
    ])
    expect([0, 1].map((index) => showsPageBorder({ ...setup, borderDisplay: "not-first" }, index))).toEqual([
      false,
      true,
    ])
    expect(showsPageBorder({ ...setup, border: "none" }, 0)).toBe(false)
  })

  it("stands in from the page edge, or out from the text past its line", () => {
    expect(pageBorderInset({ ...setup, borderFrom: "page", borderSpace: [24, 20, 24, 20] }).right).toBe("20pt")
    expect(pageBorderInset({ ...setup, borderFrom: "text", borderSpace: [1, 4, 1, 4], borderWidth: 0.5 }).left).toBe(
      "calc(var(--page-margin-left, 24mm) - 4pt - 0.5mm)",
    )
  })

  it("keeps its pages and distances in the app's own file, and an older file keeps the margins", () => {
    const chrome = {
      ...emptyChrome(),
      pageSetup: {
        ...setup,
        borderDisplay: "not-first" as const,
        borderFrom: "text" as const,
        borderSpace: [2, 3, 4, 5],
      },
    }
    expect(unpackDocument(packDocument("<p>x</p>", chrome)).pageSetup).toMatchObject({
      borderDisplay: "not-first",
      borderFrom: "text",
      borderSpace: [2, 3, 4, 5],
    })
    const older = packDocument("<p>x</p>", chrome).replace(/<!-- aiword-borderplace:[^>]*-->\n?/, "")
    expect(unpackDocument(older).pageSetup).toMatchObject({ borderFrom: "text", borderSpace: [0, 0, 0, 0] })
  })
})
