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
      <RibbonGroup label="Tools">
        <RibbonCommand label="Select" active={tool === "select"} onClick={() => setTool("select")}>
          <SelectIcon />
        </RibbonCommand>
        <RibbonCommand label="Pen" active={tool === "pen"} onClick={() => setTool("pen")}>
          <PenIcon />
        </RibbonCommand>
        <RibbonCommand label="Highlighter" active={tool === "highlighter"} onClick={() => setTool("highlighter")}>
          <HighlighterIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Stroke">
        <label className="draw-width-field flex items-center gap-1 px-1 text-[12px]">
          Width
          {widthInput}
          mm
        </label>
        {swatches()}
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

function PenIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M17.2 5.2 22.8 10.8 11.4 22.2 5.2 22.8 5.8 16.6Z" fill="#0f6cbd" />
      <path d="M17.2 5.2 22.8 10.8" stroke="#242424" strokeWidth="1.2" />
      <path d="M6.2 21.6 9.4 18.4" stroke="#fff" strokeWidth="1" />
    </svg>
  )
}

function HighlighterIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M6 18.5h16" stroke="#ffe600" strokeWidth="5" strokeLinecap="round" />
      <path d="M16.2 5.4 22.4 11.6 12.2 21.8H6.4V16Z" fill="#f5d000" stroke="#8a6a00" />
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
