import { Mark, mergeAttributes } from "@tiptap/core"

const FIELDS = [
  "FirstName",
  "LastName",
  "Title",
  "Company",
  "Address",
  "City",
  "PostalCode",
  "Email",
  "Name",
  "Postal code",
  "Date",
] as const

export const MERGE_FIELDS = FIELDS

export const MergeField = Mark.create({
  name: "mergeField",
  inclusive: false,
  addAttributes() {
    return {
      name: {
        default: "Name",
        parseHTML: (element) => element.getAttribute("data-merge") || "Name",
        renderHTML: (attributes) => ({ "data-merge": attributes.name || "Name" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-merge]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "merge-field" }), 0]
  },
})
