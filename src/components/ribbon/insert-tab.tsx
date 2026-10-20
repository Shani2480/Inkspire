import { IconLibrary } from "@/components/icon-library"
import { ModelLibrary } from "@/components/model-library"
import { SmartArtDialog, SmartArtMenu } from "@/components/smartart-gallery"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import {
  LineBookmarkIcon,
  LineBreakIcon,
  LineCommentIcon,
  LineContentsIcon,
  LineDrawingIcon,
  LineEmojiIcon,
  LineEquationIcon,
  LineHeaderFooterIcon,
  LineLinkIcon,
  LinePageNumberIcon,
  LinePictureIcon,
  LineSymbolIcon,
  LineTableIcon,
  LineVideoIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { DEFAULT_TOC_INSTRUCTION } from "@/document/toc"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { addComment } from "@/editor/comments"
import { useDocumentEditor } from "@/editor/document-editor"
import { insertImageFile } from "@/editor/actions"
import { COVER_PAGES, deleteSavedCover, saveCover, savedCovers, type CoverVariant } from "@/editor/cover-page"
import { formatDate, type DateFormat } from "@/editor/formula"
import { ChartThumb, useChartTypeDialog } from "@/components/chart-menus"
import { defaultChartSpec } from "@/editor/chart-spec"
import {
  ICON_NAMES,
  iconMarkup,
  listBookmarks,
  listHeadings,
  shapeMarkup,
  type ChartKind,
} from "@/editor/insert-blocks"
import { embedVideoSrc } from "@/editor/online-video"
import { insertScreenClipping, pickScreenshotFile } from "@/editor/screenshot"
import { WORD_ART_PRESETS } from "@/editor/text-effects"
import type { BuiltInHeader } from "@/document/page-setup"
import { updateBlocks } from "@/editor/block-format"
import { EquationEditor } from "@/components/equation-editor"
import { EQUATION_PRESETS } from "@/editor/equation"
import { openLocalFile } from "@/lib/file-io"
import { deleteQuickPart, loadQuickParts, saveQuickPart, type QuickPart } from "@/editor/quick-parts"
import { chainWithSelection, insertAtSelectionEnd } from "@/editor/selection-memory"
import { DOMSerializer } from "@tiptap/pm/model"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import katex from "katex"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"

const SHAPE_GROUPS: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: "Lines",
    items: [
      { id: "line", label: "Line" },
      { id: "arrow-line", label: "Line Arrow" },
      { id: "double-arrow", label: "Double Arrow" },
      { id: "elbow", label: "Elbow Connector" },
      { id: "elbow-arrow", label: "Elbow Arrow Connector" },
      { id: "curve", label: "Curve" },
      { id: "curve-arrow", label: "Curve Arrow" },
      { id: "arc", label: "Arc" },
      { id: "scribble", label: "Scribble" },
      { id: "connector", label: "Connector" },
      { id: "freeform", label: "Freeform" },
    ],
  },
  {
    title: "Rectangles",
    items: [
      { id: "rect", label: "Rectangle" },
      { id: "round", label: "Rounded Rectangle" },
      { id: "snip", label: "Snip Rectangle" },
      { id: "snip-corner", label: "Snip Single Corner" },
      { id: "round-single", label: "Round Single Corner" },
      { id: "snip-round", label: "Snip and Round" },
      { id: "round-top", label: "Round Top" },
      { id: "round-diag", label: "Round Diagonal" },
      { id: "same-round", label: "Same Side Round" },
      { id: "plaque", label: "Plaque" },
    ],
  },
  {
    title: "Basic Shapes",
    items: [
      { id: "ellipse", label: "Oval" },
      { id: "triangle", label: "Triangle" },
      { id: "diamond", label: "Diamond" },
      { id: "parallelogram", label: "Parallelogram" },
      { id: "trapezoid", label: "Trapezoid" },
      { id: "pentagon", label: "Pentagon" },
      { id: "hexagon", label: "Hexagon" },
      { id: "octagon", label: "Octagon" },
      { id: "plus", label: "Plus" },
      { id: "pie-shape", label: "Pie" },
      { id: "frame", label: "Frame" },
      { id: "teardrop", label: "Teardrop" },
      { id: "heart", label: "Heart" },
      { id: "moon", label: "Moon" },
      { id: "cloud", label: "Cloud" },
      { id: "donut", label: "Donut" },
      { id: "block-arc", label: "Block Arc" },
      { id: "lightning", label: "Lightning" },
      { id: "sun", label: "Sun" },
      { id: "smiley", label: "Smiley Face" },
      { id: "no-sign", label: "No Symbol" },
      { id: "bracket-left", label: "Left Bracket" },
      { id: "bracket-right", label: "Right Bracket" },
      { id: "brace-left", label: "Left Brace" },
      { id: "brace-right", label: "Right Brace" },
      { id: "cube-shape", label: "Cube" },
      { id: "can", label: "Can" },
    ],
  },
  {
    title: "Block Arrows",
    items: [
      { id: "arrow", label: "Right Arrow" },
      { id: "left-arrow", label: "Left Arrow" },
      { id: "up-arrow", label: "Up Arrow" },
      { id: "down-arrow", label: "Down Arrow" },
      { id: "left-right", label: "Left-Right Arrow" },
      { id: "up-down", label: "Up-Down Arrow" },
      { id: "quad-arrow", label: "Quad Arrow" },
      { id: "left-up", label: "Left-Up Arrow" },
      { id: "bent-arrow", label: "Bent Arrow" },
      { id: "uturn", label: "U-Turn Arrow" },
      { id: "chevron", label: "Chevron" },
      { id: "chevron-left", label: "Left Chevron" },
      { id: "notched", label: "Notched Right Arrow" },
      { id: "striped-arrow", label: "Striped Right Arrow" },
    ],
  },
  {
    title: "Equation Shapes",
    items: [
      { id: "plus-eq", label: "Plus" },
      { id: "minus", label: "Minus" },
      { id: "multiply", label: "Multiply" },
      { id: "divide", label: "Divide" },
      { id: "equal", label: "Equal" },
      { id: "not-equal", label: "Not Equal" },
    ],
  },
  {
    title: "Flowchart",
    items: [
      { id: "process", label: "Process" },
      { id: "decision", label: "Decision" },
      { id: "terminator", label: "Terminator" },
      { id: "data", label: "Data" },
      { id: "document", label: "Document" },
      { id: "preparation", label: "Preparation" },
      { id: "manual-input", label: "Manual Input" },
      { id: "display", label: "Display" },
      { id: "delay", label: "Delay" },
      { id: "stored-data", label: "Stored Data" },
      { id: "flow-or", label: "Or" },
      { id: "flow-merge", label: "Merge" },
      { id: "flow-sort", label: "Sort" },
      { id: "flow-extract", label: "Extract" },
      { id: "flow-collate", label: "Collate" },
      { id: "flow-sum", label: "Summing Junction" },
      { id: "flow-disk", label: "Magnetic Disk" },
      { id: "flow-card", label: "Card" },
    ],
  },
  {
    title: "Stars and Banners",
    items: [
      { id: "star", label: "5-Point Star" },
      { id: "star4", label: "4-Point Star" },
      { id: "star6", label: "6-Point Star" },
      { id: "star7", label: "7-Point Star" },
      { id: "star8", label: "8-Point Star" },
      { id: "star12", label: "12-Point Star" },
      { id: "star16", label: "16-Point Star" },
      { id: "burst", label: "Explosion" },
      { id: "banner", label: "Ribbon" },
      { id: "ribbon-up", label: "Up Ribbon" },
      { id: "wave", label: "Wave" },
      { id: "double-wave", label: "Double Wave" },
      { id: "scroll", label: "Scroll" },
    ],
  },
  {
    title: "Callouts",
    items: [
      { id: "callout", label: "Rectangular Callout" },
      { id: "rounded-callout", label: "Rounded Callout" },
      { id: "oval-callout", label: "Oval Callout" },
      { id: "cloud-callout", label: "Cloud Callout" },
      { id: "line-callout", label: "Line Callout" },
      { id: "callout-2", label: "Line Callout 2" },
      { id: "callout-3", label: "Line Callout 3" },
      { id: "callout-accent", label: "Accent Callout" },
      { id: "callout-border", label: "Border Callout" },
    ],
  },
]

const RECENT_SHAPES_KEY = "aiword-recent-shapes"

function readRecentShapes() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SHAPES_KEY) || "[]")
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string").slice(0, 14) : []
  } catch {
    return []
  }
}

function rememberShape(id: string) {
  const next = [id, ...readRecentShapes().filter((item) => item !== id)].slice(0, 14)
  localStorage.setItem(RECENT_SHAPES_KEY, JSON.stringify(next))
  return next
}

const QUICK_CHARTS: { id: ChartKind; label: string }[] = [
  { id: "column", label: "Column" },
  { id: "line", label: "Line" },
  { id: "pie", label: "Pie / Doughnut" },
  { id: "hbar", label: "Bar" },
  { id: "area", label: "Area" },
  { id: "scatter", label: "Scatter" },
]

const HEADER_GALLERY: { id: BuiltInHeader; label: string; text: string }[] = [
  { id: "blank", label: "Blank", text: "" },
  { id: "columns", label: "Blank (Three Columns)", text: "Left    Center    Right" },
  { id: "austin", label: "Austin", text: "Austin" },
  { id: "banded", label: "Banded", text: "BANDED" },
  { id: "facet", label: "Facet", text: "Facet" },
]

const TEXT_BOXES: { label: string; text: string; fill: string; borderColor: string; width: number }[] = [
  { label: "Simple Text Box", text: "Text box", fill: "#ffffff", borderColor: "#d4d4d4", width: 200 },
  { label: "Austin Quote", text: "Your quote here", fill: "#f8f1fb", borderColor: "#5b2c6f", width: 220 },
  { label: "Austin Sidebar", text: "Sidebar", fill: "#5b2c6f", borderColor: "#5b2c6f", width: 140 },
  { label: "Banded Quote", text: "Your quote here", fill: "#1f4e79", borderColor: "#1f4e79", width: 240 },
  { label: "Banded Sidebar", text: "Sidebar", fill: "#deecf9", borderColor: "#2e75b6", width: 140 },
  { label: "Facet Quote", text: "Your quote here", fill: "#ffffff", borderColor: "#0f6cbd", width: 220 },
  { label: "Filigree Quote", text: "Your quote here", fill: "#fff8e8", borderColor: "#bf8f00", width: 220 },
]

const EXTRA_SYMBOLS = [
  "←",
  "→",
  "↑",
  "↓",
  "↔",
  "⇒",
  "⇐",
  "♠",
  "♣",
  "♥",
  "♦",
  "♪",
  "♫",
  "☑",
  "☒",
  "★",
  "☆",
  "✓",
  "✗",
  "⌘",
  "⌥",
  "∑",
  "∏",
  "∫",
  "∂",
  "∆",
  "∇",
  "∈",
  "∉",
  "⊂",
  "⊃",
  "∧",
  "∨",
  "¬",
  "⊕",
  "⊗",
  "∠",
  "⊥",
  "∥",
  "∴",
  "∵",
  "½",
  "¼",
  "¾",
  "²",
  "³",
  "¹",
  "℃",
  "℉",
  "№",
  "℗",
  "℠",
]

const SYMBOLS = [
  "©",
  "®",
  "™",
  "€",
  "£",
  "¥",
  "°",
  "±",
  "×",
  "÷",
  "≠",
  "≈",
  "≤",
  "≥",
  "∞",
  "√",
  "π",
  "µ",
  "§",
  "¶",
  "•",
  "–",
  "—",
  "‘",
  "’",
  "“",
  "”",
  "«",
  "»",
  "†",
  "‡",
  "…",
  "‰",
  "α",
  "β",
  "γ",
  "Ω",
]

export function InsertTab() {
  const editor = useDocumentEditor()
  const fileInput = useRef<HTMLInputElement>(null)
  const insertAt = useRef<number | null>(null)
  const [bookmarkOpen, setBookmarkOpen] = useState(false)
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false)
  const [modelLibraryOpen, setModelLibraryOpen] = useState(false)
  const [smartArtOpen, setSmartArtOpen] = useState(false)
  const [symbolOpen, setSymbolOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [equationTex, setEquationTex] = useState<string | null>(null)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const targets = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? { bookmarks: listBookmarks(current.state.doc), headings: listHeadings(current.state.doc) }
        : { bookmarks: [], headings: [] },
  })

  function openImagePicker() {
    if (!editor) {
      return
    }
    insertAt.current = editor.state.selection.from
    fileInput.current?.click()
  }

  const off = !editor

  const coverMenu = (close: () => void) => {
    const first = editor?.state.doc.firstChild
    const current = first?.type.name === "coverPage" ? first : null
    const tile = (key: string, variant: CoverVariant, label: string, title?: string, subtitle?: string) => (
      <button
        key={key}
        type="button"
        data-keep-light
        title={label}
        className={`cover-thumb cover-thumb-${variant} flex h-20 flex-col justify-end rounded border border-[#d0d0d0] p-2 text-left`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          editor?.chain().focus().insertCoverPage(variant, title, subtitle).run()
          close()
        }}
      >
        <span className="text-[11px] font-semibold leading-tight">{label}</span>
      </button>
    )
    const saved = savedCovers()
    return (
      <div className="flex w-[360px] flex-col">
        <div className="grid max-h-[420px] grid-cols-3 gap-1 overflow-auto p-1">
          {COVER_PAGES.map((cover) => tile(cover.id, cover.id, cover.label))}
          {saved.map((cover) => (
            <div key={`saved-${cover.name}`} className="relative">
              {tile(`saved-${cover.name}`, cover.variant, cover.name, cover.title, cover.subtitle)}
              <button
                type="button"
                className="absolute right-1 top-1 rounded px-1 text-[11px] leading-none text-[#555] hover:bg-[#e5e5e5]"
                aria-label={`Delete ${cover.name} from the gallery`}
                title="Delete from the gallery"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  deleteSavedCover(cover.name)
                  close()
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <MenuButton
          onClick={() => {
            editor?.chain().focus().removeCoverPage().run()
            close()
          }}
        >
          Remove Current Cover Page
        </MenuButton>
        <MenuButton
          selected={false}
          onClick={() => {
            if (current) {
              const title = String(current.attrs.title)
              saveCover({
                name: title.slice(0, 24) || "Saved cover",
                variant: current.attrs.variant as CoverVariant,
                title,
                subtitle: String(current.attrs.subtitle),
              })
            }
            close()
          }}
          className={current ? "" : "opacity-50"}
        >
          Save Selection to Cover Page Gallery…
        </MenuButton>
      </div>
    )
  }
  const insertBlankPage = () => editor && insertAtSelectionEnd(editor).setBlankPage().run()
  const insertPageBreak = () => editor && insertAtSelectionEnd(editor).setPageBreak().run()
  const tableMenu = (close: () => void) => (
    <TableGrid
      onInsert={(rows, cols) => {
        if (editor) {
          insertAtSelectionEnd(editor).insertTable({ rows, cols, withHeaderRow: true }).run()
        }
        close()
      }}
    />
  )
  const picturesMenu = (close: () => void) => (
    <MenuButton
      onClick={() => {
        openImagePicker()
        close()
      }}
    >
      This Device
    </MenuButton>
  )
  const shapesMenu = (close: () => void) => (
    <ShapesMenu
      onPick={(id) => {
        editor?.chain().focus().insertFigure("shape", id).run()
        close()
      }}
      onCanvas={() => {
        editor?.chain().focus().insertDrawingCanvas().run()
        close()
      }}
    />
  )
  const iconsMenu = (close: () => void) => (
    <div className="flex w-56 flex-col">
      <div className="grid max-h-48 grid-cols-4 gap-1 overflow-auto p-1">
        {ICON_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            className="flex h-9 items-center justify-center rounded hover:bg-[var(--app-hover)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor?.chain().focus().insertFigure("icon", name).run()
              close()
            }}
          >
            <IconPreview name={name} />
          </button>
        ))}
      </div>
      <MenuButton
        onClick={() => {
          setIconLibraryOpen(true)
          close()
        }}
      >
        Online Icons…
      </MenuButton>
    </div>
  )
  const smartArtMenu = (close: () => void) =>
    editor ? (
      <SmartArtMenu
        editor={editor}
        onClose={close}
        onMore={() => {
          setSmartArtOpen(true)
          close()
        }}
      />
    ) : null
  const chartMenu = (close: () => void) => (
    <div className="chart-quick-menu">
      <p className="chart-quick-label">Insert Chart</p>
      <div className="chart-quick-grid">
        {QUICK_CHARTS.map((chart) => (
          <button
            key={chart.id}
            type="button"
            className="chart-quick-tile"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor?.chain().focus().insertFigure("chart", chart.id).run()
              close()
            }}
          >
            <ChartThumb spec={defaultChartSpec(chart.id)} width={56} height={40} />
            <span>{chart.label}</span>
          </button>
        ))}
      </div>
      <MenuButton
        onClick={() => {
          useChartTypeDialog.getState().show("insert")
          close()
        }}
      >
        More Charts…
      </MenuButton>
    </div>
  )
  const insertSheet = () => editor?.chain().focus().insertSheetBlock().run()
  const insertCanvas = () => editor?.chain().focus().insertDrawingCanvas().run()
  const screenshotMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          if (editor) {
            void insertScreenClipping(editor)
          }
          close()
        }}
      >
        Screen Clipping
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) {
            pickScreenshotFile(editor, insertAt.current ?? undefined)
          }
          close()
        }}
      >
        From File…
      </MenuButton>
    </div>
  )
  const linkMenu = (close: () => void) => <LinkMenu editor={editor} close={close} />
  const crossReferenceMenu = (close: () => void) => (
    <div className="flex max-h-64 w-56 flex-col overflow-auto">
      {(targets?.headings ?? []).map((heading) => (
        <MenuButton
          key={`h-${heading.pos}`}
          onClick={() => {
            if (editor) {
              chainWithSelection(editor).insertContent(`${heading.text}`).run()
            }
            close()
          }}
        >
          {heading.text}
        </MenuButton>
      ))}
      {(targets?.bookmarks ?? []).map((name) => (
        <MenuButton
          key={name}
          onClick={() => {
            if (editor) {
              chainWithSelection(editor)
                .insertContent(`<a href="#bm-${encodeURIComponent(name.replace(/[^a-zA-Z0-9_-]/g, "-"))}">${name}</a>`)
                .run()
            }
            close()
          }}
        >
          {name}
        </MenuButton>
      ))}
      {(targets?.headings.length ?? 0) + (targets?.bookmarks.length ?? 0) === 0 ? (
        <p className="px-2 py-1 text-xs text-neutral-500">Add a heading or bookmark first.</p>
      ) : null}
    </div>
  )
  const commentMenu = (close: () => void) => <CommentMenu editor={editor} close={close} />
  const textBoxMenu = (close: () => void) => (
    <div className="grid w-[280px] grid-cols-2 gap-1 p-1">
      {TEXT_BOXES.map((box) => (
        <button
          key={box.label}
          type="button"
          className="flex h-16 flex-col items-center justify-center rounded border border-[#e1e1e1] px-2 text-[11px]"
          style={{
            background: box.fill,
            color: box.fill === "#1f4e79" || box.fill === "#5b2c6f" ? "#fff" : "#242424",
            borderColor: box.borderColor,
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor?.chain().focus().insertTextBox(box).run()
            close()
          }}
        >
          {box.label}
        </button>
      ))}
    </div>
  )
  const quickPartsMenu = (close: () => void) => <QuickMenu editor={editor} close={close} />
  const wordArtMenu = (close: () => void) => (
    <div className="grid w-[300px] grid-cols-4 gap-1 p-1">
      {WORD_ART_PRESETS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          title={item.label}
          className={`word-art flex h-14 items-center justify-center rounded border border-[#e1e1e1] bg-white text-[22px]${item.path && item.path !== "none" ? ` word-art-path-${item.path}` : ""}`}
          data-preset={item.id}
          data-path={item.path || "none"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor?.chain().focus().insertWordArt(item.id).run()
            close()
          }}
        >
          A
        </button>
      ))}
    </div>
  )
  const dropCapMenu = (close: () => void) => <DropCapMenu editor={editor} close={close} />
  const signatureMenu = (close: () => void) => <SignatureMenu editor={editor} close={close} />
  const dateMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton onClick={() => editor && insertStatic(editor, "date", close)}>Date</MenuButton>
      <MenuButton onClick={() => editor && insertStatic(editor, "time", close)}>Time</MenuButton>
      <MenuButton onClick={() => editor && insertStatic(editor, "datetime", close)}>Date and time</MenuButton>
      <MenuButton onClick={() => editor && insertAutomatic(editor, "date", close)}>Automatic date</MenuButton>
      <MenuButton onClick={() => editor && insertAutomatic(editor, "datetime", close)}>
        Automatic date and time
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().updateDateFields().run()
          close()
        }}
      >
        Update automatic fields
      </MenuButton>
    </div>
  )
  const objectMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          if (editor) {
            void insertTextFromFile(editor)
          }
          close()
        }}
      >
        Text from File…
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor?.chain().focus().insertSheetBlock().run()
          close()
        }}
      >
        Spreadsheet
      </MenuButton>
      <MenuButton
        onClick={() => {
          setEquationTex("x=y")
          close()
        }}
      >
        Equation
      </MenuButton>
    </div>
  )
  const equationMenu = (close: () => void) => (
    <div className="flex w-72 flex-col">
      {EQUATION_PRESETS.map((item) => (
        <button
          key={item.label}
          type="button"
          className="flex items-center justify-between gap-3 px-2 py-1.5 text-left hover:bg-[#f3f3f3]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor?.chain().focus().insertEquation(item.tex).run()
            close()
          }}
        >
          <span className="text-[12px] text-[#595959]">{item.label}</span>
          <TexPreview tex={item.tex} />
        </button>
      ))}
      <MenuButton
        onClick={() => {
          setEquationTex("x=y")
          close()
        }}
      >
        Insert New Equation...
      </MenuButton>
    </div>
  )
  const symbolMenu = (close: () => void) => (
    <div className="w-56 p-1">
      <div className="grid grid-cols-8 gap-0.5">
        {SYMBOLS.map((symbol) => (
          <SymbolButton key={symbol} symbol={symbol} editor={editor} close={close} />
        ))}
      </div>
      <MenuButton
        onClick={() => {
          setSymbolOpen(true)
          close()
        }}
      >
        More Symbols...
      </MenuButton>
    </div>
  )

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file && editor) {
          insertImageFile(editor, file, insertAt.current ?? undefined)
        }
        event.target.value = ""
      }}
    />
  )
  const dialogs = (
    <>
      {bookmarkOpen && editor ? (
        <BookmarkDialog editor={editor} names={targets?.bookmarks ?? []} onClose={() => setBookmarkOpen(false)} />
      ) : null}
      {iconLibraryOpen && editor ? <IconLibrary editor={editor} onClose={() => setIconLibraryOpen(false)} /> : null}
      {modelLibraryOpen && editor ? <ModelLibrary editor={editor} onClose={() => setModelLibraryOpen(false)} /> : null}
      {smartArtOpen && editor ? <SmartArtDialog editor={editor} onClose={() => setSmartArtOpen(false)} /> : null}
      {symbolOpen && editor ? <SymbolDialog editor={editor} onClose={() => setSymbolOpen(false)} /> : null}
      {equationTex != null && editor ? (
        <EquationDialog editor={editor} initial={equationTex} onClose={() => setEquationTex(null)} />
      ) : null}
      {videoOpen && editor ? <VideoDialog editor={editor} onClose={() => setVideoOpen(false)} /> : null}
    </>
  )

  if (ribbonLayout === "single") {
    const bookmarks = targets?.bookmarks ?? []
    // Word for the web's single line Insert tab, left to right (`screenshots/ribbon/`); the rest of the classic tab
    // is under More options.
    const rowCommands: LineCommand[] = [
      { id: "page-break", label: "Page Break", icon: <LineBreakIcon />, priority: 2, onClick: insertPageBreak },
      { id: "table", label: "Table", icon: <LineTableIcon />, priority: 3, menu: tableMenu },
      { id: "picture", label: "Picture", icon: <LinePictureIcon />, priority: 3, menu: picturesMenu },
      { id: "drawing", label: "Drawing", icon: <LineDrawingIcon />, priority: 1, onClick: insertCanvas },
      { id: "link", label: "Link", icon: <LineLinkIcon />, priority: 2, menu: linkMenu },
      {
        id: "table-of-contents",
        label: "Table of Contents",
        icon: <LineContentsIcon />,
        priority: 1,
        description: "Insert a table of contents built from the headings.",
        onClick: () =>
          editor &&
          insertAtSelectionEnd(editor)
            .insertTableOfContents({
              title: "Contents",
              instruction: DEFAULT_TOC_INSTRUCTION,
              leader: "dot",
              rightAlign: true,
            })
            .run(),
      },
      {
        id: "bookmarks",
        label: "Bookmarks",
        icon: <LineBookmarkIcon />,
        menu: (close) => (
          <div className="flex max-h-64 w-56 flex-col overflow-auto">
            <MenuButton
              onClick={() => {
                setBookmarkOpen(true)
                close()
              }}
            >
              Insert Bookmark…
            </MenuButton>
            {bookmarks.map((name) => (
              <MenuButton
                key={name}
                onClick={() => {
                  if (editor) {
                    goToBookmark(editor, name)
                  }
                  close()
                }}
              >
                {name}
              </MenuButton>
            ))}
          </div>
        ),
      },
      { id: "online-video", label: "Online Video", icon: <LineVideoIcon />, onClick: () => setVideoOpen(true) },
      { id: "new-comment", label: "New Comment", icon: <LineCommentIcon />, chevron: false, menu: commentMenu },
      {
        id: "header-footer",
        label: "Header & Footer",
        icon: <LineHeaderFooterIcon />,
        description: "Edit the header and footer of the document.",
        onClick: () => editChromePart("header"),
      },
      {
        id: "page-numbers",
        label: "Page Numbers",
        icon: <LinePageNumberIcon />,
        menu: (close) => <PageNumberMenu close={close} />,
      },
      { id: "equation", label: "Equation", icon: <LineEquationIcon />, onClick: () => setEquationTex("x=y") },
      { id: "symbol", label: "Symbol", icon: <LineSymbolIcon />, menu: symbolMenu },
      {
        id: "emoji",
        label: "Emoji",
        icon: <LineEmojiIcon />,
        menu: (close) => <EmojiMenu editor={editor} close={close} />,
      },
    ]
    const row = rowCommands.map((command) => ({ ...command, showLabel: true, disabled: off }))
    const more: LineGroup[] = [
      {
        id: "pages",
        commands: [
          { id: "cover-page", label: "Cover Page", icon: <CoverIcon />, menu: coverMenu },
          { id: "blank-page", label: "Blank Page", icon: <PageIcon />, onClick: insertBlankPage },
        ],
      },
      {
        id: "illustrations",
        commands: [
          { id: "shapes", label: "Shapes", icon: <ShapeIcon />, menu: shapesMenu },
          { id: "icons", label: "Icons", icon: <IconGlyph />, menu: iconsMenu },
          { id: "3d-models", label: "3D Models", icon: <CubeIcon />, onClick: () => setModelLibraryOpen(true) },
          { id: "smartart", label: "SmartArt", icon: <SmartArtIcon />, menu: smartArtMenu },
          { id: "chart", label: "Chart", icon: <ChartIcon />, menu: chartMenu },
          { id: "spreadsheet", label: "Spreadsheet", icon: <SheetIcon />, onClick: insertSheet },
          { id: "screenshot", label: "Screenshot", icon: <ScreenshotIcon />, menu: screenshotMenu },
        ],
      },
      {
        id: "links",
        commands: [
          { id: "cross-reference", label: "Cross-reference", icon: <CrossRefIcon />, menu: crossReferenceMenu },
        ],
      },
      {
        id: "text",
        commands: [
          { id: "text-box", label: "Text Box", icon: <TextBoxIcon />, menu: textBoxMenu },
          { id: "quick-parts", label: "Quick Parts", icon: <PartsIcon />, menu: quickPartsMenu },
          { id: "wordart", label: "WordArt", icon: <WordArtIcon />, menu: wordArtMenu },
          { id: "drop-cap", label: "Drop Cap", icon: <DropCapIcon />, menu: dropCapMenu },
          { id: "signature-line", label: "Signature Line", icon: <SignatureIcon />, menu: signatureMenu },
          { id: "date-time", label: "Date & Time", icon: <DateIcon />, menu: dateMenu },
          { id: "object", label: "Object", icon: <ObjectIcon />, menu: objectMenu },
        ],
      },
    ].map((group) => ({ ...group, commands: group.commands.map((command) => ({ ...command, disabled: off })) }))

    return (
      <>
        <SingleLineBar label="Insert" groups={[{ id: "insert", commands: row }]} more={more} />
        {fileField}
        {dialogs}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Insert" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Pages">
        <RibbonCommand label="Cover Page" disabled={off} menu={coverMenu}>
          <CoverIcon />
        </RibbonCommand>
        <RibbonCommand label="Blank Page" disabled={off} onClick={insertBlankPage}>
          <PageIcon />
        </RibbonCommand>
        <RibbonCommand label="Page Break" disabled={off} onClick={insertPageBreak}>
          <BreakIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Tables">
        <RibbonCommand label="Table" disabled={off} menu={tableMenu}>
          <TableIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <RibbonCommand label="Pictures" disabled={off} menu={picturesMenu}>
          <PictureIcon />
        </RibbonCommand>
        <RibbonCommand label="Shapes" disabled={off} menu={shapesMenu}>
          <ShapeIcon />
        </RibbonCommand>
        <RibbonCommand label="Icons" disabled={off} menu={iconsMenu}>
          <IconGlyph />
        </RibbonCommand>
        <RibbonCommand label="3D Models" disabled={off} onClick={() => setModelLibraryOpen(true)}>
          <CubeIcon />
        </RibbonCommand>
        <RibbonCommand label="SmartArt" disabled={off} menu={smartArtMenu}>
          <SmartArtIcon />
        </RibbonCommand>
        <RibbonCommand label="Chart" disabled={off} menu={chartMenu}>
          <ChartIcon />
        </RibbonCommand>
        <RibbonCommand label="Spreadsheet" disabled={off} onClick={insertSheet}>
          <SheetIcon />
        </RibbonCommand>
        <RibbonCommand label="Drawing Canvas" disabled={off} onClick={insertCanvas}>
          <DrawingCanvasIcon />
        </RibbonCommand>
        <RibbonCommand label="Screenshot" disabled={off} menu={screenshotMenu}>
          <ScreenshotIcon />
        </RibbonCommand>
        {fileField}
      </RibbonGroup>
      <RibbonGroup label="Media">
        <RibbonCommand label="Online Videos" disabled={off} onClick={() => setVideoOpen(true)}>
          <VideoIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Links">
        <RibbonCommand label="Link" disabled={off} menu={linkMenu}>
          <LinkIcon />
        </RibbonCommand>
        <RibbonCommand label="Bookmark" disabled={off} onClick={() => setBookmarkOpen(true)}>
          <BookmarkIcon />
        </RibbonCommand>
        <RibbonCommand label="Cross-reference" disabled={off} menu={crossReferenceMenu}>
          <CrossRefIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <RibbonCommand label="Comment" disabled={off} menu={commentMenu}>
          <CommentIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Header & Footer">
        <HeaderFooterCommands />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <RibbonCommand label="Text Box" disabled={off} menu={textBoxMenu}>
          <TextBoxIcon />
        </RibbonCommand>
        <RibbonCommand label="Quick Parts" disabled={off} menu={quickPartsMenu}>
          <PartsIcon />
        </RibbonCommand>
        <RibbonCommand label="WordArt" disabled={off} menu={wordArtMenu}>
          <WordArtIcon />
        </RibbonCommand>
        <RibbonCommand label="Drop Cap" disabled={off} menu={dropCapMenu}>
          <DropCapIcon />
        </RibbonCommand>
        <RibbonCommand label="Signature Line" disabled={off} menu={signatureMenu}>
          <SignatureIcon />
        </RibbonCommand>
        <RibbonCommand label="Date & Time" disabled={off} menu={dateMenu}>
          <DateIcon />
        </RibbonCommand>
        <RibbonCommand label="Object" disabled={off} menu={objectMenu}>
          <ObjectIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <RibbonCommand label="Equation" disabled={off} menu={equationMenu}>
          <EquationIcon />
        </RibbonCommand>
        <RibbonCommand label="Symbol" disabled={off} menu={symbolMenu}>
          <SymbolIcon />
        </RibbonCommand>
      </RibbonGroup>
      {dialogs}
    </div>
  )
}

async function insertTextFromFile(editor: Editor) {
  const file = await openLocalFile(
    [
      { name: "Text", extensions: ["txt", "md", "html", "htm", "rtf"] },
      { name: "All Files", extensions: ["*"] },
    ],
    "Insert Text from File",
  )
  if (!file?.text) {
    return
  }
  const name = file.name.toLowerCase()
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    chainWithSelection(editor).insertContent(file.text).run()
    return
  }
  const paragraphs = file.text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("")
  chainWithSelection(editor)
    .insertContent(paragraphs || "<p></p>")
    .run()
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function VideoDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("https://")
  const embed = embedVideoSrc(url)
  return (
    <Overlay title="Insert Online Video" onClose={onClose}>
      <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
        Video address (YouTube or Vimeo)
        <input
          aria-label="Video address"
          value={url}
          className="h-8 rounded border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      {url.trim() && !embed ? <p className="mt-2 text-[11px] text-[#d13438]">Enter a YouTube or Vimeo link.</p> : null}
      <DialogActions
        onClose={onClose}
        onOk={() => {
          if (!embed) {
            return
          }
          editor.chain().focus().insertOnlineVideo(url).run()
          onClose()
        }}
      />
    </Overlay>
  )
}

function DropCapMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const choices = [
    { id: null, label: "None" },
    { id: "dropped", label: "Dropped" },
    { id: "margin", label: "In margin" },
  ] as const

  return (
    <div className="grid w-[220px] grid-cols-3 gap-1 p-1">
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          className="flex h-16 flex-col items-center justify-center rounded border border-[#e1e1e1] bg-white text-[11px] hover:border-[#0f6cbd]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (editor) {
              updateBlocks(editor, { dropCap: choice.id })
            }
            close()
          }}
        >
          <span className="text-[18px] leading-none font-medium">{choice.id ? "A" : "—"}</span>
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function SignatureMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")

  if (!custom) {
    return (
      <div className="flex w-64 flex-col p-1">
        <button
          type="button"
          className="flex flex-col gap-1 rounded border border-[#e1e1e1] bg-white p-2 text-left hover:border-[#0f6cbd]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editor?.chain().focus().insertSignature("", "").run()
            close()
          }}
        >
          <div className="flex items-end gap-2 border-b border-[#242424] pb-1">
            <span className="font-['Segoe_Script','Brush_Script_MT',cursive] text-[20px] text-[#0f6cbd]">X</span>
            <span className="mb-1 h-px flex-1 bg-[#242424]" />
          </div>
          <span className="text-[11px] text-neutral-600">Microsoft Office Signature Line</span>
        </button>
        <MenuButton onClick={() => setCustom(true)}>Signature Setup…</MenuButton>
      </div>
    )
  }

  return (
    <form
      className="flex w-64 flex-col gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault()
        editor?.chain().focus().insertSignature(name, title).run()
        close()
      }}
    >
      <div className="flex items-end gap-2 border-b border-[#242424] pb-1">
        <span className="font-['Segoe_Script','Brush_Script_MT',cursive] text-[22px] text-[#0f6cbd]">X</span>
        <span className="mb-1 h-px flex-1 bg-[#242424]" />
      </div>
      <label className="text-[11px] text-neutral-500">
        Suggested signer
        <input
          aria-label="Suggested signer"
          value={name}
          className="mt-1 h-8 w-full rounded border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-[11px] text-neutral-500">
        Suggested signer's title
        <input
          aria-label="Suggested signer title"
          value={title}
          className="mt-1 h-8 w-full rounded border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="h-8 flex-1 rounded border border-black/15 text-sm"
          onClick={() => setCustom(false)}
        >
          Back
        </button>
        <button type="submit" className="h-8 flex-1 rounded bg-[#0f6cbd] text-sm text-white">
          Insert
        </button>
      </div>
    </form>
  )
}

function EquationDialog({ editor, initial, onClose }: { editor: Editor; initial: string; onClose: () => void }) {
  return (
    <EquationEditor
      title="Insert New Equation"
      initial={initial}
      ok="Insert"
      onClose={onClose}
      onOk={(tex) => {
        editor.chain().focus().insertEquation(tex).run()
        onClose()
      }}
    />
  )
}

function goToBookmark(editor: Editor, target: string) {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) {
      return false
    }
    if (node.isText && node.marks.some((mark) => mark.type.name === "bookmark" && mark.attrs.id === target)) {
      found = pos
    }
  })
  if (found >= 0) {
    editor.chain().focus().setTextSelection(found).scrollIntoView().run()
  }
}

function BookmarkDialog({ editor, names, onClose }: { editor: Editor; names: string[]; onClose: () => void }) {
  const [name, setName] = useState("")
  const [selected, setSelected] = useState(names[0] ?? "")
  const [error, setError] = useState("")
  const sorted = [...names].sort((left, right) => left.localeCompare(right))

  function go(target: string) {
    goToBookmark(editor, target)
    onClose()
  }

  function remove(target: string) {
    const mark = editor.schema.marks.bookmark
    if (!mark) {
      return
    }
    let transaction = editor.state.tr
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((item) => item.type.name === "bookmark" && item.attrs.id === target)) {
        transaction = transaction.removeMark(pos, pos + node.nodeSize, mark)
      }
    })
    editor.view.dispatch(transaction)
  }

  return (
    <Overlay title="Bookmark" onClose={onClose}>
      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        Bookmark name
        <input
          aria-label="Bookmark name"
          value={name}
          className="h-8 rounded-md border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => {
            setName(event.target.value)
            setError("")
          }}
        />
      </label>
      {error ? <p className="mt-1 text-xs text-[#c00000]">{error}</p> : null}
      <div className="mt-3 max-h-40 overflow-auto rounded-md border border-black/10">
        {sorted.length === 0 ? <p className="px-2 py-2 text-xs text-neutral-500">No bookmarks yet.</p> : null}
        {sorted.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={selected === item}
            className="flex h-8 w-full items-center px-2 text-left text-sm aria-pressed:bg-[var(--app-theme-light)]"
            onClick={() => setSelected(item)}
            onDoubleClick={() => go(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="word-dialog-actions">
        <button
          type="button"
          className="dialog-btn is-primary"
          onClick={() => {
            const id = name.trim().replace(/\s+/g, " ").slice(0, 40)
            if (!id) {
              setError("Enter a bookmark name.")
              return
            }
            if (names.includes(id)) {
              setError("That bookmark name already exists.")
              return
            }
            if (!editor.chain().focus().insertBookmark(id).run()) {
              setError("Could not add bookmark.")
              return
            }
            onClose()
          }}
        >
          Add
        </button>
        <button type="button" className="dialog-btn" disabled={!selected} onClick={() => selected && remove(selected)}>
          Delete
        </button>
        <button type="button" className="dialog-btn" disabled={!selected} onClick={() => selected && go(selected)}>
          Go To
        </button>
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Overlay>
  )
}

function SymbolDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const symbols = [...SYMBOLS, ...EXTRA_SYMBOLS].filter((symbol) => !query || symbol.includes(query))

  return (
    <Overlay title="Symbol" onClose={onClose}>
      <input
        aria-label="Find a symbol"
        value={query}
        placeholder="Type a character to find it"
        className="h-8 w-full rounded-md border border-black/15 px-2 text-sm"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-3 grid max-h-52 grid-cols-10 gap-1 overflow-auto">
        {symbols.map((symbol) => (
          <SymbolButton key={symbol} symbol={symbol} editor={editor} close={onClose} />
        ))}
      </div>
    </Overlay>
  )
}

function SymbolButton({ symbol, editor, close }: { symbol: string; editor: Editor | null; close: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Insert ${symbol}`}
      className="h-7 rounded text-sm hover:bg-neutral-100"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (editor) {
          chainWithSelection(editor).insertContent(symbol).run()
        }
        close()
      }}
    >
      {symbol}
    </button>
  )
}

function TexPreview({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (ref.current) {
      katex.render(tex, ref.current, { throwOnError: false, displayMode: false })
    }
  }, [tex])
  return <span ref={ref} />
}

function ShapesMenu({ onPick, onCanvas }: { onPick: (id: string) => void; onCanvas: () => void }) {
  const [recent, setRecent] = useState<string[]>(() => readRecentShapes())
  const known = new Map(SHAPE_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label] as const)))
  const recentItems = recent.flatMap((id) => {
    const label = known.get(id)
    return label ? [{ id, label }] : []
  })
  const groups = recentItems.length
    ? [{ title: "Recently Used Shapes", items: recentItems }, ...SHAPE_GROUPS]
    : SHAPE_GROUPS

  return (
    <div className="shape-gallery">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="shape-gallery-title">{group.title}</p>
          <div className="shape-gallery-grid">
            {group.items.map((shape) => (
              <button
                key={`${group.title}-${shape.id}`}
                type="button"
                aria-label={shape.label}
                title={shape.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setRecent(rememberShape(shape.id))
                  onPick(shape.id)
                }}
              >
                <ShapePreview id={shape.id} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="shape-gallery-canvas"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCanvas}
      >
        <ShapePreview id="rect" />
        New Drawing Canvas
      </button>
    </div>
  )
}

function ShapePreview({ id }: { id: string }) {
  return (
    <svg width="16" height="12" viewBox="0 0 80 56" aria-hidden dangerouslySetInnerHTML={{ __html: shapeMarkup(id) }} />
  )
}

/** Header, Footer and Page Number, on the Insert tab and on the Header & Footer tab. */
/** The Header, Footer and Page Number menus, shared by the classic and single line Header & Footer tabs. */
export function useChromeMenus() {
  const setHeader = useDocumentStore((state) => state.setHeader)
  const setFooter = useDocumentStore((state) => state.setFooter)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const chromeMenu = (kind: "header" | "footer") => (close: () => void) => (
    <BuiltInChrome
      kind={kind}
      onPick={(item) => {
        if (kind === "header") {
          setHeader(item.text)
          setPageSetup({ ...setup, headerStyle: item.id })
        } else {
          setFooter(item.text)
          setPageSetup({ ...setup, footerStyle: item.id })
        }
        close()
        editChromePart(kind)
      }}
      onEdit={() => {
        close()
        editChromePart(kind)
      }}
      onRemove={() => {
        if (kind === "header") {
          setHeader("")
          setPageSetup({ ...setup, headerStyle: "blank" })
        } else {
          setFooter("")
          setPageSetup({ ...setup, footerStyle: "blank" })
        }
        close()
      }}
    />
  )
  return {
    headerMenu: chromeMenu("header"),
    footerMenu: chromeMenu("footer"),
    pageNumberMenu: (close: () => void) => <PageNumberMenu close={close} />,
  }
}

export function HeaderFooterCommands() {
  const { headerMenu, footerMenu, pageNumberMenu } = useChromeMenus()
  return (
    <>
      <RibbonCommand label="Header" menu={headerMenu}>
        <HeaderIcon />
      </RibbonCommand>
      <RibbonCommand label="Footer" menu={footerMenu}>
        <FooterIcon />
      </RibbonCommand>
      <RibbonCommand label="Page Number" menu={pageNumberMenu}>
        <NumberIcon />
      </RibbonCommand>
    </>
  )
}

const PAGE_NUMBER_PLACES = [
  ["bottom-center", "Bottom of page"],
  ["bottom-right", "Bottom right"],
  ["top-center", "Top of page"],
  ["top-right", "Top right"],
  ["none", "Remove page numbers"],
] as const

function PageNumberMenu({ close }: { close: () => void }) {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  return (
    <div className="flex w-44 flex-col">
      {PAGE_NUMBER_PLACES.map(([id, label]) => (
        <MenuButton
          key={id}
          selected={setup.pageNumber === id}
          onClick={() => {
            setPageSetup({ ...setup, pageNumber: id })
            close()
          }}
        >
          {label}
        </MenuButton>
      ))}
    </div>
  )
}

/** As in Word, choosing a header or footer opens it for editing, on the first page. */
export function editChromePart(part: "header" | "footer") {
  useViewStore.getState().editChrome(part, 0)
}

function BuiltInChrome({
  kind,
  onPick,
  onEdit,
  onRemove,
}: {
  kind: "header" | "footer"
  onPick: (item: (typeof HEADER_GALLERY)[number]) => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div className="w-64 p-1">
      <p className="px-1 py-0.5 text-[11px] font-semibold text-neutral-500">Built-in</p>
      <div className="grid grid-cols-2 gap-1">
        {HEADER_GALLERY.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chrome-sample flex h-14 items-center justify-center rounded border border-[#e1e1e1] px-1 text-[11px]"
            data-chrome={item.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <MenuButton onClick={onEdit}>Edit {kind === "header" ? "Header" : "Footer"}</MenuButton>
      <MenuButton onClick={onRemove}>Remove {kind === "header" ? "Header" : "Footer"}</MenuButton>
    </div>
  )
}

function Overlay({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  return (
    <DialogFrame title={title} width={wide ? 640 : 440} onClose={onClose}>
      {children}
    </DialogFrame>
  )
}

function DialogActions({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  return <DialogButtons onOk={onOk} onCancel={onClose} />
}

function DropCapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <text x="1" y="15" fontSize="13" fontFamily="Georgia, serif">
        A
      </text>
      <path d="M12 6h6M12 10h6M12 14h6" stroke="currentColor" />
    </svg>
  )
}

function LinkMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const [url, setUrl] = useState("https://")
  return (
    <form
      className="flex w-64 flex-col gap-2 p-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!editor) {
          return
        }
        const href = url.trim()
        if (!href) {
          return
        }
        const chain = chainWithSelection(editor)
        if (editor.state.selection.empty) {
          chain.insertContent(`<a href="${href}">${href}</a>`).run()
        } else {
          chain.extendMarkRange("link").setLink({ href }).run()
        }
        close()
      }}
    >
      <label className="text-[11px] text-neutral-500">
        Address
        <input
          aria-label="Link address"
          value={url}
          className="mt-1 h-8 w-full rounded border border-black/15 px-2 text-sm text-neutral-900"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <button type="submit" className="h-8 rounded bg-[#0f6cbd] text-sm text-white">
        Insert
      </button>
    </form>
  )
}

function CommentMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const [text, setText] = useState("")
  return (
    <form
      className="flex w-64 flex-col gap-2 p-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (editor && addComment(editor, text)) {
          close()
        }
      }}
    >
      <textarea
        aria-label="Comment"
        value={text}
        placeholder="Select text, then write a comment"
        className="h-20 rounded border border-black/15 px-2 py-1 text-sm"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="h-8 rounded bg-[#0f6cbd] text-sm text-white">
        Comment
      </button>
    </form>
  )
}

function QuickMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  const [parts, setParts] = useState<QuickPart[]>(() => loadQuickParts())
  const [name, setName] = useState("")
  return (
    <div className="flex w-56 flex-col">
      {parts.map((part) => (
        <MenuButton
          key={part.id}
          onClick={() => {
            editor?.chain().focus().insertContent(part.html).run()
            close()
          }}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{part.name}</span>
            <span
              className="text-[11px] text-neutral-400"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation()
                setParts(deleteQuickPart(part.id))
              }}
            >
              Remove
            </span>
          </span>
        </MenuButton>
      ))}
      {parts.length === 0 ? <p className="px-2 py-1 text-xs text-neutral-500">No saved parts yet.</p> : null}
      <form
        className="mt-1 flex gap-1 border-t border-black/10 p-1"
        onSubmit={(event) => {
          event.preventDefault()
          if (!editor) {
            return
          }
          const html = selectionHtml(editor)
          if (!html) {
            return
          }
          setParts(saveQuickPart(name || "Part", html))
          setName("")
        }}
      >
        <input
          aria-label="Quick part name"
          value={name}
          placeholder="Save selection"
          className="h-7 min-w-0 flex-1 rounded border border-black/15 px-2 text-xs"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="rounded bg-neutral-900 px-2 text-xs text-white">
          Save
        </button>
      </form>
    </div>
  )
}

function selectionHtml(editor: Editor) {
  const { from, to, empty } = editor.state.selection
  const slice = empty ? null : editor.state.doc.slice(from, to)
  if (!slice || slice.content.size === 0) {
    const text = editor.state.selection.$from.parent.textContent.trim()
    return text ? `<p>${text}</p>` : ""
  }
  const holder = document.createElement("div")
  holder.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content))
  return holder.innerHTML
}

function insertStatic(editor: Editor, format: DateFormat, close: () => void) {
  insertAtSelectionEnd(editor)
    .command(({ tr }) => {
      tr.insertText(formatDate(format))
      return true
    })
    .run()
  close()
}

function insertAutomatic(editor: Editor, format: DateFormat, close: () => void) {
  insertAtSelectionEnd(editor).insertDateField(format).run()
  close()
}

function TableGrid({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 })
  const size = 8
  return (
    <div className="flex flex-col gap-2" onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: size * size }, (_, index) => {
          const row = Math.floor(index / size) + 1
          const col = (index % size) + 1
          const selected = row <= hover.rows && col <= hover.cols
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              aria-label={`${col} by ${row} table`}
              className={`size-4 rounded-[3px] border ${selected ? "border-blue-500 bg-blue-100" : "border-neutral-300 bg-white"}`}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onInsert(row, col)}
            />
          )
        })}
      </div>
      <p className="text-center text-xs text-neutral-500">
        {hover.rows > 0 ? `${hover.cols} × ${hover.rows} table` : "Insert table"}
      </p>
    </div>
  )
}

function IconPreview({ name }: { name: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: iconMarkup(name) }}
    />
  )
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      {children}
    </svg>
  )
}

function CoverIcon() {
  return (
    <Svg>
      <rect x="6" y="3" width="16" height="22" rx="1" fill="#fff" stroke="#5c5c5c" />
      <path d="M6 3h3v22H6z" fill="#0f6cbd" />
      <path d="M12 10h7M12 14h5" stroke="#8a8a8a" />
    </Svg>
  )
}
function PageIcon() {
  return (
    <Svg>
      <rect x="7" y="3" width="14" height="22" rx="1" fill="#fff" stroke="#5c5c5c" />
      <path d="M10 9h8M10 13h8M10 17h5" stroke="#8a8a8a" />
    </Svg>
  )
}
function BreakIcon() {
  return (
    <Svg>
      <path d="M6 8h16M6 20h16" stroke="#8a8a8a" />
      <path d="M8 14h8M16 11l4 3-4 3" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}
function ScreenshotIcon() {
  return (
    <Svg>
      <rect x="4" y="7" width="20" height="14" rx="1" fill="#deecf9" stroke="#0f6cbd" />
      <path d="M8 11h4M8 15h8" stroke="#0f6cbd" />
      <path d="M18 5h4v4" stroke="#ca5010" strokeWidth="1.4" />
      <path d="M22 5 16 11" stroke="#ca5010" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}
function VideoIcon() {
  return (
    <Svg>
      <rect x="3" y="7" width="16" height="14" rx="1" fill="#242424" />
      <path d="M11 11.5v5l5-2.5z" fill="#fff" />
      <path d="M20 10l5 2.5L20 15z" fill="#0f6cbd" />
    </Svg>
  )
}
function ObjectIcon() {
  return (
    <Svg>
      <rect x="5" y="5" width="12" height="12" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="11" y="11" width="12" height="12" fill="#fff" stroke="#5c5c5c" />
      <path d="M14 17h6M17 14v6" stroke="#0f6cbd" strokeWidth="1.3" />
    </Svg>
  )
}
function TableIcon() {
  return (
    <Svg>
      <rect x="4" y="6" width="20" height="16" rx="1" fill="#deecf9" stroke="#0f6cbd" />
      <path d="M4 12h20M4 17h20M11 6v16M18 6v16" stroke="#0f6cbd" />
    </Svg>
  )
}
function PictureIcon() {
  return (
    <Svg>
      <rect x="4" y="6" width="20" height="16" rx="1" fill="#fff4ce" stroke="#8a6116" />
      <circle cx="10" cy="11" r="2" fill="#f5b400" />
      <path d="M6 19l5-4 3 3 3-2 5 4" stroke="#107c10" strokeWidth="1.3" />
    </Svg>
  )
}
function ShapeIcon() {
  return (
    <Svg>
      <rect x="4" y="8" width="10" height="10" fill="#deecf9" stroke="#0f6cbd" />
      <circle cx="18" cy="16" r="5" fill="#fce4d6" stroke="#ca5010" />
    </Svg>
  )
}
function IconGlyph() {
  return (
    <Svg>
      <circle cx="14" cy="14" r="8" fill="#deecf9" stroke="#0f6cbd" />
      <path d="M14 9v6M11 12h6" stroke="#0f6cbd" strokeWidth="1.4" />
    </Svg>
  )
}
function CubeIcon() {
  return (
    <Svg>
      <polygon points="14,5 23,10 14,15 5,10" fill="#9cc7f0" />
      <polygon points="5,10 14,15 14,23 5,18" fill="#0f6cbd" />
      <polygon points="23,10 14,15 14,23 23,18" fill="#5aa2e0" />
    </Svg>
  )
}
function DrawingCanvasIcon() {
  return (
    <Svg>
      <rect x="4" y="6" width="20" height="14" rx="1" fill="#fff" stroke="#5b2c6f" strokeDasharray="2 1.5" />
      <path
        d="M8 16.5c2-3 3.2-1.2 4.4-3.2 1.2 2 2.2.4 3.4-1.6"
        stroke="#0f6cbd"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M16.2 7.2 20.2 11.2 14.2 17.2h-3.2v-2.8z" fill="#f5d000" stroke="#8a6a00" />
    </Svg>
  )
}
function ChartIcon() {
  return (
    <Svg>
      <path d="M6 22V8M6 22h16" stroke="#5c5c5c" />
      <rect x="8" y="14" width="3" height="8" fill="#0f6cbd" />
      <rect x="13" y="10" width="3" height="12" fill="#107c10" />
      <rect x="18" y="12" width="3" height="10" fill="#ca5010" />
    </Svg>
  )
}
function SmartArtIcon() {
  return (
    <Svg>
      <rect x="4" y="8" width="7" height="6" rx="1" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="13" y="8" width="7" height="6" rx="1" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="22" y="8" width="4" height="6" rx="1" fill="#9cc7f0" stroke="#0f6cbd" />
      <path d="M11 11h2M20 11h2" stroke="#0f6cbd" />
      <rect x="8" y="16" width="12" height="5" rx="1" fill="#fff4ce" stroke="#8a6116" />
    </Svg>
  )
}
function SheetIcon() {
  return (
    <Svg>
      <rect x="5" y="5" width="18" height="18" fill="#fff" stroke="#107c10" />
      <path d="M5 11h18M5 17h18M11 5v18M17 5v18" stroke="#107c10" />
    </Svg>
  )
}
function LinkIcon() {
  return (
    <Svg>
      <path
        d="M11 15.5 9.2 17.3a3.2 3.2 0 0 1-4.5-4.5L6.5 11"
        stroke="#0f6cbd"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M17 12.5 18.8 10.7a3.2 3.2 0 0 0-4.5-4.5L12.5 8"
        stroke="#0f6cbd"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M11 17l6-6" stroke="#0f6cbd" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}
function BookmarkIcon() {
  return (
    <Svg>
      <path d="M9 5h10v18l-5-3-5 3Z" fill="#deecf9" stroke="#0f6cbd" />
    </Svg>
  )
}
function CrossRefIcon() {
  return (
    <Svg>
      <rect x="5" y="6" width="12" height="16" fill="#fff" stroke="#5c5c5c" />
      <path d="M16 14h7M20 11l3 3-3 3" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}
function CommentIcon() {
  return (
    <Svg>
      <path
        d="M5 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H12l-4 4v-4H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        fill="#fff4ce"
        stroke="#8a6116"
      />
    </Svg>
  )
}
function HeaderIcon() {
  return (
    <Svg>
      <rect x="6" y="4" width="16" height="20" fill="#fff" stroke="#5c5c5c" />
      <path d="M8 8h12" stroke="#0f6cbd" strokeWidth="1.6" />
    </Svg>
  )
}
function FooterIcon() {
  return (
    <Svg>
      <rect x="6" y="4" width="16" height="20" fill="#fff" stroke="#5c5c5c" />
      <path d="M8 20h12" stroke="#0f6cbd" strokeWidth="1.6" />
    </Svg>
  )
}
function NumberIcon() {
  return (
    <Svg>
      <rect x="6" y="4" width="16" height="20" fill="#fff" stroke="#5c5c5c" />
      <text x="14" y="20" textAnchor="middle" fontSize="8" fill="#0f6cbd">
        #
      </text>
    </Svg>
  )
}
function TextBoxIcon() {
  return (
    <Svg>
      <rect x="4" y="8" width="20" height="12" rx="1" fill="#fff" stroke="#0f6cbd" />
      <path d="M7 14h10" stroke="#8a8a8a" />
    </Svg>
  )
}
function PartsIcon() {
  return (
    <Svg>
      <rect x="5" y="5" width="8" height="10" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="12" y="10" width="11" height="12" fill="#fff" stroke="#5c5c5c" />
    </Svg>
  )
}
function WordArtIcon() {
  return (
    <Svg>
      <text x="4" y="19" fontSize="12" fontWeight="700" fill="#0f6cbd">
        A
      </text>
    </Svg>
  )
}
function SignatureIcon() {
  return (
    <Svg>
      <path d="M5 18c3-6 5-6 7-1 1 3 2 1 4-3 1 4 3 4 7 2" stroke="#0f6cbd" strokeWidth="1.3" />
      <path d="M5 22h18" stroke="#5c5c5c" />
    </Svg>
  )
}
function DateIcon() {
  return (
    <Svg>
      <rect x="5" y="6" width="18" height="16" rx="1" fill="#fff" stroke="#ca5010" />
      <path d="M5 11h18M9 4v4M19 4v4" stroke="#ca5010" />
    </Svg>
  )
}
function EquationIcon() {
  return (
    <Svg>
      <text x="6" y="20" fontSize="16" fill="#5b2c8e">
        π
      </text>
    </Svg>
  )
}
function SymbolIcon() {
  return (
    <Svg>
      <text x="7" y="20" fontSize="16" fill="#242424">
        Ω
      </text>
    </Svg>
  )
}

const EMOJI = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😊",
  "🙂",
  "😉",
  "😍",
  "🤔",
  "😐",
  "😢",
  "😮",
  "😎",
  "🥳",
  "😴",
  "🙃",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "💪",
  "👋",
  "✌️",
  "❤️",
  "⭐",
  "🔥",
  "🎉",
  "✅",
  "❌",
  "⚠️",
  "💡",
  "📌",
  "📎",
  "📅",
  "📝",
  "📊",
  "📈",
  "🔒",
  "🔗",
  "☀️",
  "🌙",
  "🌟",
  "🍀",
  "☕",
  "🚀",
  "🏆",
  "🎯",
]

/** Word for the web's Emoji: a palette of common emoji typed at the cursor as text. */
function EmojiMenu({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="grid w-64 grid-cols-8 gap-0.5 p-1">
      {EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={emoji}
          className="flex size-7 items-center justify-center rounded text-[17px] leading-none hover:bg-[var(--app-hover)]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (editor) {
              chainWithSelection(editor).insertContent(emoji).run()
            }
            close()
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
