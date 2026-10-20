import { WrapGlyph } from "@/components/menu-icons"
import { RibbonSvg } from "@/components/ribbon/icons"
import { objectWrap, OBJECT_ANCHORS, selectedPosition, type ObjectAnchor } from "@/editor/objects"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"

const ROWS = [3.6, 5.3, 7, 8.7, 10.4, 12.1]
const OBJECT_W = 3.8
const OBJECT_H = 3.2

/**
 * Word's Position pictures: a page with lines of text and the object at one of the nine places, or in a line of
 * text ("inline").
 */
export function PositionGlyph({ anchor, size = 16 }: { anchor: ObjectAnchor | "inline"; size?: number }) {
  const muted = "var(--icon-muted-color)"
  const accent = "var(--icon-accent-color)"
  const left = 3.8
  const right = 12.2
  const place =
    anchor === "inline"
      ? { x: 6.3, y: 5.6 }
      : (() => {
          const preset = OBJECT_ANCHORS.find((item) => item.id === anchor) ?? OBJECT_ANCHORS[0]
          return { x: left + preset.x * (right - left - OBJECT_W), y: 2.9 + preset.y * (12.8 - 2.9 - OBJECT_H) }
        })()
  const lines = ROWS.map((y) => {
    const level = y >= place.y - 0.6 && y <= place.y + OBJECT_H + 0.6
    if (!level) {
      return `M${left} ${y}H${right}`
    }
    if (anchor === "inline") {
      // The text runs up to the object and on after it, in the same line.
      return Math.abs(y - (place.y + OBJECT_H / 2)) < 0.9
        ? `M${left} ${y}H${place.x - 0.5}M${place.x + OBJECT_W + 0.5} ${y}H${right}`
        : ""
    }
    const before = place.x - 0.9 > left + 0.5 ? `M${left} ${y}H${place.x - 0.9}` : ""
    const after = place.x + OBJECT_W + 0.9 < right - 0.5 ? `M${place.x + OBJECT_W + 0.9} ${y}H${right}` : ""
    return before + after
  })
  return (
    <RibbonSvg size={size}>
      <rect
        x="2.4"
        y="1.4"
        width="11.2"
        height="13.2"
        rx="0.6"
        fill="var(--icon-page-color, #fff)"
        stroke={muted}
        strokeWidth="0.8"
      />
      <path d={lines.join("")} stroke={muted} strokeWidth="0.7" />
      <rect x={place.x} y={place.y} width={OBJECT_W} height={OBJECT_H} rx="0.3" fill={accent} />
    </RibbonSvg>
  )
}

/** The Wrap Text button's picture: the selected object's wrap, as Word's button shows it. */
export function CurrentWrapIcon({ editor, size = 16 }: { editor: Editor | null; size?: number }) {
  const wrap = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection as { node?: { attrs: Record<string, unknown> } } | undefined
      return selection?.node && "wrap" in selection.node.attrs ? objectWrap(selection.node.attrs.wrap) : "square"
    },
  })
  return <WrapGlyph kind={wrap ?? "square"} size={size} />
}

/** The Position button's picture: where the selected object is (top right when it was placed some other way). */
export function CurrentPositionIcon({ editor, size = 16 }: { editor: Editor | null; size?: number }) {
  const anchor = useEditorState({
    editor,
    selector: ({ editor: current }) => selectedPosition(current ?? null) ?? "top-right",
  })
  return <PositionGlyph anchor={anchor ?? "top-right"} size={size} />
}
