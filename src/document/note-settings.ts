import { create } from "zustand"
import type { WordDocument } from "@/document/docx/model"
import {
  NOTE_DEFAULTS,
  noteSettingsOf,
  type NoteKind,
  type NoteProps,
  type NoteSettings,
} from "@/document/note-numbering"

/**
 * The open document's footnote and endnote options (References > Footnotes dialog): what an opened Word file sets
 * (its last section's own over settings.xml), or Word's defaults. `edited` once the dialog changed them, so a save
 * writes them; until then the file keeps what it had.
 */
type NoteSettingsState = {
  settings: NoteSettings
  edited: boolean
  apply: (kind: NoteKind, props: NoteProps) => void
}

export const useNoteSettings = create<NoteSettingsState>((set) => ({
  settings: NOTE_DEFAULTS,
  edited: false,
  apply: (kind, props) =>
    set((state) => ({
      settings: { ...state.settings, [kind]: noteSettingsOf(kind, state.settings[kind], props) },
      edited: true,
    })),
}))

/** An opened document's note options, or the defaults for anything but a Word file. */
export function applyOpenedNotes(word: WordDocument | null) {
  useNoteSettings.setState({
    settings: {
      footnote: noteSettingsOf("footnote", word?.settings.footnoteProps, word?.section?.footnoteProps),
      endnote: noteSettingsOf("endnote", word?.settings.endnoteProps, word?.section?.endnoteProps),
    },
    edited: false,
  })
}

/** What a save writes: the options when the dialog changed them. */
export function notesForSave() {
  const state = useNoteSettings.getState()
  return state.edited ? state.settings : undefined
}
