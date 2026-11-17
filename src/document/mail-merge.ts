import { create } from "zustand"
import { autoMatch, fieldValue, type FieldMap, type MergeContext } from "@/document/merge-fields"
import type { MergeRecord, MergeSourceKind } from "@/document/merge-sources"

/**
 * Mailings: the kind of main document, the recipient list and which recipients take part (Edit Recipient List's
 * checkboxes, sort and filter), Match Fields, Preview Results and the record shown, and Highlight Merge Fields.
 * Kept for this window while the document is open; the document itself keeps only its merge fields.
 */

export type MainDocumentType = "normal" | "letters" | "envelopes" | "labels" | "directory"

export type FilterOperator =
  | "equal"
  | "notEqual"
  | "less"
  | "greater"
  | "lessOrEqual"
  | "greaterOrEqual"
  | "blank"
  | "notBlank"
  | "contains"
  | "notContains"

export const FILTER_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: "equal", label: "Equal to" },
  { id: "notEqual", label: "Not equal to" },
  { id: "less", label: "Less than" },
  { id: "greater", label: "Greater than" },
  { id: "lessOrEqual", label: "Less than or equal" },
  { id: "greaterOrEqual", label: "Greater than or equal" },
  { id: "blank", label: "Is blank" },
  { id: "notBlank", label: "Is not blank" },
  { id: "contains", label: "Contains" },
  { id: "notContains", label: "Does not contain" },
]

export type RecipientFilter = { field: string; operator: FilterOperator; value: string }

export type MergeSource = {
  /** The file's name (Data Source in Edit Recipient List), or the name a typed list was saved as. */
  name: string
  kind: MergeSourceKind
  fields: string[]
  records: MergeRecord[]
  /** An Excel workbook's sheet. */
  sheet?: string
}

export type SortOrder = { field: string; descending: boolean }

type State = {
  type: MainDocumentType
  source: MergeSource | null
  /** Per record of the source: ticked in Edit Recipient List. */
  included: boolean[]
  sort: SortOrder | null
  filters: RecipientFilter[]
  fieldMap: FieldMap
  preview: boolean
  /** The record Preview Results shows, as a place among the recipients taking part (0 is the first). */
  position: number
  highlight: boolean
  setType: (type: MainDocumentType) => void
  setSource: (source: MergeSource | null) => void
  /** Edit Recipient List's OK: the list (a typed list may have changed), the ticks, the sort and the filter. */
  setRecipients: (patch: Partial<Pick<State, "source" | "included" | "sort" | "filters">>) => void
  setFieldMap: (fieldMap: FieldMap) => void
  setPreview: (preview: boolean) => void
  go: (position: number) => void
  setHighlight: (highlight: boolean) => void
}

export const useMailMerge = create<State>((set, get) => ({
  type: "normal",
  source: null,
  included: [],
  sort: null,
  filters: [],
  fieldMap: autoMatch([]),
  preview: false,
  position: 0,
  highlight: false,
  setType: (type) => set({ type }),
  setSource: (source) =>
    set({
      source,
      included: source ? source.records.map(() => true) : [],
      sort: null,
      filters: [],
      fieldMap: autoMatch(source?.fields ?? []),
      position: 0,
      // Word turns Preview Results on once there is a list to preview.
      preview: Boolean(source?.records.length),
    }),
  setRecipients: (patch) => {
    const source = patch.source ?? get().source
    const included = (patch.included ?? get().included).slice(0, source?.records.length ?? 0)
    while (source && included.length < source.records.length) {
      included.push(true)
    }
    set({ ...patch, included, fieldMap: patch.source ? { ...autoMatch(patch.source.fields), ...keptMatches(get().fieldMap, patch.source.fields) } : get().fieldMap })
    get().go(get().position)
  },
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setPreview: (preview) => set({ preview: preview && Boolean(get().source) }),
  go: (position) => {
    const count = activeRecords(get()).length
    set({ position: Math.max(0, Math.min(position, count - 1)) })
  },
  setHighlight: (highlight) => set({ highlight }),
}))

// Highlight Merge Fields shades the fields on the page (index.css).
if (typeof document !== "undefined") {
  useMailMerge.subscribe((state, previous) => {
    if (state.highlight !== previous.highlight) {
      document.documentElement.toggleAttribute("data-highlight-merge", state.highlight)
    }
  })
}

/** Matches made by hand that still name a column of the new list. */
function keptMatches(fieldMap: FieldMap, fields: string[]) {
  return Object.fromEntries(Object.entries(fieldMap).filter(([, column]) => column && fields.includes(column)))
}

function matches(record: MergeRecord, filter: RecipientFilter) {
  const value = (record[filter.field] ?? "").trim()
  const wanted = filter.value.trim()
  const numeric = value !== "" && wanted !== "" && !Number.isNaN(Number(value)) && !Number.isNaN(Number(wanted))
  const order = numeric ? Number(value) - Number(wanted) : value.localeCompare(wanted, undefined, { sensitivity: "base" })
  switch (filter.operator) {
    case "equal":
      return order === 0
    case "notEqual":
      return order !== 0
    case "less":
      return order < 0
    case "greater":
      return order > 0
    case "lessOrEqual":
      return order <= 0
    case "greaterOrEqual":
      return order >= 0
    case "blank":
      return value === ""
    case "notBlank":
      return value !== ""
    case "contains":
      return value.toLowerCase().includes(wanted.toLowerCase())
    case "notContains":
      return !value.toLowerCase().includes(wanted.toLowerCase())
  }
}

/** Records in the order the list shows them: sorted, then those the filter keeps. */
export function listedRecords(state: Pick<State, "source" | "sort" | "filters">) {
  const records = state.source?.records ?? []
  const order = records.map((_, index) => index)
  if (state.sort) {
    const { field, descending } = state.sort
    order.sort((a, b) => {
      const left = records[a]![field] ?? ""
      const right = records[b]![field] ?? ""
      const numeric = left !== "" && right !== "" && !Number.isNaN(Number(left)) && !Number.isNaN(Number(right))
      const result = numeric ? Number(left) - Number(right) : left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })
      return descending ? -result : result
    })
  }
  return order.filter((index) => state.filters.every((filter) => matches(records[index]!, filter)))
}

/** The records that take part in the merge, by their index in the source: listed and ticked. */
export function activeRecords(state: Pick<State, "source" | "sort" | "filters" | "included">) {
  return listedRecords(state).filter((index) => state.included[index] !== false)
}

/**
 * The merge as fields read it, starting from a place among the active records: Preview Results' record, or each
 * record in turn when merging. NEXT moves along the same list.
 */
export function mergeContext(
  state: Pick<State, "source" | "sort" | "filters" | "included" | "fieldMap">,
  start: number,
  active = activeRecords(state),
): MergeContext & { at: () => number } {
  let at = start
  const records = state.source?.records ?? []
  return {
    current: () => {
      const index = active[at]
      return index === undefined ? null : { record: records[index]!, number: index + 1 }
    },
    sequence: () => at + 1,
    next: () => {
      at += 1
    },
    at: () => at,
    fieldMap: state.fieldMap,
  }
}

/** The record Preview Results shows, or null when it is off or there is no list. */
export function previewContext() {
  const state = useMailMerge.getState()
  if (!state.preview || !state.source) {
    return null
  }
  return mergeContext(state, state.position)
}

/** Find Recipient: the next active record from `after` with the text in a field (or any field). */
export function findRecipient(text: string, field: string | null, after: number) {
  const state = useMailMerge.getState()
  const active = activeRecords(state)
  const records = state.source?.records ?? []
  const wanted = text.trim().toLowerCase()
  if (!wanted) {
    return -1
  }
  for (let step = 1; step <= active.length; step += 1) {
    const place = (after + step) % active.length
    const record = records[active[place]!]!
    const values = field ? [record[field] ?? ""] : Object.values(record)
    if (values.some((value) => value.toLowerCase().includes(wanted))) {
      return place
    }
  }
  return -1
}

/** A merge field's value for the record shown, for Check for Errors and the tests. */
export function previewValue(name: string) {
  const context = previewContext()
  const now = context?.current()
  return now ? fieldValue(now.record, name, context!.fieldMap) : null
}
