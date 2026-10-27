import { describe, expect, it } from "vitest"
import { chartExXml, readChartEx } from "@/document/docx/chartex-xml"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readZip, storedZip } from "@/document/docx/zip"
import { defaultChartSpec, serializeChartSpec, variantOf, type ChartSpec } from "@/editor/chart-spec"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

function encode(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return btoa(String.fromCharCode(...bytes))
}

function decode(data: string) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))))
}

function chartImage(spec: ChartSpec) {
  const figure = { type: "figure", attrs: { kind: "chart", chart: serializeChartSpec(spec), width: 480, height: 288 } }
  return {
    type: "image",
    attrs: { src: PNG, width: 480, height: 288, objectNode: encode({ ...figure, shown: [480, 288] }) },
  }
}

async function save(spec: ChartSpec) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content: [chartImage(spec)] },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "c.docx",
  })
  return saved.bytes
}

const data = (spec: ChartSpec) => ({ categories: spec.categories, series: spec.series.map((serie) => [serie.name, serie.values]), levels: spec.levels })

describe("Word's chartex charts (Histogram, Pareto, Waterfall, Funnel, Box & Whisker, Treemap, Sunburst)", () => {
  const ids = ["histogram", "pareto", "waterfall", "funnel", "box-whisker", "treemap", "sunburst"]

  it.each(ids)("writes %s as Word's chartex chart and reads back the same data and kind", (id) => {
    const spec = defaultChartSpec(id)
    const read = readChartEx(chartExXml(spec, "rId1"))!
    expect(variantOf(read)).toBe(id)
    expect(data(read)).toEqual(data(spec))
  })

  it("writes each kind's own layout: bins, the Pareto line on a percentage axis, a Waterfall's total, quartiles", () => {
    const histogram = chartExXml({ ...defaultChartSpec("histogram"), bins: { by: "count", count: 5, overflow: 20 } })
    expect(histogram).toContain('<cx:series layoutId="clusteredColumn">')
    expect(histogram).toContain('<cx:binning intervalClosed="r" overflow="20"><cx:binCount>5</cx:binCount></cx:binning>')
    expect(chartExXml({ ...defaultChartSpec("histogram"), bins: { by: "width", width: 2.5 } })).toContain(
      '<cx:binSize>2.5</cx:binSize>',
    )
    const pareto = chartExXml(defaultChartSpec("pareto"))
    expect(pareto).toContain("<cx:aggregation/>")
    expect(pareto).toContain('<cx:series layoutId="paretoLine" ownerIdx="0"><cx:axisId>2</cx:axisId></cx:series>')
    expect(pareto).toContain('<cx:units unit="percentage"/>')
    const spec = { ...defaultChartSpec("waterfall"), waterfallTotals: undefined }
    const waterfall = chartExXml(spec)
    // A chart from before Set as total: the total the app draws after the last point is a point of its own.
    const rows = spec.categories.length
    expect(waterfall).toContain(`<cx:pt idx="${rows}">Total</cx:pt>`)
    expect(waterfall).toContain(`<cx:subtotals><cx:idx val="${rows}"/></cx:subtotals>`)
    expect(chartExXml(defaultChartSpec("box-whisker"))).toContain('<cx:statistics quartileMethod="exclusive"/>')
    expect(chartExXml(defaultChartSpec("box-whisker"))).toContain(
      '<cx:visibility meanLine="0" meanMarker="1" nonoutliers="0" outliers="1"/>',
    )
    // Treemap levels: innermost first, the formula over the label columns by row.
    const treemap = chartExXml(defaultChartSpec("treemap"))
    expect(treemap).toMatch(/<cx:strDim type="cat"><cx:f dir="row">Sheet1!\$A\$2:\$C\$\d+<\/cx:f><cx:lvl ptCount="\d+"><cx:pt idx="0">Leaf 1</)
    expect(treemap).toContain('<cx:numDim type="size">')
  })

  it("writes and reads back Set as total, Box & Whisker's options and colours", () => {
    const waterfall = { ...defaultChartSpec("waterfall"), waterfallTotals: [2, 5] }
    waterfall.format = { ...waterfall.format, "point:1": { fill: "#123456" } }
    const xml = chartExXml(waterfall)
    expect(xml).toContain('<cx:subtotals><cx:idx val="2"/><cx:idx val="5"/></cx:subtotals>')
    // Each bar in the colour the app draws it: rises green, falls red, totals grey; a point's own colour over that.
    expect(xml).toContain('<cx:dataPt idx="0"><cx:spPr><a:solidFill><a:srgbClr val="2E7D32"/>')
    expect(xml).toContain('<cx:dataPt idx="1"><cx:spPr><a:solidFill><a:srgbClr val="123456"/>')
    expect(xml).toContain('<cx:dataPt idx="2"><cx:spPr><a:solidFill><a:srgbClr val="5F6B7A"/>')
    const read = readChartEx(xml)!
    expect(read.waterfallTotals).toEqual([2, 5])
    expect(read.categories).toEqual(waterfall.categories)
    // Only the colour that is not the app's own comes back.
    expect(Object.keys(read.format).filter((key) => key.startsWith("point:"))).toEqual(["point:1"])
    expect(read.format["point:1"]).toEqual({ fill: "#123456" })

    const box = {
      ...defaultChartSpec("box-whisker"),
      box: { meanLine: true, meanMarkers: false, innerPoints: true, outliers: false, quartiles: "inclusive" as const },
    }
    box.format = { ...box.format, "series:1": { fill: "#abcdef" } }
    const boxXml = chartExXml(box)
    expect(boxXml).toContain('<cx:visibility meanLine="1" meanMarker="0" nonoutliers="1" outliers="0"/>')
    expect(boxXml).toContain('<cx:statistics quartileMethod="inclusive"/>')
    const boxRead = readChartEx(boxXml)!
    expect(boxRead.box).toEqual(box.box)
    expect(boxRead.format["series:1"]).toEqual({ fill: "#abcdef" })
    expect(readChartEx(chartExXml(defaultChartSpec("box-whisker")))!.box).toBeUndefined()
    // A hidden series is left out, and the colours after it move up with the series.
    const hidden = { ...box, series: box.series.map((serie, index) => ({ ...serie, hidden: index === 0 })) }
    expect(readChartEx(chartExXml(hidden))!.format["series:0"]).toEqual({ fill: "#abcdef" })
  })

  it("reads each bin setting back, and leaves Automatic unset", () => {
    const bins = [
      { by: "category" },
      { by: "width", width: 3 },
      { by: "count", count: 4, underflow: 5 },
      { by: "auto", overflow: 25 },
    ] as const
    for (const set of bins) {
      expect(readChartEx(chartExXml({ ...defaultChartSpec("histogram"), bins: set }))!.bins).toEqual(set)
    }
    expect(readChartEx(chartExXml(defaultChartSpec("histogram")))!.bins).toBeUndefined()
  })

  it("reads a chart as Word writes it: rich title, hidden pareto bins on automatic limits, no workbook", () => {
    const xml =
      `<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
      `<cx:chartData><cx:data id="0"><cx:numDim type="val"><cx:lvl ptCount="4" formatCode="General"><cx:pt idx="0">1</cx:pt><cx:pt idx="1">4</cx:pt><cx:pt idx="2">9</cx:pt><cx:pt idx="3">16</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData>` +
      `<cx:chart><cx:title><cx:tx><cx:rich><a:p><a:r><a:t>Squares</a:t></a:r></a:p></cx:rich></cx:tx></cx:title>` +
      `<cx:plotArea><cx:plotAreaRegion><cx:series layoutId="clusteredColumn"><cx:tx><cx:txData><cx:v>Value</cx:v></cx:txData></cx:tx><cx:dataId val="0"/>` +
      `<cx:layoutPr><cx:binning intervalClosed="r" underflow="auto" overflow="12"/></cx:layoutPr></cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart></cx:chartSpace>`
    const spec = readChartEx(xml)!
    expect(spec.type).toBe("histogram")
    expect(spec.title).toMatchObject({ show: true, text: "Squares" })
    expect(spec.series).toEqual([{ name: "Value", values: [1, 4, 9, 16] }])
    expect(spec.categories).toEqual(["1", "2", "3", "4"])
    expect(spec.bins).toEqual({ by: "auto", overflow: 12 })
    expect(spec.legend).toBe("none")
    // A Map is not a chart the app draws.
    expect(readChartEx(xml.replace("clusteredColumn", "regionMap"))).toBeNull()
  })

  it("saves the chart in an mc:AlternateContent: Word's chartex chart, and the ordinary chart as the fallback", async () => {
    const bytes = await save(defaultChartSpec("histogram"))
    const pkg = await openPackage(bytes, "c.docx")
    const document = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    expect(document).toMatch(
      /<mc:AlternateContent xmlns:mc="[^"]+"><mc:Choice xmlns:cx1="http:\/\/schemas.microsoft.com\/office\/drawing\/2015\/9\/8\/chartex" Requires="cx1"><w:drawing/,
    )
    expect(document).toMatch(/<\/mc:Choice><mc:Fallback><w:drawing[^]*<c:chart [^]*<\/mc:Fallback><\/mc:AlternateContent>/)
    const relId = /<cx:chart [^>]*r:id="(rId\d+)"/.exec(document)![1]
    const rel = relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === relId)!
    expect(rel.type).toBe("http://schemas.microsoft.com/office/2014/relationships/chartEx")
    const part = findPart(pkg, rel.partName!)!
    expect(part.name).toMatch(/^\/word\/charts\/chartEx\d+\.xml$/)
    expect(part.contentType).toBe("application/vnd.ms-office.chartex+xml")
    expect(decodeXml(part.data)).toContain('<cx:externalData r:id="rId1" cx:autoUpdate="0"/>')
    // Its workbook holds the values as typed, not the bins.
    const workbookRel = relationshipsFor(pkg, part.name).find((item) => item.id === "rId1")!
    const entries = await readZip(findPart(pkg, workbookRel.partName!)!.data)
    const sheet = decodeXml(entries.find((entry) => entry.name === "xl/worksheets/sheet1.xml")!.data)
    expect(sheet).toContain("<t>Item 12</t>")
    expect(sheet).toContain('<c r="B13"><v>30</v></c>')
    expect(decodeXml((await openPackage(await save(defaultChartSpec("funnel")), "c.docx")).parts.find((item) => item.name === pkg.mainPartName)!.data)).toContain('Requires="cx2"')
  })

  it("opens its own chartex charts as they were, and Word's own (with no app copy) from the chartex part", async () => {
    for (const id of ids) {
      const spec = defaultChartSpec(id)
      const { view } = await openDocxBytes(await save(spec), "c.docx")
      const figure = decode(/data-inkspire-object="([^"]+)"/.exec(view.html)![1]!)
      expect(JSON.parse(figure.attrs.chart)).toEqual(spec)
    }
    // Word's file has no copy of the app's chart: take it out, and the chart is read from the chartex part.
    const spec = { ...defaultChartSpec("histogram"), bins: { by: "width" as const, width: 5 } }
    const entries = await readZip(await save(spec))
    const rewritten = entries.map((entry) =>
      entry.name === "word/document.xml"
        ? {
            ...entry,
            data: new TextEncoder().encode(
              decodeXml(entry.data).replace(/<a:extLst><a:ext uri="\{6F1C2B7E[^]*?<\/a:extLst>/g, ""),
            ),
          }
        : entry,
    )
    const document = decodeXml(rewritten.find((entry) => entry.name === "word/document.xml")!.data)
    expect(document).toContain("<cx:chart ")
    expect(document).not.toContain("ink:object")
    const { view } = await openDocxBytes(storedZip(rewritten), "c.docx")
    const figure = decode(/data-inkspire-object="([^"]+)"/.exec(view.html)![1]!)
    const read = JSON.parse(figure.attrs.chart) as ChartSpec
    expect(read.type).toBe("histogram")
    expect(read.bins).toEqual({ by: "width", width: 5 })
    expect(read.series[0]!.values).toEqual(spec.series[0]!.values)
  })
})
