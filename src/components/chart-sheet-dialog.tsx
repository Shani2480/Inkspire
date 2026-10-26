import { changeChart, selectedChart } from "@/components/chart-menus"
import { gridToSheet, sheetToGrid } from "@/editor/chart-sheet"
import { isHierarchy, specToSheet, withSheet } from "@/editor/chart-spec"
import { placeChartSheet, type Placement } from "@/components/chart-sheet-place"
import type { Editor } from "@tiptap/core"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const COLUMNS = ["A", "B", "C", "D", "E", "F", "G"]

const WIDTH = 420

/**
 * The chart's data sheet, docked against the chart on the page (beside it, or under or over it when there is no room)
 * as Word's embedded datasheet is, rather than a dialog. It follows the chart while the page scrolls or resizes, and a
 * cell's edit reaches the chart when the cell is left; Done, Escape and a click elsewhere close it.
 */
export function ChartSheetDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const chart = selectedChart(editor)
  const chartPos = useRef(chart?.pos ?? -1)
  // Treemap and Sunburst: the Branch and Stem columns come before the category's.
  const labelColumns = chart && isHierarchy(chart.spec.type) ? 1 + (chart.spec.levels?.length ?? 0) : 1
  const initial = sheetToGrid(
    chart ? specToSheet(chart.spec) : { series: [], categories: [], rows: [] },
    COLUMNS.length,
    Math.max(10, (chart?.spec.categories.length ?? 0) + 3),
  )
  const [grid, setGrid] = useState(initial)
  const [active, setActive] = useState({ row: 1, column: 1 })
  const [place, setPlace] = useState<Placement | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const latest = useRef(grid)
  latest.current = grid
  const current = grid[active.row]?.[active.column] ?? ""

  function write(row: number, column: number, value: string) {
    setGrid((currentGrid) =>
      currentGrid.map((line, rowIndex) =>
        rowIndex === row ? line.map((cell, columnIndex) => (columnIndex === column ? value : cell)) : line,
      ),
    )
  }

  // The sheet's data, keeping each series' own options (20.8). Only while the chart is still the selection.
  const commit = useCallback(() => {
    if (selectedChart(editor)?.pos === chartPos.current) {
      changeChart(editor, (spec) => withSheet(spec, gridToSheet(latest.current, labelColumns)))
    }
  }, [editor, labelColumns])

  const finish = useCallback(() => {
    commit()
    onClose()
  }, [commit, onClose])

  const reposition = useCallback(() => {
    const dom = editor.view.nodeDOM(chartPos.current)
    const box = dom instanceof Element ? dom.getBoundingClientRect() : null
    if (!box) {
      return
    }
    const height = panel.current?.offsetHeight ?? 340
    setPlace(
      placeChartSheet(
        { left: box.left, top: box.top, width: box.width, height: box.height },
        { width: WIDTH, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [editor])

  useLayoutEffect(() => {
    reposition()
  }, [reposition])

  useEffect(() => {
    const scroller = document.getElementById("document-scroll")
    const dom = editor.view.nodeDOM(chartPos.current)
    const observer = dom instanceof Element ? new ResizeObserver(reposition) : null
    if (dom instanceof Element) {
      observer?.observe(dom)
    }
    scroller?.addEventListener("scroll", reposition, { passive: true })
    window.addEventListener("resize", reposition)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (panel.current?.contains(target) || (dom instanceof Element && dom.contains(target))) {
        return
      }
      finish()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        finish()
      }
    }
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      observer?.disconnect()
      scroller?.removeEventListener("scroll", reposition)
      window.removeEventListener("resize", reposition)
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [editor, reposition, finish])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Chart Data"
      data-side={place?.side}
      className="chart-sheet-dock"
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, width: WIDTH, visibility: place ? "visible" : "hidden" }}
    >
      <div className="chart-sheet-dock-title">
        <span>Chart Data</span>
        <button type="button" onClick={finish}>
          Done
        </button>
      </div>
      <div className="chart-sheet-bar">
        <div className="chart-sheet-name">
          {COLUMNS[active.column]}
          {active.row + 1}
        </div>
        <span className="chart-sheet-fx">fx</span>
        <input
          aria-label="Formula bar"
          className="chart-sheet-formula"
          value={current}
          onChange={(event) => write(active.row, active.column, event.target.value)}
        />
      </div>
      <div className="chart-sheet-scroll">
        <table className="chart-sheet border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="chart-sheet-corner" />
              {COLUMNS.map((letter, index) => (
                <th key={letter} className={index === active.column ? "is-active" : ""}>
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className={rowIndex === active.row ? "is-active" : ""}>{rowIndex + 1}</th>
                {row.map((cell, columnIndex) => (
                  <td
                    key={columnIndex}
                    className={rowIndex === active.row && columnIndex === active.column ? "is-active" : ""}
                  >
                    <input
                      aria-label={`${COLUMNS[columnIndex]}${rowIndex + 1}`}
                      value={cell}
                      onFocus={() => setActive({ row: rowIndex, column: columnIndex })}
                      onBlur={commit}
                      onChange={(event) => write(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  )
}
