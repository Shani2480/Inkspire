import { mapCountries, onMapCountries } from "@/editor/chart-map"
import { useObjectPreview } from "@/components/object-preview-hook"
import { TEMPLATE_PREFIX, applyChartTemplate, deleteChartTemplate, loadChartTemplates, saveChartTemplate } from "@/editor/chart-templates"
import { askText } from "@/components/text-prompt"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { MenuFlyout, MenuHeading, MenuRow, MenuSeparator, PreviewTile } from "@/components/shape-menus"
import {
  CHART_FAMILIES,
  CHART_PALETTES,
  CHART_STYLES,
  QUICK_LAYOUTS,
  chartSpecOf,
  defaultChartSpec,
  renderChart,
  serializeChartSpec,
  switchRowColumn,
  variantOf,
  withStyle,
  withVariant,
  type ChartSpec,
  type LabelPosition,
  type LegendPosition,
  type TrendlineKind,
} from "@/editor/chart-spec"
import type { ObjectRun } from "@/editor/object-preview"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { useState, useSyncExternalStore, type ReactNode } from "react"
import { create } from "zustand"

/**
 * Word's chart menus (20.8), shared by the Chart Design tab, the buttons beside a selected chart and the object
 * bar: Add Chart Element, Quick Layout, Change Colors, Chart Styles and Chart Filters, each previewed on hover.
 */

type MenuProps = { editor: Editor | null; close: () => void }

/** The selected chart, its place and its spec. */
export function selectedChart(editor: Editor | null) {
  const selection = editor?.state.selection
  if (!(selection instanceof NodeSelection)) {
    return null
  }
  const node = selection.node
  if (node.type.name !== "figure" || node.attrs.kind !== "chart") {
    return null
  }
  return { pos: selection.from, node, spec: chartSpecOf(node.attrs) }
}

/** The chart's new spec as an object change: one undo step, or a preview. */
export function chartChange(spec: ChartSpec): ObjectRun {
  return (chain) => chain.updateObject({ chart: serializeChartSpec(spec), variant: variantOf(spec) })
}

/** Applies a change to the selected chart's spec, as one undo step. */
export function changeChart(editor: Editor | null, change: (spec: ChartSpec) => ChartSpec) {
  const chart = selectedChart(editor)
  if (!editor || !chart) {
    return
  }
  chartChange(change(chart.spec))(editor.chain().focus()).run()
}

/** The part of the selected chart that is picked, as Word's Current Selection: "chartArea" when none is. */
export const useChartPart = create<{
  pos: number | null
  part: string
  select: (pos: number | null, part: string) => void
}>((set) => ({ pos: null, part: "chartArea", select: (pos, part) => set({ pos, part }) }))

export function currentPart(editor: Editor | null) {
  const chart = selectedChart(editor)
  const state = useChartPart.getState()
  return chart && state.pos === chart.pos ? state.part : "chartArea"
}

/** The Format pane for a chart part, on the right. */
export const useChartPane = create<{
  open: boolean
  show: (part?: string) => void
  hide: () => void
}>((set) => ({
  open: false,
  show: (part) => {
    if (part) {
      useChartPart.setState({ part })
    }
    set({ open: true })
  },
  hide: () => set({ open: false }),
}))

/** Opens the Format pane on a part of the selected chart. */
export function formatChartPart(editor: Editor | null, part: string) {
  const chart = selectedChart(editor)
  if (chart) {
    useChartPart.getState().select(chart.pos, part)
  }
  useChartPane.getState().show(part)
}

/** The chart drawn small: a gallery tile or a variant's picture. */
export function ChartThumb({ spec, width = 96, height = 60 }: { spec: ChartSpec; width?: number; height?: number }) {
  // A map tile is drawn again once the country outlines have loaded.
  useSyncExternalStore(onMapCountries, mapCountries)
  // Drawn as a chart at least 320 wide and shrunk, so text and plot keep the share they have on the page.
  const scale = Math.max(2.6, 320 / width)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const svg = renderChart(spec, w, h)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="chart-thumb"
      dangerouslySetInnerHTML={{ __html: width < 140 ? textAsBars(svg) : svg }}
    />
  )
}

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]

/**
 * A small thumbnail's text as short bars, as Word draws its gallery thumbnails: words a few pixels high are only a
 * smudge, but a bar still shows where the title, legend and labels are.
 */
export function textAsBars(svg: string) {
  return svg.replace(/<text([^>]*)>([^<]*)<\/text>/g, (_match, attrs: string, content: string) => {
    const size = Number(attr(attrs, "font-size")) || 12
    const length = content.replace(/&[a-z#0-9]+;/gi, "x").trim().length
    if (!length) {
      return ""
    }
    const width = Math.max(size * 0.8, length * size * 0.5)
    const x = Number(attr(attrs, "x") ?? 0)
    const y = Number(attr(attrs, "y") ?? 0)
    const anchor = attr(attrs, "text-anchor")
    const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x
    const transform = attr(attrs, "transform")
    const part = attr(attrs, "data-chart-part")
    return (
      `<rect${part ? ` data-chart-part="${part}"` : ""} x="${left.toFixed(1)}" y="${(y - size * 0.68).toFixed(1)}" width="${width.toFixed(1)}" height="${(size * 0.55).toFixed(1)}" rx="${(size * 0.15).toFixed(1)}"` +
      ` fill="${attr(attrs, "fill") ?? "#595959"}" fill-opacity="0.55"${transform ? ` transform="${transform}"` : ""}/>`
    )
  })
}

// --- Add Chart Element ------------------------------------------------------------------------------------------

type Choice = { label: string; change: (spec: ChartSpec) => ChartSpec; on: (spec: ChartSpec) => boolean }

const LABEL_CHOICES: [LabelPosition, string][] = [
  ["none", "None"],
  ["center", "Center"],
  ["insideEnd", "Inside End"],
  ["insideBase", "Inside Base"],
  ["outsideEnd", "Outside End"],
]

const LEGEND_CHOICES: [LegendPosition, string][] = [
  ["none", "None"],
  ["right", "Right"],
  ["top", "Top"],
  ["left", "Left"],
  ["bottom", "Bottom"],
]

const TRENDLINE_CHOICES: [TrendlineKind, string][] = [
  ["none", "None"],
  ["linear", "Linear"],
  ["exponential", "Exponential"],
  ["logarithmic", "Logarithmic"],
  ["movingAverage", "Two Period Moving Average"],
]

const ERROR_BAR_CHOICES: [ChartSpec["errorBars"]["kind"], string, number?][] = [
  ["none", "None"],
  ["stderr", "Standard Error"],
  ["percent", "Percentage", 5],
  ["stddev", "Standard Deviation", 1],
  ["fixed", "Fixed Value", 1],
]

/** A chart with no axes: pie and doughnut, and a map. */
function isRound(spec: ChartSpec) {
  return spec.type === "pie" || spec.type === "doughnut" || spec.type === "map"
}

/** Word's chart elements, each with its placements and the Format pane part its More Options opens. */
export function chartElements(spec: ChartSpec): {
  id: string
  label: string
  part: string
  more: string
  shown: boolean
  toggle: (spec: ChartSpec) => ChartSpec
  choices: Choice[]
  disabled?: boolean
}[] {
  const round = isRound(spec)
  const horizontal = spec.type === "bar"
  const trendable = !round && spec.type !== "radar" && spec.grouping === "clustered"
  return [
    {
      id: "axes",
      label: "Axes",
      part: "axis:value",
      more: "More Axis Options…",
      shown: !round && (spec.axes.category || spec.axes.value),
      disabled: round,
      toggle: (current) => {
        const on = !(current.axes.category || current.axes.value)
        return { ...current, axes: { category: on, value: on } }
      },
      choices: [
        {
          label: "Primary Horizontal",
          on: (current) => (horizontal ? current.axes.value : current.axes.category),
          change: (current) =>
            horizontal
              ? { ...current, axes: { ...current.axes, value: !current.axes.value } }
              : { ...current, axes: { ...current.axes, category: !current.axes.category } },
        },
        {
          label: "Primary Vertical",
          on: (current) => (horizontal ? current.axes.category : current.axes.value),
          change: (current) =>
            horizontal
              ? { ...current, axes: { ...current.axes, category: !current.axes.category } }
              : { ...current, axes: { ...current.axes, value: !current.axes.value } },
        },
      ],
    },
    {
      id: "axisTitles",
      label: "Axis Titles",
      part: "axisTitle:value",
      more: "More Axis Title Options…",
      shown: !round && (spec.axisTitles.category.show || spec.axisTitles.value.show),
      disabled: round,
      toggle: (current) => {
        const on = !(current.axisTitles.category.show || current.axisTitles.value.show)
        return {
          ...current,
          axisTitles: {
            category: { ...current.axisTitles.category, show: on },
            value: { ...current.axisTitles.value, show: on },
          },
        }
      },
      choices: (["category", "value"] as const).map((axis) => ({
        label: (axis === "category") !== horizontal ? "Primary Horizontal" : "Primary Vertical",
        on: (current: ChartSpec) => current.axisTitles[axis].show,
        change: (current: ChartSpec) => ({
          ...current,
          axisTitles: {
            ...current.axisTitles,
            [axis]: { ...current.axisTitles[axis], show: !current.axisTitles[axis].show },
          },
        }),
      })),
    },
    {
      id: "title",
      label: "Chart Title",
      part: "title",
      more: "More Title Options…",
      shown: spec.title.show,
      toggle: (current) => ({ ...current, title: { ...current.title, show: !current.title.show } }),
      choices: [
        {
          label: "None",
          on: (current) => !current.title.show,
          change: (current) => ({ ...current, title: { ...current.title, show: false } }),
        },
        {
          label: "Above Chart",
          on: (current) => current.title.show,
          change: (current) => ({ ...current, title: { ...current.title, show: true } }),
        },
      ],
    },
    {
      id: "dataLabels",
      label: "Data Labels",
      part: "dataLabels",
      more: "More Data Label Options…",
      shown: spec.dataLabels !== "none",
      toggle: (current) => ({
        ...current,
        dataLabels: current.dataLabels === "none" ? (isRound(current) ? "bestFit" : "outsideEnd") : "none",
      }),
      choices: (round
        ? ([
            ["none", "None"],
            ["center", "Center"],
            ["insideEnd", "Inside End"],
            ["outsideEnd", "Outside End"],
            ["bestFit", "Best Fit"],
          ] as [LabelPosition, string][])
        : spec.type === "line" || spec.type === "scatter" || spec.type === "area" || spec.type === "radar"
          ? ([
              ["none", "None"],
              ["center", "Center"],
              ["outsideEnd", "Above"],
            ] as [LabelPosition, string][])
          : LABEL_CHOICES
      ).map(([position, label]) => ({
        label,
        on: (current: ChartSpec) => current.dataLabels === position,
        change: (current: ChartSpec) => ({ ...current, dataLabels: position }),
      })),
    },
    {
      id: "dataTable",
      label: "Data Table",
      part: "dataTable",
      more: "More Data Table Options…",
      shown: spec.dataTable,
      disabled: round || horizontal || spec.type === "scatter" || spec.type === "radar",
      toggle: (current) => ({ ...current, dataTable: !current.dataTable }),
      choices: [
        { label: "None", on: (current) => !current.dataTable, change: (current) => ({ ...current, dataTable: false }) },
        {
          label: "With Legend Keys",
          on: (current) => current.dataTable,
          change: (current) => ({ ...current, dataTable: true }),
        },
      ],
    },
    {
      id: "gridlines",
      label: "Gridlines",
      part: "gridlines",
      more: "More Gridline Options…",
      shown: !round && (spec.gridlines.major || spec.gridlines.minor || spec.gridlines.vertical),
      disabled: round,
      toggle: (current) => ({ ...current, gridlines: { ...current.gridlines, major: !current.gridlines.major } }),
      choices: [
        {
          label: horizontal ? "Primary Major Vertical" : "Primary Major Horizontal",
          on: (current) => current.gridlines.major,
          change: (current) => ({ ...current, gridlines: { ...current.gridlines, major: !current.gridlines.major } }),
        },
        {
          label: horizontal ? "Primary Major Horizontal" : "Primary Major Vertical",
          on: (current) => current.gridlines.vertical,
          change: (current) => ({
            ...current,
            gridlines: { ...current.gridlines, vertical: !current.gridlines.vertical },
          }),
        },
        {
          label: horizontal ? "Primary Minor Vertical" : "Primary Minor Horizontal",
          on: (current) => current.gridlines.minor,
          change: (current) => ({ ...current, gridlines: { ...current.gridlines, minor: !current.gridlines.minor } }),
        },
      ],
    },
    {
      id: "legend",
      label: "Legend",
      part: "legend",
      more: "More Legend Options…",
      shown: spec.legend !== "none",
      toggle: (current) => ({ ...current, legend: current.legend === "none" ? "right" : "none" }),
      choices: LEGEND_CHOICES.map(([position, label]) => ({
        label,
        on: (current: ChartSpec) => current.legend === position,
        change: (current: ChartSpec) => ({ ...current, legend: position }),
      })),
    },
    {
      id: "errorBars",
      label: "Error Bars",
      part: "series:0",
      more: "More Error Bars Options…",
      shown: spec.errorBars.kind !== "none",
      disabled: round || spec.type === "radar",
      toggle: (current) => ({
        ...current,
        errorBars: { ...current.errorBars, kind: current.errorBars.kind === "none" ? "stderr" : "none" },
      }),
      choices: ERROR_BAR_CHOICES.map(([kind, label, amount]) => ({
        label,
        on: (current: ChartSpec) => current.errorBars.kind === kind,
        change: (current: ChartSpec) => ({
          ...current,
          errorBars: { kind, amount: amount ?? current.errorBars.amount },
        }),
      })),
    },
    {
      id: "lines",
      label: "Lines",
      part: "series:0",
      more: "More Lines Options…",
      shown: spec.dropLines || spec.highLowLines,
      disabled: !(spec.type === "line" || spec.type === "area"),
      toggle: (current) => ({
        ...current,
        dropLines: !(current.dropLines || current.highLowLines),
        highLowLines: false,
      }),
      choices: [
        {
          label: "None",
          on: (current) => !current.dropLines && !current.highLowLines,
          change: (current) => ({ ...current, dropLines: false, highLowLines: false }),
        },
        {
          label: "Drop Lines",
          on: (current) => current.dropLines,
          change: (current) => ({ ...current, dropLines: !current.dropLines }),
        },
        {
          label: "High-Low Lines",
          on: (current) => current.highLowLines,
          change: (current) => ({ ...current, highLowLines: !current.highLowLines }),
        },
      ],
    },
    {
      id: "upDownBars",
      label: "Up/Down Bars",
      part: "series:0",
      more: "More Up/Down Bars Options…",
      shown: spec.upDownBars,
      disabled: !(spec.type === "line" && spec.series.length > 1),
      toggle: (current) => ({ ...current, upDownBars: !current.upDownBars }),
      choices: [
        {
          label: "None",
          on: (current) => !current.upDownBars,
          change: (current) => ({ ...current, upDownBars: false }),
        },
        {
          label: "Up/Down Bars",
          on: (current) => current.upDownBars,
          change: (current) => ({ ...current, upDownBars: true }),
        },
      ],
    },
    {
      id: "trendline",
      label: "Trendline",
      part: "series:0",
      more: "More Trendline Options…",
      shown: spec.series.some((serie) => serie.trendline && serie.trendline !== "none"),
      disabled: !trendable,
      toggle: (current) => {
        const on = !current.series.some((serie) => serie.trendline && serie.trendline !== "none")
        return {
          ...current,
          series: current.series.map((serie, index) =>
            index === 0 ? { ...serie, trendline: on ? "linear" : "none" } : { ...serie, trendline: "none" },
          ),
        }
      },
      choices: TRENDLINE_CHOICES.map(([kind, label]) => ({
        label,
        on: (current: ChartSpec) => (current.series[0]?.trendline ?? "none") === kind,
        change: (current: ChartSpec) => ({
          ...current,
          series: current.series.map((serie, index) => (index === 0 ? { ...serie, trendline: kind } : serie)),
        }),
      })),
    },
  ]
}

/** Design > Add Chart Element: each element's placements, previewed on hover, and its More Options. */
export function AddChartElementMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return <div className="shape-menu-empty">Select a chart.</div>
  }
  const spec = chart.spec
  return (
    <div className="shape-menu" role="menu" onMouseLeave={() => preview?.restore()}>
      {chartElements(spec).map((element) => (
        <MenuFlyout key={element.id} label={element.label} disabled={element.disabled}>
          {element.choices.map((choice) => (
            <MenuRow
              key={choice.label}
              checked={choice.on(spec)}
              onEnter={() => preview?.preview(chartChange(choice.change(spec)))}
              onClick={() => {
                preview?.commit(chartChange(choice.change(spec)))
                close()
              }}
            >
              {choice.label}
            </MenuRow>
          ))}
          <MenuSeparator />
          <MenuRow
            onEnter={() => preview?.restore()}
            onClick={() => {
              close()
              formatChartPart(editor, element.part)
            }}
          >
            {element.more}
          </MenuRow>
        </MenuFlyout>
      ))}
    </div>
  )
}

// --- Quick Layout, Change Colors, Chart Styles -----------------------------------------------------------------

export function QuickLayoutMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return <div className="shape-menu-empty">Select a chart.</div>
  }
  return (
    <div className="chart-gallery chart-gallery-layouts" onMouseLeave={() => preview?.restore()}>
      {QUICK_LAYOUTS.map((layout) => {
        const next = layout.apply(chart.spec)
        return (
          <PreviewTile
            key={layout.id}
            label={layout.label}
            className="chart-tile"
            preview={preview}
            run={chartChange(next)}
            close={close}
          >
            <ChartThumb spec={next} width={64} height={48} />
          </PreviewTile>
        )
      })}
    </div>
  )
}

export function ChartColorsMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return <div className="shape-menu-empty">Select a chart.</div>
  }
  return <PaletteList spec={chart.spec} preview={preview} close={close} />
}

function PaletteList({
  spec,
  preview,
  close,
}: {
  spec: ChartSpec
  preview: ReturnType<typeof useObjectPreview>
  close?: () => void
}) {
  return (
    <div className="chart-palettes" onMouseLeave={() => preview?.restore()}>
      {(["Colorful", "Monochromatic"] as const).map((group) => (
        <div key={group}>
          <MenuHeading>{group}</MenuHeading>
          {CHART_PALETTES.filter((palette) => palette.group === group).map((palette) => {
            // A palette replaces any colour set on a series or slice.
            const format = Object.fromEntries(
              Object.entries(spec.format).map(([part, value]) =>
                part.startsWith("series:") || part.startsWith("point:")
                  ? [part, { ...value, fill: undefined }]
                  : [part, value],
              ),
            )
            return (
              <PreviewTile
                key={palette.id}
                label={palette.label}
                className="chart-palette-row"
                selected={spec.palette === palette.id}
                preview={preview}
                run={chartChange({ ...spec, palette: palette.id, format })}
                close={close}
              >
                {palette.colors.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </PreviewTile>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** The fourteen chart styles as tiles, drawn from the chart itself. */
export function ChartStylesGallery({
  editor,
  close,
  count = CHART_STYLES.length,
  start = 0,
  size = { width: 72, height: 48 },
}: {
  editor: Editor | null
  close?: () => void
  count?: number
  start?: number
  size?: { width: number; height: number }
}) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return null
  }
  return (
    <div className="chart-gallery" onMouseLeave={() => preview?.restore()}>
      {CHART_STYLES.slice(start, start + count).map((_, offset) => {
        const style = start + offset + 1
        const next = withStyle(chart.spec, style)
        return (
          <PreviewTile
            key={style}
            label={`Style ${style}`}
            className="chart-tile"
            selected={chart.spec.style === style}
            preview={preview}
            run={chartChange(next)}
            close={close}
          >
            <ChartThumb spec={next} width={size.width} height={size.height} />
          </PreviewTile>
        )
      })}
    </div>
  )
}

export function ChartStylesMenu({ editor, close }: MenuProps) {
  return (
    <div className="chart-styles-menu">
      <ChartStylesGallery editor={editor} close={close} />
    </div>
  )
}

// --- The buttons beside a chart -------------------------------------------------------------------------------

/** Chart Elements (+): a check box per element, with a flyout of its placements. */
export function ChartElementsPanel({ editor }: { editor: Editor | null }) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return null
  }
  const spec = chart.spec
  return (
    <div className="chart-side-panel" role="dialog" aria-label="Chart Elements" onMouseLeave={() => preview?.restore()}>
      <div className="chart-side-title">Chart Elements</div>
      {chartElements(spec)
        .filter((element) => !element.disabled)
        .map((element) => (
          <div key={element.id} className="chart-element-row menu-flyout">
            <label onMouseEnter={() => preview?.preview(chartChange(element.toggle(spec)))}>
              <input
                type="checkbox"
                checked={element.shown}
                onChange={() => preview?.commit(chartChange(element.toggle(spec)))}
              />
              {element.label}
            </label>
            <button
              type="button"
              className="chart-element-more"
              aria-label={`${element.label} options`}
              aria-haspopup="menu"
            >
              ›
            </button>
            <div className="menu-flyout-panel">
              {element.choices.map((choice) => (
                <MenuRow
                  key={choice.label}
                  checked={choice.on(spec)}
                  onEnter={() => preview?.preview(chartChange(choice.change(spec)))}
                  onClick={() => preview?.commit(chartChange(choice.change(spec)))}
                >
                  {choice.label}
                </MenuRow>
              ))}
              <MenuSeparator />
              <MenuRow onClick={() => formatChartPart(editor, element.part)}>{element.more}</MenuRow>
            </div>
          </div>
        ))}
    </div>
  )
}

/** Chart Styles (brush): a Style tab and a Color tab. */
export function ChartStylesPanel({ editor }: { editor: Editor | null }) {
  const [tab, setTab] = useState<"style" | "color">("style")
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return null
  }
  return (
    <div className="chart-side-panel chart-side-wide" role="dialog" aria-label="Chart Styles">
      <div className="chart-side-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "style"} onClick={() => setTab("style")}>
          Style
        </button>
        <button type="button" role="tab" aria-selected={tab === "color"} onClick={() => setTab("color")}>
          Color
        </button>
      </div>
      <div className="chart-side-scroll">
        {tab === "style" ? (
          <ChartStylesGallery editor={editor} size={{ width: 120, height: 76 }} />
        ) : (
          <>
            <PaletteList spec={chart.spec} preview={preview} />
            <p className="chart-side-help">
              How do I change these colors? Pick a palette above, or colour one series from Format Data Series.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Chart Filters (funnel): which series and categories show, applied with Apply as Word does. */
export function ChartFiltersPanel({ editor, close }: { editor: Editor | null; close?: () => void }) {
  const chart = selectedChart(editor)
  const [hiddenSeries, setHiddenSeries] = useState<number[]>(() =>
    (chart?.spec.series ?? []).flatMap((serie, index) => (serie.hidden ? [index] : [])),
  )
  const [hiddenCategories, setHiddenCategories] = useState<number[]>(() => chart?.spec.hiddenCategories ?? [])
  const [tab, setTab] = useState<"values" | "names">("values")
  const preview = useObjectPreview(editor)
  if (!chart) {
    return null
  }
  const spec = chart.spec
  const filtered = (series: number[], categories: number[]): ChartSpec => ({
    ...spec,
    series: spec.series.map((serie, index) => ({ ...serie, hidden: series.includes(index) || undefined })),
    hiddenCategories: categories,
  })
  const toggle = (list: number[], index: number) =>
    list.includes(index) ? list.filter((item) => item !== index) : [...list, index]
  const row = (label: string, checked: boolean, onChange: () => void, onEnter: () => void, key: string) => (
    <label key={key} className="chart-filter-row" onMouseEnter={onEnter}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
  return (
    <div
      className="chart-side-panel chart-side-wide"
      role="dialog"
      aria-label="Chart Filters"
      onMouseLeave={() => preview?.restore()}
    >
      <div className="chart-side-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "values"} onClick={() => setTab("values")}>
          Values
        </button>
        <button type="button" role="tab" aria-selected={tab === "names"} onClick={() => setTab("names")}>
          Names
        </button>
      </div>
      <div className="chart-side-scroll">
        {tab === "values" ? (
          <>
            <label className="chart-filter-row">
              <input
                type="checkbox"
                checked={!hiddenSeries.length && !hiddenCategories.length}
                onChange={(event) => {
                  const all = event.target.checked
                  setHiddenSeries(all ? [] : spec.series.map((_, index) => index))
                  setHiddenCategories(all ? [] : spec.categories.map((_, index) => index))
                }}
              />
              (Select All)
            </label>
            <MenuHeading>Series</MenuHeading>
            {spec.series.map((serie, index) =>
              row(
                serie.name,
                !hiddenSeries.includes(index),
                () => setHiddenSeries(toggle(hiddenSeries, index)),
                () => preview?.preview(chartChange(filtered(toggle(hiddenSeries, index), hiddenCategories))),
                `s${index}`,
              ),
            )}
            <MenuHeading>Categories</MenuHeading>
            {spec.categories.map((name, index) =>
              row(
                name,
                !hiddenCategories.includes(index),
                () => setHiddenCategories(toggle(hiddenCategories, index)),
                () => preview?.preview(chartChange(filtered(hiddenSeries, toggle(hiddenCategories, index)))),
                `c${index}`,
              ),
            )}
          </>
        ) : (
          <div className="chart-filter-names">
            <MenuHeading>Series</MenuHeading>
            {spec.series.map((serie, index) => (
              <div key={index}>{serie.name}</div>
            ))}
            <MenuHeading>Categories</MenuHeading>
            {spec.categories.map((name, index) => (
              <div key={index}>{name}</div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-side-footer">
        <button
          type="button"
          className="dialog-btn is-primary"
          onClick={() => {
            preview?.commit(chartChange(filtered(hiddenSeries, hiddenCategories)))
            close?.()
          }}
        >
          Apply
        </button>
        <button type="button" className="dialog-btn" onClick={() => editor && useSelectDataDialog.getState().show()}>
          Select Data…
        </button>
      </div>
    </div>
  )
}

// --- Dialogs ----------------------------------------------------------------------------------------------------

export const useChartTypeDialog = create<{
  mode: "insert" | "change" | null
  show: (mode: "insert" | "change") => void
  hide: () => void
}>((set) => ({ mode: null, show: (mode) => set({ mode }), hide: () => set({ mode: null }) }))

export const useSelectDataDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

const RECENT_KEY = "inkspire.recentCharts"

function recentCharts(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown
    return Array.isArray(value) ? value.map(String).slice(0, 8) : []
  } catch {
    return []
  }
}

function rememberChart(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCharts().filter((item) => item !== id)].slice(0, 8)))
  } catch {
    // Recent charts are a convenience.
  }
}

/** Save as Template…: asks for a name and keeps the selected chart's type and look under it. */
export async function saveChartAsTemplate(editor: Editor | null) {
  const chart = selectedChart(editor)
  if (!chart) {
    return
  }
  const name = await askText({
    title: "Save Chart Template",
    label: "Template name:",
    value: chart.spec.title.show && chart.spec.title.text !== "Chart Title" ? chart.spec.title.text : "Chart Template",
    ok: "Save",
  })
  if (name?.trim()) {
    saveChartTemplate(name, chart.spec)
  }
}

/** Word's Insert Chart and Change Chart Type dialog: the types on the left, their variants and a large preview. */
export function ChartTypeDialog({ editor }: { editor: Editor | null }) {
  const mode = useChartTypeDialog((state) => state.mode)
  const hide = useChartTypeDialog((state) => state.hide)
  if (!mode || !editor) {
    return null
  }
  return <ChartTypeDialogBody editor={editor} mode={mode} onClose={hide} />
}

function ChartTypeDialogBody({
  editor,
  mode,
  onClose,
}: {
  editor: Editor
  mode: "insert" | "change"
  onClose: () => void
}) {
  const chart = mode === "change" ? selectedChart(editor) : null
  const current = chart ? variantOf(chart.spec) : "column"
  const [family, setFamily] = useState(() =>
    chart
      ? (CHART_FAMILIES.find((item) => item.items.some((variant) => variant.id === current))?.id ?? "column")
      : "column",
  )
  const [picked, setPicked] = useState(current)
  const [templates, setTemplates] = useState(loadChartTemplates)
  const recent = recentCharts()
  const families = [
    {
      id: "recent",
      label: "Recent",
      items: CHART_FAMILIES.flatMap((item) => item.items).filter((item) => recent.includes(item.id)),
    },
    {
      id: "templates",
      label: "Templates",
      items: templates.map((item) => ({ id: `${TEMPLATE_PREFIX}${item.id}`, label: item.name, type: item.spec.type })),
    },
    ...CHART_FAMILIES,
  ]
  const shown = families.find((item) => item.id === family) ?? families[2]!
  const templateOf = (id: string) =>
    id.startsWith(TEMPLATE_PREFIX) ? templates.find((item) => `${TEMPLATE_PREFIX}${item.id}` === id) : undefined
  // Inserting previews the chart Insert will make, with the type's own sample data (prices for Stock, a funnel's
  // stages) or the data a template was saved with; changing a chart's type previews that chart.
  const sample = (id: string) => {
    const template = templateOf(id)
    if (template) {
      return chart ? applyChartTemplate(chart.spec, template.spec) : template.spec
    }
    return chart ? withVariant(chart.spec, id) : defaultChartSpec(id)
  }
  const finish = () => {
    const template = templateOf(picked)
    if (template) {
      if (mode === "insert") {
        editor.chain().focus().insertFigure("chart", variantOf(template.spec), undefined, template.spec).run()
      } else {
        changeChart(editor, (spec) => applyChartTemplate(spec, template.spec))
      }
      onClose()
      return
    }
    if (picked.startsWith(TEMPLATE_PREFIX)) {
      return
    }
    rememberChart(picked)
    if (mode === "insert") {
      editor.chain().focus().insertFigure("chart", picked).run()
    } else {
      changeChart(editor, (spec) => withVariant(spec, picked))
    }
    onClose()
  }
  const label = families.flatMap((item) => item.items).find((item) => item.id === picked)?.label ?? ""
  const pickedTemplate = templateOf(picked)
  return (
    <DialogFrame title={mode === "insert" ? "Insert Chart" : "Change Chart Type"} width={720} onClose={onClose}>
      <div className="chart-type-body">
        <nav className="chart-type-list" aria-label="Chart types">
          {families.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={family === item.id}
              disabled={item.id === "recent" && item.items.length === 0}
              onClick={() => {
                setFamily(item.id)
                if (item.items[0]) {
                  setPicked(item.items[0].id)
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="chart-type-main">
          {shown.id === "templates" && shown.items.length === 0 ? (
            <p className="chart-type-empty">
              No chart templates yet. Right-click a chart and choose Save as Template… to keep its type and look here.
            </p>
          ) : (
            <div className="chart-type-variants" role="listbox" aria-label={shown.label}>
              {shown.items.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  role="option"
                  aria-selected={picked === variant.id}
                  title={variant.label}
                  aria-label={variant.label}
                  className="chart-tile"
                  onClick={() => setPicked(variant.id)}
                  onDoubleClick={() => {
                    setPicked(variant.id)
                    finish()
                  }}
                >
                  <ChartThumb spec={sample(variant.id)} width={72} height={50} />
                </button>
              ))}
            </div>
          )}
          {shown.id === "templates" && shown.items.length === 0 ? null : (
            <>
              <div className="chart-type-name">
                {label}
                {pickedTemplate && shown.id === "templates" ? (
                  <button
                    type="button"
                    className="dialog-btn chart-template-delete"
                    onClick={() => {
                      deleteChartTemplate(pickedTemplate.id)
                      const rest = loadChartTemplates()
                      setTemplates(rest)
                      setPicked(rest[0] ? `${TEMPLATE_PREFIX}${rest[0].id}` : current)
                    }}
                  >
                    Delete Template
                  </button>
                ) : null}
              </div>
              <div className="chart-type-preview">
                <ChartThumb spec={sample(picked)} width={330} height={200} />
              </div>
            </>
          )}
        </div>
      </div>
      <DialogButtons
        onOk={finish}
        onCancel={onClose}
        okDisabled={(picked.startsWith(TEMPLATE_PREFIX) || shown.id === "templates") && !pickedTemplate}
      />
    </DialogFrame>
  )
}

/** Word's Select Data Source: series to add, rename, remove, reorder and hide, and categories to rename and hide. */
export function SelectDataDialog({ editor }: { editor: Editor | null }) {
  const open = useSelectDataDialog((state) => state.open)
  const hide = useSelectDataDialog((state) => state.hide)
  const chart = selectedChart(editor)
  if (!open || !editor || !chart) {
    return null
  }
  return <SelectDataBody editor={editor} start={chart.spec} onClose={hide} />
}

function SelectDataBody({ editor, start, onClose }: { editor: Editor; start: ChartSpec; onClose: () => void }) {
  const [spec, setSpec] = useState(start)
  const [series, setSeries] = useState(0)
  const [category, setCategory] = useState(0)
  const updateSeries = (index: number, change: Partial<ChartSpec["series"][number]>) =>
    setSpec((current) => ({
      ...current,
      series: current.series.map((serie, place) => (place === index ? { ...serie, ...change } : serie)),
    }))
  const move = (by: number) =>
    setSpec((current) => {
      const target = series + by
      if (target < 0 || target >= current.series.length) {
        return current
      }
      const next = [...current.series]
      const [item] = next.splice(series, 1)
      next.splice(target, 0, item!)
      setSeries(target)
      // Colours set on a series go with it.
      const format = { ...current.format }
      const from = current.format[`series:${series}`]
      const to = current.format[`series:${target}`]
      delete format[`series:${series}`]
      delete format[`series:${target}`]
      if (from) {
        format[`series:${target}`] = from
      }
      if (to) {
        format[`series:${series}`] = to
      }
      return { ...current, series: next, format }
    })
  const button = (label: string, onClick: () => void, disabled = false): ReactNode => (
    <button type="button" className="dialog-btn" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
  return (
    <DialogFrame title="Select Data Source" width={620} onClose={onClose}>
      <div className="select-data-switch">
        {button("Switch Row/Column", () => {
          setSpec((current) => switchRowColumn(current))
          setSeries(0)
          setCategory(0)
        })}
      </div>
      <div className="select-data-body">
        <section>
          <h3>Legend Entries (Series)</h3>
          <div className="select-data-tools">
            {button("Add", () =>
              setSpec((current) => ({
                ...current,
                series: [
                  ...current.series,
                  { name: `Series ${current.series.length + 1}`, values: current.categories.map(() => 0) },
                ],
              })),
            )}
            {button(
              "Edit",
              () => {
                void askText({
                  title: "Edit Series",
                  label: "Series name:",
                  value: spec.series[series]?.name ?? "",
                }).then((name) => {
                  if (name != null) {
                    updateSeries(series, { name })
                  }
                })
              },
              !spec.series[series],
            )}
            {button(
              "Remove",
              () => {
                setSpec((current) => ({ ...current, series: current.series.filter((_, index) => index !== series) }))
                setSeries(Math.max(0, series - 1))
              },
              spec.series.length <= 1,
            )}
            {button("▲", () => move(-1), series === 0)}
            {button("▼", () => move(1), series >= spec.series.length - 1)}
          </div>
          <ul className="select-data-list" role="listbox" aria-label="Series">
            {spec.series.map((serie, index) => (
              <li key={index} role="option" aria-selected={index === series} onClick={() => setSeries(index)}>
                <input
                  type="checkbox"
                  aria-label={`Show ${serie.name}`}
                  checked={!serie.hidden}
                  onChange={() => updateSeries(index, { hidden: serie.hidden ? undefined : true })}
                />
                {serie.name}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Horizontal (Category) Axis Labels</h3>
          <div className="select-data-tools">
            {button(
              "Edit",
              () => {
                void askText({
                  title: "Edit Category",
                  label: "Category name:",
                  value: spec.categories[category] ?? "",
                }).then((name) => {
                  if (name != null) {
                    setSpec((current) => ({
                      ...current,
                      categories: current.categories.map((item, index) => (index === category ? name : item)),
                    }))
                  }
                })
              },
              !spec.categories[category],
            )}
          </div>
          <ul className="select-data-list" role="listbox" aria-label="Categories">
            {spec.categories.map((name, index) => (
              <li key={index} role="option" aria-selected={index === category} onClick={() => setCategory(index)}>
                <input
                  type="checkbox"
                  aria-label={`Show ${name}`}
                  checked={!spec.hiddenCategories.includes(index)}
                  onChange={() =>
                    setSpec((current) => ({
                      ...current,
                      hiddenCategories: current.hiddenCategories.includes(index)
                        ? current.hiddenCategories.filter((item) => item !== index)
                        : [...current.hiddenCategories, index],
                    }))
                  }
                />
                {name}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <DialogButtons
        onOk={() => {
          chartChange(spec)(editor.chain().focus()).run()
          onClose()
        }}
        onCancel={onClose}
      />
    </DialogFrame>
  )
}
