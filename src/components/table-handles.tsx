import { TableToolbar } from "@/components/table-toolbar"
import {
  insertTableColumn,
  insertTableRow,
  selectTablePart,
  tableElement,
  tableSelectionAnchor,
  currentTable,
} from "@/editor/table-tools"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"

const GAP_HIT = 12
const INSERT_CLEARANCE = 16
const TOOLBAR_GAP = 32

type Span = { start: number; end: number }

type Grid = {
  table: DOMRect
  columns: Span[]
  rows: Span[]
  cellRow: number
  cellCol: number
  columnSelection: boolean
  rowSelection: boolean
}

type Gap = { axis: "column" | "row"; index: number }

function measureTable(editor: Editor): Grid | null {
  const anchor = tableSelectionAnchor(editor)
  const table = currentTable(editor)
  const found = table && anchor ? tableElement(editor, table.pos) : null
  const element = found instanceof HTMLTableElement ? found : null
  editor.view.dom.querySelectorAll("table.is-current-table").forEach((node) => {
    if (node !== element) {
      node.classList.remove("is-current-table")
    }
  })
  if (!anchor || !element) {
    return null
  }
  element.classList.add("is-current-table")
  const columns = columnSpans(element)
  const rows = [...element.rows].map((row) => {
    const rect = row.getBoundingClientRect()
    return { start: rect.top, end: rect.bottom }
  })
  if (columns.length === 0 || rows.length === 0) {
    return null
  }
  return {
    table: element.getBoundingClientRect(),
    columns,
    rows,
    cellRow: Math.min(anchor.row, Math.max(0, rows.length - 1)),
    cellCol: Math.min(anchor.col, Math.max(0, columns.length - 1)),
    columnSelection: anchor.columnSelection,
    rowSelection: anchor.rowSelection,
  }
}

function sameGrid(previous: Grid | null, next: Grid | null) {
  if (previous === next) {
    return true
  }
  if (!previous || !next) {
    return false
  }
  if (
    previous.cellRow !== next.cellRow ||
    previous.cellCol !== next.cellCol ||
    previous.columnSelection !== next.columnSelection ||
    previous.rowSelection !== next.rowSelection ||
    previous.columns.length !== next.columns.length ||
    previous.rows.length !== next.rows.length
  ) {
    return false
  }
  const previousTable = previous.table
  const nextTable = next.table
  if (
    Math.round(previousTable.left) !== Math.round(nextTable.left) ||
    Math.round(previousTable.top) !== Math.round(nextTable.top) ||
    Math.round(previousTable.right) !== Math.round(nextTable.right) ||
    Math.round(previousTable.bottom) !== Math.round(nextTable.bottom)
  ) {
    return false
  }
  for (let index = 0; index < previous.columns.length; index += 1) {
    if (
      Math.round(previous.columns[index].start) !== Math.round(next.columns[index].start) ||
      Math.round(previous.columns[index].end) !== Math.round(next.columns[index].end)
    ) {
      return false
    }
  }
  for (let index = 0; index < previous.rows.length; index += 1) {
    if (
      Math.round(previous.rows[index].start) !== Math.round(next.rows[index].start) ||
      Math.round(previous.rows[index].end) !== Math.round(next.rows[index].end)
    ) {
      return false
    }
  }
  return true
}

export function TableHandles({ editor }: { editor: Editor | null }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current?.isActive("table") ? `${current.state.selection.from}:${current.state.doc.nodeSize}` : "",
  })
  const [grid, setGrid] = useState<Grid | null>(null)
  const [gap, setGap] = useState<Gap | null>(null)
  const gridRef = useRef<Grid | null>(null)
  const editorRef = useRef(editor)
  const toolbarRef = useRef<HTMLDivElement>(null)
  editorRef.current = editor
  const [toolbarHeight, setToolbarHeight] = useState(28)
  const [toolbarWidth, setToolbarWidth] = useState(640)
  const [toolbarLimit, setToolbarLimit] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  gridRef.current = grid

  useLayoutEffect(() => {
    const node = toolbarRef.current
    if (!node) {
      return
    }
    const applied = node.style.maxWidth
    node.style.maxWidth = "none"
    const natural = node.offsetWidth
    const room = Math.max(320, viewportWidth - 16)
    const limit = natural > room ? room : 0
    if (limit) {
      node.style.maxWidth = `${limit}px`
    }
    const height = node.offsetHeight
    const width = node.offsetWidth
    node.style.maxWidth = applied
    if (height !== toolbarHeight || width !== toolbarWidth || limit !== toolbarLimit) {
      setToolbarHeight(height)
      setToolbarWidth(width)
      setToolbarLimit(limit)
    }
  })

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!editor) {
      setGrid(null)
      return
    }
    let frame = 0
    let watched: HTMLTableElement | null = null
    const observer = new ResizeObserver(() => place())
    const watch = (element: HTMLTableElement | null) => {
      if (element === watched) {
        return
      }
      observer.disconnect()
      watched = element
      if (!element) {
        return
      }
      observer.observe(element)
      for (const row of element.rows) {
        observer.observe(row)
      }
      for (const cell of element.rows[0]?.cells ?? []) {
        observer.observe(cell)
      }
    }
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = measureTable(editor)
        const element = editor.view.dom.querySelector("table.is-current-table")
        watch(element instanceof HTMLTableElement ? element : null)
        if (!next) {
          setGrid(null)
          setGap(null)
          return
        }
        setGrid((previous) => (sameGrid(previous, next) ? previous : next))
      })
    }
    place()
    const onUpdate = () => place()
    editor.on("update", onUpdate)
    const scroller = document.getElementById("document-scroll")
    scroller?.addEventListener("scroll", place)
    window.addEventListener("resize", place)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      editor.off("update", onUpdate)
      scroller?.removeEventListener("scroll", place)
      window.removeEventListener("resize", place)
    }
  }, [editor, active])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("[data-table-insert]")) {
        return
      }
      const currentEditor = editorRef.current
      const current = currentEditor ? measureTable(currentEditor) : null
      gridRef.current = current
      setGrid((previous) => (sameGrid(previous, current) ? previous : current))
      if (!current) {
        setGap(null)
        return
      }
      const next = gapAt(event.clientX, event.clientY, current)
      setGap((previous) => (previous?.axis === next?.axis && previous?.index === next?.index ? previous : next))
    }
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  if (!editor || !grid) {
    return null
  }

  const column = grid.columns[grid.cellCol]
  const row = grid.rows[grid.cellRow]
  const wholeColumn = grid.columnSelection && !grid.rowSelection
  const wholeRow = grid.rowSelection && !grid.columnSelection
  const gapPoint = gap ? gapPointAt(gap, grid) : null
  const chromeTop = document.getElementById("document-scroll")?.getBoundingClientRect().top ?? 8
  const above = grid.table.top - toolbarHeight - TOOLBAR_GAP
  const menusUp = above >= chromeTop + 4
  const toolbarTop = menusUp ? above : grid.table.bottom + TOOLBAR_GAP
  const toolbarLeft = Math.max(8, Math.min(grid.table.left, viewportWidth - toolbarWidth - 8))

  return createPortal(
    <>
      <TableToolbar
        editor={editor}
        barRef={toolbarRef}
        menusUp={menusUp}
        style={{ left: toolbarLeft, top: toolbarTop, maxWidth: toolbarLimit || undefined }}
      />
      <HandleButton
        label="Select table"
        className="fixed z-30 size-4 rounded-sm bg-[#0f6cbd] text-[9px] text-white"
        style={{ left: grid.table.left - 18, top: grid.table.top - 18 }}
        onClick={() => selectTablePart(editor, "table")}
      >
        ⊞
      </HandleButton>
      {column && !wholeRow ? (
        <HandleButton
          label="Select column"
          className="fixed z-30 h-1.5 rounded-full bg-[#0f6cbd]"
          style={{ left: column.start + (column.end - column.start) / 2 - 11, top: grid.table.top - 8, width: 22 }}
          onClick={() => selectTablePart(editor, "column")}
        />
      ) : null}
      {row && !wholeColumn ? (
        <HandleButton
          label="Select row"
          className="fixed z-30 w-1.5 rounded-full bg-[#0f6cbd]"
          style={{ left: grid.table.left - 8, top: row.start + (row.end - row.start) / 2 - 11, height: 22 }}
          onClick={() => selectTablePart(editor, "row")}
        />
      ) : null}
      {gap && gapPoint ? (
        <>
          <div
            data-table-insert=""
            className="table-insert-line pointer-events-none fixed z-30"
            style={
              gap.axis === "column"
                ? { left: gapPoint.x - 1, top: gapPoint.y, width: 2, height: grid.table.bottom - gapPoint.y }
                : { left: gapPoint.x, top: gapPoint.y - 1, width: grid.table.right - gapPoint.x, height: 2 }
            }
          />
          <HandleButton
            label={gap.axis === "column" ? "Insert column" : "Insert row"}
            className="table-insert-plus fixed z-50 flex size-5 items-center justify-center rounded-full text-sm leading-none"
            style={{ left: gapPoint.x - 10, top: gapPoint.y - 10 }}
            onClick={() => {
              if (gap.axis === "column") {
                insertTableColumn(editor, gap.index)
              } else {
                insertTableRow(editor, gap.index)
              }
              setGap(null)
            }}
          >
            +
          </HandleButton>
        </>
      ) : null}
    </>,
    document.body,
  )
}

function columnSpans(table: HTMLTableElement): Span[] {
  const first = table.rows[0]
  if (!first) {
    return []
  }
  const spans: Span[] = []
  for (const cell of first.cells) {
    const rect = cell.getBoundingClientRect()
    const count = cell.colSpan || 1
    const width = rect.width / count
    for (let index = 0; index < count; index += 1) {
      spans.push({ start: rect.left + index * width, end: rect.left + (index + 1) * width })
    }
  }
  return spans
}

function gapAt(x: number, y: number, grid: Grid): Gap | null {
  let best: { gap: Gap; distance: number } | null = null
  const wholeColumn = grid.columnSelection && !grid.rowSelection
  const wholeRow = grid.rowSelection && !grid.columnSelection
  const inRows = y >= grid.table.top - 40 && y <= grid.table.bottom + GAP_HIT
  const inColumns = x >= grid.table.left - 40 && x <= grid.table.right + GAP_HIT
  if (inRows && !wholeRow && grid.columns.length > 0) {
    const edges = [
      { at: grid.columns[0].start, index: 0 },
      ...grid.columns.map((column, index) => ({ at: column.end, index: index + 1 })),
    ]
    for (const edge of edges) {
      const distance = Math.abs(x - edge.at)
      if (distance <= GAP_HIT && (!best || distance < best.distance)) {
        best = { gap: { axis: "column", index: edge.index }, distance }
      }
    }
  }
  if (inColumns && !wholeColumn && grid.rows.length > 0) {
    const edges = [
      { at: grid.rows[0].start, index: 0 },
      ...grid.rows.map((row, index) => ({ at: row.end, index: index + 1 })),
    ]
    for (const edge of edges) {
      const distance = Math.abs(y - edge.at)
      if (distance <= GAP_HIT && (!best || distance < best.distance)) {
        best = { gap: { axis: "row", index: edge.index }, distance }
      }
    }
  }
  return best?.gap ?? null
}

function gapPointAt(gap: Gap, grid: Grid) {
  const outside = INSERT_CLEARANCE + 10
  if (gap.axis === "column") {
    const edge = gap.index === 0 ? grid.columns[0]?.start : grid.columns[gap.index - 1]?.end
    if (edge == null) {
      return null
    }
    return { x: edge, y: grid.table.top - outside }
  }
  const edge = gap.index === 0 ? grid.rows[0]?.start : grid.rows[gap.index - 1]?.end
  if (edge == null) {
    return null
  }
  return { x: grid.table.left - outside, y: edge }
}

function HandleButton({
  label,
  className,
  style,
  onClick,
  children,
}: {
  label: string
  className?: string
  style?: CSSProperties
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-table-insert={label.startsWith("Insert") ? "" : undefined}
      className={className ?? "rounded px-1.5 py-0.5 text-[12px] hover:bg-[#f3f9fd]"}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
