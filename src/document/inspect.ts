import type { Editor } from "@tiptap/react"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { listComments } from "@/editor/comments"
import { acceptChanges, ignoreTracking, listChanges } from "@/editor/track-changes"
import { SLOT_FIELDS, useDocumentStore, type DocumentProps } from "@/document/store"
import type { ChromeSlot } from "@/document/sections"
import { chromeHasContent, chromeHasPageField } from "@/document/chrome-html"

/**
 * Word's Document Inspector (File > Info > Check for Issues > Inspect Document): looks for what a person may not want
 * to hand on with the file, and removes one kind at a time. Each check reads the document as it is now; each removal
 * is one step that Undo takes back where it changed the text.
 */

export type InspectKind = "comments" | "revisions" | "properties" | "headers" | "hidden"

export type InspectFinding = { kind: InspectKind; found: string[] }

export const INSPECT_KINDS: { kind: InspectKind; title: string; checks: string; removed: string }[] = [
  {
    kind: "comments",
    title: "Comments, Revisions, and Versions",
    checks: "Inspects the document for comments and tracked changes.",
    removed: "All comments and tracked changes were removed.",
  },
  {
    kind: "properties",
    title: "Document Properties and Personal Information",
    checks: "Inspects for the title, subject, tags, comments, author, company and category saved with the file.",
    removed: "Document properties and personal information were removed.",
  },
  {
    kind: "headers",
    title: "Headers, Footers, and Watermarks",
    checks: "Inspects the document for information in headers, footers, and watermarks.",
    removed: "Headers, footers, and watermarks were removed.",
  },
  {
    kind: "hidden",
    title: "Hidden Text",
    checks: "Inspects the document for text that has been formatted as hidden.",
    removed: "Hidden text was removed.",
  },
]

const PROPERTY_LABELS: [keyof DocumentProps, string][] = [
  ["title", "Title"],
  ["subject", "Subject"],
  ["tags", "Tags"],
  ["comments", "Comments"],
  ["author", "Author"],
  ["company", "Company"],
  ["category", "Category"],
]

const SLOT_LABELS: Record<ChromeSlot, string> = {
  header: "Header",
  footer: "Footer",
  firstHeader: "First page header",
  firstFooter: "First page footer",
  evenHeader: "Even page header",
  evenFooter: "Even page footer",
}

/** The ranges of text formatted as hidden (Font > Hidden), merged where they touch. */
export function hiddenRanges(doc: ProseNode) {
  const ranges: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true
    }
    const hidden = node.marks.some((mark) => mark.type.name === "textStyle" && mark.attrs.hidden === "1")
    if (hidden) {
      const last = ranges[ranges.length - 1]
      if (last && last.to === pos) {
        last.to = pos + node.nodeSize
      } else {
        ranges.push({ from: pos, to: pos + node.nodeSize })
      }
    }
    return false
  })
  return ranges
}

/** A header or footer that shows something: text, a picture, a field, a page number. */
const partHasContent = (html: string | undefined) => !!html && (chromeHasContent(html) || chromeHasPageField(html))

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** What the document holds of each kind; a kind with nothing found has an empty list. */
export function inspectDocument(editor: Editor | null): InspectFinding[] {
  const state = useDocumentStore.getState()
  const doc = editor?.state.doc
  const comments = doc ? listComments(doc).length : 0
  const revisions = doc ? listChanges(doc).length : 0
  const review: string[] = []
  if (comments) {
    review.push(plural(comments, "comment"))
  }
  if (revisions) {
    review.push(plural(revisions, "tracked change"))
  }
  const properties = PROPERTY_LABELS.filter(([key]) => String(state.documentProps[key] ?? "").trim()).map(
    ([, label]) => label,
  )
  const headers: string[] = []
  for (const slot of Object.keys(SLOT_LABELS) as ChromeSlot[]) {
    const field = SLOT_FIELDS[slot]
    if (partHasContent(state[field])) {
      headers.push(SLOT_LABELS[slot])
    }
  }
  const sectionParts = state.sections.reduce(
    (count, section) => count + Object.values(section.parts).filter((html) => partHasContent(html)).length,
    0,
  )
  if (sectionParts) {
    headers.push(`${plural(sectionParts, "header or footer", "headers and footers")} in earlier sections`)
  }
  if (state.pageSetup.watermark?.trim()) {
    headers.push("Watermark")
  }
  const hidden = doc ? hiddenRanges(doc) : []
  return [
    { kind: "comments", found: review },
    { kind: "properties", found: properties },
    { kind: "headers", found: headers },
    { kind: "hidden", found: hidden.length ? [`${plural(hidden.length, "passage")} of hidden text`] : [] },
  ]
}

/** Removes everything of one kind, as Word's Remove All does. */
export function removeInspected(editor: Editor | null, kind: InspectKind) {
  const store = useDocumentStore.getState()
  if (kind === "comments") {
    if (!editor) {
      return
    }
    // Word accepts the tracked changes (the text stays as it reads now) and deletes the comments, in one step.
    acceptChanges(editor)
    const comment = editor.schema.marks.comment
    if (comment) {
      editor
        .chain()
        .command(({ tr }) => {
          ignoreTracking(tr)
          tr.removeMark(0, tr.doc.content.size, comment)
          return true
        })
        .run()
    }
    return
  }
  if (kind === "properties") {
    store.setDocumentProps({ title: "", subject: "", tags: "", comments: "", author: "", company: "", category: "" })
    return
  }
  if (kind === "headers") {
    store.setHeader("")
    store.setFooter("")
    store.setFirstHeader("")
    store.setFirstFooter("")
    store.setEvenHeader("")
    store.setEvenFooter("")
    for (const section of store.sections) {
      for (const slot of Object.keys(section.parts) as ChromeSlot[]) {
        store.setSectionPart(section.key, slot, "")
      }
    }
    if (store.pageSetup.watermark) {
      store.setPageSetup({ ...useDocumentStore.getState().pageSetup, watermark: "" })
    }
    return
  }
  if (!editor) {
    return
  }
  const ranges = hiddenRanges(editor.state.doc)
  if (ranges.length) {
    editor
      .chain()
      .command(({ tr }) => {
        ignoreTracking(tr)
        for (const range of [...ranges].reverse()) {
          tr.delete(range.from, range.to)
        }
        return true
      })
      .run()
  }
}
