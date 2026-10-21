import { useProofing } from "@/ai/proofing"
import { askText } from "@/components/text-prompt"
import { useAiSettings } from "@/ai/settings"
import { captureTemplatePlace } from "@/ai/template-place"
import { RIBBON_TIPS } from "@/components/ribbon/tips"
import { useBackstage } from "@/document/backstage"
import { useOptionsDialog } from "@/document/options-dialog"
import { closeDocument, exportDocument, openDocument, saveDocument } from "@/document/commands"
import { getDocumentEditor } from "@/document/editor-ref"
import { useReviewStore } from "@/document/review"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { rewriteSelection, summarizeDocument } from "@/editor/actions"
import { addComment } from "@/editor/comments"
import {
  applyBullet,
  applyNumbering,
  applyParagraphStyle,
  clearFormatting,
  copySelection,
  cutSelection,
  pasteFromClipboard,
  sortBlocks,
} from "@/editor/home-actions"
import { insertAtSelectionEnd, chainWithSelection } from "@/editor/selection-memory"
import Fuse from "fuse.js"

export type TellMeCommand = {
  id: string
  label: string
  description: string
  keywords: string[]
  category: string
  run: () => void
}

function editor() {
  return getDocumentEditor()
}

function withEditor(run: (current: NonNullable<ReturnType<typeof editor>>) => void) {
  const current = editor()
  if (!current) {
    return
  }
  run(current)
}

function buildCommands(): TellMeCommand[] {
  const commands: TellMeCommand[] = [
    {
      id: "file.open",
      label: "Open",
      description: tip("Open"),
      keywords: ["file", "open", "load"],
      category: "File",
      run: () => openDocument(),
    },
    {
      id: "file.save",
      label: "Save",
      description: tip("Save"),
      keywords: ["file", "save"],
      category: "File",
      run: () => saveDocument(),
    },
    {
      id: "file.save-as",
      label: "Save As",
      description: tip("Save As"),
      keywords: ["file", "save as", "copy"],
      category: "File",
      run: () => {
        useBackstage.getState().openBackstage("save-as")
      },
    },
    {
      id: "file.print",
      label: "Print",
      description: tip("Print"),
      keywords: ["print"],
      category: "File",
      run: () => {
        useBackstage.getState().openBackstage("print")
      },
    },
    {
      id: "file.export-pdf",
      label: "Export to PDF",
      description: "Export this document as a PDF file.",
      keywords: ["export", "pdf"],
      category: "File",
      run: () => exportDocument("pdf"),
    },
    {
      id: "file.export-docx",
      label: "Export to DOCX",
      description: "Export this document as a Word file.",
      keywords: ["export", "docx", "word"],
      category: "File",
      run: () => exportDocument("docx"),
    },
    {
      id: "file.info",
      label: "Document Properties",
      description: tip("Properties"),
      keywords: ["info", "properties", "author", "title"],
      category: "File",
      run: () => useBackstage.getState().openBackstage("info"),
    },
    {
      id: "file.close",
      label: "Close",
      description: "Close the current document.",
      keywords: ["close", "file"],
      category: "File",
      run: () => closeDocument(),
    },
    {
      id: "file.share",
      label: "Share",
      description: "Share or send a copy of this document.",
      keywords: ["share", "send"],
      category: "File",
      run: () => useBackstage.getState().openBackstage("share"),
    },
    {
      id: "edit.undo",
      label: "Undo",
      description: tip("Undo"),
      keywords: ["undo"],
      category: "Home",
      run: () => withEditor((current) => current.chain().focus().undo().run()),
    },
    {
      id: "edit.redo",
      label: "Redo",
      description: tip("Redo"),
      keywords: ["redo"],
      category: "Home",
      run: () => withEditor((current) => current.chain().focus().redo().run()),
    },
    {
      id: "edit.cut",
      label: "Cut",
      description: tip("Cut"),
      keywords: ["cut"],
      category: "Home",
      run: () => withEditor((current) => cutSelection(current)),
    },
    {
      id: "edit.copy",
      label: "Copy",
      description: tip("Copy"),
      keywords: ["copy"],
      category: "Home",
      run: () => withEditor((current) => copySelection(current)),
    },
    {
      id: "edit.paste",
      label: "Paste",
      description: tip("Paste"),
      keywords: ["paste"],
      category: "Home",
      run: () => withEditor((current) => void pasteFromClipboard(current, "merge")),
    },
    {
      id: "edit.bold",
      label: "Bold",
      description: tip("Bold"),
      keywords: ["bold", "strong"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).toggleBold().run()),
    },
    {
      id: "edit.italic",
      label: "Italic",
      description: tip("Italic"),
      keywords: ["italic"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).toggleItalic().run()),
    },
    {
      id: "edit.underline",
      label: "Underline",
      description: tip("Underline"),
      keywords: ["underline"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).toggleUnderline().run()),
    },
    {
      id: "edit.strikethrough",
      label: "Strikethrough",
      description: tip("Strikethrough"),
      keywords: ["strike", "strikethrough"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).toggleStrike().run()),
    },
    {
      id: "edit.clear-formatting",
      label: "Clear All Formatting",
      description: tip("Clear All Formatting"),
      keywords: ["clear", "formatting"],
      category: "Home",
      run: () => withEditor((current) => clearFormatting(current)),
    },
    {
      id: "edit.align-left",
      label: "Align Left",
      description: tip("Align Left"),
      keywords: ["align", "left"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).setTextAlign("left").run()),
    },
    {
      id: "edit.align-center",
      label: "Center",
      description: tip("Center"),
      keywords: ["align", "center"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).setTextAlign("center").run()),
    },
    {
      id: "edit.align-right",
      label: "Align Right",
      description: tip("Align Right"),
      keywords: ["align", "right"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).setTextAlign("right").run()),
    },
    {
      id: "edit.justify",
      label: "Justify",
      description: tip("Justify"),
      keywords: ["align", "justify"],
      category: "Home",
      run: () => withEditor((current) => chainWithSelection(current).setTextAlign("justify").run()),
    },
    {
      id: "edit.bullets",
      label: "Bullets",
      description: tip("Bullets"),
      keywords: ["list", "bullets"],
      category: "Home",
      run: () => withEditor((current) => applyBullet(current, "•")),
    },
    {
      id: "edit.numbering",
      label: "Numbering",
      description: tip("Numbering"),
      keywords: ["list", "number"],
      category: "Home",
      run: () => withEditor((current) => applyNumbering(current, "1.")),
    },
    {
      id: "edit.heading-1",
      label: "Heading 1",
      description: tip("Heading 1"),
      keywords: ["heading", "style", "h1"],
      category: "Home",
      run: () => withEditor((current) => applyParagraphStyle(current, "heading-1")),
    },
    {
      id: "edit.heading-2",
      label: "Heading 2",
      description: tip("Heading 2"),
      keywords: ["heading", "style", "h2"],
      category: "Home",
      run: () => withEditor((current) => applyParagraphStyle(current, "heading-2")),
    },
    {
      id: "edit.normal",
      label: "Normal",
      description: tip("Normal"),
      keywords: ["style", "paragraph", "normal"],
      category: "Home",
      run: () => withEditor((current) => applyParagraphStyle(current, "normal")),
    },
    {
      id: "edit.show-hide",
      label: "Show/Hide ¶",
      description: tip("Show/Hide ¶"),
      keywords: ["paragraph", "marks", "formatting"],
      category: "Home",
      run: () => useViewStore.getState().toggleFormattingMarks(),
    },
    {
      id: "edit.sort",
      label: "Sort",
      description: tip("Sort"),
      keywords: ["sort", "az"],
      category: "Home",
      run: () => withEditor((current) => sortBlocks(current, "asc")),
    },
    {
      id: "edit.find",
      label: "Find",
      description: tip("Find"),
      keywords: ["find", "search", "document"],
      category: "Home",
      run: () => useViewStore.getState().openFind(false),
    },
    {
      id: "edit.replace",
      label: "Find & Replace",
      description: tip("Replace"),
      keywords: ["find", "replace", "search"],
      category: "Home",
      run: () => useViewStore.getState().openFind(true),
    },
    {
      id: "edit.select-all",
      label: "Select All",
      description: "Select the entire document.",
      keywords: ["select", "all"],
      category: "Home",
      run: () => withEditor((current) => current.chain().focus().selectAll().run()),
    },
    {
      id: "insert.table",
      label: "Insert Table",
      description: tip("Table"),
      keywords: ["insert", "table"],
      category: "Insert",
      run: () =>
        withEditor((current) =>
          insertAtSelectionEnd(current).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        ),
    },
    {
      id: "insert.page-break",
      label: "Page Break",
      description: tip("Page Break"),
      keywords: ["insert", "page", "break"],
      category: "Insert",
      run: () => withEditor((current) => insertAtSelectionEnd(current).setPageBreak().run()),
    },
    {
      id: "insert.comment",
      label: "Add Comment",
      description: tip("New Comment"),
      keywords: ["comment", "review"],
      category: "Review",
      run: () =>
        withEditor((current) => {
          void askText({ title: "New Comment", label: "Comment", multiline: true, ok: "Post" }).then((text) => {
            if (text?.trim()) {
              addComment(current, text)
              useReviewStore.getState().setShowComments(true)
            }
          })
        }),
    },
    {
      id: "insert.link",
      label: "Link",
      description: tip("Link"),
      keywords: ["hyperlink", "link", "url"],
      category: "Insert",
      run: () =>
        withEditor((current) => {
          void askText({ title: "Insert Hyperlink", label: "Address:", value: "https://" }).then((href) => {
            if (href) {
              chainWithSelection(current).extendMarkRange("link").setLink({ href }).run()
            }
          })
        }),
    },
    {
      id: "layout.margins",
      label: "Change Margins",
      description: tip("Margins"),
      keywords: ["margins", "layout", "page"],
      category: "Layout",
      run: () => {
        const setup = useDocumentStore.getState().pageSetup
        useDocumentStore.getState().setPageSetup({
          ...setup,
          marginTop: 25.4,
          marginRight: 25.4,
          marginBottom: 25.4,
          marginLeft: 25.4,
        })
      },
    },
    {
      id: "layout.orientation",
      label: "Orientation",
      description: tip("Orientation"),
      keywords: ["landscape", "portrait", "orientation"],
      category: "Layout",
      run: () => {
        const setup = useDocumentStore.getState().pageSetup
        useDocumentStore
          .getState()
          .setPageSetup({ ...setup, orientation: setup.orientation === "portrait" ? "landscape" : "portrait" })
      },
    },
    {
      id: "view.dark-mode",
      label: "Toggle Dark Mode",
      description: "Switch between light and dark appearance.",
      keywords: ["dark", "light", "theme", "color mode"],
      category: "View",
      run: () => useViewStore.getState().toggleColorMode(),
    },
    {
      id: "view.nav-pane",
      label: "Navigation Pane",
      description: tip("Navigation Pane"),
      keywords: ["navigation", "headings", "pane"],
      category: "View",
      run: () => {
        const state = useViewStore.getState()
        state.setNavPane(!state.navPane)
      },
    },
    {
      id: "view.ruler",
      label: "Ruler",
      description: tip("Ruler"),
      keywords: ["ruler"],
      category: "View",
      run: () => useViewStore.getState().toggleRuler(),
    },
    {
      id: "view.gridlines",
      label: "Gridlines",
      description: tip("Gridlines"),
      keywords: ["grid"],
      category: "View",
      run: () => useViewStore.getState().toggleGridlines(),
    },
    {
      id: "view.focus",
      label: "Focus",
      description: tip("Focus"),
      keywords: ["focus", "zen"],
      category: "View",
      run: () => {
        const state = useViewStore.getState()
        state.setFocusMode(!state.focusMode)
      },
    },
    {
      id: "view.immersive",
      label: "Immersive Reader",
      description: tip("Immersive Reader"),
      keywords: ["immersive", "reader"],
      category: "View",
      run: () => useViewStore.getState().setImmersive(true),
    },
    {
      id: "view.print-layout",
      label: "Print Layout",
      description: tip("Print Layout"),
      keywords: ["layout", "print", "pages"],
      category: "View",
      run: () => useViewStore.getState().setLayoutMode("print"),
    },
    {
      id: "view.web-layout",
      label: "Web Layout",
      description: tip("Web Layout"),
      keywords: ["web", "layout"],
      category: "View",
      run: () => useViewStore.getState().setLayoutMode("web"),
    },
    {
      id: "view.zoom-100",
      label: "100%",
      description: tip("100%"),
      keywords: ["zoom", "100"],
      category: "View",
      run: () => useViewStore.getState().setZoom(1),
    },
    {
      id: "view.page-width",
      label: "Page Width",
      description: tip("Page Width"),
      keywords: ["zoom", "width"],
      category: "View",
      run: () => useViewStore.getState().setZoomMode("width"),
    },
    {
      id: "review.spelling",
      label: "Check Spelling",
      description: "Turn spelling underlines on or off.",
      keywords: ["spelling", "spell", "proofing"],
      category: "Review",
      run: () => useViewStore.getState().toggleSpellCheck(),
    },
    {
      id: "review.grammar",
      label: "Check Grammar",
      description: "Run a grammar check in the document language.",
      keywords: ["grammar", "proofing"],
      category: "Review",
      run: () => useProofing.getState().openPanel("grammar"),
    },
    {
      id: "review.thesaurus",
      label: "Thesaurus",
      description: tip("Thesaurus"),
      keywords: ["thesaurus", "synonyms"],
      category: "Review",
      run: () => useProofing.getState().openPanel("thesaurus"),
    },
    {
      id: "review.translate",
      label: "Translate",
      description: tip("Translate"),
      keywords: ["translate", "language"],
      category: "Review",
      run: () => useProofing.getState().openPanel("translation"),
    },
    {
      id: "review.track-changes",
      label: "Track Changes",
      description: tip("Track Changes"),
      keywords: ["track", "changes", "review"],
      category: "Review",
      run: () => {
        const state = useReviewStore.getState()
        state.setTracking(!state.tracking)
      },
    },
    {
      id: "review.show-comments",
      label: "Show Comments",
      description: tip("Show Comments"),
      keywords: ["comments"],
      category: "Review",
      run: () => {
        const state = useReviewStore.getState()
        state.setShowComments(!state.showComments)
      },
    },
    {
      id: "ai.summarize",
      label: "Summarize",
      description: tip("Summarize"),
      keywords: ["ai", "summarize", "summary"],
      category: "AI Tools",
      run: () => withEditor((current) => void summarizeDocument(current)),
    },
    {
      id: "ai.rewrite",
      label: "Rewrite",
      description: tip("Rewrite"),
      keywords: ["ai", "rewrite"],
      category: "AI Tools",
      run: () => withEditor((current) => void rewriteSelection(current)),
    },
    {
      id: "ai.template-builder",
      label: "Template Builder",
      description: tip("Template Builder"),
      keywords: ["ai", "template"],
      category: "AI Tools",
      run: () => {
        const current = editor()
        if (current) {
          captureTemplatePlace(current.state.selection.from, current.state.selection.to)
        }
        useAiSettings.getState().setBuilderOpen(true)
      },
    },
    {
      id: "ai.keys",
      label: "AI Settings",
      description: tip("AI Settings"),
      keywords: ["ai", "keys", "api", "settings"],
      category: "AI Tools",
      run: () => useAiSettings.getState().setKeysOpen(true),
    },
    {
      id: "options",
      label: "Options",
      description: "Open application options.",
      keywords: ["settings", "options", "preferences"],
      category: "File",
      run: () => useOptionsDialog.getState().openOptions(),
    },
  ]

  return commands
}

function tip(label: string) {
  return RIBBON_TIPS[label]?.description ?? label
}

let cached: TellMeCommand[] | null = null
let fuse: Fuse<TellMeCommand> | null = null

export function tellMeCommands() {
  if (!cached) {
    cached = buildCommands()
    fuse = new Fuse(cached, {
      keys: [
        { name: "label", weight: 0.5 },
        { name: "keywords", weight: 0.3 },
        { name: "description", weight: 0.15 },
        { name: "category", weight: 0.05 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      includeScore: true,
    })
  }
  return cached
}

export function searchTellMeCommands(query: string, limit = 12) {
  const commands = tellMeCommands()
  const trimmed = query.trim()
  if (!trimmed) {
    return commands.slice(0, limit)
  }
  if (!fuse) {
    tellMeCommands()
  }
  return (fuse?.search(trimmed) ?? []).slice(0, limit).map((result) => result.item)
}
