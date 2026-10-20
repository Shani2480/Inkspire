import { toggleBold } from "@/editor/shape-text"
import { ColorMenu } from "@/components/color-menu"
import { FontMenuList, openFontMenu } from "@/components/font-menu"
import { RibbonHover } from "@/components/ribbon/ribbon-button"
import { FONT_FAMILIES, FONT_SIZES, fontLabelAt, fontSizeLabel } from "@/components/ribbon/options"
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BulletsIcon,
  ClearFormatIcon,
  GrowFontIcon,
  NumberingIcon,
  ShrinkFontIcon,
} from "@/components/ribbon/icons"
import { useDocumentStore } from "@/document/store"
import { useEditingOptions } from "@/document/editing-options"
import { stepFontSize } from "@/editor/actions"
import {
  applyBullet,
  clearFormatting,
  clearList,
  applyNumbering,
  currentBulletMarker,
  currentNumberMarker,
} from "@/editor/home-actions"
import { chainWithSelection } from "@/editor/selection-memory"
import { useStyleFont } from "@/components/ribbon/home-menus"
import { useActiveMarks } from "@/editor/use-active-marks"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"
import { useEditorState } from "@tiptap/react"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

type MenuName = "font" | "size" | "highlight" | "color"

function bodyLabel(bodyFont: string) {
  if (!bodyFont) {
    return "Aptos (Body)"
  }
  const known = FONT_FAMILIES.find((font) => font.value === bodyFont)
  const name = known?.label ?? bodyFont.split(",")[0].replace(/"/g, "").trim()
  return `${name} (Body)`
}

export function MiniToolbar({ editor }: { editor: Editor }) {
  const show = useEditingOptions((state) => state.miniToolbar)
  return show ? <MiniToolbarBody editor={editor} /> : null
}

function MiniToolbarBody({ editor }: { editor: Editor }) {
  const marks = useActiveMarks(editor)
  const themeBody = bodyLabel(useDocumentStore((state) => state.pageSetup.bodyFont))
  const styleFont = useStyleFont(marks)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<MenuName | null>(null)
  const [highlight, setHighlight] = useState("#fff2cc")
  const [color, setColor] = useState("#d13438")
  const rootRef = useRef<HTMLDivElement>(null)

  const collapsed = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.state.selection.empty ?? true,
  })

  useEffect(() => {
    const reveal = () => {
      const selection = editor.state.selection
      if (
        !editor.isEditable ||
        selection.empty ||
        selection instanceof NodeSelection ||
        selection instanceof CellSelection
      ) {
        return
      }
      const text = editor.state.doc.textBetween(selection.from, selection.to, " ").replace(/\s/g, "")
      if (!text) {
        return
      }
      const bounds = selectionBounds() ?? boundsFromEditor(editor)
      if (!bounds) {
        return
      }
      setPoint({ x: bounds.left, y: bounds.top })
      setPlace((current) => current ?? { x: bounds.left, y: Math.max(8, bounds.top - 8) })
    }
    let buttons = 0
    const onPointerDown = () => {
      buttons += 1
    }
    const onPointerUp = () => {
      buttons = Math.max(0, buttons - 1)
    }
    const onSelection = () => {
      if (buttons > 0) {
        return
      }
      reveal()
    }
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 2) {
        return
      }
      if (rootRef.current?.contains(event.target as Node)) {
        return
      }
      const target = event.target
      const insideEditor = target instanceof Node && editor.view.dom.contains(target)
      const insidePage = target instanceof Element && Boolean(target.closest(".page-canvas"))
      if (!insideEditor && !insidePage) {
        return
      }
      requestAnimationFrame(reveal)
    }
    editor.on("selectionUpdate", onSelection)
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      editor.off("selectionUpdate", onSelection)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [editor])

  useEffect(() => {
    if (collapsed) {
      setPoint(null)
      setPlace(null)
    }
  }, [collapsed])

  useEffect(() => {
    if (!point) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return
      }
      setPoint(null)
      setPlace(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu((current) => {
          if (current) {
            return null
          }
          setPoint(null)
          setPlace(null)
          return null
        })
      }
    }
    const scroll = document.getElementById("document-scroll")
    const onScroll = () => {
      setPoint(null)
      setPlace(null)
    }
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKeyDown)
    scroll?.addEventListener("scroll", onScroll)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKeyDown)
      scroll?.removeEventListener("scroll", onScroll)
    }
  }, [point])

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node || !point) {
      return
    }
    const menu = node.getBoundingClientRect()
    const bounds = selectionBounds()
    const anchor = bounds ?? new DOMRect(point.x, point.y, 0, 0)
    const gap = 8
    let top = anchor.top - menu.height - gap
    if (top < 8) {
      top = anchor.bottom + gap
    }
    let left = anchor.left
    if (left + menu.width > window.innerWidth - 8) {
      left = window.innerWidth - 8 - menu.width
    }
    if (left < 8) {
      left = 8
    }
    if (bounds && intersects(left, top, menu.width, menu.height, bounds)) {
      const above = bounds.top - menu.height - gap
      const below = bounds.bottom + gap
      top = above >= 8 ? above : below
    }
    setPlace((current) => (current && current.x === left && current.y === top ? current : { x: left, y: top }))
  }, [point, menu])

  if (!point || !place) {
    return null
  }

  function hold(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  function toggleMenu(name: MenuName) {
    setMenu((current) => (current === name ? null : name))
  }

  return createPortal(
    <div
      ref={rootRef}
      className="mini-toolbar"
      role="toolbar"
      aria-label="Formatting"
      style={{ left: place.x, top: place.y }}
      onMouseDown={hold}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="mini-toolbar-row">
        <div className="mini-pop">
          <RibbonHover label="Font">
            <button
              type="button"
              className="mini-combo is-font"
              aria-label="Font"
              aria-expanded={menu === "font"}
              onClick={() => {
                openFontMenu()
                toggleMenu("font")
              }}
            >
              <span className="truncate">{fontLabelAt(marks.fontFamily || styleFont.family, themeBody)}</span>
              <Caret />
            </button>
          </RibbonHover>
          {menu === "font" ? (
            <div className="mini-menu is-font" role="menu">
              <FontMenuList
                className="flex max-h-64 w-full flex-col"
                active={marks.fontFamily}
                bodyLabel={themeBody}
                onBody={() => {
                  chainWithSelection(editor).unsetFontFamily().run()
                  setMenu(null)
                }}
                onSelect={(value) => {
                  chainWithSelection(editor).setFontFamily(value).run()
                  setMenu(null)
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="mini-pop">
          <RibbonHover label="Font size">
            <button
              type="button"
              className="mini-combo is-size"
              aria-label="Font size"
              aria-expanded={menu === "size"}
              onClick={() => toggleMenu("size")}
            >
              <span className="tabular-nums">{fontSizeLabel(marks.fontSize || styleFont.size)}</span>
              <Caret />
            </button>
          </RibbonHover>
          {menu === "size" ? (
            <div className="mini-menu is-size" role="menu">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="mini-menu-item"
                  aria-checked={marks.fontSize === `${size}pt`}
                  onClick={() => {
                    chainWithSelection(editor).setFontSize(`${size}pt`).run()
                    setMenu(null)
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <RibbonHover label="Grow Font">
          <button type="button" className="mini-tool" aria-label="Grow Font" onClick={() => stepFontSize(editor, 1)}>
            <GrowFontIcon />
          </button>
        </RibbonHover>
        <RibbonHover label="Shrink Font">
          <button type="button" className="mini-tool" aria-label="Shrink Font" onClick={() => stepFontSize(editor, -1)}>
            <ShrinkFontIcon />
          </button>
        </RibbonHover>
        <RibbonHover label="Clear All Formatting">
          <button
            type="button"
            className="mini-tool"
            aria-label="Clear All Formatting"
            onClick={() => clearFormatting(editor)}
          >
            <ClearFormatIcon />
          </button>
        </RibbonHover>
      </div>
      <div className="mini-toolbar-row">
        <RibbonHover label="Bold">
          <button
            type="button"
            className="mini-tool"
            aria-label="Bold"
            aria-pressed={marks.bold}
            onClick={() => toggleBold(editor)}
          >
            <span className="ribbon-bold-glyph">B</span>
          </button>
        </RibbonHover>
        <RibbonHover label="Italic">
          <button
            type="button"
            className="mini-tool"
            aria-label="Italic"
            aria-pressed={marks.italic}
            onClick={() => chainWithSelection(editor).toggleItalic().run()}
          >
            <span className="italic">I</span>
          </button>
        </RibbonHover>
        <RibbonHover label="Underline">
          <button
            type="button"
            className="mini-tool"
            aria-label="Underline"
            aria-pressed={marks.underline}
            onClick={() => chainWithSelection(editor).toggleUnderline().run()}
          >
            <span className="underline">U</span>
          </button>
        </RibbonHover>
        <SplitColor
          label="Text Highlight Color"
          menuLabel="Highlight colors"
          open={menu === "highlight"}
          swatch={marks.highlight || highlight}
          glyph="ab"
          palette="highlight"
          active={marks.highlight}
          clearLabel="No Color"
          onOpen={() => toggleMenu("highlight")}
          onApply={() => chainWithSelection(editor).setHighlight({ color: highlight }).run()}
          onClear={() => {
            chainWithSelection(editor).unsetHighlight().run()
            setMenu(null)
          }}
          onSelect={(next) => {
            setHighlight(next)
            chainWithSelection(editor).setHighlight({ color: next }).run()
            setMenu(null)
          }}
        />
        <SplitColor
          label="Font Color"
          menuLabel="Font colors"
          open={menu === "color"}
          swatch={marks.color || color}
          glyph="A"
          palette="theme"
          active={marks.color}
          clearLabel="Automatic"
          onOpen={() => toggleMenu("color")}
          onApply={() => chainWithSelection(editor).setColor(color).run()}
          onClear={() => {
            chainWithSelection(editor).unsetColor().run()
            setMenu(null)
          }}
          onSelect={(next) => {
            setColor(next)
            chainWithSelection(editor).setColor(next).run()
            setMenu(null)
          }}
        />
        <span className="mini-sep" aria-hidden />
        <MiniTool
          label="Bullets"
          pressed={marks.bulletList}
          onClick={() => (marks.bulletList ? clearList(editor) : applyBullet(editor, currentBulletMarker()))}
        >
          <BulletsIcon />
        </MiniTool>
        <MiniTool
          label="Numbering"
          pressed={marks.orderedList}
          onClick={() => (marks.orderedList ? clearList(editor) : applyNumbering(editor, currentNumberMarker()))}
        >
          <NumberingIcon />
        </MiniTool>
        <span className="mini-sep" aria-hidden />
        {ALIGNMENTS.map(({ align, label, Icon }) => (
          <MiniTool
            key={align}
            label={label}
            pressed={marks.align === align}
            onClick={() => chainWithSelection(editor).setTextAlign(align).run()}
          >
            <Icon />
          </MiniTool>
        ))}
      </div>
    </div>,
    document.body,
  )
}

const ALIGNMENTS = [
  { align: "left", label: "Align Left", Icon: AlignLeftIcon },
  { align: "center", label: "Center", Icon: AlignCenterIcon },
  { align: "right", label: "Align Right", Icon: AlignRightIcon },
  { align: "justify", label: "Justify", Icon: AlignJustifyIcon },
] as const

function MiniTool({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <RibbonHover label={label}>
      <button type="button" className="mini-tool" aria-label={label} aria-pressed={pressed} onClick={onClick}>
        {children}
      </button>
    </RibbonHover>
  )
}

function SplitColor({
  label,
  menuLabel,
  open,
  swatch,
  glyph,
  palette,
  active,
  clearLabel,
  onOpen,
  onApply,
  onClear,
  onSelect,
}: {
  label: string
  menuLabel: string
  open: boolean
  swatch: string
  glyph: string
  palette: "theme" | "highlight"
  active: string
  clearLabel: string
  onOpen: () => void
  onApply: () => void
  onClear: () => void
  onSelect: (color: string) => void
}) {
  return (
    <div className="mini-pop mini-split">
      <RibbonHover label={label}>
        <button type="button" className="mini-tool mini-swatch" aria-label={label} onClick={onApply}>
          <span>{glyph}</span>
          <span className="mini-swatch-bar" style={{ background: swatch }} />
        </button>
      </RibbonHover>
      <RibbonHover label={menuLabel} description={`Choose a ${label.toLowerCase()}.`}>
        <button type="button" className="mini-caret" aria-label={menuLabel} aria-expanded={open} onClick={onOpen}>
          <Caret />
        </button>
      </RibbonHover>
      {open ? (
        <div className="mini-menu is-colors" role="menu">
          <ColorMenu palette={palette} active={active} clearLabel={clearLabel} onClear={onClear} onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  )
}

function boundsFromEditor(editor: Editor) {
  const { from, to } = editor.state.selection
  try {
    const start = editor.view.coordsAtPos(from)
    const end = editor.view.coordsAtPos(Math.max(from, to - 1))
    const left = Math.min(start.left, end.left)
    const top = Math.min(start.top, end.top)
    const right = Math.max(start.right, end.right)
    const bottom = Math.max(start.bottom, end.bottom)
    if (right <= left && bottom <= top) {
      return null
    }
    return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
  } catch {
    return null
  }
}

function selectionBounds() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return null
  }
  return rect
}

function intersects(left: number, top: number, width: number, height: number, bounds: DOMRect) {
  return left < bounds.right && left + width > bounds.left && top < bounds.bottom && top + height > bounds.top
}

function Caret() {
  return (
    <svg className="mini-caret-icon" width="7" height="7" viewBox="0 0 7 7" aria-hidden>
      <path d="M1 2.2 3.5 5 6 2.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
