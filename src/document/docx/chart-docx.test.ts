import { describe, expect, it } from "vitest"
import { chartSpaceXml, readChartSpace } from "@/document/docx/chart-xml"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readZip } from "@/document/docx/zip"
import { defaultChartSpec, serializeChartSpec, variantOf, withVariant, type ChartSpec } from "@/editor/chart-spec"

// A 1×1 transparent PNG: the picture a chart is rasterised to before saving, which Word's chart replaces.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

function encode(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return btoa(String.fromCharCode(...bytes))
}

function decode(data: string) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))))
}

function chartImage(spec: ChartSpec, extra: Record<string, unknown> = {}) {
  const figure = { type: "figure", attrs: { kind: "chart", chart: serializeChartSpec(spec), width: 480, height: 288 } }
  return {
    type: "image",
    attrs: { src: PNG, width: 480, height: 288, objectNode: encode({ ...figure, shown: [480, 288] }), ...extra },
  }
}

async function save(content: unknown[], word: Awaited<ReturnType<typeof openDocxBytes>>["word"] | null = null) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content },
    chrome: emptyChrome(),
    word,
    unchanged: false,
    fileName: "c.docx",
  })
  return saved.bytes
}

describe("charts in .docx", () => {
  it("saves a chart as Word's chart part with its cached data and an embedded workbook", async () => {
    const spec = defaultChartSpec("column")
    const bytes = await save([chartImage(spec)])
    const pkg = await openPackage(bytes, "c.docx")
    const document = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    expect(document).toContain('<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">')
    const relId = /<c:chart [^>]*r:id="(rId\d+)"/.exec(document)![1]
    const rel = relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === relId)!
    expect(rel.type).toBe("http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart")
    const chart = findPart(pkg, rel.partName!)!
    expect(chart.contentType).toBe("application/vnd.openxmlformats-officedocument.drawingml.chart+xml")
    const xml = decodeXml(chart.data)
    expect(xml).toContain('<c:barDir val="col"/><c:grouping val="clustered"/>')
    expect(xml).toContain("<c:v>Series 1</c:v>")
    expect(xml).toContain("<c:v>Category 4</c:v>")
    expect(xml).toContain("<c:v>4.3</c:v>")
    expect(xml).toContain("Chart Title")
    const workbookRel = relationshipsFor(pkg, chart.name).find((item) => item.id === "rId1")!
    expect(workbookRel.type).toBe("http://schemas.openxmlformats.org/officeDocument/2006/relationships/package")
    const workbook = findPart(pkg, workbookRel.partName!)!
    const entries = await readZip(workbook.data)
    const sheet = decodeXml(entries.find((entry) => entry.name === "xl/worksheets/sheet1.xml")!.data)
    expect(sheet).toContain("<t>Series 3</t>")
    expect(sheet).toContain('<c r="B2"><v>4.3</v></c>')
  })

  it("opens the chart it saved with every option it had", async () => {
    const spec = { ...withVariant(defaultChartSpec("line"), "line-markers"), style: 7, palette: "colorful3" }
    spec.legend = "right"
    spec.dataTable = true
    const bytes = await save([chartImage(spec)])
    const { view } = await openDocxBytes(bytes, "c.docx")
    const object = /data-inkspire-object="([^"]+)"/.exec(view.html)?.[1]
    expect(object).toBeTruthy()
    const figure = decode(object!)
    expect(figure.type).toBe("figure")
    expect(JSON.parse(figure.attrs.chart)).toEqual(spec)
    // The picture shown before the chart is restored is the chart drawn as SVG.
    expect(view.html).toContain('src="data:image/svg+xml;base64,')
  })

  it("opens Histogram, Waterfall, Funnel, Stock, Box & Whisker, Treemap and Sunburst as themselves, though Word's part holds the chart drawn", async () => {
    for (const id of ["histogram", "waterfall", "funnel", "stock-ohlc", "box-whisker", "treemap", "sunburst"]) {
      const spec = defaultChartSpec(id)
      const { view } = await openDocxBytes(await save([chartImage(spec)]), "c.docx")
      const figure = decode(/data-inkspire-object="([^"]+)"/.exec(view.html)![1]!)
      expect(JSON.parse(figure.attrs.chart)).toEqual(spec)
    }
  })

  it("keeps Word's own chart parts while the chart is unchanged, and writes a new chart once it changes", async () => {
    const bytes = await save([chartImage(defaultChartSpec("pie"))])
    const opened = await openDocxBytes(bytes, "c.docx")
    const img = /<img [^>]*>/.exec(opened.view.html)![0]
    const key = /data-docx="([^"]+)"/.exec(img)![1]
    const object = /data-inkspire-object="([^"]+)"/.exec(img)![1]!
    const figure = decode(object)
    const unchanged = await save(
      [
        {
          type: "image",
          attrs: { src: PNG, width: figure.attrs.width, height: figure.attrs.height, docxKey: key, objectNode: object },
        },
      ],
      opened.word,
    )
    const kept = await openPackage(unchanged, "c.docx")
    expect(kept.parts.filter((part) => part.name.startsWith("/word/charts/")).length).toBe(1)

    const edited = {
      ...figure,
      attrs: {
        ...figure.attrs,
        chart: serializeChartSpec({ ...JSON.parse(figure.attrs.chart), dataLabels: "center" }),
      },
    }
    const changed = await save(
      [
        {
          type: "image",
          attrs: {
            src: PNG,
            width: figure.attrs.width,
            height: figure.attrs.height,
            docxKey: key,
            objectNode: encode(edited),
          },
        },
      ],
      opened.word,
    )
    const pkg = await openPackage(changed, "c.docx")
    const document = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    const relId = /<c:chart [^>]*r:id="(rId\d+)"/.exec(document)![1]
    const rel = relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === relId)!
    expect(decodeXml(findPart(pkg, rel.partName!)!.data)).toContain('<c:dLblPos val="ctr"/>')
  })

  it("reads a Word chart's type, data and elements", () => {
    const xml =
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
      `<c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/>` +
      `<c:plotArea><c:lineChart><c:grouping val="standard"/>` +
      `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>North</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
      `<c:spPr><a:ln><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/></c:marker>` +
      `<c:dLbls><c:dLblPos val="t"/><c:showVal val="1"/></c:dLbls>` +
      `<c:cat><c:strRef><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>Jan</c:v></c:pt><c:pt idx="1"><c:v>Feb</c:v></c:pt></c:strCache></c:strRef></c:cat>` +
      `<c:val><c:numRef><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v>5.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>` +
      `<c:axId val="1"/><c:axId val="2"/></c:lineChart>` +
      `<c:catAx><c:axId val="1"/><c:delete val="0"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:max val="10"/></c:scaling><c:delete val="0"/><c:majorGridlines/></c:valAx>` +
      `</c:plotArea><c:legend><c:legendPos val="t"/></c:legend></c:chart></c:chartSpace>`
    const spec = readChartSpace(xml)!
    expect(spec.type).toBe("line")
    expect(spec.markers).toBe(true)
    expect(spec.title).toEqual({ show: true, text: "Revenue" })
    expect(spec.categories).toEqual(["Jan", "Feb"])
    expect(spec.series).toEqual([{ name: "North", values: [3, 5.5] }])
    expect(spec.format["series:0"]).toEqual({ fill: "#ff0000" })
    expect(spec.legend).toBe("top")
    expect(spec.dataLabels).toBe("outsideEnd")
    expect(spec.valueAxis.max).toBe(10)
    expect(spec.gridlines.major).toBe(true)
  })

  it("reads back every chart type it writes", () => {
    for (const id of [
      "column-stacked",
      "hbar-percent",
      "area",
      "pie",
      "doughnut",
      "scatter-smooth",
      "radar-filled",
      "combo-column-line-secondary",
    ]) {
      const spec = withVariant(defaultChartSpec(id), id)
      const read = readChartSpace(chartSpaceXml(spec))!
      expect(read.type, id).toBe(spec.type)
      expect(read.grouping, id).toBe(spec.grouping)
      expect(
        read.series.map((serie) => serie.values),
        id,
      ).toEqual(spec.series.map((serie) => serie.values))
      expect(
        read.series.map((serie) => serie.type ?? null),
        id,
      ).toEqual(spec.series.map((serie) => serie.type ?? null))
    }
  })
})

describe("3-D charts, Pie of Pie and Bar of Pie (22.6)", () => {
  const ids = [
    "column-3d-clustered",
    "column-3d-stacked",
    "column-3d-percent",
    "column-3d",
    "hbar-3d-clustered",
    "hbar-3d-percent",
    "line-3d",
    "area-3d",
    "area-3d-stacked",
    "pie-3d",
    "pie-of-pie",
    "bar-of-pie",
  ]

  it.each(ids)("saves %s as Word's chart of that kind and opens it as the same variant", (id) => {
    const spec = withVariant(defaultChartSpec(id), id)
    const xml = chartSpaceXml(spec)
    const read = readChartSpace(xml)!
    expect(variantOf(read)).toBe(id)
    expect(read.series.map((serie) => serie.values)).toEqual(spec.series.map((serie) => serie.values))
  })

  it("writes Word's elements: the 3-D groups with their view and axes, and the split of an of-pie chart", () => {
    const deep = chartSpaceXml(withVariant(defaultChartSpec("column-3d"), "column-3d"))
    expect(deep).toContain('<c:bar3DChart><c:barDir val="col"/><c:grouping val="standard"/>')
    expect(deep).toMatch(/<c:shape val="box"\/><c:axId val="1"\/><c:axId val="2"\/><c:axId val="3"\/><\/c:bar3DChart>/)
    expect(deep).toContain("<c:serAx>")
    expect(deep).toMatch(/<c:view3D>.*<c:perspective val="30"\/><\/c:view3D><c:floor>/)
    const front = chartSpaceXml(withVariant(defaultChartSpec("hbar-3d-stacked"), "hbar-3d-stacked"))
    expect(front).toContain('<c:barDir val="bar"/><c:grouping val="stacked"/>')
    expect(front).toContain('<c:axId val="0"/>')
    expect(front).not.toContain("<c:serAx>")
    expect(front).not.toContain("<c:overlap")
    expect(chartSpaceXml(withVariant(defaultChartSpec("line-3d"), "line-3d"))).toContain(
      '<c:line3DChart><c:grouping val="standard"/>',
    )
    const pie3d = chartSpaceXml(withVariant(defaultChartSpec("pie-3d"), "pie-3d"))
    expect(pie3d).toContain('<c:pie3DChart><c:varyColors val="1"/>')
    expect(pie3d).toContain('<c:rotX val="30"/>')
    const ofPie = chartSpaceXml(withVariant(defaultChartSpec("bar-of-pie"), "bar-of-pie"))
    expect(ofPie).toMatch(
      /<c:ofPieChart><c:ofPieType val="bar"\/><c:varyColors val="1"\/>.*<c:gapWidth val="100"\/><c:splitType val="pos"\/><c:splitPos val="2"\/><c:secondPieSize val="75"\/><c:serLines\/><\/c:ofPieChart>/,
    )
    expect(ofPie).not.toContain("view3D")
  })

  it("saves a 3-D chart's rotation in its view and reads it back, leaving Word's own view unset", () => {
    const spec = { ...withVariant(defaultChartSpec("column-3d"), "column-3d"), rotX: 40, rotY: 300 }
    const xml = chartSpaceXml(spec)
    expect(xml).toContain('<c:view3D><c:rotX val="40"/><c:rotY val="300"/>')
    const read = readChartSpace(xml)!
    expect([read.rotX, read.rotY]).toEqual([40, 300])
    const plain = readChartSpace(chartSpaceXml(withVariant(defaultChartSpec("pie-3d"), "pie-3d")))!
    expect([plain.rotX, plain.rotY]).toEqual([undefined, undefined])
    const pie = readChartSpace(chartSpaceXml({ ...withVariant(defaultChartSpec("pie-3d"), "pie-3d"), rotY: 120 }))!
    expect([pie.rotX, pie.rotY]).toEqual([undefined, 120])
  })

  it("saves an of-pie chart split by value, percentage or custom points, and its second plot size", () => {
    const spec = withVariant(defaultChartSpec("bar-of-pie"), "bar-of-pie")
    const byValue = chartSpaceXml({ ...spec, ofPieSplitBy: "val", ofPieSplitValue: 12, ofPieSize: 120 })
    expect(byValue).toContain('<c:splitType val="val"/><c:splitPos val="12"/><c:secondPieSize val="120"/>')
    expect(readChartSpace(byValue)).toMatchObject({ ofPieSplitBy: "val", ofPieSplitValue: 12, ofPieSize: 120 })
    const byPercent = readChartSpace(chartSpaceXml({ ...spec, ofPieSplitBy: "percent", ofPieSplitValue: 20 }))!
    expect(byPercent).toMatchObject({ ofPieSplitBy: "percent", ofPieSplitValue: 20 })
    expect(byPercent.ofPieSize).toBeUndefined()
    const custom = chartSpaceXml({ ...spec, ofPieSplitBy: "cust", ofPieCustom: [0, 2] })
    expect(custom).toContain(
      '<c:splitType val="cust"/><c:custSplit><c:secondPiePt val="0"/><c:secondPiePt val="2"/></c:custSplit>',
    )
    expect(readChartSpace(custom)).toMatchObject({ ofPieSplitBy: "cust", ofPieCustom: [0, 2] })
  })

  it("saves a 3-D chart's Depth, Right Angle Axes and Perspective, and an of-pie chart's Gap Width", () => {
    const deep = withVariant(defaultChartSpec("column-3d"), "column-3d")
    expect(chartSpaceXml(deep)).toContain('<c:rotY val="20"/><c:rAngAx val="0"/><c:perspective val="30"/></c:view3D>')
    expect(chartSpaceXml(withVariant(defaultChartSpec("column"), "column-3d-clustered"))).toContain(
      '<c:rotY val="20"/><c:rAngAx val="1"/></c:view3D>',
    )
    const set = { ...deep, depthPercent: 250, perspective: 40 }
    const xml = chartSpaceXml(set)
    expect(xml).toContain('<c:depthPercent val="250"/><c:rAngAx val="0"/><c:perspective val="80"/>')
    expect(readChartSpace(xml)).toMatchObject({ depthPercent: 250, perspective: 40 })
    const right = readChartSpace(chartSpaceXml({ ...deep, rightAngleAxes: true }))!
    expect(right.rightAngleAxes).toBe(true)
    const plain = readChartSpace(chartSpaceXml(deep))!
    expect([plain.rightAngleAxes, plain.perspective, plain.depthPercent, plain.heightPercent]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    // Height (% of base) goes between X and Y Rotation; none is Autoscale.
    const high = chartSpaceXml({ ...deep, heightPercent: 150 })
    expect(high).toContain('<c:rotX val="15"/><c:hPercent val="150"/><c:rotY val="20"/>')
    expect(readChartSpace(high)!.heightPercent).toBe(150)
    expect(chartSpaceXml(deep)).not.toContain("hPercent")
    // A 3-D pie's Height is its thickness.
    const thick = chartSpaceXml({ ...withVariant(defaultChartSpec("pie-3d"), "pie-3d"), heightPercent: 200 })
    expect(thick).toContain('<c:rotX val="30"/><c:hPercent val="200"/><c:rotY val="0"/>')
    expect(readChartSpace(thick)!.heightPercent).toBe(200)
    const ofPie = { ...withVariant(defaultChartSpec("pie-of-pie"), "pie-of-pie"), ofPieGap: 250 }
    expect(chartSpaceXml(ofPie)).toContain('<c:gapWidth val="250"/>')
    expect(readChartSpace(chartSpaceXml(ofPie))!.ofPieGap).toBe(250)
  })

  it("keeps the split Word gave an of-pie chart", () => {
    const spec = { ...withVariant(defaultChartSpec("pie-of-pie"), "pie-of-pie"), ofPieSplit: 1 }
    expect(readChartSpace(chartSpaceXml(spec))!.ofPieSplit).toBe(1)
  })
})

describe("error bars, drop lines, high-low lines and up/down bars", () => {
  it("writes them as Word's own chart elements and reads them back", () => {
    const spec = { ...withVariant(defaultChartSpec("line"), "line") }
    spec.errorBars = { kind: "percent", amount: 8 }
    spec.dropLines = true
    spec.highLowLines = true
    spec.upDownBars = true
    const xml = chartSpaceXml(spec)
    expect(xml).toContain('<c:errValType val="percentage"/>')
    expect(xml).toContain("<c:dropLines/>")
    expect(xml).toContain("<c:hiLowLines/>")
    expect(xml).toContain("<c:upDownBars>")
    const read = readChartSpace(xml)!
    expect(read.errorBars).toEqual({ kind: "percent", amount: 8 })
    expect([read.dropLines, read.highLowLines, read.upDownBars]).toEqual([true, true, true])
  })

  it("writes none of them for a plain chart", () => {
    const xml = chartSpaceXml(defaultChartSpec("column"))
    expect(xml).not.toContain("errBars")
    expect(readChartSpace(xml)!.errorBars.kind).toBe("none")
  })
})
