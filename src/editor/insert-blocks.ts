import { useViewStore } from "@/document/view"
import { chartSpecOf, defaultChartSpec, renderChart, serializeChartSpec, type ChartSpec } from "@/editor/chart-spec"
import { applyFrame, bindDrag, floatingAttributes, inlineMaxWidth, isFloating, resizeAttrs } from "@/editor/objects"
import { bindObjectResize } from "@/editor/object-resize"
import { bindRotate, ensureRotateHandle } from "@/editor/object-rotate"
import { chainWithSelection } from "@/editor/selection-memory"
import { paintShapeSvg, shapeStyleAttributes } from "@/editor/shape-style"
import { WORD_ART_PRESETS } from "@/editor/text-effects"
import { POINTS_BOX } from "@/editor/shape-points"
import { Mark, Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

export type ShapeKind = string
export type ChartKind = string
export type ModelKind = "cube" | "cylinder" | "pyramid" | "cone" | "sphere"
export type WordArtPreset = string

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    insertBlocks: {
      /** `chart`: a chart's whole spec (a chart template), in place of the variant's sample. */
      insertFigure: (
        kind: "shape" | "icon" | "model" | "chart",
        variant: string,
        values?: string,
        chart?: ChartSpec,
      ) => ReturnType
      insertWordArt: (preset: string) => ReturnType
      insertSignature: (name?: string, title?: string) => ReturnType
      insertBookmark: (name: string) => ReturnType
      insertNote: (kind: "footnote" | "endnote", text: string) => ReturnType
      insertFigureTable: () => ReturnType
      refreshFigureTable: () => ReturnType
    }
  }
}

const ICONS: Record<string, string> = {
  star: `<polygon points="8,1.4 9.8,6.2 15,6.4 11,9.6 12.4,14.6 8,11.8 3.6,14.6 5,9.6 1,6.4 6.2,6.2" fill="#f5b400"/>`,
  heart: `<path d="M8 13.6 2.6 8.4C1.2 7 1.4 4.6 3.1 3.4 4.6 2.3 6.6 2.6 8 4c1.4-1.4 3.4-1.7 4.9-.6 1.7 1.2 1.9 3.6.5 5L8 13.6Z" fill="#d13438"/>`,
  check: `<path d="M3 8.2 6.4 11.6 13 4.4" fill="none" stroke="#107c10" stroke-width="1.8" stroke-linecap="round"/>`,
  home: `<path d="M2 7.2 8 2.2 14 7.2V14H10V9.5H6V14H2Z" fill="#0f6cbd"/>`,
  mail: `<rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1" fill="#deecf9" stroke="#0f6cbd"/><path d="M2 4.2 8 9l6-4.8" fill="none" stroke="#0f6cbd"/>`,
  calendar: `<rect x="2" y="3" width="12" height="11" rx="1" fill="#fff" stroke="#ca5010"/><path d="M2 6.5h12" stroke="#ca5010"/><path d="M5 2v3M11 2v3" stroke="#ca5010" stroke-linecap="round"/>`,
  user: `<circle cx="8" cy="5.5" r="2.4" fill="#5b2c8e"/><path d="M3.2 13.4c.8-2.4 2.6-3.6 4.8-3.6s4 1.2 4.8 3.6" fill="none" stroke="#5b2c8e" stroke-width="1.3" stroke-linecap="round"/>`,
  pin: `<path d="M8 1.8a3.6 3.6 0 0 0-3.6 3.6c0 2.7 3.6 7.2 3.6 7.2s3.6-4.5 3.6-7.2A3.6 3.6 0 0 0 8 1.8Z" fill="#d83b01"/><circle cx="8" cy="5.4" r="1.2" fill="#fff"/>`,
  document: `<path d="M4 1.6h5.2L12.4 5v9.2H4z" fill="#fff" stroke="#0f6cbd"/><path d="M9.2 1.6V5H12.4" fill="#deecf9" stroke="#0f6cbd"/><path d="M5.4 7.4h5M5.4 9.4h5M5.4 11.4h3.2" stroke="#8a8a8a" stroke-width="0.7"/>`,
  chart: `<rect x="2" y="2" width="12" height="12" rx="1" fill="#fff" stroke="#0f6cbd"/><rect x="3.4" y="8" width="2" height="4" fill="#0f6cbd"/><rect x="6.4" y="5.4" width="2" height="6.6" fill="#107c10"/><rect x="9.4" y="7" width="2" height="5" fill="#ca5010"/>`,
  gear: `<circle cx="8" cy="8" r="2" fill="#fff" stroke="#5c5c5c"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4 11.2 4.8M4.8 11.2 3.4 12.6" stroke="#5c5c5c" stroke-width="1.1" stroke-linecap="round"/>`,
  flag: `<path d="M4 2.2v12" stroke="#242424" stroke-width="1.2"/><path d="M4.4 2.6h8.2L10.2 6l2.4 3.4H4.4z" fill="#d13438"/>`,
  bell: `<path d="M8 2.2a3.4 3.4 0 0 0-3.4 3.4v2.2L3.2 10.2h9.6L11.4 7.8V5.6A3.4 3.4 0 0 0 8 2.2Z" fill="#fff4ce" stroke="#c4a35a"/><path d="M6.8 11.4a1.4 1.4 0 0 0 2.4 0" stroke="#c4a35a"/>`,
  folder: `<path d="M1.6 4.2h4l1.2 1.4h7.6v7.2H1.6z" fill="#f5b400" stroke="#8a6116"/>`,
  phone: `<rect x="5" y="1.8" width="6" height="12.2" rx="1" fill="#242424"/><rect x="6" y="3.2" width="4" height="7.2" fill="#deecf9"/>`,
  clock: `<circle cx="8" cy="8" r="5.4" fill="#fff" stroke="#0f6cbd"/><path d="M8 5.2V8l2.2 1.6" stroke="#0f6cbd" stroke-width="1.1" stroke-linecap="round"/>`,
  cart: `<path d="M2 3.2h1.6l1.4 6.4h7.2l1.2-4H5" fill="none" stroke="#0f6cbd" stroke-width="1.1"/><circle cx="6.2" cy="12.4" r="1" fill="#242424"/><circle cx="11" cy="12.4" r="1" fill="#242424"/>`,
  lock: `<rect x="4" y="7" width="8" height="6.2" rx="0.8" fill="#f5b400"/><path d="M6 7V5.2a2 2 0 0 1 4 0V7" fill="none" stroke="#8a6116" stroke-width="1.1"/>`,
  camera: `<rect x="2" y="4.6" width="12" height="8" rx="1" fill="#242424"/><circle cx="8" cy="8.6" r="2.2" fill="#7eb6ff"/><path d="M6 4.6 7 3h2l1 1.6" fill="#242424"/>`,
  cloud: `<path d="M5 12h6.2a2.6 2.6 0 0 0 .4-5.2A3.4 3.4 0 0 0 5.2 8 2.2 2.2 0 0 0 5 12Z" fill="#deecf9" stroke="#0f6cbd"/>`,
  bookmark: `<path d="M4 2h8v12l-4-2.4L4 14z" fill="#c45911"/>`,
  lightbulb: `<path d="M8 1.8a3.6 3.6 0 0 0-2 6.6V10h4V8.4A3.6 3.6 0 0 0 8 1.8Z" fill="#fff4ce" stroke="#c4a35a"/><path d="M6.4 11.4h3.2M6.8 12.6h2.4" stroke="#c4a35a"/>`,
}

export const ICON_NAMES = Object.keys(ICONS)

export function iconMarkup(name: string) {
  return ICONS[name] ?? ICONS.star
}

const SHAPE_SVG: Record<string, string> = {
  rect: `<rect x="8" y="8" width="64" height="40" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  round: `<rect x="8" y="8" width="64" height="40" rx="10" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  snip: `<polygon points="8,8 58,8 72,22 72,48 8,48" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  ellipse: `<ellipse cx="40" cy="28" rx="34" ry="22" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  triangle: `<polygon points="40,6 74,50 6,50" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/>`,
  diamond: `<polygon points="40,6 74,28 40,50 6,28" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  hexagon: `<polygon points="22,8 58,8 74,28 58,48 22,48 6,28" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  plus: `<path d="M32 8h16v12h12v16H48v12H32V36H20V20h12z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  heart: `<path d="M40 46 14 26c-6-7-1-16 8-16 6 0 10 4 18 12 8-8 12-12 18-12 9 0 14 9 8 16z" fill="#f4b6c2" stroke="#c45911" stroke-width="2"/>`,
  arrow: `<polygon points="4,22 48,22 48,10 76,28 48,46 48,34 4,34" fill="#0f6cbd"/>`,
  "left-arrow": `<polygon points="76,22 32,22 32,10 4,28 32,46 32,34 76,34" fill="#0f6cbd"/>`,
  "up-arrow": `<polygon points="28,52 28,24 16,24 40,4 64,24 52,24 52,52" fill="#0f6cbd"/>`,
  chevron: `<polygon points="8,8 48,8 72,28 48,48 8,48 28,28" fill="#0f6cbd"/>`,
  line: `<line x1="6" y1="28" x2="74" y2="28" stroke="#242424" stroke-width="3" stroke-linecap="round"/>`,
  "arrow-line": `<line x1="6" y1="28" x2="68" y2="28" stroke="#242424" stroke-width="3"/><polygon points="64,20 76,28 64,36" fill="#242424"/>`,
  elbow: `<polyline points="8,12 8,40 72,40" fill="none" stroke="#242424" stroke-width="3"/>`,
  "plus-eq": `<text x="40" y="36" text-anchor="middle" font-size="28" fill="#0f6cbd">+</text>`,
  minus: `<text x="40" y="36" text-anchor="middle" font-size="28" fill="#0f6cbd">−</text>`,
  equal: `<text x="40" y="36" text-anchor="middle" font-size="28" fill="#0f6cbd">=</text>`,
  process: `<rect x="10" y="12" width="60" height="32" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  decision: `<polygon points="40,6 74,28 40,50 6,28" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/>`,
  terminator: `<rect x="8" y="14" width="64" height="28" rx="14" fill="#e2efda" stroke="#548235" stroke-width="2"/>`,
  data: `<polygon points="18,12 74,12 62,44 6,44" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  star: `<polygon points="40,4 48,22 68,22 52,34 58,52 40,42 22,52 28,34 12,22 32,22" fill="#ffc000" stroke="#bf8f00" stroke-width="2"/>`,
  burst: `<polygon points="40,15 30.9,6 27.1,16.4 1.4,6 17.1,19.7 0,22.3 13.8,30.5 0.5,37.8 21,36.1 17.6,45.7 28.6,40.5 31.4,56 39,38.7 49.1,51.2 51.9,37.5 67.2,46.9 62.4,33.6 80,34.5 65.2,27.2 78.1,21.1 61.9,19 68.1,11.6 52.4,13.8 53.8,0" fill="#ed7d31" stroke="#c45911" stroke-width="2"/>`,
  banner: `<path d="M6 16h68v24H6l8-12z" fill="#5b9bd5" stroke="#2e75b6" stroke-width="2"/>`,
  callout: `<path d="M8 8h64v28H28l-10 12v-12H8z" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  "oval-callout": `<ellipse cx="40" cy="24" rx="30" ry="16" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><path d="M24 36 16 50l14-8" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  curve: `<path d="M8 40 C20 8 36 48 72 12" fill="none" stroke="#242424" stroke-width="3" stroke-linecap="round"/>`,
  "double-arrow": `<line x1="12" y1="28" x2="68" y2="28" stroke="#242424" stroke-width="3"/><polygon points="16,20 4,28 16,36" fill="#242424"/><polygon points="64,20 76,28 64,36" fill="#242424"/>`,
  "round-single": `<path d="M8 22 Q8 8 24 8 H72 V48 H8 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "snip-round": `<path d="M8 8 H52 L72 24 V38 Q72 48 60 48 H8 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  parallelogram: `<polygon points="18,10 74,10 62,46 6,46" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  trapezoid: `<polygon points="22,10 58,10 74,46 6,46" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  pentagon: `<polygon points="40,6 72,28 60,52 20,52 8,28" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  octagon: `<polygon points="24,8 56,8 72,22 72,40 56,50 24,50 8,40 8,22" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  moon: `<path d="M48 8 A22 22 0 1 0 48 48 A16 16 0 1 1 48 8Z" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/>`,
  cloud: `<path d="M24 40h36a12 12 0 0 0 2-23 16 16 0 0 0-30-2 10 10 0 0 0-8 25Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  donut: `<path d="M40 8 A20 20 0 1 0 40.1 8 Z M40 18 A10 10 0 1 1 39.9 18 Z" fill="#f4b183" fill-rule="evenodd" stroke="#c45911" stroke-width="2"/>`,
  lightning: `<polygon points="31.4,0 0,10.1 28.2,21.7 18.6,25.2 45.3,36 37.1,38.7 80,56 54.7,33.4 61.4,31.1 40.9,17.6 47.6,15.8" fill="#ffc000" stroke="#bf8f00" stroke-width="2"/>`,
  "cube-shape": `<polygon points="18,20 40,8 62,20 40,32" fill="#9cc7f0" stroke="#0f6cbd"/><polygon points="18,20 40,32 40,50 18,38" fill="#0f6cbd"/><polygon points="62,20 40,32 40,50 62,38" fill="#5aa2e0"/>`,
  can: `<ellipse cx="40" cy="16" rx="22" ry="8" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/><path d="M18 16 v24 a22 8 0 0 0 44 0 V16" fill="#9cc7f0" stroke="#0f6cbd" stroke-width="2"/>`,
  smiley: `<circle cx="40" cy="28" r="20" fill="#fff4ce" stroke="#c4a35a" stroke-width="2"/><circle cx="32" cy="22" r="2" fill="#242424"/><circle cx="48" cy="22" r="2" fill="#242424"/><path d="M30 32 Q40 42 50 32" fill="none" stroke="#242424" stroke-width="2"/>`,
  plaque: `<path d="M16 10 H64 Q74 10 74 20 V36 Q74 46 64 46 H16 Q6 46 6 36 V20 Q6 10 16 10 Z" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  "down-arrow": `<polygon points="28,4 52,4 52,28 64,28 40,52 16,28 28,28" fill="#0f6cbd"/>`,
  "left-right": `<polygon points="4,28 18,16 18,22 62,22 62,16 76,28 62,40 62,34 18,34 18,40" fill="#0f6cbd"/>`,
  "up-down": `<polygon points="40,4 52,16 46,16 46,40 52,40 40,52 28,40 34,40 34,16 28,16" fill="#0f6cbd"/>`,
  "bent-arrow": `<path d="M18 46 V22 H48 V12 L68 26 48 40 V30 H26 V46 Z" fill="#0f6cbd"/>`,
  notched: `<polygon points="4,16 56,16 72,28 56,40 4,40 16,28" fill="#0f6cbd"/>`,
  "striped-arrow": `<polygon points="4,20 48,20 48,10 76,28 48,46 48,36 4,36" fill="#0f6cbd"/><rect x="10" y="20" width="6" height="16" fill="#deecf9"/>`,
  multiply: `<text x="40" y="38" text-anchor="middle" font-size="28" fill="#0f6cbd">×</text>`,
  divide: `<text x="40" y="38" text-anchor="middle" font-size="28" fill="#0f6cbd">÷</text>`,
  "not-equal": `<text x="40" y="38" text-anchor="middle" font-size="28" fill="#0f6cbd">≠</text>`,
  document: `<path d="M16 8 H64 V48 H16 Z M16 16 H64" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  preparation: `<polygon points="16,8 64,8 72,28 64,48 16,48 8,28" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/>`,
  "manual-input": `<polygon points="16,18 72,8 72,48 16,48" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  display: `<path d="M16 14 H56 L72 28 56 42 H16 Z" fill="#e2efda" stroke="#548235" stroke-width="2"/>`,
  delay: `<path d="M12 12 H48 A16 16 0 0 1 48 44 H12 Z" fill="#fce4d6" stroke="#c45911" stroke-width="2"/>`,
  "stored-data": `<path d="M24 12 H68 V44 H24 A12 16 0 0 1 24 12 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  star4: `<polygon points="40,4 46,22 68,28 46,34 40,52 34,34 12,28 34,22" fill="#ffc000" stroke="#bf8f00" stroke-width="2"/>`,
  star6: `<polygon points="40,4 48,18 64,18 52,28 58,44 40,34 22,44 28,28 16,18 32,18" fill="#ffc000" stroke="#bf8f00" stroke-width="2"/>`,
  star8: `<polygon points="40,4 46,16 58,10 54,22 68,22 58,30 66,42 52,38 48,52 40,42 32,52 28,38 14,42 22,30 12,22 26,22 22,10 34,16" fill="#ffc000" stroke="#bf8f00"/>`,
  wave: `<path d="M6 28 Q16 12 26 28 T46 28 T66 28 T76 20 V40 Q66 48 56 36 T36 36 T16 36 T6 44 Z" fill="#5b9bd5" stroke="#2e75b6" stroke-width="2"/>`,
  scroll: `<path d="M18 14 H62 Q70 14 70 22 V40 Q70 48 62 48 H22 Q14 48 14 40 V22 Q14 14 22 14" fill="#fff8e8" stroke="#bf8f00" stroke-width="2"/>`,
  "rounded-callout": `<rect x="10" y="8" width="60" height="28" rx="8" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><path d="M24 36 14 50 32 36" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  "cloud-callout": `<path d="M22 36h34a10 10 0 0 0 1-19 14 14 0 0 0-26-2 8 8 0 0 0-9 21Z" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><circle cx="24" cy="44" r="3" fill="#fff" stroke="#0f6cbd"/><circle cx="18" cy="50" r="2" fill="#fff" stroke="#0f6cbd"/>`,
  "line-callout": `<rect x="28" y="8" width="40" height="22" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><polyline points="28,24 12,40 20,28" fill="none" stroke="#0f6cbd" stroke-width="2"/>`,
  arc: `<path d="M10 40 A28 28 0 0 1 70 40" fill="none" stroke="#242424" stroke-width="3"/>`,
  scribble: `<path d="M8 30 C16 10 24 46 34 24 S52 8 72 32" fill="none" stroke="#242424" stroke-width="2"/>`,
  connector: `<polyline points="8,16 28,16 28,40 72,40" fill="none" stroke="#242424" stroke-width="3"/>`,
  "elbow-arrow": `<polyline points="8,14 8,40 64,40" fill="none" stroke="#242424" stroke-width="3"/><polygon points="60,32 74,40 60,48" fill="#242424"/>`,
  "curve-arrow": `<path d="M10 42 C22 8 48 8 64 28" fill="none" stroke="#242424" stroke-width="3"/><polygon points="58,18 74,30 56,34" fill="#242424"/>`,
  freeform: `<polygon points="10,40 22,12 40,28 58,8 72,36 48,48" fill="none" stroke="#242424" stroke-width="2"/>`,
  "round-top": `<path d="M8 28 Q8 8 40 8 Q72 8 72 28 V48 H8 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "snip-corner": `<polygon points="8,8 56,8 72,24 72,48 8,48" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "round-diag": `<path d="M8 22 Q8 8 24 8 H72 V34 Q72 48 56 48 H8 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "same-round": `<path d="M20 8 H60 Q72 8 72 20 V36 Q72 48 60 48 H20 Q8 48 8 36 V20 Q8 8 20 8 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  frame: `<path d="M10 10 H70 V46 H10 Z M22 20 H58 V36 H22 Z" fill="#deecf9" fill-rule="evenodd" stroke="#0f6cbd" stroke-width="2"/>`,
  "pie-shape": `<path d="M40 28 L40 6 A22 22 0 0 1 62 36 Z" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/>`,
  teardrop: `<path d="M40 6 C58 20 62 32 40 50 C18 32 22 20 40 6 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "bracket-left": `<path d="M28 8 H18 V48 H28" fill="none" stroke="#242424" stroke-width="3"/>`,
  "bracket-right": `<path d="M52 8 H62 V48 H52" fill="none" stroke="#242424" stroke-width="3"/>`,
  "brace-left": `<path d="M34 8 H26 Q18 8 18 16 V22 Q18 28 10 28 Q18 28 18 34 V40 Q18 48 26 48 H34" fill="none" stroke="#242424" stroke-width="2"/>`,
  "brace-right": `<path d="M46 8 H54 Q62 8 62 16 V22 Q62 28 70 28 Q62 28 62 34 V40 Q62 48 54 48 H46" fill="none" stroke="#242424" stroke-width="2"/>`,
  sun: `<circle cx="40" cy="28" r="10" fill="#fff4ce" stroke="#c4a35a" stroke-width="2"/><path d="M40 8 V14 M40 42 V50 M18 28 H12 M68 28 H62 M22 12 L26 16 M58 40 L54 36 M22 44 L26 40 M58 16 L54 20" stroke="#c4a35a" stroke-width="2"/>`,
  "block-arc": `<path d="M16 40 A26 26 0 1 1 64 40 L52 40 A14 14 0 1 0 28 40 Z" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "no-sign": `<circle cx="40" cy="28" r="18" fill="none" stroke="#d13438" stroke-width="3"/><line x1="26" y1="40" x2="54" y2="16" stroke="#d13438" stroke-width="3"/>`,
  "quad-arrow": `<polygon points="40,4 50,16 44,16 44,22 56,22 56,16 66,28 56,40 56,34 44,34 44,40 50,40 40,52 30,40 36,40 36,34 24,34 24,40 14,28 24,16 24,22 36,22 36,16 30,16" fill="#0f6cbd"/>`,
  uturn: `<path d="M22 44 V24 A14 14 0 0 1 50 24 V36 H40 L52 48 L64 36 H54 V24 A18 18 0 0 0 18 24 V44 Z" fill="#0f6cbd"/>`,
  "left-up": `<polygon points="8,28 24,12 24,20 52,20 52,44 40,44 40,32 24,32 24,40" fill="#0f6cbd"/>`,
  "chevron-left": `<polygon points="72,8 32,8 8,28 32,48 72,48 52,28" fill="#0f6cbd"/>`,
  "flow-or": `<circle cx="40" cy="28" r="16" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><path d="M40 14 V42 M26 28 H54" stroke="#0f6cbd"/>`,
  "flow-merge": `<polygon points="12,10 68,10 40,46" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/>`,
  "flow-sort": `<polygon points="40,6 70,28 40,50 10,28" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/><path d="M22 28 H58" stroke="#8a6116"/>`,
  "flow-extract": `<polygon points="12,44 68,44 40,10" fill="#e2efda" stroke="#548235" stroke-width="2"/>`,
  "flow-collate": `<polygon points="16,8 64,8 40,28 64,48 16,48 40,28" fill="#fce4d6" stroke="#c45911" stroke-width="2"/>`,
  "flow-disk": `<ellipse cx="40" cy="28" rx="22" ry="14" fill="#deecf9" stroke="#0f6cbd" stroke-width="2"/><ellipse cx="40" cy="28" rx="6" ry="4" fill="#fff" stroke="#0f6cbd"/>`,
  "flow-card": `<polygon points="16,16 64,8 64,44 16,44" fill="#fff" stroke="#0f6cbd" stroke-width="2"/>`,
  "flow-sum": `<rect x="16" y="12" width="48" height="32" fill="#fff4ce" stroke="#8a6116" stroke-width="2"/><path d="M24 20 H52 M24 36 H52 M28 16 V40" stroke="#8a6116"/>`,
  star7: `<polygon points="40,4 46,18 62,14 52,26 64,36 48,36 40,50 32,36 16,36 28,26 18,14 34,18" fill="#ffc000" stroke="#bf8f00" stroke-width="2"/>`,
  star12: `<polygon points="40,4 44,16 56,8 50,20 64,18 54,28 66,36 52,36 56,48 44,40 40,52 36,40 24,48 28,36 14,36 26,28 16,18 30,20 24,8 36,16" fill="#ffc000" stroke="#bf8f00"/>`,
  star16: `<polygon points="40,2 43,12 52,6 48,16 58,12 52,22 64,22 54,28 64,34 52,34 58,44 48,40 52,50 43,44 40,54 37,44 28,50 32,40 22,44 28,34 16,34 26,28 16,22 28,22 22,12 32,16 28,6 37,12" fill="#ffc000" stroke="#bf8f00"/>`,
  "ribbon-up": `<path d="M8 22 H72 V40 H8 L16 31 Z" fill="#c45911" stroke="#833c0c" stroke-width="2"/>`,
  "double-wave": `<path d="M6 22 Q16 10 26 22 T46 22 T66 22 T76 16 V34 Q66 46 56 34 T36 34 T16 34 T6 40 Z" fill="#5b9bd5" stroke="#2e75b6" stroke-width="2"/>`,
  "callout-accent": `<rect x="22" y="8" width="48" height="24" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><path d="M22 8 V32" stroke="#c45911" stroke-width="4"/><polyline points="22,26 10,42" fill="none" stroke="#0f6cbd" stroke-width="2"/>`,
  "callout-2": `<rect x="30" y="6" width="40" height="20" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><polyline points="34,26 16,44 22,26" fill="none" stroke="#0f6cbd" stroke-width="2"/>`,
  "callout-3": `<rect x="26" y="8" width="44" height="22" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><polyline points="30,30 8,46 18,30" fill="none" stroke="#0f6cbd" stroke-width="2"/><polyline points="48,30 62,46" fill="none" stroke="#0f6cbd" stroke-width="2"/>`,
  "callout-border": `<rect x="20" y="8" width="50" height="24" fill="#fff" stroke="#0f6cbd" stroke-width="2"/><path d="M20 8 H28" stroke="#c45911" stroke-width="4"/><polyline points="24,32 10,48" fill="none" stroke="#0f6cbd" stroke-width="2"/>`,
}

export const SHAPE_NAMES = Object.keys(SHAPE_SVG)

/** A shape drawn from its points, in the colours and outline weight of the gallery drawing it came from. */
export function pointsMarkup(variant: string, points: string) {
  const markup = shapeMarkup(variant)
  const fill = /\bfill="(#[0-9a-fA-F]{6})"/.exec(markup)?.[1] ?? "#deecf9"
  const stroke = /\bstroke="(#[0-9a-fA-F]{6})"/.exec(markup)?.[1] ?? ""
  const open = !/[Zz]\s*$/.test(points.trim()) && /\bfill="none"/.test(markup)
  return `<path data-shape-points="" d="${points.replace(/"/g, "")}" fill="${open ? "none" : fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ""}/>`
}

export function shapeMarkup(kind: string) {
  return SHAPE_SVG[kind] ?? SHAPE_SVG.rect
}

function shapeSvg(kind: string) {
  return shapeMarkup(kind)
}

const VIEW_BOXES = new Map<string, string>()

/**
 * The box a shape's drawing fills, as Word fills a preset's extent: the drawing's own bounds (its strokes aside),
 * measured once in a hidden SVG. The drawings' 80 by 56 frame where nothing can measure (jsdom).
 */
export function shapeViewBox(variant: string) {
  const cached = VIEW_BOXES.get(variant)
  if (cached) {
    return cached
  }
  let box = "0 0 80 56"
  const measurable =
    typeof document !== "undefined" &&
    typeof SVGGraphicsElement !== "undefined" &&
    typeof SVGGraphicsElement.prototype.getBBox === "function"
  if (measurable) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 80 56")
    svg.setAttribute("width", "80")
    svg.setAttribute("height", "56")
    svg.style.cssText = "position:absolute;left:-1000px;top:-1000px;visibility:hidden;pointer-events:none"
    svg.innerHTML = shapeMarkup(variant)
    document.body.append(svg)
    try {
      const bounds = svg.getBBox()
      if (bounds.width > 0 && bounds.height > 0) {
        const round = (value: number) => Math.round(value * 100) / 100
        box = `${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}`
      }
    } catch {
      // Not measurable here; the frame stays.
    } finally {
      svg.remove()
    }
  }
  VIEW_BOXES.set(variant, box)
  return box
}

export const MODEL_NAMES: ModelKind[] = ["cube", "cylinder", "pyramid", "cone", "sphere"]

function modelSvg(kind: string) {
  if (kind === "cylinder") {
    return `<ellipse cx="40" cy="16" rx="22" ry="8" fill="#7eb6ff"/><path d="M18 16v24c0 4.4 9.8 8 22 8s22-3.6 22-8V16" fill="#0f6cbd"/><ellipse cx="40" cy="16" rx="22" ry="8" fill="none" stroke="#083e6e"/>`
  }
  if (kind === "pyramid") {
    return `<polygon points="40,8 70,48 10,48" fill="#f4b183"/><polygon points="40,8 70,48 40,36" fill="#c65911"/>`
  }
  if (kind === "cone") {
    return `<ellipse cx="40" cy="44" rx="22" ry="7" fill="#f4b183"/><polygon points="40,6 62,44 18,44" fill="#c45911"/><ellipse cx="40" cy="44" rx="22" ry="7" fill="none" stroke="#833c0c"/>`
  }
  if (kind === "sphere") {
    return `<circle cx="40" cy="28" r="20" fill="#9cc7f0"/><ellipse cx="40" cy="28" rx="20" ry="20" fill="none" stroke="#0f6cbd"/><path d="M22 24c6 4 14 4 22-2" fill="none" stroke="#fff" stroke-width="2"/>`
  }
  return `<polygon points="18,24 40,12 62,24 40,36" fill="#9cc7f0"/><polygon points="18,24 40,36 40,54 18,42" fill="#0f6cbd"/><polygon points="62,24 40,36 40,54 62,42" fill="#5aa2e0"/>`
}

/** Word's size for a new chart: 6 by 3.5 inches. */
export const CHART_WIDTH = 576
export const CHART_HEIGHT = 336

/** The open shapes (lines, arrows, brackets, curves) hold no text. */
const NO_TEXT = new Set([
  "line",
  "arrow-line",
  "elbow",
  "curve",
  "double-arrow",
  "arc",
  "scribble",
  "connector",
  "elbow-arrow",
  "curve-arrow",
  "freeform",
  "bracket-left",
  "bracket-right",
  "brace-left",
  "brace-right",
])

export function holdsText(variant: string) {
  return !NO_TEXT.has(variant)
}

/** The colour a shape's text takes unless one was chosen: dark on a light fill, white on a dark one. */
function autoTextColor(node: ProseNode) {
  const own = String(node.attrs.fill || "")
  const fill = /^#[0-9a-f]{6}$/i.test(own)
    ? own
    : (/\bfill="(#[0-9a-fA-F]{6})"/.exec(shapeMarkup(String(node.attrs.variant)))?.[1] ?? "")
  if (!fill) {
    return "#242424"
  }
  const value = Number.parseInt(fill.slice(1), 16)
  const luminance = (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255
  return luminance < 0.5 ? "#ffffff" : "#242424"
}

/** The text a shape holds, centred over it. Double-click edits it (see `editShapeText`). */
function paintShapeText(dom: HTMLElement, node: ProseNode) {
  const text = String(node.attrs.text || "")
  if (!text) {
    return
  }
  const holder = document.createElement("div")
  holder.className = "figure-text"
  holder.contentEditable = "false"
  holder.textContent = text
  holder.style.color = String(node.attrs.textColor || "") || autoTextColor(node)
  holder.style.fontSize = `${(Number(node.attrs.textSize) || 14) * (4 / 3)}px`
  holder.style.fontWeight = node.attrs.textBold ? "700" : ""
  holder.style.fontFamily = String(node.attrs.textFont || "")
  dom.append(holder)
}

function paintFigure(dom: HTMLElement, node: ProseNode) {
  const kind = String(node.attrs.kind || "shape")
  const variant = String(node.attrs.variant || "rect")
  const points = kind === "shape" ? String(node.attrs.points || "") : ""
  let body = points ? pointsMarkup(variant, points) : shapeSvg(variant)
  if (kind === "icon") {
    body = ICONS[variant] ?? ICONS.star
  } else if (kind === "model") {
    body = modelSvg(variant)
  }
  const width =
    Number(node.attrs.width) || (kind === "icon" ? 28 : kind === "chart" ? CHART_WIDTH : kind === "model" ? 140 : 120)
  const height =
    Number(node.attrs.height) || (kind === "icon" ? 28 : kind === "chart" ? CHART_HEIGHT : kind === "model" ? 100 : 72)
  if (kind === "chart") {
    // A chart is drawn at its own size, so its text stays the size Word gives it (20.8).
    body = renderChart(chartSpecOf(node.attrs), width, height)
  }
  const box =
    kind === "icon"
      ? "0 0 16 16"
      : kind === "chart"
        ? `0 0 ${width} ${height}`
        : points
          ? `0 0 ${POINTS_BOX} ${POINTS_BOX}`
          : kind === "shape"
            ? shapeViewBox(variant)
            : "0 0 80 56"
  // A shape fills its box whatever the box's proportions, as Word stretches a preset to its extent (22.11).
  const stretch = kind === "shape" ? ' preserveAspectRatio="none"' : ""
  const src = String(node.attrs.src || "")
  if ((kind === "model" || kind === "icon") && src) {
    const image = document.createElement("img")
    image.src = src
    image.alt = String(node.attrs.alt || "")
    image.draggable = false
    image.width = width
    image.height = height
    dom.replaceChildren(image)
  } else {
    dom.innerHTML = `<svg viewBox="${box}"${stretch} width="${width}" height="${height}" aria-hidden>${body}</svg>`
  }
  // Shapes and icons take Word's shape formatting (20.9): fill, outline, arrows, effects and flips.
  const styled = kind === "shape" || (kind === "icon" && !src)
  const svg = dom.querySelector("svg")
  if (styled && svg) {
    paintShapeSvg(svg, node.attrs, { width, height })
  }
  if (kind === "shape" && holdsText(variant)) {
    paintShapeText(dom, node)
  }
  dom.dataset.kind = kind
  dom.classList.toggle("is-spinning", Boolean(node.attrs.spin))
  const rotate = Number(node.attrs.rotate) || 0
  dom.style.transform = rotate ? `rotate(${rotate}deg)` : ""
  dom.style.filter = !styled && node.attrs.effect === "shadow" ? "drop-shadow(3px 4px 2px rgba(0,0,0,.35))" : ""
  const stroke = String(node.attrs.stroke || "")
  dom.style.outline = stroke && kind === "model" ? `2px solid ${stroke}` : ""
  const alt = String(node.attrs.alt || "")
  if (alt) {
    dom.setAttribute("title", alt)
  } else {
    dom.removeAttribute("title")
  }
}

export const Bookmark = Mark.create({
  name: "bookmark",
  inclusive: false,
  keepOnSplit: false,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-bookmark") || element.getAttribute("id") || "",
        renderHTML: (attributes) =>
          attributes.id
            ? { "data-bookmark": attributes.id, id: `bm-${String(attributes.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` }
            : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-bookmark]" }, { tag: "span.bookmark-anchor[id]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "bookmark-anchor" }), 0]
  },
})

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: {
        default: "shape",
        parseHTML: (element) => element.getAttribute("data-kind") || "shape",
        renderHTML: (attributes) => ({ "data-kind": attributes.kind }),
      },
      variant: {
        default: "rect",
        parseHTML: (element) => element.getAttribute("data-variant") || "rect",
        renderHTML: (attributes) => ({ "data-variant": attributes.variant }),
      },
      /**
       * Edit Points: the shape's outline as points (an SVG path in a 100 by 100 box stretched to the shape), which
       * then replaces the gallery's drawing; empty for a shape drawn as the gallery draws it.
       */
      points: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-points") || "",
        renderHTML: (attributes) => (attributes.points ? { "data-points": attributes.points } : {}),
      },
      values: {
        default: "8,14,11",
        parseHTML: (element) => element.getAttribute("data-values") || "8,14,11",
        renderHTML: (attributes) => ({ "data-values": attributes.values }),
      },
      fill: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-fill") || "",
        renderHTML: (attributes) => (attributes.fill ? { "data-fill": attributes.fill } : {}),
      },
      accent: {
        default: "#0f6cbd",
        parseHTML: (element) => element.getAttribute("data-accent") || "#0f6cbd",
        renderHTML: (attributes) => ({ "data-accent": attributes.accent || "#0f6cbd" }),
      },
      spin: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-spin") === "1",
        renderHTML: (attributes) => (attributes.spin ? { "data-spin": "1" } : {}),
      },
      chrome: {
        default: "axes",
        parseHTML: (element) => element.getAttribute("data-chrome") || "axes",
        renderHTML: (attributes) => ({ "data-chrome": attributes.chrome || "axes" }),
      },
      stroke: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-stroke") || "",
        renderHTML: (attributes) => (attributes.stroke ? { "data-stroke": attributes.stroke } : {}),
      },
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-src") || "",
        renderHTML: (attributes) => (attributes.src ? { "data-src": attributes.src } : {}),
      },
      rotate: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-rotate")) || 0,
        renderHTML: (attributes) => (Number(attributes.rotate) ? { "data-rotate": String(attributes.rotate) } : {}),
      },
      width: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-width")) || 0,
        renderHTML: (attributes) => (Number(attributes.width) > 0 ? { "data-width": String(attributes.width) } : {}),
      },
      height: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-height")) || 0,
        renderHTML: (attributes) => (Number(attributes.height) > 0 ? { "data-height": String(attributes.height) } : {}),
      },
      effect: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-effect") || "",
        renderHTML: (attributes) => (attributes.effect ? { "data-effect": attributes.effect } : {}),
      },
      /** Text a shape holds, one paragraph per line; drawn centred in it. */
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text") || "",
        renderHTML: (attributes) => (attributes.text ? { "data-text": attributes.text } : {}),
      },
      /** The shape text's own colour (a hex), size in points and weight; empty or 0 is the default. */
      textColor: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text-color") || "",
        renderHTML: (attributes) => (attributes.textColor ? { "data-text-color": attributes.textColor } : {}),
      },
      textFont: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text-font") || "",
        renderHTML: (attributes) => (attributes.textFont ? { "data-text-font": attributes.textFont } : {}),
      },
      textSize: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-text-size")) || 0,
        renderHTML: (attributes) =>
          Number(attributes.textSize) > 0 ? { "data-text-size": String(attributes.textSize) } : {},
      },
      textBold: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-text-bold") === "1",
        renderHTML: (attributes) => (attributes.textBold ? { "data-text-bold": "1" } : {}),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-alt") || "",
        renderHTML: (attributes) => (attributes.alt ? { "data-alt": attributes.alt } : {}),
      },
      /** A chart's spec (20.8), as JSON: its data, elements and formatting. */
      chart: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-chart") || "",
        renderHTML: (attributes) => (attributes.chart ? { "data-chart": attributes.chart } : {}),
      },
      /** The spec a chart opened from Word had, to keep Word's own chart parts while it is unchanged. */
      wordChart: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-word-chart") || "",
        renderHTML: (attributes) => (attributes.wordChart ? { "data-word-chart": attributes.wordChart } : {}),
      },
      /** What a shape opened from Word looked like, to keep Word's own drawing while the app has not formatted it. */
      wordShape: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-word-shape") || "",
        renderHTML: (attributes) => (attributes.wordShape ? { "data-word-shape": attributes.wordShape } : {}),
      },
      ...floatingAttributes("inline"),
      ...shapeStyleAttributes(),
    }
  },
  parseHTML() {
    return [{ tag: "div[data-figure]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-figure": "", class: "insert-figure" })]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div")
      dom.className = "insert-figure"
      dom.contentEditable = "false"
      const paint = (next: ProseNode) => {
        paintFigure(dom, next)
        placeFigure(dom, next)
        ensureFigureResizeHandles(dom)
        ensureRotateHandle(dom)
      }
      paint(node)
      let current = node
      let editing = false
      // Double-click a shape to type in it: the text sits centred over the shape and is kept as the `text` attribute.
      const edit = () => {
        if (editing || current.attrs.kind !== "shape" || !holdsText(String(current.attrs.variant))) {
          return
        }
        editing = true
        let holder = dom.querySelector<HTMLElement>(".figure-text")
        if (!holder) {
          holder = document.createElement("div")
          holder.className = "figure-text"
          holder.style.color = String(current.attrs.textColor || "") || autoTextColor(current)
          holder.style.fontSize = `${(Number(current.attrs.textSize) || 14) * (4 / 3)}px`
          holder.style.fontFamily = String(current.attrs.textFont || "")
          dom.append(holder)
        }
        const field = holder
        field.contentEditable = "true"
        field.classList.add("is-editing")
        field.focus()
        const range = document.createRange()
        range.selectNodeContents(field)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        const finish = (keep: boolean) => {
          if (!editing) {
            return
          }
          editing = false
          field.removeEventListener("blur", onBlur)
          field.removeEventListener("keydown", onKey)
          const text = (field.innerText ?? field.textContent ?? "").replace(/\n+$/, "")
          field.contentEditable = "false"
          field.classList.remove("is-editing")
          const pos = typeof getPos === "function" ? getPos() : null
          if (keep && typeof pos === "number" && text !== String(current.attrs.text || "")) {
            editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, text }))
          } else {
            paint(current)
          }
          editor.view.focus()
        }
        const onBlur = () => finish(true)
        const onKey = (event: KeyboardEvent) => {
          event.stopPropagation()
          if (event.key === "Escape") {
            event.preventDefault()
            finish(false)
          }
        }
        field.addEventListener("blur", onBlur)
        field.addEventListener("keydown", onKey)
      }
      dom.addEventListener("dblclick", edit)
      const stopDrag = bindDrag(
        dom,
        editor.view,
        () => {
          const pos = typeof getPos === "function" ? getPos() : null
          return typeof pos === "number" ? pos : undefined
        },
        { body: true },
      )
      const stopRotate = bindRotate(dom, editor.view, () => {
        const pos = typeof getPos === "function" ? getPos() : null
        return typeof pos === "number" ? pos : undefined
      })
      const stopResize = bindObjectResize(
        dom,
        editor.view,
        () => {
          const pos = typeof getPos === "function" ? getPos() : null
          return typeof pos === "number" ? pos : undefined
        },
        {
          types: ["figure"],
          start: (current) => {
            const rect = dom.querySelector<HTMLElement>("svg, img")?.getBoundingClientRect()
            const zoom = useViewStore.getState().zoom || 1
            return {
              width: Number(current.attrs.width) || Math.round((rect?.width ?? 0) / zoom),
              height: Number(current.attrs.height) || Math.round((rect?.height ?? 0) / zoom),
            }
          },
          attrs: resizeAttrs,
          max: inlineMaxWidth,
        },
      )
      return {
        dom,
        update(next) {
          if (next.type.name !== "figure") {
            return false
          }
          current = next
          if (!editing) {
            paint(next)
          }
          return true
        },
        stopEvent: (event) =>
          editing && event.target instanceof Element && Boolean(event.target.closest(".figure-text")),
        // Its drawing has no content to read back: a change to it (Edit Points redraws the outline as it is dragged)
        // is not an edit.
        ignoreMutation: (mutation) => editing || mutation.type !== "selection",
        destroy() {
          dom.removeEventListener("dblclick", edit)
          stopRotate()
          stopDrag()
          stopResize()
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
        },
      }
    }
  },
})

/** A figure in line sits in the text's flow; one that floats is placed on its page like a picture. */
function placeFigure(dom: HTMLElement, node: ProseNode) {
  const selected = dom.classList.contains("ProseMirror-selectednode") ? " ProseMirror-selectednode" : ""
  const rotating = ["is-rotating", "is-resizing"]
    .filter((name) => dom.classList.contains(name))
    .map((name) => ` ${name}`)
    .join("")
  if (!isFloating(node)) {
    dom.className = `insert-figure${selected}${rotating}${node.attrs.spin ? " is-spinning" : ""}`
    Object.assign(dom.style, { position: "", left: "", top: "", zIndex: "" })
    return
  }
  const behind = node.attrs.wrap === "behind" ? " object-behind" : ""
  dom.className = `insert-figure object-frame${behind}${selected}${rotating}${node.attrs.spin ? " is-spinning" : ""}`
  applyFrame(dom, node)
  const handle = document.createElement("div")
  handle.className = "object-handle"
  handle.dataset.objectHandle = ""
  handle.contentEditable = "false"
  handle.title = "Drag"
  dom.append(handle)
}

function ensureFigureResizeHandles(dom: HTMLElement) {
  if (dom.querySelector("[data-resize]")) {
    return
  }
  for (const edge of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const) {
    const handle = document.createElement("div")
    handle.className = `image-resize image-resize-${edge}`
    handle.dataset.resize = edge
    handle.contentEditable = "false"
    dom.append(handle)
  }
}

export const WordArt = Node.create({
  name: "wordArt",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      preset: {
        default: "blue",
        parseHTML: (element) => element.getAttribute("data-preset") || "blue",
        renderHTML: (attributes) => ({ "data-preset": attributes.preset || "blue" }),
      },
      path: {
        default: "none",
        parseHTML: (element) => element.getAttribute("data-path") || "none",
        renderHTML: (attributes) =>
          attributes.path && attributes.path !== "none" ? { "data-path": attributes.path } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: "p[data-word-art]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-word-art": "", class: "word-art" }), 0]
  },
})

export const SignatureLine = Node.create({
  name: "signatureLine",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-name") ?? "",
        renderHTML: (attributes) => ({ "data-name": attributes.name ?? "" }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") ?? "",
        renderHTML: (attributes) => ({ "data-title": attributes.title ?? "" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-signature]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-signature": "", class: "signature-line" })]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div")
      dom.className = "signature-line"
      dom.contentEditable = "false"
      const mark = document.createElement("div")
      mark.className = "signature-mark"
      mark.textContent = "X"
      const line = document.createElement("div")
      line.className = "signature-rule"
      const name = document.createElement("input")
      name.placeholder = "Name"
      name.setAttribute("aria-label", "Signature name")
      const title = document.createElement("input")
      title.placeholder = "Title"
      title.setAttribute("aria-label", "Signature title")
      dom.append(mark, line, name, title)
      const paint = (next: ProseNode) => {
        name.value = String(next.attrs.name ?? "")
        title.value = String(next.attrs.title ?? "")
      }
      const write = (key: "name" | "title", value: string) => {
        const pos = getPos()
        if (typeof pos !== "number") {
          return
        }
        const current = editor.state.doc.nodeAt(pos)
        if (!current) {
          return
        }
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, [key]: value.slice(0, 80) }),
        )
      }
      for (const input of [name, title]) {
        input.addEventListener("mousedown", (event) => event.stopPropagation())
        input.addEventListener("keydown", (event) => event.stopPropagation())
      }
      name.addEventListener("input", () => write("name", name.value))
      title.addEventListener("input", () => write("title", title.value))
      paint(node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "signatureLine") {
            return false
          }
          paint(next)
          return true
        },
      }
    }
  },
})

export const Note = Node.create({
  name: "note",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note") ?? "",
        renderHTML: (attributes) => ({ "data-note": attributes.id }),
      },
      kind: {
        default: "footnote",
        parseHTML: (element) => (element.getAttribute("data-kind") === "endnote" ? "endnote" : "footnote"),
        renderHTML: (attributes) => ({ "data-kind": attributes.kind === "endnote" ? "endnote" : "footnote" }),
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text") ?? "",
        renderHTML: (attributes) => ({ "data-text": attributes.text ?? "" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "sup[data-note]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "doc-note" })]
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("sup")
      dom.className = "doc-note"
      const paint = (next: ProseNode) => {
        const pos = getPos()
        const kind = next.attrs.kind === "endnote" ? "endnote" : "footnote"
        let number = 1
        if (typeof pos === "number") {
          let count = 0
          editor.state.doc.nodesBetween(0, pos + 1, (child) => {
            if (child.type.name === "note" && child.attrs.kind === kind) {
              count += 1
            }
          })
          number = Math.max(1, count)
        }
        dom.textContent = String(number)
        dom.title = String(next.attrs.text ?? "")
        dom.dataset.kind = kind
      }
      paint(node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "note") {
            return false
          }
          paint(next)
          return true
        },
      }
    }
  },
})

export const FigureTable = Node.create({
  name: "figureTable",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      stamp: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-stamp")) || 0,
        renderHTML: (attributes) => ({ "data-stamp": String(attributes.stamp ?? 0) }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-figure-table]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-figure-table": "", class: "figure-table" })]
  },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("div")
      dom.className = "figure-table"
      dom.contentEditable = "false"
      const paint = () => {
        const rows = captionRows(editor.state.doc)
        dom.replaceChildren()
        const title = document.createElement("p")
        title.className = "figure-table-title"
        title.textContent = "Table of figures"
        dom.append(title)
        if (rows.length === 0) {
          const empty = document.createElement("p")
          empty.textContent = "No captions yet."
          dom.append(empty)
          return
        }
        for (const row of rows) {
          const line = document.createElement("p")
          line.textContent = row
          dom.append(line)
        }
      }
      paint()
      const onUpdate = () => paint()
      editor.on("update", onUpdate)
      return {
        dom,
        update(next) {
          if (next.type.name !== "figureTable") {
            return false
          }
          paint()
          return true
        },
        destroy() {
          editor.off("update", onUpdate)
        },
      }
    }
  },
})

function captionRows(doc: ProseNode) {
  const rows: string[] = []
  doc.descendants((node) => {
    if (!node.isTextblock) {
      return
    }
    const text = node.textContent.trim()
    if (/^(Figure|Table)\s+\d+/i.test(text)) {
      rows.push(text)
    }
  })
  return rows
}

export function listBookmarks(doc: ProseNode) {
  const names = new Set<string>()
  doc.descendants((node) => {
    const mark = node.marks.find((item) => item.type.name === "bookmark")
    if (mark?.attrs.id) {
      names.add(String(mark.attrs.id))
    }
  })
  return [...names]
}

export function listHeadings(doc: ProseNode) {
  const headings: { level: number; text: string; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({ level: Number(node.attrs.level) || 1, text: node.textContent.trim() || "Heading", pos })
    }
  })
  return headings
}

export function listNotes(doc: ProseNode, kind?: "footnote" | "endnote") {
  const notes: { id: string; kind: string; text: string; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== "note") {
      return
    }
    if (kind && node.attrs.kind !== kind) {
      return
    }
    notes.push({
      id: String(node.attrs.id || pos),
      kind: String(node.attrs.kind),
      text: String(node.attrs.text || ""),
      pos,
    })
  })
  return notes
}

export function nextCaption(doc: ProseNode, label: "Figure" | "Table") {
  let count = 0
  doc.descendants((node) => {
    if (node.isTextblock && node.textContent.trim().startsWith(`${label} `)) {
      count += 1
    }
  })
  return count + 1
}

function insertSelectableBlock(state: EditorState, tr: Transaction, node: ProseNode) {
  const $from = state.selection.$from
  const pos = $from.parent.canReplaceWith($from.index(), $from.index(), node.type)
    ? state.selection.to
    : $from.depth > 0
      ? $from.after($from.depth)
      : state.doc.content.size
  tr.insert(pos, node)
  if (tr.doc.nodeAt(pos)?.type === node.type) {
    tr.setSelection(NodeSelection.create(tr.doc, pos))
  }
}

export const insertBlockCommands = Node.create({
  name: "insertBlocks",
  addCommands() {
    return {
      insertFigure:
        (kind, variant, values, spec) =>
        ({ state, tr }) => {
          const type = state.schema.nodes.figure
          if (!type) {
            return false
          }
          const chart = kind === "chart" ? serializeChartSpec(spec ?? defaultChartSpec(variant)) : ""
          insertSelectableBlock(state, tr, type.create({ kind, variant, values: values || "8,14,11", chart }))
          return true
        },
      insertWordArt:
        (preset) =>
        ({ state, tr }) => {
          const type = state.schema.nodes.wordArt
          if (!type) {
            return false
          }
          const style = WORD_ART_PRESETS.find((item) => item.id === preset)
          insertSelectableBlock(
            state,
            tr,
            type.create({ preset, path: style?.path || "none" }, state.schema.text("Your text here")),
          )
          return true
        },
      insertSignature:
        (name, title) =>
        ({ state, tr }) => {
          const type = state.schema.nodes.signatureLine
          if (!type) {
            return false
          }
          tr.insert(
            state.selection.to,
            type.create({ name: (name ?? "").slice(0, 80), title: (title ?? "").slice(0, 80) }),
          )
          return true
        },
      insertBookmark:
        (name) =>
        ({ editor, state }) => {
          const id = name.trim().replace(/\s+/g, " ").slice(0, 40)
          if (!id) {
            return false
          }
          const mark = state.schema.marks.bookmark
          if (!mark) {
            return false
          }
          let duplicate = false
          state.doc.descendants((node) => {
            if (duplicate) {
              return false
            }
            if (node.isText && node.marks.some((item) => item.type.name === "bookmark" && item.attrs.id === id)) {
              duplicate = true
            }
          })
          if (duplicate) {
            return false
          }
          const chain = chainWithSelection(editor)
          if (state.selection.empty) {
            return chain
              .insertContent({ type: "text", text: "\u200b", marks: [{ type: "bookmark", attrs: { id } }] })
              .run()
          }
          return chain.setMark("bookmark", { id }).run()
        },
      insertNote:
        (kind, text) =>
        ({ state, tr }) => {
          const type = state.schema.nodes.note
          const body = text.trim().slice(0, 500)
          if (!type || !body) {
            return false
          }
          tr.insert(state.selection.to, type.create({ id: crypto.randomUUID(), kind, text: body }))
          return true
        },
      insertFigureTable:
        () =>
        ({ state, tr }) => {
          const type = state.schema.nodes.figureTable
          if (!type) {
            return false
          }
          tr.insert(state.selection.to, type.create({ stamp: Date.now() }))
          return true
        },
      refreshFigureTable:
        () =>
        ({ state, tr }) => {
          let updated = false
          state.doc.descendants((node, pos) => {
            if (node.type.name === "figureTable") {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, stamp: Date.now() })
              updated = true
            }
          })
          return updated
        },
    }
  },
})
