import {
  AlignObjectsMenu,
  BringForwardMenu,
  GroupMenu,
  RotateObjectMenu,
  SendBackwardMenu,
} from "@/components/arrange-menus"
import { IconLibrary } from "@/components/icon-library"
import { ChangeIconMenu, editAltText, shapeNode } from "@/components/object-menus"
import { CurrentPositionIcon, CurrentWrapIcon } from "@/components/object-layout-icons"
import { PositionMenu } from "@/components/position-menu"
import { ContextGlyph } from "@/components/ribbon/context-icons"
import {
  LineAlignObjectsIcon,
  LineAltTextIcon,
  LineCellAlignIcon,
  LineGroupIcon,
  LineLayerIcon,
  LineObjectStylesIcon,
  LinePositionIcon,
  LineRotateIcon,
  LineSelectIcon,
  LineShapeFillIcon,
  LineShapeOutlineIcon,
  LineShapesIcon,
  LineTextBoxIcon,
  LineWordArtIcon,
} from "@/components/ribbon/line-icons"
import {
  MenuButton,
  RibbonCommand,
  RibbonGroup,
  RibbonHover,
  RibbonPopover,
  RibbonSplit,
} from "@/components/ribbon/ribbon-button"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import {
  AlignTextVerticalMenu,
  EditShapeMenu,
  ShapeEffectsMenu,
  ShapeFillMenu,
  ShapeOutlineMenu,
  ShapeStyleRow,
  ShapeStylesMenu,
  ShapesList,
  ShapeThumb,
  STYLE_ROWS,
  TextDirectionMenu,
  TextEffectsMenu,
  TextFillMenu,
  TextOutlineMenu,
  TextQuickStyles,
  insertShape,
  styleRowOf,
  useFormatShapePane,
  useShapeColors,
} from "@/components/shape-menus"
import { WrapTextMenu } from "@/components/wrap-menu"
import { useLayoutDialog } from "@/document/object-layout"
import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import { SHAPE_NAMES } from "@/editor/insert-blocks"
import { breakTextBoxLink, hasNextBox, startLinking, useTextBoxLinking } from "@/editor/text-box-link"
import { TEXT_PRESETS } from "@/editor/text-effects"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useEffect, useState, type ReactNode } from "react"

const PX_PER_CM = 96 / 2.54

type Target = {
  name: string
  kind: string
  pos: number
  width: number
  height: number
  textBox: boolean
  /** A text box that passes its text on to another (Break Link instead of Create Link). */
  linked: boolean
  fill: string
  stroke: string
  shapeStyle: string
}

function targetOf(editor: Editor): Target | null {
  const found = shapeNode(editor)
  if (!found) {
    return null
  }
  const dom = editor.view.nodeDOM(found.pos)
  const zoom = useViewStore.getState().zoom || 1
  const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  return {
    name: found.name,
    kind: String(found.attrs.kind || found.name),
    pos: found.pos,
    width: Number(found.attrs.width) || Math.round((rect?.width ?? 0) / zoom),
    height: Number(found.attrs.height) || Math.round((rect?.height ?? 0) / zoom),
    textBox: found.name === "textBox",
    linked: found.name === "textBox" && hasNextBox(editor.state.doc, found.pos),
    fill: String(found.attrs.fill || ""),
    stroke: String(found.attrs.stroke || found.attrs.borderColor || ""),
    shapeStyle: String(found.attrs.shapeStyle || ""),
  }
}

/**
 * Word's Shape Format tab (20.9), for shapes, icons, text boxes and WordArt: Insert Shapes, Shape Styles, WordArt
 * Styles, Text, Accessibility, Arrange and Size, in Word's order, with its galleries, split buttons and menus.
 */
export function ShapeFormatTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const showPane = useFormatShapePane((state) => state.show)
  const colors = useShapeColors()
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false)
  const target = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? targetOf(current) : null),
    equalityFn: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  })
  const ready = Boolean(editor && target)
  const icon = target?.kind === "icon"
  const textual = Boolean(target?.textBox)
  const linking = useTextBoxLinking((state) => state.source !== null)
  // Create Link picks the box the text flows on to; on a box that already passes it on it is Break Link.
  const link = () => {
    if (!editor || !target?.textBox) {
      return
    }
    if (target.linked) {
      const tr = breakTextBoxLink(editor.state, target.pos)
      if (tr) {
        editor.view.dispatch(tr)
      }
    } else {
      startLinking(editor.view, target.pos)
    }
  }
  const linkLabel = target?.linked ? "Break Link" : "Create Link"
  const linkDescription = target?.linked
    ? "Stop this text box's text flowing on to the next one."
    : "Flow this text box's text on to an empty text box: click Create Link, then click the empty box."
  const menu = (Menu: (props: { editor: Editor | null; close: () => void }) => ReactNode) => (close: () => void) => (
    <Menu editor={editor} close={close} />
  )
  const run = (attrs: Record<string, unknown>) => editor?.chain().focus().updateObject(attrs).run()
  const fillLast = () => run({ fill: colors.fill, fillGradient: "", fillImage: "", texture: "", shapeStyle: "" })
  const outlineLast = () => run({ stroke: colors.outline, shapeStyle: "" })
  const resize = (axis: "width" | "height", cm: number) => {
    if (cm > 0) {
      run({ [axis]: Math.round(cm * PX_PER_CM) })
    }
  }
  const iconLibrary =
    iconLibraryOpen && editor ? <IconLibrary editor={editor} onClose={() => setIconLibraryOpen(false)} /> : null
  const editShape = icon
    ? (close: () => void) => <ChangeIconMenu editor={editor} close={close} onMore={() => setIconLibraryOpen(true)} />
    : menu(EditShapeMenu)
  const shapesMenu = (close: () => void) => (
    <ShapesList
      onPick={(name) => {
        insertShape(editor, name)
        close()
      }}
    />
  )
  const wordArtMenu = (close: () => void) =>
    target?.name === "wordArt" ? (
      <WordArtPresets editor={editor} close={close} />
    ) : (
      <div className="p-1">
        <TextQuickStyles editor={editor} close={close} />
      </div>
    )
  const heightField = (
    <SizeSpinner
      label="Shape Height"
      short="Height"
      value={target ? target.height / PX_PER_CM : 0}
      disabled={!ready}
      onCommit={(cm) => resize("height", cm)}
    />
  )
  const widthField = (
    <SizeSpinner
      label="Shape Width"
      short="Width"
      value={target ? target.width / PX_PER_CM : 0}
      disabled={!ready}
      onCommit={(cm) => resize("width", cm)}
    />
  )
  const forward = () => editor?.chain().focus().setObjectLayer("forward").run()
  const backward = () => editor?.chain().focus().setObjectLayer("backward").run()

  if (ribbonLayout === "single") {
    const styles: LineCommand[] = [
      { id: "shapes", label: "Shapes", icon: <LineShapesIcon />, priority: 1, disabled: !editor, menu: shapesMenu },
      {
        id: "shape-styles",
        label: "Shape Styles",
        icon: <LineObjectStylesIcon />,
        priority: 2,
        disabled: !ready,
        menu: menu(ShapeStylesMenu),
      },
      {
        id: "shape-fill",
        label: "Shape Fill",
        icon: <LineShapeFillIcon color={colors.fill} />,
        priority: 2,
        disabled: !ready,
        onClick: fillLast,
        menu: menu(ShapeFillMenu),
      },
      {
        id: "shape-outline",
        label: "Shape Outline",
        icon: <LineShapeOutlineIcon color={colors.outline} />,
        priority: 1,
        disabled: !ready,
        onClick: outlineLast,
        menu: menu(ShapeOutlineMenu),
      },
      {
        id: "shape-effects",
        label: "Shape Effects",
        icon: <ContextGlyph label="Shape Effects" />,
        disabled: !ready,
        menu: menu(ShapeEffectsMenu),
      },
    ]
    const arrange: LineCommand[] = [
      {
        id: "alt-text",
        label: "Alt Text",
        icon: <LineAltTextIcon />,
        disabled: !ready,
        onClick: () => editor && editAltText(editor),
      },
      {
        id: "position",
        label: "Position",
        icon: <CurrentPositionIcon editor={editor} />,
        disabled: !ready,
        menu: (close) => <PositionMenu editor={editor} close={close} />,
      },
      {
        id: "wrap-text",
        label: "Wrap Text",
        icon: <CurrentWrapIcon editor={editor} />,
        priority: 1,
        disabled: !ready,
        menu: (close) => <WrapTextMenu editor={editor} close={close} />,
      },
    ]
    const more: LineGroup[] = [
      {
        id: "insert",
        commands: [
          {
            id: "edit-shape",
            label: icon ? "Change Icon" : "Edit Shape",
            icon: <ContextGlyph label="Edit Shape" />,
            disabled: !ready,
            menu: editShape,
          },
          {
            id: "text-box",
            label: "Draw Text Box",
            icon: <LineTextBoxIcon />,
            disabled: !editor,
            onClick: () => editor?.chain().focus().insertTextBox().run(),
          },
          {
            id: "format-pane",
            label: "Format Shape",
            icon: <LineObjectStylesIcon />,
            disabled: !ready,
            onClick: () => showPane("fill"),
          },
        ],
      },
      {
        id: "wordart",
        commands: [
          {
            id: "quick-styles",
            label: "Quick Styles",
            icon: <LineWordArtIcon />,
            disabled: !ready || !(textual || target?.name === "wordArt"),
            menu: wordArtMenu,
          },
          {
            id: "text-fill",
            label: "Text Fill",
            icon: <ContextGlyph label="Text Fill" />,
            disabled: !textual,
            menu: menu(TextFillMenu),
          },
          {
            id: "text-outline",
            label: "Text Outline",
            icon: <ContextGlyph label="Text Outline" />,
            disabled: !textual,
            menu: menu(TextOutlineMenu),
          },
          {
            id: "text-effects",
            label: "Text Effects",
            icon: <ContextGlyph label="Text Effects" />,
            disabled: !textual,
            menu: menu(TextEffectsMenu),
          },
        ],
      },
      {
        id: "text",
        commands: [
          {
            id: "text-direction",
            label: "Text Direction",
            icon: <ContextGlyph label="Text Direction" />,
            disabled: !textual,
            menu: menu(TextDirectionMenu),
          },
          {
            id: "align-text",
            label: "Align Text",
            icon: <LineCellAlignIcon />,
            disabled: !textual,
            menu: menu(AlignTextVerticalMenu),
          },
          {
            id: "create-link",
            label: linkLabel,
            icon: <ContextGlyph label={linkLabel} />,
            disabled: !textual,
            active: linking,
            description: linkDescription,
            onClick: link,
          },
        ],
      },
      {
        id: "arrange",
        commands: [
          {
            id: "bring-forward",
            label: "Bring Forward",
            icon: <LineLayerIcon direction="forward" />,
            disabled: !ready,
            onClick: forward,
            menu: menu(BringForwardMenu),
          },
          {
            id: "send-backward",
            label: "Send Backward",
            icon: <LineLayerIcon direction="backward" />,
            disabled: !ready,
            onClick: backward,
            menu: menu(SendBackwardMenu),
          },
          {
            id: "selection-pane",
            label: "Selection Pane",
            icon: <LineSelectIcon />,
            active: selectionPane,
            onClick: () => toggleSelectionPane(),
          },
          {
            id: "align",
            label: "Align",
            icon: <LineAlignObjectsIcon />,
            disabled: !ready,
            menu: menu(AlignObjectsMenu),
          },
          { id: "group", label: "Group", icon: <LineGroupIcon />, disabled: !editor, menu: menu(GroupMenu) },
          { id: "rotate", label: "Rotate", icon: <LineRotateIcon />, disabled: !ready, menu: menu(RotateObjectMenu) },
        ],
      },
      {
        id: "size",
        commands: [
          {
            id: "size",
            label: "Size",
            icon: <LinePositionIcon />,
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
          label="Shape Format"
          groups={[
            { id: "styles", commands: styles.map((command) => ({ ...command, showLabel: true })) },
            { id: "arrange", commands: arrange.map((command) => ({ ...command, showLabel: true })) },
          ]}
          more={more}
        />
        {iconLibrary}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Shape Format" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Insert Shapes" name="insert-shapes">
        <ShapesGallery editor={editor} />
        <div className="flex flex-col justify-center gap-0.5">
          <RibbonCommand size="small" label={icon ? "Change Icon" : "Edit Shape"} disabled={!ready} menu={editShape}>
            <ContextGlyph label="Edit Shape" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Draw Text Box"
            disabled={!editor}
            onClick={() => editor?.chain().focus().insertTextBox().run()}
          >
            <LineTextBoxIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup
        label="Shape Styles"
        name="shape-styles"
        onLaunch={ready ? () => showPane("fill") : undefined}
        launchLabel="Format Shape"
      >
        <StylesGallery editor={editor} current={target?.shapeStyle ?? ""} disabled={!ready} />
        <div className="flex flex-col justify-center gap-0.5">
          <SmallSplit
            label="Shape Fill"
            icon={<LineShapeFillIcon color={colors.fill} />}
            disabled={!ready}
            onClick={fillLast}
            menu={menu(ShapeFillMenu)}
          />
          <SmallSplit
            label="Shape Outline"
            icon={<LineShapeOutlineIcon color={colors.outline} />}
            disabled={!ready}
            onClick={outlineLast}
            menu={menu(ShapeOutlineMenu)}
          />
          <RibbonCommand size="small" label="Shape Effects" disabled={!ready} menu={menu(ShapeEffectsMenu)}>
            <ContextGlyph label="Shape Effects" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup
        label="WordArt Styles"
        name="wordart-styles"
        onLaunch={textual ? () => showPane("text-fill") : undefined}
        launchLabel="Format Text Effects"
      >
        <RibbonPopover
          label="Quick Styles"
          className="ribbon-command"
          disabled={!ready || !(textual || target?.name === "wordArt")}
          content={wordArtMenu}
        >
          <span className="ribbon-command-icon">
            <span className="wordart-quick-icon">A</span>
          </span>
          <span className="ribbon-command-label">Quick Styles</span>
        </RibbonPopover>
        <div className="flex flex-col justify-center gap-0.5">
          <SmallSplit
            label="Text Fill"
            icon={<TextColorGlyph color={colors.textFill} />}
            disabled={!textual}
            onClick={() => run({ textFill: colors.textFill })}
            menu={menu(TextFillMenu)}
          />
          <SmallSplit
            label="Text Outline"
            icon={<TextColorGlyph color={colors.textOutline} outline />}
            disabled={!textual}
            onClick={() => run({ textOutline: colors.textOutline })}
            menu={menu(TextOutlineMenu)}
          />
          <RibbonCommand size="small" label="Text Effects" disabled={!textual} menu={menu(TextEffectsMenu)}>
            <TextColorGlyph color="#4472c4" glow />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Text" name="text">
        <div className="flex flex-col justify-center gap-0.5">
          <RibbonCommand size="small" label="Text Direction" disabled={!textual} menu={menu(TextDirectionMenu)}>
            <ContextGlyph label="Text Direction" />
          </RibbonCommand>
          <RibbonCommand size="small" label="Align Text" disabled={!textual} menu={menu(AlignTextVerticalMenu)}>
            <LineCellAlignIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label={linkLabel}
            description={linkDescription}
            disabled={!textual}
            active={linking}
            onClick={link}
          >
            <ContextGlyph label={linkLabel} />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Accessibility" name="accessibility">
        <RibbonCommand label="Alt Text" disabled={!ready} onClick={() => editor && editAltText(editor)}>
          <ContextGlyph label="Alt Text" />
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
          <RibbonCommand size="small" label="Group" disabled={!editor} menu={menu(GroupMenu)}>
            <LineGroupIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Rotate" disabled={!ready} menu={menu(RotateObjectMenu)}>
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
          {heightField}
          {widthField}
        </div>
      </RibbonGroup>
      {iconLibrary}
    </div>
  )
}

/** A small split button: the action, and a menu from its arrow. */
export function SmallSplit({
  label,
  icon,
  disabled,
  onClick,
  menu,
}: {
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
  menu: (close: () => void) => ReactNode
}) {
  return (
    <RibbonSplit label={label} className="ribbon-side" disabled={disabled} onClick={onClick} menu={menu}>
      <span className="ribbon-side-icon">{icon}</span>
      <span className="ribbon-side-label">{label}</span>
    </RibbonSplit>
  )
}

/** The Insert Shapes gallery: three rows of shapes, scrolled with the arrows, and the whole list from More. */
function ShapesGallery({ editor }: { editor: Editor | null }) {
  const [row, setRow] = useState(0)
  const columns = 7
  const visibleRows = 3
  const rows = Math.ceil(SHAPE_NAMES.length / columns)
  const first = Math.min(row, Math.max(0, rows - visibleRows))
  const shown = SHAPE_NAMES.slice(first * columns, (first + visibleRows) * columns)
  return (
    <div className="ribbon-shapes-gallery">
      <div className="ribbon-shapes-grid">
        {shown.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name.replace(/-/g, " ")}
            title={name.replace(/-/g, " ")}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertShape(editor, name)}
          >
            <ShapeThumb name={name} size={16} />
          </button>
        ))}
      </div>
      <GalleryNav
        label="shapes"
        canUp={first > 0}
        canDown={first < rows - visibleRows}
        onUp={() => setRow(first - 1)}
        onDown={() => setRow(first + 1)}
        more={(close) => (
          <ShapesList
            onPick={(name) => {
              insertShape(editor, name)
              close()
            }}
          />
        )}
      />
    </div>
  )
}

/** The Shape Styles gallery: one row of styles (an intensity across the theme colours), its arrows and More. */
function StylesGallery({ editor, current, disabled }: { editor: Editor | null; current: string; disabled: boolean }) {
  const [row, setRow] = useState(() => styleRowOf(current))
  useEffect(() => {
    if (current) {
      setRow(styleRowOf(current))
    }
  }, [current])
  return (
    <div className={`ribbon-styles-gallery${disabled ? " is-disabled" : ""}`}>
      <ShapeStyleRow editor={editor} row={row} />
      <GalleryNav
        label="shape styles"
        canUp={row > 0}
        canDown={row < STYLE_ROWS.length - 1}
        onUp={() => setRow(row - 1)}
        onDown={() => setRow(row + 1)}
        more={(close) => <ShapeStylesMenu editor={editor} close={close} />}
      />
    </div>
  )
}

export function GalleryNav({
  label,
  canUp,
  canDown,
  onUp,
  onDown,
  more,
}: {
  label: string
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  more: (close: () => void) => ReactNode
}) {
  return (
    <div className="ribbon-gallery-nav">
      <RibbonHover label={`Previous ${label}`}>
        <button
          type="button"
          aria-label={`Previous ${label}`}
          aria-disabled={!canUp || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => canUp && onUp()}
        >
          <Arrow d="M1.6 5.2 4 2.8 6.4 5.2" />
        </button>
      </RibbonHover>
      <RibbonHover label={`Next ${label}`}>
        <button
          type="button"
          aria-label={`Next ${label}`}
          aria-disabled={!canDown || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => canDown && onDown()}
        >
          <Arrow d="M1.6 2.8 4 5.2 6.4 2.8" />
        </button>
      </RibbonHover>
      <RibbonPopover label={`More ${label}`} className="ribbon-gallery-more" content={more}>
        <Arrow d="M1 1.5h6M1.6 3.4 4 5.7 6.4 3.4" />
      </RibbonPopover>
    </div>
  )
}

function Arrow({ d }: { d: string }) {
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** WordArt's own presets, for a WordArt object. */
function WordArtPresets({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="grid grid-cols-6 gap-1 p-1">
      {TEXT_PRESETS.map((preset) => (
        <MenuButton
          key={preset.id}
          className="h-9 w-9 justify-center p-0 text-[18px]"
          onClick={() => {
            editor?.chain().focus().updateAttributes("wordArt", { preset: preset.id }).run()
            close()
          }}
        >
          <span style={presetCss(preset.css)}>A</span>
        </MenuButton>
      ))}
    </div>
  )
}

function presetCss(css: string) {
  const style: Record<string, string> = {}
  for (const part of css.split(";")) {
    const [key, value] = part.split(":")
    if (key && value) {
      style[key.trim().replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value.trim()
    }
  }
  return style
}

function TextColorGlyph({
  color,
  outline = false,
  glow = false,
}: {
  color: string
  outline?: boolean
  glow?: boolean
}) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill={outline ? "none" : "var(--icon-base-color)"}
        stroke={outline ? "var(--icon-base-color)" : glow ? color : "none"}
        strokeWidth={outline ? 0.8 : glow ? 1.6 : 0}
        paintOrder="stroke"
      >
        A
      </text>
      <rect x="2" y="13" width="12" height="2.2" fill={color} />
    </svg>
  )
}

/** Word's Size spinners: centimetres, up and down by 0.1. */
export function SizeSpinner({
  label,
  short,
  value,
  disabled,
  onCommit,
}: {
  label: string
  short: string
  value: number
  disabled: boolean
  onCommit: (cm: number) => void
}) {
  const [text, setText] = useState(value > 0 ? `${value.toFixed(2)} cm` : "")
  useEffect(() => {
    setText(value > 0 ? `${value.toFixed(2)} cm` : "")
  }, [value])
  const commit = (cm: number) => {
    if (cm > 0) {
      onCommit(Math.round(cm * 100) / 100)
    }
  }
  const step = (by: number) => commit((Number.parseFloat(text) || value) + by)
  return (
    <label className="size-spinner" title={label}>
      <span className="size-spinner-label">{short}:</span>
      <span className="size-spinner-box">
        <input
          aria-label={label}
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => commit(Number.parseFloat(text))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              step(event.key === "ArrowUp" ? 0.1 : -0.1)
            }
          }}
        />
        <span className="size-spinner-arrows">
          <button
            type="button"
            aria-label={`Increase ${label}`}
            disabled={disabled}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => step(0.1)}
          >
            <Arrow d="M1.6 5.2 4 2.8 6.4 5.2" />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            disabled={disabled}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => step(-0.1)}
          >
            <Arrow d="M1.6 2.8 4 5.2 6.4 2.8" />
          </button>
        </span>
      </span>
    </label>
  )
}
