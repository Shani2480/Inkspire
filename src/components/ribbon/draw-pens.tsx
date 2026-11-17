import { MenuButton } from "@/components/ribbon/ribbon-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { RibbonTipContent } from "@/components/ribbon/ribbon-button"
import { HIGHLIGHTER_MM, INK_COLORS, PEN_MM, useDrawStore, type Pen, type PenKind } from "@/editor/drawing"
import { useState } from "react"

const KIND_NAMES: Record<PenKind, string> = { pen: "Pen", pencil: "Pencil", highlighter: "Highlighter" }

/** A pen's name as Word's tooltip gives it: "Pen: Red, 0.5 mm". */
export function penName(pen: Pen) {
  return `${KIND_NAMES[pen.kind]}: ${colorName(pen.color)}, ${pen.widthMm} mm`
}

const COLOR_NAMES: Record<string, string> = {
  "#000000": "Black",
  "#ffffff": "White",
  "#7f7f7f": "Gray",
  "#c00000": "Dark Red",
  "#ff0000": "Red",
  "#ffc000": "Orange",
  "#ffff00": "Yellow",
  "#92d050": "Light Green",
  "#00b050": "Green",
  "#00b0f0": "Light Blue",
  "#0070c0": "Blue",
  "#002060": "Dark Blue",
  "#7030a0": "Purple",
  "#ff66cc": "Pink",
  "#996633": "Brown",
  "#5b9bd5": "Blue-Gray",
}

function colorName(color: string) {
  return COLOR_NAMES[color.toLowerCase()] ?? color.toUpperCase()
}

/** A pen drawn as Word draws it in the gallery: a pen, a pencil or a highlighter, its tip in its colour. */
export function PenGlyph({ kind, color }: { kind: PenKind; color: string }) {
  const outline = "var(--app-ribbon-text, #424242)"
  if (kind === "highlighter") {
    return (
      <svg viewBox="0 0 20 32" width="20" height="32" aria-hidden="true">
        <path d="M6 3h8v5l-1 3H7L6 8z" fill={color} stroke={outline} strokeWidth="0.8" />
        <rect x="5" y="11" width="10" height="18" rx="1.5" fill="none" stroke={outline} strokeWidth="1" />
        <rect x="5.5" y="17" width="9" height="5" fill={color} opacity="0.85" />
      </svg>
    )
  }
  if (kind === "pencil") {
    return (
      <svg viewBox="0 0 20 32" width="20" height="32" aria-hidden="true">
        <path d="M10 2l3.5 8h-7z" fill="#e8c9a0" stroke={outline} strokeWidth="0.8" />
        <path d="M10 2l1.3 3h-2.6z" fill={color} />
        <rect x="6.5" y="10" width="7" height="19" fill={color} opacity="0.9" stroke={outline} strokeWidth="0.8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 32" width="20" height="32" aria-hidden="true">
      <path d="M10 2l3 7H7z" fill={color} stroke={outline} strokeWidth="0.8" />
      <rect x="6.5" y="9" width="7" height="20" rx="1.5" fill="none" stroke={outline} strokeWidth="1" />
      <rect x="7" y="13" width="6" height="3" fill={color} />
    </svg>
  )
}

/**
 * Draw > the pens, as Word's gallery: a click chooses a pen; a click on the chosen pen opens its menu (thickness,
 * colour, Remove Pen).
 */
export function PenGallery({ disabled }: { disabled?: boolean }) {
  const pens = useDrawStore((state) => state.pens)
  const penId = useDrawStore((state) => state.penId)
  const tool = useDrawStore((state) => state.tool)
  const drawing = tool === "pen" || tool === "pencil" || tool === "highlighter"
  return (
    <div className="draw-pens" role="group" aria-label="Pens">
      {pens.map((pen) => (
        <PenButton key={pen.id} pen={pen} active={drawing && pen.id === penId} disabled={disabled} />
      ))}
    </div>
  )
}

function PenButton({ pen, active, disabled }: { pen: Pen; active: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const choosePen = useDrawStore((state) => state.choosePen)
  const name = penName(pen)
  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next && active)}>
      <Tooltip>
        <TooltipTrigger
          aria-label={name}
          aria-pressed={active}
          aria-haspopup="menu"
          aria-disabled={disabled || undefined}
          className={`draw-pen${active ? " is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (disabled) {
              return
            }
            if (!active) {
              event.preventDefault()
              choosePen(pen.id)
            }
          }}
          render={<PopoverTrigger />}
        >
          <PenGlyph kind={pen.kind} color={pen.color} />
          <span className="draw-pen-width" style={{ height: widthBar(pen), background: pen.color }} />
        </TooltipTrigger>
        <RibbonTipContent label={name} />
      </Tooltip>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="ribbon-menu w-auto p-1.5 shadow-none ring-0 data-open:animate-none data-closed:animate-none"
      >
        <div onMouseDown={(event) => event.preventDefault()}>
          <PenMenu pen={pen} close={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function widthBar(pen: Pen) {
  return Math.max(1, Math.min(5, pen.kind === "highlighter" ? pen.widthMm / 2 : pen.widthMm * 2))
}

function PenMenu({ pen, close }: { pen: Pen; close: () => void }) {
  const updatePen = useDrawStore((state) => state.updatePen)
  const removePen = useDrawStore((state) => state.removePen)
  const count = useDrawStore((state) => state.pens.length)
  const sizes = pen.kind === "highlighter" ? HIGHLIGHTER_MM : PEN_MM
  return (
    <div className="draw-pen-menu">
      <div className="draw-pen-menu-heading">Thickness</div>
      <div className="draw-pen-sizes">
        {sizes.map((mm) => (
          <button
            key={mm}
            type="button"
            aria-label={`${mm} mm`}
            aria-pressed={pen.widthMm === mm}
            title={`${mm} mm`}
            className={`draw-pen-size${pen.widthMm === mm ? " is-active" : ""}`}
            onClick={() => updatePen(pen.id, { widthMm: mm })}
          >
            <span
              style={{
                width: Math.max(2, Math.min(18, pen.kind === "highlighter" ? mm * 1.6 : mm * 4 + 2)),
                height: Math.max(2, Math.min(18, pen.kind === "highlighter" ? mm * 1.6 : mm * 4 + 2)),
                background: pen.color,
                opacity: pen.kind === "highlighter" ? 0.6 : 1,
              }}
            />
          </button>
        ))}
      </div>
      <div className="draw-pen-menu-heading">Colors</div>
      <div className="draw-pen-colors">
        {INK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={colorName(color)}
            aria-pressed={pen.color === color}
            title={colorName(color)}
            className={`draw-pen-color${pen.color === color ? " is-active" : ""}`}
            style={{ background: color }}
            onClick={() => {
              updatePen(pen.id, { color })
              close()
            }}
          />
        ))}
      </div>
      <div className="shape-menu-separator" role="separator" />
      <MenuButton
        disabled={count <= 1}
        onClick={() => {
          removePen(pen.id)
          close()
        }}
      >
        Remove Pen
      </MenuButton>
    </div>
  )
}

/** Add Pen's menu: a new pen, pencil or highlighter, as Word's. */
export function AddPenMenu({ close }: { close: () => void }) {
  const addPen = useDrawStore((state) => state.addPen)
  return (
    <>
      {(["pen", "pencil", "highlighter"] as const).map((kind) => (
        <MenuButton
          key={kind}
          onClick={() => {
            addPen(kind)
            close()
          }}
        >
          <span className="flex items-center gap-2">
            <span className="draw-pen-glyph-small">
              <PenGlyph kind={kind} color={kind === "highlighter" ? "#ffff00" : "#000000"} />
            </span>
            {KIND_NAMES[kind]}
          </span>
        </MenuButton>
      ))}
    </>
  )
}
