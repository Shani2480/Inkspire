import { HIDEABLE_TABS, useCustomize } from "@/document/customize"
import { ChartDesignTab, ChartFormatTab } from "@/components/ribbon/chart-tabs"
import { ShapeFormatTab } from "@/components/ribbon/shape-format-tab"
import { CommandMenuHost } from "@/components/command-menu"
import { FileMenu, openRibbonCommandMenu } from "@/components/quick-access"
import { registerRibbonTabSetter } from "@/components/ribbon/ribbon-commands"
import { AiTab } from "@/components/ribbon/ai-tab"
import { shownTabPanel, useTabMotion } from "@/components/ribbon/tab-motion"
import { HomeTab } from "@/components/ribbon/home-tab"
import { InsertTab } from "@/components/ribbon/insert-tab"
import { DesignTab } from "@/components/ribbon/design-tab"
import { LayoutTab } from "@/components/ribbon/layout-tab"
import { ReviewTab } from "@/components/ribbon/review-tab"
import { HelpTab } from "@/components/ribbon/help-tab"
import { ViewTab } from "@/components/ribbon/view-tab"
import { ReferencesTab } from "@/components/ribbon/references-tab"
import { SmartArtDesignTab } from "@/components/ribbon/smartart-tab"
import { EquationTab } from "@/components/ribbon/equation-tab"
import {
  HeaderFooterTab,
  ModelTab,
  PictureFormatTab,
  TableDesignTab,
  TableLayoutTab,
} from "@/components/ribbon/context-tabs"
import { DesignDialogs } from "@/components/design-dialogs"
import { DrawTab } from "@/components/ribbon/draw-tab"
import { RibbonButton } from "@/components/ribbon/ribbon-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useViewStore, type RibbonLayout } from "@/document/view"
import { isMacPlatform } from "@/lib/platform"
import { useDocumentEditor } from "@/editor/document-editor"
import { rememberSelection } from "@/editor/selection-memory"
import { NodeSelection } from "@tiptap/pm/state"
import { useEditorState } from "@tiptap/react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Moon, Sun } from "lucide-react"
import { Activity, memo, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type RefObject } from "react"
import { prefersReducedMotion } from "@/document/motion"

type RibbonContext =
  "none" | "smartart" | "table" | "picture" | "shape" | "chart" | "model" | "equation" | "draw" | "headerFooter"

/**
 * The tabs that are always there, against the component that draws each. They take no props, so memo keeps the
 * hidden ones from drawing again every time the ribbon does.
 */
const MAIN_TABS: [string, ComponentType][] = (
  [
    ["home", HomeTab],
    ["insert", InsertTab],
    ["design", DesignTab],
    ["layout", LayoutTab],
    ["references", ReferencesTab],
    ["review", ReviewTab],
    ["view", ViewTab],
    ["help", HelpTab],
    ["ai", AiTab],
  ] as [string, ComponentType][]
).map(([id, Content]) => [id, memo(Content)])

const ribbonTabClassName =
  "h-8 flex-none rounded-none border-0 px-3 text-[13px] font-medium text-[var(--app-tab-text)] shadow-none hover:bg-[var(--app-hover)] hover:text-[var(--app-tab-text)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--app-tab-active)] data-active:shadow-none data-active:hover:bg-transparent data-active:hover:text-[var(--app-tab-active)] group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:shadow-none"

const contextTabClassName = `${ribbonTabClassName} ribbon-context-tab`

function ribbonContext(
  editor: { isActive: (name: string) => boolean; state: { selection: unknown } } | null,
): RibbonContext {
  if (!editor) {
    return "none"
  }
  if (editor.isActive("table")) {
    return "table"
  }
  const selection = editor.state.selection
  if (selection instanceof NodeSelection) {
    const name = selection.node.type.name
    if (name === "drawingCanvas") {
      return "draw"
    }
    if (name === "image") {
      return "picture"
    }
    if (name === "smartArt") {
      return "smartart"
    }
    if (name === "threeDModel") {
      return "model"
    }
    if (name === "equation") {
      return "equation"
    }
    if (
      name === "textBox" ||
      name === "wordArt" ||
      (name === "figure" &&
        String(selection.node.attrs.kind) !== "chart" &&
        String(selection.node.attrs.kind) !== "model")
    ) {
      return "shape"
    }
    if (name === "figure") {
      const kind = String(selection.node.attrs.kind)
      if (kind === "chart") {
        return "chart"
      }
      if (kind === "model") {
        return "model"
      }
      return "shape"
    }
  }
  if (editor.isActive("textBox") || editor.isActive("wordArt")) {
    return "shape"
  }
  if (editor.isActive("image")) {
    return "picture"
  }
  return "none"
}

/** The tabs a selection brings, after the fixed ones; their labels are in the theme's colour (--app-context-tab). */
const CONTEXT_TAB: Record<Exclude<RibbonContext, "none">, { id: string; label: string }> = {
  table: { id: "ctx-table-design", label: "Table Design" },
  smartart: { id: "ctx-smartart", label: "SmartArt Design" },
  picture: { id: "ctx-picture", label: "Picture Format" },
  shape: { id: "ctx-shape", label: "Shape Format" },
  chart: { id: "ctx-chart", label: "Chart Design" },
  model: { id: "ctx-model", label: "3D Model" },
  equation: { id: "ctx-equation", label: "Equation" },
  draw: { id: "ctx-draw", label: "Draw" },
  headerFooter: { id: "ctx-header-footer", label: "Header & Footer" },
}

/** A tab's name, as its trigger shows it; the Quick Access Toolbar names a ribbon command's tab with it. */
function tabLabel(id: string) {
  const fixed = id === "home" ? "Home" : HIDEABLE_TABS.find((tab) => tab.id === id)?.label
  const tool = Object.values(CONTEXT_TAB).find((tab) => tab.id === id)?.label
  const extra: Record<string, string> = { "ctx-table-layout": "Table Layout", "ctx-chart-format": "Chart Format" }
  return fixed ?? tool ?? extra[id] ?? id
}

function ColorModeToggle() {
  const colorMode = useViewStore((state) => state.colorMode)
  const toggleColorMode = useViewStore((state) => state.toggleColorMode)
  const dark = colorMode === "dark"

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="inline-flex size-7 items-center justify-center rounded-md text-[var(--app-tab-text)] hover:bg-[var(--app-hover)]"
      style={{ marginRight: 8 }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={toggleColorMode}
    >
      {dark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
    </button>
  )
}

/**
 * The arrow at the ribbon's bottom right switches between the full (classic) ribbon and the single line: pointing up
 * it collapses the ribbon to one line, pointing down it shows the whole ribbon again. Ctrl+F1 does the same.
 */
function RibbonLayoutToggle() {
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const toggleRibbonLayout = useViewStore((state) => state.toggleRibbonLayout)
  const single = ribbonLayout === "single"

  return (
    <RibbonButton
      label={single ? "Expand the ribbon" : "Collapse the ribbon"}
      description={single ? "Show the full ribbon with every group." : "Show the ribbon's commands on a single line."}
      shortcut={isMacPlatform ? "⌘F1" : "Ctrl+F1"}
      className="ribbon-layout-toggle"
      onClick={toggleRibbonLayout}
    >
      {single ? <ChevronDown strokeWidth={1.75} /> : <ChevronUp strokeWidth={1.75} />}
    </RibbonButton>
  )
}

/**
 * When the window is too narrow for a tab's commands, arrows at the ribbon's edges scroll to the rest, as Word's
 * ribbon does.
 */
/** The toolbar of the tab in front; the tabs behind it stay built, hidden. */
const shownToolbar = (card: HTMLElement | null) =>
  shownTabPanel(card)?.querySelector<HTMLElement>('[role="toolbar"]') ?? null

function RibbonScrollButtons({
  card,
  tab,
  layout,
}: {
  card: RefObject<HTMLDivElement | null>
  tab: string
  layout: RibbonLayout
}) {
  const [edges, setEdges] = useState({ left: false, right: false })
  const toolbar = () => shownToolbar(card.current)

  useLayoutEffect(() => {
    const bar = shownToolbar(card.current)
    if (!bar) {
      setEdges({ left: false, right: false })
      return
    }
    const update = () => {
      const max = bar.scrollWidth - bar.clientWidth
      const left = bar.scrollLeft > 1
      const right = bar.scrollLeft < max - 1
      setEdges((current) => (current.left === left && current.right === right ? current : { left, right }))
    }
    update()
    // The tab's groups change width as they collapse or their content changes, as well as when the window does.
    const resize = new ResizeObserver(update)
    resize.observe(bar)
    const watchGroups = () => [...bar.children].forEach((child) => resize.observe(child))
    watchGroups()
    const groups = new MutationObserver(() => {
      watchGroups()
      update()
    })
    groups.observe(bar, { childList: true })
    bar.addEventListener("scroll", update, { passive: true })
    return () => {
      resize.disconnect()
      groups.disconnect()
      bar.removeEventListener("scroll", update)
    }
  }, [card, tab, layout])

  const scroll = (direction: 1 | -1) => {
    const bar = toolbar()
    bar?.scrollBy({ left: direction * Math.max(120, bar.clientWidth * 0.75), behavior: "smooth" })
  }

  return (
    <>
      {edges.left ? (
        <button
          type="button"
          className="ribbon-scroll is-left"
          aria-label="Scroll the ribbon left"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
      ) : null}
      {edges.right ? (
        <button
          type="button"
          className="ribbon-scroll is-right"
          aria-label="Scroll the ribbon right"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => scroll(1)}
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </>
  )
}

/**
 * Collapsing to the single line ribbon or expanding back eases the card's height from one layout to the other. The
 * card clips its content, so the full ribbon unrolls downwards and the single line rolls it up. Height is laid
 * out, not composited, so nothing is repainted when it ends.
 */
function useLayoutAnimation(card: RefObject<HTMLDivElement | null>, layout: string) {
  const height = useRef(0)
  const shown = useRef(layout)

  useLayoutEffect(() => {
    const element = card.current
    if (!element) {
      return
    }
    const from = height.current
    const to = element.getBoundingClientRect().height
    const changed = shown.current !== layout
    shown.current = layout
    height.current = to
    if (
      !changed ||
      !from ||
      Math.abs(from - to) < 2 ||
      prefersReducedMotion() ||
      typeof element.animate !== "function"
    ) {
      return
    }
    // A gentler curve than the menus' decelerate, which spends nearly all its motion in the first frames.
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 220,
      easing: "cubic-bezier(0.33, 0, 0.1, 1)",
    })
    return () => animation.cancel()
  }, [card, layout])

  useEffect(() => {
    const element = card.current
    if (!element) {
      return
    }
    // Remember the settled height, so the next layout change starts from what is on screen.
    const observer = new ResizeObserver(() => {
      if (!element.getAnimations().length) {
        height.current = element.getBoundingClientRect().height
      }
    })
    observer.observe(element)
    height.current = element.getBoundingClientRect().height
    return () => observer.disconnect()
  }, [card])
}

export function Ribbon() {
  const editor = useDocumentEditor()
  const editingChrome = useViewStore((state) => state.editingChrome)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const bodyContext =
    useEditorState({
      editor,
      selector: ({ editor: current }) => ribbonContext(current),
    }) ?? "none"
  // While the header and footer are being edited, their tab is the one that shows, as in Word; a picture or shape
  // selected in them opens its own formatting tab beside it, and the Header & Footer tab is back in front when it
  // is let go.
  const objectInChrome = editingChrome && (bodyContext === "picture" || bodyContext === "shape")
  const context: RibbonContext = editingChrome && !objectInChrome ? "headerFooter" : bodyContext
  const [tab, setTab] = useState("home")
  // A main tab stays built once it has been shown, hidden while another is in front: building a whole tab again
  // on every switch took a visible moment in the desktop webview.
  const [visited, setVisited] = useState(["home"])
  if (!visited.includes(tab)) {
    setVisited([...visited, tab])
  }
  useEffect(() => {
    // The rest are built out of sight once the app is idle, so even the first visit to a tab is quick.
    const all = () => setVisited((current) => [...new Set([...current, ...MAIN_TABS.map(([id]) => id)])])
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(all, 1500)
      return () => window.clearTimeout(timer)
    }
    const idle = window.requestIdleCallback(all, { timeout: 3000 })
    return () => window.cancelIdleCallback(idle)
  }, [])
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutAnimation(cardRef, ribbonLayout)
  const tabMotion = useTabMotion(cardRef)
  const startTabMotion = tabMotion.start
  const hiddenTabs = useCustomize((state) => state.hiddenTabs)

  useEffect(() => {
    // The Quick Access Toolbar brings a ribbon command's tab to the front before opening its menu.
    registerRibbonTabSetter((id) => {
      startTabMotion()
      setTab(id)
    })
    return () => registerRibbonTabSetter(null)
  }, [startTabMotion])

  useEffect(() => {
    // A tab the user hid in Customize Ribbon cannot stay the open one.
    setTab((current) => (hiddenTabs.includes(current) ? "home" : current))
  }, [hiddenTabs])

  useEffect(() => {
    setTab((current) => {
      // Ink: selecting a drawing canvas opens the Draw tools tab; so does editing the header and footer its tab.
      if (context === "draw" || context === "headerFooter") {
        return CONTEXT_TAB[context].id
      }
      if (!current.startsWith("ctx-")) {
        return current
      }
      if (context === "table" && (current === "ctx-table-design" || current === "ctx-table-layout")) {
        return current
      }
      if (context === "chart" && (current === "ctx-chart" || current === "ctx-chart-format")) {
        return current
      }
      if (context !== "none" && current === CONTEXT_TAB[context].id) {
        return current
      }
      if (objectInChrome && current === CONTEXT_TAB.headerFooter.id) {
        return current
      }
      return "home"
    })
  }, [context, objectInChrome])

  return (
    <div className="app-ribbon-shell relative z-40 shrink-0 bg-[var(--app-workspace)]">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          tabMotion.start()
          setTab(String(value))
        }}
        className="app-ribbon relative gap-0 border-0 bg-transparent shadow-none"
        onMouseDownCapture={() => {
          if (editor) {
            rememberSelection(editor)
          }
        }}
      >
        <div className="relative flex items-end gap-2 bg-transparent px-3">
          <FileMenu className="ribbon-file-tab mb-px inline-flex h-8 items-center rounded-none px-3 text-[13px] font-semibold text-[var(--app-theme-primary)] hover:bg-[var(--app-hover)] data-popup-open:bg-[var(--app-hover)]" />
          <TabsList variant="line" className="h-8 flex-1 items-end justify-start gap-0 bg-transparent p-0">
            <TabsTrigger value="home" className={ribbonTabClassName}>
              Home
            </TabsTrigger>
            {HIDEABLE_TABS.filter((item) => !hiddenTabs.includes(item.id)).map((item) => (
              <TabsTrigger key={item.id} value={item.id} className={ribbonTabClassName}>
                {item.label}
              </TabsTrigger>
            ))}
            {context === "table" ? (
              <>
                <TabsTrigger value="ctx-table-design" className={contextTabClassName}>
                  Table Design
                </TabsTrigger>
                <TabsTrigger value="ctx-table-layout" className={contextTabClassName}>
                  Table Layout
                </TabsTrigger>
              </>
            ) : null}
            {context === "chart" ? (
              <>
                <TabsTrigger value="ctx-chart" className={contextTabClassName}>
                  Chart Design
                </TabsTrigger>
                <TabsTrigger value="ctx-chart-format" className={contextTabClassName}>
                  Format
                </TabsTrigger>
              </>
            ) : null}
            {objectInChrome ? (
              <TabsTrigger value={CONTEXT_TAB.headerFooter.id} className={contextTabClassName}>
                {CONTEXT_TAB.headerFooter.label}
              </TabsTrigger>
            ) : null}
            {context !== "none" && context !== "table" && context !== "chart" ? (
              <TabsTrigger value={CONTEXT_TAB[context].id} className={contextTabClassName}>
                {CONTEXT_TAB[context].label}
              </TabsTrigger>
            ) : null}
          </TabsList>
          <div className="mb-0.5 flex shrink-0 items-center">
            <ColorModeToggle />
          </div>
        </div>
        <div
          ref={cardRef}
          data-ribbon-layout={ribbonLayout}
          onContextMenu={(event) => {
            // Right-click on a command: Add to Quick Access Toolbar, as in Word.
            if (!event.defaultPrevented && openRibbonCommandMenu(event.target, event.clientX, event.clientY)) {
              event.preventDefault()
            }
          }}
          className="ribbon-card relative mx-3 mb-1.5 overflow-hidden rounded-[8px] border border-[var(--app-ribbon-border)] bg-[var(--app-ribbon-card)] shadow-[var(--app-ribbon-shadow)]"
        >
          {MAIN_TABS.filter(([id]) => visited.includes(id)).map(([id, Content]) => (
            <Activity key={id} mode={tab === id ? "visible" : "hidden"}>
              <TabsContent value={id} keepMounted data-ribbon-tab={id} data-ribbon-tab-label={tabLabel(id)}>
                <Content />
              </TabsContent>
            </Activity>
          ))}
          {tab === "ctx-table-design" && (
            <TabsContent value="ctx-table-design" data-ribbon-tab="ctx-table-design" data-ribbon-tab-label={tabLabel("ctx-table-design")}>
              <TableDesignTab />
            </TabsContent>
          )}
          {tab === "ctx-table-layout" && (
            <TabsContent value="ctx-table-layout" data-ribbon-tab="ctx-table-layout" data-ribbon-tab-label={tabLabel("ctx-table-layout")}>
              <TableLayoutTab />
            </TabsContent>
          )}
          {tab === "ctx-smartart" && (
            <TabsContent value="ctx-smartart" data-ribbon-tab="ctx-smartart" data-ribbon-tab-label={tabLabel("ctx-smartart")}>
              <SmartArtDesignTab />
            </TabsContent>
          )}
          {tab === "ctx-picture" && (
            <TabsContent value="ctx-picture" data-ribbon-tab="ctx-picture" data-ribbon-tab-label={tabLabel("ctx-picture")}>
              <PictureFormatTab />
            </TabsContent>
          )}
          {tab === "ctx-shape" && (
            <TabsContent value="ctx-shape" data-ribbon-tab="ctx-shape" data-ribbon-tab-label={tabLabel("ctx-shape")}>
              <ShapeFormatTab />
            </TabsContent>
          )}
          {tab === "ctx-chart" && (
            <TabsContent value="ctx-chart" data-ribbon-tab="ctx-chart" data-ribbon-tab-label={tabLabel("ctx-chart")}>
              <ChartDesignTab />
            </TabsContent>
          )}
          {tab === "ctx-chart-format" && (
            <TabsContent value="ctx-chart-format" data-ribbon-tab="ctx-chart-format" data-ribbon-tab-label={tabLabel("ctx-chart-format")}>
              <ChartFormatTab />
            </TabsContent>
          )}
          {tab === "ctx-model" && (
            <TabsContent value="ctx-model" data-ribbon-tab="ctx-model" data-ribbon-tab-label={tabLabel("ctx-model")}>
              <ModelTab />
            </TabsContent>
          )}
          {tab === "ctx-equation" && (
            <TabsContent value="ctx-equation" data-ribbon-tab="ctx-equation" data-ribbon-tab-label={tabLabel("ctx-equation")}>
              <EquationTab />
            </TabsContent>
          )}
          {tab === "ctx-header-footer" && (
            <TabsContent value="ctx-header-footer" data-ribbon-tab="ctx-header-footer" data-ribbon-tab-label={tabLabel("ctx-header-footer")}>
              <HeaderFooterTab />
            </TabsContent>
          )}
          {tab === "ctx-draw" && (
            <TabsContent value="ctx-draw" data-ribbon-tab="ctx-draw" data-ribbon-tab-label={tabLabel("ctx-draw")}>
              <DrawTab />
            </TabsContent>
          )}
          <RibbonScrollButtons card={cardRef} tab={tab} layout={ribbonLayout} />
          <RibbonLayoutToggle />
        </div>
        <DesignDialogs />
        <CommandMenuHost />
      </Tabs>
    </div>
  )
}
