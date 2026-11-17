import { parseCitations } from "@/addins/citations"
import { makeTag } from "@/document/bibliography"
import { useAddins } from "@/addins/store"
import { useProofing } from "@/ai/proofing"
import { useEditorPane } from "@/editor/grammar"
import { openDocument, reportError, saveDocumentAsFormat } from "@/document/commands"
import { useBackstage } from "@/document/backstage"
import { loadMasterList, putMasterSource, useBibliography } from "@/document/bibliography-store"
import { useDocumentStore } from "@/document/store"

export type AddInCommand = { id: string; label: string; run: () => void | Promise<void> }

/** A built-in add-in: a named group of commands the app already has or can do without a plugin runtime. */
export type AddIn = {
  id: string
  name: string
  description: string
  group: string
  commands: AddInCommand[]
}

/** Opens a file chooser and gives back the chosen file's text, or null when none was chosen. */
function pickTextFile(accept: string) {
  return new Promise<string | null>((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      void (file ? file.text() : Promise.resolve(null)).then(resolve, () => resolve(null))
    }
    input.addEventListener("cancel", () => resolve(null))
    input.click()
  })
}

async function importCitations() {
  const text = await pickTextFile(".bib,.bibtex,.json,.csl,application/json")
  if (text === null) {
    return
  }
  const found = parseCitations(text)
  // A source already in the lists (same type, people and fields) is left alone; the rest go into the document's
  // list and the Master List, as Word's Create Source does.
  const sameAs = (a: (typeof found)[number], b: (typeof found)[number]) =>
    JSON.stringify([a.type, a.names, a.fields]) === JSON.stringify([b.type, b.names, b.fields])
  const bibliography = useBibliography.getState()
  const known = [...bibliography.sources, ...loadMasterList()]
  const fresh = found.filter((entry) => !known.some((item) => sameAs(item, entry)))
  const taken = known.map((item) => item.tag)
  for (const entry of fresh) {
    if (taken.some((tag) => tag.toLowerCase() === entry.tag.toLowerCase())) {
      entry.tag = makeTag(entry, taken)
    }
    taken.push(entry.tag)
    useBibliography.getState().putSource(entry)
    putMasterSource(entry)
  }
  if (fresh.length > 0) {
    useDocumentStore.setState({ isDirty: true })
  }
  useAddins
    .getState()
    .say(
      found.length === 0
        ? "No sources were found in that file. Choose a BibTeX or CSL-JSON file."
        : `Added ${fresh.length} source${fresh.length === 1 ? "" : "s"} (${found.length - fresh.length} already in the list). They are in References > Manage Sources.`,
    )
}

export const BUILT_IN_ADDINS: AddIn[] = [
  {
    id: "markdown",
    name: "Markdown",
    description: "Open a Markdown file as a document, or save the document as Markdown.",
    group: "Import and export",
    commands: [
      { id: "open", label: "Open a Markdown file…", run: () => openDocument().catch(reportError) },
      { id: "save", label: "Save as Markdown…", run: () => saveDocumentAsFormat("md").catch(reportError) },
    ],
  },
  {
    id: "templates",
    name: "Document Templates",
    description: "Start from a letter, résumé, report, newsletter or flyer.",
    group: "Templates",
    commands: [{ id: "browse", label: "Browse templates", run: () => useBackstage.getState().openBackstage("new") }],
  },
  {
    id: "writing",
    name: "Writing Assistant",
    description: "Check spelling and grammar, and translate the document, with the AI provider you set up.",
    group: "Writing",
    commands: [
      { id: "grammar", label: "Check spelling and grammar", run: () => useEditorPane.getState().openPane() },
      { id: "translate", label: "Translate the document", run: () => useProofing.getState().openPanel("translation") },
    ],
  },
  {
    id: "citations",
    name: "Citation Import",
    description: "Add sources from a BibTeX or CSL-JSON file exported by Zotero, Mendeley or another manager.",
    group: "References",
    commands: [{ id: "import", label: "Import sources from a file…", run: importCitations }],
  },
]

export function addinById(id: string) {
  return BUILT_IN_ADDINS.find((addin) => addin.id === id)
}
