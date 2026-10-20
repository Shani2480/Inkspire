import {
  ChartElementsPanel,
  ChartFiltersPanel,
  ChartStylesPanel,
  formatChartPart,
  selectedChart,
  useChartPart,
} from "@/components/chart-menus"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * A chart's parts on the page (20.8): a click on a selected chart picks the part under it (the first click picks
 * the chart itself, as in Word), a right-click picks it for the menu, a double-click opens its Format pane, and the
 * picked part is outlined.
 */
export function ChartPartLayer({ editor }: { editor: Editor }) {
  useEffect(() => {
    const view = editor.view
    // Read at pointerdown: selecting the chart redraws it, so by the click the element under the pointer is gone.
    let pressed: { figure: HTMLElement; part: string; selected: boolean } | null = null
    const chartAt = (figure: HTMLElement) => {
      const chart = selectedChart(editor)
      return chart && view.nodeDOM(chart.pos) === figure ? chart : null
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const figure = target?.closest<HTMLElement>(".insert-figure[data-kind='chart']")
      pressed = figure
        ? {
            figure,
            part: target?.closest("[data-chart-part]")?.getAttribute("data-chart-part") ?? "chartArea",
            selected: Boolean(chartAt(figure)),
          }
        : null
    }
    const pick = (direct: boolean) => {
      const chart = pressed ? chartAt(pressed.figure) : null
      if (pressed && chart) {
        useChartPart.getState().select(chart.pos, direct || pressed.selected ? pressed.part : "chartArea")
      }
      return chart
    }
    const onClick = () => {
      pick(false)
    }
    const onContext = () => {
      pick(true)
    }
    const onDouble = () => {
      if (pick(true) && pressed) {
        formatChartPart(editor, pressed.part)
      }
    }
    view.dom.addEventListener("pointerdown", onDown, true)
    view.dom.addEventListener("click", onClick)
    view.dom.addEventListener("contextmenu", onContext, true)
    view.dom.addEventListener("dblclick", onDouble)
    return () => {
      view.dom.removeEventListener("pointerdown", onDown, true)
      view.dom.removeEventListener("click", onClick)
      view.dom.removeEventListener("contextmenu", onContext, true)
      view.dom.removeEventListener("dblclick", onDouble)
    }
  }, [editor])

  useEffect(() => {
    let frame = 0
    const outline = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        document.querySelectorAll(".chart-part-outline").forEach((item) => item.remove())
        const chart = selectedChart(editor)
        const { pos, part } = useChartPart.getState()
        if (!chart || pos !== chart.pos || part === "chartArea") {
          return
        }
        const dom = editor.view.nodeDOM(chart.pos)
        const svg = dom instanceof HTMLElement ? dom.querySelector("svg") : null
        const element = svg?.querySelector(`[data-chart-part="${CSS.escape(part)}"]`)
        if (!svg || !element) {
          return
        }
        const box = svg.getBoundingClientRect()
        const rect = element.getBoundingClientRect()
        const scale = (svg.viewBox.baseVal?.width || box.width) / (box.width || 1)
        const pad = 2
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        marker.setAttribute("class", "chart-part-outline")
        marker.setAttribute("x", String((rect.left - box.left) * scale - pad))
        marker.setAttribute("y", String((rect.top - box.top) * scale - pad))
        marker.setAttribute("width", String(rect.width * scale + pad * 2))
        marker.setAttribute("height", String(rect.height * scale + pad * 2))
        marker.setAttribute("pointer-events", "none")
        svg.append(marker)
      })
    }
    editor.on("transaction", outline)
    const unsubscribe = useChartPart.subscribe(outline)
    outline()
    return () => {
      cancelAnimationFrame(frame)
      editor.off("transaction", outline)
      unsubscribe()
    }
  }, [editor])

  return null
}

type Panel = "elements" | "styles" | "filters"

/** Word's three buttons beside a selected chart, below Layout Options: Chart Elements, Chart Styles and Filters. */
export function ChartSideButtons({ editor }: { editor: Editor }) {
  const [place, setPlace] = useState<{ pos: number; left: number; top: number } | null>(null)
  const [open, setOpen] = useState<Panel | null>(null)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const chart = selectedChart(editor)
        const dom = chart ? editor.view.nodeDOM(chart.pos) : null
        const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
        const scroller = document.getElementById("document-scroll")?.getBoundingClientRect()
        if (!chart || !rect || rect.width < 1 || !editor.isFocused) {
          if (!box.current?.contains(document.activeElement)) {
            setPlace(null)
            setOpen(null)
          }
          return
        }
        // Under the Layout Options button, which sits at the chart's top right.
        const top = Math.max(rect.top, (scroller?.top ?? 0) + 4) + 32
        if (scroller && (top > scroller.bottom - 96 || rect.bottom < scroller.top)) {
          setPlace(null)
          return
        }
        setPlace((last) => {
          if (last?.pos !== chart.pos) {
            setOpen(null)
          }
          return { pos: chart.pos, left: Math.min(rect.right + 8, window.innerWidth - 32), top }
        })
      })
    }
    const scroller = document.getElementById("document-scroll")
    editor.on("selectionUpdate", sync)
    editor.on("transaction", sync)
    editor.on("focus", sync)
    editor.on("blur", sync)
    scroller?.addEventListener("scroll", sync, { passive: true })
    window.addEventListener("resize", sync)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      editor.off("selectionUpdate", sync)
      editor.off("transaction", sync)
      editor.off("focus", sync)
      editor.off("blur", sync)
      scroller?.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [editor])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(null)
        editor.commands.focus()
      }
    }
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !box.current?.contains(event.target)) {
        setOpen(null)
      }
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [editor, open])

  if (!place) {
    return null
  }
  const buttons: { id: Panel; label: string; glyph: ReactNode }[] = [
    {
      id: "elements",
      label: "Chart Elements",
      glyph: (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "styles",
      label: "Chart Styles",
      glyph: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10.5 2.5 13.5 5.5 8 11 5 8z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path
            d="M5 8c-1.6 0-2.4 1.2-2.4 2.6 0 1 -.4 1.9-1.1 2.4 2.6.4 5.5-.4 6.5-2.9"
            stroke="var(--icon-accent-color)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: "filters",
      label: "Chart Filters",
      glyph: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2.5 3h11L9.3 8.2V13l-2.6-1.4V8.2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      ),
    },
  ]
  return createPortal(
    <div ref={box} className="chart-side-buttons" style={{ left: place.left, top: place.top }}>
      {buttons.map((button) => (
        <div key={button.id} className="chart-side-slot">
          <button
            type="button"
            className="layout-options-button"
            title={button.label}
            aria-label={button.label}
            aria-expanded={open === button.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => (current === button.id ? null : button.id))}
          >
            {button.glyph}
          </button>
          {open === button.id ? (
            button.id === "elements" ? (
              <ChartElementsPanel editor={editor} />
            ) : button.id === "styles" ? (
              <ChartStylesPanel editor={editor} />
            ) : (
              <ChartFiltersPanel editor={editor} close={() => setOpen(null)} />
            )
          ) : null}
        </div>
      ))}
    </div>,
    document.body,
  )
}
