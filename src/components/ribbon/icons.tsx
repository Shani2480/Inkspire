import type { ReactNode } from "react"

export function RibbonSvg({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      {children}
    </svg>
  )
}

export function PasteIcon({ size = 28 }: { size?: number }) {
  return (
    <RibbonSvg size={size}>
      <rect
        x="3.2"
        y="3.2"
        width="9.6"
        height="11"
        rx="1"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="1"
      />
      <rect x="5.4" y="1.4" width="5.2" height="3" rx="0.6" fill="var(--icon-accent-color)" />
      <path d="M5.2 7.2h5.6M5.2 9.2h5.6M5.2 11.2h3.6" stroke="var(--icon-muted-color)" strokeWidth="0.9" />
    </RibbonSvg>
  )
}

export function CutIcon() {
  return (
    <RibbonSvg>
      <circle cx="4.2" cy="11.2" r="1.7" fill="var(--icon-accent-color)" />
      <circle cx="4.2" cy="11.2" r="0.6" fill="#fff" />
      <circle cx="8.2" cy="11.2" r="1.7" fill="var(--icon-accent-color)" />
      <circle cx="8.2" cy="11.2" r="0.6" fill="#fff" />
      <path
        d="M5.2 10.2 12.4 3.2M6.6 10.2 12.2 6.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function CopyIcon() {
  return (
    <RibbonSvg>
      <rect
        x="4.2"
        y="3.4"
        width="8.2"
        height="9.4"
        rx="0.8"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="1"
      />
      <rect
        x="2.2"
        y="1.6"
        width="8.2"
        height="9.4"
        rx="0.8"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="1"
      />
    </RibbonSvg>
  )
}

export function FormatPainterIcon() {
  return (
    <RibbonSvg>
      {/* Roller drum */}
      <rect x="2.2" y="1.6" width="9.2" height="4.2" rx="1.2" fill="var(--icon-accent-color)" />
      <path d="M3.2 2.8h7.2M3.2 4.6h7.2" stroke="#fff" strokeWidth="0.7" strokeOpacity="0.55" strokeLinecap="round" />
      {/* Frame + stem */}
      <path
        d="M11.4 3.7h1.3c.5 0 .9.4.9.9V7.2c0 .7-.5 1.2-1.2 1.2H8.6"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Handle */}
      <path
        d="M8.6 8.4 5.1 13.6c-.35.5.05 1.15.65 1.05l1.55-.25c.35-.05.6-.35.5-.7L6.3 9.2"
        fill="#c19a6b"
        stroke="var(--icon-base-color)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function GrowFontIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 12.6 5.4 4h1.3l3.2 8.6M3.3 9.8h5.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 7.2V2.6M9.2 4.2 11.2 2.2l2 2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function ShrinkFontIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 12.6 5.4 4h1.3l3.2 8.6M3.3 9.8h5.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 2.4v4.6M9.2 5.2 11.2 7.2l2-2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function ClearFormatIcon() {
  return (
    <RibbonSvg>
      <path d="M2.4 12.4 6.2 3.2h1.4L8.8 6" stroke="var(--icon-base-color)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3.6 9.6h3.4" stroke="var(--icon-base-color)" strokeWidth="1.1" />
      <path d="M8.4 7.2 13.4 12.2" stroke="#d13438" strokeWidth="1.3" strokeLinecap="round" />
      <rect
        x="9.2"
        y="8.6"
        width="4.6"
        height="2.5"
        rx="0.4"
        fill="#f4b4b6"
        stroke="#d13438"
        strokeWidth="0.8"
        transform="rotate(-42 11.5 9.8)"
      />
    </RibbonSvg>
  )
}

export function TextEffectsIcon() {
  return (
    <RibbonSvg>
      <path d="M3 13 7.2 3.2h1.5L13 13M4.6 9.6h6.6" stroke="#5b2c8e" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 1.4c1.6 1.2 2.4 2 2.4 3.1" stroke="#7eb6ff" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function BulletsIcon() {
  return (
    <RibbonSvg>
      <circle cx="3" cy="4" r="1.15" fill="var(--icon-accent-color)" />
      <circle cx="3" cy="8" r="1.15" fill="var(--icon-accent-color)" />
      <circle cx="3" cy="12" r="1.15" fill="var(--icon-accent-color)" />
      <path d="M6 4h8M6 8h8M6 12h8" stroke="var(--icon-base-color)" strokeWidth="1.1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function NumberingIcon() {
  return (
    <RibbonSvg>
      <path d="M2.2 3.2h1.5V6M2.1 6h2.2" stroke="var(--icon-accent-color)" strokeWidth="1.1" strokeLinecap="round" />
      <path
        d="M2 8.2h2.2l-2.1 2.2h2.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.1 12.2c.7-.8 2-.7 2 .3 0 .7-.8 1-1.2 1H2.1l2.1 1.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M6.4 4.2h7.2M6.4 8.2h7.2M6.4 12.2h7.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function MultilevelIcon() {
  return (
    <RibbonSvg>
      <path d="M1.6 3.4h1.3M1.6 3.4v2.2" stroke="var(--icon-accent-color)" strokeWidth="1" strokeLinecap="round" />
      <path d="M5.2 3.4h8.2" stroke="var(--icon-base-color)" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="4.2" cy="8" r="1" fill="var(--icon-accent-color)" />
      <path d="M6.4 8h6.8" stroke="var(--icon-base-color)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M6.2 12.4h.9v1.6M8.4 12.4h6.2" stroke="var(--icon-base-color)" strokeWidth="1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function OutdentIcon() {
  return (
    <RibbonSvg>
      <path
        d="M6.5 3.2 3 8l3.5 4.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 4.2h5.2M8.2 8h5.2M8.2 11.8h5.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function IndentIcon() {
  return (
    <RibbonSvg>
      <path
        d="M3.2 3.2 6.7 8 3.2 12.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 4.2h5.2M8.2 8h5.2M8.2 11.8h5.2"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function SortIcon() {
  return (
    <RibbonSvg>
      <path
        d="M3.2 3.2h3.2M3.2 6.4h5M3.2 9.6h6.6"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M12.2 3.4v8.2M10.2 9.4l2 2.4 2-2.4"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function AlignLeftIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 3.4h11.6M2.2 6.6h8M2.2 9.8h11.6M2.2 13h6.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function AlignCenterIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 3.4h11.6M4 6.6h8M2.2 9.8h11.6M4.6 13h6.8"
        stroke="var(--icon-base-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function AlignRightIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 3.4h11.6M6 6.6h8M2.2 9.8h11.6M7.4 13h6.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function AlignJustifyIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.2 3.4h11.6M2.2 6.6h11.6M2.2 9.8h11.6M2.2 13h11.6"
        stroke="var(--icon-base-color)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function LineSpacingIcon() {
  return (
    <RibbonSvg>
      <path
        d="M2.4 3.2 4.6 1.2 6.8 3.2M4.6 1.6v12.2M2.4 12.8 4.6 14.8 6.8 12.8"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 4.2h5.4M8.4 8h5.4M8.4 11.8h5.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function ShadingIcon() {
  return (
    <RibbonSvg>
      <path
        d="M3.2 9.2 8.6 3.2l3.6 3.2-5.4 6.2H3.2V9.2Z"
        fill="#f4d27a"
        stroke="var(--icon-base-color)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M2.4 13.4h11.2" stroke="var(--icon-base-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function BordersIcon() {
  return (
    <RibbonSvg>
      {/* No fill, so the box stays an outline in dark mode; the dashed sides are the borders not set. */}
      <path
        d="M2.4 13.2V2.4h11.2v10.8"
        stroke="var(--icon-muted-color)"
        strokeWidth="1"
        strokeDasharray="1.2 1.2"
        strokeLinecap="round"
      />
      <path d="M2 13.6h12" stroke="var(--icon-base-color)" strokeWidth="1.6" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function FindIcon() {
  return (
    <RibbonSvg>
      <circle cx="7" cy="7" r="3.4" stroke="var(--icon-accent-color)" strokeWidth="1.4" />
      <path d="M9.6 9.6 13.2 13.2" stroke="var(--icon-accent-color)" strokeWidth="1.4" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function ReplaceIcon() {
  return (
    <RibbonSvg>
      <path
        d="M3 5.2h7.2M8.2 3.2 10.6 5.2 8.2 7.2"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 10.8H5.8M7.8 8.8 5.4 10.8 7.8 12.8"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function SelectIcon() {
  return (
    <RibbonSvg>
      <path
        d="M3.2 2.4 8.2 13.2 9.4 8.8 13.4 7.4 3.2 2.4Z"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function AddInsIcon({ size = 28 }: { size?: number }) {
  return (
    <RibbonSvg size={size}>
      <rect x="1.6" y="1.6" width="5.4" height="5.4" rx="0.6" fill="#d83b01" />
      <rect x="9" y="1.6" width="5.4" height="5.4" rx="0.6" fill="#f7630c" />
      <rect x="1.6" y="9" width="5.4" height="5.4" rx="0.6" fill="#ca5010" />
      <rect x="9" y="9" width="5.4" height="5.4" rx="0.6" fill="#e85d04" />
    </RibbonSvg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path
        d="M1.6 2.8 4 5.2 6.4 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LetterGlyph({ children, strike = false }: { children: ReactNode; strike?: boolean }) {
  return <span className={`ribbon-glyph${strike ? " line-through decoration-1" : ""}`}>{children}</span>
}

export function UndoIcon() {
  return (
    <RibbonSvg>
      <path
        d="M5.4 3.6 2.6 6.4l2.8 2.8M2.8 6.4h6.6a3.4 3.4 0 0 1 0 6.8H7"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function RedoIcon() {
  return (
    <RibbonSvg>
      <path
        d="M10.6 3.6 13.4 6.4l-2.8 2.8M13.2 6.4H6.6a3.4 3.4 0 0 0 0 6.8H9"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

export function ChecklistIcon() {
  return (
    <RibbonSvg>
      <rect x="1.8" y="2.4" width="4" height="4" rx="0.6" stroke="var(--icon-base-color)" strokeWidth="1" />
      <path
        d="M2.7 4.4 3.6 5.3 5 3.5"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="1.8" y="9.4" width="4" height="4" rx="0.6" stroke="var(--icon-base-color)" strokeWidth="1" />
      <path d="M8 4.4h6M8 11.4h6" stroke="var(--icon-base-color)" strokeWidth="1.1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

export function DictateIcon() {
  return (
    <RibbonSvg>
      <rect x="5.9" y="1.6" width="4.2" height="7.6" rx="2.1" stroke="var(--icon-accent-color)" strokeWidth="1.2" />
      <path
        d="M3.6 7.4a4.4 4.4 0 0 0 8.8 0M8 11.8v2.6M5.8 14.4h4.4"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

export function EditorIcon() {
  return (
    <RibbonSvg>
      <path
        d="M6.6 11.6 12.4 3.6a1.3 1.3 0 0 1 2.1 1.5L8.7 13.1l-2.4.7Z"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M1.6 6.4h5M1.6 9.2h3.4M1.6 12h2.4"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

/** Font Color: the letter over a bar of the colour the button applies. */
export function FontColorIcon({ color }: { color: string }) {
  return (
    <RibbonSvg>
      <path
        d="M4.4 10.6 8 2.4l3.6 8.2M5.6 7.8h4.8"
        stroke="var(--icon-base-color)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2.4" y="12.2" width="11.2" height="2.4" rx="0.4" fill={color} />
    </RibbonSvg>
  )
}

/** Text Highlight Color: a marker over a bar of the colour the button applies. */
export function HighlightIcon({ color }: { color: string }) {
  return (
    <RibbonSvg>
      <path
        d="M5.2 9.8 10.4 2.6l2.4 1.8-5.2 7.2H5.2Z"
        stroke="var(--icon-base-color)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M4 11 3 11.8h2.6" stroke="var(--icon-base-color)" strokeWidth="1" strokeLinecap="round" />
      <rect x="2.4" y="12.2" width="11.2" height="2.4" rx="0.4" fill={color} />
    </RibbonSvg>
  )
}
