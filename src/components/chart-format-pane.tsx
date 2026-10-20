import { changeChart, selectedChart, useChartPane, useChartPart } from "@/components/chart-menus"
import { ColorField, Field, NumberField, PaneIcon, Radio, Section, Select } from "@/components/format-shape-pane"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  NUMBER_FORMATS,
  chartParts,
  isTextPart,
  partLabel,
  type ChartSpec,
  type LabelPosition,
  type LegendPosition,
  type PartFormat,
  type TrendlineKind,
} from "@/editor/chart-spec"
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
          {round ? (
            <>
              <NumberField
                label="Angle of first slice"
                value={spec.firstSliceAngle}
                unit="°"
                step={5}
                min={0}
                max={360}
                onChange={(firstSliceAngle) => set((current) => ({ ...current, firstSliceAngle }))}
              />
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
  return (
    <Section title="Chart Options">
      <p className="format-pane-note">Pick a part of the chart above, or click it on the chart, to see its options.</p>
    </Section>
  )
}
