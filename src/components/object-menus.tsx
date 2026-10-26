import { PictureStyleGallery } from "@/components/picture-menus"
import { PICTURE_STYLE_GALLERY } from "@/editor/picture-format"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { askText } from "@/components/text-prompt"
import { HIGHLIGHTER_COLORS, PEN_COLORS, activeColor, activeWidthMm, useDrawStore } from "@/editor/drawing"
import { ICON_NAMES, iconMarkup } from "@/editor/insert-blocks"
import { selectedObject } from "@/editor/objects"
import { SMARTART_LAYOUTS } from "@/editor/smartart"
import { MODEL_SCENES, modelScene } from "@/editor/model-scenes"
import { MODEL_VIEWS, viewPose, viewSourceFor } from "@/editor/model-views"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"

export { ShapeFillMenu, ShapeOutlineMenu, ShapeStylesMenu } from "@/components/shape-menus"
export { AddChartElementMenu as ChartElementsMenu, ChartStylesMenu } from "@/components/chart-menus"

/**
 * The object menus the ribbon's tabs and the floating object bar share (20.10), so the two never disagree.
 */

/** A flat model picture (not a 3-D model) turns in the page for each view. */
const FLAT_TURNS = [0, 180, 90, 270, 0, 180, 45, 315, 135, 225, 30, 330]
const SMARTART_COLORS = ["#0f6cbd", "#107c10", "#c45911", "#5b2c8e", "#d13438", "#242424"]
const STROKE_MM = [0.25, 0.5, 1, 2, 4, 6]

type MenuProps = { editor: Editor | null; close: () => void }

/** The shape, icon, WordArt or text box being formatted: selected, or holding the cursor. */
export function shapeNode(editor: Editor) {
  const selection = editor.state.selection
  if (
    selection instanceof NodeSelection &&
    (selection.node.type.name === "figure" ||
      selection.node.type.name === "textBox" ||
      selection.node.type.name === "wordArt")
  ) {
    return { pos: selection.from, name: selection.node.type.name, attrs: selection.node.attrs }
  }
  const $from = selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "textBox" || node.type.name === "wordArt") {
      return { pos: $from.before(depth), name: node.type.name, attrs: node.attrs }
    }
  }
  return null
}

/** Alt Text for whichever object is selected. */
export function editAltText(editor: Editor) {
  const found = selectedObject(editor)
  if (!found || !("alt" in found.attrs)) {
    return
  }
  void askText({
    title: "Alt Text",
    label: "Describe this object for people who cannot see it:",
    multiline: true,
    value: String(found.attrs.alt || ""),
  }).then((alt) => {
    if (alt != null) {
      editor.chain().focus().updateAttributes(found.name, { alt }).run()
    }
  })
}

function Swatches({
  label,
  colors,
  close,
  onPick,
}: {
  label: string
  colors: string[]
  close: () => void
  onPick: (color: string) => void
}) {
  return (
    <div className="flex gap-1 p-1" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`${label} ${color}`}
          title={color}
          className="size-6 rounded border border-black/20"
          style={{ background: color }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onPick(color)
            close()
          }}
        />
      ))}
    </div>
  )
}

/** The first picture styles as a row of chips in the ribbon; the whole gallery is in the Picture Styles menu. */
export function PictureStyleRow({ editor, onPick }: { editor: Editor | null; onPick?: () => void }) {
  const attrs = selectedObject(editor)?.attrs ?? {}
  return (
    <div className="flex items-center gap-1 px-1">
      {PICTURE_STYLE_GALLERY.slice(0, 6).map((style) => (
        <button
          key={style.id}
          type="button"
          aria-label={style.label}
          title={style.label}
          className={`picture-style${Object.entries(style.attrs).every(([key, value]) => (attrs[key] || "") === (value || "")) ? " is-on" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor?.chain().focus().updateObject(style.attrs).run()
            onPick?.()
          }}
        >
          <span
            style={{
              outline: style.attrs.border ? `2px solid ${String(style.attrs.border)}` : "1px solid #d0d0d0",
              boxShadow: style.attrs.shadow ? "2px 3px 4px rgba(0,0,0,.25)" : "none",
              borderRadius: style.attrs.frame === "oval" ? "50%" : style.attrs.frame === "rounded" ? "4px" : undefined,
            }}
          />
        </button>
      ))}
    </div>
  )
}

export function PictureStylesMenu({ editor, close }: MenuProps) {
  return <PictureStyleGallery editor={editor} close={close} />
}

export function RotateMenu({ editor, close }: MenuProps) {
  const run = (degrees: number | "reset") => {
    const found = selectedObject(editor)
    if (!editor || !found) {
      return
    }
    if (degrees === "reset") {
      editor.chain().focus().updateAttributes(found.name, { rotate: 0 }).run()
    } else {
      editor.chain().focus().setObjectRotate(degrees).run()
    }
    close()
  }
  return (
    <>
      <MenuButton onClick={() => run(90)}>Rotate Right 90°</MenuButton>
      <MenuButton onClick={() => run(-90)}>Rotate Left 90°</MenuButton>
      <MenuButton onClick={() => run("reset")}>Reset Rotation</MenuButton>
    </>
  )
}

export function AlignTextMenu({ editor, close }: MenuProps) {
  const align = (value: "left" | "center" | "right") => {
    editor?.chain().focus().setTextAlign(value).run()
    close()
  }
  return (
    <>
      <MenuButton onClick={() => align("left")}>Align Left</MenuButton>
      <MenuButton onClick={() => align("center")}>Center</MenuButton>
      <MenuButton onClick={() => align("right")}>Align Right</MenuButton>
    </>
  )
}

export function ChangeIconMenu({ editor, close, onMore }: MenuProps & { onMore?: () => void }) {
  const current = String(selectedObject(editor)?.attrs.variant || "")
  return (
    <div className="flex w-56 flex-col">
      <div className="grid max-h-48 grid-cols-4 gap-1 overflow-auto p-1">
        {ICON_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={current === name}
            className={`flex h-9 items-center justify-center rounded hover:bg-[var(--app-hover)]${current === name ? " bg-[var(--app-hover)] ring-1 ring-[#0f6cbd]" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor?.chain().focus().updateAttributes("figure", { variant: name, kind: "icon", src: "" }).run()
              close()
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: iconMarkup(name) }}
            />
          </button>
        ))}
      </div>
      {onMore ? (
        <MenuButton
          onClick={() => {
            onMore()
            close()
          }}
        >
          Online Icons…
        </MenuButton>
      ) : null}
    </div>
  )
}

/**
 * 3D Model Views (22.15): Word's named views, each tile the model as the viewer draws it from that side (until the
 * model has loaded, its picture tilted that way). A flat model picture turns in the page instead.
 */
export function ModelViewTiles({
  editor,
  start = 0,
  count = MODEL_VIEWS.length,
  onPick,
}: {
  editor: Editor | null
  start?: number
  count?: number
  onPick?: () => void
}) {
  const found = selectedObject(editor)
  const threeD = found?.name === "threeDModel"
  const picture = String(found?.attrs.snapshot || found?.attrs.src || "")
  const variant = String(found?.attrs.preset || found?.attrs.variant || "cube")
  const source = threeD && editor && found ? viewSourceFor(editor.view.nodeDOM(found.pos) as Element | null) : null
  const pictures = source?.pictures() ?? null
  return (
    <>
      {MODEL_VIEWS.slice(start, start + count).map((view, offset) => {
        const index = start + offset
        const drawn = pictures?.[index]
        const turn = FLAT_TURNS[index % FLAT_TURNS.length]
        const tilt = threeD
          ? `perspective(80px) rotateY(${view.yaw}rad) rotateX(${view.pitch}rad)`
          : `rotate(${turn}deg)`
        return (
          <button
            key={view.name}
            type="button"
            title={view.name}
            aria-label={view.name}
            className="model-view"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (editor && found) {
                const pose = viewPose(view, source?.camera())
                editor
                  .chain()
                  .focus()
                  .updateAttributes(found.name, threeD ? pose : { rotate: turn })
                  .run()
              }
              onPick?.()
            }}
          >
            {drawn ? (
              <img src={drawn} alt="" />
            ) : picture ? (
              <img src={picture} alt="" style={{ transform: tilt }} />
            ) : (
              <span style={{ transform: tilt }}>{variant.slice(0, 1).toUpperCase()}</span>
            )}
          </button>
        )
      })}
    </>
  )
}

export function ModelViewsMenu({ editor, close }: MenuProps) {
  return (
    <div className="model-view-grid p-1" role="group" aria-label="3D Model Views">
      <ModelViewTiles editor={editor} onPick={close} />
    </div>
  )
}

/** Play 3D scenes (22.15): the motion the model plays in the document. */
export function ModelScenesMenu({ editor, close }: MenuProps) {
  const current = modelScene(selectedObject(editor)?.attrs.scene)
  return (
    <div role="group" aria-label="Scenes">
      {MODEL_SCENES.map((scene) => (
        <MenuButton
          key={scene.id}
          selected={current === scene.id}
          onClick={() => {
            editor?.chain().focus().updateAttributes("threeDModel", { scene: scene.id }).run()
            close()
          }}
        >
          {scene.label}
        </MenuButton>
      ))}
    </div>
  )
}

export function ModelResetMenu({ editor, close }: MenuProps) {
  const reset = (size: boolean) => {
    const found = selectedObject(editor)
    if (editor && found) {
      editor
        .chain()
        .focus()
        .updateAttributes(found.name, {
          ...(found.name === "threeDModel" ? { yaw: 0.45, pitch: 0.3 } : {}),
          rotate: 0,
          ...(size ? { width: 0, height: 0 } : {}),
        })
        .run()
    }
    close()
  }
  return (
    <>
      <MenuButton onClick={() => reset(false)}>Reset 3D Model</MenuButton>
      <MenuButton onClick={() => reset(true)}>Reset 3D Model and Size</MenuButton>
    </>
  )
}

function smartArtLabels(editor: Editor | null) {
  try {
    const labels = JSON.parse(String(selectedObject(editor)?.attrs.labels || "[]")) as unknown
    return Array.isArray(labels) ? labels.map(String) : []
  } catch {
    return []
  }
}

export function addSmartArtShape(editor: Editor | null, after = true) {
  const labels = smartArtLabels(editor)
  const next = after ? [...labels, "Text"] : ["Text", ...labels]
  editor
    ?.chain()
    .focus()
    .updateAttributes("smartArt", { labels: JSON.stringify(next) })
    .run()
}

export function SmartArtAddShapeMenu({ editor, close }: MenuProps) {
  return (
    <>
      <MenuButton
        onClick={() => {
          addSmartArtShape(editor, true)
          close()
        }}
      >
        Add Shape After
      </MenuButton>
      <MenuButton
        onClick={() => {
          addSmartArtShape(editor, false)
          close()
        }}
      >
        Add Shape Before
      </MenuButton>
    </>
  )
}

export function SmartArtColorsMenu({ editor, close }: MenuProps) {
  return (
    <Swatches
      label="SmartArt colors"
      colors={SMARTART_COLORS}
      close={close}
      onPick={(accent) => editor?.chain().focus().updateAttributes("smartArt", { accent }).run()}
    />
  )
}

export function SmartArtLayoutsMenu({ editor, close }: MenuProps) {
  const current = String(selectedObject(editor)?.attrs.layout || "list")
  return (
    <>
      {SMARTART_LAYOUTS.map((layout) => (
        <MenuButton
          key={layout.id}
          selected={current === layout.id}
          onClick={() => {
            editor?.chain().focus().updateAttributes("smartArt", { layout: layout.id }).run()
            close()
          }}
        >
          {layout.label}
        </MenuButton>
      ))}
    </>
  )
}

export function DrawColorMenu({ close }: { close: () => void }) {
  const tool = useDrawStore((state) => state.tool)
  const setColor = useDrawStore((state) => state.setColor)
  return (
    <Swatches
      label={tool === "highlighter" ? "Highlighter color" : "Pen color"}
      colors={tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS}
      close={close}
      onPick={setColor}
    />
  )
}

export function DrawThicknessMenu({ close }: { close: () => void }) {
  const widthMm = useDrawStore((state) => activeWidthMm(state))
  const color = useDrawStore((state) => activeColor(state))
  const setWidthMm = useDrawStore((state) => state.setWidthMm)
  return (
    <>
      {STROKE_MM.map((mm) => (
        <MenuButton
          key={mm}
          selected={widthMm === mm}
          onClick={() => {
            setWidthMm(mm)
            close()
          }}
        >
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-10 rounded-full"
              style={{ height: Math.max(1, Math.min(10, mm * 2)), background: color }}
            />
            {mm} mm
          </span>
        </MenuButton>
      ))}
    </>
  )
}
