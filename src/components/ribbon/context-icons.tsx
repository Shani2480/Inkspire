import { RibbonSvg } from "@/components/ribbon/icons"
import {
  LineAlignObjectsIcon,
  LineAutoFitIcon,
  LineBordersIcon,
  LineCellAlignIcon,
  LineColorsIcon,
  LineConvertTextIcon,
  LineCorrectionsIcon,
  LineCropIcon,
  LineCubeIcon,
  LineDistributeIcon,
  LineDrawingIcon,
  LineEraseIcon,
  LineFormulaIcon,
  LineGroupIcon,
  LineLinkIcon,
  LineUnlinkIcon,
  LineMarginsIcon,
  LineNavigationIcon,
  LineObjectStylesIcon,
  LinePictureIcon,
  LinePositionIcon,
  LineQuickLayoutIcon,
  LineRotateIcon,
  LineSelectIcon,
  LineShapesIcon,
  LineSortIcon,
  LineTableDeleteIcon,
  LineTextBoxIcon,
  LineWrapTextIcon,
  LineZoomIcon,
} from "@/components/ribbon/line-icons"
import type { ReactNode } from "react"

/** Commands with a drawing of their own, by exact label; the rest are matched by the rules below. */
const NAMED_GLYPHS: Record<string, () => ReactNode> = {
  "selection pane": () => <LineNavigationIcon />,
  "edit shape": () => <LineShapesIcon />,
  align: () => <LineAlignObjectsIcon />,
  "align text": () => <LineCellAlignIcon />,
  "shape effects": () => <LineObjectStylesIcon />,
  "picture effects": () => <LineObjectStylesIcon />,
  "picture border": () => <LineBordersIcon />,
  "refresh data": () => <LineRotateIcon />,
  "pan and zoom": () => <LineZoomIcon />,
  color: () => <LineColorsIcon />,
  "artistic effects": () => <LineObjectStylesIcon />,
  transparency: () => <TransparencyMark />,
  "compress pictures": () => <CompressMark />,
  group: () => <LineGroupIcon />,
  formula: () => <LineFormulaIcon />,
  eraser: () => <LineEraseIcon />,
  "draw text box": () => <LineTextBoxIcon />,
  "draw table": () => <LineDrawingIcon />,
  "distribute rows": () => <LineDistributeIcon axis="rows" />,
  "distribute columns": () => <LineDistributeIcon axis="columns" />,
  "create link": () => <LineLinkIcon />,
  "break link": () => <LineUnlinkIcon />,
  "convert to text": () => <LineConvertTextIcon />,
  "change picture": () => <LinePictureIcon />,
  "change colors": () => <LineColorsIcon />,
  "cell margins": () => <LineMarginsIcon />,
  autofit: () => <LineAutoFitIcon />,
  sort: () => <LineSortIcon />,
  select: () => <LineSelectIcon />,
  "quick layout": () => <LineQuickLayoutIcon />,
  corrections: () => <LineCorrectionsIcon />,
  crop: () => <LineCropIcon />,
  delete: () => <LineTableDeleteIcon />,
  "3d models": () => <LineCubeIcon />,
  scenes: () => <ScenesMark />,
  previous: () => <StepMark up />,
  next: () => <StepMark />,
  "link to previous": () => <LineLinkIcon />,
  pause: () => <PauseMark />,
  lighting: () => <LightMark />,
  "3d model views": () => <ViewsMark />,
  position: () => <LinePositionIcon />,
  "wrap text": () => <LineWrapTextIcon />,
}

export function ContextGlyph({ label }: { label: string }) {
  const key = label.toLowerCase()
  const named = NAMED_GLYPHS[key]
  if (named) return named()
  if (key.includes("header")) return <TableMark header />
  if (key.includes("banded row")) return <TableMark bands="row" />
  if (key.includes("banded column")) return <TableMark bands="column" />
  if (key.includes("first column")) return <TableMark first />
  if (key === "all borders") return <TableMark grid />
  if (key.includes("no border")) return <TableMark plain />
  if (key.includes("select row")) return <TableMark row />
  if (key.includes("select column")) return <TableMark column />
  if (key.includes("select table")) return <TableMark all />
  if (key.includes("insert above") || key.includes("rows above")) return <InsertMark axis="row" edge="start" />
  if (key.includes("insert below") || key.includes("rows below")) return <InsertMark axis="row" edge="end" />
  if (key.includes("insert left") || key.includes("columns to the left"))
    return <InsertMark axis="column" edge="start" />
  if (key.includes("insert right") || key.includes("columns to the right"))
    return <InsertMark axis="column" edge="end" />
  if (key.includes("delete row") || key === "rows") return <InsertMark axis="row" remove />
  if (key.includes("delete column") || key === "columns") return <InsertMark axis="column" remove />
  if (key.includes("delete table") || key === "table") return <TableMark remove />
  if (key.includes("merge")) return <MergeMark />
  if (key.includes("split")) return <SplitMark />
  if (key.includes("align left")) return <AlignMark align="left" />
  if (key === "center" || key.includes("align center")) return <AlignMark align="center" />
  if (key.includes("align right")) return <AlignMark align="right" />
  if (key.includes("direction")) return <DirectionMark />
  if (key.includes("in line")) return <WrapMark kind="inline" />
  if (key.includes("in front")) return <WrapMark kind="front" />
  if (key.includes("behind")) return <WrapMark kind="behind" />
  if (key.includes("top and bottom") || key.includes("top and bottom")) return <WrapMark kind="top" />
  if (key.includes("alt")) return <AltMark />
  if (key.includes("width") || key.includes("size")) return <SizeMark />
  if (key.includes("rotate")) return <RotateMark />
  if (
    key.includes("top left") ||
    key.includes("top center") ||
    key.includes("top right") ||
    key.includes("middle") ||
    key.includes("bottom")
  )
    return <AnchorMark label={key} />
  if (key.includes("bring") || key.includes("forward")) return <LayerMark front />
  if (key.includes("send") || key.includes("backward")) return <LayerMark front={false} />
  if (key.includes("play")) return <PlayMark />
  if (key.includes("reset")) return <ResetMark />
  if (key === "cube" || key === "cylinder" || key === "pyramid" || key === "cone" || key === "sphere")
    return <ModelMark kind={key} />
  if (key.includes("chart")) return <ChartMark />
  if (key.includes("switch")) return <SwitchMark />
  if (key.includes("edit data")) return <SheetMark />
  return <TableMark grid />
}

function TableMark({
  header,
  bands,
  first,
  grid,
  plain,
  row,
  column,
  all,
  remove,
}: {
  header?: boolean
  bands?: "row" | "column"
  first?: boolean
  grid?: boolean
  plain?: boolean
  row?: boolean
  column?: boolean
  all?: boolean
  remove?: boolean
}) {
  return (
    <RibbonSvg>
      <rect
        x="2"
        y="2.5"
        width="12"
        height="11"
        rx="0.6"
        fill="#fff"
        stroke={plain ? "var(--icon-muted-color)" : "var(--icon-accent-color)"}
      />
      {header || all ? <rect x="2.4" y="2.8" width="11.2" height="2.4" fill="var(--icon-accent-color)" /> : null}
      {first || column ? <rect x="2.4" y="2.8" width="3" height="10.2" fill="#deecf9" /> : null}
      {row ? <rect x="2.4" y="6" width="11.2" height="2.6" fill="#deecf9" /> : null}
      {bands === "row" ? (
        <path d="M2.4 6h11.2M2.4 9.2h11.2" stroke="var(--icon-accent-color)" strokeWidth="1.4" />
      ) : null}
      {bands === "column" ? (
        <path d="M6 2.8v10.2M9.4 2.8v10.2" stroke="var(--icon-accent-color)" strokeWidth="1.4" />
      ) : null}
      {grid ? (
        <path d="M2 6.2h12M2 9.6h12M6 2.5v11M10 2.5v11" stroke="var(--icon-accent-color)" strokeWidth="0.7" />
      ) : null}
      {remove ? <path d="M4 5.2 12 12M12 5.2 4 12" stroke="#a4262c" strokeWidth="1.3" strokeLinecap="round" /> : null}
    </RibbonSvg>
  )
}

function InsertMark({ axis, edge, remove }: { axis: "row" | "column"; edge?: "start" | "end"; remove?: boolean }) {
  const horizontal = axis === "row"
  return (
    <RibbonSvg>
      <rect x="2" y="3" width="9" height="10" fill="#fff" stroke="var(--icon-muted-color)" />
      <path d="M2 6.4h9M2 9.6h9M5 3v10M8 3v10" stroke="#d0d0d0" />
      {horizontal ? (
        <rect x="2.3" y={edge === "end" ? 9.2 : 3.3} width="8.4" height="2.6" fill={remove ? "#fde7e9" : "#c7e0b4"} />
      ) : (
        <rect x={edge === "end" ? 7.4 : 2.3} y="3.3" width="2.8" height="9.4" fill={remove ? "#fde7e9" : "#c7e0b4"} />
      )}
      <circle cx="12.4" cy="12.2" r="2.4" fill={remove ? "#a4262c" : "#107c10"} />
      <path
        d={remove ? "M11.2 11l2.4 2.4M13.6 11 11.2 13.4" : "M12.4 11v2.4M11.2 12.2h2.4"}
        stroke="#fff"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function MergeMark() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="4" width="12.8" height="8" rx="0.4" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M4.5 8h5" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function SplitMark() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="4" width="5.6" height="8" fill="#fff" stroke="var(--icon-accent-color)" />
      <rect x="8.8" y="4" width="5.6" height="8" fill="#fff" stroke="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

function AlignMark({ align }: { align: "left" | "center" | "right" }) {
  const x = align === "left" ? 3 : align === "right" ? 6 : 4
  return (
    <RibbonSvg>
      <path
        d={`M${x} 4h${align === "center" ? 8 : 7}M${x} 8h${align === "center" ? 8 : 5}M${x} 12h${align === "center" ? 8 : 6}`}
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function DirectionMark() {
  return (
    <RibbonSvg>
      <path d="M6 3.2h2.2v7.2" stroke="var(--icon-base-color)" strokeWidth="1.3" />
      <path
        d="M4.4 8.2 7.1 11.4 9.8 8.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function WrapMark({ kind }: { kind: "inline" | "front" | "behind" | "top" }) {
  return (
    <RibbonSvg>
      <path d="M1.6 3h12.8M1.6 13h12.8M1.6 6h4M1.6 9h4" stroke="var(--icon-muted-color)" strokeWidth="0.9" />
      <rect
        x={kind === "inline" ? 8 : 5}
        y={kind === "top" ? 5.5 : 4}
        width="5"
        height="4.5"
        fill={kind === "behind" ? "#deecf9" : "var(--icon-accent-color)"}
      />
    </RibbonSvg>
  )
}

function TransparencyMark() {
  return (
    <RibbonSvg>
      <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="var(--icon-base-color)" />
      <path d="M2 2h4V6H2zM10 2h4v4h-4zM6 6h4v4H6zM2 10h4v4H2zM10 10h4v4h-4z" fill="#d0d0d0" />
      <rect x="4" y="4" width="8" height="8" fill="var(--icon-accent-color)" opacity="0.55" />
    </RibbonSvg>
  )
}

function CompressMark() {
  return (
    <RibbonSvg>
      <rect x="2.5" y="3" width="11" height="10" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path
        d="M5 6.5V5.2h1.3M11 9.5v1.3H9.7M5 5.2l2 2M11 10.8l-2-2"
        stroke="var(--icon-base-color)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function AltMark() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="3" width="8" height="7" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M11 5h3M11 8h3M11 11h2" stroke="var(--icon-base-color)" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function SizeMark() {
  return (
    <RibbonSvg>
      <rect x="3" y="5" width="8" height="6" fill="#fff" stroke="var(--icon-accent-color)" />
      <path d="M2 8V3h5M14 8v5H9" stroke="var(--icon-base-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function RotateMark() {
  return (
    <RibbonSvg>
      <path
        d="M12 6.2A4.4 4.4 0 1 0 11.2 11"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M12 3.2v3.2H8.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function AnchorMark({ label }: { label: string }) {
  const x = label.includes("left") ? 4 : label.includes("right") ? 11 : 7.5
  const y = label.includes("top") ? 4 : label.includes("bottom") ? 11 : 7.5
  return (
    <RibbonSvg>
      <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="var(--icon-muted-color)" />
      <circle cx={x} cy={y} r="1.6" fill="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

function LayerMark({ front }: { front: boolean }) {
  return (
    <RibbonSvg>
      <rect
        x="2"
        y="5"
        width="7"
        height="7"
        fill={front ? "#f3f3f3" : "var(--icon-accent-color)"}
        stroke="var(--icon-muted-color)"
      />
      <rect
        x="6"
        y="2.2"
        width="7"
        height="7"
        fill={front ? "var(--icon-accent-color)" : "#f3f3f3"}
        stroke="var(--icon-base-color)"
      />
    </RibbonSvg>
  )
}

function PlayMark() {
  return (
    <RibbonSvg>
      <circle cx="8" cy="8" r="6" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M7 5.6v4.8l4-2.4z" fill="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

/** Pause: Word's two upright bars. */
function PauseMark() {
  return (
    <RibbonSvg>
      <rect x="4.2" y="3" width="2.4" height="10" rx=".5" fill="var(--icon-accent-color)" />
      <rect x="9.4" y="3" width="2.4" height="10" rx=".5" fill="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

/** Scenes: a cube with the arc of its motion. */
function ScenesMark() {
  return (
    <RibbonSvg>
      <path d="M8 6.2 11 4.6 14 6.2v3.6L11 11.4 8 9.8z" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M8 6.2 11 7.8 14 6.2M11 7.8v3.6" stroke="var(--icon-accent-color)" />
      <path d="M2 12.5c1.6 1.4 4 1.8 6.2 1" stroke="currentColor" strokeLinecap="round" />
      <path d="M2 9.2c.9.8 2.1 1.2 3.4 1.1" stroke="currentColor" strokeLinecap="round" />
    </RibbonSvg>
  )
}

/** Header & Footer Previous and Next: a page with an arrow to the header before or after. */
function StepMark({ up = false }: { up?: boolean }) {
  return (
    <RibbonSvg>
      <path d="M3.5 1.5h9v13h-9z" fill="#fff" stroke="currentColor" />
      <path d={up ? "M5.5 4h5" : "M5.5 12h5"} stroke="currentColor" />
      <path
        d={up ? "M8 11V6M6 8l2-2 2 2" : "M8 5v5M6 8l2 2 2-2"}
        stroke="var(--icon-accent-color)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

/** Lighting: a bulb with rays. */
function LightMark() {
  return (
    <RibbonSvg>
      <path
        d="M8 3.4a3.4 3.4 0 0 0-2 6.2V11h4V9.6a3.4 3.4 0 0 0-2-6.2z"
        fill="#fff4ce"
        stroke="var(--icon-accent-color)"
      />
      <path d="M6.4 13h3.2M8 1v1M2.6 6.6h1M12.4 6.6h1M3.8 2.6l.7.7M12.2 2.6l-.7.7" stroke="currentColor" />
    </RibbonSvg>
  )
}

/** 3D Model Views: a cube seen from three sides. */
function ViewsMark() {
  return (
    <RibbonSvg>
      <path d="M8 2.5 13 5v6l-5 2.5L3 11V5z" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M3 5l5 2.5L13 5M8 7.5v6" stroke="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

function ResetMark() {
  return (
    <RibbonSvg>
      <path
        d="M12.4 6A4.6 4.6 0 1 0 11.6 11"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M12.4 3.2v3H9.4" stroke="var(--icon-accent-color)" strokeWidth="1.3" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function ModelMark({ kind }: { kind: string }) {
  if (kind === "cylinder") {
    return (
      <RibbonSvg>
        <ellipse cx="8" cy="4.5" rx="4" ry="1.6" fill="#9cc7f0" stroke="var(--icon-accent-color)" />
        <path d="M4 4.5v6c0 1 1.8 1.8 4 1.8s4-.8 4-1.8v-6" fill="var(--icon-accent-color)" />
      </RibbonSvg>
    )
  }
  if (kind === "pyramid") {
    return (
      <RibbonSvg>
        <polygon points="8,2 14,13 2,13" fill="#f4b183" stroke="#c45911" />
      </RibbonSvg>
    )
  }
  if (kind === "cone") {
    return (
      <RibbonSvg>
        <polygon points="8,2 13,12 3,12" fill="#c45911" />
        <ellipse cx="8" cy="12" rx="5" ry="1.5" fill="#f4b183" />
      </RibbonSvg>
    )
  }
  if (kind === "sphere") {
    return (
      <RibbonSvg>
        <circle cx="8" cy="8" r="5" fill="#9cc7f0" stroke="var(--icon-accent-color)" />
      </RibbonSvg>
    )
  }
  return (
    <RibbonSvg>
      <polygon points="3,6 8,3 13,6 8,9" fill="#9cc7f0" />
      <polygon points="3,6 8,9 8,13 3,10" fill="var(--icon-accent-color)" />
      <polygon points="13,6 8,9 8,13 13,10" fill="#5aa2e0" />
    </RibbonSvg>
  )
}

function ChartMark() {
  return (
    <RibbonSvg>
      <rect x="2" y="8" width="3" height="5" fill="var(--icon-accent-color)" />
      <rect x="6.5" y="4" width="3" height="9" fill="#107c10" />
      <rect x="11" y="6" width="3" height="7" fill="#ca5010" />
    </RibbonSvg>
  )
}

function SwitchMark() {
  return (
    <RibbonSvg>
      <path
        d="M3 6h8M9 3.5 11.5 6 9 8.5M13 10H5M7 7.5 4.5 10 7 12.5"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function SheetMark() {
  return (
    <RibbonSvg>
      <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#217346" />
      <path d="M2 5.5h12M2 9h12M6 2v12M10 2v12" stroke="#217346" strokeWidth="0.7" />
      <rect x="2" y="2" width="12" height="3.2" fill="#217346" />
    </RibbonSvg>
  )
}
