import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import {
  LineDrawingIcon,
  LineEraseIcon,
  LineHighlighterIcon,
  LinePenIcon,
  LineSelectIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { AddPenMenu, PenGallery } from "@/components/ribbon/draw-pens"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  HIGHLIGHTER_COLORS,
  PEN_COLORS,
  activeColor,
  activeWidthMm,
  parseStrokes,
  useDrawStore,
} from "@/editor/drawing"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState } from "@tiptap/react"

export function DrawTab() {
  const editor = useDocumentEditor()
  const tool = useDrawStore((state) => state.tool)
  const widthMm = useDrawStore((state) => activeWidthMm(state))
  const color = useDrawStore((state) => activeColor(state))
  const setTool = useDrawStore((state) => state.setTool)
  const setWidthMm = useDrawStore((state) => state.setWidthMm)
  const setColor = useDrawStore((state) => state.setColor)
  const colors = tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS
  const canvas = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== "drawingCanvas") {
        return null
      }
      return {
        pos: selection.from,
        strokeCount: parseStrokes(selection.node.attrs.strokes).length,
      }
    },
  })
  const ready = Boolean(editor && canvas)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const ruler = useDrawStore((state) => state.ruler)
  const setRuler = useDrawStore((state) => state.setRuler)
  // Word's Ruler lies level across the middle of the canvas.
  const toggleRuler = () => setRuler(ruler ? null : { x: 240, y: 120, angle: 0 })

  const insertCanvas = () => {
    editor?.chain().focus().insertDrawingCanvas().run()
    setTool("pen")
  }
  const widthInput = (
    <input
      aria-label="Stroke width in millimeters"
      type="number"
      min={0.25}
      max={20}
      step={0.25}
      value={widthMm}
      className="h-8 w-16 rounded border border-[var(--app-ribbon-border,#d0d0d0)] bg-[var(--app-popover-bg,#fff)] px-2 text-[var(--app-ribbon-text,#242424)]"
      onChange={(event) => setWidthMm(Number(event.target.value))}
    />
  )
  const swatches = (close?: () => void) => (
    <div className="flex items-center gap-1 px-1">
      {colors.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={tool === "highlighter" ? `Highlighter ${swatch}` : `Pen ${swatch}`}
          aria-pressed={color === swatch}
          className="size-6 rounded border"
          style={{
            background: swatch,
            borderColor: color === swatch ? "#0f6cbd" : "rgba(0,0,0,0.2)",
            boxShadow: color === swatch ? "0 0 0 1px #0f6cbd" : undefined,
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (tool === "select") {
              setTool("pen")
            }
            setColor(swatch)
            close?.()
          }}
        />
      ))}
    </div>
  )
  const clearMenu = (close: () => void) => (
    <>
      <MenuButton
        onClick={() => {
          if (editor && canvas) {
            clearStrokes(editor, canvas.pos)
          }
          close()
        }}
      >
        Clear All Ink
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor && canvas) {
            undoLastStroke(editor, canvas.pos)
          }
          close()
        }}
      >
        Remove Last Stroke
      </MenuButton>
    </>
  )

  if (ribbonLayout === "single") {
    const tools: LineCommand[] = [
      {
        id: "select",
        label: "Select",
        icon: <LineSelectIcon />,
        active: tool === "select",
        onClick: () => setTool("select"),
      },
      {
        id: "pen",
        label: "Pen",
        icon: <LinePenIcon />,
        priority: 2,
        active: tool === "pen",
        onClick: () => setTool("pen"),
      },
      {
        id: "highlighter",
        label: "Highlighter",
        icon: <LineHighlighterIcon />,
        priority: 1,
        active: tool === "highlighter",
        onClick: () => setTool("highlighter"),
      },
      {
        id: "lasso",
        label: "Lasso Select",
        icon: <LassoIcon />,
        active: tool === "lasso",
        onClick: () => setTool("lasso"),
      },
      {
        id: "eraser",
        label: "Eraser",
        icon: <EraserIcon />,
        priority: 1,
        active: tool === "eraser",
        onClick: () => setTool("eraser"),
      },
    ]
    const canvasCommands: LineCommand[] = [
      {
        id: "drawing-canvas",
        label: "Drawing Canvas",
        icon: <LineDrawingIcon />,
        priority: 1,
        disabled: !editor,
        onClick: insertCanvas,
      },
      {
        id: "ruler",
        label: "Ruler",
        icon: <RulerIcon />,
        active: Boolean(ruler),
        onClick: toggleRuler,
      },
      {
        id: "add-pen",
        label: "Add Pen",
        icon: <AddPenIcon />,
        menu: (close) => <AddPenMenu close={close} />,
      },
      {
        id: "clear",
        label: "Clear",
        icon: <LineEraseIcon />,
        disabled: !ready || !canvas?.strokeCount,
        menu: clearMenu,
      },
    ]
    // The stroke's width and colour sit in the classic tab as fields, so they live in More options.
    const more: LineGroup[] = [
      {
        id: "stroke",
        commands: [
          { id: "width", label: "Width (mm)", field: widthInput },
          {
            id: "color",
            label: tool === "highlighter" ? "Highlighter Color" : "Pen Color",
            icon: <span className="block size-3.5 rounded-sm border border-black/20" style={{ background: color }} />,
            menu: (close) => swatches(close),
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Draw"
        groups={[
          { id: "tools", commands: tools.map((command) => ({ ...command, showLabel: true })) },
          { id: "canvas", commands: canvasCommands.map((command) => ({ ...command, showLabel: true })) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Draw" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Drawing Tools">
        <RibbonCommand label="Select" active={tool === "select"} onClick={() => setTool("select")}>
          <SelectIcon />
        </RibbonCommand>
        <RibbonCommand label="Lasso Select" active={tool === "lasso"} onClick={() => setTool("lasso")}>
          <LassoIcon />
        </RibbonCommand>
        <RibbonCommand label="Eraser" active={tool === "eraser"} onClick={() => setTool("eraser")}>
          <EraserIcon />
        </RibbonCommand>
        <PenGallery />
        <RibbonCommand label="Add Pen" menu={(close) => <AddPenMenu close={close} />}>
          <AddPenIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Stencils">
        <RibbonCommand label="Ruler" active={Boolean(ruler)} onClick={toggleRuler}>
          <RulerIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Canvas">
        <RibbonCommand label="Drawing Canvas" disabled={!editor} onClick={insertCanvas}>
          <CanvasIcon />
        </RibbonCommand>
        <RibbonCommand label="Clear" disabled={!ready || !canvas?.strokeCount} menu={clearMenu}>
          <ClearIcon />
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}

function clearStrokes(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "drawingCanvas") {
    return
  }
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, strokes: "[]" })
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return true
    })
    .run()
}

function undoLastStroke(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "drawingCanvas") {
    return
  }
  const strokes = parseStrokes(node.attrs.strokes)
  if (!strokes.length) {
    return
  }
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, strokes: JSON.stringify(strokes.slice(0, -1)) })
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return true
    })
    .run()
}

function SelectIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M7 5.5 7 20.5 11.2 16.4 14.2 22.2 16.6 21.1 13.6 15.2 19.2 15.2Z" fill="#242424" />
    </svg>
  )
}

function CanvasIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="4" y="6" width="20" height="16" rx="1.5" fill="#fff" stroke="#5c5c5c" />
      <path d="M7 18c2-4 4-6 6-4s3 5 5 3 3-4 4-3" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M8 8h12v12H8z" fill="#f3f3f3" stroke="#8a8a8a" />
      <path d="M10 10 18 18M18 10 10 18" stroke="#d13438" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function LassoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="9" rx="8" ry="5.5" strokeDasharray="2.5 2" />
      <path d="M8 14c-1 2 0 4 2 5" />
      <circle cx="10.5" cy="19.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

function EraserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M14.5 4.5l5 5-9 9H6l-2.5-2.5z" />
      <path d="M9.5 9.5l5 5" />
      <path d="M10.5 18.5H20" />
      <path d="M14.5 4.5l5 5-5 5-5-5z" fill="#f4a7b9" stroke="none" opacity="0.8" />
    </svg>
  )
}

function AddPenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M9 3l3 6H6z" fill="currentColor" />
      <rect x="6.5" y="9" width="5" height="12" rx="1" />
      <path d="M18 12v8M14 16h8" stroke="#0f6cbd" strokeWidth="1.8" />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <rect x="2.5" y="8" width="19" height="8" rx="1" transform="rotate(-30 12 12)" />
      <path d="M7 12.6l-1-1.7M10 10.9l-1.4-2.4M13 9.1l-1-1.7M16 7.4l-1.4-2.4" transform="translate(0.5 1.5)" />
    </svg>
  )
}
