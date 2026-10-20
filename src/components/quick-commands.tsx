import { useAskAi } from "@/ai/ask-ai"
import { AiSpark } from "@/components/ai-spark"
import { toggleBold } from "@/editor/shape-text"
import { saveDocument } from "@/document/commands"
import { useBackstage } from "@/document/backstage"
import { registerKnownCommands } from "@/document/customize"
import type { Editor } from "@tiptap/core"
import { Bold, FileOutput, FilePlus, FolderOpen, Italic, Printer, Redo2, Save, Underline, Undo2 } from "lucide-react"
import type { ReactNode } from "react"

export type QuickCommand = {
  id: string
  label: string
  icon: ReactNode
  run: (editor: Editor | null) => void
  /** Whether it can be used now. */
  enabled?: (state: { editor: Editor | null; undo: boolean; redo: boolean }) => boolean
}

/** Every command the Quick Access Toolbar can hold (22.5); the customize dialog lists these. */
export const QUICK_COMMANDS: QuickCommand[] = [
  { id: "new", label: "New", icon: <FilePlus />, run: () => useBackstage.getState().openBackstage("new") },
  { id: "open", label: "Open", icon: <FolderOpen />, run: () => useBackstage.getState().openBackstage("open") },
  { id: "save", label: "Save", icon: <Save />, run: () => saveDocument() },
  {
    id: "save-as",
    label: "Save As",
    icon: <FileOutput />,
    run: () => useBackstage.getState().openBackstage("save-as"),
  },
  { id: "print", label: "Print", icon: <Printer />, run: () => useBackstage.getState().openBackstage("print") },
  {
    id: "undo",
    label: "Undo",
    icon: <Undo2 />,
    run: (editor) => editor?.chain().focus().undo().run(),
    enabled: ({ editor, undo }) => Boolean(editor) && undo,
  },
  {
    id: "redo",
    label: "Redo",
    icon: <Redo2 />,
    run: (editor) => editor?.chain().focus().redo().run(),
    enabled: ({ editor, redo }) => Boolean(editor) && redo,
  },
  { id: "bold", label: "Bold", icon: <Bold />, run: (editor) => (editor ? toggleBold(editor) : undefined) },
  { id: "italic", label: "Italic", icon: <Italic />, run: (editor) => editor?.chain().focus().toggleItalic().run() },
  {
    id: "underline",
    label: "Underline",
    icon: <Underline />,
    run: (editor) => editor?.chain().focus().toggleUnderline().run(),
  },
  {
    id: "ai",
    label: "Ask AI",
    icon: <AiSpark />,
    run: (editor) => (editor ? useAskAi.getState().show(editor) : undefined),
  },
]

registerKnownCommands((id) => QUICK_COMMANDS.some((command) => command.id === id))
