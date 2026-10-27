import { child, children, column, find, hex, srgb, tree, type Element } from "@/document/docx/chart-xml"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import {
  boxOptions,
  defaultChartSpec,
  mapColors,
  type BoxOptions,
  type ChartSpec,
  type HistogramBins,
  type LegendPosition,
} from "@/editor/chart-spec"

/**
 * Word's own charts of the 2016 kinds (chartex): Histogram and Pareto, Waterfall, Funnel, Box & Whisker, Treemap and
 * Sunburst. Word draws these from the data itself, so the part holds the data as typed and how to draw it (bins,
 * totals, quartiles), not the bars. A document holds one in an `mc:AlternateContent` whose fallback is the ordinary
 * chart it looks like, for programs that do not know these kinds.
 */

export const CHARTEX_NS = "http://schemas.microsoft.com/office/drawing/2014/chartex"
export const CHARTEX_CONTENT_TYPE = "application/vnd.ms-office.chartex+xml"
export const CHARTEX_RELATIONSHIP = "http://schemas.microsoft.com/office/2014/relationships/chartEx"
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

/** The namespaces Word puts in `mc:Choice Requires`: Funnel came a version later than the others, Map later still. */
export const CHARTEX_REQUIRES = {
  cx1: "http://schemas.microsoft.com/office/drawing/2015/9/8/chartex",
  cx2: "http://schemas.microsoft.com/office/drawing/2015/10/21/chartex",
  cx4: "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex",
} as const

const KINDS = ["histogram", "waterfall", "funnel", "boxWhisker", "treemap", "sunburst"]

/** Whether Word keeps this chart as a chartex chart. */
export function isChartEx(spec: ChartSpec) {
  return KINDS.includes(spec.type)
}

export function chartExRequires(spec: ChartSpec): keyof typeof CHARTEX_REQUIRES {
  return spec.type === "funnel" ? "cx2" : spec.type === "map" ? "cx4" : "cx1"
}

/**
 * The data as the chartex part and its workbook hold it: the shown rows only. A Waterfall's totals are the rows set
 * as totals; one from before Set as total gets the total the app draws after its last point as a last row.
 */
export function chartExData(spec: ChartSpec): ChartSpec {
  const rows = spec.categories.map((_, index) => index).filter((index) => !spec.hiddenCategories.includes(index))
  const pick = <T>(items: T[]) => rows.map((index) => items[index]!)
  const series = spec.series.filter((serie) => !serie.hidden)
  const data: ChartSpec = {
    ...spec,
    hiddenCategories: [],
    categories: pick(spec.categories),
    levels: spec.levels?.map((level) => pick(level).map((item) => item ?? "")),
    series: (spec.type === "boxWhisker" ? series : series.slice(0, 1)).map((serie) => ({
      ...serie,
      values: pick(serie.values),
      ...(serie.texts ? { texts: pick(serie.texts).map((item) => item ?? "") } : {}),
    })),
    format: Object.fromEntries(
      Object.entries(spec.format).flatMap(([key, value]) => {
        // Series and points are numbered as written: the hidden ones are left out.
        const [part, at] = key.split(":")
        if (part === "series" || part === "point") {
          const place = (part === "series" ? series.map((serie) => spec.series.indexOf(serie)) : rows).indexOf(
            Number(at),
          )
          return place < 0 ? [] : [[`${part}:${place}`, value]]
        }
        return [[key, value]]
      }),
    ),
  }
  if (spec.type === "waterfall" && data.series[0]) {
    if (spec.waterfallTotals) {
      data.waterfallTotals = rows.flatMap((row, place) => (spec.waterfallTotals!.includes(row) ? [place] : []))
    } else {
      const total = data.series[0].values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
      data.categories = [...data.categories, "Total"]
      data.series = [{ ...data.series[0], values: [...data.series[0].values, total] }]
      data.waterfallTotals = [data.categories.length - 1]
    }
  }
  return data
}

/** The colours the app draws a Waterfall's bars in: rises green, falls red, totals grey, as it expands them. */
const WATERFALL_COLORS = { up: "#2e7d32", down: "#c62828", total: "#5f6b7a" }

function waterfallColors(spec: ChartSpec) {
  return (spec.series[0]?.values ?? []).map((value, row) =>
    spec.waterfallTotals?.includes(row)
      ? WATERFALL_COLORS.total
      : value < 0
        ? WATERFALL_COLORS.down
        : WATERFALL_COLORS.up,
  )
}

function fillXml(color: string | undefined) {
  const value = hex(color)
  return value ? `<cx:spPr><a:solidFill><a:srgbClr val="${value}"/></a:solidFill></cx:spPr>` : ""
}

const LAYOUT: Record<string, string> = {
  histogram: "clusteredColumn",
  waterfall: "waterfall",
  funnel: "funnel",
  boxWhisker: "boxWhisker",
  treemap: "treemap",
  sunburst: "sunburst",
  map: "regionMap",
}

const LEGEND: Partial<Record<LegendPosition, string>> = { top: "t", bottom: "b", left: "l", right: "r" }

const LABEL_POSITION: Record<string, string> = {
  center: "ctr",
  insideEnd: "inEnd",
  insideBase: "inBase",
  outsideEnd: "outEnd",
}

function text(value: string, formula?: string) {
  return `<cx:tx><cx:txData>${formula ? `<cx:f>${escapeXmlText(formula)}</cx:f>` : ""}<cx:v>${escapeXmlText(value)}</cx:v></cx:txData></cx:tx>`
}

/**
 * Word's chartex part for a chart of one of these kinds, its data read from the workbook at `workbookRelId`. A Map
 * takes the `cx:geography` Word wrote, which holds Bing's outlines of its regions (`cx:geoCache`).
 */
export function chartExXml(source: ChartSpec, workbookRelId?: string, geography?: string) {
  const spec = chartExData(source)
  const rows = spec.categories.length
  const levels = spec.levels ?? []
  const first = levels.length + 1
  const last = rows + 1
  const range = (from: number, to: number) => `Sheet1!$${column(from)}$2:$${column(to)}$${last}`
  // The category with the outer levels after it, innermost first, as Word lists a hierarchy's levels.
  const labels = [spec.categories, ...[...levels].reverse()]
  const level = (items: string[]) =>
    `<cx:lvl ptCount="${rows}">${items
      .map((item, index) => (item ? `<cx:pt idx="${index}">${escapeXmlText(item)}</cx:pt>` : ""))
      .join("")}</cx:lvl>`
  const categories =
    `<cx:strDim type="cat"><cx:f${levels.length ? ` dir="row"` : ""}>${range(0, levels.length)}</cx:f>` +
    `${labels.map(level).join("")}</cx:strDim>`
  const hierarchy = spec.type === "treemap" || spec.type === "sunburst"
  const map = spec.type === "map"
  // A Map's values typed as text: Word colours each different one (`colorStr`) instead of by value.
  const typed = map && spec.series[0]?.texts?.some(Boolean) ? spec.series[0].texts : null
  const data = spec.series.map((serie, index) =>
    typed
      ? `<cx:data id="${index}">${categories}<cx:strDim type="colorStr"><cx:f>${range(first + index, first + index)}</cx:f>` +
        `<cx:lvl ptCount="${rows}">${typed
          .map((item, row) => {
            const value = item || (Number.isFinite(serie.values[row]) ? String(serie.values[row]) : "")
            return value ? `<cx:pt idx="${row}">${escapeXmlText(value)}</cx:pt>` : ""
          })
          .join("")}</cx:lvl></cx:strDim></cx:data>`
      : `<cx:data id="${index}">${categories}<cx:numDim type="${hierarchy ? "size" : map ? "colorVal" : "val"}">` +
        `<cx:f>${range(first + index, first + index)}</cx:f><cx:lvl ptCount="${rows}" formatCode="General">` +
        serie.values
          .map((value, row) => (Number.isFinite(value) ? `<cx:pt idx="${row}">${value}</cx:pt>` : ""))
          .join("") +
        `</cx:lvl></cx:numDim></cx:data>`,
  )
  const labelsShown = spec.dataLabels !== "none"
  const dataLabels = labelsShown
    ? `<cx:dataLabels${LABEL_POSITION[spec.dataLabels] ? ` pos="${LABEL_POSITION[spec.dataLabels]}"` : ""}>` +
      `<cx:visibility seriesName="${spec.labelContent.series ? 1 : 0}" categoryName="${spec.labelContent.category ? 1 : 0}" value="${spec.labelContent.value ? 1 : 0}"/></cx:dataLabels>`
    : ""
  const layoutPr = () => {
    switch (spec.type) {
      case "histogram":
        return `<cx:layoutPr>${binningXml(spec.bins)}</cx:layoutPr>`
      case "waterfall":
        return spec.waterfallTotals?.length
          ? `<cx:layoutPr><cx:subtotals>${spec.waterfallTotals.map((row) => `<cx:idx val="${row}"/>`).join("")}</cx:subtotals></cx:layoutPr>`
          : ""
      case "boxWhisker": {
        const box = boxOptions(spec)
        const flag = (on: boolean) => (on ? 1 : 0)
        return (
          `<cx:layoutPr><cx:visibility meanLine="${flag(box.meanLine)}" meanMarker="${flag(box.meanMarkers)}" nonoutliers="${flag(box.innerPoints)}" outliers="${flag(box.outliers)}"/>` +
          `<cx:statistics quartileMethod="${box.quartiles}"/></cx:layoutPr>`
        )
      }
      case "treemap":
        return `<cx:layoutPr><cx:parentLabelLayout val="overlapping"/></cx:layoutPr>`
      case "map":
        return `<cx:layoutPr>${MAP_LABELS[spec.mapLabels ?? ""] ? `<cx:regionLabelLayout val="${MAP_LABELS[spec.mapLabels!]}"/>` : ""}${geographyXml(spec, geography)}</cx:layoutPr>`
      default:
        return ""
    }
  }
  // Word draws a Waterfall's bars in its theme's colours unless told: each point gets the colour the app draws.
  const points =
    spec.type === "waterfall"
      ? waterfallColors(spec)
          .map((color, row) => {
            const paint = fillXml(spec.format[`point:${row}`]?.fill ?? color)
            return paint ? `<cx:dataPt idx="${row}">${paint}</cx:dataPt>` : ""
          })
          .join("")
      : ""
  const series = spec.series.map(
    (serie, index) =>
      `<cx:series layoutId="${LAYOUT[spec.type]}">${text(serie.name, `Sheet1!$${column(first + index)}$1`)}` +
      `${fillXml(spec.format[`series:${index}`]?.fill)}${map ? mapColorsXml(spec) : ""}${points}` +
      `${dataLabels}<cx:dataId val="${index}"/>${layoutPr()}${spec.pareto ? `<cx:axisId>1</cx:axisId>` : ""}</cx:series>`,
  )
  if (spec.pareto) {
    series.push(`<cx:series layoutId="paretoLine" ownerIdx="0"><cx:axisId>2</cx:axisId></cx:series>`)
  }
  // Each axis: hidden or not, its title, its major and minor gridlines (across the categories: `vertical`).
  const axisTitle = (title: { show: boolean; text: string }) =>
    title.show ? `<cx:title>${text(title.text)}</cx:title>` : ""
  const grid = (major: boolean | undefined, minor: boolean | undefined) =>
    `${major ? "<cx:majorGridlines/>" : ""}${minor ? "<cx:minorGridlines/>" : ""}`
  const hidden = (shown: boolean | undefined) => (shown === false ? ` hidden="1"` : "")
  const axes =
    spec.type === "treemap" || spec.type === "sunburst" || map
      ? ""
      : spec.type === "funnel"
        ? `<cx:axis id="0"${hidden(spec.axes.category)}><cx:catScaling gapWidth="0.06"/><cx:tickLabels/></cx:axis>`
        : `<cx:axis id="0"${hidden(spec.axes.category)}><cx:catScaling gapWidth="${spec.type === "histogram" ? 0 : 0.5}"/>` +
          `${axisTitle(spec.axisTitles.category)}${grid(spec.gridlines.vertical, spec.gridlines.minorVertical)}<cx:tickLabels/></cx:axis>` +
          `<cx:axis id="1"${hidden(spec.axes.value)}><cx:valScaling/>${axisTitle(spec.axisTitles.value)}` +
          `${grid(spec.gridlines.major, spec.gridlines.minor)}<cx:tickLabels/></cx:axis>` +
          (spec.pareto
            ? `<cx:axis id="2"${hidden(spec.axes.secondary)}><cx:valScaling max="1" min="0"/><cx:units unit="percentage"/><cx:tickLabels/></cx:axis>`
            : "")
  const title = spec.title.show ? `<cx:title pos="t" align="ctr" overlay="0">${text(spec.title.text)}</cx:title>` : ""
  const legend = LEGEND[spec.legend] ? `<cx:legend pos="${LEGEND[spec.legend]}" align="ctr" overlay="0"/>` : ""
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cx:chartSpace xmlns:a="${A_NS}" xmlns:r="${REL_NS}" xmlns:cx="${CHARTEX_NS}">` +
    `<cx:chartData>${workbookRelId ? `<cx:externalData r:id="${escapeXml(workbookRelId)}" cx:autoUpdate="0"/>` : ""}${data.join("")}</cx:chartData>` +
    `<cx:chart>${title}<cx:plotArea><cx:plotAreaRegion>${series.join("")}</cx:plotAreaRegion>${axes}</cx:plotArea>${legend}</cx:chart>` +
    `</cx:chartSpace>`
  )
}

const MAP_LABELS: Record<string, string> = { none: "none", bestFit: "bestFitOnly", show: "showAll" }
const AREA_OF_MAP: Record<string, string> = { world: "world", data: "dataOnly" }

/** A Map's Series Color: two colours, or three on a diverging scale with the midpoint (halfway unless set). */
function mapColorsXml(spec: ChartSpec) {
  const colors = mapColors(spec)
  const color = (name: string, value: string) => `<cx:${name}><a:srgbClr val="${hex(value) ?? "808080"}"/></cx:${name}>`
  const middle = Number.isFinite(spec.mapMidpoint) ? `<cx:number val="${spec.mapMidpoint}"/>` : `<cx:percent val="50"/>`
  return spec.mapDiverging
    ? `<cx:valueColors>${color("minColor", colors.min)}${color("midColor", colors.mid)}${color("maxColor", colors.max)}</cx:valueColors>` +
        `<cx:valueColorPositions count="3"><cx:mid>${middle}</cx:mid></cx:valueColorPositions>`
    : `<cx:valueColors>${color("minColor", colors.min)}${color("maxColor", colors.max)}</cx:valueColors>` +
        `<cx:valueColorPositions count="2"/>`
}

/**
 * A Map's geography: Word's own (its culture, attribution and Bing's outlines kept) with the projection and area
 * the app has now; without one, the projection and area alone.
 */
function geographyXml(spec: ChartSpec, geography: string | undefined) {
  const projection = spec.mapProjection && spec.mapProjection !== "auto" ? spec.mapProjection : undefined
  const area = AREA_OF_MAP[spec.mapArea ?? ""]
  const open = /^<cx:geography\b[^>]*?(\/?)>/.exec(geography ?? "")
  if (!geography || !open) {
    return ""
  }
  let tag = open[0]
    .replace(/\s(?:projectionType|viewedRegionType)="[^"]*"/g, "")
    .replace(
      /^<cx:geography/,
      `<cx:geography${projection ? ` projectionType="${projection}"` : ""}${area ? ` viewedRegionType="${area}"` : ""}`,
    )
  tag = tag.replace(/\s+(\/?>)$/, "$1")
  return tag + geography.slice(open[0].length)
}

/** A histogram's bins as Word writes them: By Category is aggregation, the rest binning (Automatic has no size). */
function binningXml(bins: HistogramBins | undefined) {
  if (bins?.by === "category") {
    return "<cx:aggregation/>"
  }
  const limit = (name: string, value: number | undefined) => (Number.isFinite(value) ? ` ${name}="${value}"` : "")
  const size =
    bins?.by === "width" && Number(bins.width) > 0
      ? `<cx:binSize>${bins.width}</cx:binSize>`
      : bins?.by === "count" && Number(bins.count) >= 1
        ? `<cx:binCount>${Math.round(bins.count!)}</cx:binCount>`
        : ""
  return `<cx:binning intervalClosed="r"${limit("underflow", bins?.underflow)}${limit("overflow", bins?.overflow)}>${size}</cx:binning>`
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

const KIND_OF: Record<string, string> = {
  clusteredColumn: "histogram",
  waterfall: "waterfall",
  funnel: "funnel",
  boxWhisker: "boxWhisker",
  treemap: "treemap",
  sunburst: "sunburst",
  regionMap: "map",
}

const PROJECTIONS: Record<string, ChartSpec["mapProjection"]> = {
  mercator: "mercator",
  miller: "miller",
  robinson: "robinson",
}

function points(level: Element | undefined) {
  const count = Number(level?.attrs.ptCount) || 0
  const items: string[] = Array.from({ length: count }, () => "")
  for (const point of children(level, "pt")) {
    const index = Number(point.attrs.idx)
    if (Number.isInteger(index) && index >= 0) {
      items[index] = point.text
    }
  }
  return items
}

/** A title or name: its cached text, or the runs of rich text. */
function textOf(element: Element | undefined) {
  const cached = find(element, "v")
  if (cached) {
    return cached.text
  }
  const runs: string[] = []
  const walk = (item: Element) => {
    if (item.name === "t") {
      runs.push(item.text)
    }
    item.children.forEach(walk)
  }
  if (element) {
    walk(element)
  }
  return runs.join("")
}

/** A chartex part as the app's chart; null for kinds the app does not draw (Map) or a part it cannot read. */
/** Word's axes: shown or hidden, their titles, and their gridlines (a category axis' run up the chart). */
function readAxes(spec: ChartSpec, axes: Element[]) {
  if (!axes.length) {
    return
  }
  const shown = (axis: Element) => axis.attrs.hidden !== "1" && axis.attrs.hidden !== "true"
  const titleOf = (axis: Element) => {
    const title = child(axis, "title")
    return { show: Boolean(title), text: (title && textOf(child(title, "tx"))) || "Axis Title" }
  }
  const category = axes.find((axis) => child(axis, "catScaling"))
  const [value, second] = axes.filter((axis) => child(axis, "valScaling"))
  if (category) {
    spec.axes.category = shown(category)
    spec.axisTitles.category = titleOf(category)
    spec.gridlines.vertical = Boolean(child(category, "majorGridlines"))
    spec.gridlines.minorVertical = Boolean(child(category, "minorGridlines"))
  }
  if (value) {
    spec.axes.value = shown(value)
    spec.axisTitles.value = titleOf(value)
    spec.gridlines.major = Boolean(child(value, "majorGridlines"))
    spec.gridlines.minor = Boolean(child(value, "minorGridlines"))
  }
  if (second && !shown(second)) {
    spec.axes.secondary = false
  }
}

export function readChartEx(xml: string): ChartSpec | null {
  const root = tree(xml)
  const chart = child(root ?? undefined, "chart")
  const region = child(child(chart, "plotArea"), "plotAreaRegion")
  const all = children(region, "series")
  const series = all.filter((item) => item.attrs.layoutId !== "paretoLine")
  const kind = KIND_OF[series[0]?.attrs.layoutId ?? ""]
  if (!root || !kind || !series.length) {
    return null
  }
  const pareto = kind === "histogram" && all.some((item) => item.attrs.layoutId === "paretoLine")
  const spec = defaultChartSpec(
    pareto ? "pareto" : kind === "boxWhisker" ? "box-whisker" : kind === "map" ? "filled-map" : kind,
  )
  const datas = children(child(root, "chartData"), "data")
  const dataFor = (item: Element) =>
    datas.find((data) => data.attrs.id === child(item, "dataId")?.attrs.val) ?? datas[0]
  const firstData = dataFor(series[0]!)
  const labels = children(
    children(firstData, "strDim").find((dim) => (dim.attrs.type ?? "cat") === "cat"),
    "lvl",
  ).map(points)
  const valuesOf = (item: Element) => {
    const dim = children(dataFor(item), "numDim")[0]
    return points(child(dim, "lvl")).map((value) => (value === "" ? Number.NaN : Number(value)))
  }
  const read = series.map((item, index) => ({
    name: textOf(child(item, "tx")) || `Series ${index + 1}`,
    values: valuesOf(item),
  }))
  const rows = Math.max(labels[0]?.length ?? 0, ...read.map((item) => item.values.length))
  spec.categories = Array.from({ length: rows }, (_, index) => labels[0]?.[index] ?? String(index + 1))
  spec.series = (kind === "boxWhisker" ? read : read.slice(0, 1)).map((item) => ({
    name: item.name,
    values: Array.from({ length: rows }, (_, index) => item.values[index] ?? Number.NaN),
  }))
  spec.hiddenCategories = []
  if (kind === "treemap" || kind === "sunburst") {
    // Word lists the levels innermost first; the app keeps the outer ones outermost first.
    spec.levels = labels
      .slice(1)
      .reverse()
      .map((level) => Array.from({ length: rows }, (_, index) => level[index] ?? ""))
  }
  const layout = child(series[0]!, "layoutPr")
  if (kind === "histogram") {
    spec.bins = binsOf(layout)
  }
  if (kind === "waterfall") {
    spec.waterfallTotals = children(child(layout, "subtotals"), "idx")
      .map((item) => Number(item.attrs.val))
      .filter((row) => Number.isInteger(row) && row >= 0 && row < rows)
  }
  if (kind === "map") {
    // Word's Map: the projection, the area shown and the labels; the outlines are drawn from the app's own.
    const geography = child(layout, "geography")
    spec.mapProjection = PROJECTIONS[geography?.attrs.projectionType ?? ""]
    const area = geography?.attrs.viewedRegionType
    spec.mapArea = area === "world" ? "world" : area === "dataOnly" ? "data" : undefined
    const labels = child(layout, "regionLabelLayout")?.attrs.val
    spec.mapLabels = labels === "showAll" ? "show" : labels === "bestFitOnly" ? "bestFit" : undefined
    // Values given as text: Word colours each different one.
    const typed = children(firstData, "strDim").find((dim) => dim.attrs.type === "colorStr")
    if (typed && spec.series[0]) {
      const texts = points(child(typed, "lvl"))
      spec.series[0].texts = Array.from({ length: rows }, (_, index) => texts[index] ?? "")
    }
    // The Series Color: two colours, or three on a diverging scale with the midpoint where Word put it.
    const colors = child(series[0]!, "valueColors")
    const color = (name: string) => {
      const value = find(child(colors, name), "srgbClr")?.attrs.val
      return value ? `#${value.toLowerCase()}` : undefined
    }
    const [min, mid, max] = [color("minColor"), color("midColor"), color("maxColor")]
    if (min || mid || max) {
      spec.mapColors = { ...(min ? { min } : {}), ...(mid ? { mid } : {}), ...(max ? { max } : {}) }
    }
    const positions = child(series[0]!, "valueColorPositions")
    if (positions?.attrs.count === "3") {
      spec.mapDiverging = true
      const middle = child(positions, "mid") ?? child(positions, "midPosition")
      const number = Number(child(middle, "number")?.attrs.val)
      const percent = Number(child(middle, "percent")?.attrs.val)
      const values = (spec.series[0]?.values ?? []).filter((value) => Number.isFinite(value))
      if (Number.isFinite(number)) {
        spec.mapMidpoint = number
      } else if (Number.isFinite(percent) && values.length) {
        // A percentage of the way from the lowest value to the highest (Word writes 50 for halfway).
        const low = Math.min(...values)
        const share = percent > 1 ? percent / 100 : percent
        spec.mapMidpoint = share === 0.5 ? undefined : low + (Math.max(...values) - low) * share
      }
    }
  }
  if (kind === "boxWhisker") {
    const shown = child(layout, "visibility")
    const flag = (name: string) => (shown?.attrs[name] === undefined ? undefined : shown.attrs[name] === "1")
    const read: BoxOptions = {
      meanLine: flag("meanLine"),
      meanMarkers: flag("meanMarker"),
      innerPoints: flag("nonoutliers"),
      outliers: flag("outliers"),
      quartiles: child(layout, "statistics")?.attrs.quartileMethod === "inclusive" ? "inclusive" : undefined,
    }
    // Only what differs from Word's own.
    const defaults = boxOptions({})
    const box = Object.fromEntries(
      Object.entries(read).filter(([key, value]) => value !== undefined && value !== defaults[key as keyof BoxOptions]),
    ) as BoxOptions
    spec.box = Object.keys(box).length ? box : undefined
  }
  // Colours: a series' fill, and a Waterfall's points where they are not the colours the app draws them in.
  series.forEach((item, index) => {
    const fill = srgb(child(item, "spPr"))
    if (fill && index < spec.series.length) {
      spec.format = { ...spec.format, [`series:${index}`]: { ...spec.format[`series:${index}`], fill } }
    }
  })
  if (kind === "waterfall") {
    const drawn = waterfallColors(spec)
    for (const point of children(series[0]!, "dataPt")) {
      const row = Number(point.attrs.idx)
      const fill = srgb(child(point, "spPr"))
      if (fill && row >= 0 && row < rows && fill !== drawn[row]) {
        spec.format = { ...spec.format, [`point:${row}`]: { ...spec.format[`point:${row}`], fill } }
      }
    }
  }
  const title = child(chart, "title")
  spec.title = {
    ...spec.title,
    show: Boolean(title),
    text: title ? textOf(child(title, "tx")) || spec.title.text : spec.title.text,
  }
  readAxes(spec, children(child(chart, "plotArea"), "axis"))
  const legend = child(chart, "legend")
  const position = Object.entries(LEGEND).find(([, value]) => value === legend?.attrs.pos)?.[0] as
    LegendPosition | undefined
  spec.legend = legend ? (position ?? "top") : "none"
  const labelsXml = child(series[0]!, "dataLabels")
  if (labelsXml) {
    const at = Object.entries(LABEL_POSITION).find(([, value]) => value === labelsXml.attrs.pos)?.[0]
    spec.dataLabels =
      (at as ChartSpec["dataLabels"] | undefined) ?? (spec.dataLabels === "none" ? "center" : spec.dataLabels)
    const shown = child(labelsXml, "visibility")
    if (shown) {
      spec.labelContent = {
        ...spec.labelContent,
        series: shown.attrs.seriesName === "1",
        category: shown.attrs.categoryName === "1",
        value: shown.attrs.value === "1",
      }
    }
  } else {
    spec.dataLabels = "none"
  }
  return spec
}

function binsOf(layout: Element | undefined): HistogramBins | undefined {
  if (child(layout, "aggregation")) {
    return { by: "category" }
  }
  const binning = child(layout, "binning")
  if (!binning) {
    return undefined
  }
  const bins: HistogramBins = { by: "auto" }
  // The schema gives the number as the element's text; take a `val` too, as some writers put it there.
  const number = (name: string) => {
    const item = child(binning, name)
    return Number(item?.attrs.val ?? item?.text)
  }
  const size = number("binSize")
  const count = number("binCount")
  if (size > 0) {
    Object.assign(bins, { by: "width", width: size })
  } else if (count >= 1) {
    Object.assign(bins, { by: "count", count })
  }
  for (const name of ["underflow", "overflow"] as const) {
    const raw = binning.attrs[name]
    if (raw !== undefined && raw !== "auto" && Number.isFinite(Number(raw))) {
      bins[name] = Number(raw)
    }
  }
  return bins.by === "auto" && bins.underflow === undefined && bins.overflow === undefined ? undefined : bins
}
