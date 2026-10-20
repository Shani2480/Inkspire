import { openColorDialog } from "@/components/color-dialog"
import { shapeNode } from "@/components/object-menus"
import { LINE_SHAPES, useFormatShapePane, type PaneSection } from "@/components/shape-menus"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  BEVELS,
  GLOW_SIZES,
  GRADIENT_DIRECTIONS,
  OUTLINE_DASHES,
  REFLECTIONS,
  ROTATIONS_3D,
  SHADOWS,
  SOFT_EDGES,
  TEXTURES,
  TEXT_DIRECTIONS,
  TEXT_EFFECTS,
} from "@/editor/shape-style"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { ChevronDown, ChevronRight, X } from "lucide-react"
import { useState, type ReactNode } from "react"

type Attrs = Record<string, unknown>

const ARROW_HEADS = ["", "arrow", "open", "stealth", "diamond", "oval"]
const ARROW_NAMES: Record<string, string> = {
  "": "None",
  arrow: "Arrow",
  open: "Open Arrow",
  stealth: "Stealth Arrow",
  diamond: "Diamond Arrow",
  oval: "Oval Arrow",
}

/**
 * Word's Format Shape pane (20.9), on the right: Shape Options (Fill & Line, Effects, Layout & Properties) and, for
 * a text box, Text Options (Text Fill & Outline, Text Effects, Text Box). Each change is live and one undo step.
 */
export function FormatShapePane() {
  const open = useFormatShapePane((state) => state.open)
  const section = useFormatShapePane((state) => state.section)
  const show = useFormatShapePane((state) => state.show)
  const hide = useFormatShapePane((state) => state.hide)
  const editor = useDocumentEditor()
  const target = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const found = current ? shapeNode(current) : null
      return found && found.name !== "wordArt" ? { name: found.name, attrs: { ...found.attrs } as Attrs } : null
    },
    equalityFn: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  })
  if (!open) {
    return null
  }
  const textBox = target?.name === "textBox"
  const text = section.startsWith("text")
  const set = (attrs: Attrs) => editor?.chain().updateObject(attrs).run()
  const tabs: { id: PaneSection; label: string; icon: ReactNode }[] = text
    ? [
        { id: "text-fill", label: "Text Fill & Outline", icon: <PaneIcon kind="text-fill" /> },
        { id: "text-effects", label: "Text Effects", icon: <PaneIcon kind="effects" /> },
        { id: "text-box", label: "Layout & Properties", icon: <PaneIcon kind="layout" /> },
      ]
    : [
        { id: "fill", label: "Fill & Line", icon: <PaneIcon kind="fill" /> },
        { id: "effects", label: "Effects", icon: <PaneIcon kind="effects" /> },
        { id: "layout", label: "Layout & Properties", icon: <PaneIcon kind="layout" /> },
      ]
  return (
    <aside className="format-pane" aria-label="Format Shape">
      <header className="format-pane-title">
        <span>Format Shape</span>
        <button type="button" aria-label="Close Format Shape" onClick={hide}>
          <X className="size-4" />
        </button>
      </header>
      <div className="format-pane-modes" role="tablist">
        <button type="button" role="tab" aria-selected={!text} onClick={() => show("fill")}>
          Shape Options
        </button>
        <button type="button" role="tab" aria-selected={text} disabled={!textBox} onClick={() => show("text-fill")}>
          Text Options
        </button>
      </div>
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
          <p className="format-pane-empty">Select a shape or text box to format it.</p>
        ) : section === "fill" ? (
          <FillAndLine attrs={target.attrs} textBox={textBox} set={set} />
        ) : section === "effects" ? (
          <Effects attrs={target.attrs} set={set} />
        ) : section === "layout" || section === "text-box" ? (
          <Layout attrs={target.attrs} textBox={textBox} set={set} editor={editor} />
        ) : section === "text-fill" ? (
          <TextFillAndOutline attrs={target.attrs} set={set} />
        ) : (
          <TextEffects attrs={target.attrs} set={set} />
        )}
      </div>
    </aside>
  )
}

export function Section({ title, children, start = true }: { title: string; children: ReactNode; start?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <section className="format-pane-section">
      <button type="button" className="format-pane-heading" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {title}
      </button>
      {open ? <div className="format-pane-fields">{children}</div> : null}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="format-pane-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Radio({
  name,
  checked,
  label,
  onChange,
}: {
  name: string
  checked: boolean
  label: string
  onChange: () => void
}) {
  return (
    <label className="format-pane-radio">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

export function ColorField({
  label,
  color,
  onPick,
}: {
  label: string
  color: string
  onPick: (color: string) => void
}) {
  return (
    <Field label={label}>
      <button
        type="button"
        className="format-pane-color"
        aria-label={`${label} ${color || "automatic"}`}
        onClick={() => openColorDialog(color && color !== "none" ? color : "#4472c4", onPick)}
      >
        <span style={{ background: color && color !== "none" ? color : "transparent" }} />
      </button>
    </Field>
  )
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function NumberField({
  label,
  value,
  unit,
  step = 0.25,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string
  value: number
  unit: string
  step?: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <span className="format-pane-number">
        <input
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          step={step}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) {
              onChange(Math.min(max, Math.max(min, next)))
            }
          }}
        />
        <span>{unit}</span>
      </span>
    </Field>
  )
}

function FillAndLine({ attrs, textBox, set }: { attrs: Attrs; textBox: boolean; set: (attrs: Attrs) => void }) {
  const fill = String(attrs.fill || "")
  const fillKind =
    fill === "none" ? "none" : attrs.fillImage || attrs.texture ? "picture" : attrs.fillGradient ? "gradient" : "solid"
  const stroke = String(attrs.stroke || "")
  const noLine = stroke === "none" || (textBox && !stroke && attrs.border === "none")
  const line = attrs.kind === "shape" && LINE_SHAPES.has(String(attrs.variant || ""))
  const solidColor = fill && fill !== "none" ? fill : "#4472c4"
  const gradient = String(attrs.fillGradient || "")
  const [tone, ...direction] = (gradient || "light-down").split("-")
  return (
    <>
      <Section title="Fill">
        <Radio
          name="fill"
          checked={fillKind === "none"}
          label="No fill"
          onChange={() => set({ fill: "none", fillGradient: "", fillImage: "", texture: "" })}
        />
        <Radio
          name="fill"
          checked={fillKind === "solid"}
          label="Solid fill"
          onChange={() => set({ fill: solidColor, fillGradient: "", fillImage: "", texture: "" })}
        />
        <Radio
          name="fill"
          checked={fillKind === "gradient"}
          label="Gradient fill"
          onChange={() => set({ fill: solidColor, fillGradient: "light-down", fillImage: "", texture: "" })}
        />
        <Radio
          name="fill"
          checked={fillKind === "picture"}
          label="Picture or texture fill"
          onChange={() => set({ fill: solidColor, fillGradient: "", texture: attrs.texture || "canvas" })}
        />
        {fillKind === "solid" || fillKind === "gradient" ? (
          <ColorField label="Color" color={fill} onPick={(color) => set({ fill: color, shapeStyle: "" })} />
        ) : null}
        {fillKind === "gradient" ? (
          <>
            <Select
              label="Variation"
              value={tone ?? "light"}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(next) => set({ fillGradient: `${next}-${direction.join("-") || "down"}` })}
            />
            <Select
              label="Direction"
              value={direction.join("-") || "down"}
              options={GRADIENT_DIRECTIONS.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(next) => set({ fillGradient: `${tone || "light"}-${next}` })}
            />
          </>
        ) : null}
        {fillKind === "picture" ? (
          <>
            <Field label="Picture source">
              <button
                type="button"
                className="format-pane-button"
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = "image/*"
                  input.addEventListener("change", () => {
                    const file = input.files?.[0]
                    if (!file) {
                      return
                    }
                    const reader = new FileReader()
                    reader.addEventListener("load", () => {
                      if (typeof reader.result === "string") {
                        set({ fillImage: reader.result, texture: "" })
                      }
                    })
                    reader.readAsDataURL(file)
                  })
                  input.click()
                }}
              >
                Insert…
              </button>
            </Field>
            <Select
              label="Texture"
              value={String(attrs.texture || "")}
              options={[
                { value: "", label: attrs.fillImage ? "(picture)" : "None" },
                ...TEXTURES.map((item) => ({ value: item.id, label: item.label })),
              ]}
              onChange={(next) => set({ texture: next, fillImage: next ? "" : attrs.fillImage })}
            />
          </>
        ) : null}
      </Section>
      <Section title="Line">
        <Radio name="line" checked={noLine} label="No line" onChange={() => set({ stroke: "none" })} />
        <Radio
          name="line"
          checked={!noLine}
          label="Solid line"
          onChange={() => set({ stroke: stroke && stroke !== "none" ? stroke : "#2f5496", border: "single" })}
        />
        {!noLine ? (
          <>
            <ColorField
              label="Color"
              color={stroke || String(attrs.borderColor || "")}
              onPick={(color) => set({ stroke: color, shapeStyle: "" })}
            />
            <NumberField
              label="Width"
              unit="pt"
              value={Number(attrs.strokeWidth) || 0.75}
              min={0.25}
              max={20}
              onChange={(pt) => set({ strokeWidth: pt })}
            />
            <Select
              label="Dash type"
              value={String(attrs.strokeDash || "")}
              options={OUTLINE_DASHES.map((dash) => ({ value: dash.id, label: dash.label }))}
              onChange={(next) => set({ strokeDash: next })}
            />
            {line ? (
              <>
                <Select
                  label="Begin arrow type"
                  value={String(attrs.arrowBegin || "")}
                  options={ARROW_HEADS.map((head) => ({ value: head, label: ARROW_NAMES[head]! }))}
                  onChange={(next) => set({ arrowBegin: next })}
                />
                <Select
                  label="End arrow type"
                  value={String(attrs.arrowEnd || "")}
                  options={ARROW_HEADS.map((head) => ({ value: head, label: ARROW_NAMES[head]! }))}
                  onChange={(next) => set({ arrowEnd: next })}
                />
              </>
            ) : null}
          </>
        ) : null}
      </Section>
    </>
  )
}

function Effects({ attrs, set }: { attrs: Attrs; set: (attrs: Attrs) => void }) {
  const [glowColor, glowSize] = String(attrs.glow || "").split(":")
  return (
    <>
      <Section title="Shadow">
        <Select
          label="Presets"
          value={String(attrs.shadow || (attrs.effect === "shadow" ? "outer-br" : ""))}
          options={[
            { value: "", label: "No Shadow" },
            ...SHADOWS.flatMap((group) => group.items.map((item) => ({ value: item.id, label: item.label }))),
          ]}
          onChange={(next) => set({ shadow: next, effect: "" })}
        />
      </Section>
      <Section title="Reflection" start={false}>
        <Select
          label="Presets"
          value={String(attrs.reflection || "")}
          options={[
            { value: "", label: "No Reflection" },
            ...REFLECTIONS.map((item) => ({ value: item.id, label: item.label })),
          ]}
          onChange={(next) => set({ reflection: next })}
        />
      </Section>
      <Section title="Glow" start={false}>
        <Select
          label="Size"
          value={glowSize || ""}
          options={[
            { value: "", label: "No Glow" },
            ...GLOW_SIZES.map((size) => ({ value: String(size), label: `${size} pt` })),
          ]}
          onChange={(next) => set({ glow: next ? `${glowColor || "#4472c4"}:${next}` : "" })}
        />
        {attrs.glow ? (
          <ColorField
            label="Color"
            color={glowColor ?? ""}
            onPick={(color) => set({ glow: `${color}:${glowSize || 8}` })}
          />
        ) : null}
      </Section>
      <Section title="Soft Edges" start={false}>
        <Select
          label="Size"
          value={String(Number(attrs.softEdge) || "")}
          options={[
            { value: "", label: "No Soft Edges" },
            ...SOFT_EDGES.map((pt) => ({ value: String(pt), label: `${pt} pt` })),
          ]}
          onChange={(next) => set({ softEdge: Number(next) || 0 })}
        />
      </Section>
      <Section title="3-D Format" start={false}>
        <Select
          label="Bevel"
          value={String(attrs.bevel || "")}
          options={[{ value: "", label: "No Bevel" }, ...BEVELS.map((item) => ({ value: item.id, label: item.label }))]}
          onChange={(next) => set({ bevel: next })}
        />
      </Section>
      <Section title="3-D Rotation" start={false}>
        <Select
          label="Presets"
          value={String(attrs.rot3d || "")}
          options={[
            { value: "", label: "No Rotation" },
            ...ROTATIONS_3D.flatMap((group) => group.items.map((item) => ({ value: item.id, label: item.label }))),
          ]}
          onChange={(next) => set({ rot3d: next })}
        />
      </Section>
    </>
  )
}

const PT_PER_CM = 72 / 2.54

function Layout({
  attrs,
  textBox,
  set,
  editor,
}: {
  attrs: Attrs
  textBox: boolean
  set: (attrs: Attrs) => void
  editor: Editor
}) {
  return (
    <>
      {textBox ? (
        <Section title="Text Box">
          <Select
            label="Vertical alignment"
            value={String(attrs.vAlign || "top")}
            options={[
              { value: "top", label: "Top" },
              { value: "middle", label: "Middle" },
              { value: "bottom", label: "Bottom" },
            ]}
            onChange={(next) => {
              // Middle and bottom need a set height to align in.
              const height = Number(attrs.height) || boxHeight(editor)
              set({ vAlign: next === "top" ? "" : next, ...(next !== "top" && !attrs.height ? { height } : {}) })
            }}
          />
          <Select
            label="Text direction"
            value={String(attrs.textDirection || "")}
            options={TEXT_DIRECTIONS.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(next) => set({ textDirection: next })}
          />
          <label className="format-pane-check">
            <input
              type="checkbox"
              checked={!Number(attrs.height)}
              onChange={(event) => set({ height: event.target.checked ? 0 : boxHeight(editor) })}
            />
            Resize shape to fit text
          </label>
          <label className="format-pane-check">
            <input
              type="checkbox"
              checked={!attrs.noWrap}
              onChange={(event) => set({ noWrap: !event.target.checked })}
            />
            Wrap text in shape
          </label>
          {(
            [
              ["insetL", "Left margin", 7.2],
              ["insetR", "Right margin", 7.2],
              ["insetT", "Top margin", 3.6],
              ["insetB", "Bottom margin", 3.6],
            ] as const
          ).map(([key, label, fallback]) => (
            <NumberField
              key={key}
              label={label}
              unit="cm"
              step={0.05}
              max={5}
              value={(Number(attrs[key] ?? fallback) || 0) / PT_PER_CM}
              onChange={(cm) => set({ [key]: Math.round(cm * PT_PER_CM * 100) / 100 })}
            />
          ))}
        </Section>
      ) : null}
      <Section title="Alt Text" start={!textBox}>
        <Field label="Description">
          <textarea rows={3} value={String(attrs.alt || "")} onChange={(event) => set({ alt: event.target.value })} />
        </Field>
      </Section>
    </>
  )
}

function boxHeight(editor: Editor) {
  const found = shapeNode(editor)
  const dom = found ? editor.view.nodeDOM(found.pos) : null
  return dom instanceof HTMLElement ? Math.round(dom.offsetHeight) : 72
}

function TextFillAndOutline({ attrs, set }: { attrs: Attrs; set: (attrs: Attrs) => void }) {
  const fill = String(attrs.textFill || "")
  const outline = String(attrs.textOutline || "")
  return (
    <>
      <Section title="Text Fill">
        <Radio name="text-fill" checked={fill === "none"} label="No fill" onChange={() => set({ textFill: "none" })} />
        <Radio
          name="text-fill"
          checked={Boolean(fill) && fill !== "none"}
          label="Solid fill"
          onChange={() => set({ textFill: fill && fill !== "none" ? fill : "#000000" })}
        />
        <Radio name="text-fill" checked={!fill} label="Automatic" onChange={() => set({ textFill: "" })} />
        {fill && fill !== "none" ? (
          <ColorField label="Color" color={fill} onPick={(color) => set({ textFill: color })} />
        ) : null}
      </Section>
      <Section title="Text Outline">
        <Radio name="text-outline" checked={!outline} label="No line" onChange={() => set({ textOutline: "" })} />
        <Radio
          name="text-outline"
          checked={Boolean(outline)}
          label="Solid line"
          onChange={() => set({ textOutline: outline || "#4472c4" })}
        />
        {outline ? <ColorField label="Color" color={outline} onPick={(color) => set({ textOutline: color })} /> : null}
      </Section>
    </>
  )
}

function TextEffects({ attrs, set }: { attrs: Attrs; set: (attrs: Attrs) => void }) {
  return (
    <Section title="Text Effects">
      <Select
        label="Effect"
        value={String(attrs.textEffect || "")}
        options={[
          { value: "", label: "No Effect" },
          ...TEXT_EFFECTS.map((item) => ({ value: item.id, label: item.label })),
        ]}
        onChange={(next) => set({ textEffect: next })}
      />
    </Section>
  )
}

export function PaneIcon({ kind }: { kind: "fill" | "effects" | "layout" | "text-fill" }) {
  const base = { stroke: "var(--icon-base-color)", strokeWidth: 1.2, strokeLinejoin: "round", fill: "none" } as const
  const accent = { ...base, stroke: "var(--icon-accent-color)" }
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      {kind === "fill" ? (
        <>
          <path d="M3 8.5 7.5 4l4.5 4.5L7.5 13z" {...base} />
          <path
            d="M12.6 10.4c.8 1.2 1 1.8.5 2.3-.5.5-1.3.3-1.5-.4-.1-.6.5-1.3 1-1.9z"
            {...accent}
            fill="var(--icon-accent-color)"
          />
        </>
      ) : kind === "effects" ? (
        <>
          <path d="M8 2.5 13.5 6.5 11.4 13H4.6L2.5 6.5z" {...base} />
          <path d="M5 14h7" {...accent} />
        </>
      ) : kind === "layout" ? (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="0.8" {...base} />
          <path d="M5 6h6M5 8.5h6M5 11h3.5" {...accent} />
        </>
      ) : (
        <>
          <path d="M4 13 8 3l4 10M5.6 9.5h4.8" {...base} />
          <path d="M3 14.5h10" {...accent} />
        </>
      )}
    </svg>
  )
}
