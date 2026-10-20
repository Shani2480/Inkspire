import { NodeSelection } from "@tiptap/pm/state"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { openColorDialog } from "@/components/color-dialog"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  BUILT_IN_TEXTURES,
  DEFAULT_MODEL_FORMAT,
  MODEL_LIGHTINGS,
  MODEL_MATERIALS,
  modelFormat,
  textureSwatch,
  type ModelFormat,
} from "@/editor/model-format"

let openRequest: (() => void) | null = null

/** Opens Format 3D Model for the selected 3D model. */
export function openModelFormat() {
  openRequest?.()
}

const COLORS = [
  "#0f6cbd",
  "#c00000",
  "#ed7d31",
  "#ffc000",
  "#70ad47",
  "#5b9bd5",
  "#7030a0",
  "#262626",
  "#a5a5a5",
  "#ffffff",
]

const TABS = [
  { id: "color", label: "Color and Material" },
  { id: "light", label: "Lighting" },
  { id: "texture", label: "Texture" },
]

/** The longest side of a picture used as a texture; larger ones are scaled down so the document stays small. */
const TEXTURE_SIDE = 1024

export function ModelFormatDialogHost() {
  const editor = useDocumentEditor()
  const [session, setSession] = useState<{ pos: number; original: Record<string, unknown> } | null>(null)

  useEffect(() => {
    openRequest = () => {
      const selection = editor?.state.selection
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== "threeDModel") {
        return
      }
      setSession({ pos: selection.from, original: selection.node.attrs })
    }
    return () => {
      openRequest = null
    }
  }, [editor])

  if (!editor || !session) {
    return null
  }
  return (
    <ModelFormatDialog
      initial={modelFormat(session.original)}
      preview={(format) => {
        const node = editor.state.doc.nodeAt(session.pos)
        if (node?.type.name !== "threeDModel") {
          return
        }
        const tr = editor.state.tr.setNodeMarkup(session.pos, undefined, { ...node.attrs, ...format })
        editor.view.dispatch(tr.setMeta("addToHistory", false))
      }}
      onClose={(format) => {
        const node = editor.state.doc.nodeAt(session.pos)
        if (node?.type.name === "threeDModel") {
          // Back to how it was without a history step, then the change as one step Undo takes back.
          editor.view.dispatch(
            editor.state.tr
              .setNodeMarkup(session.pos, undefined, { ...node.attrs, ...modelFormat(session.original) })
              .setMeta("addToHistory", false),
          )
          if (format) {
            const tr = editor.state.tr.setNodeMarkup(session.pos, undefined, { ...node.attrs, ...format })
            editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, session.pos)))
          }
        }
        setSession(null)
        editor.commands.focus()
      }}
    />
  )
}

function ModelFormatDialog({
  initial,
  preview,
  onClose,
}: {
  initial: ModelFormat
  preview: (format: ModelFormat) => void
  onClose: (format: ModelFormat | null) => void
}) {
  const [tab, setTab] = useState("color")
  const [format, setFormat] = useState(initial)
  const fileInput = useRef<HTMLInputElement>(null)

  const change = (patch: Partial<ModelFormat>) => {
    const next = { ...format, ...patch }
    setFormat(next)
    preview(next)
  }

  const fromFile = (file: File | undefined) => {
    if (!file) {
      return
    }
    void scaledPicture(file).then((texture) => {
      if (texture) {
        change({ texture })
      }
    })
  }

  return (
    <DialogFrame
      title="Format 3D Model"
      width={500}
      onClose={() => onClose(null)}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      bodyHeight={330}
      bodyClassName="model-format-body"
      onSubmit={(event) => {
        event.preventDefault()
        onClose(format)
      }}
    >
      {tab === "color" ? (
        <div className="model-format-panel">
          <Section title="Color">
            <div className="model-format-swatches" role="radiogroup" aria-label="Color">
              <button
                type="button"
                role="radio"
                aria-checked={format.color === ""}
                className="model-format-swatch is-auto"
                title="Model's own colors"
                onClick={() => change({ color: "" })}
              >
                Auto
              </button>
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={format.color.toLowerCase() === color}
                  aria-label={color}
                  title={color}
                  className="model-format-swatch"
                  style={{ background: color }}
                  onClick={() => change({ color })}
                />
              ))}
              <button
                type="button"
                className="dialog-btn"
                onClick={() => openColorDialog(format.color || "#0f6cbd", (color) => change({ color }))}
              >
                More Colors…
              </button>
            </div>
            <div className="mt-2 flex gap-4" role="radiogroup" aria-label="Color mode">
              {(
                [
                  ["tint", "Tint the model's colors"],
                  ["replace", "Replace its colors"],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="model-color-mode"
                    checked={format.colorMode === mode}
                    disabled={!format.color}
                    onChange={() => change({ colorMode: mode })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Section>
          <Section title="Material">
            <div className="model-format-tiles" role="radiogroup" aria-label="Material">
              {MODEL_MATERIALS.map((material) => (
                <Tile
                  key={material.id}
                  label={material.label}
                  checked={format.material === material.id}
                  onClick={() => change({ material: material.id })}
                >
                  <span className={`model-format-ball is-${material.id}`} />
                </Tile>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
      {tab === "light" ? (
        <div className="model-format-panel">
          <Section title="Lighting">
            <div className="model-format-tiles" role="radiogroup" aria-label="Lighting">
              {MODEL_LIGHTINGS.map((lighting) => (
                <Tile
                  key={lighting.id}
                  label={lighting.label}
                  checked={format.lighting === lighting.id}
                  onClick={() => change({ lighting: lighting.id })}
                >
                  <span
                    className="model-format-ball"
                    style={{
                      background: `radial-gradient(circle at 32% 28%, ${lighting.key} 0%, #7b8794 ${Math.round(40 + lighting.ambientIntensity * 30)}%, ${lighting.ambient === "#20242c" ? "#111" : "#3b4450"} 100%)`,
                    }}
                  />
                </Tile>
              ))}
            </div>
          </Section>
          <Section title="Light">
            <Slider
              id="model-intensity"
              label="Intensity"
              value={format.intensity}
              min={0}
              max={200}
              unit="%"
              onChange={(intensity) => change({ intensity })}
            />
            <Slider
              id="model-direction"
              label="Direction"
              value={format.direction}
              min={0}
              max={360}
              unit="°"
              onChange={(direction) => change({ direction })}
            />
            <Slider
              id="model-elevation"
              label="Height"
              value={format.elevation}
              min={-30}
              max={90}
              unit="°"
              onChange={(elevation) => change({ elevation })}
            />
          </Section>
        </div>
      ) : null}
      {tab === "texture" ? (
        <div className="model-format-panel">
          <Section title="Texture">
            <div className="model-format-tiles" role="radiogroup" aria-label="Texture">
              <Tile label="None" checked={format.texture === ""} onClick={() => change({ texture: "" })}>
                <span className="model-format-texture is-none" />
              </Tile>
              {BUILT_IN_TEXTURES.map((texture) => (
                <Tile
                  key={texture.id}
                  label={texture.label}
                  checked={format.texture === texture.id}
                  onClick={() => change({ texture: texture.id })}
                >
                  <img className="model-format-texture" src={textureSwatch(texture.id)} alt="" />
                </Tile>
              ))}
              {format.texture.startsWith("data:") ? (
                <Tile label="Your picture" checked onClick={() => undefined}>
                  <img className="model-format-texture" src={format.texture} alt="" />
                </Tile>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="dialog-btn" onClick={() => fileInput.current?.click()}>
                From File…
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  fromFile(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
            </div>
          </Section>
          <Section title="Size">
            <Slider
              id="model-texture-scale"
              label="Repeat"
              value={format.textureScale}
              min={0.25}
              max={8}
              step={0.25}
              unit="×"
              disabled={!format.texture}
              onChange={(textureScale) => change({ textureScale })}
            />
          </Section>
        </div>
      ) : null}
      <DialogButtons submit onCancel={() => onClose(null)}>
        <button type="button" className="dialog-btn" onClick={() => change({ ...DEFAULT_MODEL_FORMAT })}>
          Reset
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="model-format-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Tile({
  label,
  checked,
  onClick,
  children,
}: {
  label: string
  checked: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="model-format-tile" onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  )
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="model-format-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id}>
        {value}
        {unit}
      </output>
    </div>
  )
}

/** A picture from the user's files as a data URL, no larger than TEXTURE_SIDE on its longest side. */
function scaledPicture(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve("")
    reader.onload = () => {
      const source = String(reader.result || "")
      const image = new Image()
      image.onerror = () => resolve("")
      image.onload = () => {
        const scale = Math.min(1, TEXTURE_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1))
        if (scale === 1) {
          resolve(source)
          return
        }
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", 0.88))
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  })
}
