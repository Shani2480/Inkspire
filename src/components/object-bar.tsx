import { applyCrop, cancelCrop, resetPendingCrop, useCropMode } from "@/editor/picture-crop"
import { ChartSheetDialog } from "@/components/chart-sheet-dialog"
import { openModelFormat } from "@/components/model-format-dialog"
import { CurrentWrapIcon } from "@/components/object-layout-icons"
import {
  AlignTextMenu,
  ChangeIconMenu,
  ChartElementsMenu,
  ChartStylesMenu,
  DrawColorMenu,
  DrawThicknessMenu,
  ModelResetMenu,
  ModelScenesMenu,
  ModelViewsMenu,
  PictureStylesMenu,
  RotateMenu,
  ShapeFillMenu,
  ShapeOutlineMenu,
  ShapeStylesMenu,
  SmartArtAddShapeMenu,
  SmartArtColorsMenu,
  SmartArtLayoutsMenu,
  editAltText,
} from "@/components/object-menus"
import { RibbonPopover, RibbonTipContent } from "@/components/ribbon/ribbon-button"
import {
  LineAltTextIcon,
  LineCameraViewIcon,
  LineChartElementIcon,
  LineChartStylesIcon,
  LineColorsIcon,
  LineCropIcon,
  LineCubeIcon,
  LineHighlighterIcon,
  LineObjectStylesIcon,
  LinePenIcon,
  LineQuickLayoutIcon,
  LineRotateIcon,
  LineSelectIcon,
  LineShapeFillIcon,
  LineShapeOutlineIcon,
  LineShapesIcon,
  LineTableIcon,
  LineCellAlignIcon,
} from "@/components/ribbon/line-icons"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { WrapTextMenu } from "@/components/wrap-menu"
import { useViewStore } from "@/document/view"
import { activeColor, useDrawStore, type DrawTool } from "@/editor/drawing"
import { selectedObject } from "@/editor/objects"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState } from "@tiptap/react"
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

type BarCommand = {
  id: string
  label: string
  icon: ReactNode
  description?: string
  shortcut?: string
  active?: boolean
  onClick?: () => void
  menu?: (close: () => void) => ReactNode
}

type Selected = { pos: number; name: string; kind: string; frame: string }

/** Clear of the object's frame, its rotate handle and the Layout Options button. */
const GAP = 8

/**
 * Word's mini toolbar for a selected object (20.10): one row of icon-over-label buttons with the commands of the
 * object's kind, centred above it (below when there is no room), following it through scrolling and zoom. It
 * hides while the object is dragged, resized or turned and comes back at the new place; Esc puts it away until the
 * object is selected again, and Alt+F10 moves into it. Its menus are the ribbon's own.
 */
export function ObjectBar({ editor }: { editor: Editor }) {
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }): Selected | null => {
      const found = selectedObject(current)
      if (!found) {
        return null
      }
      // Other objects show their bar when selected; a text box also while its text is edited.
      if (found.name !== "textBox" && !(current.state.selection instanceof NodeSelection)) {
        return null
      }
      const attrs = found.attrs
      return {
        pos: found.pos,
        name: found.name,
        kind: found.name === "figure" ? String(attrs.kind || "shape") : found.name,
        // The bar follows the object's size, turn and place.
        frame: `${attrs.width}x${attrs.height}@${attrs.x},${attrs.y},${attrs.dy},${attrs.rotate},${attrs.wrap}`,
      }
    },
  })
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [chartData, setChartData] = useState(false)
  const bar = useRef<HTMLDivElement | null>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const pos = selected?.pos ?? null

  // Selecting another object (or the same one again) brings a dismissed bar back.
  useEffect(() => {
    if (dismissed !== null && dismissed !== pos) {
      setDismissed(null)
    }
  }, [dismissed, pos])

  useEffect(() => {
    const root = editor.view.dom
    const onObject = (target: EventTarget | null) => {
      if (pos === null || !(target instanceof Node)) {
        return false
      }
      const dom = editor.view.nodeDOM(pos)
      return dom instanceof Node && dom.contains(target)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }
      pointerDown.current = onObject(event.target) ? { x: event.clientX, y: event.clientY } : null
      // A click on the object shows a dismissed bar again.
      setDismissed(null)
    }
    const onPointerMove = (event: PointerEvent) => {
      const down = pointerDown.current
      if (down && event.buttons !== 0 && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 3) {
        setBusy(true)
      }
    }
    const onPointerUp = () => {
      pointerDown.current = null
      // Dragged, resized, turned or drawn on: the bar fades back in at the new place.
      setBusy(false)
    }
    const onContextMenu = (event: MouseEvent) => {
      if (onObject(event.target)) {
        setDismissed(null)
      }
    }
    root.addEventListener("pointerdown", onPointerDown, true)
    root.addEventListener("contextmenu", onContextMenu, true)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true)
      root.removeEventListener("contextmenu", onContextMenu, true)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [editor, pos])

  // Esc puts the bar away; Alt+F10 moves into it.
  useEffect(() => {
    if (pos === null) {
      return
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "F10" && event.altKey) {
        const first = bar.current?.querySelector<HTMLElement>("[data-bar-item]")
        if (first) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      // With the context menu open, Esc puts both away, as in Word.
      if (event.key === "Escape" && editor.view.dom.contains(document.activeElement)) {
        if (dismissed !== pos && !document.querySelector(".ribbon-menu")) {
          setDismissed(pos)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editor, pos, dismissed])

  const hidden = !selected || busy || dismissed === pos

  useLayoutEffect(() => {
    if (hidden || !selected) {
      setPlace(null)
      return
    }
    let frame = 0
    const placeBar = () => {
      const dom = editor.view.nodeDOM(selected.pos)
      const element = dom instanceof HTMLElement ? dom : null
      const rect = element?.getBoundingClientRect()
      const scroller = document.getElementById("document-scroll")?.getBoundingClientRect()
      if (!element || !rect || rect.width < 1 || !bar.current) {
        setPlace(null)
        return
      }
      const width = bar.current.offsetWidth
      const height = bar.current.offsetHeight
      const view = { top: (scroller?.top ?? 0) + 4, bottom: scroller?.bottom ?? window.innerHeight }
      if (rect.bottom < view.top || rect.top > view.bottom) {
        setPlace(null)
        return
      }
      // The frame with its handles: the rotate handle stands out above the middle of the top edge.
      let top = rect.top
      let bottom = rect.bottom
      for (const handle of element.querySelectorAll<HTMLElement>(":scope > [data-rotate], :scope > [data-resize]")) {
        const box = handle.getBoundingClientRect()
        if (box.width > 0) {
          top = Math.min(top, box.top)
          bottom = Math.max(bottom, box.bottom)
        }
      }
      let next = top - GAP - height
      if (next < view.top) {
        next = Math.min(bottom + GAP, view.bottom - height - 4)
      }
      let left = rect.left + rect.width / 2 - width / 2
      // Never over the Layout Options button beside the object.
      const options = document.querySelector(".layout-options")?.getBoundingClientRect()
      if (
        options &&
        options.width > 0 &&
        left + width > options.left - GAP &&
        left < options.right &&
        next < options.bottom &&
        next + height > options.top
      ) {
        left = options.left - GAP - width
      }
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPlace((last) => (last && last.left === left && last.top === next ? last : { left, top: next }))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(placeBar)
    }
    placeBar()
    const scroller = document.getElementById("document-scroll")
    const unsubscribe = useViewStore.subscribe(schedule)
    scroller?.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    editor.on("transaction", schedule)
    return () => {
      cancelAnimationFrame(frame)
      unsubscribe()
      scroller?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      editor.off("transaction", schedule)
    }
  }, [editor, selected, hidden])

  const tool = useDrawStore((state) => state.tool)
  const drawColor = useDrawStore((state) => activeColor(state))
  const setTool = useDrawStore((state) => state.setTool)
  const commands = selected ? barCommands(editor, selected, { tool, drawColor, setTool, setChartData }) : []

  const dialog = chartData ? <ChartSheetDialog editor={editor} onClose={() => setChartData(false)} /> : null
  if (hidden || commands.length === 0) {
    return dialog
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(bar.current?.querySelectorAll<HTMLElement>("[data-bar-item]") ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    const jump = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1
    if (step && index !== -1) {
      event.preventDefault()
      items[(index + step + items.length) % items.length]?.focus()
    } else if (jump !== -1) {
      event.preventDefault()
      items[jump]?.focus()
    }
  }

  const groups = commands.reduce<BarCommand[][]>(
    (all, command) => {
      if (command.id === "|") {
        all.push([])
      } else {
        all[all.length - 1]!.push(command)
      }
      return all
    },
    [[]],
  )

  return (
    <>
      {createPortal(
        <div
          ref={bar}
          className={`object-bar${place ? " is-shown" : ""}`}
          role="toolbar"
          aria-label={`${barTitle(selected!.kind)} formatting`}
          style={place ? { left: place.left, top: place.top } : { left: 0, top: 0 }}
          onKeyDown={onKeyDown}
          onKeyDownCapture={(event) => {
            // Esc goes back to the object (the tooltip would otherwise take it).
            // An open menu (portalled, but inside in React's tree) closes first.
            if (event.key === "Escape" && event.target instanceof Node && bar.current?.contains(event.target)) {
              event.preventDefault()
              event.stopPropagation()
              editor.commands.focus()
            }
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {groups.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 ? <span className="object-bar-sep" role="separator" /> : null}
              {group.map((command, index) => (
                <BarButton key={command.id} command={command} first={groupIndex === 0 && index === 0} />
              ))}
            </Fragment>
          ))}
        </div>,
        document.body,
      )}
      {dialog}
    </>
  )
}

function BarButton({ command, first }: { command: BarCommand; first: boolean }) {
  const body = (
    <>
      <span className="object-bar-icon">{command.icon}</span>
      <span className="object-bar-label">{command.label}</span>
      {command.menu ? (
        <svg className="object-bar-chevron" viewBox="0 0 8 5" aria-hidden>
          <path d="M1.6 1 4 3.4 6.4 1" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      ) : null}
    </>
  )
  // Roving tab index: Tab reaches the first button, the arrow keys the rest.
  const focus = { "data-bar-item": "", tabIndex: first ? 0 : -1 }
  if (command.menu) {
    return (
      <span className="object-bar-split" {...focusProps(focus)}>
        <RibbonPopover
          label={command.label}
          description={command.description}
          shortcut={command.shortcut}
          active={command.active}
          className="object-bar-button has-menu"
          content={command.menu}
        >
          {body}
        </RibbonPopover>
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={command.label}
        aria-pressed={command.active || undefined}
        className={`object-bar-button${command.active ? " is-active" : ""}`}
        {...focus}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => command.onClick?.()}
      >
        {body}
      </TooltipTrigger>
      <RibbonTipContent label={command.label} description={command.description} shortcut={command.shortcut} />
    </Tooltip>
  )
}

/** The wrapper of a menu button only marks it; the focus goes to the button inside. */
function focusProps(focus: { tabIndex: number }) {
  return {
    "data-bar-split": "",
    ref: (span: HTMLSpanElement | null) => {
      const button = span?.querySelector("button")
      if (button) {
        button.dataset.barItem = ""
        button.tabIndex = focus.tabIndex
      }
    },
  }
}

/** Line weights, for the drawing canvas's Thickness menu. */
function ThicknessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 4h11" stroke="var(--icon-base-color)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M2.5 7.6h11" stroke="var(--icon-base-color)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2.5 11.8h11" stroke="var(--icon-accent-color)" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}

function barTitle(kind: string) {
  const titles: Record<string, string> = {
    image: "Picture",
    shape: "Shape",
    icon: "Graphic",
    chart: "Chart",
    model: "3D Model",
    threeDModel: "3D Model",
    smartArt: "SmartArt",
    drawingCanvas: "Drawing",
    textBox: "Text Box",
  }
  return titles[kind] ?? "Object"
}

function barCommands(
  editor: Editor,
  selected: Selected,
  state: {
    tool: DrawTool
    drawColor: string
    setTool: (tool: DrawTool) => void
    setChartData: (open: boolean) => void
  },
): BarCommand[] {
  const menu = (Menu: (props: { editor: Editor | null; close: () => void }) => ReactNode) => (close: () => void) => (
    <Menu editor={editor} close={close} />
  )
  const wrap: BarCommand = {
    id: "wrap",
    label: "Wrap Text",
    icon: <CurrentWrapIcon editor={editor} />,
    menu: menu(WrapTextMenu),
  }
  const rotate: BarCommand = { id: "rotate", label: "Rotate", icon: <LineRotateIcon />, menu: menu(RotateMenu) }
  const alt: BarCommand = {
    id: "alt",
    label: "Alt Text",
    icon: <LineAltTextIcon />,
    onClick: () => editAltText(editor),
  }
  const fill: BarCommand = {
    id: "fill",
    label: "Fill",
    icon: <LineShapeFillIcon color={String(selectedObject(editor)?.attrs.fill || "#deecf9")} />,
    menu: menu(ShapeFillMenu),
  }
  const outline: BarCommand = {
    id: "outline",
    label: "Outline",
    icon: (
      <LineShapeOutlineIcon
        color={String(selectedObject(editor)?.attrs.stroke || selectedObject(editor)?.attrs.borderColor || "#0f6cbd")}
      />
    ),
    menu: menu(ShapeOutlineMenu),
  }
  const shapeStyle: BarCommand = {
    id: "style",
    label: "Style",
    icon: <LineObjectStylesIcon />,
    menu: menu(ShapeStylesMenu),
  }
  const sep: BarCommand = { id: "|", label: "", icon: null }
  const cropping = useCropMode.getState().active
  switch (selected.kind) {
    case "image":
      return [
        { id: "style", label: "Style", icon: <LineObjectStylesIcon />, menu: menu(PictureStylesMenu) },
        {
          id: "crop",
          label: cropping ? "Apply" : "Crop",
          description: cropping ? "Apply the crop" : "Crop",
          icon: <LineCropIcon />,
          active: cropping,
          onClick: () => (cropping ? applyCrop() : useCropMode.getState().set(true)),
        },
        ...(cropping
          ? [
              {
                id: "crop-cancel",
                label: "Cancel",
                description: "Cancel the crop",
                icon: <LineCropIcon />,
                onClick: cancelCrop,
              },
              {
                id: "crop-reset",
                label: "Reset",
                description: "Show the whole picture",
                icon: <LineCropIcon />,
                onClick: resetPendingCrop,
              },
            ]
          : []),
        sep,
        wrap,
        rotate,
        sep,
        alt,
      ]
    case "shape":
    case "model":
      return [shapeStyle, fill, outline, sep, wrap, rotate, sep, alt]
    case "icon":
      return [
        { ...shapeStyle, description: "Graphics styles" },
        fill,
        outline,
        { id: "change-icon", label: "Change Icon", icon: <LineShapesIcon />, menu: menu(ChangeIconMenu) },
        sep,
        wrap,
      ]
    case "threeDModel":
      return [
        {
          id: "scenes",
          label: "Scenes",
          description: "Play 3D scenes",
          icon: <LineCubeIcon />,
          menu: menu(ModelScenesMenu),
        },
        {
          id: "pause",
          label: "Pause",
          icon: <LineCubeIcon />,
          onClick: () => editor?.chain().focus().updateAttributes("threeDModel", { scene: "" }).run(),
        },
        sep,
        {
          id: "views",
          label: "Views",
          description: "3D Model Views",
          icon: <LineCameraViewIcon />,
          menu: menu(ModelViewsMenu),
        },
        { id: "reset", label: "Reset", icon: <LineCubeIcon />, menu: menu(ModelResetMenu) },
        {
          id: "format",
          label: "Format",
          description: "Format 3D Model…",
          icon: <LineQuickLayoutIcon />,
          onClick: () => openModelFormat(),
        },
        sep,
        wrap,
        sep,
        alt,
      ]
    case "chart":
      return [
        {
          id: "elements",
          label: "Elements",
          description: "Chart Elements",
          icon: <LineChartElementIcon />,
          menu: menu(ChartElementsMenu),
        },
        {
          id: "styles",
          label: "Styles",
          description: "Chart Styles",
          icon: <LineChartStylesIcon />,
          menu: menu(ChartStylesMenu),
        },
        { id: "data", label: "Edit Data", icon: <LineTableIcon />, onClick: () => state.setChartData(true) },
        sep,
        wrap,
      ]
    case "smartArt":
      return [
        { id: "add-shape", label: "Add Shape", icon: <LineShapesIcon />, menu: menu(SmartArtAddShapeMenu) },
        {
          id: "colors",
          label: "Colors",
          description: "Change Colors",
          icon: <LineColorsIcon />,
          menu: menu(SmartArtColorsMenu),
        },
        { id: "layouts", label: "Layouts", icon: <LineQuickLayoutIcon />, menu: menu(SmartArtLayoutsMenu) },
        sep,
        wrap,
      ]
    case "drawingCanvas": {
      const pick = (tool: DrawTool) => () => state.setTool(tool)
      return [
        {
          id: "select",
          label: "Select",
          icon: <LineSelectIcon />,
          active: state.tool === "select",
          onClick: pick("select"),
        },
        { id: "pen", label: "Pen", icon: <LinePenIcon />, active: state.tool === "pen", onClick: pick("pen") },
        {
          id: "highlighter",
          label: "Highlighter",
          icon: <LineHighlighterIcon />,
          active: state.tool === "highlighter",
          onClick: pick("highlighter"),
        },
        {
          id: "color",
          label: "Color",
          icon: <LineShapeOutlineIcon color={state.drawColor} />,
          menu: (close) => <DrawColorMenu close={close} />,
        },
        {
          id: "thickness",
          label: "Thickness",
          icon: <ThicknessIcon />,
          menu: (close) => <DrawThicknessMenu close={close} />,
        },
        sep,
        wrap,
      ]
    }
    case "textBox":
      return [
        shapeStyle,
        fill,
        outline,
        { id: "align", label: "Align Text", icon: <LineCellAlignIcon />, menu: menu(AlignTextMenu) },
        sep,
        wrap,
      ]
    default:
      return []
  }
}
