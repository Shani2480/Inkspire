import { KeyTipsLayer } from "@/components/ribbon/keytips-layer"
import { QuickAccessToolbar } from "@/components/quick-access"
import { ChartFormatPane } from "@/components/chart-format-pane"
import { HelperToolsDialog } from "@/components/helper-tools-dialog"
import { CompressDialog } from "@/components/picture-menus"
import { RemoveBackgroundDialog } from "@/components/remove-background-dialog"
import { TableStylesDialog } from "@/components/table-design-menus"
import { TextPromptHost } from "@/components/text-prompt"
import { ChartTypeDialog, SelectDataDialog } from "@/components/chart-menus"
import { HelpDialogs } from "@/components/help-dialogs"
import { OptionsDialog } from "@/components/options-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
import { AiSidebar } from "@/components/ai-sidebar"
import { AiKeysDialog } from "@/components/ai-keys"
import { ClipboardPane, useClipboardCapture } from "@/components/clipboard-pane"
import { ColorDialogHost } from "@/components/color-dialog"
import { CompareDialogHost } from "@/components/compare-dialog"
import { CoverPageDialogHost } from "@/components/cover-page-dialog"
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
import { IndexDialogsHost } from "@/components/index-dialogs"
import { FootnoteDialogHost } from "@/components/footnote-dialog"
import { SourceDialogsHost } from "@/components/source-dialogs"
import { PasteSpecialHost } from "@/components/paste-special-dialog"
import { ProtectDialogsHost, RestrictEditingPane } from "@/components/protect-pane"
import { ProofingPanel } from "@/components/proofing-panel"
import { AccessibilityPane } from "@/components/accessibility-pane"
import { ApplyStylesBox, RevealFormattingPane, StyleInspector, StylesPane } from "@/components/styles-pane"
import { EditorPane } from "@/components/editor-pane"
import { ReviewPanel } from "@/components/review-panel"
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
import { editingAllowed, useReviewStore } from "@/document/review"
import { useDocumentStore } from "@/document/store"
import { themeAccentVars } from "@/document/theme"
import { useViewStore } from "@/document/view"
import { RecoveryDialog } from "@/components/recovery-dialog"
import { FileErrorDialog } from "@/components/file-error-dialog"
import { PageNumberFormatDialog } from "@/components/page-number-format-dialog"
import { BordersShadingHost } from "@/components/borders-shading-dialog"
import { CustomizeDialogHost } from "@/components/customize-dialog"
import { OptimizeDialogHost } from "@/components/optimize-dialog"
import { InspectDialogHost } from "@/components/inspect-dialog"
import { AutoCorrectDialogHost } from "@/components/autocorrect-dialog"
import { LinkDialogHost } from "@/components/link-dialog"
import { SmartArtTextPane } from "@/components/smartart-text-pane"
import { ColumnsDialogHost } from "@/components/columns-dialog"
import { InsertTableDialogHost } from "@/components/insert-table-dialog"
import { CaptionDialogsHost } from "@/components/caption-dialogs"
import { MailingsDialogs } from "@/components/mailings-dialogs"
import { QuickPartsDialogsHost } from "@/components/quick-parts-dialogs"
import { TablePropertiesHost } from "@/components/table-properties-dialog"
import { ListNumberingHost } from "@/components/list-numbering-dialogs"
import { FirstRunSetup } from "@/components/first-run-setup"
import { StyleDialogs } from "@/components/style-dialogs"
import { showEditedStyles, useStyleStore } from "@/document/styles"
import { SaveChangesDialog } from "@/components/save-changes-dialog"
import { MacroPromptDialog } from "@/components/macro-prompt-dialog"
import { ProtectDocumentDialogs } from "@/components/protect-document-dialogs"
import { ProofingDialogs } from "@/components/proofing-dialogs"
import { PasteOptionsButton } from "@/components/paste-options-button"
import { DocumentMessageBar } from "@/components/document-message-bar"
import { BookmarkDialogHost } from "@/components/ribbon/insert-tab"
import { useDocumentCommands } from "@/document/app-menu"
import { getDocumentEditor } from "@/document/editor-ref"
import { DocumentEditorProvider, useBodyEditor } from "@/editor/document-editor"
import { installPaginationProfileCommand } from "@/editor/pagination-profile"
import { ensureSystemFonts } from "@/editor/system-fonts"
import { useEditorState } from "@tiptap/react"
import { setOutlineActive } from "@/editor/outline-view"

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
  // Web Layout and Read Mode have no page to measure, so no rulers; Outline view has none in Word.
  const showRuler = useViewStore(
    (state) =>
      state.showRuler && state.layoutMode !== "web" && state.layoutMode !== "read" && state.layoutMode !== "outline",
  )
  const split = useViewStore((state) => state.split)
  const sideBySide = useViewStore((state) => state.sideBySide)
  const syncScroll = useViewStore((state) => state.syncScroll)
  // Block Authors, or Restrict Editing enforced with nothing (or only form fields, which the editor has none of) to change.
  const blocked = useViewStore((state) => state.restricted)
  const locked = useReviewStore((state) => ["none", "forms"].includes(editingAllowed(state)))
  const restricted = blocked || locked
  const showInsertions = useReviewStore((state) => state.showInsertions)
  const showFormatting = useReviewStore((state) => state.showFormatting)
  const hiddenAuthors = useReviewStore((state) => state.hiddenAuthors)
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
    const dataset = editor.view.dom.dataset
    dataset.markup = markup
    dataset.showInsertions = String(showInsertions)
    dataset.showFormatting = String(showFormatting)
    editor.setEditable(!restricted && !readOnly && layoutMode !== "read")
  }, [editor, markup, showInsertions, showFormatting, restricted, readOnly, layoutMode])

  // Outline view: the body's paragraphs as an outline (`editor/outline-view.ts`).
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      setOutlineActive(editor, layoutMode === "outline")
    }
  }, [editor, layoutMode])

  // Show Markup > Specific People: a hidden reviewer's changes show as if accepted, the way Word draws them.
  useEffect(() => {
    if (hiddenAuthors.length === 0) {
      return
    }
    const style = document.createElement("style")
    style.dataset.hiddenAuthors = ""
    style.textContent = hiddenAuthorsCss(hiddenAuthors)
    document.head.append(style)
    return () => style.remove()
  }, [hiddenAuthors])

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
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (!cancelled) {
        // The spelling dictionary is loaded by the spellcheck extension and underlines appear when it arrives, so
        // the window does not wait for it: parsing it is the slowest thing the app does at start.
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
          <KeyTipsLayer />
          <QuickAccessToolbar placement="below" />
          <DocumentMessageBar />
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
            <AccessibilityPane />
            <StylesPane />
            <RevealFormattingPane />
            <RestrictEditingPane />
            <EditorPane />
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
      <OptionsDialog />
      <ProofingPanel />
      <FieldEditor />
      <TocDialogHost />
      <AiKeysDialog />
      <ColorDialogHost />
      <ModelFormatDialogHost />
      <SetDefaultDialogHost />
      <FormatDialogHost />
      <SaveChangesDialog />
      <MacroPromptDialog />
      <ProtectDocumentDialogs />
      <ProofingDialogs />
      <PasteOptionsButton />
      <BookmarkDialogHost />
      <FileErrorDialog />
      <PageNumberFormatDialog />
      <StyleDialogs />
      <ChartTypeDialog editor={editor} />
      <SelectDataDialog editor={editor} />
      <TextPromptHost />
      <FirstRunSetup />
      <HelperToolsDialog />
      <BordersShadingHost />
      <CompareDialogHost />
      <CoverPageDialogHost />
      <TablePropertiesHost />
      <ListNumberingHost />
      <ColumnsDialogHost />
      <InsertTableDialogHost />
      <CaptionDialogsHost />
      <QuickPartsDialogsHost />
      <MailingsDialogs />
      <IndexDialogsHost />
      <FootnoteDialogHost />
      <SourceDialogsHost />
      <PasteSpecialHost />
      <ProtectDialogsHost editor={editor} />
      <StyleInspector />
      <ApplyStylesBox />
      <SmartArtTextPane />
      <CustomizeDialogHost />
      <OptimizeDialogHost />
      <InspectDialogHost />
      <AutoCorrectDialogHost />
      <LinkDialogHost />
      <CompressDialog editor={editor} />
      <RemoveBackgroundDialog editor={editor} />
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

/** Rules that draw the named reviewers' changes as if accepted: insertions plain, deletions gone, no format marks. */
function hiddenAuthorsCss(authors: string[]) {
  const by = (name: string) => `[data-author="${CSS.escape(name)}"]`
  const list = (kind: string) => authors.map((name) => `.page-editor ${kind}${by(name)}`).join(",\n")
  return [
    `${list(".track-insertion")}, ${list(".track-format")} { color: inherit !important; text-decoration: none !important; background: none !important; }`,
    `${list(".track-deletion")} { display: none !important; }`,
  ].join("\n")
}
