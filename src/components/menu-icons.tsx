import { CopyIcon, CutIcon, PasteIcon, RibbonSvg } from "@/components/ribbon/icons"
import type { ReactNode } from "react"

export function MenuLabel({ label, glyph }: { label: string; glyph?: ReactNode | null }) {
  const icon = glyph === undefined ? menuGlyph(label) : glyph
  return (
    <span className="menu-glyph-label">
      <span className="menu-glyph">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  )
}

export function menuGlyph(label: string) {
  if (label.startsWith("Search")) {
    return <SearchGlyph />
  }
  if (label === "Format Shape..." || label === "Edit Data..." || label.startsWith("Change ")) {
    return <ShapeGlyph />
  }
  return GLYPHS[label] ?? null
}

const GLYPHS: Record<string, ReactNode> = {
  Cut: <CutIcon />,
  Copy: <CopyIcon />,
  Paste: <PasteIcon size={16} />,
  "Paste Options": <PasteIcon size={16} />,
  "Keep Source Formatting": <PasteSourceGlyph />,
  "Merge Formatting": <PasteMergeGlyph />,
  "Keep Text Only": <PasteTextGlyph />,
  "Font…": <FontGlyph />,
  "Paragraph…": <ParagraphGlyph />,
  "Block Authors": <AuthorsGlyph />,
  Synonyms: <SynonymsGlyph />,
  "Read Aloud": <AloudGlyph />,
  Translate: <TranslateGlyph />,
  Link: <LinkGlyph />,
  "New Comment": <CommentGlyph />,
  Insert: <InsertGlyph />,
  "Columns to the Left": <ColumnGlyph side="left" />,
  "Columns to the Right": <ColumnGlyph side="right" />,
  "Rows Above": <RowGlyph side="above" />,
  "Rows Below": <RowGlyph side="below" />,
  Delete: <DeleteGlyph />,
  Columns: <ColumnGlyph side="left" mark="delete" />,
  Rows: <RowGlyph side="above" mark="delete" />,
  Table: <TableGlyph mark="delete" />,
  "Merge Cells": <MergeGlyph />,
  "Split Cells": <SplitGlyph />,
  "Cell Alignment": <AlignGlyph align="center" />,
  "Align Left": <AlignGlyph align="left" />,
  Center: <AlignGlyph align="center" />,
  "Align Right": <AlignGlyph align="right" />,
  "Table Properties...": <TableGlyph />,
  "Edit Alt Text...": <AltGlyph />,
  "Size and Position...": <SizeGlyph />,
  "Wrap Text": <WrapGlyph kind="square" />,
  "In Line with Text": <WrapGlyph kind="inline" />,
  Square: <WrapGlyph kind="square" />,
  Tight: <WrapGlyph kind="tight" />,
  Through: <WrapGlyph kind="through" />,
  "In Front of Text": <WrapGlyph kind="front" />,
  "Behind Text": <WrapGlyph kind="behind" />,
  "Top and Bottom": <WrapGlyph kind="topBottom" />,
  "Bring to Front": <LayerGlyph front />,
  "Send to Back": <LayerGlyph front={false} />,
  "Format Shape...": <ShapeGlyph />,
  "Edit Text...": <FontGlyph />,
  "WordArt Style": <WordArtGlyph />,
  Blue: <SwatchGlyph color="var(--icon-accent-color)" />,
  Gold: <SwatchGlyph color="#c4a35a" />,
  Outline: <SwatchGlyph color="#fff" />,
  "Edit Equation...": <EquationGlyph />,
  "Signature Setup...": <SignatureGlyph />,
  "Update Field": <RefreshGlyph />,
  "Edit Field...": <FieldGlyph />,
  "Edit Note...": <CommentGlyph />,
}

function PasteSourceGlyph() {
  return (
    <RibbonSvg>
      <rect x="3" y="3" width="10" height="11" rx="1" fill="#fff" stroke="var(--icon-base-color)" />
      <rect x="5.2" y="1.3" width="5.4" height="2.8" rx="0.5" fill="var(--icon-accent-color)" />
      <path
        d="M9.2 8.2c1.6 0 2.6 1 2.6 2.2 0 .8-.5 1.4-1.2 1.6"
        stroke="#107c10"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M8.4 10.2h2.2M9.5 9.1v2.2" stroke="#107c10" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function PasteMergeGlyph() {
  return (
    <RibbonSvg>
      <rect x="3" y="3" width="10" height="11" rx="1" fill="#fff" stroke="var(--icon-base-color)" />
      <rect x="5.2" y="1.3" width="5.4" height="2.8" rx="0.5" fill="#c4a35a" />
      <path d="M5.2 8.4h5.6M5.2 10.4h3.4" stroke="var(--icon-muted-color)" strokeWidth="0.9" />
    </RibbonSvg>
  )
}

function PasteTextGlyph() {
  return (
    <RibbonSvg>
      <rect x="3" y="3" width="10" height="11" rx="1" fill="#fff" stroke="var(--icon-base-color)" />
      <rect x="5.2" y="1.3" width="5.4" height="2.8" rx="0.5" fill="var(--icon-base-color)" />
      <path d="M6 8.2h4M8 6.8v4.2" stroke="var(--icon-base-color)" strokeWidth="1.1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function FontGlyph() {
  return (
    <RibbonSvg>
      <path
        d="M3 13 6.4 3.4h1.4L11.2 13M4.2 9.6h5.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M11.4 4.2h2.4M12.6 3.2v3" stroke="var(--icon-accent-color)" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function ParagraphGlyph() {
  return (
    <RibbonSvg>
      <path d="M6.2 2.4h3.2a3.2 3.2 0 0 1 0 6.4H7.4" stroke="var(--icon-accent-color)" strokeWidth="1.3" />
      <path d="M7.4 2.4v11.2M10.2 2.4v11.2" stroke="var(--icon-base-color)" strokeWidth="1.2" />
    </RibbonSvg>
  )
}

function AuthorsGlyph() {
  return (
    <RibbonSvg>
      <circle cx="6.2" cy="5.2" r="2" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path
        d="M2.6 12.4c.4-2.2 1.8-3.2 3.6-3.2 1.2 0 2.2.4 2.8 1.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path d="M10.2 6.2 14 12.2M14 6.2 10.2 12.2" stroke="#a4262c" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function SearchGlyph() {
  return (
    <RibbonSvg>
      <circle cx="7" cy="7" r="3.3" fill="#fff" stroke="var(--icon-accent-color)" strokeWidth="1.3" />
      <path d="M9.6 9.6 13 13" stroke="var(--icon-base-color)" strokeWidth="1.4" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function SynonymsGlyph() {
  return (
    <RibbonSvg>
      <path d="M3 3.2h4.2c.8 1 .8 2.2 0 3.2H3z" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M13 3.2H8.8c-.8 1-.8 2.2 0 3.2H13z" fill="#fff4ce" stroke="#c4a35a" />
      <path
        d="M3 8.2h4.2c.8 1 .8 2.2 0 3.2H3zM13 8.2H8.8c-.8 1-.8 2.2 0 3.2H13z"
        fill="#fff"
        stroke="var(--icon-base-color)"
      />
    </RibbonSvg>
  )
}

function AloudGlyph() {
  return (
    <RibbonSvg>
      <path d="M3 6.2h2.2L8.2 3.6v8.8L5.2 9.8H3z" fill="var(--icon-accent-color)" />
      <path
        d="M10.2 6.2c.8.6 1.2 1.2 1.2 1.8s-.4 1.2-1.2 1.8M11.8 4.6c1.4 1 2.2 2.2 2.2 3.4s-.8 2.4-2.2 3.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function TranslateGlyph() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="2.2" width="8.2" height="6.4" rx="0.8" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M3.2 6.4 4.6 3.6h.8L6.8 6.4M3.7 5.4h2.6" stroke="var(--icon-accent-color)" strokeWidth="0.8" />
      <rect x="6.2" y="7.2" width="8.2" height="6.4" rx="0.8" fill="#fff" stroke="#107c10" />
      <path d="M8.4 11.6h3.6M10.2 9.4v3.2" stroke="#107c10" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function LinkGlyph() {
  return (
    <RibbonSvg>
      <path
        d="M6.4 9.2 5 10.6a2.2 2.2 0 0 1-3.2-3.1L3.2 6.1"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M9.6 6.8 11 5.4a2.2 2.2 0 0 1 3.2 3.1L12.8 9.9"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M6.2 9.4 9.8 5.8" stroke="var(--icon-base-color)" strokeWidth="1.3" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function CommentGlyph() {
  return (
    <RibbonSvg>
      <path d="M2.4 3.2h11.2v7.2H6.2L3.4 13V10.4H2.4z" fill="#fff4ce" stroke="#c4a35a" />
    </RibbonSvg>
  )
}

function InsertGlyph() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="3.2" width="8.6" height="8.6" rx="0.4" fill="#fff" stroke="var(--icon-accent-color)" />
      <path d="M1.6 6.2h8.6M1.6 9h8.6M4.6 3.2v8.6M7.4 3.2v8.6" stroke="var(--icon-accent-color)" strokeWidth="0.7" />
      <circle cx="12.2" cy="11.4" r="2.6" fill="#107c10" />
      <path d="M12.2 10v2.8M10.8 11.4h2.8" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function DeleteGlyph() {
  return <TableGlyph mark="delete" />
}

function ColumnGlyph({ side, mark }: { side: "left" | "right"; mark?: "delete" }) {
  const x = side === "left" ? 2.2 : 8.4
  return (
    <RibbonSvg>
      <rect x="1.8" y="2.4" width="10.4" height="11.2" rx="0.4" fill="#fff" stroke="var(--icon-muted-color)" />
      <path d="M6 2.4v11.2M1.8 6.2h10.4M1.8 9.8h10.4" stroke="#d0d0d0" />
      <rect x={x} y="2.6" width="3.2" height="10.8" fill={mark === "delete" ? "#fde7e9" : "#deecf9"} />
      {mark === "delete" ? (
        <path d="M3.4 6.2 10.6 12.2M10.6 6.2 3.4 12.2" stroke="#a4262c" strokeWidth="1.2" strokeLinecap="round" />
      ) : null}
    </RibbonSvg>
  )
}

function RowGlyph({ side, mark }: { side: "above" | "below"; mark?: "delete" }) {
  const y = side === "above" ? 2.4 : 8.6
  return (
    <RibbonSvg>
      <rect x="2.2" y="1.8" width="11.2" height="10.4" rx="0.4" fill="#fff" stroke="var(--icon-muted-color)" />
      <path d="M2.2 6h11.2M6 1.8v10.4M9.6 1.8v10.4" stroke="#d0d0d0" />
      <rect x="2.4" y={y} width="10.8" height="3.2" fill={mark === "delete" ? "#fde7e9" : "#deecf9"} />
      {mark === "delete" ? (
        <path d="M4.2 4.2 11.4 11.2M11.4 4.2 4.2 11.2" stroke="#a4262c" strokeWidth="1.2" strokeLinecap="round" />
      ) : null}
    </RibbonSvg>
  )
}

function TableGlyph({ mark }: { mark?: "delete" }) {
  return (
    <RibbonSvg>
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="0.6" fill="#fff" stroke="var(--icon-accent-color)" />
      <path d="M1.8 6.2h12.4M1.8 9.8h12.4M6 2.4v11.2M10 2.4v11.2" stroke="var(--icon-accent-color)" strokeWidth="0.8" />
      <rect x="1.8" y="2.4" width="12.4" height="2.2" fill="var(--icon-accent-color)" />
      {mark === "delete" ? (
        <path d="M4 6.6 12 12.4M12 6.6 4 12.4" stroke="#a4262c" strokeWidth="1.3" strokeLinecap="round" />
      ) : null}
    </RibbonSvg>
  )
}

function MergeGlyph() {
  return (
    <RibbonSvg>
      <rect x="1.8" y="4.2" width="12.4" height="7.6" rx="0.4" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M5.2 8h5.6" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M8.8 6.4 10.6 8 8.8 9.6"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function SplitGlyph() {
  return (
    <RibbonSvg>
      <rect x="1.8" y="4.2" width="5.4" height="7.6" rx="0.4" fill="#fff" stroke="var(--icon-accent-color)" />
      <rect x="8.8" y="4.2" width="5.4" height="7.6" rx="0.4" fill="#fff" stroke="var(--icon-accent-color)" />
      <path d="M6.4 8h3.2" stroke="#a4262c" strokeWidth="1.1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function AlignGlyph({ align }: { align: "left" | "center" | "right" }) {
  const x = align === "left" ? 3.2 : align === "right" ? 6.4 : 4.6
  return (
    <RibbonSvg>
      <rect x="2" y="2.4" width="12" height="11.2" rx="0.4" fill="#fff" stroke="var(--icon-muted-color)" />
      <path
        d={`M${x} 5.2h${align === "center" ? 6.8 : 6.4}M${x} 8h${align === "center" ? 6.8 : 4.6}M${x} 10.8h${align === "center" ? 6.8 : 5.4}`}
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function AltGlyph() {
  return (
    <RibbonSvg>
      <rect x="1.8" y="3.2" width="8.4" height="7.2" rx="0.4" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path
        d="M3.2 8.6 5 6.4l1.4 1.6 1-1.2 1.6 2.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M11 5.2h3.2M11 7.6h3.2M11 10h2.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function SizeGlyph() {
  return (
    <RibbonSvg>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="0.4" fill="#fff" stroke="var(--icon-accent-color)" />
      <path
        d="M2 6.2V2h4.2M14 9.8V14H9.8"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export type WrapGlyphKind = "inline" | "square" | "tight" | "through" | "topBottom" | "behind" | "front"

/** Word's wrap icons: lines of text and the object, showing where the text goes around it. */
export function WrapGlyph({ kind, size = 16 }: { kind: WrapGlyphKind; size?: number }) {
  const muted = "var(--icon-muted-color)"
  const accent = "var(--icon-accent-color)"
  // Rows of text at these heights; beside the object they stop short (square) or come closer (tight, through).
  const rows = [2.6, 5, 7.4, 9.8, 12.2, 14.4]
  const besides = kind === "square" || kind === "tight" || kind === "through"
  const lines = rows.map((y) => {
    const level = y > 4 && y < 11
    if (kind === "topBottom" && level) {
      return ""
    }
    if (besides && level) {
      const start = kind === "square" ? 9.2 : kind === "tight" ? 8.4 : 7.8
      return `M${start} ${y}h${14.4 - start}`
    }
    if (kind === "inline" && y === 7.4) {
      return "M1.6 7.4h2.6M11.2 7.4h3.2"
    }
    return `M1.6 ${y}h12.8`
  })
  const shape =
    kind === "tight" || kind === "through" ? (
      <circle cx="4.6" cy="7.4" r="2.8" fill={accent} />
    ) : (
      <rect
        x={kind === "inline" ? 4.8 : besides ? 1.6 : 4.6}
        y={kind === "inline" ? 5.8 : 4.4}
        width={kind === "inline" ? 5.8 : 6}
        height={kind === "inline" ? 3.4 : 6}
        fill={kind === "behind" ? "#deecf9" : accent}
        opacity={kind === "behind" ? 0.75 : 1}
      />
    )
  const text = <path d={lines.join("")} stroke={muted} strokeWidth="0.9" />
  return (
    <RibbonSvg size={size}>
      {kind === "behind" ? (
        <>
          {shape}
          {text}
        </>
      ) : (
        <>
          {text}
          {shape}
        </>
      )}
    </RibbonSvg>
  )
}

function LayerGlyph({ front }: { front: boolean }) {
  return (
    <RibbonSvg>
      <rect
        x="2"
        y="5.2"
        width="7.2"
        height="7.2"
        rx="0.4"
        fill={front ? "#f3f3f3" : "var(--icon-accent-color)"}
        stroke="var(--icon-muted-color)"
      />
      <rect
        x="6.4"
        y="2.4"
        width="7.2"
        height="7.2"
        rx="0.4"
        fill={front ? "var(--icon-accent-color)" : "#f3f3f3"}
        stroke="var(--icon-base-color)"
      />
    </RibbonSvg>
  )
}

function ShapeGlyph() {
  return (
    <RibbonSvg>
      <rect x="2.2" y="3.4" width="8.4" height="6.4" rx="0.4" fill="#deecf9" stroke="var(--icon-accent-color)" />
      <path d="M9.2 10.2c.8 1.6 1.6 2.4 3.2 2.6" stroke="#c19a6b" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.4 8.6h3.4v2.2h-1.2l-.4 1.2-.6-1.2h-1.2z" fill="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

function WordArtGlyph() {
  return (
    <RibbonSvg>
      <path d="M2.4 12.6 5.6 3.2h1.2l3.2 9.4M3.6 9.4h5" stroke="var(--icon-accent-color)" strokeWidth="1.3" />
      <path
        d="M11 4.2c1.4-.8 2.8.2 2.2 1.6-.6 1.6-2.4 1.2-2.2 2.6"
        stroke="#c4a35a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function SwatchGlyph({ color }: { color: string }) {
  return (
    <RibbonSvg>
      <rect x="3" y="3" width="10" height="10" rx="1" fill={color} stroke="var(--icon-muted-color)" />
    </RibbonSvg>
  )
}

function EquationGlyph() {
  return (
    <RibbonSvg>
      <path
        d="M3 3.2h7.2M6.6 3.2 4.2 12.8H3M6.6 3.2 9.6 8.2 6.8 12.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function SignatureGlyph() {
  return (
    <RibbonSvg>
      <path d="M2 11.6h12" stroke="var(--icon-muted-color)" strokeWidth="1" />
      <path
        d="M3 10.2c1.2-3 2-4.2 2.6-1.2.4 2.2 1.2 2.4 1.8.2.8-2.8 1.6-3.2 2.4-.4.6 2 1.4 2.2 2.2-.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function RefreshGlyph() {
  return (
    <RibbonSvg>
      <path
        d="M12.6 6.2A4.6 4.6 0 1 0 12 10.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M12.6 3.2v3.2H9.4"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function FieldGlyph() {
  return (
    <RibbonSvg>
      <rect x="2" y="3.2" width="12" height="9.6" rx="0.8" fill="#fff" stroke="var(--icon-accent-color)" />
      <path d="M4.2 6.4h7.6M4.2 9h5" stroke="var(--icon-muted-color)" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}
