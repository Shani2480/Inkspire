import { MenuButton } from "@/components/ribbon/ribbon-button"
import { useLayoutDialog } from "@/document/object-layout"
import { useViewStore } from "@/document/view"
import { canRegroup, groupObjects, regroupObjects, ungroupObjects, useObjectSelection } from "@/editor/object-group"
import { alignSelectedObjects, isFloating, selectedObject, type ObjectSide } from "@/editor/objects"
import type { Editor } from "@tiptap/core"
import { Check } from "lucide-react"
import type { ReactNode } from "react"
import { create } from "zustand"

/**
 * Word's Arrange group menus (20.6, 20.7, 20.9), shared by the Layout tab and every object's format tab: Bring
 * Forward, Send Backward, Align, Group and Rotate.
 */

type MenuProps = { editor: Editor | null; close: () => void }

/** Align to the page or the margins, as Word remembers it between uses. */
export type AlignTo = "page" | "margin" | "selection"
export const useAlignTo = create<{ to: AlignTo; set: (to: AlignTo) => void }>((set) => ({
  to: "margin",
  set: (to) => set({ to }),
}))

function Row({
  children,
  onClick,
  disabled = false,
  checked,
  icon,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  checked?: boolean
  icon?: ReactNode
}) {
  return (
    <MenuButton className={disabled ? "pointer-events-none opacity-40" : undefined} onClick={onClick}>
      <span className="flex items-center gap-2">
        <span className="grid size-4 place-items-center">
          {icon ?? (checked ? <Check className="size-3.5" strokeWidth={2} /> : null)}
        </span>
        {children}
      </span>
    </MenuButton>
  )
}

function Separator() {
  return <div className="my-1 h-px bg-[var(--app-popover-border)]" role="separator" />
}

export function BringForwardMenu({ editor, close }: MenuProps) {
  const run = (action: (editor: Editor) => void) => {
    if (editor) {
      action(editor)
    }
    close()
  }
  return (
    <div className="flex w-52 flex-col">
      <Row onClick={() => run((current) => current.chain().focus().setObjectLayer("forward").run())}>Bring Forward</Row>
      <Row onClick={() => run((current) => current.chain().focus().setObjectLayer("front").run())}>Bring to Front</Row>
      <Row onClick={() => run((current) => current.chain().focus().setObjectWrap("front").run())}>
        Bring in Front of Text
      </Row>
    </div>
  )
}

export function SendBackwardMenu({ editor, close }: MenuProps) {
  const run = (action: (editor: Editor) => void) => {
    if (editor) {
      action(editor)
    }
    close()
  }
  return (
    <div className="flex w-52 flex-col">
      <Row onClick={() => run((current) => current.chain().focus().setObjectLayer("backward").run())}>
        Send Backward
      </Row>
      <Row onClick={() => run((current) => current.chain().focus().setObjectLayer("back").run())}>Send to Back</Row>
      <Row onClick={() => run((current) => current.chain().focus().setObjectWrap("behind").run())}>
        Send Behind Text
      </Row>
    </div>
  )
}

/** Spreads the picked floating objects evenly between the first and the last, across or down. */
export function distributeObjects(editor: Editor, positions: number[], axis: "x" | "y") {
  const items = positions
    .map((pos) => ({ pos, node: editor.state.doc.nodeAt(pos) }))
    .filter((item): item is { pos: number; node: NonNullable<typeof item.node> } =>
      Boolean(item.node && isFloating(item.node)),
    )
    .sort((left, right) => Number(left.node.attrs[axis]) - Number(right.node.attrs[axis]))
  if (items.length < 3) {
    return
  }
  const first = Number(items[0]!.node.attrs[axis]) || 0
  const last = Number(items[items.length - 1]!.node.attrs[axis]) || 0
  const step = (last - first) / (items.length - 1)
  const tr = editor.state.tr
  items.forEach((item, index) => {
    tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, [axis]: Math.round(first + step * index) })
  })
  editor.view.dispatch(tr)
}

export function AlignObjectsMenu({ editor, close }: MenuProps) {
  const to = useAlignTo((state) => state.to)
  const setTo = useAlignTo((state) => state.set)
  const picked = useObjectSelection((state) => state.picked)
  const grid = useViewStore((state) => state.showGridlines)
  const toggleGrid = useViewStore((state) => state.toggleGridlines)
  const align = (side: ObjectSide) => {
    if (to === "selection") {
      if (editor) {
        alignSelectedObjects(editor, picked, side)
      }
    } else {
      editor?.chain().focus().alignObject(side, to).run()
    }
    close()
  }
  const sides: [ObjectSide, string][] = [
    ["left", "Align Left"],
    ["center", "Align Center"],
    ["right", "Align Right"],
    ["top", "Align Top"],
    ["middle", "Align Middle"],
    ["bottom", "Align Bottom"],
  ]
  return (
    <div className="flex w-60 flex-col">
      {sides.map(([side, label]) => (
        <Row
          key={side}
          icon={<AlignGlyph side={side} />}
          disabled={to === "selection" ? picked.length < 2 : !selectedObject(editor)}
          onClick={() => align(side)}
        >
          {label}
        </Row>
      ))}
      <Separator />
      <Row
        disabled={picked.length < 3}
        onClick={() => {
          if (editor) {
            distributeObjects(editor, picked, "x")
          }
          close()
        }}
      >
        Distribute Horizontally
      </Row>
      <Row
        disabled={picked.length < 3}
        onClick={() => {
          if (editor) {
            distributeObjects(editor, picked, "y")
          }
          close()
        }}
      >
        Distribute Vertically
      </Row>
      <Separator />
      <Row checked={to === "page"} onClick={() => setTo("page")}>
        Align to Page
      </Row>
      <Row checked={to === "margin"} onClick={() => setTo("margin")}>
        Align to Margin
      </Row>
      <Row
        disabled={picked.length < 2}
        checked={to === "selection" && picked.length >= 2}
        onClick={() => setTo("selection")}
      >
        Align Selected Objects
      </Row>
      <Separator />
      <Row
        checked={grid}
        onClick={() => {
          toggleGrid()
          close()
        }}
      >
        View Gridlines
      </Row>
    </div>
  )
}

export function GroupMenu({ editor, close }: MenuProps) {
  const picked = useObjectSelection((state) => state.picked)
  const object = selectedObject(editor)
  const grouped = Boolean(object?.attrs.groupId)
  const regroup = editor ? canRegroup(editor.state.doc) : false
  return (
    <div className="flex w-44 flex-col">
      <Row
        disabled={picked.length < 2}
        onClick={() => {
          if (editor && picked.length >= 2) {
            groupObjects(editor, picked)
          }
          close()
        }}
      >
        Group
      </Row>
      <Row
        disabled={!regroup}
        onClick={() => {
          if (editor && regroup) {
            regroupObjects(editor)
          }
          close()
        }}
      >
        Regroup
      </Row>
      <Row
        disabled={!grouped}
        onClick={() => {
          if (editor && object && grouped) {
            ungroupObjects(editor, [object.pos, ...picked])
          }
          close()
        }}
      >
        Ungroup
      </Row>
    </div>
  )
}

export function RotateObjectMenu({ editor, close }: MenuProps) {
  const object = selectedObject(editor)
  // Flips are drawn for shapes and icons.
  const flips = object?.name === "figure"
  const run = (action: (editor: Editor) => void) => {
    if (editor) {
      action(editor)
    }
    close()
  }
  return (
    <div className="flex w-56 flex-col">
      <Row
        icon={<RotateGlyph turn="right" />}
        onClick={() => run((current) => current.chain().focus().setObjectRotate(90).run())}
      >
        Rotate Right 90°
      </Row>
      <Row
        icon={<RotateGlyph turn="left" />}
        onClick={() => run((current) => current.chain().focus().setObjectRotate(-90).run())}
      >
        Rotate Left 90°
      </Row>
      <Row
        icon={<RotateGlyph turn="vertical" />}
        disabled={!flips}
        onClick={() => run((current) => current.chain().focus().updateObject({ flipV: !object?.attrs.flipV }).run())}
      >
        Flip Vertical
      </Row>
      <Row
        icon={<RotateGlyph turn="horizontal" />}
        disabled={!flips}
        onClick={() => run((current) => current.chain().focus().updateObject({ flipH: !object?.attrs.flipH }).run())}
      >
        Flip Horizontal
      </Row>
      <Separator />
      <Row
        onClick={() => {
          close()
          useLayoutDialog.getState().show("size")
        }}
      >
        More Rotation Options…
      </Row>
    </div>
  )
}

function AlignGlyph({ side }: { side: ObjectSide }) {
  const muted = "var(--icon-base-color)"
  const accent = "var(--icon-accent-color)"
  const horizontal = side === "left" || side === "center" || side === "right"
  const line = { left: 2.5, center: 8, right: 13.5, top: 2.5, middle: 8, bottom: 13.5 }[side]
  const bars = horizontal
    ? side === "left"
      ? [`M${line} 4h8`, `M${line} 10h5`]
      : side === "right"
        ? [`M${line} 4h-8`, `M${line} 10h-5`]
        : ["M4 4h8", "M5.5 10h5"]
    : side === "top"
      ? [`M4 ${line}v8`, `M10 ${line}v5`]
      : side === "bottom"
        ? [`M4 ${line}v-8`, `M10 ${line}v-5`]
        : ["M4 4v8", "M10 5.5v5"]
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={horizontal ? `M${line} 1.5v13` : `M1.5 ${line}h13`} stroke={muted} strokeWidth="1" />
      {bars.map((bar) => (
        <path key={bar} d={bar} stroke={accent} strokeWidth="2.6" />
      ))}
    </svg>
  )
}

function RotateGlyph({ turn }: { turn: "right" | "left" | "vertical" | "horizontal" }) {
  const base = {
    stroke: "var(--icon-base-color)",
    strokeWidth: 1.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const
  const accent = { ...base, stroke: "var(--icon-accent-color)" }
  if (turn === "vertical" || turn === "horizontal") {
    const flip = turn === "horizontal"
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <g transform={flip ? undefined : "rotate(90 8 8)"}>
          <path d="M8 1.5v13" {...base} strokeDasharray="1.5 1.5" />
          <path d="M6 4 2.5 12H6z" {...accent} />
          <path d="M10 4l3.5 8H10z" {...base} />
        </g>
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <g transform={turn === "left" ? "matrix(-1 0 0 1 16 0)" : undefined}>
        <rect x="2" y="7" width="7" height="7" rx="0.6" {...base} />
        <path d="M5 4.5A6 6 0 0 1 13 7" {...accent} />
        <path d="m13.4 4.4-.4 2.6-2.6-.5" {...accent} />
      </g>
    </svg>
  )
}
