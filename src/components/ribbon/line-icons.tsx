import { RibbonSvg } from "@/components/ribbon/icons"
import type { ReactNode } from "react"

/**
 * Icons for the single line ribbon, after Word for the web's: outline drawings on a 16 grid with one 1.2 stroke,
 * the outline in the base colour and one accent detail, so a row of them reads as one set at 20 px.
 */

const base = {
  stroke: "var(--icon-base-color)",
  strokeWidth: 1.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const
const accent = { ...base, stroke: "var(--icon-accent-color)" } as const

function LineSvg({ children }: { children: ReactNode }) {
  return <RibbonSvg>{children}</RibbonSvg>
}

export function LineBreakIcon() {
  return (
    <LineSvg>
      <path d="M3 2v3h10V2M3 14v-3h10v3" {...base} />
      <path d="M2 8h1.6M5.2 8h1.6M9.2 8h1.6M12.4 8H14" {...accent} />
    </LineSvg>
  )
}

export function LineTableIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.4" {...base} />
      <path d="M2 6.2h12M2 9.8h12M6 2.6v10.8M10 2.6v10.8" {...base} />
      <path d="M2.6 6.2h10.8" {...accent} />
    </LineSvg>
  )
}

export function LinePictureIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.4" {...base} />
      <circle cx="10.4" cy="5.8" r="1.1" {...accent} />
      <path d="m2.4 12 4-4.2 3.6 3.6 1.4-1.4 2.2 2.2" {...accent} />
    </LineSvg>
  )
}

export function LineDrawingIcon() {
  return (
    <LineSvg>
      <path d="M9.8 3.2 12.8 6.2 6.4 12.6 3 13l.4-3.4Z" {...base} />
      <path d="M8.6 4.4 11.6 7.4" {...base} />
      <path d="M9 13.4c1.4-.9 2.4-.2 3.2-.8.6-.4.9-1 1.6-1.2" {...accent} />
    </LineSvg>
  )
}

export function LineLinkIcon() {
  return (
    <LineSvg>
      <path d="M6.6 5H5a3 3 0 0 0 0 6h1.6M9.4 5H11a3 3 0 0 1 0 6H9.4" {...base} />
      <path d="M5.4 8h5.2" {...accent} />
    </LineSvg>
  )
}

export function LineContentsIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2" width="12" height="12" rx="1.4" {...base} />
      <path d="M4.8 5.4h.1M4.8 8h.1M4.8 10.6h.1" {...accent} strokeWidth={1.6} />
      <path d="M7 5.4h4.4M7 8h4.4M7 10.6h4.4" {...base} />
    </LineSvg>
  )
}

export function LineBookmarkIcon() {
  return (
    <LineSvg>
      <path d="M4.2 2.4h7.6v11.2L8 10.8l-3.8 2.8Z" {...base} />
      <path d="M6.2 5.2h3.6" {...accent} />
    </LineSvg>
  )
}

export function LineVideoIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="3.6" width="9" height="8.8" rx="1.4" {...base} />
      <path d="m10.8 6.6 3.4-2v6.8l-3.4-2" {...base} />
      <path d="M5.4 6.2v3.6L8.2 8Z" {...accent} />
    </LineSvg>
  )
}

export function LineCommentIcon() {
  return (
    <LineSvg>
      <path
        d="M3.4 2.6h9.2a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H8l-3.2 2.6v-2.6H3.4A1.4 1.4 0 0 1 2 10V4a1.4 1.4 0 0 1 1.4-1.4Z"
        {...base}
      />
      <path d="M8 4.8v3.6M6.2 6.6h3.6" {...accent} />
    </LineSvg>
  )
}

export function LineHeaderFooterIcon() {
  return (
    <LineSvg>
      <rect x="3" y="1.8" width="10" height="12.4" rx="1.4" {...base} />
      <path d="M5.2 4.4h5.6M5.2 11.6h5.6" {...accent} />
      <path d="M5.2 7h5.6M5.2 9h3.4" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LinePageNumberIcon() {
  return (
    <LineSvg>
      <rect x="3" y="1.8" width="10" height="12.4" rx="1.4" {...base} />
      <path d="M7 6 6.2 11M9.6 6l-.8 5M5.6 7.6h4.8M5.4 9.4h4.8" {...accent} strokeWidth={1} />
    </LineSvg>
  )
}

export function LineEquationIcon() {
  return (
    <LineSvg>
      <path d="M2.6 4h10.8" {...base} />
      <path d="M5.4 4v8.6M10.4 4v7.2c0 1 .6 1.4 1.6 1.2" {...accent} />
    </LineSvg>
  )
}

export function LineSymbolIcon() {
  return (
    <LineSvg>
      <path d="M2.8 13.2h3.4v-1.6a4.6 4.6 0 1 1 3.6 0v1.6h3.4" {...base} />
      <path d="M6.2 11.6h.1M9.8 11.6h.1" {...accent} />
    </LineSvg>
  )
}

export function LineEmojiIcon() {
  return (
    <LineSvg>
      <circle cx="8" cy="8" r="6" {...base} />
      <path d="M6 6.4h.1M10 6.4h.1" {...base} strokeWidth={1.7} />
      <path d="M5.4 9.4a3 3 0 0 0 5.2 0" {...accent} />
    </LineSvg>
  )
}

export function LineMarginsIcon() {
  return (
    <LineSvg>
      <rect x="2.6" y="1.8" width="10.8" height="12.4" rx="1.4" {...base} />
      <path d="M2.6 4.6h10.8M2.6 11.4h10.8M5.4 1.8v12.4M10.6 1.8v12.4" {...accent} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineOrientationIcon() {
  return (
    <LineSvg>
      <rect x="2" y="5.4" width="8" height="8.8" rx="1.2" {...base} />
      <path d="M8 2.2h3.4a2.4 2.4 0 0 1 2.4 2.4V7" {...accent} />
      <path d="m12.4 5.8 1.4 1.4 1.4-1.4" {...accent} />
    </LineSvg>
  )
}

export function LineSizeIcon() {
  return (
    <LineSvg>
      <rect x="4.6" y="1.8" width="8.8" height="12.4" rx="1.4" {...base} />
      <path d="M2.2 2.4v11.2M1.4 3.4 2.2 2.4 3 3.4M1.4 12.6l.8 1 .8-1" {...accent} strokeWidth={1} />
    </LineSvg>
  )
}

export function LineColumnsIcon() {
  return (
    <LineSvg>
      <path d="M2 3h5M2 5.6h5M2 8.2h5M2 10.8h5M2 13.4h3.4" {...base} />
      <path d="M9 3h5M9 5.6h5M9 8.2h5M9 10.8h3.4" {...accent} />
    </LineSvg>
  )
}

export function LineBreaksIcon() {
  return (
    <LineSvg>
      <path d="M3 1.8v3.6h10V1.8M3 14.2v-3.6h10v3.6" {...base} />
      <path d="M1.8 8h12.4" {...accent} strokeDasharray="1.6 1.6" />
    </LineSvg>
  )
}

export function LineNumbersLineIcon() {
  return (
    <LineSvg>
      <path d="M2.2 2.8h1v3.4M2 6.2h2.2" {...accent} strokeWidth={1} />
      <path d="M2 9.6c.3-.8 2-.9 2 .2 0 .9-2 1.6-2 2.8h2.2" {...accent} strokeWidth={1} />
      <path d="M6.6 4.4H14M6.6 11H14" {...base} />
    </LineSvg>
  )
}

export function LineIndentLeftIcon() {
  return (
    <LineSvg>
      <path d="M7 3.4h7M7 8h7M7 12.6h7" {...base} />
      <path d="M2 5.6 4.4 8 2 10.4" {...accent} />
    </LineSvg>
  )
}

export function LineIndentRightIcon() {
  return (
    <LineSvg>
      <path d="M2 3.4h7M2 8h7M2 12.6h7" {...base} />
      <path d="M14 5.6 11.6 8 14 10.4" {...accent} />
    </LineSvg>
  )
}

export function LineSpacingBeforeIcon() {
  return (
    <LineSvg>
      <path d="M2.4 8.4h11.2M2.4 11.2h11.2M2.4 14h7" {...base} />
      <path d="M8 1.6v4M6.2 3.8 8 5.6l1.8-1.8" {...accent} />
    </LineSvg>
  )
}

export function LineSpacingAfterIcon() {
  return (
    <LineSvg>
      <path d="M2.4 2h11.2M2.4 4.8h11.2M2.4 7.6h7" {...base} />
      <path d="M8 14.4v-4M6.2 12.2 8 10.4l1.8 1.8" {...accent} />
    </LineSvg>
  )
}

export function LinePageBordersIcon() {
  return (
    <LineSvg>
      <rect x="2.6" y="1.8" width="10.8" height="12.4" rx="1.4" {...base} />
      <rect x="4.6" y="3.8" width="6.8" height="8.4" rx="0.6" {...accent} strokeWidth={1} />
    </LineSvg>
  )
}

/** Page Color: a bucket over a bar of the page's colour (none: an outline). */
export function LinePageColorIcon({ color }: { color: string }) {
  return (
    <LineSvg>
      <path d="M3 7.2 7.6 2.6l4.4 4.4-4.6 4.6a1 1 0 0 1-1.4 0L3 8.6a1 1 0 0 1 0-1.4Z" {...base} />
      <path d="M13.4 8.6c.6.9.9 1.4.9 1.8a.9.9 0 0 1-1.8 0c0-.4.3-.9.9-1.8Z" {...accent} strokeWidth={1} />
      <rect
        x="2"
        y="12.6"
        width="12"
        height="2"
        rx="0.4"
        fill={color || "none"}
        stroke={color ? "none" : "var(--icon-muted-color)"}
        strokeWidth="0.8"
      />
    </LineSvg>
  )
}

export function LineFootnoteIcon() {
  return (
    <LineSvg>
      <path d="M2 4.4h12M2 7.4h12M2 10.4h7.4" {...base} />
      <path d="M2.4 13.6h4" {...accent} />
      <path d="M11.6 10.6h1v3.6M11.4 14.2h2.2" {...accent} strokeWidth={1} />
    </LineSvg>
  )
}

export function LineEndnoteIcon() {
  return (
    <LineSvg>
      <path d="M4.2 1.8h5.4l3.2 3.2v9.2H4.2Z" {...base} />
      <path d="M9.6 1.8V5h3.2" {...base} />
      <path d="M6.2 8.4h4.6M6.2 11.6h1.8" {...accent} />
    </LineSvg>
  )
}

export function LineCitationIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.4" width="9.6" height="11.2" rx="1.4" {...base} />
      <path d="M4.4 5.4h4.8M4.4 8h4.8M4.4 10.6h2.6" {...base} strokeWidth={0.9} />
      <path d="M12.2 6.4c1.4.2 1.8 1 1.8 2.2 0 1.2-.7 2-1.8 2.4M12.6 8.4h.1" {...accent} />
    </LineSvg>
  )
}

export function LineSpellingIcon() {
  return (
    <LineSvg>
      <path
        d="M1.8 8.4 3.6 3.4 5.4 8.4M2.4 6.8h2.4M7 3.4v5h1.6a1.3 1.3 0 0 0 0-2.6H7M13.8 4.4a1.9 1.9 0 1 0 0 3"
        {...base}
        strokeWidth={1.1}
      />
      <path d="m5.6 12 2.2 2.2 4.6-4.6" {...accent} />
    </LineSvg>
  )
}

export function LineWordCountIcon() {
  return (
    <LineSvg>
      <path d="M2 3.4h12M2 6.4h12" {...base} />
      <path
        d="M2.4 10.2h.8v4M2.2 14.2h1.6M5.6 10.6c.3-.6 2-.7 2 .4 0 .9-2 1.6-2 3.2h2.2M10 10.2h2.2l-1.2 1.4c1.2 0 1.6.6 1.6 1.2 0 1.2-1.6 1.6-2.6.9"
        {...accent}
        strokeWidth={1}
      />
    </LineSvg>
  )
}

export function LineAccessibilityIcon() {
  return (
    <LineSvg>
      <circle cx="7" cy="2.8" r="1.2" {...base} />
      <path d="M2.4 5.4c2.8.8 6.4.8 9.2 0M7 6v3.4M7 9.4l-2 4.4M7 9.4l1.4 3" {...base} />
      <circle cx="12" cy="12" r="2.6" {...accent} />
      <path d="m10.9 12 .8.8 1.4-1.6" {...accent} strokeWidth={1} />
    </LineSvg>
  )
}

export function LineTranslateIcon() {
  return (
    <LineSvg>
      <path
        d="M1.8 3.2h6M4.8 2v1.2M3 3.2c.4 2.4 1.8 4.2 4 5M6.6 3.2c-.4 2.4-1.8 4.2-4.6 5.2"
        {...base}
        strokeWidth={1.1}
      />
      <path d="m8.4 14 2.6-6.4 2.6 6.4M9.4 11.8h3.2" {...accent} />
    </LineSvg>
  )
}

export function LineDeleteCommentIcon() {
  return (
    <LineSvg>
      <path
        d="M3.4 2.6h9.2a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H8l-3.2 2.6v-2.6H3.4A1.4 1.4 0 0 1 2 10V4a1.4 1.4 0 0 1 1.4-1.4Z"
        {...base}
      />
      <path d="m6.4 5.2 3.2 3.2M9.6 5.2 6.4 8.4" stroke="#c42b1c" strokeWidth={1.2} strokeLinecap="round" />
    </LineSvg>
  )
}

export function LineStepCommentIcon({ direction }: { direction: "previous" | "next" }) {
  const arrow = direction === "next" ? "M6.4 6.8h3.4M8.4 5.2l1.6 1.6-1.6 1.6" : "M9.6 6.8H6.2M7.6 5.2 6 6.8l1.6 1.6"
  return (
    <LineSvg>
      <path
        d="M3.4 2.6h9.2a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H8l-3.2 2.6v-2.6H3.4A1.4 1.4 0 0 1 2 10V4a1.4 1.4 0 0 1 1.4-1.4Z"
        {...base}
      />
      <path d={arrow} {...accent} />
    </LineSvg>
  )
}

export function LineShowCommentsIcon() {
  return (
    <LineSvg>
      <path
        d="M3.4 2.6h9.2a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H8l-3.2 2.6v-2.6H3.4A1.4 1.4 0 0 1 2 10V4a1.4 1.4 0 0 1 1.4-1.4Z"
        {...base}
      />
      <path d="M5 5.6h6M5 8h4" {...accent} />
    </LineSvg>
  )
}

export function LineMarkupIcon() {
  return (
    <LineSvg>
      <path d="M2.4 3.6h11.2M2.4 6.6h6.4M2.4 9.6h4.6" {...base} />
      <path d="M8.4 13.6 9 11.2l4-4 1.8 1.8-4 4Z" {...accent} />
      <path d="M2.4 12.6h3.6" stroke="#c42b1c" strokeWidth={1.2} strokeLinecap="round" />
    </LineSvg>
  )
}

export function LineTrackChangesIcon() {
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v4M3.6 1.8v12.4h4.2" {...base} />
      <path d="M5.6 6h3.6M5.6 8.4h2.4" {...base} strokeWidth={0.9} />
      <path d="m9.2 14.6.5-2.2 3.6-3.6 1.7 1.7-3.6 3.6Z" {...accent} />
    </LineSvg>
  )
}

export function LineSettleIcon({ kind }: { kind: "accept" | "reject" }) {
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v2.2M3.6 1.8v12.4h4" {...base} />
      <path d="M5.6 6h3.6M5.6 8.4h2" {...base} strokeWidth={0.9} />
      <circle cx="11.8" cy="11.6" r="3" fill={kind === "accept" ? "#107c10" : "#c42b1c"} />
      {kind === "accept" ? (
        <path d="m10.5 11.6.9.9 1.7-1.8" stroke="#fff" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m10.7 10.5 2.2 2.2M12.9 10.5l-2.2 2.2" stroke="#fff" strokeWidth={1.1} strokeLinecap="round" />
      )}
    </LineSvg>
  )
}

export function LineStepChangeIcon({ direction }: { direction: "previous" | "next" }) {
  const arrow = direction === "next" ? "M9.4 11.6h4.4M12 9.8l1.8 1.8-1.8 1.8" : "M14 11.6H9.6M11.4 9.8l-1.8 1.8 1.8 1.8"
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v2.2M3.6 1.8v12.4h4" {...base} />
      <path d="M5.6 6h3.6M5.6 8.4h2" {...base} strokeWidth={0.9} />
      <path d={arrow} {...accent} />
    </LineSvg>
  )
}

/* View */

export function LineSeparatePagesIcon() {
  return (
    <LineSvg>
      <path d="M4 1.8h5.4L12 4.4v9.8H4Z" {...base} />
      <path d="M9.4 1.8v2.6H12" {...base} />
      <path d="M6 8h4M6 10.6h4" {...accent} />
    </LineSvg>
  )
}

export function LineReadingViewIcon() {
  return (
    <LineSvg>
      <path
        d="M8 4.2C6.6 3.2 4.4 2.8 2 3v9.6c2.4-.2 4.6.2 6 1.2 1.4-1 3.6-1.4 6-1.2V3c-2.4-.2-4.6.2-6 1.2Z"
        {...base}
      />
      <path d="M8 4.2v9.6" {...accent} />
    </LineSvg>
  )
}

export function LineImmersiveIcon() {
  return (
    <LineSvg>
      <path d="M2 13.4h8.2V2.6H2Z" {...base} />
      <path d="M4 5.4h4.2M4 8h4.2M4 10.6h2.6" {...base} strokeWidth={0.9} />
      <path d="M12 6.2c.8.9.8 2.7 0 3.6M13.8 4.6c1.6 1.8 1.6 5 0 6.8" {...accent} />
    </LineSvg>
  )
}

export function LineZoomIcon() {
  return (
    <LineSvg>
      <circle cx="6.8" cy="6.8" r="4.6" {...base} />
      <path d="m10.2 10.2 3.8 3.8" {...accent} />
    </LineSvg>
  )
}

export function LineRulerIcon() {
  return (
    <LineSvg>
      <rect x="1.6" y="4.6" width="12.8" height="6.8" rx="1" {...base} />
      <path d="M4.4 4.6v2.4M7.2 4.6v3.4M10 4.6v2.4M12.6 4.6v1.6" {...accent} />
    </LineSvg>
  )
}

export function LineNavigationIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" {...base} />
      <path d="M6 2.4v11.2" {...base} />
      <path d="M3.6 5.2h.8M3.6 7.4h.8M3.6 9.6h.8" {...accent} />
    </LineSvg>
  )
}

export function LineDarkModeIcon() {
  return (
    <LineSvg>
      <circle cx="8" cy="8" r="6" {...base} />
      <path d="M8 2a6 6 0 0 1 0 12Z" fill="var(--icon-base-color)" />
    </LineSvg>
  )
}

/* Design */

export function LineThemesIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.4" {...base} />
      <path d="M4.4 5.4h4.4" {...accent} />
      <path d="M4.4 8h7.2M4.4 10.4h5" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineColorsIcon() {
  return (
    <LineSvg>
      <circle cx="5.6" cy="5.8" r="3.2" {...base} />
      <circle cx="10.4" cy="5.8" r="3.2" {...accent} />
      <circle cx="8" cy="10.2" r="3.2" {...base} />
    </LineSvg>
  )
}

export function LineFontsIcon() {
  return (
    <LineSvg>
      <path d="M2 13 5.6 3.4h.8L10 13M3.4 9.6h5.2" {...base} />
      <path
        d="M11 9.4c.4-.6 1-.9 1.7-.9.9 0 1.5.5 1.5 1.4V13M14.2 11.2c-1.8 0-2.9.4-2.9 1.1 0 .5.4.8 1 .8.9 0 1.9-.6 1.9-1.9"
        {...accent}
      />
    </LineSvg>
  )
}

export function LineWatermarkIcon() {
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v9.2H3.6Z" {...base} />
      <path d="M9.2 1.8V5h3.2" {...base} />
      <path d="m5.4 11.6 5-4.2" {...accent} />
    </LineSvg>
  )
}

/* Mailings */

export function LineEnvelopeIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.2" {...base} />
      <path d="m2.4 4.2 5.6 4.4 5.6-4.4" {...accent} />
    </LineSvg>
  )
}

export function LineLabelsIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2" width="12" height="12" rx="1.2" {...base} />
      <path d="M8 2v12M2 6h12M2 10h12" {...base} strokeWidth={0.9} />
      <path d="M3.6 4h2.6" {...accent} />
    </LineSvg>
  )
}

export function LineStartMergeIcon() {
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v9.2H3.6Z" {...base} />
      <path d="M9.2 1.8V5h3.2" {...base} />
      <path d="M5.4 8.4h1.2M8.6 8.4h1.6M5.4 11h4.8" {...accent} />
    </LineSvg>
  )
}

export function LineRecipientsIcon() {
  return (
    <LineSvg>
      <circle cx="6" cy="5.4" r="2.4" {...base} />
      <path d="M1.8 13.6c.4-2.4 2-3.8 4.2-3.8s3.8 1.4 4.2 3.8" {...base} />
      <path d="M11 3.4a2.2 2.2 0 0 1 0 4.2M12.2 9.8c1.2.5 1.9 1.8 2.1 3.4" {...accent} />
    </LineSvg>
  )
}

export function LineMergeFieldIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="4.4" width="12.4" height="7.2" rx="1.2" {...base} />
      <path d="M6 6.4 4.4 8 6 9.6M10 6.4 11.6 8 10 9.6" {...accent} />
    </LineSvg>
  )
}

export function LinePreviewIcon() {
  return (
    <LineSvg>
      <path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8 12 12.4 8 12.4 1.6 8 1.6 8Z" {...base} />
      <circle cx="8" cy="8" r="2" {...accent} />
    </LineSvg>
  )
}

export function LineRecordIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <LineSvg>
      <path d={direction === "next" ? "m6 3.6 4.4 4.4L6 12.4" : "M10 3.6 5.6 8l4.4 4.4"} {...base} />
    </LineSvg>
  )
}

export function LineFinishIcon() {
  return (
    <LineSvg>
      <path d="M3.6 1.8h5.6l3.2 3.2v3M3.6 1.8v12.4h4.6" {...base} />
      <path d="M9.2 1.8V5h3.2" {...base} />
      <path d="m9.8 11.6 1.6 1.6 3-3.2" {...accent} />
    </LineSvg>
  )
}

/* Draw */

export function LineSelectIcon() {
  return (
    <LineSvg>
      <path d="M4 2.4v10.4l2.8-2.6 2 4 1.6-.8-2-3.9h3.8Z" {...base} />
    </LineSvg>
  )
}

export function LinePenIcon() {
  return (
    <LineSvg>
      <path d="M10.4 2.4 13.6 5.6 6 13.2l-3.6.4.4-3.6Z" {...base} />
      <path d="M2.8 13.2 5 11" {...accent} />
    </LineSvg>
  )
}

export function LineHighlighterIcon() {
  return (
    <LineSvg>
      <path d="m9.6 2.2 4.2 4.2-5.4 5.4H5.6v-2.8Z" {...base} />
      <path d="M2 14h12" stroke="#f5d000" strokeWidth={2.2} strokeLinecap="round" />
    </LineSvg>
  )
}

export function LineEraseIcon() {
  return (
    <LineSvg>
      <path d="m9.2 2.6 4.2 4.2-6.6 6.6H4.4l-2-2Z" {...base} />
      <path d="m5.8 6 4.2 4.2M8 13.4h6" {...accent} />
    </LineSvg>
  )
}

/* AI Tools */

export function LineSummarizeIcon() {
  return (
    <LineSvg>
      <path d="M2.4 3.4h11.2M2.4 6.2h11.2M2.4 9h7" {...base} />
      <path d="M2.4 12.6h5.2" {...accent} />
      <path d="m12.4 9.6.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z" {...accent} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineRewriteIcon() {
  return (
    <LineSvg>
      <path d="M9.6 3.2 12.8 6.4 6 13.2l-3.6.4.4-3.6Z" {...base} />
      <path d="m12.4 1.4.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z" {...accent} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineChatIcon() {
  return (
    <LineSvg>
      <path
        d="M2 3.6c0-.7.5-1.2 1.2-1.2h9.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H7l-3 2.8v-2.8h-.8c-.7 0-1.2-.5-1.2-1.2Z"
        {...base}
      />
      <path d="M5 5.8h6M5 8h3.6" {...accent} />
    </LineSvg>
  )
}

export function LineTemplateIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2" width="9.6" height="12" rx="1.2" {...base} />
      <path d="M4.2 5h5.2M4.2 7.6h5.2M4.2 10.2h3" {...base} strokeWidth={0.9} />
      <path d="m13.2 6.6.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z" {...accent} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineVariablesIcon() {
  return (
    <LineSvg>
      <path
        d="M5.2 3C3.8 3 3.6 3.8 3.6 5v1.4C3.6 7.4 3 8 2 8c1 0 1.6.6 1.6 1.6V11c0 1.2.2 2 1.6 2M10.8 3c1.4 0 1.6.8 1.6 2v1.4c0 1 .6 1.6 1.6 1.6-1 0-1.6.6-1.6 1.6V11c0 1.2-.2 2-1.6 2"
        {...base}
      />
      <path d="M6.6 8h2.8" {...accent} />
    </LineSvg>
  )
}

export function LineKeyIcon() {
  return (
    <LineSvg>
      <circle cx="5.4" cy="10.6" r="3" {...base} />
      <path d="m7.6 8.4 6-6M11.4 4.6l1.6 1.6M9.8 6.2l1.2 1.2" {...accent} />
    </LineSvg>
  )
}

export function LineStopIcon() {
  return (
    <LineSvg>
      <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.4" fill="#c42b1c" />
    </LineSvg>
  )
}

/* Context tabs: Table Design and Table Layout */

export function LineTableStylesIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.4" {...base} />
      <path d="M2.6 5.6h10.8" {...accent} strokeWidth={2} strokeLinecap="butt" />
      <path d="M2 9.4h12M6 6.4v7M10 6.4v7" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineTableOptionsIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2.4" width="4.6" height="4.6" rx="1" {...base} />
      <path d="m3.2 4.8.9.9 1.6-1.8" {...accent} />
      <rect x="2" y="9" width="4.6" height="4.6" rx="1" {...base} />
      <path d="M8.6 4.8h5.4M8.6 11.4h5.4" {...base} />
    </LineSvg>
  )
}

export function LineBordersIcon() {
  return (
    <LineSvg>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="0.6" {...accent} />
      <path d="M8 2.4v11.2M2.4 8h11.2" {...base} strokeDasharray="1 1.6" />
    </LineSvg>
  )
}

export function LineTableInsertIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2.6" width="9" height="9" rx="1" {...base} />
      <path d="M1.8 7.1h9M6.3 2.6v9" {...base} strokeWidth={0.9} />
      <path d="M12.4 10.4v4M10.4 12.4h4" {...accent} />
    </LineSvg>
  )
}

export function LineTableDeleteIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2.6" width="9" height="9" rx="1" {...base} />
      <path d="M1.8 7.1h9M6.3 2.6v9" {...base} strokeWidth={0.9} />
      <path d="m10.8 10.8 3.2 3.2M14 10.8l-3.2 3.2" stroke="#c42b1c" strokeWidth={1.2} strokeLinecap="round" />
    </LineSvg>
  )
}

export function LineMergeCellsIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1" {...base} />
      <path d="M3.8 8h3M12.2 8h-3M5.4 6.6 6.8 8 5.4 9.4M10.6 6.6 9.2 8l1.4 1.4" {...accent} />
    </LineSvg>
  )
}

export function LineSplitCellsIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1" {...base} />
      <path d="M8 3.6v8.8" {...base} />
      <path d="M6.6 8h-3M9.4 8h3M5 6.6 3.6 8 5 9.4M11 6.6 12.4 8 11 9.4" {...accent} />
    </LineSvg>
  )
}

export function LineCellAlignIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.4" {...base} />
      <path d="M5 6.4h6M5.8 8.8h4.4" {...accent} />
    </LineSvg>
  )
}

export function LineSortIcon() {
  return (
    <LineSvg>
      <path d="M4.4 2.6v10.8M2.4 11.4l2 2 2-2" {...base} />
      <path d="M9 3.2h5M9 6.4h4M9 9.6h3M9 12.8h2" {...accent} />
    </LineSvg>
  )
}

/* Context tabs: Picture, Shape, Chart and 3D Model Format */

export function LineCorrectionsIcon() {
  return (
    <LineSvg>
      <circle cx="8" cy="8" r="3.2" {...base} />
      <path d="M8 8V4.8a3.2 3.2 0 0 1 0 6.4Z" fill="var(--icon-accent-color)" />
      <path
        d="M8 1.6v1.2M8 13.2v1.2M1.6 8h1.2M13.2 8h1.2M3.5 3.5l.8.8M11.7 11.7l.8.8M3.5 12.5l.8-.8M11.7 4.3l.8-.8"
        {...base}
      />
    </LineSvg>
  )
}

export function LineObjectStylesIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2" width="9" height="9" rx="1" {...base} />
      <path d="M13.6 5v8.6H5" {...accent} />
    </LineSvg>
  )
}

export function LineAltTextIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.4" {...base} />
      <path d="M4 10.6 5.8 5.4h.4l1.8 5.2M4.6 9h3" {...accent} />
      <path d="M9.6 6h2.6M9.6 8.4h2.6M9.6 10.8h1.6" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineWrapTextIcon() {
  return (
    <LineSvg>
      <rect x="5.4" y="5.2" width="5.2" height="5.6" rx="0.8" {...accent} />
      <path d="M2 2.6h12M2 5.4h1.6M12.4 5.4H14M2 8h1.6M12.4 8H14M2 10.6h1.6M12.4 10.6H14M2 13.4h12" {...base} />
    </LineSvg>
  )
}

export function LinePositionIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.4" {...base} />
      <rect x="8.4" y="4" width="3.6" height="3.6" rx="0.6" {...accent} />
      <path d="M4 10.4h8M4 12h5.6" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineCropIcon() {
  return (
    <LineSvg>
      <path d="M4.4 1.6v10h10" {...base} />
      <path d="M1.6 4.4h10v10" {...accent} />
    </LineSvg>
  )
}

export function LineShapesIcon() {
  return (
    <LineSvg>
      <circle cx="5.4" cy="5.4" r="3.4" {...base} />
      <rect x="7.6" y="7.6" width="6.6" height="6.6" rx="0.8" {...accent} />
    </LineSvg>
  )
}

export function LineShapeFillIcon({ color }: { color: string }) {
  return (
    <LineSvg>
      <path d="M3 6.6 7.4 2.2l4.4 4.4-4.6 4.6a1 1 0 0 1-1.4 0L3 8.4a1 1 0 0 1 0-1.8Z" {...base} />
      <path d="M12.6 8.4s1.2 1.4 1.2 2.2a1.2 1.2 0 0 1-2.4 0c0-.8 1.2-2.2 1.2-2.2Z" {...base} />
      <rect
        x="1.6"
        y="13"
        width="12.8"
        height="2"
        rx="0.4"
        fill={color}
        stroke="var(--icon-base-color)"
        strokeWidth={0.6}
      />
    </LineSvg>
  )
}

export function LineShapeOutlineIcon({ color }: { color: string }) {
  return (
    <LineSvg>
      <path d="M10.2 1.8 13 4.6 6 11.6l-3.2.4.4-3.2Z" {...base} />
      <rect
        x="1.6"
        y="13"
        width="12.8"
        height="2"
        rx="0.4"
        fill={color}
        stroke="var(--icon-base-color)"
        strokeWidth={0.6}
      />
    </LineSvg>
  )
}

export function LineWordArtIcon() {
  return (
    <LineSvg>
      <path d="M2.4 13 6.6 2.6h.8L11.6 13M4 9.2h6" {...base} />
      <path d="M12.6 2.4v3M11.1 3.9h3" {...accent} />
    </LineSvg>
  )
}

export function LineLayerIcon({ direction }: { direction: "forward" | "backward" }) {
  const forward = direction === "forward"
  return (
    <LineSvg>
      <rect x="2" y="2" width="7.6" height="7.6" rx="1" {...(forward ? base : accent)} />
      <rect
        x="6.4"
        y="6.4"
        width="7.6"
        height="7.6"
        rx="1"
        {...(forward ? accent : base)}
        fill={forward ? "var(--app-ribbon-card, #fff)" : "none"}
      />
    </LineSvg>
  )
}

export function LineRotateIcon() {
  return (
    <LineSvg>
      <path d="M3 8a5 5 0 1 0 1.6-3.7" {...base} />
      <path d="M3.6 1.8v2.8h2.8" {...accent} />
    </LineSvg>
  )
}

export function LineChartElementIcon() {
  return (
    <LineSvg>
      <path d="M2 13.6h9M3.8 13.6V8.4M6.6 13.6V5.2M9.4 13.6V9.6" {...base} />
      <path d="M12.6 1.8v4.4M10.4 4h4.4" {...accent} />
    </LineSvg>
  )
}

export function LineQuickLayoutIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2" width="12.4" height="12" rx="1.4" {...base} />
      <path d="M4 4.4h8" {...accent} />
      <path d="M4.6 12V9.4M7.2 12V7.6M9.8 12V8.6" {...base} />
    </LineSvg>
  )
}

export function LineChartStylesIcon() {
  return (
    <LineSvg>
      <path d="M2 13.6h12" {...base} />
      <rect x="3" y="7.6" width="2.6" height="6" {...base} />
      <rect x="6.8" y="3.4" width="2.6" height="10.2" {...accent} />
      <rect x="10.6" y="9" width="2.6" height="4.6" {...base} />
    </LineSvg>
  )
}

export function LineSwitchIcon() {
  return (
    <LineSvg>
      <path d="M2.6 5h10.4M10.6 2.6 13 5l-2.4 2.4" {...base} />
      <path d="M13.4 11H3M5.4 8.6 3 11l2.4 2.4" {...accent} />
    </LineSvg>
  )
}

export function LineChartTypeIcon() {
  return (
    <LineSvg>
      <circle cx="6" cy="9.4" r="4.4" {...base} />
      <path d="M6 5v4.4h4.4" {...accent} />
      <path d="M10.6 1.8h3.6v3.6" {...base} />
    </LineSvg>
  )
}

export function LineCubeIcon() {
  return (
    <LineSvg>
      <path d="M8 1.8 13.6 5v6L8 14.2 2.4 11V5Z" {...base} />
      <path d="M2.4 5 8 8.2 13.6 5M8 8.2v6" {...accent} />
    </LineSvg>
  )
}

export function LineCameraViewIcon() {
  return (
    <LineSvg>
      <rect x="1.6" y="4.4" width="9.2" height="7.2" rx="1.2" {...base} />
      <path d="m10.8 7 3.6-2v6l-3.6-2" {...accent} />
    </LineSvg>
  )
}

/* Context tabs: Header & Footer */

export function LineChromeIcon({ edge }: { edge: "header" | "footer" }) {
  return (
    <LineSvg>
      <path d="M3.6 1.8h8.8v12.4H3.6Z" {...base} />
      <path d={edge === "header" ? "M5.4 4.4h5.2" : "M5.4 11.6h5.2"} {...accent} strokeWidth={1.6} />
      <path d="M5.4 7.2h5.2M5.4 9h3.6" {...base} strokeWidth={0.9} />
    </LineSvg>
  )
}

export function LineGoToChromeIcon({ edge }: { edge: "header" | "footer" }) {
  const up = edge === "header"
  return (
    <LineSvg>
      <path d="M3.6 1.8h8.8v12.4H3.6Z" {...base} />
      <path d={up ? "M5.4 4.2h5.2" : "M5.4 11.8h5.2"} {...base} strokeWidth={1.6} />
      <path d={up ? "M8 11.6V6.8M6.2 8.6 8 6.8l1.8 1.8" : "M8 4.4v4.8M6.2 7.4 8 9.2l1.8-1.8"} {...accent} />
    </LineSvg>
  )
}

export function LineFirstPageIcon() {
  return (
    <LineSvg>
      <path d="M2.4 2.6h7.2v10.8H2.4Z" {...base} />
      <path d="M11.2 4.6h2.4v10H6.4" {...base} strokeWidth={0.9} />
      <path d="M5 5.6 6.2 4.6v5" {...accent} />
    </LineSvg>
  )
}

export function LineCloseIcon() {
  return (
    <LineSvg>
      <rect x="2" y="2" width="12" height="12" rx="2" fill="#c42b1c" />
      <path d="m5.6 5.6 4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
    </LineSvg>
  )
}

/* Context tabs: small commands */

export function LineAlignObjectsIcon() {
  return (
    <LineSvg>
      <path d="M2.4 1.8v12.4" {...accent} />
      <rect x="4.6" y="3.4" width="8.6" height="3.4" rx="0.8" {...base} />
      <rect x="4.6" y="9.2" width="5.6" height="3.4" rx="0.8" {...base} />
    </LineSvg>
  )
}

export function LineGroupIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1" {...base} strokeDasharray="1.4 1.4" />
      <rect x="4" y="4" width="4.4" height="4.4" rx="0.6" {...accent} />
      <circle cx="10.2" cy="10.2" r="2.2" {...accent} />
    </LineSvg>
  )
}

export function LineFormulaIcon() {
  return (
    <LineSvg>
      <path d="M8.4 2.6c-1.6-.4-2.6.4-2.8 2L4.6 12c-.2 1.4-1 1.8-2.2 1.4M3.6 6.4h4.6" {...base} />
      <path d="m9.4 7.6 4 5M13.4 7.6l-4 5" {...accent} />
    </LineSvg>
  )
}

export function LineTextBoxIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.2" {...base} />
      <path d="M5 5.6h6M8 5.6v5" {...accent} />
    </LineSvg>
  )
}

export function LineDistributeIcon({ axis }: { axis: "rows" | "columns" }) {
  return (
    <LineSvg>
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1" {...base} />
      <path d={axis === "rows" ? "M1.8 6h12.4M1.8 10h12.4" : "M6 1.8v12.4M10 1.8v12.4"} {...accent} />
    </LineSvg>
  )
}

export function LineConvertTextIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="1.8" width="5.6" height="5.6" rx="0.8" {...base} />
      <path d="M1.8 4.6h5.6M4.6 1.8v5.6" {...base} strokeWidth={0.9} />
      <path d="M9.4 9.4h4.8M9.4 12h3.2M5 9.4v2.6h2" {...accent} />
    </LineSvg>
  )
}

export function LineAutoFitIcon() {
  return (
    <LineSvg>
      <rect x="1.8" y="3" width="12.4" height="10" rx="1" {...base} />
      <path d="M4.2 8h7.6M5.8 6.4 4.2 8l1.6 1.6M10.2 6.4 11.8 8l-1.6 1.6" {...accent} />
    </LineSvg>
  )
}
