import { changeChart, selectedChart, useChartPane, useChartPart } from "@/components/chart-menus"
import { ColorField, Field, NumberField, PaneIcon, Radio, Section, Select } from "@/components/format-shape-pane"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  NUMBER_FORMATS,
  chartParts,
  chartRotation,
  chartView3d,
  ofPieGap,
  ofPieSecond,
  ofPieSize,
  ofPieSplit,
  ofPieThreshold,
  isTextPart,
  partLabel,
  type ChartSpec,
  type LabelPosition,
  type LegendPosition,
  type PartFormat,
  type TrendlineKind,
  type HistogramBins,
} from "@/editor/chart-spec"
import { histogramBins, histogramValues } from "@/editor/chart-expand"
import { useEditorState } from "@tiptap/react"
import { X } from "lucide-react"
import { useState } from "react"

type Tab = "fill" | "size" | "options" | "text"

/**
 * Word's Format pane for a chart (20.8): whichever part is selected (the chart area, plot area, title, an axis,
 * a series, the legend, data labels…) with Fill & Line, Size & Properties and the part's own options. Every change
 * shows at once and is one undo step.
 */
export function ChartFormatPane() {
  const open = useChartPane((state) => state.open)
  const hide = useChartPane((state) => state.hide)
  const pickedPart = useChartPart((state) => state.part)
  const pickedPos = useChartPart((state) => state.pos)
  const editor = useDocumentEditor()
  const [tab, setTab] = useState<Tab>("options")
  const chart = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const found = selectedChart(current)
      return found
        ? {
            pos: found.pos,
            spec: found.spec,
            width: Number(found.node.attrs.width) || 576,
            height: Number(found.node.attrs.height) || 336,
          }
        : null
    },
    equalityFn: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  })
  if (!open) {
    return null
  }
  const part = chart && pickedPos === chart.pos ? pickedPart : "chartArea"
  const spec = chart?.spec
  const set = (change: (current: ChartSpec) => ChartSpec) => changeChart(editor, change)
  const text = isTextPart(part)
  const tabs: { id: Tab; label: string; icon: "fill" | "layout" | "text-fill" | "effects" }[] = [
    { id: "fill", label: "Fill & Line", icon: "fill" },
    ...(text ? [{ id: "text" as const, label: "Text Fill & Font", icon: "text-fill" as const }] : []),
    { id: "size", label: "Size & Properties", icon: "layout" },
    { id: "options", label: `${partLabel(spec ?? ({} as ChartSpec), part)} Options`, icon: "effects" },
  ]
  const shown = tabs.some((item) => item.id === tab) ? tab : "options"
  return (
    <aside className="format-pane" aria-label="Format chart">
      <header className="format-pane-title">
        <span>Format {spec ? partLabel(spec, part) : "Chart"}</span>
        <button type="button" aria-label="Close Format pane" onClick={hide}>
          <X className="size-4" />
        </button>
      </header>
      {spec && chart ? (
        <>
          <div className="format-pane-parts">
            <select
              aria-label="Chart part"
              value={part}
              onChange={(event) => useChartPart.getState().select(chart.pos, event.target.value)}
            >
              {chartParts(spec).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="format-pane-tabs" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-label={item.label}
                title={item.label}
                aria-selected={shown === item.id}
                onClick={() => setTab(item.id)}
              >
                <PaneIcon kind={item.icon} />
              </button>
            ))}
          </div>
          <div className="format-pane-body">
            {shown === "fill" ? (
              <FillAndLine spec={spec} part={part} set={set} />
            ) : shown === "text" ? (
              <TextOptions spec={spec} part={part} set={set} />
            ) : shown === "size" ? (
              <SizeOptions width={chart.width} height={chart.height} />
            ) : (
              <PartOptions spec={spec} part={part} set={set} />
            )}
          </div>
        </>
      ) : (
        <div className="format-pane-body">
          <p className="format-pane-empty">Select a chart to format it.</p>
        </div>
      )}
    </aside>
  )
}

type Setter = (change: (current: ChartSpec) => ChartSpec) => void

function withFormat(spec: ChartSpec, part: string, format: Partial<PartFormat>): ChartSpec {
  const next = { ...spec.format[part], ...format }
  for (const key of Object.keys(next) as (keyof PartFormat)[]) {
    if (next[key] === undefined || next[key] === "") {
      delete next[key]
    }
  }
  return { ...spec, format: { ...spec.format, [part]: next } }
}

function FillAndLine({ spec, part, set }: { spec: ChartSpec; part: string; set: Setter }) {
  const format = spec.format[part] ?? {}
  const fill = format.fill ?? ""
  const line = format.line ?? ""
  const lineOnly = part === "gridlines" || part.startsWith("axis:") || part.startsWith("trendline")
  return (
    <>
      {lineOnly ? null : (
        <Section title="Fill">
          <Radio
            name="chart-fill"
            checked={!fill}
            label="Automatic"
            onChange={() => set((current) => withFormat(current, part, { fill: undefined }))}
          />
          <Radio
            name="chart-fill"
            checked={fill === "none"}
            label="No fill"
            onChange={() => set((current) => withFormat(current, part, { fill: "none" }))}
          />
          <Radio
            name="chart-fill"
            checked={Boolean(fill) && fill !== "none"}
            label="Solid fill"
            onChange={() => set((current) => withFormat(current, part, { fill: "#4472c4" }))}
          />
          {fill && fill !== "none" ? (
            <ColorField
              label="Color"
              color={fill}
              onPick={(color) => set((current) => withFormat(current, part, { fill: color }))}
            />
          ) : null}
        </Section>
      )}
      <Section title={part === "chartArea" || part === "plotArea" || part === "legend" ? "Border" : "Line"}>
        <Radio
          name="chart-line"
          checked={!line}
          label="Automatic"
          onChange={() => set((current) => withFormat(current, part, { line: undefined, lineWidth: undefined }))}
        />
        <Radio
          name="chart-line"
          checked={line === "none"}
          label="No line"
          onChange={() => set((current) => withFormat(current, part, { line: "none" }))}
        />
        <Radio
          name="chart-line"
          checked={Boolean(line) && line !== "none"}
          label="Solid line"
          onChange={() => set((current) => withFormat(current, part, { line: "#595959" }))}
        />
        {line && line !== "none" ? (
          <>
            <ColorField
              label="Color"
              color={line}
              onPick={(color) => set((current) => withFormat(current, part, { line: color }))}
            />
            <NumberField
              label="Width"
              value={format.lineWidth ?? 0.75}
              unit="pt"
              step={0.25}
              max={20}
              onChange={(value) => set((current) => withFormat(current, part, { lineWidth: value }))}
            />
          </>
        ) : null}
      </Section>
    </>
  )
}

function TextOptions({ spec, part, set }: { spec: ChartSpec; part: string; set: Setter }) {
  const format = spec.format[part] ?? {}
  return (
    <Section title="Text">
      <ColorField
        label="Text color"
        color={format.color ?? ""}
        onPick={(color) => set((current) => withFormat(current, part, { color }))}
      />
      <NumberField
        label="Size"
        value={format.fontSize ?? (part === "title" ? 14 : part.startsWith("axisTitle") ? 10 : 9)}
        unit="pt"
        step={1}
        min={4}
        max={72}
        onChange={(value) => set((current) => withFormat(current, part, { fontSize: value }))}
      />
      <label className="format-pane-check">
        <input
          type="checkbox"
          checked={Boolean(format.bold)}
          onChange={(event) => set((current) => withFormat(current, part, { bold: event.target.checked || undefined }))}
        />
        Bold
      </label>
    </Section>
  )
}

function SizeOptions({ width, height }: { width: number; height: number }) {
  const editor = useDocumentEditor()
  const inches = (px: number) => Math.round((px / 96) * 100) / 100
  return (
    <Section title="Size">
      <NumberField
        label="Height"
        value={inches(height)}
        unit="in"
        step={0.1}
        min={0.5}
        max={22}
        onChange={(value) =>
          editor
            ?.chain()
            .updateObject({ height: Math.round(value * 96) })
            .run()
        }
      />
      <NumberField
        label="Width"
        value={inches(width)}
        unit="in"
        step={0.1}
        min={0.5}
        max={22}
        onChange={(value) =>
          editor
            ?.chain()
            .updateObject({ width: Math.round(value * 96) })
            .run()
        }
      />
    </Section>
  )
}

/**
 * Pie of Pie and Bar of Pie (Format Data Series): Split Series By Position, Value, Percentage value or Custom, with
 * its number, and the Second Plot Size. Custom puts the point picked on the chart in the first or second plot.
 */
function OfPieOptions({ spec, part, set }: { spec: ChartSpec; part: string; set: Setter }) {
  const by = spec.ofPieSplitBy ?? "pos"
  const shown = spec.categories.map((_, index) => index).filter((index) => !spec.hiddenCategories.includes(index))
  const point = part.startsWith("point:") ? Number(part.slice("point:".length)) : NaN
  const options = [
    { value: "pos", label: "Position" },
    { value: "val", label: "Value" },
    { value: "percent", label: "Percentage value" },
    { value: "cust", label: "Custom" },
  ]
  return (
    <>
      <Select
        label="Split Series By"
        value={by}
        options={options}
        onChange={(value) =>
          set((current) => {
            const next = { ...current, ofPieSplitBy: value as ChartSpec["ofPieSplitBy"] }
            delete next.ofPieSplitValue
            if (value === "cust") {
              // Custom starts from the points the second plot has now.
              const second = ofPieSecond(current)
              const visible = current.categories
                .map((_, index) => index)
                .filter((index) => !current.hiddenCategories.includes(index))
              next.ofPieCustom = visible.filter((_, place) => second[place])
            }
            return next
          })
        }
      />
      {by === "pos" ? (
        <NumberField
          label="Values in second plot"
          value={ofPieSplit(spec, shown.length)}
          unit=""
          step={1}
          min={1}
          max={Math.max(1, shown.length - 1)}
          onChange={(split) => set((current) => ({ ...current, ofPieSplit: Math.round(split) }))}
        />
      ) : by === "val" || by === "percent" ? (
        <NumberField
          label="Values less than"
          value={ofPieThreshold(spec)}
          unit={by === "percent" ? "%" : ""}
          step={1}
          min={0}
          max={by === "percent" ? 100 : 1e9}
          onChange={(threshold) => set((current) => ({ ...current, ofPieSplitValue: threshold }))}
        />
      ) : Number.isInteger(point) ? (
        <Select
          label="Point belongs to"
          value={spec.ofPieCustom?.includes(point) ? "second" : "first"}
          options={[
            { value: "first", label: "First plot" },
            { value: "second", label: "Second plot" },
          ]}
          onChange={(plot) =>
            set((current) => {
              const others = (current.ofPieCustom ?? []).filter((index) => index !== point)
              return { ...current, ofPieCustom: plot === "second" ? [...others, point].sort((a, b) => a - b) : others }
            })
          }
        />
      ) : (
        <p className="format-pane-note">Click a slice on the chart, then choose the plot it belongs to.</p>
      )}
      <NumberField
        label="Gap Width"
        value={Math.round(ofPieGap(spec) * 100)}
        unit="%"
        step={10}
        min={0}
        max={500}
        onChange={(gap) => set((current) => ({ ...current, ofPieGap: gap }))}
      />
      <NumberField
        label="Second Plot Size"
        value={Math.round(ofPieSize(spec) * 100)}
        unit="%"
        step={5}
        min={5}
        max={200}
        onChange={(size) => set((current) => ({ ...current, ofPieSize: size }))}
      />
    </>
  )
}

/**
 * Format Axis → Bins on a histogram, as Word has it: By Category, Automatic, Bin width or Number of bins, and an
 * Overflow and Underflow bin. The width and number shown are the ones in use, whichever was set.
 */
function HistogramBinOptions({ spec, set }: { spec: ChartSpec; set: Setter }) {
  const bins: HistogramBins = spec.bins ?? { by: "auto" }
  const values = histogramValues(spec)
  const chosen = histogramBins(values, bins.by === "category" ? { by: "auto" } : bins)
  const low = values.length ? Math.min(...values) : 0
  const high = values.length ? Math.max(...values) : 0
  const setBins = (change: Partial<HistogramBins>) =>
    set((current) => {
      const next: HistogramBins = { ...(current.bins ?? { by: "auto" }), ...change }
      for (const key of Object.keys(next) as (keyof HistogramBins)[]) {
        if (next[key] === undefined) {
          delete next[key]
        }
      }
      return { ...current, bins: next }
    })
  const modes: [HistogramBins["by"], string][] = [
    ["category", "By Category"],
    ["auto", "Automatic"],
    ["width", "Bin width"],
    ["count", "Number of bins"],
  ]
  const round = (value: number) => Math.round(value * 100) / 100
  return (
    <Section title="Bins">
      {modes.map(([by, label]) => (
        <Radio key={by} name="chart-bins" checked={bins.by === by} label={label} onChange={() => setBins({ by })} />
      ))}
      {bins.by !== "category" && (
        <>
          <NumberField
            label="Bin width"
            value={round(chosen.width)}
            unit=""
            step={1}
            min={0}
            max={1e9}
            onChange={(width) => setBins({ by: "width", width })}
          />
          <NumberField
            label="Number of bins"
            value={chosen.regular}
            unit=""
            step={1}
            min={1}
            max={500}
            onChange={(count) => setBins({ by: "count", count: Math.round(count) })}
          />
          <Check
            label="Overflow bin"
            checked={bins.overflow !== undefined}
            onChange={(on) => setBins({ overflow: on ? round(low + (high - low) * 0.75) : undefined })}
          />
          {bins.overflow !== undefined && (
            <NumberField
              label="Above"
              value={bins.overflow}
              unit=""
              step={1}
              min={-1e9}
              max={1e9}
              onChange={(overflow) => setBins({ overflow })}
            />
          )}
          <Check
            label="Underflow bin"
            checked={bins.underflow !== undefined}
            onChange={(on) => setBins({ underflow: on ? round(low + (high - low) * 0.25) : undefined })}
          />
          {bins.underflow !== undefined && (
            <NumberField
              label="At or below"
              value={bins.underflow}
              unit=""
              step={1}
              min={-1e9}
              max={1e9}
              onChange={(underflow) => setBins({ underflow })}
            />
          )}
        </>
      )}
    </Section>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="format-pane-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

/** A number that is Auto until it is set, as Word's axis bounds are. */
function AutoNumber({
  label,
  value,
  auto,
  onChange,
}: {
  label: string
  value: number | undefined
  auto: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <Field label={label}>
      <span className="format-pane-number">
        <input
          type="number"
          value={value ?? ""}
          placeholder={String(auto)}
          step="any"
          onChange={(event) => {
            const raw = event.target.value
            onChange(raw === "" ? undefined : Number(raw))
          }}
        />
        <button
          type="button"
          className="format-pane-reset"
          disabled={value === undefined}
          onClick={() => onChange(undefined)}
        >
          Auto
        </button>
      </span>
    </Field>
  )
}

function PartOptions({ spec, part, set }: { spec: ChartSpec; part: string; set: Setter }) {
  const round = spec.type === "pie" || spec.type === "doughnut"
  if (part === "title" || part.startsWith("axisTitle:")) {
    const axis = part === "title" ? null : (part.slice("axisTitle:".length) as "category" | "value")
    const value = axis ? spec.axisTitles[axis].text : spec.title.text
    return (
      <Section title="Title">
        <Field label="Text">
          <input
            type="text"
            value={value}
            onChange={(event) => {
              const text = event.target.value
              set((current) =>
                axis
                  ? { ...current, axisTitles: { ...current.axisTitles, [axis]: { ...current.axisTitles[axis], text } } }
                  : { ...current, title: { ...current.title, text } },
              )
            }}
          />
        </Field>
      </Section>
    )
  }
  if (part === "axis:value") {
    const axis = spec.valueAxis
    const setAxis = (change: Partial<ChartSpec["valueAxis"]>) =>
      set((current) => {
        const next = { ...current.valueAxis, ...change }
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (next[key] === undefined) {
            delete next[key]
          }
        }
        return { ...current, valueAxis: next }
      })
    return (
      <>
        <Section title="Axis Options">
          <AutoNumber label="Minimum" value={axis.min} auto={0} onChange={(min) => setAxis({ min })} />
          <AutoNumber label="Maximum" value={axis.max} auto={0} onChange={(max) => setAxis({ max })} />
          <AutoNumber label="Major unit" value={axis.major} auto={1} onChange={(major) => setAxis({ major })} />
          <Check
            label="Logarithmic scale"
            checked={Boolean(axis.log)}
            onChange={(log) => setAxis({ log: log || undefined })}
          />
          <Check
            label="Values in reverse order"
            checked={Boolean(axis.reverse)}
            onChange={(reverse) => setAxis({ reverse: reverse || undefined })}
          />
        </Section>
        <Section title="Number">
          <Select
            label="Category"
            value={axis.numberFormat ?? "General"}
            options={NUMBER_FORMATS.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(numberFormat) =>
              setAxis({ numberFormat: numberFormat === "General" ? undefined : numberFormat })
            }
          />
        </Section>
      </>
    )
  }
  if (part === "axis:category" && spec.type === "histogram") {
    return <HistogramBinOptions spec={spec} set={set} />
  }
  if (part === "axis:category") {
    return (
      <Section title="Axis Options">
        <Check
          label="Categories in reverse order"
          checked={spec.categoryReverse}
          onChange={(categoryReverse) => set((current) => ({ ...current, categoryReverse }))}
        />
      </Section>
    )
  }
  if (part === "legend") {
    const positions: [LegendPosition, string][] = [
      ["top", "Top"],
      ["bottom", "Bottom"],
      ["left", "Left"],
      ["right", "Right"],
    ]
    return (
      <Section title="Legend Options">
        {positions.map(([position, label]) => (
          <Radio
            key={position}
            name="chart-legend"
            checked={spec.legend === position}
            label={label}
            onChange={() => set((current) => ({ ...current, legend: position }))}
          />
        ))}
      </Section>
    )
  }
  if (part === "dataLabels") {
    const content = spec.labelContent
    const positions: [LabelPosition, string][] = round
      ? [
          ["center", "Center"],
          ["insideEnd", "Inside End"],
          ["outsideEnd", "Outside End"],
          ["bestFit", "Best Fit"],
        ]
      : [
          ["center", "Center"],
          ["insideEnd", "Inside End"],
          ["insideBase", "Inside Base"],
          ["outsideEnd", "Outside End"],
        ]
    const setContent = (change: Partial<typeof content>) =>
      set((current) => ({ ...current, labelContent: { ...current.labelContent, ...change } }))
    return (
      <>
        <Section title="Label Contains">
          <Check label="Series Name" checked={content.series} onChange={(series) => setContent({ series })} />
          <Check label="Category Name" checked={content.category} onChange={(category) => setContent({ category })} />
          <Check label="Value" checked={content.value} onChange={(value) => setContent({ value })} />
          {round ? (
            <Check label="Percentage" checked={content.percent} onChange={(percent) => setContent({ percent })} />
          ) : null}
        </Section>
        <Section title="Label Position">
          {positions.map(([position, label]) => (
            <Radio
              key={position}
              name="chart-labels"
              checked={spec.dataLabels === position}
              label={label}
              onChange={() => set((current) => ({ ...current, dataLabels: position }))}
            />
          ))}
        </Section>
      </>
    )
  }
  if (part.startsWith("series:") || part.startsWith("point:")) {
    const index = Number(part.split(":")[1]) || 0
    const serie = part.startsWith("series:") ? spec.series[index] : undefined
    const setSerie = (change: Partial<ChartSpec["series"][number]>) =>
      set((current) => ({
        ...current,
        series: current.series.map((item, place) => (place === index ? { ...item, ...change } : item)),
      }))
    const bars = spec.type === "column" || spec.type === "bar"
    const lines = spec.type === "line" || spec.type === "scatter" || spec.type === "radar"
    const trends: [TrendlineKind, string][] = [
      ["none", "None"],
      ["linear", "Linear"],
      ["exponential", "Exponential"],
      ["logarithmic", "Logarithmic"],
      ["movingAverage", "Moving Average"],
    ]
    return (
      <>
        <Section title="Series Options">
          {serie && !round && spec.type !== "scatter" && spec.type !== "radar" && spec.series.length > 1 ? (
            <Check
              label="Plot on secondary axis"
              checked={Boolean(serie.secondary)}
              onChange={(secondary) => setSerie({ secondary: secondary || undefined })}
            />
          ) : null}
          {bars ? (
            <>
              <NumberField
                label="Series Overlap"
                value={spec.overlap}
                unit="%"
                step={1}
                min={-100}
                max={100}
                onChange={(overlap) => set((current) => ({ ...current, overlap }))}
              />
              <NumberField
                label="Gap Width"
                value={spec.gapWidth}
                unit="%"
                step={5}
                min={0}
                max={500}
                onChange={(gapWidth) => set((current) => ({ ...current, gapWidth }))}
              />
            </>
          ) : null}
          {lines ? (
            <>
              <Check
                label="Smoothed line"
                checked={spec.smooth}
                onChange={(smooth) => set((current) => ({ ...current, smooth }))}
              />
              <Check
                label="Markers"
                checked={spec.markers}
                onChange={(markers) => set((current) => ({ ...current, markers }))}
              />
            </>
          ) : null}
          {spec.ofPie ? <OfPieOptions spec={spec} part={part} set={set} /> : null}
          {round ? (
            <>
              {spec.ofPie ? null : (
                <NumberField
                  label="Angle of first slice"
                  value={spec.firstSliceAngle}
                  unit="°"
                  step={5}
                  min={0}
                  max={360}
                  onChange={(firstSliceAngle) => set((current) => ({ ...current, firstSliceAngle }))}
                />
              )}
              <NumberField
                label="Pie Explosion"
                value={spec.explosion}
                unit="%"
                step={5}
                min={0}
                max={400}
                onChange={(explosion) => set((current) => ({ ...current, explosion }))}
              />
              {spec.type === "doughnut" ? (
                <NumberField
                  label="Doughnut Hole Size"
                  value={spec.holeSize}
                  unit="%"
                  step={5}
                  min={10}
                  max={90}
                  onChange={(holeSize) => set((current) => ({ ...current, holeSize }))}
                />
              ) : null}
            </>
          ) : null}
        </Section>
        {serie && !round && spec.type !== "radar" && spec.grouping === "clustered" ? (
          <Section title="Trendline">
            {trends.map(([kind, label]) => (
              <Radio
                key={kind}
                name="chart-trendline"
                checked={(serie.trendline ?? "none") === kind}
                label={label}
                onChange={() => setSerie({ trendline: kind })}
              />
            ))}
          </Section>
        ) : null}
      </>
    )
  }
  if (part === "dataTable") {
    return (
      <Section title="Data Table Options">
        <Check
          label="Show data table"
          checked={spec.dataTable}
          onChange={(dataTable) => set((current) => ({ ...current, dataTable }))}
        />
      </Section>
    )
  }
  if (part === "gridlines") {
    return (
      <Section title="Gridlines">
        <Check
          label="Major"
          checked={spec.gridlines.major}
          onChange={(major) => set((current) => ({ ...current, gridlines: { ...current.gridlines, major } }))}
        />
        <Check
          label="Minor"
          checked={spec.gridlines.minor}
          onChange={(minor) => set((current) => ({ ...current, gridlines: { ...current.gridlines, minor } }))}
        />
      </Section>
    )
  }
  if ((part === "chartArea" || part === "plotArea") && spec.threeD && !spec.ofPie) {
    const turn = chartRotation(spec)
    const pie = spec.type === "pie"
    const own = chartRotation({ type: spec.type })
    const view = chartView3d(spec)
    return (
      <Section title="3-D Rotation">
        <NumberField
          label="X Rotation"
          value={turn.x}
          unit="°"
          step={5}
          min={pie ? 0 : -90}
          max={90}
          onChange={(rotX) => set((current) => ({ ...current, rotX: Math.round(rotX) }))}
        />
        <NumberField
          label="Y Rotation"
          value={turn.y}
          unit="°"
          step={5}
          min={0}
          max={359}
          onChange={(rotY) => set((current) => ({ ...current, rotY: Math.round(rotY) }))}
        />
        {pie ? null : (
          <>
            <Check
              label="Right Angle Axes"
              checked={view.rightAngle}
              onChange={(rightAngleAxes) => set((current) => ({ ...current, rightAngleAxes }))}
            />
            {view.rightAngle ? null : (
              <>
                <NumberField
                  label="Perspective"
                  value={view.perspective}
                  unit="°"
                  step={5}
                  min={0}
                  max={120}
                  onChange={(perspective) => set((current) => ({ ...current, perspective }))}
                />
                <p className="format-pane-note">Kept for Word; the chart is drawn here without perspective.</p>
              </>
            )}
            <NumberField
              label="Depth (% of base)"
              value={view.depth}
              unit="%"
              step={10}
              min={20}
              max={2000}
              onChange={(depthPercent) => set((current) => ({ ...current, depthPercent: Math.round(depthPercent) }))}
            />
          </>
        )}
        <button
          type="button"
          className="format-pane-button"
          disabled={
            turn.x === own.x &&
            turn.y === own.y &&
            spec.rightAngleAxes === undefined &&
            spec.perspective === undefined &&
            spec.depthPercent === undefined
          }
          onClick={() =>
            set(({ rotX: _x, rotY: _y, rightAngleAxes: _r, perspective: _p, depthPercent: _d, ...current }) => current)
          }
        >
          Reset
        </button>
      </Section>
    )
  }
  return (
    <Section title="Chart Options">
      <p className="format-pane-note">Pick a part of the chart above, or click it on the chart, to see its options.</p>
    </Section>
  )
}
