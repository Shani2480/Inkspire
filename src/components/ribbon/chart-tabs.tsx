import {
  AlignObjectsMenu,
  BringForwardMenu,
  GroupMenu,
  RotateObjectMenu,
  SendBackwardMenu,
} from "@/components/arrange-menus"
import {
  AddChartElementMenu,
  ChartColorsMenu,
  ChartStylesGallery,
  ChartStylesMenu,
  QuickLayoutMenu,
  changeChart,
  currentPart,
  formatChartPart,
  selectedChart,
  useChartPart,
  useChartTypeDialog,
  useSelectDataDialog,
} from "@/components/chart-menus"
import { ChartSheetDialog } from "@/components/chart-sheet-dialog"
import { useObjectPreview } from "@/components/object-preview-hook"
import { CurrentPositionIcon, CurrentWrapIcon } from "@/components/object-layout-icons"
import { PositionMenu } from "@/components/position-menu"
import { ContextGlyph } from "@/components/ribbon/context-icons"
import {
  LineAlignObjectsIcon,
  LineChartElementIcon,
  LineChartStylesIcon,
  LineChartTypeIcon,
  LineGroupIcon,
  LineLayerIcon,
  LineQuickLayoutIcon,
  LineRotateIcon,
  LineSelectIcon,
  LineShapeFillIcon,
  LineShapeOutlineIcon,
  LineSwitchIcon,
} from "@/components/ribbon/line-icons"
import { RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { GalleryNav, SizeSpinner, SmallSplit } from "@/components/ribbon/shape-format-tab"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { Palette } from "@/components/shape-menus"
import { WrapTextMenu } from "@/components/wrap-menu"
import { useLayoutDialog } from "@/document/object-layout"
import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  CHART_STYLES,
  chartParts,
  isTextPart,
  serializeChartSpec,
  switchRowColumn,
  variantOf,
  type ChartSpec,
} from "@/editor/chart-spec"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useState, type ReactNode } from "react"

const PX_PER_CM = 96 / 2.54
const STYLES_PER_ROW = 6

type MenuProps = { editor: Editor | null; close: () => void }

function menu(editor: Editor | null, Menu: (props: MenuProps) => ReactNode) {
  return (close: () => void) => <Menu editor={editor} close={close} />
}

/** The selected chart for a tab: its spec, size and the part picked in it. */
function useChart(editor: Editor | null) {
  const part = useChartPart((state) => state.part)
  const pos = useChartPart((state) => state.pos)
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
  return { chart, part: chart && pos === chart.pos ? part : "chartArea" }
}

/** The style gallery's row in the ribbon: six styles, scrolled with the arrows, and all of them from More. */
function StylesRow({ editor, spec }: { editor: Editor | null; spec: ChartSpec | undefined }) {
  const [row, setRow] = useState(() => Math.floor(((spec?.style ?? 1) - 1) / STYLES_PER_ROW))
  const rows = Math.ceil(CHART_STYLES.length / STYLES_PER_ROW)
  return (
    <div className={`ribbon-styles-gallery ribbon-chart-styles${spec ? "" : " is-disabled"}`}>
      <ChartStylesGallery
        editor={editor}
        start={row * STYLES_PER_ROW}
        count={STYLES_PER_ROW}
        size={{ width: 56, height: 40 }}
      />
      <GalleryNav
        label="chart styles"
        canUp={row > 0}
        canDown={row < rows - 1}
        onUp={() => setRow(row - 1)}
        onDown={() => setRow(row + 1)}
        more={(close) => <ChartStylesMenu editor={editor} close={close} />}
      />
    </div>
  )
}

/** Word's Chart Design tab (20.8). */
export function ChartDesignTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const [dataOpen, setDataOpen] = useState(false)
  const { chart } = useChart(editor)
  const ready = Boolean(editor && chart)
  const switchData = () => changeChart(editor, switchRowColumn)
  const selectData = () => useSelectDataDialog.getState().show()
  const changeType = () => useChartTypeDialog.getState().show("change")
  // Refresh draws the chart again from its data, as Word does after the sheet changed.
  const refresh = () => changeChart(editor, (spec) => ({ ...spec }))
  const dataSheet = dataOpen && editor ? <ChartSheetDialog editor={editor} onClose={() => setDataOpen(false)} /> : null

  if (ribbonLayout === "single") {
    const layouts: LineCommand[] = [
      {
        id: "add-element",
        label: "Add Chart Element",
        icon: <LineChartElementIcon />,
        priority: 2,
        disabled: !ready,
        menu: menu(editor, AddChartElementMenu),
      },
      {
        id: "quick-layout",
        label: "Quick Layout",
        icon: <LineQuickLayoutIcon />,
        disabled: !ready,
        menu: menu(editor, QuickLayoutMenu),
      },
      {
        id: "chart-styles",
        label: "Chart Styles",
        icon: <LineChartStylesIcon />,
        priority: 1,
        disabled: !ready,
        menu: menu(editor, ChartStylesMenu),
      },
    ]
    const data: LineCommand[] = [
      { id: "switch", label: "Switch Row/Column", icon: <LineSwitchIcon />, disabled: !ready, onClick: switchData },
      {
        id: "chart-type",
        label: "Change Chart Type",
        icon: <LineChartTypeIcon />,
        priority: 1,
        disabled: !ready,
        onClick: changeType,
      },
    ]
    const more: LineGroup[] = [
      {
        id: "styles",
        commands: [
          {
            id: "change-colors",
            label: "Change Colors",
            icon: <ContextGlyph label="Change Colors" />,
            disabled: !ready,
            menu: menu(editor, ChartColorsMenu),
          },
        ],
      },
      {
        id: "data",
        commands: [
          {
            id: "select-data",
            label: "Select Data",
            icon: <ContextGlyph label="Select Data" />,
            disabled: !ready,
            onClick: selectData,
          },
          {
            id: "edit-data",
            label: "Edit Data",
            icon: <ContextGlyph label="Edit Data" />,
            disabled: !ready,
            onClick: () => setDataOpen(true),
          },
          {
            id: "refresh-data",
            label: "Refresh Data",
            icon: <ContextGlyph label="Refresh Data" />,
            disabled: !ready,
            onClick: refresh,
          },
        ],
      },
    ]
    return (
      <>
        <SingleLineBar
          label="Chart Design"
          groups={[
            { id: "layouts", commands: layouts.map((command) => ({ ...command, showLabel: true })) },
            { id: "data", commands: data.map((command) => ({ ...command, showLabel: true })) },
          ]}
          more={more}
        />
        {dataSheet}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Chart Design" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Chart Layouts" name="chart-layouts">
        <RibbonCommand
          size="large"
          label="Add Chart Element"
          disabled={!ready}
          menu={menu(editor, AddChartElementMenu)}
        >
          <ContextGlyph label="Add Chart Element" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Quick Layout" disabled={!ready} menu={menu(editor, QuickLayoutMenu)}>
          <ContextGlyph label="Quick Layout" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Chart Styles" name="chart-styles">
        <RibbonCommand size="large" label="Change Colors" disabled={!ready} menu={menu(editor, ChartColorsMenu)}>
          <ContextGlyph label="Change Colors" />
        </RibbonCommand>
        <StylesRow editor={editor} spec={chart?.spec} />
      </RibbonGroup>
      <RibbonGroup label="Data" name="chart-data">
        <RibbonCommand size="large" label="Switch Row/Column" disabled={!ready} onClick={switchData}>
          <ContextGlyph label="Switch Row/Column" />
        </RibbonCommand>
        <RibbonCommand size="large" label="Select Data" disabled={!ready} onClick={selectData}>
          <ContextGlyph label="Select Data" />
        </RibbonCommand>
        <div className="flex flex-col justify-center">
          <RibbonCommand size="small" label="Edit Data" disabled={!ready} onClick={() => setDataOpen(true)}>
            <ContextGlyph label="Edit Data" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Refresh Data" disabled={!ready} onClick={refresh}>
            <ContextGlyph label="Refresh Data" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Type" name="chart-type">
        <RibbonCommand label="Change Chart Type" disabled={!ready} onClick={changeType}>
          <ContextGlyph label="Change Chart Type" />
        </RibbonCommand>
      </RibbonGroup>
      {dataSheet}
    </div>
  )
}

/** A colour for the picked part's fill, outline or text, previewed on hover. */
function PartColorMenu({ editor, close, field }: MenuProps & { field: "fill" | "line" | "color" }) {
  const preview = useObjectPreview(editor)
  const chart = selectedChart(editor)
  if (!chart) {
    return null
  }
  const part = currentPart(editor)
  const apply = (color: string) => {
    const spec = chart.spec
    const next: ChartSpec = { ...spec, format: { ...spec.format, [part]: { ...spec.format[part], [field]: color } } }
    return { chart: serializeChartSpec(next), variant: variantOf(next) }
  }
  return (
    <div onMouseLeave={() => preview?.restore()}>
      <Palette preview={preview} apply={apply} close={close} current={chart.spec.format[part]?.[field]} />
    </div>
  )
}

/** Word's chart Format tab (20.8): the current selection, its fill, outline and text, Arrange and Size. */
export function ChartFormatTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const { chart, part } = useChart(editor)
  const ready = Boolean(editor && chart)
  const text = isTextPart(part)
  const fillMenu = (close: () => void) => <PartColorMenu editor={editor} close={close} field="fill" />
  const outlineMenu = (close: () => void) => <PartColorMenu editor={editor} close={close} field="line" />
  const textMenu = (close: () => void) => <PartColorMenu editor={editor} close={close} field="color" />
  const reset = () =>
    changeChart(editor, (spec) => {
      const format = { ...spec.format }
      delete format[part]
      return { ...spec, format }
    })
  const formatSelection = () => formatChartPart(editor, part)
  const resize = (axis: "width" | "height", cm: number) => {
    if (cm > 0) {
      editor
        ?.chain()
        .focus()
        .updateObject({ [axis]: Math.round(cm * PX_PER_CM) })
        .run()
    }
  }
  const forward = () => editor?.chain().focus().setObjectLayer("forward").run()
  const backward = () => editor?.chain().focus().setObjectLayer("backward").run()
  const fillColor = chart?.spec.format[part]?.fill || "#4472c4"
  const lineColor = chart?.spec.format[part]?.line || "#595959"
  const parts = chart ? chartParts(chart.spec) : []
  const selection = (
    <select
      className="ribbon-select chart-part-select"
      aria-label="Chart Elements"
      disabled={!ready}
      value={part}
      onChange={(event) => chart && useChartPart.getState().select(chart.pos, event.target.value)}
    >
      {parts.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  )

  if (ribbonLayout === "single") {
    const commands: LineCommand[] = [
      {
        id: "format-selection",
        label: "Format Selection",
        icon: <ContextGlyph label="Format Selection" />,
        disabled: !ready,
        onClick: formatSelection,
      },
      {
        id: "shape-fill",
        label: "Shape Fill",
        icon: <LineShapeFillIcon color={fillColor} />,
        priority: 1,
        disabled: !ready,
        menu: fillMenu,
      },
      {
        id: "shape-outline",
        label: "Shape Outline",
        icon: <LineShapeOutlineIcon color={lineColor} />,
        priority: 1,
        disabled: !ready,
        menu: outlineMenu,
      },
    ]
    const arrange: LineCommand[] = [
      {
        id: "bring-forward",
        label: "Bring Forward",
        icon: <LineLayerIcon direction="forward" />,
        disabled: !ready,
        onClick: forward,
      },
      {
        id: "send-backward",
        label: "Send Backward",
        icon: <LineLayerIcon direction="backward" />,
        disabled: !ready,
        onClick: backward,
      },
      {
        id: "align",
        label: "Align",
        icon: <LineAlignObjectsIcon />,
        disabled: !ready,
        menu: menu(editor, AlignObjectsMenu),
      },
      {
        id: "rotate",
        label: "Rotate",
        icon: <LineRotateIcon />,
        disabled: !ready,
        menu: menu(editor, RotateObjectMenu),
      },
    ]
    const more: LineGroup[] = [
      {
        id: "selection",
        commands: [
          {
            id: "reset-style",
            label: "Reset to Match Style",
            icon: <ContextGlyph label="Reset to Match Style" />,
            disabled: !ready,
            onClick: reset,
          },
          {
            id: "text-fill",
            label: "Text Fill",
            icon: <ContextGlyph label="Text Fill" />,
            disabled: !ready || !text,
            menu: textMenu,
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Format"
        groups={[
          { id: "styles", commands: commands.map((command) => ({ ...command, showLabel: true })) },
          { id: "arrange", commands: arrange.map((command) => ({ ...command, showLabel: true })) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Format" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Current Selection" name="current-selection">
        <div className="flex flex-col justify-center gap-0.5 px-1">
          {selection}
          <RibbonCommand size="small" label="Format Selection" disabled={!ready} onClick={formatSelection}>
            <ContextGlyph label="Format Selection" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Reset to Match Style" disabled={!ready} onClick={reset}>
            <ContextGlyph label="Reset to Match Style" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles" name="shape-styles">
        <div className="flex flex-col justify-center gap-0.5">
          <RibbonCommand size="small" label="Shape Fill" disabled={!ready} menu={fillMenu}>
            <LineShapeFillIcon color={fillColor} />
          </RibbonCommand>
          <RibbonCommand size="small" label="Shape Outline" disabled={!ready} menu={outlineMenu}>
            <LineShapeOutlineIcon color={lineColor} />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="WordArt Styles" name="wordart-styles">
        <RibbonCommand size="large" label="Text Fill" disabled={!ready || !text} menu={textMenu}>
          <ContextGlyph label="Text Fill" />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Arrange" name="arrange">
        <RibbonCommand
          label="Position"
          disabled={!ready}
          menu={(close) => <PositionMenu editor={editor} close={close} />}
        >
          <CurrentPositionIcon editor={editor} size={32} />
        </RibbonCommand>
        <RibbonCommand
          label="Wrap Text"
          disabled={!ready}
          menu={(close) => <WrapTextMenu editor={editor} close={close} />}
        >
          <CurrentWrapIcon editor={editor} size={32} />
        </RibbonCommand>
        <div className="flex flex-col justify-center gap-0.5">
          <SmallSplit
            label="Bring Forward"
            icon={<LineLayerIcon direction="forward" />}
            disabled={!ready}
            onClick={forward}
            menu={menu(editor, BringForwardMenu)}
          />
          <SmallSplit
            label="Send Backward"
            icon={<LineLayerIcon direction="backward" />}
            disabled={!ready}
            onClick={backward}
            menu={menu(editor, SendBackwardMenu)}
          />
          <RibbonCommand
            size="small"
            label="Selection Pane"
            active={selectionPane}
            onClick={() => toggleSelectionPane()}
          >
            <LineSelectIcon />
          </RibbonCommand>
        </div>
        <div className="flex flex-col justify-center gap-0.5">
          <RibbonCommand size="small" label="Align" disabled={!ready} menu={menu(editor, AlignObjectsMenu)}>
            <LineAlignObjectsIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Group" disabled={!editor} menu={menu(editor, GroupMenu)}>
            <LineGroupIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Rotate" disabled={!ready} menu={menu(editor, RotateObjectMenu)}>
            <LineRotateIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup
        label="Size"
        name="size"
        onLaunch={ready ? () => useLayoutDialog.getState().show("size") : undefined}
        launchLabel="Advanced Layout: Size"
      >
        <div className="flex flex-col justify-center gap-1 px-1">
          <SizeSpinner
            label="Shape Height"
            short="Height"
            value={chart ? chart.height / PX_PER_CM : 0}
            disabled={!ready}
            onCommit={(cm) => resize("height", cm)}
          />
          <SizeSpinner
            label="Shape Width"
            short="Width"
            value={chart ? chart.width / PX_PER_CM : 0}
            disabled={!ready}
            onCommit={(cm) => resize("width", cm)}
          />
        </div>
      </RibbonGroup>
    </div>
  )
}
