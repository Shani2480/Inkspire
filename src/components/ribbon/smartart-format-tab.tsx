import { AlignObjectsMenu, BringForwardMenu, RotateObjectMenu, SendBackwardMenu } from "@/components/arrange-menus"
import { ColorMenu } from "@/components/color-menu"
import { CurrentPositionIcon, CurrentWrapIcon } from "@/components/object-layout-icons"
import { PositionMenu } from "@/components/position-menu"
import {
  LineAlignObjectsIcon,
  LineLayerIcon,
  LinePositionIcon,
  LineRotateIcon,
  LineSelectIcon,
  LineShapeFillIcon,
  LineShapeOutlineIcon,
  LineShapesIcon,
  LineSizeIcon,
  LineWordArtIcon,
} from "@/components/ribbon/line-icons"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { SizeSpinner, SmallSplit } from "@/components/ribbon/shape-format-tab"
import { SingleLineBar, type LineGroup } from "@/components/ribbon/single-line"
import { setItems, useSmartArtState } from "@/components/ribbon/smartart-tab"
import { WrapTextMenu } from "@/components/wrap-menu"
import { useViewStore } from "@/document/view"
import { selectedObject } from "@/editor/objects"
import { MAX_SIZE_STEP, SMARTART_SHAPES, withLook, type SmartArtLook } from "@/editor/smartart-model"
import { PX_PER_CM } from "@/editor/table-props"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import type { ReactNode } from "react"

/** The selected graphic's size in px as drawn (its own when set, else as laid out). */
function graphicSize(editor: Editor | null) {
  const found = selectedObject(editor)
  if (!editor || found?.name !== "smartArt") {
    return null
  }
  const dom = editor.view.nodeDOM(found.pos)
  const drawn = dom instanceof HTMLElement ? dom : null
  return {
    width: Number(found.attrs.width) || drawn?.offsetWidth || 0,
    height: Number(found.attrs.height) || drawn?.offsetHeight || 0,
  }
}

/**
 * The SmartArt Format tab (22.1), beside SmartArt Design: the shape the caret was last in gets its own outline (Change
 * Shape), grows or shrinks (Larger, Smaller), and its own Shape Fill, Shape Outline and Text Fill; the graphic as a
 * whole is arranged and sized as other objects are.
 */
export function SmartArtFormatTab() {
  const { editor, found, items, active } = useSmartArtState()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const size = useEditorState({
    editor,
    selector: ({ editor: current }) => graphicSize(current),
    equalityFn: (left, right) => left?.width === right?.width && left?.height === right?.height,
  })
  const item = items[active]
  const look = item?.look ?? {}
  const ready = Boolean(editor && found && item)
  const restyle = (change: Partial<Record<keyof SmartArtLook, unknown>>) => {
    setItems(
      editor,
      items.map((entry, index) => (index === active ? withLook(entry, change) : entry)),
      active,
    )
  }
  const steps = look.size ?? 0
  const grow = (delta: number) => restyle({ size: Math.max(-MAX_SIZE_STEP, Math.min(MAX_SIZE_STEP, steps + delta)) })
  const resize = (axis: "width" | "height", cm: number) => {
    if (cm > 0) {
      editor
        ?.chain()
        .updateObject({ [axis]: Math.round(cm * PX_PER_CM) })
        .run()
    }
  }
  const forward = () => editor?.chain().focus().setObjectLayer("forward").run()
  const backward = () => editor?.chain().focus().setObjectLayer("backward").run()
  const menu = (Menu: (props: { editor: Editor | null; close: () => void }) => ReactNode) => (close: () => void) => (
    <Menu editor={editor} close={close} />
  )

  const shapeMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      {SMARTART_SHAPES.map((shape) => (
        <MenuButton
          key={shape.id}
          selected={(look.shape ?? "") === shape.id}
          onClick={() => {
            restyle({ shape: shape.id })
            close()
          }}
        >
          {shape.label}
        </MenuButton>
      ))}
    </div>
  )
  const colorMenu = (key: "fill" | "line" | "text") => (close: () => void) => (
    <ColorMenu
      active={look[key] ?? ""}
      clearLabel="Automatic"
      onClear={() => {
        restyle({ [key]: undefined })
        close()
      }}
      onSelect={(color) => {
        restyle({ [key]: color })
        close()
      }}
    />
  )
  const heightField = (
    <SizeSpinner
      label="Height"
      short="Height"
      value={size ? size.height / PX_PER_CM : 0}
      disabled={!ready}
      onCommit={(cm) => resize("height", cm)}
    />
  )
  const widthField = (
    <SizeSpinner
      label="Width"
      short="Width"
      value={size ? size.width / PX_PER_CM : 0}
      disabled={!ready}
      onCommit={(cm) => resize("width", cm)}
    />
  )

  if (ribbonLayout === "single") {
    const groups: LineGroup[] = [
      {
        id: "shapes",
        commands: [
          { id: "change-shape", label: "Change Shape", icon: <LineShapesIcon />, disabled: !ready, menu: shapeMenu },
          {
            id: "larger",
            label: "Larger",
            icon: <Glyph>A+</Glyph>,
            disabled: !ready || steps >= MAX_SIZE_STEP,
            onClick: () => grow(1),
          },
          {
            id: "smaller",
            label: "Smaller",
            icon: <Glyph>A−</Glyph>,
            disabled: !ready || steps <= -MAX_SIZE_STEP,
            onClick: () => grow(-1),
          },
        ],
      },
      {
        id: "styles",
        commands: [
          {
            id: "fill",
            label: "Shape Fill",
            icon: <LineShapeFillIcon color={look.fill ?? "#0f6cbd"} />,
            disabled: !ready,
            menu: colorMenu("fill"),
          },
          {
            id: "outline",
            label: "Shape Outline",
            icon: <LineShapeOutlineIcon color={look.line ?? "#0f6cbd"} />,
            disabled: !ready,
            menu: colorMenu("line"),
          },
          { id: "text-fill", label: "Text Fill", icon: <LineWordArtIcon />, disabled: !ready, menu: colorMenu("text") },
        ],
      },
      {
        id: "arrange",
        commands: [
          {
            id: "position",
            label: "Position",
            icon: <LinePositionIcon />,
            disabled: !ready,
            menu: (close) => <PositionMenu editor={editor} close={close} />,
          },
          {
            id: "wrap",
            label: "Wrap Text",
            icon: <CurrentWrapIcon editor={editor} size={16} />,
            disabled: !ready,
            menu: (close) => <WrapTextMenu editor={editor} close={close} />,
          },
          {
            id: "forward",
            label: "Bring Forward",
            icon: <LineLayerIcon direction="forward" />,
            disabled: !ready,
            menu: menu(BringForwardMenu),
          },
          {
            id: "backward",
            label: "Send Backward",
            icon: <LineLayerIcon direction="backward" />,
            disabled: !ready,
            menu: menu(SendBackwardMenu),
          },
          {
            id: "align",
            label: "Align",
            icon: <LineAlignObjectsIcon />,
            disabled: !ready,
            menu: menu(AlignObjectsMenu),
          },
          { id: "rotate", label: "Rotate", icon: <LineRotateIcon />, disabled: !ready, menu: menu(RotateObjectMenu) },
        ],
      },
      {
        id: "size",
        commands: [{ id: "size", label: "Size", icon: <LineSizeIcon />, disabled: !ready, field: heightField }],
      },
    ]
    return <SingleLineBar label="SmartArt Format" groups={groups} />
  }

  return (
    <div role="toolbar" aria-label="SmartArt Format" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Shapes">
        <RibbonCommand size="large" label="Change Shape" disabled={!ready} menu={shapeMenu}>
          <LineShapesIcon />
        </RibbonCommand>
        <div className="flex flex-col py-0.5">
          <RibbonCommand
            size="small"
            label="Larger"
            disabled={!ready || steps >= MAX_SIZE_STEP}
            onClick={() => grow(1)}
          >
            <Glyph>A+</Glyph>
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Smaller"
            disabled={!ready || steps <= -MAX_SIZE_STEP}
            onClick={() => grow(-1)}
          >
            <Glyph>A−</Glyph>
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles">
        <div className="flex flex-col py-0.5">
          <RibbonCommand size="small" label="Shape Fill" disabled={!ready} menu={colorMenu("fill")}>
            <LineShapeFillIcon color={look.fill ?? "#0f6cbd"} />
          </RibbonCommand>
          <RibbonCommand size="small" label="Shape Outline" disabled={!ready} menu={colorMenu("line")}>
            <LineShapeOutlineIcon color={look.line ?? "#0f6cbd"} />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="WordArt Styles">
        <RibbonCommand size="small" label="Text Fill" disabled={!ready} menu={colorMenu("text")}>
          <LineWordArtIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Arrange">
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
            menu={menu(BringForwardMenu)}
          />
          <SmallSplit
            label="Send Backward"
            icon={<LineLayerIcon direction="backward" />}
            disabled={!ready}
            onClick={backward}
            menu={menu(SendBackwardMenu)}
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
          <RibbonCommand size="small" label="Align" disabled={!ready} menu={menu(AlignObjectsMenu)}>
            <LineAlignObjectsIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Rotate" disabled={!ready} menu={menu(RotateObjectMenu)}>
            <LineRotateIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Size">
        <div className="flex flex-col justify-center gap-1 px-1">
          {heightField}
          {widthField}
        </div>
      </RibbonGroup>
    </div>
  )
}

function Glyph({ children }: { children: string }) {
  return (
    <span aria-hidden className="text-[12px] leading-none font-semibold">
      {children}
    </span>
  )
}
