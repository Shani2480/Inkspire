import { useEffect, useState, type PointerEvent } from "react"
import { DialogFrame } from "@/components/word-dialog"

type ColorRequest = {
  value: string
  apply: (color: string) => void
}

let openRequest: ((request: ColorRequest) => void) | null = null

export function openColorDialog(value: string, apply: (color: string) => void) {
  openRequest?.({ value, apply })
}

const STANDARD = buildPalette()

export function ColorDialogHost() {
  const [request, setRequest] = useState<ColorRequest | null>(null)

  useEffect(() => {
    openRequest = setRequest
    return () => {
      openRequest = null
    }
  }, [])

  if (!request) {
    return null
  }

  return <ColorDialog request={request} onClose={() => setRequest(null)} />
}

function ColorDialog({ request, onClose }: { request: ColorRequest; onClose: () => void }) {
  const [tab, setTab] = useState<"standard" | "custom">("standard")
  const [color, setColor] = useState(normalizeHex(request.value) || "#2e75b6")

  function apply() {
    request.apply(color)
    onClose()
  }

  return (
    <DialogFrame title="Colors" width={520} onClose={onClose} level={70}>
      <div className="mt-3 flex gap-1 border-b border-black/10">
        {(["standard", "custom"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs capitalize ${
              tab === id
                ? "border-[var(--dlg-accent)] text-[var(--dlg-accent)]"
                : "border-transparent text-[var(--dlg-muted)]"
            }`}
            onClick={() => setTab(id)}
          >
            {id === "standard" ? "Standard" : "Custom"}
          </button>
        ))}
      </div>
      {tab === "standard" ? (
        <div className="mt-3 grid grid-cols-[repeat(13,1fr)] gap-1">
          {STANDARD.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={swatch.toLowerCase() === color.toLowerCase()}
              className="aspect-square rounded-[2px] ring-1 ring-black/10 aria-pressed:ring-2 aria-pressed:ring-[#0f6cbd]"
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
      ) : (
        <CustomColor color={color} original={normalizeHex(request.value) || "#000000"} onChange={setColor} />
      )}
      <div className="mt-4 flex items-center gap-2">
        <span className="size-6 rounded border border-black/15" style={{ background: color }} />
        <span className="text-xs text-[var(--dlg-muted)]">{color}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="dialog-btn is-primary" onClick={apply}>
            OK
          </button>
          <button type="button" className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </DialogFrame>
  )
}

function CustomColor({
  color,
  original,
  onChange,
}: {
  color: string
  original: string
  onChange: (color: string) => void
}) {
  const rgb = hexToRgb(color)
  const hsv = hexToHsv(color)

  function setChannel(index: number, value: string) {
    const next = [...rgb]
    next[index] = clampChannel(value)
    onChange(rgbToHex(next[0], next[1], next[2]))
  }

  function dragSquare(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const saturation = clamp01((event.clientX - rect.left) / rect.width)
    const value = 1 - clamp01((event.clientY - rect.top) / rect.height)
    onChange(hsvToHex(hsv.h, saturation, value))
  }

  function dragHue(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const hue = clamp01((event.clientY - rect.top) / rect.height) * 360
    onChange(hsvToHex(hue, hsv.s, hsv.v))
  }

  return (
    <div className="mt-3 flex gap-3">
      <div
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        className="relative h-40 w-40 cursor-crosshair rounded-sm border border-black/15"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`,
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragSquare(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            dragSquare(event)
          }
        }}
      >
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-40 w-4 cursor-pointer rounded-sm border border-black/15"
        style={{ background: "linear-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragHue(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            dragHue(event)
          }
        }}
      >
        <span
          className="absolute inset-x-0 h-1 -translate-y-1/2 border border-white bg-black/40"
          style={{ top: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex gap-3 text-[11px] text-neutral-500">
          <span>
            New
            <span className="mt-1 block h-6 w-12 border border-black/15" style={{ background: color }} />
          </span>
          <span>
            Current
            <span className="mt-1 block h-6 w-12 border border-black/15" style={{ background: original }} />
          </span>
        </div>
        {(["Red", "Green", "Blue"] as const).map((label, index) => (
          <label key={label} className="flex items-center justify-between gap-2 text-xs text-[var(--dlg-muted)]">
            {label}
            <input
              aria-label={label}
              type="number"
              min={0}
              max={255}
              value={rgb[index]}
              className="h-7 w-16 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
              onChange={(event) => setChannel(index, event.target.value)}
            />
          </label>
        ))}
        <label className="flex items-center justify-between gap-2 text-xs text-[var(--dlg-muted)]">
          Hex
          <input
            aria-label="Hex"
            value={color}
            className="h-7 w-24 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
            onChange={(event) => {
              const next = normalizeHex(event.target.value)
              if (next) {
                onChange(next)
              }
            }}
          />
        </label>
      </div>
    </div>
  )
}

function buildPalette() {
  const colors: string[] = []
  const hues = [0, 15, 30, 45, 60, 90, 120, 160, 190, 210, 240, 270, 320]
  for (const light of [94, 84, 72, 60, 48, 36, 24]) {
    for (const hue of hues) {
      colors.push(hslToHex(hue, light > 90 ? 35 : 72, light))
    }
  }
  for (let step = 0; step < 13; step += 1) {
    const value = Math.round(255 - (step * 255) / 12)
    colors.push(rgbToHex(value, value, value))
  }
  return colors
}

function hslToHex(hue: number, saturation: number, light: number) {
  const s = saturation / 100
  const l = light / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let red = 0
  let green = 0
  let blue = 0
  if (hue < 60) {
    red = c
    green = x
  } else if (hue < 120) {
    red = x
    green = c
  } else if (hue < 180) {
    green = c
    blue = x
  } else if (hue < 240) {
    green = x
    blue = c
  } else if (hue < 300) {
    red = x
    blue = c
  } else {
    red = c
    blue = x
  }
  return rgbToHex(Math.round((red + m) * 255), Math.round((green + m) * 255), Math.round((blue + m) * 255))
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function hexToHsv(color: string) {
  const [red, green, blue] = hexToRgb(color).map((channel) => channel / 255)
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0
  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6
    } else if (max === green) {
      hue = (blue - red) / delta + 2
    } else {
      hue = (red - green) / delta + 4
    }
    hue *= 60
    if (hue < 0) {
      hue += 360
    }
  }
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const chroma = value * saturation
  const section = hue / 60
  const x = chroma * (1 - Math.abs((section % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0
  if (section < 1) {
    red = chroma
    green = x
  } else if (section < 2) {
    red = x
    green = chroma
  } else if (section < 3) {
    green = chroma
    blue = x
  } else if (section < 4) {
    green = x
    blue = chroma
  } else if (section < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }
  const match = value - chroma
  return rgbToHex(Math.round((red + match) * 255), Math.round((green + match) * 255), Math.round((blue + match) * 255))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(color: string): [number, number, number] {
  const hex = normalizeHex(color) ?? "#000000"
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function normalizeHex(value: string) {
  const trimmed = value.trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  if (!match) {
    return ""
  }
  return `#${match[1].toLowerCase()}`
}

function clampChannel(value: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return 0
  }
  return Math.max(0, Math.min(255, Math.round(number)))
}
