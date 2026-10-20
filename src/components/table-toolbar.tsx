import { ColorMenu } from "@/components/color-menu"
import { askText } from "@/components/text-prompt"
import { FontMenuList } from "@/components/font-menu"
import { BulletLibrary, NumberingLibrary } from "@/components/list-library"
import { TableStyleGallery } from "@/components/table-design-menus"
import { ContextGlyph } from "@/components/ribbon/context-icons"
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BordersIcon,
  BulletsIcon,
  GrowFontIcon,
  NumberingIcon,
  RibbonSvg,
  ShadingIcon,
  ShrinkFontIcon,
} from "@/components/ribbon/icons"
import { FONT_SIZES, fontLabel, fontSizeLabel } from "@/components/ribbon/options"
import { useDocumentStore } from "@/document/store"
import { addComment } from "@/editor/comments"
import { stepFontSize } from "@/editor/actions"
import { applyBullet, applyNumbering, clearList, currentBulletMarker, currentNumberMarker } from "@/editor/home-actions"
import { chainWithSelection } from "@/editor/selection-memory"
import { paintCellBorders, paintTable, setTableFrame, shadeCells } from "@/editor/table-tools"
import { useActiveMarks } from "@/editor/use-active-marks"
import type { Editor } from "@tiptap/core"
import { cellAround } from "@tiptap/pm/tables"
import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react"

type MenuName =
  | "font"
  | "size"
  | "bullets"
  | "numbering"
  | "insert"
  | "delete"
  | "styles"
  | "highlight"
  | "color"
  | "shading"
  | "borders"
  | "frame"
  | "align"
  | "below"
  | "merge"

export function TableToolbar({
  editor,
  style,
  barRef,
  menusUp,
}: {
  editor: Editor
  style: CSSProperties
  barRef: RefObject<HTMLDivElement | null>
  menusUp: boolean
}) {
  const marks = useActiveMarks(editor)
  const bodyFont = useDocumentStore((state) => state.pageSetup.bodyFont)
  const themeBody = bodyLabel(bodyFont)
  const [menu, setMenu] = useState<MenuName | null>(null)
  const [highlight, setHighlight] = useState("#ffff00")
  const [color, setColor] = useState("#d13438")
  const [shading, setShading] = useState("#fff2cc")
  const [painting, setPainting] = useState(false)

  useEffect(() => {
    if (!painting) {
      return
    }
    const dom = editor.view.dom
    const paint = (event: MouseEvent) => {
      const cell = event.target instanceof Element ? event.target.closest("td, th") : null
      if (!cell || !dom.contains(cell)) {
        return
      }
      event.preventDefault()
      paintCellBorders(editor, cell)
    }
    dom.addEventListener("mousedown", paint)
    return () => dom.removeEventListener("mousedown", paint)
  }, [editor, painting])

  function hold(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  function toggleMenu(name: MenuName) {
    setMenu((current) => (current === name ? null : name))
  }

  async function comment() {
    const text = await askText({ title: "New Comment", label: "Comment", multiline: true, ok: "Post" })
    if (!text?.trim()) {
      return
    }
    const { from, to } = editor.state.selection
    if (from === to) {
      const $cell = cellAround(editor.state.selection.$from)
      const node = $cell ? editor.state.doc.nodeAt($cell.pos) : null
      if ($cell && node && node.content.size > 0) {
        editor.commands.setTextSelection({ from: $cell.pos + 1, to: $cell.pos + node.nodeSize - 1 })
      }
    }
    addComment(editor, text)
  }

  return (
    <div
      ref={barRef}
      className={`mini-toolbar table-mini${menusUp ? " is-above" : ""}`}
      role="toolbar"
      aria-label="Table"
      style={style}
      onMouseDown={hold}
    >
      <div className="table-mini-format">
        <div className="mini-toolbar-row">
          <Pop open={menu === "font"}>
            <button
              type="button"
              className="mini-combo is-font"
              aria-label="Font"
              aria-expanded={menu === "font"}
              onClick={() => toggleMenu("font")}
            >
              <span className="truncate">{marks.fontFamily ? fontLabel(marks.fontFamily) : themeBody}</span>
              <Caret />
            </button>
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
          </Pop>
          <Pop open={menu === "size"}>
            <button
              type="button"
              className="mini-combo is-size"
              aria-label="Font size"
              aria-expanded={menu === "size"}
              onClick={() => toggleMenu("size")}
            >
              <span className="tabular-nums">{fontSizeLabel(marks.fontSize)}</span>
              <Caret />
            </button>
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
          </Pop>
          <IconButton label="Grow Font" onClick={() => stepFontSize(editor, 1)}>
            <GrowFontIcon />
          </IconButton>
          <IconButton label="Shrink Font" onClick={() => stepFontSize(editor, -1)}>
            <ShrinkFontIcon />
          </IconButton>
          <Split
            label="Bullets"
            menuLabel="Bullets menu"
            pressed={marks.bulletList}
            open={menu === "bullets"}
            onApply={() => {
              if (marks.bulletList) {
                clearList(editor)
                return
              }
              applyBullet(editor, currentBulletMarker())
            }}
            onOpen={() => toggleMenu("bullets")}
            menu={
              <BulletLibrary
                editor={editor}
                active={marks.bulletMarker}
                inList={marks.bulletList}
                onDialog={() => setMenu(null)}
                onClose={() => setMenu(null)}
              />
            }
          >
            <BulletsIcon />
          </Split>
          <Split
            label="Numbering"
            menuLabel="Numbering menu"
            pressed={marks.orderedList}
            open={menu === "numbering"}
            onApply={() => {
              if (marks.orderedList) {
                clearList(editor)
                return
              }
              applyNumbering(editor, currentNumberMarker())
            }}
            onOpen={() => toggleMenu("numbering")}
            menu={
              <NumberingLibrary
                editor={editor}
                active={marks.numberMarker}
                inList={marks.orderedList}
                onDialog={() => setMenu(null)}
                onClose={() => setMenu(null)}
              />
            }
          >
            <NumberingIcon />
          </Split>
        </div>
        <div className="mini-toolbar-row">
          <IconButton label="Bold" pressed={marks.bold} onClick={() => chainWithSelection(editor).toggleBold().run()}>
            <span className="ribbon-bold-glyph">B</span>
          </IconButton>
          <IconButton
            label="Italic"
            pressed={marks.italic}
            onClick={() => chainWithSelection(editor).toggleItalic().run()}
          >
            <ItalicIcon />
          </IconButton>
          <IconButton
            label="Underline"
            pressed={marks.underline}
            onClick={() => chainWithSelection(editor).toggleUnderline().run()}
          >
            <UnderlineIcon />
          </IconButton>
          <Split
            label="Text Highlight Color"
            menuLabel="Highlight colors"
            open={menu === "highlight"}
            onApply={() => chainWithSelection(editor).setHighlight({ color: highlight }).run()}
            onOpen={() => toggleMenu("highlight")}
            menu={
              <ColorMenu
                palette="highlight"
                active={marks.highlight}
                clearLabel="No Color"
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
            }
          >
            <span className="mini-swatch">
              <HighlightGlyph />
              <span className="mini-swatch-bar" style={{ background: marks.highlight || highlight }} />
            </span>
          </Split>
          <Split
            label="Font Color"
            menuLabel="Font colors"
            open={menu === "color"}
            onApply={() => chainWithSelection(editor).setColor(color).run()}
            onOpen={() => toggleMenu("color")}
            menu={
              <ColorMenu
                palette="theme"
                active={marks.color}
                clearLabel="Automatic"
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
            }
          >
            <span className="mini-swatch">
              <FontColorIcon color={marks.color || color} />
            </span>
          </Split>
          <Split
            label="Alignment"
            menuLabel="Alignment"
            pressed={marks.align !== "left"}
            open={menu === "align"}
            onApply={() =>
              chainWithSelection(editor)
                .setTextAlign(marks.align === "left" ? "center" : "left")
                .run()
            }
            onOpen={() => toggleMenu("align")}
            menu={
              <div className="flex flex-col">
                <MenuItem
                  label="Align Left"
                  onClick={() => {
                    chainWithSelection(editor).setTextAlign("left").run()
                    setMenu(null)
                  }}
                  icon={<AlignLeftIcon />}
                />
                <MenuItem
                  label="Center"
                  onClick={() => {
                    chainWithSelection(editor).setTextAlign("center").run()
                    setMenu(null)
                  }}
                  icon={<AlignCenterIcon />}
                />
                <MenuItem
                  label="Align Right"
                  onClick={() => {
                    chainWithSelection(editor).setTextAlign("right").run()
                    setMenu(null)
                  }}
                  icon={<AlignRightIcon />}
                />
                <MenuItem
                  label="Justify"
                  onClick={() => {
                    chainWithSelection(editor).setTextAlign("justify").run()
                    setMenu(null)
                  }}
                  icon={<AlignJustifyIcon />}
                />
              </div>
            }
          >
            <AlignLeftIcon />
          </Split>
          <Split
            label="Borders"
            menuLabel="Borders menu"
            open={menu === "borders"}
            onApply={() => setTableFrame(editor, "all")}
            onOpen={() => toggleMenu("borders")}
            menu={
              <div className="flex flex-col">
                <MenuItem
                  label="All Borders"
                  onClick={() => {
                    setTableFrame(editor, "all")
                    setMenu(null)
                  }}
                  icon={<AlignBox />}
                />
                <MenuItem
                  label="Bottom Border"
                  onClick={() => {
                    setTableFrame(editor, "bottom")
                    setMenu(null)
                  }}
                  icon={<BordersIcon />}
                />
                <MenuItem
                  label="No Border"
                  onClick={() => {
                    setTableFrame(editor, "none")
                    setMenu(null)
                  }}
                  icon={<ContextGlyph label="No Border" />}
                />
              </div>
            }
          >
            <BorderGridIcon />
          </Split>
          <IconButton label="Border Painter" pressed={painting} onClick={() => setPainting((current) => !current)}>
            <PainterIcon />
          </IconButton>
        </div>
      </div>
      <span className="table-mini-sep" />
      <div className="table-mini-cells">
        <Split
          label="Borders"
          menuLabel="Borders menu"
          open={menu === "frame"}
          onApply={() => setTableFrame(editor, "all")}
          onOpen={() => toggleMenu("frame")}
          menu={
            <div className="flex flex-col">
              <MenuItem
                label="All Borders"
                onClick={() => {
                  setTableFrame(editor, "all")
                  setMenu(null)
                }}
                icon={<AlignBox />}
              />
              <MenuItem
                label="Bottom Border"
                onClick={() => {
                  setTableFrame(editor, "bottom")
                  setMenu(null)
                }}
                icon={<BordersIcon />}
              />
              <MenuItem
                label="No Border"
                onClick={() => {
                  setTableFrame(editor, "none")
                  setMenu(null)
                }}
                icon={<ContextGlyph label="No Border" />}
              />
            </div>
          }
        >
          <BorderGridIcon />
        </Split>
        <Split
          label="Shading"
          menuLabel="Shading colors"
          open={menu === "shading"}
          onApply={() => shadeCells(editor, shading)}
          onOpen={() => toggleMenu("shading")}
          menu={
            <ColorMenu
              palette="theme"
              active=""
              clearLabel="No Color"
              onClear={() => {
                shadeCells(editor, null)
                setMenu(null)
              }}
              onSelect={(next) => {
                setShading(next)
                shadeCells(editor, next)
                setMenu(null)
              }}
            />
          }
        >
          <ShadingIcon />
        </Split>
      </div>
      <span className="table-mini-sep" />
      <div className="table-mini-actions">
        <Split
          label="Insert"
          menuLabel="Insert menu"
          labeled
          open={menu === "insert"}
          onApply={() => editor.chain().focus().addRowAfter().run()}
          onOpen={() => toggleMenu("insert")}
          menu={
            <div className="flex flex-col">
              <MenuItem
                label="Insert Above"
                onClick={() => {
                  editor.chain().focus().addRowBefore().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Above" />}
              />
              <MenuItem
                label="Insert Below"
                onClick={() => {
                  editor.chain().focus().addRowAfter().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Below" />}
              />
              <MenuItem
                label="Insert Left"
                onClick={() => {
                  editor.chain().focus().addColumnBefore().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Left" />}
              />
              <MenuItem
                label="Insert Right"
                onClick={() => {
                  editor.chain().focus().addColumnAfter().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Right" />}
              />
            </div>
          }
        >
          <TableActionIcon kind="insert" />
        </Split>
        <Split
          label="Delete"
          menuLabel="Delete menu"
          labeled
          open={menu === "delete"}
          onApply={() => editor.chain().focus().deleteRow().run()}
          onOpen={() => toggleMenu("delete")}
          menu={
            <div className="flex flex-col">
              <MenuItem
                label="Delete Row"
                onClick={() => {
                  editor.chain().focus().deleteRow().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Delete Row" />}
              />
              <MenuItem
                label="Delete Column"
                onClick={() => {
                  editor.chain().focus().deleteColumn().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Delete Column" />}
              />
              <MenuItem
                label="Delete Table"
                onClick={() => {
                  editor.chain().focus().deleteTable().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Delete Table" />}
              />
            </div>
          }
        >
          <TableActionIcon kind="delete" />
        </Split>
        <Labeled label="New Comment" onClick={comment}>
          <CommentIcon />
        </Labeled>
        <Split
          label="Insert Below"
          menuLabel="Insert below menu"
          labeled
          open={menu === "below"}
          onApply={() => editor.chain().focus().addRowAfter().run()}
          onOpen={() => toggleMenu("below")}
          menu={
            <div className="flex flex-col">
              <MenuItem
                label="Insert Above"
                onClick={() => {
                  editor.chain().focus().addRowBefore().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Above" />}
              />
              <MenuItem
                label="Insert Below"
                onClick={() => {
                  editor.chain().focus().addRowAfter().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Insert Below" />}
              />
            </div>
          }
        >
          <TableActionIcon kind="below" />
        </Split>
        <Split
          label="Table Styles"
          menuLabel="Table styles"
          labeled
          open={menu === "styles"}
          onApply={() => paintTable(editor, "banded")}
          onOpen={() => toggleMenu("styles")}
          menu={<TableStyleGallery editor={editor} close={() => setMenu(null)} />}
        >
          <TableActionIcon kind="styles" />
        </Split>
        <Split
          label="Merge Cells"
          menuLabel="Merge menu"
          labeled
          open={menu === "merge"}
          onApply={() => editor.chain().focus().mergeCells().run()}
          onOpen={() => toggleMenu("merge")}
          menu={
            <div className="flex flex-col">
              <MenuItem
                label="Merge Cells"
                onClick={() => {
                  editor.chain().focus().mergeCells().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Merge Cells" />}
              />
              <MenuItem
                label="Split Cells"
                onClick={() => {
                  editor.chain().focus().splitCell().run()
                  setMenu(null)
                }}
                icon={<ContextGlyph label="Split Cells" />}
              />
            </div>
          }
        >
          <TableActionIcon kind="merge" />
        </Split>
      </div>
    </div>
  )
}

function bodyLabel(bodyFont: string) {
  if (!bodyFont) {
    return "Aptos (Body)"
  }
  const name = bodyFont.split(",")[0].replace(/"/g, "").trim()
  return `${name} (Body)`
}

function Pop({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className={open ? "mini-pop is-open" : "mini-pop"}>{children}</div>
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="mini-tool"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Labeled({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="table-tool-labeled" aria-label={label} title={label} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  )
}

function Split({
  label,
  menuLabel,
  pressed,
  open,
  labeled,
  onApply,
  onOpen,
  menu,
  children,
}: {
  label: string
  menuLabel: string
  pressed?: boolean
  open: boolean
  labeled?: boolean
  onApply: () => void
  onOpen: () => void
  menu: ReactNode
  children: ReactNode
}) {
  if (labeled) {
    return (
      <Pop open={open}>
        <span className="table-split is-labeled">
          <button
            type="button"
            className="table-tool-face"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            onClick={onApply}
          >
            {children}
          </button>
          <span className="table-tool-caption">
            <button type="button" className="table-tool-name" onClick={onApply}>
              {label}
            </button>
            <button type="button" className="mini-caret" aria-label={menuLabel} aria-expanded={open} onClick={onOpen}>
              <Caret />
            </button>
          </span>
        </span>
        {open ? (
          <div className="mini-menu" role="menu">
            {menu}
          </div>
        ) : null}
      </Pop>
    )
  }

  return (
    <Pop open={open}>
      <span className="mini-split">
        <button
          type="button"
          className="mini-tool"
          aria-label={label}
          title={label}
          aria-pressed={pressed}
          onClick={onApply}
        >
          {children}
        </button>
        <button type="button" className="mini-caret" aria-label={menuLabel} aria-expanded={open} onClick={onOpen}>
          <Caret />
        </button>
      </span>
      {open ? (
        <div className="mini-menu" role="menu">
          {menu}
        </div>
      ) : null}
    </Pop>
  )
}

function MenuItem({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="mini-menu-item flex items-center gap-2" onClick={onClick}>
      {icon}
      {label}
    </button>
  )
}

function Caret() {
  return (
    <svg className="mini-caret-icon" width="7" height="7" viewBox="0 0 7 7" aria-hidden>
      <path d="M1 2.2 3.5 5 6 2.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function ItalicIcon() {
  return (
    <RibbonSvg>
      <path d="M7.2 2.8h5M3.8 13.2h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.8 2.8 6.2 13.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function UnderlineIcon() {
  return (
    <RibbonSvg>
      <path d="M4.2 2.6v5.4a3.8 3.8 0 0 0 7.6 0V2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.2 13.6h9.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function FontColorIcon({ color }: { color: string }) {
  return (
    <RibbonSvg>
      <path
        d="M3.4 11.2 7.1 2.6h1.5l3.8 8.6M4.7 8.6h6.4"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M2.6 13.6h10.8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function TableActionIcon({ kind }: { kind: "insert" | "delete" | "below" | "styles" | "merge" }) {
  return (
    <RibbonSvg size={20}>
      <rect x="1.4" y="1.2" width="10.2" height="9.2" fill="#fff" stroke="#8a8a8a" />
      <path d="M1.4 4.2h10.2M1.4 7.2h10.2M4.8 1.2v9.2M8.2 1.2v9.2" stroke="#c8c8c8" />
      {kind === "below" ? <rect x="1.7" y="7.4" width="9.6" height="2.7" fill="#5b9bd5" /> : null}
      {kind === "merge" ? <rect x="1.7" y="4.4" width="9.6" height="2.6" fill="#5b9bd5" /> : null}
      {kind === "insert" ? (
        <path
          d="M6.5 11.2v3.2M5 13.1l1.5 1.5 1.5-1.5"
          stroke="#0f6cbd"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {kind === "delete" ? (
        <path d="M4 4.2 9 9.2M9 4.2 4 9.2" stroke="#d13438" strokeWidth="1.35" strokeLinecap="round" />
      ) : null}
      {kind === "styles" ? (
        <>
          <path d="M8.6 8.4 13.2 3.6" stroke="#c45911" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7.4 9.2 11.6 5" stroke="#5b9bd5" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : null}
    </RibbonSvg>
  )
}

function BorderGridIcon() {
  return (
    <RibbonSvg>
      <rect x="2.2" y="2.2" width="11.6" height="11.6" fill="#fff" stroke="#5c5c5c" />
      <path d="M2.2 6.1h11.6M2.2 10h11.6M6.1 2.2v11.6M10 2.2v11.6" stroke="#c8c8c8" />
    </RibbonSvg>
  )
}

function HighlightGlyph() {
  return (
    <RibbonSvg>
      <path d="M3 12.2 7.2 3.4h1.2L9.6 6" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M4.2 9.2h3.2" stroke="currentColor" strokeWidth="1" />
      <path d="M8.2 6.6 13 11.2" stroke="#f5c518" strokeWidth="2.4" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function PainterIcon() {
  return (
    <RibbonSvg>
      <path d="M3.2 12.8 8.4 4.2l2.8 1.8-5.2 8.4H3.2v-1.6Z" fill="#f4b183" stroke="#c45911" strokeWidth="0.8" />
      <path d="M9.6 4.6 12.4 2.4" stroke="#c45911" strokeWidth="1.3" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function CommentIcon() {
  return (
    <RibbonSvg>
      <path d="M2.2 3.2h9.2v6.4H6.2L3.4 12V9.6H2.2V3.2Z" fill="#fff" stroke="#5b5b5b" />
      <circle cx="12.2" cy="4.2" r="2.3" fill="#107c10" />
      <path d="M12.2 3.2v2M11.2 4.2h2" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function AlignBox() {
  return (
    <RibbonSvg>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" fill="#fff" stroke="currentColor" />
      <path d="M2.4 8h11.2M8 2.4v11.2" stroke="#8a8a8a" />
    </RibbonSvg>
  )
}
