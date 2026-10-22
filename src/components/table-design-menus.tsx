import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { insertHorizontalLine } from "@/editor/home-actions"
import { ColorMenu } from "@/components/color-menu"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import {
  BORDER_STYLES,
  BORDER_WEIGHTS,
  applyBorders,
  currentTable,
  paintTable,
  shadeCells,
  type BorderKind,
  type BorderPen,
  type TableLook,
  TABLE_LOOKS,
} from "@/editor/table-tools"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

/** The swatch for one table style: header band over the banded body, in the style's colours. */
export function lookBackground(look: (typeof TABLE_LOOKS)[number]) {
  return `linear-gradient(${look.header} 30%, ${look.band || "#fff"} 30% 55%, #fff 55% 70%, ${look.band || "#fff"} 70%)`
}

export function TableStyleSwatch({
  look,
  editor,
  onPicked,
}: {
  look: (typeof TABLE_LOOKS)[number]
  editor: Editor | null
  onPicked?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={look.label}
      title={look.label}
      className="table-style-swatch"
      style={{ background: lookBackground(look) }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (editor) paintTable(editor, look.id as TableLook)
        onPicked?.()
      }}
    />
  )
}

/** Every table style, for the gallery's drop-down. */
export function TableStyleGallery({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div>
      <div className="table-style-gallery">
        {TABLE_LOOKS.map((look) => (
          <TableStyleSwatch key={look.id} look={look} editor={editor} onPicked={close} />
        ))}
      </div>
      <div className="border-t border-[var(--app-popover-border)] p-1">
        <MenuButton
          onClick={() => {
            close()
            useTableStylesDialog.getState().show()
          }}
        >
          Table Styles…
        </MenuButton>
      </div>
    </div>
  )
}

export const useTableStylesDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

/** A small table drawn in a style's colours: header, banded rows and a first column. */
function StylePreview({ look }: { look: (typeof TABLE_LOOKS)[number] }) {
  return (
    <table className="table-style-preview" aria-hidden>
      <tbody>
        {[0, 1, 2, 3].map((row) => (
          <tr key={row}>
            {[0, 1, 2].map((col) => (
              <td
                key={col}
                style={{
                  background: row === 0 ? look.header : col === 0 ? look.soft : row % 2 === 0 ? look.band : "#fff",
                }}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Browse every table style, with a preview, and apply one to the table the cursor is in. */
export function TableStylesDialog({ editor }: { editor: Editor | null }) {
  const open = useTableStylesDialog((state) => state.open)
  const hide = useTableStylesDialog((state) => state.hide)
  const [picked, setPicked] = useState<string | null>(null)
  if (!open || !editor) {
    return null
  }
  const current = String(currentTable(editor)?.node.attrs.look ?? "plain")
  const chosen = TABLE_LOOKS.find((item) => item.id === (picked ?? current)) ?? TABLE_LOOKS[0]
  const close = () => {
    setPicked(null)
    hide()
  }
  return (
    <DialogFrame
      title="Table Styles"
      width={480}
      onClose={close}
      onSubmit={() => {
        paintTable(editor, chosen.id as TableLook)
        close()
      }}
    >
      <div className="table-styles-dialog">
        <div role="listbox" aria-label="Table styles" className="table-styles-list">
          {TABLE_LOOKS.map((look) => (
            <button
              key={look.id}
              type="button"
              role="option"
              aria-selected={look.id === chosen.id}
              className="table-styles-item"
              onClick={() => setPicked(look.id)}
            >
              <span className="table-styles-chip" style={{ background: lookBackground(look) }} aria-hidden />
              {look.label}
            </button>
          ))}
        </div>
        <div className="table-styles-preview">
          <p className="text-xs font-semibold">{chosen.label}</p>
          <StylePreview look={chosen} />
        </div>
      </div>
      <DialogButtons submit ok="Apply" onCancel={close} />
    </DialogFrame>
  )
}

export function ShadingMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <ColorMenu
      active=""
      clearLabel="No Color"
      onClear={() => {
        if (editor) shadeCells(editor, null)
        close()
      }}
      onSelect={(color) => {
        if (editor) shadeCells(editor, color)
        close()
      }}
    />
  )
}

const BORDER_ROWS: { kind: BorderKind; label: string }[] = [
  { kind: "bottom", label: "Bottom Border" },
  { kind: "top", label: "Top Border" },
  { kind: "left", label: "Left Border" },
  { kind: "right", label: "Right Border" },
  { kind: "none", label: "No Border" },
  { kind: "all", label: "All Borders" },
  { kind: "outside", label: "Outside Borders" },
  { kind: "inside", label: "Inside Borders" },
  { kind: "insideH", label: "Inside Horizontal Border" },
  { kind: "insideV", label: "Inside Vertical Border" },
  { kind: "diagDown", label: "Diagonal Down Border" },
  { kind: "diagUp", label: "Diagonal Up Border" },
]

/** The label of a border kind, as the Borders menu lists it: what the Borders button does again when pressed. */
export function borderLabel(kind: BorderKind) {
  return BORDER_ROWS.find((row) => row.kind === kind)?.label ?? "Borders"
}

export function BordersMenu({
  editor,
  pen,
  close,
  gridlines,
  onGridlines,
  onPick,
}: {
  editor: Editor | null
  pen: BorderPen
  close: () => void
  gridlines: boolean
  onGridlines: () => void
  /** Told which border was chosen: the Borders button applies it again next time it is pressed. */
  onPick?: (kind: BorderKind) => void
}) {
  return (
    <div className="flex w-56 flex-col">
      {BORDER_ROWS.map((row) => (
        <MenuButton
          key={row.kind}
          onClick={() => {
            if (editor) applyBorders(editor, row.kind, pen)
            onPick?.(row.kind)
            close()
          }}
        >
          {row.label}
        </MenuButton>
      ))}
      <div className="my-1 border-t border-[var(--app-popover-border)]" />
      <MenuButton
        onClick={() => {
          if (editor) insertHorizontalLine(editor)
          close()
        }}
      >
        Horizontal Line
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          close()
        }}
      >
        Draw Table
      </MenuButton>
      <MenuButton
        selected={gridlines}
        onClick={() => {
          onGridlines()
          close()
        }}
      >
        View Gridlines
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) openBordersAndShading(editor)
          close()
        }}
      >
        Borders and Shading…
      </MenuButton>
    </div>
  )
}

export function PenStyleMenu({
  pen,
  onChange,
  close,
}: {
  pen: BorderPen
  onChange: (pen: BorderPen) => void
  close: () => void
}) {
  return (
    <div className="flex w-44 flex-col p-1">
      {BORDER_STYLES.map((style) => (
        <MenuButton
          key={style}
          selected={pen.style === style}
          onClick={() => {
            onChange({ ...pen, style })
            close()
          }}
        >
          <span className="pen-sample" style={{ borderTop: `2px ${style} currentColor` }} />
        </MenuButton>
      ))}
    </div>
  )
}

export function PenWeightMenu({
  pen,
  onChange,
  close,
}: {
  pen: BorderPen
  onChange: (pen: BorderPen) => void
  close: () => void
}) {
  return (
    <div className="flex w-36 flex-col p-1">
      {BORDER_WEIGHTS.map((width) => (
        <MenuButton
          key={width}
          selected={pen.width === width}
          onClick={() => {
            onChange({ ...pen, width })
            close()
          }}
        >
          {width} pt
        </MenuButton>
      ))}
    </div>
  )
}

export function PenColorMenu({
  pen,
  onChange,
  close,
}: {
  pen: BorderPen
  onChange: (pen: BorderPen) => void
  close: () => void
}) {
  return (
    <ColorMenu
      active={pen.color}
      clearLabel="Automatic"
      onClear={() => {
        onChange({ ...pen, color: "#404040" })
        close()
      }}
      onSelect={(color) => {
        onChange({ ...pen, color })
        close()
      }}
    />
  )
}
