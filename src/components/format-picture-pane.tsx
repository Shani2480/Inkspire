import {
  Effects,
  Field,
  Layout,
  NumberField,
  PaneIcon,
  Radio,
  Section,
  Select,
  ColorField,
} from "@/components/format-shape-pane"
import { useFormatShapePane } from "@/components/shape-menus"
import { useDocumentEditor } from "@/editor/document-editor"
import { selectedObject } from "@/editor/objects"
import { ARTISTIC_EFFECTS, BORDER_DASHES, RECOLORS } from "@/editor/picture-format"
import { cropFields, withCropField, type CropFields } from "@/editor/picture-crop-fields"
import { PX_PER_CM } from "@/editor/table-props"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { X } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { create } from "zustand"

type Attrs = Record<string, unknown>

export type PicturePaneSection = "fill" | "effects" | "layout" | "picture"

/** The Format Picture pane: open or not, and which tab it shows. */
export const useFormatPicturePane = create<{
  open: boolean
  section: PicturePaneSection
  show: (section?: PicturePaneSection) => void
  hide: () => void
}>((set) => ({
  open: false,
  section: "picture",
  show: (section = "picture") => {
    // One format pane at a time, as in Word.
    useFormatShapePane.getState().hide()
    set({ open: true, section })
  },
  hide: () => set({ open: false }),
}))

/** The selected picture's attributes and the size it is shown at, in pixels. */
function pictureTarget(editor: Editor | null) {
  const found = selectedObject(editor)
  if (!editor || found?.name !== "image") {
    return null
  }
  const attrs = found.attrs as Attrs
  let width = Number(attrs.width) || 0
  let height = Number(attrs.height) || 0
  if (!width || !height) {
    const dom = editor.view.nodeDOM(found.pos)
    const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
    const zoom = box && dom instanceof HTMLElement ? box.width / Math.max(1, dom.offsetWidth) || 1 : 1
    width ||= Math.round((box?.width ?? 0) / zoom)
    height ||= Math.round((box?.height ?? 0) / zoom)
  }
  return { attrs, width, height }
}

/**
 * Word's Format Picture pane, on the right: Fill & Line (the picture's border), Effects (shadow, reflection, glow,
 * soft edges, 3-D, artistic effects), Layout & Properties (alt text) and Picture (Corrections, Color, Transparency and
 * Crop). Each change shows at once and is one undo step.
 */
export function FormatPicturePane() {
  const open = useFormatPicturePane((state) => state.open)
  const section = useFormatPicturePane((state) => state.section)
  const show = useFormatPicturePane((state) => state.show)
  const hide = useFormatPicturePane((state) => state.hide)
  const editor = useDocumentEditor()
  const target = useEditorState({
    editor,
    selector: ({ editor: current }) => pictureTarget(current),
    equalityFn: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  })
  useEffect(
    () =>
      useFormatShapePane.subscribe((state) => {
        if (state.open) {
          useFormatPicturePane.getState().hide()
        }
      }),
    [],
  )
  if (!open) {
    return null
  }
  const set = (attrs: Attrs) => editor?.chain().updateObject(attrs).run()
  const tabs: { id: PicturePaneSection; label: string; icon: ReactNode }[] = [
    { id: "fill", label: "Fill & Line", icon: <PaneIcon kind="fill" /> },
    { id: "effects", label: "Effects", icon: <PaneIcon kind="effects" /> },
    { id: "layout", label: "Layout & Properties", icon: <PaneIcon kind="layout" /> },
    { id: "picture", label: "Picture", icon: <PictureTabIcon /> },
  ]
  return (
    <aside className="format-pane" aria-label="Format Picture">
      <header className="format-pane-title">
        <span>Format Picture</span>
        <button type="button" aria-label="Close Format Picture" onClick={hide}>
          <X className="size-4" />
        </button>
      </header>
      <div className="format-pane-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            title={tab.label}
            aria-selected={section === tab.id}
            onClick={() => show(tab.id)}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      <div className="format-pane-body">
        {!target || !editor ? (
          <p className="format-pane-empty">Select a picture to format it.</p>
        ) : section === "fill" ? (
          <PictureLine attrs={target.attrs} set={set} />
        ) : section === "effects" ? (
          <>
            <Effects attrs={target.attrs} set={set} />
            <Section title="Artistic Effects" start={false}>
              <Select
                label="Effect"
                value={String(target.attrs.artistic || "")}
                options={ARTISTIC_EFFECTS.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(next) => set({ artistic: next })}
              />
            </Section>
          </>
        ) : section === "layout" ? (
          <Layout attrs={target.attrs} textBox={false} set={set} editor={editor} />
        ) : (
          <PictureOptions attrs={target.attrs} width={target.width} height={target.height} set={set} />
        )}
      </div>
    </aside>
  )
}

/** Fill & Line for a picture: its border (Word's Line). */
function PictureLine({ attrs, set }: { attrs: Attrs; set: (attrs: Attrs) => void }) {
  const border = String(attrs.border || "")
  return (
    <Section title="Line">
      <Radio name="picture-line" label="No line" checked={!border} onChange={() => set({ border: "" })} />
      <Radio
        name="picture-line"
        label="Solid line"
        checked={Boolean(border)}
        onChange={() => set({ border: border || "#4472c4", borderWidth: Number(attrs.borderWidth) || 0.75 })}
      />
      {border ? (
        <>
          <ColorField label="Color" color={border} onPick={(color) => set({ border: color })} />
          <NumberField
            label="Width"
            unit="pt"
            step={0.25}
            max={20}
            value={Number(attrs.borderWidth) || 0.75}
            onChange={(pt) => set({ borderWidth: pt })}
          />
          <Select
            label="Dash type"
            value={String(attrs.borderDash || "")}
            options={BORDER_DASHES.map((dash) => ({ value: dash.id, label: dash.label }))}
            onChange={(next) => set({ borderDash: next })}
          />
        </>
      ) : null}
    </Section>
  )
}

/** The Picture tab: Picture Corrections, Picture Color, Picture Transparency and Crop. */
function PictureOptions({
  attrs,
  width,
  height,
  set,
}: {
  attrs: Attrs
  width: number
  height: number
  set: (attrs: Attrs) => void
}) {
  const saturation = attrs.saturation === undefined ? 100 : Number(attrs.saturation)
  const fields = cropFields(width, height, attrs)
  const cm = (px: number) => px / PX_PER_CM
  const cropField = (key: keyof CropFields, label: string, signed = false) => (
    <NumberField
      key={key}
      label={label}
      unit="cm"
      step={0.1}
      min={signed ? -100 : 0.05}
      max={100}
      value={cm(fields[key])}
      onChange={(value) => set(withCropField(fields, key, value * PX_PER_CM))}
    />
  )
  return (
    <>
      <Section title="Picture Corrections">
        <SliderField
          label="Brightness"
          value={Number(attrs.brightness) || 0}
          min={-100}
          max={100}
          onChange={(value) => set({ brightness: value })}
        />
        <SliderField
          label="Contrast"
          value={Number(attrs.contrast) || 0}
          min={-100}
          max={100}
          onChange={(value) => set({ contrast: value })}
        />
        <ResetButton onClick={() => set({ brightness: 0, contrast: 0 })} />
      </Section>
      <Section title="Picture Color">
        <SliderField
          label="Saturation"
          value={Number.isFinite(saturation) ? saturation : 100}
          min={0}
          max={400}
          onChange={(value) => set({ saturation: value })}
        />
        <Select
          label="Recolor"
          value={String(attrs.recolor || "")}
          options={RECOLORS.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(next) => set({ recolor: next })}
        />
        <ResetButton onClick={() => set({ saturation: 100, recolor: "" })} />
      </Section>
      <Section title="Picture Transparency">
        <SliderField
          label="Transparency"
          value={Number(attrs.transparency) || 0}
          min={0}
          max={100}
          onChange={(value) => set({ transparency: value })}
        />
      </Section>
      <Section title="Crop">
        <p className="format-pane-subhead">Picture position</p>
        {cropField("pictureWidth", "Width")}
        {cropField("pictureHeight", "Height")}
        {cropField("offsetX", "Offset X", true)}
        {cropField("offsetY", "Offset Y", true)}
        <p className="format-pane-subhead">Crop position</p>
        {cropField("cropWidth", "Width")}
        {cropField("cropHeight", "Height")}
        {cropField("cropLeft", "Left", true)}
        {cropField("cropTop", "Top", true)}
      </Section>
    </>
  )
}

/** Word's slider with its spin box beside it, in percent. */
function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)))
  return (
    <div className="format-pane-slider">
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <span className="format-pane-number">
        <input
          type="number"
          aria-label={`${label} (%)`}
          min={min}
          max={max}
          value={Math.round(value)}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) {
              onChange(clamp(next))
            }
          }}
        />
        <span>%</span>
      </span>
    </div>
  )
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Field label="">
      <button type="button" className="format-pane-button" onClick={onClick}>
        Reset
      </button>
    </Field>
  )
}

function PictureTabIcon() {
  const base = { stroke: "var(--icon-base-color)", strokeWidth: 1.2, strokeLinejoin: "round", fill: "none" } as const
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="0.8" {...base} />
      <path d="m3.5 11.5 3-3.5 2.2 2.4 1.6-1.6 2.2 2.7" {...base} stroke="var(--icon-accent-color)" />
      <circle cx="10.6" cy="5.9" r="1" fill="var(--icon-accent-color)" />
    </svg>
  )
}
