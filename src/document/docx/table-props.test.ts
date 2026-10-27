import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import {
  floatFromWord,
  floatToWord,
  marginsFromWord,
  marginsToWord,
  preferredFromWord,
  preferredToWord,
} from "@/document/docx/table-props-docx"
import {
  marginsValue,
  parseMargins,
  parsePreferredWidth,
  preferredWidthValue,
  presetAttrs,
  presetOf,
} from "@/editor/table-props"

const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] }

async function save(
  table: Record<string, unknown>,
  row: Record<string, unknown> = {},
  cell: Record<string, unknown> = {},
) {
  const json = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: table,
        content: [
          {
            type: "tableRow",
            attrs: row,
            content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, ...cell }, content: [paragraph] }],
          },
        ],
      },
    ],
  }
  const saved = await saveDocxBytes({ json, chrome: emptyChrome(), word: null, unchanged: false, fileName: "t.docx" })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("Table Properties values (22.10)", () => {
  it("reads and writes margins and preferred widths", () => {
    expect(parseMargins("0,0,0.19,0.19")).toEqual({ top: 0, bottom: 0, left: 0.19, right: 0.19 })
    expect(parseMargins("1,2")).toBeNull()
    expect(marginsValue({ top: 0.1, bottom: 0.2, left: 0.3, right: 0.4 })).toBe("0.1,0.2,0.3,0.4")
    expect(parsePreferredWidth("80%")).toEqual({ value: 80, unit: "pct" })
    expect(parsePreferredWidth("12.5cm")).toEqual({ value: 12.5, unit: "cm" })
    expect(parsePreferredWidth("0cm")).toBeNull()
    expect(preferredWidthValue({ value: 50, unit: "pct" })).toBe("50%")
  })

  it("keeps Word's exact value while the centimetres are unchanged", () => {
    const origin = { value: 2501, type: "dxa" as const }
    expect(preferredToWord(preferredFromWord(origin), origin)).toBe(origin)
    expect(preferredToWord("5cm", origin)).toEqual({ value: 2835, type: "dxa" })
    expect(preferredToWord("80%", undefined)).toEqual({ value: 4000, type: "pct" })
    expect(preferredToWord(null, { value: 0, type: "auto" })).toEqual({ value: 0, type: "auto" })
    expect(preferredFromWord({ value: 5000, type: "pct" })).toBe("100%")
    const margins = { left: { value: 108, type: "dxa" as const }, right: { value: 108, type: "dxa" as const } }
    expect(marginsFromWord(margins)).toBe("0,0,0.19,0.19")
    expect(marginsToWord(marginsFromWord(margins), margins)).toBe(margins)
  })

  it("saves the table's indent, spacing, margins and layout, the row's break and the cell's options, and opens them again", async () => {
    const { bytes, xml } = await save(
      { indent: 1, cellSpacing: 0.1, margins: "0.1,0.1,0.2,0.2", autoResize: false, prefWidth: "80%" },
      { cantSplit: true, height: 38, heightRule: "exact" },
      { cellMargins: "0.3,0.3,0.4,0.4", noWrap: true, fitText: true },
    )
    expect(xml).toContain('<w:tblW w:w="4000" w:type="pct"/>')
    expect(xml).toContain('<w:tblCellSpacing w:w="57" w:type="dxa"/>')
    expect(xml).toContain('<w:tblInd w:w="567" w:type="dxa"/>')
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>')
    expect(xml).toContain("<w:tblCellMar>")
    expect(xml).toMatch(/<w:trPr><w:cantSplit\/><w:trHeight [^>]*w:hRule="exact"/)
    expect(xml).toContain("<w:noWrap/>")
    expect(xml).toContain("<w:tcMar>")
    expect(xml).toContain("<w:tcFitText/>")
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-pref-width="80%"')
    expect(view.html).toContain('data-indent="1"')
    expect(view.html).toContain('data-cell-spacing="0.1"')
    expect(view.html).toContain('data-auto-resize="0"')
    expect(view.html).toContain('data-margins="0.1,0.1,0.2,0.2"')
    expect(view.html).toContain('data-cant-split="1"')
    expect(view.html).toContain('data-height-rule="exact"')
    expect(view.html).toContain('data-cell-margins="0.3,0.3,0.4,0.4"')
    expect(view.html).toContain('data-no-wrap="1"')
    expect(view.html).toContain('data-fit-text="1"')
  })

  it("writes none of them for a plain table", async () => {
    const { xml } = await save({})
    for (const name of ["tblInd", "tblCellSpacing", "tblCellMar", "cantSplit", "noWrap", "tcMar", "tcFitText"]) {
      expect(xml).not.toContain(`<w:${name}`)
    }
  })

  it("reads Word's w:tblpPr with its defaults, and keeps it unchanged while the editor shows the same", () => {
    const position = { leftFromText: 180, rightFromText: 180, vertAnchor: "text" as const, tblpY: 1 }
    const float = floatFromWord(position)!
    expect(float).toMatchObject({ h: 0, hFrom: "column", v: 0, vFrom: "paragraph", overlap: true })
    expect(float.gaps).toEqual({ top: 0, bottom: 0, left: 0.32, right: 0.32 })
    expect(floatToWord(float, { position }).position).toBe(position)
    // Down from the margin when Word leaves the anchor out.
    expect(floatFromWord({ tblpXSpec: "center", tblpYSpec: "bottom" })).toMatchObject({
      h: "center",
      v: "bottom",
      vFrom: "margin",
    })
    expect(floatToWord({ ...float, h: "right", overlap: false }, { position })).toEqual({
      position: {
        leftFromText: 181,
        rightFromText: 181,
        vertAnchor: "text",
        horzAnchor: "text",
        tblpXSpec: "right",
        tblpY: 0,
      },
      overlap: "never",
    })
    expect(floatToWord(null, { position })).toEqual({})
  })

  it("saves a table text wraps around as w:tblpPr first in w:tblPr, and opens it again", async () => {
    const float = {
      h: 2,
      hFrom: "margin",
      v: "top",
      vFrom: "page",
      gaps: { top: 0.2, bottom: 0, left: 0.32, right: 0.32 },
      overlap: false,
    }
    const { bytes, xml } = await save({ float })
    expect(xml).toContain(
      '<w:tblPr><w:tblpPr w:leftFromText="181" w:rightFromText="181" w:topFromText="113" w:vertAnchor="page" w:horzAnchor="margin" w:tblpX="1134" w:tblpYSpec="top"/><w:tblOverlap w:val="never"/>',
    )
    const { view } = await openDocxBytes(bytes, "t.docx")
    const attribute = /data-float="([^"]+)"/.exec(view.html)?.[1]?.replaceAll("&quot;", '"')
    expect(JSON.parse(attribute!)).toEqual(float)
  })
})

describe("the Narrow / Normal / Wide cell margins in .docx", () => {
  it("saves a preset as the table's default cell margins and opens it as the same preset", async () => {
    for (const pad of ["narrow", "wide"] as const) {
      const { bytes, xml } = await save(presetAttrs(pad))
      expect(xml).toContain("<w:tblCellMar>")
      const { view } = await openDocxBytes(bytes, "t.docx")
      const margins = /data-margins="([^"]+)"/.exec(view.html)?.[1]
      expect(presetOf({ margins })).toBe(pad)
    }
  })

  it("saves the margins of a table that only carries the preset (older documents, templates)", async () => {
    const { xml } = await save({ cellPad: "wide" })
    expect(xml).toContain('<w:left w:w="210" w:type="dxa"/>')
  })

  it("leaves Normal out, as Word does, and a preset replaces margins the table came with", async () => {
    const { xml } = await save(presetAttrs("normal"))
    expect(xml).not.toContain("<w:tblCellMar>")
    expect(presetAttrs("normal").margins).toBeNull()
    expect(presetOf({ cellPad: "wide", margins: "0.1,0.1,0.5,0.5" })).toBe("normal")
  })
})
