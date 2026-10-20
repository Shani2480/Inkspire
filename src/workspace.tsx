import { ChartFormatPane } from "@/components/chart-format-pane"
import { HelperToolsDialog } from "@/components/helper-tools-dialog"
import { CompressDialog } from "@/components/picture-menus"
import { TableStylesDialog } from "@/components/table-design-menus"
import { TextPromptHost } from "@/components/text-prompt"
import { ChartTypeDialog, SelectDataDialog } from "@/components/chart-menus"
import { HelpDialogs } from "@/components/help-dialogs"
import { useCallback, useEffect, useRef, useState } from "react"
import { AiSidebar } from "@/components/ai-sidebar"
import { AiKeysDialog } from "@/components/ai-keys"
import { ClipboardPane, useClipboardCapture } from "@/components/clipboard-pane"
import { ColorDialogHost } from "@/components/color-dialog"
import { ModelFormatDialogHost } from "@/components/model-format-dialog"
import { SetDefaultDialogHost } from "@/components/set-default-dialog"
import { FormatDialogHost } from "@/components/format-dialogs"
import { FillVariablesDialog } from "@/components/fill-variables"
import { FindDialog } from "@/components/find-dialog"
import { DocumentRulers } from "@/components/document-rulers"
import { ReadBar, ReadView } from "@/components/read-mode"
import { ImmersiveReader } from "@/components/immersive-reader"
import { NavigationPane } from "@/components/navigation-pane"
import { PageCanvas } from "@/components/page-canvas"
import { AskAiPrompt } from "@/components/ask-ai-prompt"
import { RewritePopover } from "@/components/rewrite-popover"
import { Ribbon } from "@/components/ribbon/ribbon"
import { FieldEditor } from "@/components/field-editor"
import { TocDialogHost } from "@/components/toc-dialogs"
import { ProofingPanel } from "@/components/proofing-panel"
import { ReviewPanel } from "@/components/review-panel"
import { SpellMenu } from "@/components/spell-menu"
import { SelectionPane } from "@/components/selection-pane"
import { FormatShapePane } from "@/components/format-shape-pane"
import { StatusBar } from "@/components/status-bar"
import { TemplateBuilder } from "@/components/template-builder"
import { Backstage } from "@/components/backstage/backstage"
import { TitleBar } from "@/components/title-bar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { openDroppedDocuments } from "@/document/commands"
import { useAutosave, useCloseGuard, useDocumentWindow } from "@/document/autosave"
import { useBackstage } from "@/document/backstage"
import { useReviewStore } from "@/document/review"
import { useDocumentStore } from "@/document/store"
import { themeAccentVars } from "@/document/theme"
import { useViewStore } from "@/document/view"
import { RecoveryDialog } from "@/components/recovery-dialog"
import { FileErrorDialog } from "@/components/file-error-dialog"
import { BordersShadingHost } from "@/components/borders-shading-dialog"
import { CustomizeDialogHost } from "@/components/customize-dialog"
import { OptimizeDialogHost } from "@/components/optimize-dialog"
import { SmartArtTextPane } from "@/components/smartart-text-pane"
import { ColumnsDialogHost } from "@/components/columns-dialog"
import { TablePropertiesHost } from "@/components/table-properties-dialog"
import { FirstRunSetup } from "@/components/first-run-setup"
import { StyleDialogs } from "@/components/style-dialogs"
import { showEditedStyles, useStyleStore } from "@/document/styles"
import { SaveChangesDialog } from "@/components/save-changes-dialog"
import { useDocumentCommands } from "@/document/app-menu"
import { getDocumentEditor } from "@/document/editor-ref"
import { DocumentEditorProvider, useBodyEditor } from "@/editor/document-editor"
import { installPaginationProfileCommand } from "@/editor/pagination-profile"
import { ensureDictionary } from "@/editor/spellcheck"
import { ensureSystemFonts } from "@/editor/system-fonts"
import { useEditorState } from "@tiptap/react"

type WorkspaceProps = {
  onReady: () => void
}

export default function Workspace({ onReady }: WorkspaceProps) {
  return (
    <TooltipProvider delay={1000}>
      <DocumentEditorProvider>
        <DocumentShell onReady={onReady} />
      </DocumentEditorProvider>
    </TooltipProvider>
  )
}

function DocumentShell({ onReady }: WorkspaceProps) {
  useDocumentCommands()
  useAutosave()
  useCloseGuard()
  useClipboardCapture()
  const editor = useBodyEditor()
  useDocumentWindow(Boolean(editor))

  useEffect(() => installPaginationProfileCommand(() => getDocumentEditor()), [])
  useEffect(() => {
    showEditedStyles(useStyleStore.getState().styles)
    return useStyleStore.subscribe((state, previous) => {
      if (state.styles !== previous.styles) {
        showEditedStyles(state.styles)
      }
    })
  }, [])
  const markup = useReviewStore((state) => state.markup)
  // Web Layout and Read Mode have no page to measure, so no rulers.
  const showRuler = useViewStore(
    (state) => state.showRuler && state.layoutMode !== "web" && state.layoutMode !== "read",
  )
  const split = useViewStore((state) => state.split)
  const sideBySide = useViewStore((state) => state.sideBySide)
  const syncScroll = useViewStore((state) => state.syncScroll)
  const restricted = useViewStore((state) => state.restricted)
  const readOnly = useDocumentStore((state) => state.readOnly)
  const addEditingTime = useDocumentStore((state) => state.addEditingTime)
  const backstageOpen = useBackstage((state) => state.open)
  const themeBackground = useViewStore((state) => state.themeBackground)
  const colorMode = useViewStore((state) => state.colorMode)
  const layoutMode = useViewStore((state) => state.layoutMode)
  const focusMode = useViewStore((state) => state.focusMode)
  const readLayout = useViewStore((state) => state.readLayout)
  const [readHeadings, setReadHeadings] = useState<{ titles: string[]; go: (index: number) => void }>({
    titles: [],
    go: () => undefined,
  })
  const takeHeadings = useCallback(
    (titles: string[], go: (index: number) => void) => setReadHeadings({ titles, go }),
    [],
  )
  const reading = layoutMode === "read"
  const columnsShown = reading && readLayout === "columns"
  const mainRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // On the root rather than the shell, so dialogs and menus drawn outside the shell take the accent too.
    const root = document.documentElement.style
    const vars = Object.entries(themeAccentVars(themeBackground, colorMode))
    for (const [name, value] of vars) {
      root.setProperty(name, String(value))
    }
    return () => {
      for (const [name] of vars) {
        root.removeProperty(name)
      }
    }
  }, [themeBackground, colorMode])

  useEffect(() => {
    if (!editor) {
      return
    }
    editor.view.dom.dataset.markup = markup
    editor.setEditable(!restricted && !readOnly && layoutMode !== "read")
  }, [editor, markup, restricted, readOnly, layoutMode])

  useEffect(() => {
    if (backstageOpen || restricted || readOnly) {
      return
    }
    const timer = window.setInterval(() => {
      addEditingTime(15_000)
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [addEditingTime, backstageOpen, restricted, readOnly])

  useEffect(() => {
    const main = mainRef.current
    const copy = copyRef.current
    if (!main || !copy || !syncScroll) {
      return
    }
    const follow = (source: HTMLElement, target: HTMLElement) => () => {
      target.scrollTop = source.scrollTop
      target.scrollLeft = source.scrollLeft
    }
    const onMain = follow(main, copy)
    const onCopy = follow(copy, main)
    main.addEventListener("scroll", onMain)
    copy.addEventListener("scroll", onCopy)
    return () => {
      main.removeEventListener("scroll", onMain)
      copy.removeEventListener("scroll", onCopy)
    }
  }, [syncScroll, split])

  useEffect(() => {
    if (!editor) {
      return
    }

    let cancelled = false

    async function boot() {
      await ensureDictionary().catch(() => undefined)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (!cancelled) {
        onReady()
        // Read the system's fonts while the app is idle, so the font menu has them when it first opens.
        window.setTimeout(() => void ensureSystemFonts(), 1000)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [editor, onReady])

  useEffect(() => {
    function onDragOver(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) {
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    }
    function onDrop(event: DragEvent) {
      if (!event.dataTransfer?.files?.length) {
        return
      }
      event.preventDefault()
      openDroppedDocuments(event.dataTransfer.files)
    }
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
    }
  }, [])

  return (
    <div
      className={`app-shell flex h-full min-h-0 flex-col bg-[var(--app-workspace)] text-foreground${focusMode ? " is-focus" : ""}`}
      data-layout={layoutMode}
    >
      <TitleBar />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {reading ? <ReadBar headings={columnsShown ? readHeadings.titles : []} onHeading={readHeadings.go} /> : null}
        {/* Kept mounted, only hidden, so its tab and state are as they were when the reading is over. */}
        <div className={reading ? "hidden" : "contents"}>
          <Ribbon />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-row">
          {/* Task panes sit beside the rulers, as in Word, so the rulers never run over or cover them. */}
          <RecoveryDialog />
          <ClipboardPane />
          <NavigationPane />
          <DocumentRulers>
            <div className="flex min-h-0 min-w-0 flex-1 flex-row bg-[var(--app-workspace)]">
              <div className={`flex min-h-0 min-w-0 flex-1 ${sideBySide ? "flex-row" : "flex-col"}`}>
                <main
                  ref={mainRef}
                  id="document-scroll"
                  className={`relative z-0 min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--app-workspace)] pb-12 pr-6 ${showRuler ? "pl-[calc(1.5rem+18px)]" : "pl-6"}${columnsShown ? " hidden" : ""}`}
                >
                  <PageCanvas />
                </main>
                {columnsShown ? <ReadView onHeadings={takeHeadings} /> : null}
                {split ? (
                  <section
                    ref={copyRef}
                    aria-label="Split view"
                    className="min-h-0 min-w-0 flex-1 overflow-auto border-[var(--app-divider)] bg-[var(--app-workspace)] p-6"
                    style={{ borderTopWidth: sideBySide ? 0 : 1, borderLeftWidth: sideBySide ? 1 : 0 }}
                  >
                    <SplitPreview />
                  </section>
                ) : null}
              </div>
              <SelectionPane />
              <FormatShapePane />
              <ChartFormatPane />
              <AiSidebar />
            </div>
            <ReviewPanel />
          </DocumentRulers>
        </div>
        <StatusBar />
        <Backstage />
      </div>
      <ImmersiveReader />
      <AskAiPrompt />
      <RewritePopover />
      <TemplateBuilder />
      <FillVariablesDialog />
      <FindDialog />
      <HelpDialogs />
      <SpellMenu />
      <ProofingPanel />
      <FieldEditor />
      <TocDialogHost />
      <AiKeysDialog />
      <ColorDialogHost />
      <ModelFormatDialogHost />
      <SetDefaultDialogHost />
      <FormatDialogHost />
      <SaveChangesDialog />
      <FileErrorDialog />
      <StyleDialogs />
      <ChartTypeDialog editor={editor} />
      <SelectDataDialog editor={editor} />
      <TextPromptHost />
      <FirstRunSetup />
      <HelperToolsDialog />
      <BordersShadingHost />
      <TablePropertiesHost />
      <ColumnsDialogHost />
      <SmartArtTextPane />
      <CustomizeDialogHost />
      <OptimizeDialogHost />
      <CompressDialog editor={editor} />
      <TableStylesDialog editor={editor} />
    </div>
  )
}

/**
 * The split view's copy of the document. Its own component, so the document is serialised only while the split is
 * open and only this re-renders as you type, not the whole workspace.
 */
function SplitPreview() {
  const editor = useBodyEditor()
  const preview = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.getHTML() ?? "",
  })
  return (
    <article
      className="page-editor mx-auto max-w-[720px] bg-white p-8 shadow-sm"
      dangerouslySetInnerHTML={{ __html: preview ?? "" }}
    />
  )
}
