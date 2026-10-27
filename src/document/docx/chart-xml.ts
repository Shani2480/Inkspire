import { expandSpec } from "@/editor/chart-expand"
import { storedZip } from "@/document/docx/zip"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import {
  CHART_STYLES,
  defaultChartSpec,
  normalizeChartSpec,
  ofPieSplit,
  paletteColor,
  type ChartSpec,
  type LabelPosition,
  type LegendPosition,
  type TrendlineKind,
} from "@/editor/chart-spec"
import { SaxesParser } from "saxes"

/**
 * Charts in .docx (20.8): a spec written as Word's chart part (`c:chartSpace`) with the cached series and an
 * embedded workbook holding the data, and Word's chart parts read back into a spec.
 */

export const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
export const CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
export const CHART_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"
export const PACKAGE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package"
export const WORKBOOK_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

// ---------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------

function hex(color: string | undefined) {
  const match = /^#?([0-9a-f]{6})$/i.exec((color ?? "").trim())
  return match ? match[1]!.toUpperCase() : null
}

function solid(color: string | undefined) {
  const value = hex(color)
  return value ? `<a:solidFill><a:srgbClr val="${value}"/></a:solidFill>` : "<a:noFill/>"
}

function column(index: number) {
  let name = ""
  let value = index + 1
  while (value > 0) {
    const rest = (value - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function visible<T>(spec: ChartSpec, items: T[]) {
  return items.filter((_, index) => !spec.hiddenCategories.includes(index))
}

/** The text properties Word writes for a chart's labels. */
function textProps(color: string, size: number, bold = false) {
  return (
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(size * 100)}" b="${bold ? 1 : 0}">` +
    `${solid(color)}<a:latin typeface="+mn-lt"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
  )
}

function richTitle(text: string, color: string, size: number, bold: boolean) {
  return (
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(size * 100)}" b="${bold ? 1 : 0}">${solid(color)}</a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="${Math.round(size * 100)}" b="${bold ? 1 : 0}">${solid(color)}</a:rPr><a:t>${escapeXmlText(text)}</a:t></a:r></a:p></c:rich></c:tx>` +
    `<c:overlay val="0"/></c:title>`
  )
}

function stringCache(ref: string, values: string[]) {
  return (
    `<c:strRef><c:f>${ref}</c:f><c:strCache><c:ptCount val="${values.length}"/>` +
    values.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXmlText(value)}</c:v></c:pt>`).join("") +
    `</c:strCache></c:strRef>`
  )
}

function numberCache(ref: string, values: number[], format = "General") {
  return (
    `<c:numRef><c:f>${ref}</c:f><c:numCache><c:formatCode>${escapeXmlText(format)}</c:formatCode><c:ptCount val="${values.length}"/>` +
    values.map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`).join("") +
    `</c:numCache></c:numRef>`
  )
}

const LABEL_POSITIONS: Record<LabelPosition, string> = {
  none: "",
  center: "ctr",
  insideEnd: "inEnd",
  insideBase: "inBase",
  outsideEnd: "outEnd",
  bestFit: "bestFit",
}

const TRENDLINES: Record<Exclude<TrendlineKind, "none">, string> = {
  linear: "linear",
  exponential: "exp",
  logarithmic: "log",
  movingAverage: "movingAvg",
}

type Group = "bar" | "line" | "area" | "pie" | "doughnut" | "scatter" | "radar" | "surface"

/** A group's data labels, with the positions its chart type allows. */
function labelsXml(spec: ChartSpec, group: Group, text: string) {
  if (spec.dataLabels === "none") {
    return ""
  }
  let position = LABEL_POSITIONS[spec.dataLabels]
  if (group === "line" || group === "scatter") {
    position = spec.dataLabels === "center" ? "ctr" : "t"
  } else if (group === "area" || group === "doughnut" || group === "radar") {
    position = ""
  } else if (group === "pie" && position === "inBase") {
    position = "inEnd"
  } else if (group === "bar" && position === "bestFit") {
    position = "outEnd"
  }
  if (group === "bar" && spec.grouping !== "clustered" && position === "outEnd") {
    position = "inEnd"
  }
  const content = spec.labelContent
  const any = content.value || content.category || content.series || content.percent
  return (
    `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textProps(text, 9)}` +
    (position ? `<c:dLblPos val="${position}"/>` : "") +
    `<c:showLegendKey val="0"/><c:showVal val="${content.value || !any ? 1 : 0}"/>` +
    `<c:showCatName val="${content.category ? 1 : 0}"/><c:showSerName val="${content.series ? 1 : 0}"/>` +
    `<c:showPercent val="${content.percent ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
  )
}

const ERROR_KINDS = { fixed: "fixedVal", percent: "percentage", stddev: "stdDev", stderr: "stdErr" } as const
const READ_ERROR_KINDS: Record<string, "fixed" | "percent" | "stddev" | "stderr"> = {
  fixedVal: "fixed",
  percentage: "percent",
  stdDev: "stddev",
  stdErr: "stderr",
}
const UP_DOWN_BARS =
  `<c:upDownBars><c:gapWidth val="150"/><c:upBars><c:spPr>${solid("#FFFFFF")}<a:ln w="9525">${solid("#404040")}</a:ln></c:spPr></c:upBars>` +
  `<c:downBars><c:spPr>${solid("#404040")}<a:ln w="9525">${solid("#404040")}</a:ln></c:spPr></c:downBars></c:upDownBars>`

function seriesXml(spec: ChartSpec, index: number, group: Group, rows: number) {
  const serie = spec.series[index]!
  const color = spec.format[`series:${index}`]?.fill || paletteColor(spec, index)
  const look = CHART_STYLES[spec.style - 1] ?? CHART_STYLES[0]!
  const letter = column(index + 1)
  const values = visible(
    spec,
    spec.categories.map((_, row) => serie.values[row] ?? 0),
  )
  const categories = visible(spec, spec.categories)
  const range = `$${letter}$2:$${letter}$${rows + 1}`
  const lined = group === "line" || group === "scatter" || (group === "radar" && !spec.filled)
  const own = spec.format[`series:${index}`]
  const outline = own?.line || (look.seriesLine === "series" ? color : look.seriesLine)
  const shape = lined
    ? `<c:spPr><a:ln w="${Math.round((own?.lineWidth ?? 2.25) * 12700)}" cap="rnd">${solid(own?.line || color)}<a:round/></a:ln></c:spPr>`
    : `<c:spPr>${solid(color)}<a:ln${outline === "none" ? "><a:noFill/>" : ` w="${Math.round((own?.lineWidth ?? look.seriesLineWidth) * 12700)}">${solid(outline)}`}</a:ln></c:spPr>`
  const marker =
    group === "line" || group === "scatter" || group === "radar"
      ? serie.tick
        ? `<c:marker><c:symbol val="dash"/><c:size val="7"/><c:spPr>${solid(look.text)}<a:ln w="9525">${solid(look.text)}</a:ln></c:spPr></c:marker>`
        : spec.markers || (group === "scatter" && !spec.lines)
          ? `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(color)}<a:ln w="9525">${solid(color)}</a:ln></c:spPr></c:marker>`
          : `<c:marker><c:symbol val="none"/></c:marker>`
      : ""
  const points =
    group === "pie" || group === "doughnut"
      ? spec.categories
          .map((_, point) => point)
          .filter((point) => !spec.hiddenCategories.includes(point))
          .map(
            (point, place) =>
              `<c:dPt><c:idx val="${place}"/><c:bubble3D val="0"/><c:spPr>${solid(spec.format[`point:${point}`]?.fill || paletteColor(spec, point))}<a:ln w="19050">${solid("#FFFFFF")}</a:ln></c:spPr></c:dPt>`,
          )
          .join("")
      : ""
  const trend =
    serie.trendline && serie.trendline !== "none" && group !== "pie" && group !== "doughnut" && group !== "radar"
      ? `<c:trendline><c:spPr><a:ln w="19050" cap="rnd">${solid(color)}<a:prstDash val="sysDot"/></a:ln></c:spPr>` +
        `<c:trendlineType val="${TRENDLINES[serie.trendline]}"/>${serie.trendline === "movingAverage" ? `<c:period val="2"/>` : ""}` +
        `<c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>`
      : ""
  const bars =
    spec.errorBars.kind !== "none" && group !== "pie" && group !== "doughnut" && group !== "radar"
      ? `<c:errBars>${group === "scatter" ? `<c:errDir val="y"/>` : ""}<c:errBarType val="both"/><c:errValType val="${ERROR_KINDS[spec.errorBars.kind]}"/><c:noEndCap val="0"/>` +
        `${spec.errorBars.kind === "stderr" ? "" : `<c:val val="${spec.errorBars.amount}"/>`}` +
        `<c:spPr><a:ln w="12700">${solid("#404040")}</a:ln></c:spPr></c:errBars>`
      : ""
  const name = `<c:tx>${stringCache(`Sheet1!$${letter}$1`, [serie.name])}</c:tx>`
  const head = `<c:idx val="${index}"/><c:order val="${index}"/>${name}${shape}`
  const format = spec.valueAxis.numberFormat ?? "General"
  if (group === "scatter") {
    const numbers = categories.map((value) => Number(value))
    const numeric = numbers.every((value) => Number.isFinite(value))
    const x = numeric
      ? numberCache(`Sheet1!$A$2:$A$${rows + 1}`, numbers)
      : stringCache(`Sheet1!$A$2:$A$${rows + 1}`, categories)
    return (
      `<c:ser>${head}${marker}${trend}${bars}<c:xVal>${x}</c:xVal><c:yVal>${numberCache(`Sheet1!${range}`, values, format)}</c:yVal>` +
      `<c:smooth val="${spec.smooth ? 1 : 0}"/></c:ser>`
    )
  }
  const data =
    `<c:cat>${stringCache(`Sheet1!$A$2:$A$${rows + 1}`, categories)}</c:cat>` +
    `<c:val>${numberCache(`Sheet1!${range}`, values, format)}</c:val>`
  switch (group) {
    case "bar":
      return `<c:ser>${head}<c:invertIfNegative val="0"/>${trend}${bars}${data}</c:ser>`
    case "line":
      return `<c:ser>${head}${marker}${trend}${bars}${data}<c:smooth val="${spec.smooth ? 1 : 0}"/></c:ser>`
    case "area":
      return `<c:ser>${head}${trend}${bars}${data}</c:ser>`
    case "surface":
      // A surface series has no trendline, error bars or labels: its name, fill, categories and values.
      return `<c:ser>${head}${data}</c:ser>`
    case "pie":
    case "doughnut":
      return `<c:ser>${head}${spec.explosion ? `<c:explosion val="${spec.explosion}"/>` : ""}${points}${data}</c:ser>`
    case "radar":
      return `<c:ser>${head}${marker}${data}</c:ser>`
  }
}

function axisXml(spec: ChartSpec, kind: "cat" | "val", ids: [number, number], options: { secondary?: boolean }) {
  const look = CHART_STYLES[spec.style - 1] ?? CHART_STYLES[0]!
  const horizontal = spec.type === "bar"
  const isCategory = kind === "cat"
  const shown = options.secondary ? !isCategory : isCategory ? spec.axes.category : spec.axes.value
  const position = options.secondary
    ? isCategory
      ? "b"
      : "r"
    : horizontal
      ? isCategory
        ? "l"
        : "b"
      : isCategory
        ? "b"
        : "l"
  const reverse = isCategory ? spec.categoryReverse : spec.valueAxis.reverse
  const scaling =
    `<c:scaling>${!isCategory && spec.valueAxis.log ? `<c:logBase val="10"/>` : ""}<c:orientation val="${reverse ? "maxMin" : "minMax"}"/>` +
    (!isCategory && !options.secondary && spec.valueAxis.max !== undefined
      ? `<c:max val="${spec.valueAxis.max}"/>`
      : "") +
    (!isCategory && !options.secondary && spec.valueAxis.min !== undefined
      ? `<c:min val="${spec.valueAxis.min}"/>`
      : "") +
    `</c:scaling>`
  const gridColor = spec.format.gridlines?.line || look.grid
  const grid =
    !options.secondary && ((!isCategory && spec.gridlines.major) || (isCategory && spec.gridlines.vertical))
      ? `<c:majorGridlines><c:spPr><a:ln w="9525">${solid(gridColor)}</a:ln></c:spPr></c:majorGridlines>`
      : ""
  const minor =
    !options.secondary && !isCategory && spec.gridlines.minor
      ? `<c:minorGridlines><c:spPr><a:ln w="9525">${solid(gridColor)}</a:ln></c:spPr></c:minorGridlines>`
      : ""
  const titleOf = isCategory ? spec.axisTitles.category : spec.axisTitles.value
  const title =
    !options.secondary && titleOf.show
      ? richTitle(
          titleOf.text,
          spec.format[`axisTitle:${isCategory ? "category" : "value"}`]?.color || look.text,
          10,
          true,
        )
      : ""
  const text = spec.format[`axis:${isCategory ? "category" : "value"}`]?.color || look.text
  const format = !isCategory
    ? `<c:numFmt formatCode="${escapeXml(spec.valueAxis.numberFormat ?? (spec.grouping === "percent" ? "0%" : "General"))}" sourceLinked="${spec.valueAxis.numberFormat ? 0 : 1}"/>`
    : `<c:numFmt formatCode="General" sourceLinked="1"/>`
  const line = isCategory
    ? `<c:spPr><a:noFill/><a:ln w="9525">${solid(spec.format["axis:category"]?.line || look.axis)}</a:ln></c:spPr>`
    : `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`
  const common =
    `<c:axId val="${ids[0]}"/>${scaling}<c:delete val="${shown ? 0 : 1}"/><c:axPos val="${position}"/>${grid}${minor}${title}${format}` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${textProps(text, 9)}` +
    `<c:crossAx val="${ids[1]}"/>`
  if (isCategory) {
    return `<c:catAx>${common}<c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  }
  const between = spec.type === "area" && spec.series.every((serie) => !serie.type) ? "midCat" : "between"
  return (
    `<c:valAx>${common}<c:crosses val="${options.secondary ? "max" : "autoZero"}"/><c:crossBetween val="${between}"/>` +
    (!options.secondary && spec.valueAxis.major ? `<c:majorUnit val="${spec.valueAxis.major}"/>` : "") +
    `</c:valAx>`
  )
}

function scatterAxes(spec: ChartSpec) {
  const look = CHART_STYLES[spec.style - 1] ?? CHART_STYLES[0]!
  const axis = (
    id: number,
    cross: number,
    position: "b" | "l",
    shown: boolean,
    grid: boolean,
    title: { show: boolean; text: string },
  ) =>
    `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${shown ? 0 : 1}"/>` +
    `<c:axPos val="${position}"/>${grid ? `<c:majorGridlines><c:spPr><a:ln w="9525">${solid(look.grid)}</a:ln></c:spPr></c:majorGridlines>` : ""}` +
    `${title.show ? richTitle(title.text, look.text, 10, true) : ""}<c:numFmt formatCode="General" sourceLinked="1"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:noFill/><a:ln w="9525">${solid(look.axis)}</a:ln></c:spPr>${textProps(look.text, 9)}` +
    `<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
  return (
    axis(1, 2, "b", spec.axes.category, spec.gridlines.vertical, spec.axisTitles.category) +
    axis(2, 1, "l", spec.axes.value, spec.gridlines.major, spec.axisTitles.value)
  )
}

/** The chart part for a spec, as Word writes one. */
export function chartSpaceXml(source: ChartSpec, workbookRelId?: string) {
  // Histogram, Waterfall and Funnel are saved as the ordinary chart they are drawn as (22.6).
  const spec = expandSpec(source)
  const look = CHART_STYLES[spec.style - 1] ?? CHART_STYLES[0]!
  const rows = visible(spec, spec.categories).length
  const shown = spec.series.map((serie, index) => ({ serie, index })).filter((item) => !item.serie.hidden)
  const groupOf = (type: string | undefined): Group => {
    switch (type ?? spec.type) {
      case "column":
      case "bar":
        return "bar"
      case "line":
        return "line"
      case "area":
        return "area"
      default:
        return (type ?? spec.type) as Group
    }
  }
  const groups: string[] = []
  const round = spec.type === "pie" || spec.type === "doughnut"
  const text = spec.format.dataLabels?.color || look.text
  if (round && spec.type === "pie" && (spec.ofPie || spec.threeD)) {
    const first = shown[0]
    const series = `<c:varyColors val="1"/>${first ? seriesXml(spec, first.index, "pie", rows) : ""}${labelsXml(spec, "pie", text)}`
    if (spec.ofPie) {
      // Split by position: the last points go to the second plot, as the app draws it.
      const split = ofPieSplit(spec, rows)
      groups.push(
        `<c:ofPieChart><c:ofPieType val="${spec.ofPie}"/>${series}<c:gapWidth val="100"/><c:splitType val="pos"/>` +
          `<c:splitPos val="${split}"/><c:secondPieSize val="75"/><c:serLines/></c:ofPieChart>`,
      )
    } else {
      groups.push(`<c:pie3DChart>${series}</c:pie3DChart>`)
    }
  } else if (round) {
    const first = shown[0]
    const group = groupOf(spec.type)
    groups.push(
      `<c:${group}Chart><c:varyColors val="1"/>${first ? seriesXml(spec, first.index, group, rows) : ""}${labelsXml(spec, group, text)}` +
        `<c:firstSliceAng val="${Math.round(spec.firstSliceAngle)}"/>${group === "doughnut" ? `<c:holeSize val="${Math.round(spec.holeSize)}"/>` : ""}</c:${group}Chart>`,
    )
  } else if (spec.type === "scatter") {
    const style = spec.lines ? (spec.smooth ? "smoothMarker" : "lineMarker") : "lineMarker"
    groups.push(
      `<c:scatterChart><c:scatterStyle val="${style}"/><c:varyColors val="0"/>${shown.map((item) => seriesXml(spec, item.index, "scatter", rows)).join("")}` +
        `${labelsXml(spec, "scatter", text)}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>`,
    )
  } else if (spec.type === "surface") {
    // A contour is Word's flat surface chart (seen from above); the 3-D one has its own element. Neither has labels.
    const name = spec.contour ? "surfaceChart" : "surface3DChart"
    groups.push(
      `<c:${name}><c:wireframe val="${spec.filled ? 0 : 1}"/>${shown.map((item) => seriesXml(spec, item.index, "surface", rows)).join("")}` +
        `<c:axId val="1"/><c:axId val="2"/><c:axId val="3"/></c:${name}>`,
    )
  } else if (spec.type === "radar") {
    groups.push(
      `<c:radarChart><c:radarStyle val="${spec.filled ? "filled" : "marker"}"/><c:varyColors val="0"/>${shown.map((item) => seriesXml(spec, item.index, "radar", rows)).join("")}` +
        `${labelsXml(spec, "radar", text)}<c:axId val="1"/><c:axId val="2"/></c:radarChart>`,
    )
  } else {
    // Series go into one group per type and axis, as a combo chart has them.
    const keys: string[] = []
    const members = new Map<string, number[]>()
    for (const item of shown) {
      const key = `${groupOf(item.serie.type)}:${item.serie.secondary ? 2 : 1}`
      if (!members.has(key)) {
        members.set(key, [])
        keys.push(key)
      }
      members.get(key)!.push(item.index)
    }
    if (keys.length === 0) {
      keys.push(`${groupOf(undefined)}:1`)
      members.set(keys[0]!, [])
    }
    // A 3-D chart is one group of Word's 3-D kind; a "deep" one has a series axis (3) going back, a "front" one
    // has none (Word writes 0 for it).
    const threeD = spec.threeD && keys.length === 1 ? spec.threeD : undefined
    for (const key of keys) {
      const [group, axis] = key.split(":") as [Group, string]
      const ids = threeD
        ? `<c:axId val="1"/><c:axId val="2"/><c:axId val="${threeD === "deep" || group === "line" ? 3 : 0}"/>`
        : axis === "2"
          ? '<c:axId val="3"/><c:axId val="4"/>'
          : '<c:axId val="1"/><c:axId val="2"/>'
      const main = group === groupOf(undefined)
      const grouping = main
        ? spec.grouping === "clustered"
          ? group === "bar"
            ? "clustered"
            : "standard"
          : spec.grouping === "percent"
            ? "percentStacked"
            : "stacked"
        : group === "bar"
          ? "clustered"
          : "standard"
      const series = members
        .get(key)!
        .map((index) => seriesXml(spec, index, group, rows))
        .join("")
      const labels = labelsXml(spec, group, text)
      const grouping3d = threeD === "deep" ? "standard" : grouping
      if (threeD && group === "bar") {
        groups.push(
          `<c:bar3DChart><c:barDir val="${spec.type === "bar" ? "bar" : "col"}"/><c:grouping val="${grouping3d}"/><c:varyColors val="0"/>${series}${labels}` +
            `<c:gapWidth val="${Math.round(spec.gapWidth)}"/><c:shape val="box"/>${ids}</c:bar3DChart>`,
        )
      } else if (threeD && group === "line") {
        groups.push(
          `<c:line3DChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${labels}${spec.dropLines ? `<c:dropLines/>` : ""}${ids}</c:line3DChart>`,
        )
      } else if (threeD && group === "area") {
        groups.push(
          `<c:area3DChart><c:grouping val="${grouping3d}"/><c:varyColors val="0"/>${series}${labels}${spec.dropLines ? `<c:dropLines/>` : ""}${ids}</c:area3DChart>`,
        )
      } else if (group === "bar") {
        const stacked = grouping !== "clustered"
        groups.push(
          `<c:barChart><c:barDir val="${spec.type === "bar" ? "bar" : "col"}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${series}${labels}` +
            `<c:gapWidth val="${Math.round(spec.gapWidth)}"/>${stacked ? `<c:overlap val="100"/>` : spec.overlap ? `<c:overlap val="${Math.round(spec.overlap)}"/>` : ""}${ids}</c:barChart>`,
        )
      } else if (group === "line" && source.type === "stock") {
        // A stock chart has no grouping or marker flag of its own: the prices, high-low lines, up/down bars, axes.
        groups.push(
          `<c:stockChart>${series}${labels}<c:hiLowLines><c:spPr><a:ln w="9525">${solid(look.text)}</a:ln></c:spPr></c:hiLowLines>${spec.upDownBars ? UP_DOWN_BARS : ""}${ids}</c:stockChart>`,
        )
      } else if (group === "line") {
        groups.push(
          `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${series}${labels}${spec.dropLines ? `<c:dropLines/>` : ""}${spec.highLowLines ? `<c:hiLowLines/>` : ""}${spec.upDownBars && members.get(key)!.length > 1 ? UP_DOWN_BARS : ""}<c:marker val="1"/>${ids}</c:lineChart>`,
        )
      } else {
        groups.push(
          `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${series}${labels}${spec.dropLines ? `<c:dropLines/>` : ""}${ids}</c:areaChart>`,
        )
      }
    }
  }
  const axes = round
    ? ""
    : spec.type === "surface"
      ? axisXml(spec, "cat", [1, 2], {}) +
        // A contour shows no value axis: its legend gives the bands. The series run back (or up a contour).
        (spec.contour
          ? axisXml(spec, "val", [2, 1], {}).replace(
              `<c:delete val="${spec.axes.value ? 0 : 1}"/>`,
              `<c:delete val="1"/>`,
            )
          : axisXml(spec, "val", [2, 1], {})) +
        seriesAxis(spec.axes.value)
      : spec.type === "scatter"
        ? scatterAxes(spec)
        : axisXml(spec, "cat", [1, 2], {}) +
          axisXml(spec, "val", [2, 1], {}) +
          // The series axis of a deep 3-D chart: the app does not label its rows, so neither does Word.
          (spec.threeD === "deep" || (spec.threeD && spec.type === "line") ? seriesAxis(false) : "") +
          (shown.some((item) => item.serie.secondary)
            ? axisXml(spec, "val", [4, 3], { secondary: true }) +
              axisXml(spec, "cat", [3, 4], { secondary: true }).replace(`<c:delete val="0"/>`, `<c:delete val="1"/>`)
            : "")
  function seriesAxis(shownAxis: boolean) {
    return (
      `<c:serAx><c:axId val="3"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${shownAxis ? 0 : 1}"/>` +
      `<c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
      `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textProps(spec.format["axis:value"]?.color || look.text, 9)}` +
      `<c:crossAx val="2"/><c:crosses val="autoZero"/></c:serAx>`
    )
  }
  const table =
    spec.dataTable && !round
      ? `<c:dTable><c:showHorzBorder val="1"/><c:showVertBorder val="1"/><c:showOutline val="1"/><c:showKeys val="1"/>${textProps(look.text, 9)}</c:dTable>`
      : ""
  const plotFill = spec.format.plotArea?.fill || (look.plot === "none" ? undefined : look.plot)
  const plot = `<c:plotArea><c:layout/>${groups.join("")}${axes}${table}<c:spPr>${plotFill ? solid(plotFill) : "<a:noFill/>"}<a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`
  const legendPositions: Record<Exclude<LegendPosition, "none">, string> = {
    right: "r",
    left: "l",
    top: "t",
    bottom: "b",
  }
  const legend =
    spec.legend !== "none"
      ? `<c:legend><c:legendPos val="${legendPositions[spec.legend]}"/><c:overlay val="0"/>${textProps(spec.format.legend?.color || look.text, 9)}</c:legend>`
      : ""
  const titleFormat = spec.format.title
  const title = spec.title.show
    ? richTitle(
        spec.title.text,
        titleFormat?.color || look.text,
        titleFormat?.fontSize ?? 14,
        titleFormat?.bold ?? look.titleBold,
      )
    : ""
  // A surface is a 3-D chart in Word: a contour is the same seen from straight above.
  const walls = `<c:floor><c:thickness val="0"/></c:floor><c:sideWall><c:thickness val="0"/></c:sideWall><c:backWall><c:thickness val="0"/></c:backWall>`
  const view3d =
    spec.type !== "surface"
      ? spec.type === "pie" && spec.threeD && !spec.ofPie
        ? `<c:view3D><c:rotX val="30"/><c:rotY val="0"/><c:rAngAx val="0"/></c:view3D>`
        : spec.threeD && !round && spec.type !== "scatter"
          ? spec.threeD === "deep" || spec.type === "line"
            ? `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="0"/><c:perspective val="30"/></c:view3D>${walls}`
            : `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="1"/></c:view3D>${walls}`
          : ""
      : spec.contour
        ? `<c:view3D><c:rotX val="90"/><c:rotY val="0"/><c:rAngAx val="0"/><c:perspective val="0"/></c:view3D>${walls}`
        : `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="0"/><c:perspective val="30"/></c:view3D>${walls}`
  const area = spec.format.chartArea
  const areaLine = area?.line || look.border
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWING_NS}" xmlns:r="${REL_NS}">` +
    `<c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/>` +
    `<c:chart>${title}<c:autoTitleDeleted val="${spec.title.show ? 0 : 1}"/>${view3d}${plot}${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${solid(area?.fill || look.background)}<a:ln w="${Math.round((area?.lineWidth ?? 0.75) * 12700)}">${solid(areaLine)}</a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    (workbookRelId ? `<c:externalData r:id="${workbookRelId}"><c:autoUpdate val="0"/></c:externalData>` : "") +
    `</c:chartSpace>`
  )
}

/** The chart's data as a workbook Word opens for Edit Data: series across row 1, categories down column A. */
export function chartWorkbook(source: ChartSpec) {
  const spec = expandSpec(source)
  const encoder = new TextEncoder()
  const cell = (ref: string, value: string | number) =>
    typeof value === "number"
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${escapeXmlText(value)}</t></is></c>`
  const header = `<row r="1">${spec.series.map((serie, index) => cell(`${column(index + 1)}1`, serie.name)).join("")}</row>`
  const rows = spec.categories.map((name, row) => {
    const cells = [
      cell(`A${row + 2}`, name),
      ...spec.series.map((serie, index) => cell(`${column(index + 1)}${row + 2}`, serie.values[row] ?? 0)),
    ]
    return `<row r="${row + 2}">${cells.join("")}</row>`
  })
  const xml = (body: string) => encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`)
  return storedZip([
    {
      name: "[Content_Types].xml",
      data: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: xml(
        `<workbook xmlns="${SHEET_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/styles.xml",
      data: xml(
        `<styleSheet xmlns="${SHEET_NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
          `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
          `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: xml(`<worksheet xmlns="${SHEET_NS}"><sheetData>${header}${rows.join("")}</sheetData></worksheet>`),
    },
  ])
}

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

type Element = { name: string; attrs: Record<string, string>; children: Element[]; text: string }

function tree(xml: string): Element | null {
  const parser = new SaxesParser({ xmlns: false })
  const root: Element = { name: "#root", attrs: {}, children: [], text: "" }
  const stack = [root]
  let failed = false
  parser.on("error", () => {
    failed = true
  })
  parser.on("doctype", () => {
    failed = true
  })
  parser.on("opentag", (tag) => {
    const element: Element = { name: tag.name.replace(/^[^:]*:/, ""), attrs: {}, children: [], text: "" }
    for (const [key, value] of Object.entries(tag.attributes)) {
      if (key !== "xmlns" && !key.startsWith("xmlns:")) {
        element.attrs[key.slice(key.indexOf(":") + 1)] = String(value)
      }
    }
    stack[stack.length - 1]!.children.push(element)
    stack.push(element)
  })
  parser.on("text", (text) => {
    stack[stack.length - 1]!.text += text
  })
  parser.on("closetag", () => {
    stack.pop()
  })
  try {
    parser.write(xml)
    parser.close()
  } catch {
    return null
  }
  return failed ? null : (root.children[0] ?? null)
}

function child(element: Element | undefined, name: string) {
  return element?.children.find((item) => item.name === name)
}

function children(element: Element | undefined, name: string) {
  return element?.children.filter((item) => item.name === name) ?? []
}

function find(element: Element | undefined, name: string): Element | undefined {
  if (!element) {
    return undefined
  }
  for (const item of element.children) {
    if (item.name === name) {
      return item
    }
    const deeper = find(item, name)
    if (deeper) {
      return deeper
    }
  }
  return undefined
}

function value(element: Element | undefined, name: string) {
  return child(element, name)?.attrs.val
}

function flag(element: Element | undefined, name: string, fallback = false) {
  const raw = value(element, name)
  if (raw === undefined) {
    return child(element, name) ? true : fallback
  }
  return raw === "1" || raw === "true"
}

function texts(element: Element | undefined): string {
  if (!element) {
    return ""
  }
  if (element.name === "t") {
    return element.text
  }
  return element.children.map(texts).join("")
}

/** A cache's points, in order of their idx. */
function cachePoints(element: Element | undefined) {
  const cache =
    find(element, "strCache") ?? find(element, "numCache") ?? find(element, "strLit") ?? find(element, "numLit")
  if (!cache) {
    // A multi-level category axis: its first level.
    const level = find(find(element, "multiLvlStrCache"), "lvl")
    return level ? pointsOf(level) : []
  }
  return pointsOf(cache)
}

function pointsOf(cache: Element) {
  const count = Number(value(cache, "ptCount") ?? 0)
  const points: string[] = Array.from({ length: count }, () => "")
  for (const point of children(cache, "pt")) {
    const index = Number(point.attrs.idx ?? 0)
    points[index] = child(point, "v")?.text ?? ""
  }
  return points
}

function srgb(element: Element | undefined) {
  const fill = child(element, "solidFill")
  const color = child(fill, "srgbClr")?.attrs.val
  return color ? `#${color.toLowerCase()}` : undefined
}

const READ_LABELS: Record<string, LabelPosition> = {
  ctr: "center",
  inEnd: "insideEnd",
  inBase: "insideBase",
  outEnd: "outsideEnd",
  bestFit: "bestFit",
  t: "outsideEnd",
}

const READ_TRENDLINES: Record<string, TrendlineKind> = {
  linear: "linear",
  exp: "exponential",
  log: "logarithmic",
  movingAvg: "movingAverage",
  poly: "linear",
  power: "exponential",
}

const CHART_GROUPS = [
  "barChart",
  "bar3DChart",
  "lineChart",
  "line3DChart",
  "areaChart",
  "area3DChart",
  "pieChart",
  "pie3DChart",
  "ofPieChart",
  "doughnutChart",
  "scatterChart",
  "bubbleChart",
  "radarChart",
  "stockChart",
  "surfaceChart",
  "surface3DChart",
]

/** A Word chart part as a spec, or null when it is not a chart this app can draw. */
export function readChartSpace(xml: string): ChartSpec | null {
  const root = tree(xml)
  const chart = child(root ?? undefined, "chart")
  const plot = child(chart, "plotArea")
  if (!root || !chart || !plot) {
    return null
  }
  const groups = plot.children.filter((item) => CHART_GROUPS.includes(item.name))
  if (groups.length === 0) {
    return null
  }
  const spec = defaultChartSpec("column")
  const first = groups[0]!
  const typeOf = (name: string) => {
    if (name.startsWith("bar")) {
      return value(
        groups.find((item) => item.name === name),
        "barDir",
      ) === "bar"
        ? "bar"
        : "column"
    }
    if (name === "stockChart") {
      return "stock"
    }
    if (name.startsWith("line")) {
      return "line"
    }
    if (name.startsWith("surface")) {
      return "surface"
    }
    if (name.startsWith("area")) {
      return "area"
    }
    if (name.startsWith("pie") || name === "ofPieChart") {
      return "pie"
    }
    if (name === "doughnutChart") {
      return "doughnut"
    }
    if (name === "scatterChart" || name === "bubbleChart") {
      return "scatter"
    }
    return name === "radarChart" ? "radar" : "column"
  }
  spec.type = typeOf(first.name)
  const grouping = value(first, "grouping")
  spec.grouping = grouping === "stacked" ? "stacked" : grouping === "percentStacked" ? "percent" : "clustered"
  const categories: string[] = []
  spec.series = []
  for (const group of groups) {
    const groupType = typeOf(group.name)
    const secondary = (() => {
      const ids = children(group, "axId").map((item) => item.attrs.val)
      const valueAxes = children(plot, "valAx")
      const axis = valueAxes.find((item) => ids.includes(value(item, "axId") ?? ""))
      return valueAxes.length > 1 && axis !== undefined && axis !== valueAxes[0]
    })()
    for (const serie of children(group, "ser")) {
      const names = cachePoints(child(serie, "tx"))
      const own = child(serie, "tx")?.text?.trim()
      const vals = cachePoints(child(serie, "val") ?? child(serie, "yVal")).map((item) => Number(item) || 0)
      const cats = cachePoints(child(serie, "cat") ?? child(serie, "xVal"))
      if (cats.length > categories.length) {
        categories.splice(0, categories.length, ...cats)
      }
      const shape = child(serie, "spPr")
      const color = srgb(shape) ?? srgb(child(shape, "ln"))
      const trend = value(child(serie, "trendline"), "trendlineType")
      spec.series.push({
        name: names[0] || own || `Series ${spec.series.length + 1}`,
        values: vals,
        ...(groupType !== spec.type && (groupType === "line" || groupType === "area" || groupType === "column")
          ? { type: groupType }
          : {}),
        ...(secondary ? { secondary: true } : {}),
        ...(trend ? { trendline: READ_TRENDLINES[trend] ?? "linear" } : {}),
      })
      if (color) {
        spec.format[`series:${spec.series.length - 1}`] = { fill: color }
      }
      if (spec.type === "pie" || spec.type === "doughnut") {
        for (const point of children(serie, "dPt")) {
          const pointColor = srgb(child(point, "spPr"))
          if (pointColor) {
            spec.format[`point:${Number(value(point, "idx") ?? 0)}`] = { fill: pointColor }
          }
        }
        spec.explosion = Number(value(serie, "explosion") ?? 0)
      }
    }
  }
  const longest = Math.max(categories.length, ...spec.series.map((serie) => serie.values.length))
  spec.categories = Array.from({ length: longest }, (_, index) => categories[index] || String(index + 1))
  spec.series.forEach((serie) => {
    serie.values = spec.categories.map((_, index) => serie.values[index] ?? 0)
  })
  if (spec.series.length === 0) {
    return null
  }
  // Error bars, drop and high-low lines and up/down bars.
  const bars = groups.flatMap((group) => children(group, "ser")).find((serie) => child(serie, "errBars"))
  const barKind = READ_ERROR_KINDS[value(child(bars, "errBars"), "errValType") ?? ""]
  if (barKind) {
    spec.errorBars = { kind: barKind, amount: Number(value(child(bars, "errBars"), "val") ?? spec.errorBars.amount) }
  }
  spec.dropLines = groups.some((group) => Boolean(child(group, "dropLines")))
  spec.highLowLines = groups.some((group) => Boolean(child(group, "hiLowLines")))
  spec.upDownBars = groups.some((group) => Boolean(child(group, "upDownBars")))
  // The chart's own options.
  const markerFlag = value(first, "marker")
  const firstSerie = child(first, "ser")
  const symbol = value(child(firstSerie, "marker"), "symbol")
  if (spec.type === "line") {
    spec.markers = symbol !== undefined ? symbol !== "none" : markerFlag === "1"
    spec.smooth = flag(firstSerie, "smooth")
  } else if (spec.type === "scatter") {
    const style = value(first, "scatterStyle") ?? "marker"
    spec.smooth = style.startsWith("smooth") || flag(firstSerie, "smooth")
    spec.markers = symbol !== "none" && style !== "smooth" && style !== "line"
    const line = child(child(firstSerie, "spPr"), "ln")
    spec.lines = style !== "marker" && !child(line, "noFill")
  } else if (spec.type === "surface") {
    spec.contour = first.name === "surfaceChart"
    spec.filled = !flag(first, "wireframe")
  } else if (spec.type === "radar") {
    const style = value(first, "radarStyle")
    spec.filled = style === "filled"
    spec.markers = style === "marker" && symbol !== "none"
  } else if (spec.type === "column" || spec.type === "bar") {
    spec.gapWidth = Number(value(first, "gapWidth") ?? 150)
    spec.overlap = Number(value(first, "overlap") ?? (spec.grouping === "clustered" ? 0 : 100))
  } else if (spec.type === "pie" || spec.type === "doughnut") {
    spec.firstSliceAngle = Number(value(first, "firstSliceAng") ?? 0)
    spec.holeSize = Number(value(first, "holeSize") ?? 75)
  }
  // Word's 3-D charts: "standard" grouping puts each series in a row of its own; a 3-D line always does.
  if (["bar3DChart", "line3DChart", "area3DChart"].includes(first.name)) {
    spec.threeD = first.name === "line3DChart" || grouping === "standard" ? "deep" : "front"
  } else if (first.name === "pie3DChart") {
    spec.threeD = "front"
  } else if (first.name === "ofPieChart") {
    spec.ofPie = value(first, "ofPieType") === "bar" ? "bar" : "pie"
    const split = Number(value(first, "splitPos"))
    if ((value(first, "splitType") ?? "auto") === "pos" && Number.isFinite(split) && split > 0) {
      spec.ofPieSplit = split
    }
  }
  // Title.
  const title = child(chart, "title")
  const deleted = flag(chart, "autoTitleDeleted")
  spec.title = {
    // Without a title of its own, a chart of one series shows that series' name unless the title was deleted.
    show: Boolean(title) || (!deleted && spec.series.length === 1),
    text: texts(child(title, "tx")) || (spec.series.length === 1 ? spec.series[0]!.name : "Chart Title"),
  }
  // Axes.
  const valueAxes = children(plot, "valAx")
  const categoryAxis =
    child(plot, "catAx") ?? child(plot, "dateAx") ?? (spec.type === "scatter" ? valueAxes[0] : undefined)
  const valueAxis = spec.type === "scatter" ? valueAxes[1] : valueAxes[0]
  if (categoryAxis) {
    spec.axes.category = !flag(categoryAxis, "delete")
    spec.gridlines.vertical = Boolean(child(categoryAxis, "majorGridlines"))
    const axisTitle = child(categoryAxis, "title")
    spec.axisTitles.category = { show: Boolean(axisTitle), text: texts(axisTitle) || "Axis Title" }
    spec.categoryReverse = value(child(categoryAxis, "scaling"), "orientation") === "maxMin"
  }
  if (valueAxis) {
    spec.axes.value = !flag(valueAxis, "delete")
    spec.gridlines.major = Boolean(child(valueAxis, "majorGridlines"))
    spec.gridlines.minor = Boolean(child(valueAxis, "minorGridlines"))
    const axisTitle = child(valueAxis, "title")
    spec.axisTitles.value = { show: Boolean(axisTitle), text: texts(axisTitle) || "Axis Title" }
    const scaling = child(valueAxis, "scaling")
    const min = value(scaling, "min")
    const max = value(scaling, "max")
    const major = value(valueAxis, "majorUnit")
    const format = child(valueAxis, "numFmt")
    spec.valueAxis = {
      ...(min !== undefined ? { min: Number(min) } : {}),
      ...(max !== undefined ? { max: Number(max) } : {}),
      ...(major !== undefined ? { major: Number(major) } : {}),
      ...(value(scaling, "orientation") === "maxMin" ? { reverse: true } : {}),
      ...(child(scaling, "logBase") ? { log: true } : {}),
      ...(format &&
      format.attrs.sourceLinked !== "1" &&
      format.attrs.formatCode &&
      format.attrs.formatCode !== "General"
        ? { numberFormat: format.attrs.formatCode }
        : {}),
    }
  } else if (spec.type !== "pie" && spec.type !== "doughnut") {
    spec.axes.value = false
    spec.gridlines.major = false
  }
  if (spec.type === "surface" && spec.contour) {
    // A contour's value axis is hidden; whether its labels show is the series axis'.
    spec.axes.value = !flag(child(plot, "serAx"), "delete")
  }
  // Legend, data labels, data table.
  const legend = child(chart, "legend")
  const position = value(legend, "legendPos")
  spec.legend = legend
    ? (({ r: "right", l: "left", t: "top", b: "bottom", tr: "right" } as Record<string, LegendPosition>)[
        position ?? "r"
      ] ?? "right")
    : "none"
  const labels = child(first, "dLbls") ?? child(firstSerie, "dLbls")
  if (labels && !flag(labels, "delete")) {
    const content = {
      value: flag(labels, "showVal"),
      category: flag(labels, "showCatName"),
      series: flag(labels, "showSerName"),
      percent: flag(labels, "showPercent"),
    }
    if (content.value || content.category || content.series || content.percent) {
      spec.labelContent = content
      spec.dataLabels = READ_LABELS[value(labels, "dLblPos") ?? ""] ?? (spec.type === "pie" ? "bestFit" : "outsideEnd")
    } else {
      spec.dataLabels = "none"
    }
  } else {
    spec.dataLabels = "none"
  }
  spec.dataTable = Boolean(child(plot, "dTable"))
  // The chart area's fill and outline, and the plot area's fill.
  const areaShape = child(root, "spPr")
  const areaFill = srgb(areaShape)
  const areaLine = child(areaShape, "ln")
  if (areaFill && areaFill !== "#ffffff") {
    spec.format.chartArea = { fill: areaFill }
  }
  if (child(areaLine, "noFill")) {
    spec.format.chartArea = { ...spec.format.chartArea, line: "none" }
  }
  const plotFill = srgb(child(plot, "spPr"))
  if (plotFill) {
    spec.format.plotArea = { fill: plotFill }
  }
  const style = Number(value(root, "style") ?? 0)
  if (style >= 1 && style <= 48) {
    // Word 2007's style numbers: 1–8 are greys and palettes, 41–48 dark backgrounds.
    spec.style = style >= 41 ? 10 : 1
  }
  return normalizeChartSpec(spec)
}

/** The relationship id of the chart a drawing shows, from its `c:chart r:id`. */
export function chartRelId(drawingXml: string) {
  const match = /<(?:\w+:)?chart\b[^>]*\br:id="([^"]+)"/.exec(drawingXml)
  return match?.[1]
}
