import { openColorDialog } from "@/components/color-dialog"
import { useObjectPreview } from "@/components/object-preview-hook"
import {
  MenuFlyout,
  MenuHeading,
  MenuRow,
  MenuSeparator,
  Palette,
  PreviewRow,
  PreviewTile,
  ShapeThumb,
  ShapesList,
  update,
} from "@/components/shape-menus"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import {
  ARTISTIC_EFFECTS,
  BORDER_DASHES,
  BORDER_WEIGHTS,
  COMPRESS_TARGETS,
  CORRECTION_STEPS,
  PICTURE_STYLE_GALLERY,
  RECOLORS,
  SATURATIONS,
  TRANSPARENCIES,
  pictureFilter,
  targetPixels,
} from "@/editor/picture-format"
import { effectStyle } from "@/editor/shape-style"
import { selectedObject } from "@/editor/objects"
import {
  ASPECT_RATIOS,
  applyCrop,
  aspectRatioCrop,
  cropOf,
  cropPicture,
  fillCrop,
  fitCrop,
  useCropMode,
  wholeSize,
} from "@/editor/picture-crop"
import { croppableShape, frameForVariant, frameVariant, shapeMask } from "@/editor/picture-shape"
import { NodeSelection } from "@tiptap/pm/state"
import { flattenCropped, loadImage } from "@/editor/picture-flatten"
import type { Editor } from "@tiptap/core"
import { useState, type CSSProperties } from "react"
import { create } from "zustand"

/**
 * The menus and the dialog of the Picture Format tab: Corrections, Color, Artistic Effects, Transparency, the
 * style gallery, Picture Border and Compress Pictures. Each choice is drawn on the picture itself while the pointer is
 * over it (as Word's live preview) and each tile shows the picture with that choice.
 */

type MenuProps = { editor: Editor | null; close: () => void }
type Attrs = Record<string, unknown>

function pictureOf(editor: Editor | null) {
  const found = selectedObject(editor)
  return found?.name === "image" ? found.attrs : ({} as Attrs)
}

/** The picture as a small tile with `attrs` applied. */
function Thumb({ editor, attrs, width = 56 }: { editor: Editor | null; attrs: Attrs; width?: number }) {
  const source = pictureOf(editor)
  const merged = { ...source, ...attrs }
  const effects = effectStyle(merged)
  const frame = String(merged.frame || "")
  const border = String(merged.border || "")
  const style: CSSProperties = {
    width,
    height: Math.round(width * 0.72),
    objectFit: "cover",
    filter: [pictureFilter(merged), effects.filter].filter(Boolean).join(" "),
    maskImage: shapeMask(frame) ?? undefined,
    maskSize: "100% 100%",
    opacity: Number(merged.transparency) ? 1 - Number(merged.transparency) / 100 : undefined,
    borderRadius: frame === "oval" ? "50%" : frame === "rounded" ? "12%" : undefined,
    outline: border ? `${Math.max(1, Math.min(4, Number(merged.borderWidth) || 2))}px solid ${border}` : undefined,
    transform: effects.transform || undefined,
  }
  return <img src={String(source.src || "")} alt="" draggable={false} style={style} />
}

function Tiles({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <div className="shape-tiles" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
      {children}
    </div>
  )
}

const signed = (value: number) => (value > 0 ? `+${value}%` : `${value}%`)

/** Brightness and contrast, five steps each, as Word's Corrections gallery. */
export function PictureCorrectionsMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <MenuHeading>Brightness/Contrast</MenuHeading>
      <Tiles columns={CORRECTION_STEPS.length}>
        {CORRECTION_STEPS.flatMap((brightness) =>
          CORRECTION_STEPS.map((contrast) => (
            <PreviewTile
              key={`${brightness}:${contrast}`}
              label={`Brightness: ${signed(brightness)} Contrast: ${signed(contrast)}`}
              className="shape-effect-tile picture-tile"
              selected={(Number(attrs.brightness) || 0) === brightness && (Number(attrs.contrast) || 0) === contrast}
              preview={preview}
              run={update({ brightness, contrast })}
              close={close}
            >
              <Thumb editor={editor} attrs={{ brightness, contrast }} />
            </PreviewTile>
          )),
        )}
      </Tiles>
      <MenuSeparator />
      <MenuRow
        onEnter={() => preview?.restore()}
        onClick={() => {
          preview?.commit(update({ brightness: 0, contrast: 0 }))
          close()
        }}
      >
        Reset Corrections
      </MenuRow>
    </div>
  )
}

/** Color Saturation and Recolor. */
export function PictureColorMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  const saturation = attrs.saturation === undefined ? 100 : Number(attrs.saturation)
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <MenuHeading>Color Saturation</MenuHeading>
      <Tiles columns={SATURATIONS.length}>
        {SATURATIONS.map((value) => (
          <PreviewTile
            key={value}
            label={`Saturation: ${value}%`}
            className="shape-effect-tile picture-tile"
            selected={saturation === value}
            preview={preview}
            run={update({ saturation: value })}
            close={close}
          >
            <Thumb editor={editor} attrs={{ saturation: value }} />
          </PreviewTile>
        ))}
      </Tiles>
      <MenuHeading>Recolor</MenuHeading>
      <Tiles columns={RECOLORS.length}>
        {RECOLORS.map((item) => (
          <PreviewTile
            key={item.id || "none"}
            label={item.label}
            className="shape-effect-tile picture-tile"
            selected={String(attrs.recolor || "") === item.id}
            preview={preview}
            run={update({ recolor: item.id })}
            close={close}
          >
            <Thumb editor={editor} attrs={{ recolor: item.id }} />
          </PreviewTile>
        ))}
      </Tiles>
    </div>
  )
}

export function PictureArtisticMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <MenuHeading>Artistic Effects</MenuHeading>
      <Tiles columns={ARTISTIC_EFFECTS.length}>
        {ARTISTIC_EFFECTS.map((item) => (
          <PreviewTile
            key={item.id || "none"}
            label={item.label}
            className="shape-effect-tile picture-tile"
            selected={String(attrs.artistic || "") === item.id}
            preview={preview}
            run={update({ artistic: item.id })}
            close={close}
          >
            <Thumb editor={editor} attrs={{ artistic: item.id }} />
          </PreviewTile>
        ))}
      </Tiles>
    </div>
  )
}

export function PictureTransparencyMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <MenuHeading>Picture Transparency</MenuHeading>
      <Tiles columns={4}>
        {TRANSPARENCIES.map((value) => (
          <PreviewTile
            key={value}
            label={value === 0 ? "Transparency: 0%" : `Transparency: ${value}%`}
            className="shape-effect-tile picture-tile"
            selected={(Number(attrs.transparency) || 0) === value}
            preview={preview}
            run={update({ transparency: value })}
            close={close}
          >
            <Thumb editor={editor} attrs={{ transparency: value }} />
          </PreviewTile>
        ))}
      </Tiles>
    </div>
  )
}

/** Word's Picture Styles gallery as a menu (the ribbon shows the same styles in its gallery row). */
export function PictureStyleGallery({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  const active = (style: (typeof PICTURE_STYLE_GALLERY)[number]) =>
    Object.entries(style.attrs).every(([key, value]) => (attrs[key] ?? "") === value || (!attrs[key] && !value))
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Tiles columns={4}>
        {PICTURE_STYLE_GALLERY.map((style) => (
          <PreviewTile
            key={style.id}
            label={style.label}
            className="shape-effect-tile picture-tile"
            selected={active(style)}
            preview={preview}
            run={update(style.attrs)}
            close={close}
          >
            <Thumb editor={editor} attrs={style.attrs} />
          </PreviewTile>
        ))}
      </Tiles>
    </div>
  )
}

/** Picture Border: colour, weight and dashes. */
export function PictureBorderMenu({ editor, close }: MenuProps) {
  const preview = useObjectPreview(editor)
  const attrs = pictureOf(editor)
  const border = String(attrs.border || "")
  const width = Number(attrs.borderWidth) || 0
  return (
    <div className="shape-menu" onMouseLeave={() => preview?.restore()}>
      <Palette preview={preview} current={border} close={close} apply={(color) => ({ border: color })} />
      <MenuSeparator />
      <MenuRow
        checked={!border}
        onEnter={() => preview?.preview(update({ border: "" }))}
        onClick={() => {
          preview?.commit(update({ border: "" }))
          close()
        }}
      >
        No Outline
      </MenuRow>
      <MenuRow
        onEnter={() => preview?.restore()}
        onClick={() => {
          close()
          openColorDialog(border || "#2f5496", (color) => editor?.chain().focus().updateObject({ border: color }).run())
        }}
      >
        More Outline Colors…
      </MenuRow>
      <MenuFlyout label="Weight" onEnter={() => preview?.restore()} disabled={!border}>
        <div className="shape-menu">
          {BORDER_WEIGHTS.map((pt) => (
            <PreviewRow
              key={pt}
              preview={preview}
              run={update({ borderWidth: pt })}
              close={close}
              checked={width === pt}
            >
              <span className="flex w-36 items-center gap-2">
                <span className="w-9 text-right">{pt} pt</span>
                <span className="flex-1 bg-current" style={{ height: Math.max(1, (pt * 4) / 3) }} />
              </span>
            </PreviewRow>
          ))}
        </div>
      </MenuFlyout>
      <MenuFlyout label="Dashes" onEnter={() => preview?.restore()} disabled={!border}>
        <div className="shape-menu">
          {BORDER_DASHES.map((dash) => (
            <PreviewRow
              key={dash.id || "solid"}
              preview={preview}
              run={update({ borderDash: dash.id })}
              close={close}
              checked={String(attrs.borderDash || "") === dash.id}
              title={dash.label}
            >
              <svg width="120" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="120"
                  y2="3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={dash.css === "dotted" ? "2 3" : dash.css === "dashed" ? "8 4" : undefined}
                />
              </svg>
            </PreviewRow>
          ))}
        </div>
      </MenuFlyout>
    </div>
  )
}

// --- Compress Pictures ------------------------------------------------------------------------------------------

export const useCompressDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

/**
 * The picture's pixels reduced to `ppi` for the size it is shown at. A picture already at or under that resolution
 * is left alone (null), so compressing never makes one larger or softer.
 */
export async function compressedSource(src: string, displayWidth: number, displayHeight: number, ppi: number) {
  const image = await loadImage(src)
  const target = targetPixels(displayWidth, displayHeight, ppi)
  if (image.naturalWidth <= target.width) {
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(image, 0, 0, target.width, target.height)
  // A PNG stays one (it may be transparent); anything else becomes a JPEG.
  return src.startsWith("data:image/png") ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85)
}

export function CompressDialog({ editor }: { editor: Editor | null }) {
  const open = useCompressDialog((state) => state.open)
  const hide = useCompressDialog((state) => state.hide)
  const [target, setTarget] = useState<(typeof COMPRESS_TARGETS)[number]["id"]>("print")
  const [message, setMessage] = useState("")
  const [deleteCropped, setDeleteCropped] = useState(false)
  const [onlyThis, setOnlyThis] = useState(true)
  if (!open || !editor) {
    return null
  }
  const run = async () => {
    const found = selectedObject(editor)
    if (found?.name !== "image") {
      if (deleteCropped && !onlyThis) {
        await flattenCropped(editor, "all")
      }
      hide()
      return
    }
    const ppi = COMPRESS_TARGETS.find((item) => item.id === target)!.ppi
    try {
      // Cropped away pixels go first (deliberately, 21.47), then the rest is reduced for the size it shows at.
      const flattened = deleteCropped ? await flattenCropped(editor, onlyThis ? "selected" : "all") : 0
      const current = selectedObject(editor)
      // The shown size is the part that shows; the picture itself is larger by what is cropped away.
      const whole = wholeSize(
        Number(current?.attrs.width) || 320,
        Number(current?.attrs.height) || 240,
        cropOf(current?.attrs ?? {}),
      )
      const next = await compressedSource(String(current?.attrs.src || ""), whole.width, whole.height, ppi)
      if (next) {
        editor.chain().focus().updateAttributes("image", { src: next }).run()
        hide()
      } else if (flattened) {
        hide()
      } else {
        setMessage("The picture is already at or below this resolution.")
      }
    } catch (problem) {
      setMessage(String(problem instanceof Error ? problem.message : problem))
    }
  }
  return (
    <DialogFrame title="Compress Pictures" width={440} onClose={hide} onSubmit={() => void run()}>
      <fieldset className="grid gap-2 text-xs">
        <legend className="mb-1 font-semibold">Resolution</legend>
        {COMPRESS_TARGETS.map((item) => (
          <label key={item.id} className="flex items-start gap-2">
            <input type="radio" name="compress" checked={target === item.id} onChange={() => setTarget(item.id)} />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-3 grid gap-2 text-xs">
        <legend className="mb-1 font-semibold">Compression options</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={onlyThis} onChange={(event) => setOnlyThis(event.target.checked)} />
          <span>Apply only to this picture</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={deleteCropped} onChange={(event) => setDeleteCropped(event.target.checked)} />
          <span>Delete cropped areas of pictures</span>
        </label>
        {deleteCropped ? (
          <p className="text-[var(--dlg-muted)]">
            This permanently removes the hidden parts. Undo works until the document is saved; after that the crop
            cannot be changed back.
          </p>
        ) : null}
      </fieldset>
      {message ? (
        <p role="alert" className="mt-2 text-xs text-[var(--dlg-muted)]">
          {message}
        </p>
      ) : null}
      <DialogButtons submit onCancel={hide} />
    </DialogFrame>
  )
}

/**
 * Word's Crop menu (Picture Format → Size): Crop, Crop to Shape, Aspect Ratio, Fill and Fit. Crop to Shape changes
 * the picture's outline at once; the others show their crop in crop mode, to be adjusted and applied.
 */
export function CropMenu({ editor, close }: MenuProps) {
  const picture = selectedObject(editor)
  const ready = picture?.name === "image"
  const frame = ready ? String(picture.attrs.frame || "") : ""
  const cropWith = (change: Parameters<typeof cropPicture>[2]) => {
    const selection = editor?.state.selection
    if (editor && selection instanceof NodeSelection) {
      cropPicture(editor.view, selection.from, change)
    }
    close()
  }
  return (
    <div className="flex w-56 flex-col">
      <MenuRow
        disabled={!ready}
        onClick={() => {
          if (useCropMode.getState().active) {
            applyCrop()
          } else {
            useCropMode.getState().set(true)
          }
          close()
        }}
      >
        Crop
      </MenuRow>
      <MenuFlyout label="Crop to Shape" icon={<ShapeThumb name={frameVariant(frame)} size={16} />} disabled={!ready}>
        <ShapesList
          current={frameVariant(frame)}
          only={croppableShape}
          onPick={(name) => {
            editor?.chain().focus().updateAttributes("image", { frame: frameForVariant(name) }).run()
            close()
          }}
        />
      </MenuFlyout>
      <MenuFlyout label="Aspect Ratio" disabled={!ready}>
        <div className="flex w-36 flex-col">
          {ASPECT_RATIOS.map((group) => (
            <div key={group.group} className="flex flex-col">
              <MenuHeading>{group.group}</MenuHeading>
              {group.items.map((item) => (
                <MenuRow
                  key={item.label}
                  onClick={() => cropWith((width, height, crop) => aspectRatioCrop(width, height, crop, item.ratio))}
                >
                  {item.label}
                </MenuRow>
              ))}
            </div>
          ))}
        </div>
      </MenuFlyout>
      <MenuSeparator />
      <MenuRow disabled={!ready} title="Fill the frame with the picture, cropping what overhangs" onClick={() => cropWith(fillCrop)}>
        Fill
      </MenuRow>
      <MenuRow disabled={!ready} title="Show all of the picture inside its frame" onClick={() => cropWith(fitCrop)}>
        Fit
      </MenuRow>
    </div>
  )
}
