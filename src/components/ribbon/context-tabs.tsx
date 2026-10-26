import { openTableProperties } from "@/components/table-properties-dialog"
import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { ModelLibrary } from "@/components/model-library"
import { askText } from "@/components/text-prompt"
import { ContextGlyph } from "@/components/ribbon/context-icons"
import { GalleryNav } from "@/components/ribbon/shape-format-tab"
import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover } from "@/components/ribbon/ribbon-button"
import { DateIcon, DateMenu, HeaderFooterCommands, useChromeMenus } from "@/components/ribbon/insert-tab"
import {
  LineAltTextIcon,
  LineBordersIcon,
  LineCameraViewIcon,
  LineCellAlignIcon,
  LineChromeIcon,
  LineCloseIcon,
  LineCorrectionsIcon,
  LineCropIcon,
  LineCubeIcon,
  LineFirstPageIcon,
  LineGoToChromeIcon,
  LineMergeCellsIcon,
  LineObjectStylesIcon,
  LinePageNumberIcon,
  LineSelectIcon,
  LineSortIcon,
  LineSplitCellsIcon,
  LineTableDeleteIcon,
  LineTableInsertIcon,
  LineTableOptionsIcon,
  LineTableStylesIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import {
  applyBorders,
  BORDER_STYLE_PRESETS,
  DEFAULT_PEN,
  paintCellEdge,
  selectTablePart,
  tableStyleOptions,
  toggleTableStyleOption,
  TABLE_LOOKS,
  type BorderKind,
  type BorderPen,
  type TableStyleOption,
} from "@/editor/table-tools"
import {
  BordersMenu,
  borderLabel,
  PenColorMenu,
  PenStyleMenu,
  PenWeightMenu,
  ShadingMenu,
  TableStyleGallery,
  TableStyleSwatch,
  useTableStylesDialog,
} from "@/components/table-design-menus"
import { BordersIcon, ShadingIcon } from "@/components/ribbon/icons"
import {
  alignTableCell,
  autoFitTable,
  clearCellBorders,
  convertTableToText,
  cycleCellMargins,
  distributeColumns,
  distributeRows,
  insertColumnSum,
  setColumnWidthCm,
  setRowHeightCm,
  sortTable,
  splitTable,
  tableLayoutState,
  toggleGridlines,
  toggleRepeatHeader,
  toggleTextDirection,
} from "@/editor/table-layout"
import { WrapTextMenu } from "@/components/wrap-menu"
import {
  ModelScenesMenu,
  ModelViewTiles,
  ModelViewsMenu,
  PictureStyleRow,
  RotateMenu,
  shapeNode,
} from "@/components/object-menus"
import { MODEL_VIEWS, viewPose, viewSourceFor } from "@/editor/model-views"
import { selectedObject } from "@/editor/objects"
import {
  PictureArtisticMenu,
  PictureBorderMenu,
  PictureColorMenu,
  PictureCorrectionsMenu,
  PictureStyleGallery,
  PictureTransparencyMenu,
  useCompressDialog,
} from "@/components/picture-menus"
import { AlignObjectsMenu, GroupMenu } from "@/components/arrange-menus"
import { ShapeEffectsMenu } from "@/components/shape-menus"
import { applyCrop, cancelCrop, resetPendingCrop, useCropMode } from "@/editor/picture-crop"
import { PICTURE_RESET } from "@/editor/picture-format"
import { PositionMenu } from "@/components/position-menu"
import { CurrentPositionIcon, CurrentWrapIcon } from "@/components/object-layout-icons"
import { openModelFormat } from "@/components/model-format-dialog"
import { MODEL_LIGHTINGS } from "@/editor/model-format"
import { chromeStep } from "@/document/chrome-editing"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useBodyEditor, useDocumentEditor } from "@/editor/document-editor"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState } from "@tiptap/react"
import { useEffect, useState } from "react"

/** The single line ribbon shows each command's name beside its icon. */
function labelled(commands: LineCommand[]) {
  return commands.map((command) => ({ ...command, showLabel: true }))
}

const STYLE_OPTIONS: { id: TableStyleOption; label: string }[] = [
  { id: "headerRow", label: "Header Row" },
  { id: "totalRow", label: "Total Row" },
  { id: "bandedRows", label: "Banded Rows" },
  { id: "firstColumn", label: "First Column" },
  { id: "lastColumn", label: "Last Column" },
  { id: "bandedColumns", label: "Banded Columns" },
]

export function TableDesignTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const [pen, setPen] = useState<BorderPen>(DEFAULT_PEN)
  const [painter, setPainter] = useState(false)
  // The Borders button does again what was last chosen from its menu; Bottom Border to begin with, as in Word.
  const [lastBorder, setLastBorder] = useState<BorderKind>("bottom")
  const applyLastBorder = () => editor && applyBorders(editor, lastBorder, pen)
  const options = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? tableStyleOptions(current) : null),
  })
  const gridlines = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? tableLayoutState(current)?.gridlines !== false : true),
  })
  const [stylePage, setStylePage] = useState(0)
  const stylesMenu = (close: () => void) => <TableStyleGallery editor={editor} close={close} />
  // Style options stay open, so several can be changed in a row, as with the classic checkboxes.
  const optionsMenu = () => (
    <div className="flex w-48 flex-col">
      {STYLE_OPTIONS.map((option) => (
        <MenuButton
          key={option.id}
          selected={Boolean(options?.[option.id])}
          onClick={() => editor && toggleTableStyleOption(editor, option.id)}
        >
          {option.label}
        </MenuButton>
      ))}
    </div>
  )
  const shadingMenu = (close: () => void) => <ShadingMenu editor={editor} close={close} />
  const bordersMenu = (close: () => void) => (
    <BordersMenu
      editor={editor}
      pen={pen}
      close={close}
      gridlines={Boolean(gridlines)}
      onGridlines={() => editor && toggleGridlines(editor)}
      onPick={setLastBorder}
    />
  )
  // The Border Painter: while on, a click draws the pen on the cell edge nearest to it. Escape, or leaving the tab, ends it.
  useEffect(() => {
    if (!painter || !editor) {
      return
    }
    const root = editor.view.dom
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0 && paintCellEdge(editor, event.clientX, event.clientY, pen)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPainter(false)
      }
    }
    root.classList.add("border-painter-on")
    root.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      root.classList.remove("border-painter-on")
      root.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [painter, editor, pen])
  const borderStylesMenu = (close: () => void) => (
    <div className="grid w-56 grid-cols-2 gap-1 p-1">
      {BORDER_STYLE_PRESETS.map((preset) => (
        <MenuButton
          key={preset.label}
          selected={JSON.stringify(preset.pen) === JSON.stringify(pen)}
          onClick={() => {
            setPen(preset.pen)
            setPainter(true)
            close()
          }}
        >
          <span className="flex flex-col gap-1" title={preset.label}>
            <span
              className="pen-sample"
              style={{ borderTop: `${Math.max(1, preset.pen.width)}px ${preset.pen.style} ${preset.pen.color}` }}
            />
            <span className="text-[10px] opacity-70">{preset.label}</span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const penStyleMenu = (close: () => void) => <PenStyleMenu pen={pen} onChange={setPen} close={close} />
  const penWeightMenu = (close: () => void) => <PenWeightMenu pen={pen} onChange={setPen} close={close} />
  const penColorMenu = (close: () => void) => <PenColorMenu pen={pen} onChange={setPen} close={close} />

  if (ribbonLayout === "single") {
    const styles: LineCommand[] = [
      {
        id: "table-styles",
        label: "Table Styles",
        icon: <LineTableStylesIcon />,
        priority: 2,
        disabled: !editor,
        menu: stylesMenu,
      },
      {
        id: "style-options",
        label: "Style Options",
        icon: <LineTableOptionsIcon />,
        disabled: !editor || !options,
        menu: optionsMenu,
      },
      { id: "shading", label: "Shading", icon: <ShadingIcon />, disabled: !editor, menu: shadingMenu },
    ]
    const borders: LineCommand[] = [
      {
        id: "borders",
        label: "Borders",
        description: borderLabel(lastBorder),
        icon: <LineBordersIcon />,
        disabled: !editor,
        onClick: applyLastBorder,
        menu: bordersMenu,
      },
      {
        id: "border-styles",
        label: "Border Styles",
        icon: <LineBordersIcon />,
        disabled: !editor,
        menu: borderStylesMenu,
      },
      {
        id: "border-painter",
        label: "Border Painter",
        icon: <LineBordersIcon />,
        active: painter,
        disabled: !editor,
        onClick: () => setPainter((on) => !on),
      },
      { id: "pen-style", label: "Line Style", icon: <LineBordersIcon />, disabled: !editor, menu: penStyleMenu },
      { id: "pen-weight", label: "Line Weight", icon: <LineBordersIcon />, disabled: !editor, menu: penWeightMenu },
      { id: "pen-color", label: "Pen Color", icon: <LineBordersIcon />, disabled: !editor, menu: penColorMenu },
    ]
    return (
      <SingleLineBar
        label="Table Design"
        groups={[
          { id: "styles", commands: labelled(styles) },
          { id: "borders", commands: labelled(borders) },
        ]}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Table Design" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Table Style Options">
        <div className="table-style-options">
          {STYLE_OPTIONS.map((option) => {
            const checked = Boolean(options?.[option.id])
            return (
              <button
                key={option.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={option.label}
                disabled={!editor || !options}
                className={`ribbon-side table-style-option${checked ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor && toggleTableStyleOption(editor, option.id)}
              >
                <span className={`table-style-box${checked ? " is-on" : ""}`} aria-hidden />
                <span className="ribbon-side-label">{option.label}</span>
              </button>
            )
          })}
        </div>
      </RibbonGroup>
      <RibbonGroup
        label="Table Styles"
        onLaunch={() => useTableStylesDialog.getState().show()}
        launchLabel="Table Styles"
      >
        <div className="table-style-row">
          {TABLE_LOOKS.slice(stylePage * 7, stylePage * 7 + 7).map((look) => (
            <TableStyleSwatch key={look.id} look={look} editor={editor} />
          ))}
        </div>
        <GalleryNav
          label="table styles"
          canUp={stylePage > 0}
          canDown={stylePage * 7 + 7 < TABLE_LOOKS.length}
          onUp={() => setStylePage(stylePage - 1)}
          onDown={() => setStylePage(stylePage + 1)}
          more={stylesMenu}
        />
      </RibbonGroup>
      <RibbonGroup
        label="Borders"
        launchLabel="Borders and Shading"
        onLaunch={() => editor && openBordersAndShading(editor)}
      >
        <RibbonCommand label="Shading" disabled={!editor} menu={shadingMenu}>
          <ShadingIcon />
        </RibbonCommand>
        <div className="flex flex-col py-0.5">
          <RibbonCommand size="small" label="Line Style" disabled={!editor} menu={penStyleMenu}>
            <ContextGlyph label="Picture Border" />
          </RibbonCommand>
          <RibbonCommand size="small" label={`${pen.width} pt`} disabled={!editor} menu={penWeightMenu}>
            <ContextGlyph label="Picture Border" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Pen Color" disabled={!editor} menu={penColorMenu}>
            <span className="table-pen-color" style={{ background: pen.color }} aria-hidden />
          </RibbonCommand>
        </div>
        <RibbonCommand
          label="Borders"
          description={`${borderLabel(lastBorder)}. The arrow lists the borders of the selected cells.`}
          disabled={!editor}
          onClick={applyLastBorder}
          menu={bordersMenu}
        >
          <BordersIcon />
        </RibbonCommand>
        <div className="flex flex-col py-0.5">
          <RibbonCommand size="small" label="Border Styles" disabled={!editor} menu={borderStylesMenu}>
            <BordersIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Border Painter"
            active={painter}
            disabled={!editor}
            onClick={() => setPainter((on) => !on)}
          >
            <BordersIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
    </div>
  )
}

const CELL_ALIGNS: { horizontal: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom"; label: string }[] =
  [
    { horizontal: "left", vertical: "top", label: "Align Top Left" },
    { horizontal: "center", vertical: "top", label: "Align Top Center" },
    { horizontal: "right", vertical: "top", label: "Align Top Right" },
    { horizontal: "left", vertical: "middle", label: "Align Center Left" },
    { horizontal: "center", vertical: "middle", label: "Align Center" },
    { horizontal: "right", vertical: "middle", label: "Align Center Right" },
    { horizontal: "left", vertical: "bottom", label: "Align Bottom Left" },
    { horizontal: "center", vertical: "bottom", label: "Align Bottom Center" },
    { horizontal: "right", vertical: "bottom", label: "Align Bottom Right" },
  ]

export function TableLayoutTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const layout = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? tableLayoutState(current) : null),
  })
  const ready = Boolean(editor && layout)
  const selectMenu = () => (
    <>
      <MenuButton onClick={() => editor && selectTablePart(editor, "cell")}>Select Cell</MenuButton>
      <MenuButton onClick={() => editor && selectTablePart(editor, "row")}>Select Row</MenuButton>
      <MenuButton onClick={() => editor && selectTablePart(editor, "column")}>Select Column</MenuButton>
      <MenuButton onClick={() => editor && selectTablePart(editor, "table")}>Select Table</MenuButton>
    </>
  )
  const deleteMenu = () => (
    <>
      <MenuButton onClick={() => editor?.chain().focus().deleteColumn().run()}>Delete Columns</MenuButton>
      <MenuButton onClick={() => editor?.chain().focus().deleteRow().run()}>Delete Rows</MenuButton>
      <MenuButton onClick={() => editor?.chain().focus().deleteTable().run()}>Delete Table</MenuButton>
    </>
  )
  const autoFitMenu = () => (
    <>
      <MenuButton onClick={() => editor && autoFitTable(editor, "contents")}>AutoFit Contents</MenuButton>
      <MenuButton onClick={() => editor && autoFitTable(editor, "window")}>AutoFit Window</MenuButton>
    </>
  )
  const heightField = (
    <SizeField
      label="Height"
      value={layout?.heightCm ?? 0}
      disabled={!ready}
      onCommit={(cm) => editor && setRowHeightCm(editor, cm)}
    />
  )
  const widthField = (
    <SizeField
      label="Width"
      value={layout?.widthCm ?? 0}
      disabled={!ready}
      onCommit={(cm) => editor && setColumnWidthCm(editor, cm)}
    />
  )
  const alignGrid = (
    <div className="table-align-grid" role="group" aria-label="Cell alignment">
      {CELL_ALIGNS.map((align) => (
        <button
          key={align.label}
          type="button"
          className="table-align-cell"
          aria-label={align.label}
          disabled={!ready}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor && alignTableCell(editor, align.horizontal, align.vertical)}
        >
          <span className={`table-align-mark is-${align.vertical} is-${align.horizontal}`} />
        </button>
      ))}
    </div>
  )
  const insertMenu = (close: () => void) => (
    <div className="flex w-44 flex-col">
      {(
        [
          ["Insert Above", () => editor?.chain().focus().addRowBefore().run()],
          ["Insert Below", () => editor?.chain().focus().addRowAfter().run()],
          ["Insert Left", () => editor?.chain().focus().addColumnBefore().run()],
          ["Insert Right", () => editor?.chain().focus().addColumnAfter().run()],
        ] as const
      ).map(([label, run]) => (
        <MenuButton
          key={label}
          onClick={() => {
            run()
            close()
          }}
        >
          {label}
        </MenuButton>
      ))}
    </div>
  )
  const alignMenu = (close: () => void) => (
    <div className="p-1" onClick={close}>
      {alignGrid}
    </div>
  )

  if (ribbonLayout === "single") {
    const table: LineCommand[] = [
      { id: "select", label: "Select", icon: <LineSelectIcon />, disabled: !ready, menu: selectMenu },
      {
        id: "properties",
        label: "Properties",
        icon: <LineSelectIcon />,
        disabled: !ready,
        onClick: () => editor && openTableProperties(editor),
      },
      { id: "insert", label: "Insert", icon: <LineTableInsertIcon />, priority: 2, disabled: !ready, menu: insertMenu },
      { id: "delete", label: "Delete", icon: <LineTableDeleteIcon />, priority: 2, disabled: !ready, menu: deleteMenu },
    ]
    const merge: LineCommand[] = [
      {
        id: "merge-cells",
        label: "Merge Cells",
        icon: <LineMergeCellsIcon />,
        priority: 1,
        disabled: !editor?.can().mergeCells(),
        onClick: () => editor?.chain().focus().mergeCells().run(),
      },
      {
        id: "split-cells",
        label: "Split Cells",
        icon: <LineSplitCellsIcon />,
        disabled: !editor?.can().splitCell(),
        onClick: () => editor?.chain().focus().splitCell().run(),
      },
    ]
    const cells: LineCommand[] = [
      { id: "alignment", label: "Alignment", icon: <LineCellAlignIcon />, disabled: !ready, menu: alignMenu },
      {
        id: "sort",
        label: "Sort",
        icon: <LineSortIcon />,
        disabled: !ready,
        onClick: () => editor && sortTable(editor),
      },
    ]
    // The rest of the classic tab, grouped as there.
    const more: LineGroup[] = [
      {
        id: "table",
        commands: [
          {
            id: "gridlines",
            label: "View Gridlines",
            icon: <ContextGlyph label="View Gridlines" />,
            active: Boolean(layout?.gridlines),
            disabled: !ready,
            onClick: () => editor && toggleGridlines(editor),
          },
          {
            id: "draw-table",
            label: "Draw Table",
            icon: <ContextGlyph label="Draw Table" />,
            disabled: !editor,
            onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          },
          {
            id: "eraser",
            label: "Eraser",
            icon: <ContextGlyph label="Eraser" />,
            disabled: !ready,
            onClick: () => editor && clearCellBorders(editor),
          },
          {
            id: "split-table",
            label: "Split Table",
            icon: <ContextGlyph label="Split Table" />,
            disabled: !ready,
            onClick: () => editor && splitTable(editor),
          },
        ],
      },
      {
        id: "cell-size",
        commands: [
          {
            id: "autofit",
            label: "AutoFit",
            icon: <ContextGlyph label="AutoFit" />,
            disabled: !ready,
            menu: autoFitMenu,
          },
          {
            id: "cell-size",
            label: "Size",
            icon: <ContextGlyph label="Size" />,
            field: (
              <div className="flex flex-col gap-1">
                {heightField}
                {widthField}
              </div>
            ),
          },
          {
            id: "distribute-rows",
            label: "Distribute Rows",
            icon: <ContextGlyph label="Distribute Rows" />,
            disabled: !ready,
            onClick: () => editor && distributeRows(editor),
          },
          {
            id: "distribute-columns",
            label: "Distribute Columns",
            icon: <ContextGlyph label="Distribute Columns" />,
            disabled: !ready,
            onClick: () => editor && distributeColumns(editor),
          },
        ],
      },
      {
        id: "alignment",
        commands: [
          {
            id: "text-direction",
            label: "Text Direction",
            icon: <ContextGlyph label="Text Direction" />,
            active: Boolean(layout?.vertical),
            disabled: !ready,
            onClick: () => editor && toggleTextDirection(editor),
          },
          {
            id: "cell-margins",
            label: "Cell Margins",
            icon: <ContextGlyph label="Cell Margins" />,
            disabled: !ready,
            onClick: () => editor && cycleCellMargins(editor),
          },
        ],
      },
      {
        id: "data",
        commands: [
          {
            id: "repeat-header",
            label: "Repeat Header Rows",
            icon: <ContextGlyph label="Repeat Header Rows" />,
            active: Boolean(layout?.headerRow),
            disabled: !ready,
            onClick: () => editor && toggleRepeatHeader(editor),
          },
          {
            id: "convert-to-text",
            label: "Convert to Text",
            icon: <ContextGlyph label="Convert to Text" />,
            disabled: !ready,
            onClick: () => editor && convertTableToText(editor),
          },
          {
            id: "formula",
            label: "Formula",
            icon: <ContextGlyph label="Formula" />,
            disabled: !ready,
            onClick: () => editor && insertColumnSum(editor),
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Table Layout"
        groups={[
          { id: "table", commands: labelled(table) },
          { id: "merge", commands: labelled(merge) },
          { id: "cells", commands: labelled(cells) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Table Layout" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Table">
        <RibbonCommand size="large" label="Select" disabled={!ready} menu={selectMenu}>
          <ContextGlyph label="Select" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Properties"
          disabled={!ready}
          onClick={() => editor && openTableProperties(editor)}
        >
          <ContextGlyph label="Properties" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="View Gridlines"
          disabled={!ready}
          active={Boolean(layout?.gridlines)}
          onClick={() => editor && toggleGridlines(editor)}
        >
          <ContextGlyph label="View Gridlines" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Draw">
        <RibbonCommand
          size="large"
          label="Draw Table"
          disabled={!editor}
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <ContextGlyph label="Draw Table" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Eraser" disabled={!ready} onClick={() => editor && clearCellBorders(editor)}>
          <ContextGlyph label="Eraser" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup
        label="Rows & Columns"
        onLaunch={() => editor && openTableProperties(editor, "row")}
        launchLabel="Table Properties"
      >
        <RibbonCommand size="large" label="Delete" disabled={!ready} menu={deleteMenu}>
          <ContextGlyph label="Delete" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Insert Above"
          disabled={!ready}
          onClick={() => editor?.chain().focus().addRowBefore().run()}
        >
          <ContextGlyph label="Insert Above" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Insert Below"
          disabled={!ready}
          onClick={() => editor?.chain().focus().addRowAfter().run()}
        >
          <ContextGlyph label="Insert Below" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Insert Left"
          disabled={!ready}
          onClick={() => editor?.chain().focus().addColumnBefore().run()}
        >
          <ContextGlyph label="Insert Left" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Insert Right"
          disabled={!ready}
          onClick={() => editor?.chain().focus().addColumnAfter().run()}
        >
          <ContextGlyph label="Insert Right" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Merge">
        <RibbonCommand
          size="large"
          label="Merge Cells"
          disabled={!editor?.can().mergeCells()}
          onClick={() => editor?.chain().focus().mergeCells().run()}
        >
          <ContextGlyph label="Merge Cells" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Split Cells"
          disabled={!editor?.can().splitCell()}
          onClick={() => editor?.chain().focus().splitCell().run()}
        >
          <ContextGlyph label="Split Cells" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Split Table" disabled={!ready} onClick={() => editor && splitTable(editor)}>
          <ContextGlyph label="Split Table" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup
        label="Cell Size"
        onLaunch={() => editor && openTableProperties(editor, "column")}
        launchLabel="Table Properties"
      >
        <RibbonCommand size="large" label="AutoFit" disabled={!ready} menu={autoFitMenu}>
          <ContextGlyph label="AutoFit" />
        </RibbonCommand>
        <div className="flex flex-col justify-center gap-1 px-1">
          {heightField}
          {widthField}
        </div>
        <div className="flex flex-col justify-center">
          <RibbonCommand
            size="small"
            label="Distribute Rows"
            disabled={!ready}
            onClick={() => editor && distributeRows(editor)}
          >
            <ContextGlyph label="Distribute Rows" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Distribute Columns"
            disabled={!ready}
            onClick={() => editor && distributeColumns(editor)}
          >
            <ContextGlyph label="Distribute Columns" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Alignment">
        {alignGrid}
        <RibbonCommand
          size="large"
          label="Text Direction"
          disabled={!ready}
          active={Boolean(layout?.vertical)}
          onClick={() => editor && toggleTextDirection(editor)}
        >
          <ContextGlyph label="Text Direction" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Cell Margins"
          disabled={!ready}
          onClick={() => editor && cycleCellMargins(editor)}
        >
          <ContextGlyph label="Cell Margins" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Data">
        <RibbonCommand size="large" label="Sort" disabled={!ready} onClick={() => editor && sortTable(editor)}>
          <ContextGlyph label="Sort" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Repeat Header Rows"
          disabled={!ready}
          active={Boolean(layout?.headerRow)}
          onClick={() => editor && toggleRepeatHeader(editor)}
        >
          <ContextGlyph label="Repeat Header Rows" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Convert to Text"
          disabled={!ready}
          onClick={() => editor && convertTableToText(editor)}
        >
          <ContextGlyph label="Convert to Text" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Formula" disabled={!ready} onClick={() => editor && insertColumnSum(editor)}>
          <ContextGlyph label="Formula" />
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}

function SizeField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (cm: number) => void
}) {
  const [text, setText] = useState(value > 0 ? value.toFixed(2) : "")
  useEffect(() => {
    setText(value > 0 ? value.toFixed(2) : "")
  }, [value])
  return (
    <label className="table-size-field">
      <span>{label}:</span>
      <input
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const cm = Number(text)
          if (cm > 0) {
            onCommit(cm)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      <span>cm</span>
    </label>
  )
}

const PX_PER_CM_PICTURE = 96 / 2.54

export function PictureFormatTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const picture = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") {
        return null
      }
      return {
        width: Number(selection.node.attrs.width) || 0,
        height: Number(selection.node.attrs.height) || 0,
        border: String(selection.node.attrs.border || ""),
        effect: String(selection.node.attrs.effect || ""),
        wrap: String(selection.node.attrs.wrap || "inline"),
      }
    },
  })
  const ready = Boolean(editor && picture)
  const correctionsMenu = (close: () => void) => <PictureCorrectionsMenu editor={editor} close={close} />
  const colorMenu = (close: () => void) => <PictureColorMenu editor={editor} close={close} />
  const artisticMenu = (close: () => void) => <PictureArtisticMenu editor={editor} close={close} />
  const transparencyMenu = (close: () => void) => <PictureTransparencyMenu editor={editor} close={close} />
  const borderMenu = (close: () => void) => <PictureBorderMenu editor={editor} close={close} />
  const effectsMenu = (close: () => void) => <ShapeEffectsMenu editor={editor} close={close} />
  const alignMenu = (close: () => void) => <AlignObjectsMenu editor={editor} close={close} />
  const groupMenu = (close: () => void) => <GroupMenu editor={editor} close={close} />
  const positionMenu = (close: () => void) => <PositionMenu editor={editor} close={close} />
  const wrapMenu = (close: () => void) => <WrapTextMenu editor={editor} close={close} />
  const rotateMenu = (close: () => void) => <RotateMenu editor={editor} close={close} />
  const stylesRow = <PictureStyleRow editor={editor} />
  const heightField = (
    <SizeField
      label="Height"
      value={picture && picture.height > 0 ? picture.height / PX_PER_CM_PICTURE : 0}
      disabled={!ready}
      onCommit={(cm) =>
        editor
          ?.chain()
          .focus()
          .updateAttributes("image", { height: Math.round(cm * PX_PER_CM_PICTURE) })
          .run()
      }
    />
  )
  const widthField = (
    <SizeField
      label="Width"
      value={picture && picture.width > 0 ? picture.width / PX_PER_CM_PICTURE : 0}
      disabled={!ready}
      onCommit={(cm) =>
        editor
          ?.chain()
          .focus()
          .updateAttributes("image", { width: Math.round(cm * PX_PER_CM_PICTURE) })
          .run()
      }
    />
  )
  const editAlt = () => {
    void askText({
      title: "Alt Text",
      label: "Describe this object for people who cannot see it:",
      multiline: true,
      value: imageAlt(editor),
    }).then((alt) => {
      if (alt != null && editor) {
        editor.chain().focus().updateAttributes("image", { alt }).run()
      }
    })
  }
  const cropping = useCropMode((state) => state.active)
  const toggleCrop = () => (cropping ? applyCrop() : useCropMode.getState().set(true))
  const resetPicture = () =>
    editor
      ?.chain()
      .focus()
      .updateAttributes("image", { ...PICTURE_RESET, rotate: 0 })
      .run()
  const stylesMenu = (close: () => void) => <PictureStyleGallery editor={editor} close={close} />

  if (ribbonLayout === "single") {
    const commands: LineCommand[] = [
      {
        id: "corrections",
        label: "Corrections",
        icon: <LineCorrectionsIcon />,
        disabled: !ready,
        menu: correctionsMenu,
      },
      {
        id: "picture-styles",
        label: "Picture Styles",
        icon: <LineObjectStylesIcon />,
        priority: 1,
        disabled: !ready,
        menu: stylesMenu,
      },
      { id: "alt-text", label: "Alt Text", icon: <LineAltTextIcon />, disabled: !ready, onClick: editAlt },
    ]
    const arrange: LineCommand[] = [
      {
        id: "wrap-text",
        label: "Wrap Text",
        icon: <CurrentWrapIcon editor={editor} />,
        priority: 2,
        disabled: !ready,
        menu: wrapMenu,
      },
      {
        id: "position",
        label: "Position",
        icon: <CurrentPositionIcon editor={editor} />,
        priority: 1,
        disabled: !ready,
        menu: positionMenu,
      },
      {
        id: "crop",
        label: cropping ? "Apply Crop" : "Crop",
        icon: <LineCropIcon />,
        active: cropping,
        disabled: !ready,
        onClick: toggleCrop,
      },
      ...(cropping
        ? [
            { id: "crop-cancel", label: "Cancel Crop", icon: <LineCropIcon />, onClick: cancelCrop },
            { id: "crop-reset", label: "Reset Crop", icon: <LineCropIcon />, onClick: resetPendingCrop },
          ]
        : []),
    ]
    const more: LineGroup[] = [
      {
        id: "adjust",
        commands: [
          {
            id: "color",
            label: "Color",
            icon: <ContextGlyph label="Color" />,
            disabled: !ready,
            menu: colorMenu,
          },
          {
            id: "artistic-effects",
            label: "Artistic Effects",
            icon: <ContextGlyph label="Artistic Effects" />,
            disabled: !ready,
            menu: artisticMenu,
          },
          {
            id: "transparency",
            label: "Transparency",
            icon: <ContextGlyph label="Transparency" />,
            disabled: !ready,
            menu: transparencyMenu,
          },
          {
            id: "compress-pictures",
            label: "Compress Pictures",
            icon: <ContextGlyph label="Compress Pictures" />,
            disabled: !ready,
            onClick: () => useCompressDialog.getState().show(),
          },
          {
            id: "change-picture",
            label: "Change Picture",
            icon: <ContextGlyph label="Change Picture" />,
            disabled: !ready,
            onClick: () => editor && changePicture(editor),
          },
          {
            id: "reset-picture",
            label: "Reset Picture",
            icon: <ContextGlyph label="Reset Picture" />,
            disabled: !ready,
            onClick: resetPicture,
          },
        ],
      },
      {
        id: "styles",
        commands: [
          {
            id: "picture-border",
            label: "Picture Border",
            icon: <ContextGlyph label="Picture Border" />,
            disabled: !ready,
            menu: borderMenu,
          },
          {
            id: "picture-effects",
            label: "Picture Effects",
            icon: <ContextGlyph label="Picture Effects" />,
            disabled: !ready,
            menu: effectsMenu,
          },
        ],
      },
      {
        id: "arrange",
        commands: [
          {
            id: "bring-forward",
            label: "Bring Forward",
            icon: <ContextGlyph label="Bring Forward" />,
            disabled: !ready,
            onClick: () => editor?.chain().focus().setObjectLayer("forward").run(),
          },
          {
            id: "send-backward",
            label: "Send Backward",
            icon: <ContextGlyph label="Send Backward" />,
            disabled: !ready,
            onClick: () => editor?.chain().focus().setObjectLayer("backward").run(),
          },
          {
            id: "selection-pane",
            label: "Selection Pane",
            icon: <ContextGlyph label="Selection Pane" />,
            active: selectionPane,
            onClick: () => toggleSelectionPane(),
          },
          { id: "align", label: "Align", icon: <ContextGlyph label="Align" />, disabled: !ready, menu: alignMenu },
          { id: "group", label: "Group", icon: <ContextGlyph label="Group" />, disabled: !editor, menu: groupMenu },
          { id: "rotate", label: "Rotate", icon: <ContextGlyph label="Rotate" />, disabled: !ready, menu: rotateMenu },
        ],
      },
      {
        id: "size",
        commands: [
          {
            id: "size",
            label: "Size",
            icon: <ContextGlyph label="Size" />,
            field: (
              <div className="flex flex-col gap-1">
                {heightField}
                {widthField}
              </div>
            ),
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Picture Format"
        groups={[
          { id: "picture", commands: labelled(commands) },
          { id: "arrange", commands: labelled(arrange) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Picture Format" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Adjust">
        <RibbonCommand size="large" label="Corrections" disabled={!ready} menu={correctionsMenu}>
          <ContextGlyph label="Corrections" />
        </RibbonCommand>
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Color" disabled={!ready} menu={colorMenu}>
            <ContextGlyph label="Color" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Artistic Effects" disabled={!ready} menu={artisticMenu}>
            <ContextGlyph label="Artistic Effects" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Transparency" disabled={!ready} menu={transparencyMenu}>
            <ContextGlyph label="Transparency" />
          </RibbonCommand>
        </div>
        <div className="flex flex-col justify-center">
          <RibbonCommand
            size="small"
            label="Compress Pictures"
            disabled={!ready}
            onClick={() => useCompressDialog.getState().show()}
          >
            <ContextGlyph label="Compress Pictures" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Change Picture"
            disabled={!ready}
            onClick={() => editor && changePicture(editor)}
          >
            <ContextGlyph label="Change Picture" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Reset Picture" disabled={!ready} onClick={resetPicture}>
            <ContextGlyph label="Reset Picture" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Picture Styles">
        {stylesRow}
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Picture Border" disabled={!ready} menu={borderMenu}>
            <ContextGlyph label="Picture Border" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Picture Effects" disabled={!ready} menu={effectsMenu}>
            <ContextGlyph label="Picture Effects" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Accessibility">
        <RibbonCommand size="large" label="Alt Text" disabled={!ready} onClick={editAlt}>
          <ContextGlyph label="Alt Text" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Arrange">
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Position" disabled={!ready} menu={positionMenu}>
            <CurrentPositionIcon editor={editor} />
          </RibbonCommand>
          <RibbonCommand size="small" label="Wrap Text" disabled={!ready} menu={wrapMenu}>
            <CurrentWrapIcon editor={editor} />
          </RibbonCommand>
        </div>
        <div className="flex flex-col justify-center">
          <RibbonCommand
            size="small"
            label="Bring Forward"
            disabled={!ready}
            onClick={() => editor?.chain().focus().setObjectLayer("forward").run()}
          >
            <ContextGlyph label="Bring Forward" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Send Backward"
            disabled={!ready}
            onClick={() => editor?.chain().focus().setObjectLayer("backward").run()}
          >
            <ContextGlyph label="Send Backward" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Selection Pane"
            active={selectionPane}
            onClick={() => toggleSelectionPane()}
          >
            <ContextGlyph label="Selection Pane" />
          </RibbonCommand>
        </div>
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Align" disabled={!ready} menu={alignMenu}>
            <ContextGlyph label="Align" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Group" disabled={!editor} menu={groupMenu}>
            <ContextGlyph label="Group" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Rotate" disabled={!ready} menu={rotateMenu}>
            <ContextGlyph label="Rotate" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Size">
        <RibbonCommand
          size="large"
          label={cropping ? "Apply Crop" : "Crop"}
          disabled={!ready}
          active={cropping}
          onClick={toggleCrop}
        >
          <ContextGlyph label="Crop" />
        </RibbonCommand>
        {cropping ? (
          <div className="flex flex-col justify-center gap-1 px-1">
            <RibbonCommand size="small" label="Cancel Crop" onClick={cancelCrop}>
              <ContextGlyph label="Crop" />
            </RibbonCommand>
            <RibbonCommand size="small" label="Reset Crop" onClick={resetPendingCrop}>
              <ContextGlyph label="Crop" />
            </RibbonCommand>
          </div>
        ) : null}
        <div className="flex flex-col justify-center gap-1 px-1">
          {heightField}
          {widthField}
        </div>
      </RibbonGroup>
    </div>
  )
}

function changePicture(editor: Editor) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      editor
        .chain()
        .focus()
        .updateAttributes("image", { src: String(reader.result || ""), alt: file.name })
        .run()
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

const VIEWS_PER_ROW = 6
const MODEL_SCENES = ["cube", "cylinder", "cone", "sphere", "torus"]
const PX_PER_CM = 96 / 2.54

export function ModelTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const [library, setLibrary] = useState(false)
  const [viewPage, setViewPage] = useState(0)
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const model = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection
      if (!(selection instanceof NodeSelection)) {
        return null
      }
      const node = selection.node
      if (node.type.name === "threeDModel") {
        return {
          kind: "threeD" as const,
          spin: false,
          src: String(node.attrs.src || ""),
          snapshot: String(node.attrs.snapshot || ""),
          variant: String(node.attrs.preset || "cube"),
          width: Number(node.attrs.width) || 220,
          height: Number(node.attrs.height) || 160,
          yaw: Number(node.attrs.yaw) || 0,
          pitch: Number(node.attrs.pitch) || 0,
          lighting: String(node.attrs.lighting || ""),
        }
      }
      if (node.type.name === "figure" && node.attrs.kind === "model") {
        return {
          kind: "figure" as const,
          spin: Boolean(node.attrs.spin),
          src: String(node.attrs.src || ""),
          snapshot: "",
          variant: String(node.attrs.variant || "cube"),
          width: Number(node.attrs.width) || 140,
          height: Number(node.attrs.height) || 100,
          yaw: 0,
          pitch: 0,
          lighting: "",
        }
      }
      return null
    },
  })
  const ready = Boolean(editor && model)
  const nodeName = model?.kind === "threeD" ? "threeDModel" : "figure"

  function updateModel(attrs: Record<string, unknown>) {
    editor?.chain().focus().updateAttributes(nodeName, attrs).run()
  }

  const lightingMenu = (close: () => void) =>
    model?.kind === "threeD" ? (
      <div className="flex w-44 flex-col">
        {MODEL_LIGHTINGS.map((lighting) => (
          <MenuButton
            key={lighting.id}
            selected={model.lighting === lighting.id}
            onClick={() => {
              updateModel({ lighting: lighting.id })
              close()
            }}
          >
            {lighting.label}
          </MenuButton>
        ))}
        <div className="my-1 h-px bg-neutral-200" role="separator" />
        <MenuButton
          onClick={() => {
            close()
            openModelFormat()
          }}
        >
          Lighting Options…
        </MenuButton>
      </div>
    ) : (
      <>
        <MenuButton
          onClick={() => {
            updateModel({ rotate: 0 })
            close()
          }}
        >
          Soft
        </MenuButton>
        <MenuButton
          onClick={() => {
            updateModel({ rotate: 45 })
            close()
          }}
        >
          Dramatic
        </MenuButton>
      </>
    )
  const presetsMenu = (close: () => void) => (
    <>
      {MODEL_SCENES.map((scene) => (
        <MenuButton
          key={scene}
          onClick={() => {
            if (model?.kind === "threeD") {
              updateModel({ preset: scene, src: "" })
            } else {
              updateModel({ variant: scene, src: "", kind: "model" })
            }
            close()
          }}
        >
          {scene}
        </MenuButton>
      ))}
    </>
  )
  const wrapMenu = (close: () => void) => <WrapTextMenu editor={editor} close={close} />
  const positionMenu = (close: () => void) => <PositionMenu editor={editor} close={close} />
  const alignMenu = (close: () => void) => (
    <>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().setObjectAnchor("top-left").run()
          close()
        }}
      >
        Align Left
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().setObjectAnchor("top-center").run()
          close()
        }}
      >
        Align Center
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().setObjectAnchor("top-right").run()
          close()
        }}
      >
        Align Right
      </MenuButton>
    </>
  )
  const viewsRow = (
    <div className="flex items-center">
      <div className="flex items-center gap-1 px-1">
        <ModelViewTiles editor={editor} start={viewPage * VIEWS_PER_ROW} count={VIEWS_PER_ROW} />
      </div>
      <GalleryNav
        label="3D Model Views"
        canUp={viewPage > 0}
        canDown={(viewPage + 1) * VIEWS_PER_ROW < MODEL_VIEWS.length}
        onUp={() => setViewPage((page) => page - 1)}
        onDown={() => setViewPage((page) => page + 1)}
        more={(close) => <ModelViewsMenu editor={editor} close={close} />}
      />
    </div>
  )
  const heightField = (
    <SizeField
      label="Height"
      value={model ? model.height / PX_PER_CM : 0}
      disabled={!model}
      onCommit={(cm) => updateModel({ height: Math.round(cm * PX_PER_CM) })}
    />
  )
  const widthField = (
    <SizeField
      label="Width"
      value={model ? model.width / PX_PER_CM : 0}
      disabled={!model}
      onCommit={(cm) => updateModel({ width: Math.round(cm * PX_PER_CM) })}
    />
  )
  const frontView = () => {
    const found = model?.kind === "threeD" && editor ? selectedObject(editor) : null
    const source = found ? viewSourceFor(editor?.view.nodeDOM(found.pos) as Element | null) : null
    const pose = viewPose(MODEL_VIEWS[0], source?.camera())
    updateModel(model?.kind === "threeD" ? pose : { rotate: 0 })
  }
  const viewsMenu = (close: () => void) => <ModelViewsMenu editor={editor} close={close} />
  const scenesMenu = (close: () => void) => <ModelScenesMenu editor={editor} close={close} />
  const modelLibrary = library && editor ? <ModelLibrary editor={editor} onClose={() => setLibrary(false)} /> : null
  const flat = !ready || model?.kind === "threeD"

  if (ribbonLayout === "single") {
    const commands: LineCommand[] = [
      {
        id: "models",
        label: "3D Models",
        icon: <LineCubeIcon />,
        priority: 1,
        disabled: !editor,
        onClick: () => setLibrary(true),
      },
      {
        id: "scenes",
        label: "Scenes",
        icon: <ContextGlyph label="Scenes" />,
        disabled: model?.kind !== "threeD",
        menu: scenesMenu,
      },
      {
        id: "pause",
        label: "Pause",
        icon: <ContextGlyph label="Pause" />,
        disabled: model?.kind !== "threeD",
        onClick: () => updateModel({ scene: "" }),
      },
      { id: "front", label: "Front", icon: <LineCameraViewIcon />, disabled: !ready, onClick: frontView },
      {
        id: "format",
        label: "Format 3D Model",
        icon: <LineObjectStylesIcon />,
        disabled: model?.kind !== "threeD",
        onClick: () => openModelFormat(),
      },
      {
        id: "views",
        label: "3D Model Views",
        icon: <ContextGlyph label="3D Model Views" />,
        priority: 1,
        disabled: !ready,
        menu: viewsMenu,
      },
    ]
    const arrange: LineCommand[] = [
      {
        id: "wrap-text",
        label: "Wrap Text",
        icon: <CurrentWrapIcon editor={editor} />,
        disabled: !ready,
        menu: wrapMenu,
      },
      {
        id: "position",
        label: "Position",
        icon: <CurrentPositionIcon editor={editor} />,
        disabled: !ready,
        menu: positionMenu,
      },
    ]
    const more: LineGroup[] = [
      {
        id: "camera",
        commands: [
          {
            id: "lighting",
            label: "Lighting",
            icon: <ContextGlyph label="Lighting" />,
            disabled: !ready,
            menu: lightingMenu,
          },
          {
            id: "presets",
            label: "Presets",
            icon: <ContextGlyph label="cube" />,
            disabled: !ready,
            menu: presetsMenu,
          },
          {
            id: "reset",
            label: "Reset 3D Model",
            icon: <ContextGlyph label="Reset 3D Model" />,
            disabled: !ready,
            onClick: () =>
              updateModel(model?.kind === "threeD" ? { yaw: 0.45, pitch: 0.3, roll: 0 } : { spin: false, rotate: 0 }),
          },
          {
            id: "alt-text",
            label: "Alt Text",
            icon: <ContextGlyph label="Alt Text" />,
            disabled: !ready,
            onClick: () => editor && promptAlt(editor),
          },
        ],
      },
      {
        id: "arrange",
        commands: [
          {
            id: "bring-forward",
            label: "Bring Forward",
            icon: <ContextGlyph label="Bring Forward" />,
            disabled: flat,
            onClick: () => editor?.chain().focus().setObjectLayer("forward").run(),
          },
          {
            id: "send-backward",
            label: "Send Backward",
            icon: <ContextGlyph label="Send Backward" />,
            disabled: flat,
            onClick: () => editor?.chain().focus().setObjectLayer("backward").run(),
          },
          {
            id: "selection-pane",
            label: "Selection Pane",
            icon: <ContextGlyph label="Selection Pane" />,
            active: selectionPane,
            onClick: () => toggleSelectionPane(),
          },
          { id: "align", label: "Align", icon: <ContextGlyph label="Align" />, disabled: flat, menu: alignMenu },
        ],
      },
      {
        id: "size",
        commands: [
          {
            id: "pan-zoom",
            label: "Pan & Zoom",
            icon: <ContextGlyph label="Pan and Zoom" />,
            disabled: !ready,
            onClick: () => editor && resizeModel(editor, 1.25),
          },
          {
            id: "size",
            label: "Size",
            icon: <ContextGlyph label="Size" />,
            field: (
              <div className="flex flex-col gap-1">
                {heightField}
                {widthField}
              </div>
            ),
          },
        ],
      },
    ]
    return (
      <>
        <SingleLineBar
          label="3D Model"
          groups={[
            { id: "model", commands: labelled(commands) },
            { id: "arrange", commands: labelled(arrange) },
          ]}
          more={more}
        />
        {modelLibrary}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="3D Model" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Play 3D">
        <RibbonCommand
          size="large"
          label="Pause"
          disabled={model?.kind !== "threeD"}
          onClick={() => updateModel({ scene: "" })}
        >
          <ContextGlyph label="Pause" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Scenes" disabled={model?.kind !== "threeD"} menu={scenesMenu}>
          <ContextGlyph label="Scenes" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Camera">
        <RibbonCommand size="large" label="Front" disabled={!ready} onClick={frontView}>
          <ContextGlyph label="3D Model Views" />
        </RibbonCommand>
        <RibbonCommand size="small" label="Lighting" disabled={!ready} menu={lightingMenu}>
          <ContextGlyph label="Lighting" />
        </RibbonCommand>
        <RibbonCommand size="small" label="Presets" disabled={!ready} menu={presetsMenu}>
          <ContextGlyph label="cube" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Adjust">
        <RibbonCommand size="large" label="3D Models" disabled={!editor} onClick={() => setLibrary(true)}>
          <ContextGlyph label="3D Models" />
        </RibbonCommand>
        <RibbonCommand
          size="large"
          label="Format 3D Model"
          disabled={model?.kind !== "threeD"}
          onClick={() => openModelFormat()}
        >
          <ContextGlyph label="cube" />
        </RibbonCommand>
        <RibbonCommand
          size="small"
          label="Reset 3D Model"
          disabled={!ready}
          onClick={() =>
            updateModel(model?.kind === "threeD" ? { yaw: 0.45, pitch: 0.3, roll: 0 } : { spin: false, rotate: 0 })
          }
        >
          <ContextGlyph label="Reset 3D Model" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="3D Model Views">{viewsRow}</RibbonGroup>
      <RibbonGroup label="Accessibility">
        <RibbonCommand size="small" label="Alt Text" disabled={!ready} onClick={() => editor && promptAlt(editor)}>
          <ContextGlyph label="Alt Text" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Arrange">
        <RibbonCommand size="small" label="Position" disabled={!ready} menu={positionMenu}>
          <CurrentPositionIcon editor={editor} />
        </RibbonCommand>
        <RibbonCommand size="small" label="Wrap Text" disabled={!ready} menu={wrapMenu}>
          <CurrentWrapIcon editor={editor} />
        </RibbonCommand>
        <RibbonCommand
          size="small"
          label="Bring Forward"
          disabled={!ready}
          onClick={() => editor?.chain().focus().setObjectLayer("forward").run()}
        >
          <ContextGlyph label="Bring Forward" />
        </RibbonCommand>
        <RibbonCommand
          size="small"
          label="Send Backward"
          disabled={!ready}
          onClick={() => editor?.chain().focus().setObjectLayer("backward").run()}
        >
          <ContextGlyph label="Send Backward" />
        </RibbonCommand>
        <RibbonCommand size="small" label="Selection Pane" active={selectionPane} onClick={() => toggleSelectionPane()}>
          <ContextGlyph label="Selection Pane" />
        </RibbonCommand>
        <RibbonCommand size="small" label="Align" disabled={!ready} menu={alignMenu}>
          <ContextGlyph label="Align" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Size">
        <RibbonCommand
          size="small"
          label="Pan & Zoom"
          disabled={!ready}
          onClick={() => editor && resizeModel(editor, 1.25)}
        >
          <ContextGlyph label="Pan and Zoom" />
        </RibbonCommand>
        <div className="flex flex-col justify-center gap-1 px-1">
          {heightField}
          {widthField}
        </div>
      </RibbonGroup>
      {modelLibrary}
    </div>
  )
}

function imageAlt(editor: Editor | null) {
  if (!editor || !(editor.state.selection instanceof NodeSelection)) {
    return ""
  }
  return String(editor.state.selection.node.attrs.alt || "")
}

function resizeModel(editor: Editor, factor: number) {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection)) {
    return
  }
  const name = selection.node.type.name
  if (name !== "figure" && name !== "threeDModel") {
    return
  }
  const width = Math.round((Number(selection.node.attrs.width) || (name === "threeDModel" ? 220 : 140)) * factor)
  const height = Math.round((Number(selection.node.attrs.height) || (name === "threeDModel" ? 160 : 100)) * factor)
  editor.chain().focus().updateAttributes(name, { width, height }).run()
}

function promptAlt(editor: Editor) {
  const selection = editor.state.selection
  if (selection instanceof NodeSelection && selection.node.type.name === "threeDModel") {
    void askText({
      title: "Alt Text",
      label: "Describe this object for people who cannot see it:",
      multiline: true,
      value: String(selection.node.attrs.alt || ""),
    }).then((alt) => {
      if (alt != null) {
        editor.chain().focus().updateAttributes("threeDModel", { alt }).run()
      }
    })
    return
  }
  const target = shapeNode(editor)
  if (!target || target.name !== "figure") {
    return
  }
  void askText({
    title: "Alt Text",
    label: "Describe this object for people who cannot see it:",
    multiline: true,
    value: String(target.attrs.alt || ""),
  }).then((alt) => {
    if (alt != null) {
      editor.chain().focus().updateAttributes("figure", { alt }).run()
    }
  })
}

/** Moves the caret to the header or footer of the page being edited. */
function goToChrome(part: "header" | "footer") {
  const view = useViewStore.getState()
  view.editChrome(part, view.chromeTarget.page)
}

const LINK_TO_PREVIOUS_NOTE = "This document has one section, so there is no previous header to link to."

/** Word's Header & Footer tab, shown while the header and footer are being edited. */
export function HeaderFooterTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const setEditingChrome = useViewStore((state) => state.setEditingChrome)
  const differentFirstPage = useDocumentStore((state) => state.differentFirstPage)
  const setDifferentFirstPage = useDocumentStore((state) => state.setDifferentFirstPage)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const { headerMenu, footerMenu, pageNumberMenu } = useChromeMenus()
  const dateMenu = (close: () => void) => <DateMenu editor={editor} close={close} />
  const chromeTarget = useViewStore((state) => state.chromeTarget)
  const editChrome = useViewStore((state) => state.editChrome)
  // The page count is the body's (the editor above is the header's while one is open).
  const body = useBodyEditor()
  const pages =
    useEditorState({ editor: body, selector: ({ editor: current }) => current?.storage.pagination?.pageCount ?? 1 }) ??
    1
  // Previous and Next step between the first-page, even and odd headers (one section, so nothing beyond those).
  const stepTo = (step: 1 | -1) =>
    chromeStep(chromeTarget.page, pages, differentFirstPage, setup.differentOddEven, step)
  const previous = stepTo(-1)
  const next = stepTo(1)
  const go = (page: number | null) => {
    if (page !== null) {
      editChrome(chromeTarget.part, page)
    }
  }
  const edge = (label: string, key: "headerFromEdge" | "footerFromEdge") => (
    <RibbonHover label={label}>
      <label className="layout-spin">
        <span className="w-[86px]">{label}:</span>
        <input
          type="number"
          min={0}
          step={0.1}
          aria-label={`${label} in centimeters`}
          value={Math.round(setup[key]) / 10}
          onChange={(event) => setPageSetup({ ...setup, [key]: Math.max(0, Number(event.target.value) || 0) * 10 })}
        />
        <span>cm</span>
      </label>
    </RibbonHover>
  )

  const closeChrome = () => {
    setEditingChrome(false)
    editor?.commands.focus()
  }

  if (ribbonLayout === "single") {
    const chrome: LineCommand[] = [
      { id: "header", label: "Header", icon: <LineChromeIcon edge="header" />, priority: 1, menu: headerMenu },
      { id: "footer", label: "Footer", icon: <LineChromeIcon edge="footer" />, priority: 1, menu: footerMenu },
      { id: "page-number", label: "Page Number", icon: <LinePageNumberIcon />, menu: pageNumberMenu },
      { id: "date-time", label: "Date & Time", icon: <DateIcon />, menu: dateMenu },
    ]
    const navigation: LineCommand[] = [
      {
        id: "go-header",
        label: "Go to Header",
        icon: <LineGoToChromeIcon edge="header" />,
        onClick: () => goToChrome("header"),
      },
      {
        id: "go-footer",
        label: "Go to Footer",
        icon: <LineGoToChromeIcon edge="footer" />,
        onClick: () => goToChrome("footer"),
      },
      {
        id: "previous",
        label: "Previous",
        icon: <ContextGlyph label="Previous" />,
        disabled: previous === null,
        onClick: () => go(previous),
      },
      {
        id: "next",
        label: "Next",
        icon: <ContextGlyph label="Next" />,
        disabled: next === null,
        onClick: () => go(next),
      },
      {
        id: "link-previous",
        label: "Link to Previous",
        description: LINK_TO_PREVIOUS_NOTE,
        icon: <ContextGlyph label="Link to Previous" />,
        disabled: true,
      },
      {
        id: "first-page",
        label: "Different First Page",
        icon: <LineFirstPageIcon />,
        active: differentFirstPage,
        onClick: () => setDifferentFirstPage(!differentFirstPage),
      },
      {
        id: "odd-even",
        label: "Different Odd & Even Pages",
        icon: <LineFirstPageIcon />,
        active: setup.differentOddEven,
        onClick: () => setPageSetup({ ...setup, differentOddEven: !setup.differentOddEven }),
      },
    ]
    const close: LineCommand[] = [
      { id: "close", label: "Close Header and Footer", icon: <LineCloseIcon />, priority: 3, onClick: closeChrome },
    ]
    const more: LineGroup[] = [
      {
        id: "position",
        commands: [
          {
            id: "position",
            label: "Position",
            field: (
              <div className="flex flex-col gap-1.5">
                {edge("Header from Top", "headerFromEdge")}
                {edge("Footer from Bottom", "footerFromEdge")}
              </div>
            ),
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Header & Footer"
        groups={[
          { id: "chrome", commands: labelled(chrome) },
          { id: "navigation", commands: labelled(navigation) },
          { id: "close", commands: labelled(close) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Header & Footer" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Header & Footer">
        <HeaderFooterCommands />
      </RibbonGroup>
      <RibbonGroup label="Insert">
        <RibbonCommand label="Date & Time" menu={dateMenu}>
          <DateIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Navigation">
        <RibbonCommand label="Go to Header" onClick={() => goToChrome("header")}>
          <ChromeMark edge="top" />
        </RibbonCommand>
        <RibbonCommand label="Go to Footer" onClick={() => goToChrome("footer")}>
          <ChromeMark edge="bottom" />
        </RibbonCommand>
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Previous" disabled={previous === null} onClick={() => go(previous)}>
            <ContextGlyph label="Previous" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Next" disabled={next === null} onClick={() => go(next)}>
            <ContextGlyph label="Next" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Link to Previous" description={LINK_TO_PREVIOUS_NOTE} disabled>
            <ContextGlyph label="Link to Previous" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Options" className="shrink-0">
        <div className="ribbon-checks">
          <RibbonHover label="Different First Page">
            <label className="ribbon-check">
              <input
                type="checkbox"
                checked={differentFirstPage}
                onChange={(event) => setDifferentFirstPage(event.target.checked)}
              />
              Different First Page
            </label>
          </RibbonHover>
          <RibbonHover label="Different Odd & Even Pages">
            <label className="ribbon-check">
              <input
                type="checkbox"
                checked={setup.differentOddEven}
                onChange={(event) => setPageSetup({ ...setup, differentOddEven: event.target.checked })}
              />
              Different Odd &amp; Even Pages
            </label>
          </RibbonHover>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Position" className="shrink-0">
        <div className="flex flex-col justify-center gap-1.5 px-1">
          {edge("Header from Top", "headerFromEdge")}
          {edge("Footer from Bottom", "footerFromEdge")}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Close" className="ribbon-wide-label">
        <RibbonCommand label="Close Header and Footer" onClick={closeChrome}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
            <rect x="5" y="5" width="18" height="18" rx="2" fill="#c42b1c" />
            <path d="M10 10l8 8M18 10l-8 8" stroke="#fff" strokeWidth="2" />
          </svg>
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}

function ChromeMark({ edge }: { edge: "top" | "bottom" }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="6" y="4" width="16" height="20" fill="#fff" stroke="#5c5c5c" />
      <path d={edge === "top" ? "M8 8h12" : "M8 20h12"} stroke="#0f6cbd" strokeWidth="1.6" />
      <path d={edge === "top" ? "M14 18v-6m-3 3l3-3 3 3" : "M14 10v6m-3-3l3 3 3-3"} stroke="#5c5c5c" fill="none" />
    </svg>
  )
}
