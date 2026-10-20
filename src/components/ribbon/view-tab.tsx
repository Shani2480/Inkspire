import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover, RibbonPopover } from "@/components/ribbon/ribbon-button"
import { ChevronDownIcon, RibbonSvg } from "@/components/ribbon/icons"
import { editChromePart } from "@/components/ribbon/insert-tab"
import {
  LineDarkModeIcon,
  LineEndnoteIcon,
  LineFootnoteIcon,
  LineHeaderFooterIcon,
  LineImmersiveIcon,
  LineNavigationIcon,
  LineReadingViewIcon,
  LineRulerIcon,
  LineSeparatePagesIcon,
  LineZoomIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { THEME_OPTIONS, isGradientTheme, themeAccentColor } from "@/document/theme"
import { clampZoom, useViewStore, type LayoutMode } from "@/document/view"
import { useDocumentStore } from "@/document/store"
import { WINDOW_ID, focusWindow, openWindow as openNewWindow, useOpenWindows } from "@/document/windows"
import { useDocumentEditor } from "@/editor/document-editor"
import { listNotes } from "@/editor/insert-blocks"
import { useEditorState } from "@tiptap/react"
import { useState, type ReactNode } from "react"
import { DialogFrame } from "@/components/word-dialog"

export function ViewTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const showRuler = useViewStore((state) => state.showRuler)
  const showGridlines = useViewStore((state) => state.showGridlines)
  const zoomMode = useViewStore((state) => state.zoomMode)
  const toggleRuler = useViewStore((state) => state.toggleRuler)
  const toggleGridlines = useViewStore((state) => state.toggleGridlines)
  const setZoomMode = useViewStore((state) => state.setZoomMode)
  const pageView = useViewStore((state) => state.pageView)
  const setPageView = useViewStore((state) => state.setPageView)
  const movement = useViewStore((state) => state.movement)
  const setMovement = useViewStore((state) => state.setMovement)
  const layoutMode = useViewStore((state) => state.layoutMode)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const zoom = useViewStore((state) => state.zoom)
  const setZoom = useViewStore((state) => state.setZoom)
  const split = useViewStore((state) => state.split)
  const setSplit = useViewStore((state) => state.setSplit)
  const sideBySide = useViewStore((state) => state.sideBySide)
  const setSideBySide = useViewStore((state) => state.setSideBySide)
  const syncScroll = useViewStore((state) => state.syncScroll)
  const setSyncScroll = useViewStore((state) => state.setSyncScroll)
  const navPane = useViewStore((state) => state.navPane)
  const setNavPane = useViewStore((state) => state.setNavPane)
  const focusMode = useViewStore((state) => state.focusMode)
  const setFocusMode = useViewStore((state) => state.setFocusMode)
  const immersive = useViewStore((state) => state.immersive)
  const setImmersive = useViewStore((state) => state.setImmersive)
  const colorMode = useViewStore((state) => state.colorMode)
  const setColorMode = useViewStore((state) => state.setColorMode)
  const resetWindow = useViewStore((state) => state.resetWindow)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [macrosOpen, setMacrosOpen] = useState(false)
  const notes = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listNotes(current.state.doc) : []),
  })

  function pickLayout(mode: LayoutMode) {
    setLayoutMode(mode)
  }

  const showOnePage = () => {
    setPageView(1)
    setZoomMode("page")
  }
  const showPageWidth = () => {
    setPageView(1)
    setZoomMode("width")
  }
  const windows = useOpenWindows()
  const openWindow = () => openNewWindow({ kind: "blank" })
  /** Word for the web's Footnotes and Endnotes go to the first note of their kind. */
  const firstNote = (kind: "footnote" | "endnote") => (notes ?? []).find((note) => note.kind === kind)
  const goToNote = (kind: "footnote" | "endnote") => {
    const note = firstNote(kind)
    if (note && editor) {
      editor.chain().focus().setTextSelection(note.pos).scrollIntoView().run()
    }
  }

  const multiplePagesMenu = (close: () => void) => (
    <div className="flex items-end gap-1" role="group" aria-label="Pages to show">
      {(
        [
          [2, 2, 1],
          [4, 4, 1],
          [8, 4, 2],
        ] as const
      ).map(([count, columns, rows]) => (
        <PageViewChoice
          key={count}
          count={count}
          columns={columns}
          rows={rows}
          selected={pageView === count}
          onPick={() => {
            setPageView(count)
            close()
          }}
        />
      ))}
    </div>
  )
  const switchWindowsMenu = (close: () => void) => (
    <div className="flex w-56 flex-col">
      {windows.map((entry, index) => (
        <MenuButton
          key={entry.id}
          selected={entry.id === WINDOW_ID}
          onClick={() => {
            void focusWindow(entry)
            close()
          }}
        >
          <span className="truncate">
            {index + 1} {entry.name}
            {entry.dirty ? "*" : ""}
          </span>
        </MenuButton>
      ))}
      {windows.length === 0 ? (
        <MenuButton selected onClick={close}>
          1 {document.title || "Document"}
        </MenuButton>
      ) : null}
    </div>
  )
  const macrosMenu = (close: () => void) => (
    <div className="flex w-44 flex-col">
      <MenuButton
        onClick={() => {
          setMacrosOpen(true)
          close()
        }}
      >
        View Macros…
      </MenuButton>
      <MenuButton
        onClick={() => {
          setMacrosOpen(true)
          close()
        }}
      >
        Record Macro…
      </MenuButton>
    </div>
  )
  const zoomMenu = (close: () => void) => (
    <div className="flex w-36 flex-col" role="group" aria-label="Zoom levels">
      {ZOOM_LEVELS.map((level) => (
        <MenuButton
          key={level}
          selected={zoomMode === "manual" && Math.round(zoom * 100) === level}
          onClick={() => {
            setZoom(level / 100)
            close()
          }}
        >
          {level}%
        </MenuButton>
      ))}
      <MenuButton
        selected={zoomMode === "width" && pageView === 1}
        onClick={() => {
          showPageWidth()
          close()
        }}
      >
        Page Width
      </MenuButton>
      <MenuButton
        selected={zoomMode === "page" && pageView === 1}
        onClick={() => {
          showOnePage()
          close()
        }}
      >
        One Page
      </MenuButton>
      <MenuButton
        onClick={() => {
          setZoomOpen(true)
          close()
        }}
      >
        Custom…
      </MenuButton>
    </div>
  )

  const dialogs = (
    <>
      {zoomOpen ? <ZoomDialog zoom={zoom} onClose={() => setZoomOpen(false)} onZoom={setZoom} /> : null}
      {propertiesOpen ? <PropertiesDialog onClose={() => setPropertiesOpen(false)} /> : null}
      {macrosOpen ? <MacrosDialog onClose={() => setMacrosOpen(false)} /> : null}
    </>
  )

  if (ribbonLayout === "single") {
    const views: LineCommand[] = [
      {
        id: "separate-pages",
        label: "Separate Pages",
        icon: <LineSeparatePagesIcon />,
        description: "Show the document as separate pages, as it will print.",
        priority: 2,
        active: layoutMode === "print",
        onClick: () => pickLayout(layoutMode === "print" ? "web" : "print"),
      },
      {
        id: "reading-view",
        label: "Reading View",
        icon: <LineReadingViewIcon />,
        description: "Read the document without the editing tools.",
        priority: 2,
        active: layoutMode === "read",
        onClick: () => pickLayout(layoutMode === "read" ? "print" : "read"),
      },
      {
        id: "immersive-reader",
        label: "Immersive Reader",
        icon: <LineImmersiveIcon />,
        description: "Read with wider spacing and fewer distractions.",
        active: immersive,
        onClick: () => setImmersive(!immersive),
      },
    ].map((command) => ({ ...command, showLabel: true }))
    const zooms: LineCommand[] = [
      {
        id: "zoom",
        label: "Zoom",
        icon: <LineZoomIcon />,
        showLabel: true,
        priority: 2,
        field: (
          <RibbonPopover label="Zoom level" className="ribbon-combo line-combo w-[72px]" content={zoomMenu}>
            <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
            <ChevronDownIcon />
          </RibbonPopover>
        ),
      },
      {
        id: "zoom-100",
        label: "100%",
        // As in Word for the web, the name is the button: a 100 drawn at 20 px is too small to read.
        description: "Zoom the document to 100%.",
        active: zoom === 1 && zoomMode === "manual",
        onClick: () => setZoom(1),
      },
    ]
    const show: LineCommand[] = [
      { id: "ruler", label: "Ruler", icon: <LineRulerIcon />, priority: 1, active: showRuler, onClick: toggleRuler },
      {
        id: "navigation",
        label: "Navigation",
        icon: <LineNavigationIcon />,
        description: "Show the headings of the document in a pane.",
        active: navPane,
        onClick: () => setNavPane(!navPane),
      },
      {
        id: "header-footer",
        label: "Header & Footer",
        icon: <LineHeaderFooterIcon />,
        description: "Edit the header and footer of the document.",
        disabled: !editor,
        onClick: () => editChromePart("header"),
      },
      {
        id: "footnotes",
        label: "Footnotes",
        icon: <LineFootnoteIcon />,
        description: "Go to the first footnote.",
        disabled: !firstNote("footnote"),
        onClick: () => goToNote("footnote"),
      },
      {
        id: "endnotes",
        label: "Endnotes",
        icon: <LineEndnoteIcon />,
        description: "Go to the first endnote.",
        disabled: !firstNote("endnote"),
        onClick: () => goToNote("endnote"),
      },
    ].map((command) => ({ ...command, showLabel: true }))
    const appearance: LineCommand[] = [
      {
        id: "dark-mode",
        label: "Dark Mode",
        icon: <LineDarkModeIcon />,
        showLabel: true,
        priority: 1,
        active: colorMode === "dark",
        onClick: () => setColorMode(colorMode === "dark" ? "light" : "dark"),
      },
    ]

    // The rest of the classic tab, grouped as there.
    const more: LineGroup[] = [
      {
        id: "layouts",
        commands: [
          { id: "print-layout", label: "Print Layout", icon: <PrintLayoutIcon />, mode: "print" as const },
          { id: "web-layout", label: "Web Layout", icon: <WebLayoutIcon />, mode: "web" as const },
          { id: "outline", label: "Outline", icon: <OutlineIcon />, mode: "outline" as const },
          { id: "draft", label: "Draft", icon: <DraftIcon />, mode: "draft" as const },
        ].map(({ mode, ...command }) => ({
          ...command,
          active: layoutMode === mode,
          onClick: () => pickLayout(mode),
        })),
      },
      {
        id: "immersive",
        commands: [
          {
            id: "focus",
            label: "Focus",
            icon: <FocusIcon />,
            active: focusMode,
            onClick: () => setFocusMode(!focusMode),
          },
        ],
      },
      {
        id: "page-movement",
        commands: [
          {
            id: "vertical",
            label: "Vertical",
            icon: <VerticalIcon />,
            active: movement === "vertical",
            disabled: layoutMode !== "print",
            onClick: () => setMovement("vertical"),
          },
          {
            id: "side-to-side",
            label: "Side to Side",
            icon: <SideBySideIcon />,
            active: movement === "side",
            disabled: layoutMode !== "print",
            onClick: () => setMovement(movement === "side" ? "vertical" : "side"),
          },
        ],
      },
      {
        id: "show",
        commands: [
          {
            id: "gridlines",
            label: "Gridlines",
            icon: <GridlinesIcon />,
            active: showGridlines,
            onClick: toggleGridlines,
          },
        ],
      },
      {
        id: "zoom",
        commands: [
          { id: "zoom-dialog", label: "Zoom…", icon: <ZoomIcon />, onClick: () => setZoomOpen(true) },
          {
            id: "one-page",
            label: "One Page",
            icon: <OnePageIcon />,
            active: zoomMode === "page" && pageView === 1,
            onClick: showOnePage,
          },
          {
            id: "multiple-pages",
            label: "Multiple Pages",
            icon: <PageLayoutIcon columns={pageView === 8 || pageView === 4 ? 4 : 2} rows={pageView === 8 ? 2 : 1} />,
            active: pageView > 1,
            menu: multiplePagesMenu,
          },
          {
            id: "page-width",
            label: "Page Width",
            icon: <PageWidthIcon />,
            active: zoomMode === "width" && pageView === 1,
            onClick: showPageWidth,
          },
        ],
      },
      {
        id: "theme",
        commands: [
          {
            id: "office-theme",
            label: "Office Theme",
            icon: <ThemeIcon />,
            menu: () => <OfficeThemePicker />,
          },
        ],
      },
      {
        id: "window",
        commands: [
          { id: "new-window", label: "New Window", icon: <NewWindowIcon />, onClick: openWindow },
          {
            id: "arrange-all",
            label: "Arrange All",
            icon: <ArrangeIcon />,
            active: sideBySide,
            onClick: () => setSideBySide(!sideBySide),
          },
          { id: "split", label: "Split", icon: <SplitIcon />, active: split, onClick: () => setSplit(!split) },
          {
            id: "side-by-side",
            label: "View Side by Side",
            icon: <SideBySideIcon />,
            active: sideBySide,
            onClick: () => setSideBySide(!sideBySide),
          },
          {
            id: "sync-scroll",
            label: "Synchronous Scrolling",
            icon: <SyncIcon />,
            active: syncScroll,
            disabled: !split,
            onClick: () => setSyncScroll(!syncScroll),
          },
          { id: "reset-window", label: "Reset Window Position", icon: <ResetIcon />, onClick: resetWindow },
          { id: "switch-windows", label: "Switch Windows", icon: <SwitchIcon />, menu: switchWindowsMenu },
        ],
      },
      {
        id: "macros",
        commands: [
          { id: "macros", label: "Macros", icon: <MacrosIcon />, menu: macrosMenu },
          { id: "properties", label: "Properties", icon: <PropertiesIcon />, onClick: () => setPropertiesOpen(true) },
        ],
      },
    ]

    return (
      <>
        <SingleLineBar
          label="View"
          groups={[
            { id: "views", commands: views },
            { id: "zoom", commands: zooms },
            { id: "show", commands: show },
            { id: "dark-mode", commands: appearance },
          ]}
          more={more}
        />
        {dialogs}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="View" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Views" className="shrink-0">
        <RibbonCommand
          label="Read Mode"
          active={layoutMode === "read"}
          onClick={() => pickLayout(layoutMode === "read" ? "print" : "read")}
        >
          <ReadModeIcon />
        </RibbonCommand>
        <RibbonCommand label="Print Layout" active={layoutMode === "print"} onClick={() => pickLayout("print")}>
          <PrintLayoutIcon />
        </RibbonCommand>
        <RibbonCommand label="Web Layout" active={layoutMode === "web"} onClick={() => pickLayout("web")}>
          <WebLayoutIcon />
        </RibbonCommand>
        <RibbonCommand label="Outline" active={layoutMode === "outline"} onClick={() => pickLayout("outline")}>
          <OutlineIcon />
        </RibbonCommand>
        <RibbonCommand label="Draft" active={layoutMode === "draft"} onClick={() => pickLayout("draft")}>
          <DraftIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Immersive" className="shrink-0">
        <RibbonCommand label="Focus" active={focusMode} onClick={() => setFocusMode(!focusMode)}>
          <FocusIcon />
        </RibbonCommand>
        <RibbonCommand label="Immersive Reader" active={immersive} onClick={() => setImmersive(!immersive)}>
          <ImmersiveIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Page Movement" className="shrink-0">
        <RibbonCommand
          label="Vertical"
          active={movement === "vertical"}
          disabled={layoutMode !== "print"}
          onClick={() => setMovement("vertical")}
        >
          <VerticalIcon />
        </RibbonCommand>
        <RibbonCommand
          label="Side to Side"
          active={movement === "side"}
          disabled={layoutMode !== "print"}
          onClick={() => setMovement(movement === "side" ? "vertical" : "side")}
        >
          <SideBySideIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Show" className="shrink-0">
        <div className="ribbon-checks">
          <RibbonHover label="Ruler">
            <label className="ribbon-check">
              <input type="checkbox" checked={showRuler} onChange={toggleRuler} />
              Ruler
            </label>
          </RibbonHover>
          <RibbonHover label="Gridlines">
            <label className="ribbon-check">
              <input type="checkbox" checked={showGridlines} onChange={toggleGridlines} />
              Gridlines
            </label>
          </RibbonHover>
          <RibbonHover label="Navigation Pane">
            <label className="ribbon-check">
              <input type="checkbox" checked={navPane} onChange={() => setNavPane(!navPane)} />
              Navigation Pane
            </label>
          </RibbonHover>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Zoom" className="shrink-0">
        <RibbonCommand label="Zoom" onClick={() => setZoomOpen(true)}>
          <ZoomIcon />
        </RibbonCommand>
        <RibbonCommand label="100%" active={zoom === 1 && zoomMode === "manual"} onClick={() => setZoom(1)}>
          <PercentIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack is-tight">
          <RibbonCommand
            size="small"
            label="One Page"
            active={zoomMode === "page" && pageView === 1}
            onClick={showOnePage}
          >
            <OnePageIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Multiple Pages" active={pageView > 1} menu={multiplePagesMenu}>
            <PageLayoutIcon columns={pageView === 8 || pageView === 4 ? 4 : 2} rows={pageView === 8 ? 2 : 1} />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Page Width"
            active={zoomMode === "width" && pageView === 1}
            onClick={showPageWidth}
          >
            <PageWidthIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Office Theme" className="shrink-0">
        <OfficeThemePicker />
      </RibbonGroup>

      <RibbonGroup label="Window" className="shrink-0">
        <RibbonCommand label="New Window" onClick={openWindow}>
          <NewWindowIcon />
        </RibbonCommand>
        <RibbonCommand label="Arrange All" active={sideBySide} onClick={() => setSideBySide(!sideBySide)}>
          <ArrangeIcon />
        </RibbonCommand>
        <RibbonCommand label="Split" active={split} onClick={() => setSplit(!split)}>
          <SplitIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="View Side by Side"
            active={sideBySide}
            onClick={() => setSideBySide(!sideBySide)}
          >
            <SideBySideIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Synchronous Scrolling"
            active={syncScroll}
            disabled={!split}
            onClick={() => setSyncScroll(!syncScroll)}
          >
            <SyncIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Reset Window Position" onClick={resetWindow}>
            <ResetIcon />
          </RibbonCommand>
        </div>
        <RibbonCommand label="Switch Windows" menu={switchWindowsMenu}>
          <SwitchIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Macros" className="shrink-0">
        <RibbonCommand label="Macros" menu={macrosMenu}>
          <MacrosIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="SharePoint" className="shrink-0">
        <RibbonCommand label="Properties" onClick={() => setPropertiesOpen(true)}>
          <PropertiesIcon />
        </RibbonCommand>
      </RibbonGroup>

      {dialogs}
    </div>
  )
}

/** The levels of Word for the web's Zoom box. */
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200]

function OfficeThemePicker() {
  const themeBackground = useViewStore((state) => state.themeBackground)
  const setThemeBackground = useViewStore((state) => state.setThemeBackground)
  const colorMode = useViewStore((state) => state.colorMode)
  const setColorMode = useViewStore((state) => state.setColorMode)

  return (
    <div className="flex flex-col gap-1.5 px-1 pt-1">
      <div className="flex items-center gap-1" role="group" aria-label="Appearance">
        <button
          type="button"
          aria-pressed={colorMode === "light"}
          className="h-6 rounded border border-[var(--app-ribbon-border)] px-2 text-[11px] text-[var(--app-ribbon-text)] aria-pressed:border-[var(--app-theme-primary)] aria-pressed:bg-[var(--app-theme-light)]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setColorMode("light")}
        >
          Light
        </button>
        <button
          type="button"
          aria-pressed={colorMode === "dark"}
          className="h-6 rounded border border-[var(--app-ribbon-border)] px-2 text-[11px] text-[var(--app-ribbon-text)] aria-pressed:border-[var(--app-theme-primary)] aria-pressed:bg-[var(--app-theme-light)]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setColorMode("dark")}
        >
          Dark
        </button>
      </div>
      <div className="flex max-w-[220px] flex-wrap gap-1" role="group" aria-label="Office theme">
        {THEME_OPTIONS.map((theme) => {
          const selected = themeBackground === theme.value
          const swatch = isGradientTheme(theme.value) ? theme.value : themeAccentColor(theme.value)
          return (
            <RibbonHover key={theme.name} label={theme.name}>
              <button
                type="button"
                aria-label={theme.name}
                aria-pressed={selected}
                className="size-6 rounded-sm border border-black/15 aria-pressed:ring-2 aria-pressed:ring-[var(--app-theme-primary)] aria-pressed:ring-offset-1"
                style={{ background: swatch }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setThemeBackground(theme.value)}
              />
            </RibbonHover>
          )
        })}
      </div>
    </div>
  )
}

function ZoomDialog({ zoom, onClose, onZoom }: { zoom: number; onClose: () => void; onZoom: (zoom: number) => void }) {
  const [value, setValue] = useState(String(Math.round(zoom * 100)))
  return (
    <DialogFrame
      title="Zoom"
      width={256}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onZoom(clampZoom(Number(value) / 100))
        onClose()
      }}
    >
      <label className="mt-3 flex items-center gap-2 text-sm">
        Percent
        <input
          aria-label="Zoom percent"
          type="number"
          min={50}
          max={200}
          value={value}
          className="h-8 w-20 rounded border border-black/15 px-2"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="h-8 rounded bg-[var(--app-theme-primary)] px-3 text-sm text-white hover:bg-[var(--app-theme-hover)]"
        >
          OK
        </button>
      </div>
    </DialogFrame>
  )
}

function PropertiesDialog({ onClose }: { onClose: () => void }) {
  const editor = useDocumentEditor()
  const path = useDocumentStore((state) => state.currentFilePath)
  const text = editor?.state.doc.textContent ?? ""
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const pages = editor?.storage.pagination?.pageCount ?? 1
  return (
    <DialogFrame title="Properties" width={320} onClose={onClose}>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>Name</dt>
        <dd className="truncate">{path?.split("/").pop() ?? "Untitled"}</dd>
        <dt>Pages</dt>
        <dd>{pages}</dd>
        <dt>Words</dt>
        <dd>{words}</dd>
        <dt>Characters</dt>
        <dd>{text.length}</dd>
      </dl>
      <button
        type="button"
        className="mt-3 h-8 rounded bg-[var(--app-theme-primary)] px-3 text-sm text-white hover:bg-[var(--app-theme-hover)]"
        onClick={onClose}
      >
        Close
      </button>
    </DialogFrame>
  )
}

function MacrosDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Macros" width={320} onClose={onClose}>
      <p className="mt-3 text-sm text-neutral-600">
        No macros are available in this build. Recording and running macros will land in a later release.
      </p>
      <button
        type="button"
        className="mt-3 h-8 rounded bg-[var(--app-theme-primary)] px-3 text-sm text-white"
        onClick={onClose}
      >
        Close
      </button>
    </DialogFrame>
  )
}

function ReadModeIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2" y="3" width="12" height="10" rx="0.6" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.8" />
      <path d="M4 6h8M4 8.4h8M4 10.8h5" stroke="var(--icon-accent-color)" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function PrintLayoutIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="3.4"
        y="1.4"
        width="9.2"
        height="13.2"
        rx="0.6"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path d="M5.2 4.4h5.6M5.2 6.6h5.6M5.2 8.8h5.6M5.2 11h4" stroke="var(--icon-accent-color)" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function WebLayoutIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="1.4"
        y="2.4"
        width="13.2"
        height="11"
        rx="0.6"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path d="M1.4 5h13.2M4 2.4v11" stroke="var(--icon-accent-color)" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function OutlineIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M3 4h10M5 7.5h8M7 11h6" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function DraftIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M3 3h10M3 6.5h10M3 10h7" stroke="var(--icon-base-color)" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 12 14 14" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function FocusIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="4" y="2" width="8" height="12" rx="0.5" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.8" />
      <path d="M1 4v8M15 4v8" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function ImmersiveIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="2" y="12" fontSize="9" fontWeight="700" fill="var(--icon-accent-color)" fontFamily="Georgia, serif">
        A
      </text>
      <path
        d="M10 5c1.4 1.2 1.4 4 0 5.2M12 3.4c2.2 1.8 2.2 6.8 0 8.6"
        fill="none"
        stroke="#107c10"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function VerticalIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="4.5"
        y="1.4"
        width="7"
        height="5"
        rx="0.4"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.7"
      />
      <rect
        x="4.5"
        y="7.4"
        width="7"
        height="5"
        rx="0.4"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.7"
      />
    </RibbonSvg>
  )
}

function SideBySideIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="1.2"
        y="3"
        width="6.2"
        height="10"
        rx="0.5"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <rect
        x="8.6"
        y="3"
        width="6.2"
        height="10"
        rx="0.5"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.8"
      />
    </RibbonSvg>
  )
}

function ZoomIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="7" cy="7" r="4.2" fill="#fff" stroke="var(--icon-accent-color)" strokeWidth="1.1" />
      <path d="M10.2 10.2 14 14" stroke="var(--icon-base-color)" strokeWidth="1.4" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function PercentIcon() {
  return (
    <RibbonSvg size={20}>
      <text
        x="0.4"
        y="11"
        fontSize="5.2"
        fontWeight="700"
        fill="var(--icon-accent-color)"
        fontFamily="Segoe UI, sans-serif"
      >
        100%
      </text>
    </RibbonSvg>
  )
}

function OnePageIcon() {
  return (
    <RibbonSvg>
      <rect
        x="4"
        y="1.6"
        width="8"
        height="12.4"
        rx="0.5"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
    </RibbonSvg>
  )
}

function PageViewChoice({
  count,
  columns,
  rows,
  selected,
  onPick,
}: {
  count: 2 | 4 | 8
  columns: number
  rows: number
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={count === 8 ? "8 pages, two rows of four" : count === 4 ? "4 pages in one row" : "2 pages"}
      aria-pressed={selected}
      className={`flex w-16 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] text-neutral-700 ${selected ? "bg-[var(--app-theme-light)] ring-1 ring-[var(--app-theme-primary)]" : "hover:bg-neutral-100"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
    >
      <PageLayoutIcon columns={columns} rows={rows} />
      <span>{count} pages</span>
    </button>
  )
}

function PageLayoutIcon({ columns, rows }: { columns: number; rows: number }) {
  const gap = 0.7
  const width = (15.2 - gap * (columns - 1)) / columns
  const height = (14.4 - gap * (rows - 1)) / rows
  const tiles: ReactNode[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push(
        <rect
          key={`${column}-${row}`}
          x={0.4 + column * (width + gap)}
          y={0.8 + row * (height + gap)}
          width={width}
          height={height}
          rx={0.25}
          fill={column === columns - 1 && row === rows - 1 ? "#deecf9" : "#fff"}
          stroke="var(--icon-base-color)"
          strokeWidth={0.6}
        />,
      )
    }
  }
  return <RibbonSvg>{tiles}</RibbonSvg>
}

function PageWidthIcon() {
  return (
    <RibbonSvg>
      <rect
        x="3.4"
        y="2.2"
        width="9.2"
        height="11.2"
        rx="0.5"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path
        d="M1.2 8h2.2M12.6 8h2.2M2.2 6.6 1 8l1.2 1.4M13.8 6.6 15 8l-1.2 1.4"
        fill="none"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function NewWindowIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="2"
        y="3"
        width="10"
        height="8.4"
        rx="0.6"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path d="M2 5.2h10" stroke="var(--icon-accent-color)" strokeWidth="0.8" />
      <path d="M10.2 10.2h3.4M11.9 8.6v3.2" stroke="#107c10" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function ArrangeIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="1.2"
        y="2"
        width="7"
        height="5.4"
        rx="0.4"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.7"
      />
      <rect
        x="7.8"
        y="8.2"
        width="7"
        height="5.4"
        rx="0.4"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.7"
      />
      <path d="M1.2 3.6h7M7.8 9.8h7" stroke="var(--icon-accent-color)" strokeWidth="0.6" />
    </RibbonSvg>
  )
}

function SplitIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="3"
        y="1.6"
        width="10"
        height="12.6"
        rx="0.6"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path d="M3 8h10" stroke="var(--icon-accent-color)" strokeWidth="1" />
    </RibbonSvg>
  )
}

function SyncIcon() {
  return (
    <RibbonSvg>
      <rect
        x="1.2"
        y="2.4"
        width="5.4"
        height="8"
        rx="0.4"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.7"
      />
      <rect
        x="9.4"
        y="2.4"
        width="5.4"
        height="8"
        rx="0.4"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.7"
      />
      <path d="M6.8 5.2h2.4M6.8 8.4h2.4" stroke="var(--icon-accent-color)" strokeWidth="0.9" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function ResetIcon() {
  return (
    <RibbonSvg>
      <path d="M4 8a4 4 0 1 0 1.2-2.9" fill="none" stroke="var(--icon-accent-color)" strokeWidth="1.2" />
      <path d="M4 3.2v3h3" fill="none" stroke="var(--icon-accent-color)" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function SwitchIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="1.4" y="2" width="7" height="6" rx="0.4" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.7" />
      <rect
        x="7.6"
        y="8"
        width="7"
        height="6"
        rx="0.4"
        fill="#deecf9"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.7"
      />
    </RibbonSvg>
  )
}

function MacrosIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2" y="3" width="12" height="10" rx="0.6" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.8" />
      <path
        d="M4 7h2l1.4 3L10 5.5 12 10"
        fill="none"
        stroke="var(--icon-accent-color)"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function PropertiesIcon() {
  return (
    <RibbonSvg size={20}>
      <rect
        x="3.2"
        y="1.4"
        width="9.6"
        height="13.2"
        rx="0.6"
        fill="#fff"
        stroke="var(--icon-base-color)"
        strokeWidth="0.8"
      />
      <path
        d="M5.2 4.6h5.6M5.2 7h5.6M5.2 9.4h5.6M5.2 11.8h3.4"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function GridlinesIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2" y="2" width="12" height="12" rx="0.6" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.8" />
      <path
        d="M2 6h12M2 10h12M6 2v12M10 2v12"
        stroke="var(--icon-accent-color)"
        strokeWidth="0.6"
        strokeDasharray="1 1"
      />
    </RibbonSvg>
  )
}

function ThemeIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="8" cy="8" r="6" fill="#fff" stroke="var(--icon-base-color)" strokeWidth="0.8" />
      <circle cx="5.6" cy="6.4" r="1.2" fill="var(--icon-accent-color)" />
      <circle cx="9.4" cy="5.2" r="1.2" fill="#107c10" />
      <circle cx="10.6" cy="9" r="1.2" fill="#c42b1c" />
    </RibbonSvg>
  )
}
