import { Check, DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import { finishMerge, openHtmlAsNewDocument } from "@/document/commands"
import {
  ADDRESS_BLOCK_FIELD,
  ENVELOPE_SIZES,
  envelopeHtml,
  envelopePageSetup,
  LABEL_PRODUCTS,
  labelsHtml,
  labelsPageSetup,
} from "@/document/envelopes-labels"
import {
  activeRecords,
  FILTER_OPERATORS,
  findRecipient,
  listedRecords,
  mergeContext,
  useMailMerge,
  type FilterOperator,
  type MergeSource,
  type RecipientFilter,
  type SortOrder,
} from "@/document/mail-merge"
import {
  ADDRESS_FIELDS,
  addressBlock,
  greetingLine,
  mergeFieldName,
  type AddressField,
  type FieldMap,
} from "@/document/merge-fields"
import { missingFields, type JsonNode, type MergeRange } from "@/document/merge-output"
import {
  MergeSourceError,
  readContactsSource,
  readDelimitedSource,
  readExcelSource,
  type ExcelSheet,
  type MergeRecord,
} from "@/document/merge-sources"
import { useDocumentStore } from "@/document/store"
import { getDocumentEditor } from "@/document/editor-ref"
import { insertField } from "@/components/quick-parts-dialogs"
import { openLocalFile } from "@/lib/file-io"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { useState } from "react"
import { create } from "zustand"

/**
 * The Mailings tab's dialogs, as Word's: Envelopes and Labels, Envelope Options, Label Options, New Address List,
 * Select Table, Mail Merge Recipients (with Filter and Sort), Insert Address Block, Insert Greeting Line, Match
 * Fields, the Rules' Insert Word Field dialogs, Find Entry, Checking and Reporting Errors, and Merge to New
 * Document / Merge to Printer. Finish & Merge's Send Email Messages is left out (no mail in Inkspire).
 */

export type RuleKind = "IF" | "NEXTIF" | "SKIPIF"

type Open =
  | { kind: "envelopes-labels"; tab: "envelopes" | "labels" }
  | { kind: "envelope-options" }
  | { kind: "label-options" }
  | { kind: "new-list"; edit: boolean }
  | { kind: "select-table"; name: string; sheets: ExcelSheet[] }
  | { kind: "recipients" }
  | { kind: "address-block" }
  | { kind: "greeting-line" }
  | { kind: "match-fields" }
  | { kind: "rule"; rule: RuleKind }
  | { kind: "find" }
  | { kind: "check-errors" }
  | { kind: "merge"; then: "edit" | "print" }
  | { kind: "message"; title: string; lines: string[] }

export const useMailingsDialogs = create<{ open: Open | null; show: (open: Open | null) => void }>((set) => ({
  open: null,
  show: (open) => set({ open }),
}))

const show = (open: Open | null) => useMailingsDialogs.getState().show(open)

export function MailingsDialogs() {
  const open = useMailingsDialogs((state) => state.open)
  const close = () => show(null)
  switch (open?.kind) {
    case "envelopes-labels":
      return <EnvelopesLabelsDialog initialTab={open.tab} onClose={close} />
    case "envelope-options":
      return <EnvelopeOptionsDialog onClose={close} />
    case "label-options":
      return <LabelOptionsDialog onClose={close} />
    case "new-list":
      return <NewAddressListDialog edit={open.edit} onClose={close} />
    case "select-table":
      return <SelectTableDialog name={open.name} sheets={open.sheets} onClose={close} />
    case "recipients":
      return <RecipientsDialog onClose={close} />
    case "address-block":
      return <AddressBlockDialog onClose={close} />
    case "greeting-line":
      return <GreetingLineDialog onClose={close} />
    case "match-fields":
      return <MatchFieldsDialog onClose={close} />
    case "rule":
      return <RuleDialog rule={open.rule} onClose={close} />
    case "find":
      return <FindEntryDialog onClose={close} />
    case "check-errors":
      return <CheckErrorsDialog onClose={close} />
    case "merge":
      return <MergeRangeDialog then={open.then} onClose={close} />
    case "message":
      return <MessageDialog title={open.title} lines={open.lines} onClose={close} />
    default:
      return null
  }
}

/* ---------- Select Recipients ---------- */

const LIST_FILTERS = [
  { name: "All Data Sources", extensions: ["csv", "txt", "tsv", "xlsx", "xlsm"] },
  { name: "Excel Files", extensions: ["xlsx", "xlsm"] },
  { name: "Text Files", extensions: ["csv", "txt", "tsv"] },
]
const CONTACT_FILTERS = [{ name: "Contacts (vCard, Outlook CSV)", extensions: ["vcf", "csv"] }]

function failed(name: string, error: unknown) {
  const reason = error instanceof MergeSourceError ? error.message : "The file could not be read as a recipient list."
  show({ kind: "message", title: "Select Data Source", lines: [`Inkspire couldn't open ${name}.`, reason] })
}

/** Use an Existing List: a CSV or text file, or an Excel workbook (Select Table when it has more than one sheet). */
export async function useExistingList() {
  const file = await openLocalFile(LIST_FILTERS, "Select Data Source")
  if (!file) {
    return
  }
  try {
    if (/\.xls[xm]$/i.test(file.name)) {
      const sheets = await readExcelSource(file.bytes)
      if (!sheets.length) {
        throw new MergeSourceError("The workbook has no sheet with a header row.")
      }
      if (sheets.length > 1) {
        show({ kind: "select-table", name: file.name, sheets })
        return
      }
      useMailMerge.getState().setSource({ name: file.name, kind: "excel", sheet: sheets[0]!.name, ...sheets[0]!.table })
    } else {
      useMailMerge.getState().setSource({ name: file.name, kind: "text", ...readDelimitedSource(file.bytes) })
    }
  } catch (error) {
    failed(file.name, error)
  }
}

/** Choose from Outlook Contacts: contacts Outlook (or a phone, or a mail app) exported, as vCard or Outlook CSV. */
export async function chooseContacts() {
  const file = await openLocalFile(CONTACT_FILTERS, "Select Contacts")
  if (!file) {
    return
  }
  try {
    useMailMerge.getState().setSource({ name: file.name, kind: "contacts", ...readContactsSource(file.bytes) })
  } catch (error) {
    failed(file.name, error)
  }
}

export function startNewList() {
  show({ kind: "new-list", edit: false })
}

function SelectTableDialog({ name, sheets, onClose }: { name: string; sheets: ExcelSheet[]; onClose: () => void }) {
  const [selected, setSelected] = useState(0)
  const pick = () => {
    const sheet = sheets[selected]!
    useMailMerge.getState().setSource({ name, kind: "excel", sheet: sheet.name, ...sheet.table })
    onClose()
  }
  return (
    <DialogFrame title="Select Table" width={440} level={110} onClose={onClose} onSubmit={(event) => (event.preventDefault(), pick())}>
      <div className="word-list-box mailings-list" role="listbox" aria-label="Tables">
        <div className="mailings-row is-head">
          <span>Name</span>
          <span>Recipients</span>
        </div>
        {sheets.map((sheet, index) => (
          <div
            key={sheet.name}
            role="option"
            aria-selected={index === selected}
            className={`mailings-row${index === selected ? " is-selected" : ""}`}
            onClick={() => setSelected(index)}
            onDoubleClick={pick}
          >
            <span className="truncate">{sheet.name}$</span>
            <span>{sheet.table.records.length}</span>
          </div>
        ))}
      </div>
      <p className="mailings-note">The first row of data contains column headers.</p>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** Word's New Address List columns. */
const NEW_LIST_FIELDS = [
  "Title",
  "First Name",
  "Last Name",
  "Company Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "ZIP Code",
  "Country or Region",
  "Home Phone",
  "Work Phone",
  "E-mail Address",
]

/** Type a New List (or Edit for a list typed here): one row per entry, Word's columns. Kept with this window. */
function NewAddressListDialog({ edit, onClose }: { edit: boolean; onClose: () => void }) {
  const source = useMailMerge((state) => state.source)
  const fields = edit && source ? source.fields : NEW_LIST_FIELDS
  const [rows, setRows] = useState<MergeRecord[]>(() =>
    edit && source ? source.records.map((record) => ({ ...record })) : [Object.fromEntries(fields.map((field) => [field, ""]))],
  )
  const [current, setCurrent] = useState(0)
  const set = (row: number, field: string, value: string) =>
    setRows((list) => list.map((item, index) => (index === row ? { ...item, [field]: value } : item)))
  const save = () => {
    const records = rows.filter((row) => Object.values(row).some((value) => value.trim()))
    if (!records.length) {
      onClose()
      return
    }
    const next: MergeSource = { name: edit && source ? source.name : "Typed list", kind: "typed", fields, records }
    if (edit) {
      useMailMerge.getState().setRecipients({ source: next })
    } else {
      useMailMerge.getState().setSource(next)
    }
    onClose()
  }
  return (
    <DialogFrame title={edit ? "Edit Data Source" : "New Address List"} width={760} level={110} onClose={onClose} onSubmit={(event) => (event.preventDefault(), save())}>
      <p className="mailings-note">Type each recipient's details. To add more entries, click New Entry.</p>
      <div className="mailings-entries">
        <div className="word-list-box mailings-entry-list" role="listbox" aria-label="Entries">
          {rows.map((row, index) => (
            <div
              key={index}
              role="option"
              aria-selected={index === current}
              className={`word-list-item${index === current ? " is-selected" : ""}`}
              onClick={() => setCurrent(index)}
            >
              <span className="min-w-0 truncate">{entryName(row, fields) || `Entry ${index + 1}`}</span>
            </div>
          ))}
        </div>
        <div className="mailings-entry-form">
          {fields.map((field) => (
            <EntryField key={field} field={field} value={rows[current]?.[field] ?? ""} onChange={(value) => set(current, field, value)} />
          ))}
        </div>
      </div>
      <div className="mailings-buttons">
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            setRows((list) => [...list, Object.fromEntries(fields.map((field) => [field, ""]))])
            setCurrent(rows.length)
          }}
        >
          New Entry
        </button>
        <button
          type="button"
          className="dialog-btn"
          disabled={rows.length <= 1}
          onClick={() => {
            setRows((list) => list.filter((_, index) => index !== current))
            setCurrent((value) => Math.max(0, Math.min(value, rows.length - 2)))
          }}
        >
          Delete Entry
        </button>
        <span className="mailings-note">
          {rows.length === 1 ? "1 entry" : `${rows.length} entries`} · kept with this document window
        </span>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function entryName(row: MergeRecord, fields: string[]) {
  const named = fields.filter((field) => /name|company/i.test(field)).map((field) => row[field]?.trim()).filter(Boolean)
  return (named.length ? named : fields.map((field) => row[field]?.trim()).filter(Boolean)).slice(0, 3).join(" ")
}

function EntryField({ field, value, onChange }: { field: string; value: string; onChange: (value: string) => void }) {
  const id = `entry-${field.replace(/\W+/g, "-")}`
  return (
    <>
      <label htmlFor={id} className="truncate">
        {field}
      </label>
      <input id={id} className="word-dialog-text" value={value} onChange={(event) => onChange(event.target.value)} />
    </>
  )
}

/** Columns the recipient grid has room for; Sort and Filter still reach every column. */
const SHOWN_COLUMNS = 8

/* ---------- Edit Recipient List ---------- */

const NO_VALUE: FilterOperator[] = ["blank", "notBlank"]

function RecipientsDialog({ onClose }: { onClose: () => void }) {
  const state = useMailMerge()
  const source = state.source!
  const [included, setIncluded] = useState(state.included)
  const [sort, setSort] = useState<SortOrder | null>(state.sort)
  const [filters, setFilters] = useState<RecipientFilter[]>(state.filters)
  const [filtering, setFiltering] = useState(false)
  const order = listedRecords({ source, sort, filters })
  const shown = shownColumns(source)
  const ticked = order.filter((index) => included[index] !== false).length
  if (filtering) {
    return (
      <FilterSortDialog
        fields={source.fields}
        filters={filters}
        sort={sort}
        onClose={() => setFiltering(false)}
        onApply={(nextFilters, nextSort) => {
          setFilters(nextFilters)
          setSort(nextSort)
          setFiltering(false)
        }}
      />
    )
  }
  const toggleAll = (on: boolean) => setIncluded((list) => list.map((value, index) => (order.includes(index) ? on : value)))
  return (
    <DialogFrame
      title="Mail Merge Recipients"
      width={760}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        useMailMerge.getState().setRecipients({ included, sort, filters })
        onClose()
      }}
    >
      <p className="mailings-note">
        This is the list of recipients that will be used in your merge. Use the checkboxes to add or remove recipients
        from the merge. Click a column heading to sort the list.
      </p>
      <div className="mailings-grid is-recipients" role="grid" aria-label="Recipients">
        <table>
          <thead>
            <tr>
              <th className="mailings-check">
                <input
                  type="checkbox"
                  aria-label="Include all"
                  checked={ticked === order.length && order.length > 0}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </th>
              {shown.map((field) => (
                <th key={field} title={field}>
                  <button
                    type="button"
                    className="mailings-sort"
                    aria-sort={sort?.field === field ? (sort.descending ? "descending" : "ascending") : "none"}
                    onClick={() => setSort(sort?.field === field ? { field, descending: !sort.descending } : { field, descending: false })}
                  >
                    {field}
                    {sort?.field === field ? (sort.descending ? " ▼" : " ▲") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((index) => (
              <tr key={index}>
                <td className="mailings-check">
                  <input
                    type="checkbox"
                    aria-label={`Include record ${index + 1}`}
                    checked={included[index] !== false}
                    onChange={(event) => setIncluded((list) => list.map((value, at) => (at === index ? event.target.checked : value)))}
                  />
                </td>
                {shown.map((field) => (
                  <td key={field} title={source.records[index]![field]}>
                    {source.records[index]![field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mailings-refine">
        <div>
          <p className="text-[13px] font-semibold">Data Source</p>
          <p className="mailings-note truncate">
            {source.name}
            {source.sheet ? ` (${source.sheet})` : ""}
          </p>
          {source.kind === "typed" ? (
            <button type="button" className="dialog-btn" onClick={() => show({ kind: "new-list", edit: true })}>
              Edit…
            </button>
          ) : null}
        </div>
        <div className="mailings-refine-links">
          <p className="text-[13px] font-semibold">Refine recipient list</p>
          <button type="button" className="mailings-link" onClick={() => setFiltering(true)}>
            Sort…
          </button>
          <button type="button" className="mailings-link" onClick={() => setFiltering(true)}>
            Filter…
          </button>
          <button type="button" className="mailings-link" onClick={() => show({ kind: "find" })}>
            Find recipient…
          </button>
          <span className="mailings-note">
            {ticked} of {source.records.length} recipients
            {shown.length < source.fields.length ? ` · ${shown.length} of ${source.fields.length} columns shown` : ""}
          </span>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** The columns with something in them first (an Outlook export has dozens), as many as fit. */
function shownColumns(source: MergeSource) {
  const used = source.fields.filter((field) => source.records.some((record) => record[field]?.trim()))
  return (used.length ? used : source.fields).slice(0, SHOWN_COLUMNS)
}

/** Filter and Sort: up to six comparisons joined by And, and one sort field. */
function FilterSortDialog({
  fields,
  filters,
  sort,
  onClose,
  onApply,
}: {
  fields: string[]
  filters: RecipientFilter[]
  sort: SortOrder | null
  onClose: () => void
  onApply: (filters: RecipientFilter[], sort: SortOrder | null) => void
}) {
  const blank = (): RecipientFilter => ({ field: "", operator: "equal", value: "" })
  const [rows, setRows] = useState(() => [...filters, ...Array.from({ length: Math.max(0, 6 - filters.length) }, blank)])
  const [sortField, setSortField] = useState(sort?.field ?? "")
  const [descending, setDescending] = useState(sort?.descending ?? false)
  const update = (row: number, patch: Partial<RecipientFilter>) =>
    setRows((list) => list.map((item, index) => (index === row ? { ...item, ...patch } : item)))
  return (
    <DialogFrame
      title="Filter and Sort"
      width={620}
      level={110}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onApply(
          rows.filter((row) => row.field),
          sortField ? { field: sortField, descending } : null,
        )
      }}
    >
      <p className="text-[13px] font-semibold">Filter Records</p>
      <div className="mailings-filter">
        <span />
        <span className="mailings-note">Field:</span>
        <span className="mailings-note">Comparison:</span>
        <span className="mailings-note">Compare to:</span>
        {rows.map((row, index) => (
          <FilterRow key={index} index={index} row={row} fields={fields} update={update} disabled={index > 0 && !rows[index - 1]!.field} />
        ))}
      </div>
      <p className="mt-3 text-[13px] font-semibold">Sort Records</p>
      <div className="mailings-sort-row">
        <Label htmlFor="sort-field" text="Sort by:" letter="S" />
        <select id="sort-field" value={sortField} onChange={(event) => setSortField(event.target.value)}>
          <option value="">(none)</option>
          {fields.map((field) => (
            <option key={field}>{field}</option>
          ))}
        </select>
        <label className="word-dialog-check">
          <input type="radio" name="sort-order" checked={!descending} onChange={() => setDescending(false)} />
          <span>Ascending</span>
        </label>
        <label className="word-dialog-check">
          <input type="radio" name="sort-order" checked={descending} onChange={() => setDescending(true)} />
          <span>Descending</span>
        </label>
      </div>
      <DialogButtons submit onCancel={onClose}>
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            setRows(Array.from({ length: 6 }, blank))
            setSortField("")
          }}
        >
          Clear All
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

function FilterRow({
  index,
  row,
  fields,
  update,
  disabled,
}: {
  index: number
  row: RecipientFilter
  fields: string[]
  update: (row: number, patch: Partial<RecipientFilter>) => void
  disabled: boolean
}) {
  return (
    <>
      <span className="mailings-note">{index > 0 ? "And" : ""}</span>
      <select aria-label={`Field ${index + 1}`} disabled={disabled} value={row.field} onChange={(event) => update(index, { field: event.target.value })}>
        <option value="" />
        {fields.map((field) => (
          <option key={field}>{field}</option>
        ))}
      </select>
      <select
        aria-label={`Comparison ${index + 1}`}
        disabled={disabled || !row.field}
        value={row.operator}
        onChange={(event) => update(index, { operator: event.target.value as FilterOperator })}
      >
        {FILTER_OPERATORS.map((operator) => (
          <option key={operator.id} value={operator.id}>
            {operator.label}
          </option>
        ))}
      </select>
      <input
        aria-label={`Compare to ${index + 1}`}
        className="word-dialog-text"
        disabled={disabled || !row.field || NO_VALUE.includes(row.operator)}
        value={row.value}
        onChange={(event) => update(index, { value: event.target.value })}
      />
    </>
  )
}

/* ---------- Write & Insert Fields ---------- */

/** The record the Address Block and Greeting Line dialogs preview, with its own arrows as in Word. */
function usePreviewRecord() {
  const state = useMailMerge()
  const active = activeRecords(state)
  const [place, setPlace] = useState(Math.min(state.position, Math.max(0, active.length - 1)))
  const index = active[place]
  const record = index === undefined ? null : state.source!.records[index]!
  const navigator = active.length ? (
    <div className="mailings-preview-nav">
      <span>Preview</span>
      <span className="mailings-note">Here is a preview from your recipient list:</span>
      <button type="button" className="dialog-btn is-icon" aria-label="First" disabled={place === 0} onClick={() => setPlace(0)}>
        |◀
      </button>
      <button type="button" className="dialog-btn is-icon" aria-label="Previous" disabled={place === 0} onClick={() => setPlace(place - 1)}>
        ◀
      </button>
      <span className="tabular-nums">{place + 1}</span>
      <button type="button" className="dialog-btn is-icon" aria-label="Next" disabled={place >= active.length - 1} onClick={() => setPlace(place + 1)}>
        ▶
      </button>
      <button type="button" className="dialog-btn is-icon" aria-label="Last" disabled={place >= active.length - 1} onClick={() => setPlace(active.length - 1)}>
        ▶|
      </button>
    </div>
  ) : (
    <p className="mailings-note">Select a recipient list to see a preview.</p>
  )
  return { record, navigator, fieldMap: state.fieldMap }
}

/** The Address Block dialog's name formats, as Word lists them (with Word's own sample name). */
const NAME_FORMATS = [
  { format: "<<_FIRST0_>>", sample: "Joshua" },
  { format: "<<_FIRST0_>><< _LAST0_>>", sample: "Joshua Randall" },
  { format: "<<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>", sample: "Joshua Randall Jr." },
  { format: "<<_FIRST0_>><< _MIDDLE0_>><< _LAST0_>><< _SUFFIX0_>>", sample: "Joshua Q. Randall Jr." },
  { format: "<<_TITLE0_ >><<_LAST0_>>", sample: "Mr. Randall" },
  { format: "<<_TITLE0_ >><<_LAST0_>><< _SUFFIX0_>>", sample: "Mr. Randall Jr." },
  { format: "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>>", sample: "Mr. Joshua Randall" },
  { format: "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>", sample: "Mr. Joshua Randall Jr." },
  { format: "<<_TITLE0_ >><<_FIRST0_>><< _MIDDLE0_>><< _LAST0_>><< _SUFFIX0_>>", sample: "Mr. Joshua Q. Randall Jr." },
]

function quote(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * The Address Block's field code, in Word's own format text: each line's break sits inside the chevrons of the line
 * it ends ("<<_COMPANY_\n>>"), so a line with nothing in it drops out.
 */
export function addressBlockCode(options: { name: string; company: boolean; postal: boolean; country: 0 | 1 | 2; except: string }) {
  let format = options.name ? `${options.name}\n` : ""
  if (options.company) {
    format += "<<_COMPANY_\n>>"
  }
  if (options.postal) {
    format += "<<_STREET1_\n>><<_STREET2_\n>><<_CITY_>><<, _STATE_>><< _POSTAL_>><<\n_COUNTRY_>>"
  }
  const code = `ADDRESSBLOCK \\f "${quote(format)}" \\l 1033 \\c ${options.country}`
  return options.country === 2 && options.except.trim() ? `${code} \\e "${quote(options.except.trim())}"` : code
}

function AddressBlockDialog({ onClose }: { onClose: () => void }) {
  const preview = usePreviewRecord()
  const [name, setName] = useState(NAME_FORMATS[7]!.format)
  const [useName, setUseName] = useState(true)
  const [company, setCompany] = useState(true)
  const [postal, setPostal] = useState(true)
  const [country, setCountry] = useState<0 | 1 | 2>(2)
  const [except, setExcept] = useState("United States")
  const code = addressBlockCode({ name: useName ? name : "", company, postal, country, except })
  const lines = preview.record ? addressBlock(code, preview.record, preview.fieldMap) : ""
  return (
    <DialogFrame
      title="Insert Address Block"
      width={680}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const editor = getDocumentEditor()
        if (editor) {
          insertField(editor, code)
        }
        onClose()
      }}
    >
      <div className="mailings-two">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Specify address elements</p>
          <Check id="ab-name" text="Insert recipient's name in this format:" letter="r" checked={useName} onChange={setUseName} />
          <div className="word-list-box mailings-formats" role="listbox" aria-label="Name format">
            {NAME_FORMATS.map((item) => (
              <div
                key={item.format}
                role="option"
                aria-selected={item.format === name}
                aria-disabled={!useName}
                className={`word-list-item${item.format === name ? " is-selected" : ""}`}
                onClick={() => useName && setName(item.format)}
              >
                {item.sample}
              </div>
            ))}
          </div>
          <Check id="ab-company" text="Insert company name" letter="I" checked={company} onChange={setCompany} />
          <Check id="ab-postal" text="Insert postal address:" letter="p" checked={postal} onChange={setPostal} />
          <div className="mailings-indent" role="radiogroup" aria-label="Country or region">
            {(
              [
                [0, "Never include the country/region in the address"],
                [1, "Always include the country/region in the address"],
                [2, "Only include the country/region if different than:"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className={`word-dialog-check${postal ? "" : " is-disabled"}`}>
                <input type="radio" name="ab-country" disabled={!postal} checked={country === value} onChange={() => setCountry(value)} />
                <span>{text}</span>
              </label>
            ))}
            <input
              aria-label="Country or region left out"
              className="word-dialog-text mailings-indented"
              disabled={!postal || country !== 2}
              value={except}
              onChange={(event) => setExcept(event.target.value)}
            />
          </div>
        </div>
        <div className="min-w-0">
          {preview.navigator}
          <div className="mailings-preview" aria-label="Address preview">
            {preview.record ? lines || " " : "«AddressBlock»"}
          </div>
          <p className="mt-2 text-[13px] font-semibold">Correct Problems</p>
          <p className="mailings-note">
            If items in your address block are missing or out of order, use Match Fields to identify the correct
            address elements from your mailing list.
          </p>
          <button type="button" className="dialog-btn" onClick={() => show({ kind: "match-fields" })}>
            Match Fields…
          </button>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

const GREETING_NAMES = [
  { format: "<<_TITLE0_ >><<_LAST0_>>", sample: "Mr. Randall" },
  { format: "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>>", sample: "Mr. Joshua Randall" },
  { format: "<<_TITLE0_ >><<_FIRST0_>><< _LAST0_>><< _SUFFIX0_>>", sample: "Mr. Joshua Randall Jr." },
  { format: "<<_FIRST0_>>", sample: "Joshua" },
  { format: "<<_FIRST0_>><< _LAST0_>>", sample: "Joshua Randall" },
  { format: "<<_NICK0_>>", sample: "Josh" },
]

export function greetingLineCode(before: string, name: string, after: string, invalid: string) {
  return `GREETINGLINE \\f "<<_BEFORE_ ${quote(before)}${before ? " " : ""}>>${name}<<_AFTER_ ${quote(after)}>>" \\l 1033 \\e "${quote(invalid)}"`
}

function GreetingLineDialog({ onClose }: { onClose: () => void }) {
  const preview = usePreviewRecord()
  const [before, setBefore] = useState("Dear")
  const [name, setName] = useState(GREETING_NAMES[0]!.format)
  const [after, setAfter] = useState(",")
  const [invalid, setInvalid] = useState("Dear Sir or Madam,")
  const code = greetingLineCode(before, name, after, invalid)
  return (
    <DialogFrame
      title="Insert Greeting Line"
      width={560}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const editor = getDocumentEditor()
        if (editor) {
          insertField(editor, code)
        }
        onClose()
      }}
    >
      <p className="text-[13px] font-semibold">Greeting line format:</p>
      <div className="mailings-greeting">
        <select aria-label="Salutation" value={before} onChange={(event) => setBefore(event.target.value)}>
          <option value="Dear">Dear</option>
          <option value="To">To</option>
          <option value="">(none)</option>
        </select>
        <select aria-label="Name format" value={name} onChange={(event) => setName(event.target.value)}>
          {GREETING_NAMES.map((item) => (
            <option key={item.format} value={item.format}>
              {item.sample}
            </option>
          ))}
        </select>
        <select aria-label="Punctuation" value={after} onChange={(event) => setAfter(event.target.value)}>
          <option value=",">,</option>
          <option value=":">:</option>
          <option value="">(none)</option>
        </select>
      </div>
      <Label htmlFor="gl-invalid" text="Greeting line for invalid recipient names:" letter="G" />
      <select id="gl-invalid" className="mailings-wide" value={invalid} onChange={(event) => setInvalid(event.target.value)}>
        <option>Dear Sir or Madam,</option>
        <option>To Whom It May Concern:</option>
        <option>(none)</option>
      </select>
      <div className="mt-3">{preview.navigator}</div>
      <div className="mailings-preview" aria-label="Greeting preview">
        {preview.record ? greetingLine(code, preview.record, preview.fieldMap) : "«GreetingLine»"}
      </div>
      <button type="button" className="dialog-btn mt-2" onClick={() => show({ kind: "match-fields" })}>
        Match Fields…
      </button>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function MatchFieldsDialog({ onClose }: { onClose: () => void }) {
  const state = useMailMerge()
  const fields = state.source?.fields ?? []
  const [map, setMap] = useState<FieldMap>(state.fieldMap)
  return (
    <DialogFrame
      title="Match Fields"
      width={520}
      level={120}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        useMailMerge.getState().setFieldMap(map)
        onClose()
      }}
    >
      <p className="mailings-note">
        In order to use special features, Mail Merge needs to know which fields in your recipient list match to the
        required fields. Use the drop-down list to select the appropriate recipient list field for each address field
        component.
      </p>
      <div className="mailings-match">
        <span className="mailings-note">Required for Address Block</span>
        <span />
        {ADDRESS_FIELDS.map((field: AddressField) => (
          <MatchRow key={field} field={field} value={map[field]} fields={fields} onChange={(value) => setMap({ ...map, [field]: value })} />
        ))}
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function MatchRow({ field, value, fields, onChange }: { field: string; value: string | null; fields: string[]; onChange: (value: string | null) => void }) {
  const id = `match-${field.replace(/\W+/g, "-")}`
  return (
    <>
      <label htmlFor={id}>{field}</label>
      <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">(not matched)</option>
        {fields.map((column) => (
          <option key={column}>{column}</option>
        ))}
      </select>
    </>
  )
}

/* ---------- Rules ---------- */

const RULE_OPERATORS = [
  { id: "=", label: "Equal to" },
  { id: "<>", label: "Not equal to" },
  { id: "<", label: "Less than" },
  { id: ">", label: "Greater than" },
  { id: "<=", label: "Less than or equal" },
  { id: ">=", label: "Greater than or equal" },
  { id: "blank", label: "Is blank" },
  { id: "notblank", label: "Is not blank" },
]

export function ruleCode(rule: RuleKind, field: string, operator: string, value: string, then = "", otherwise = "") {
  const blank = operator === "blank" || operator === "notblank"
  const comparison = `{ MERGEFIELD ${mergeFieldName(field)} } ${blank ? (operator === "blank" ? "=" : "<>") : operator} "${quote(blank ? "" : value)}"`
  return rule === "IF" ? `IF ${comparison} "${quote(then)}" "${quote(otherwise)}"` : `${rule} ${comparison}`
}

const RULE_TITLES: Record<RuleKind, string> = {
  IF: "Insert Word Field: IF",
  NEXTIF: "Insert Word Field: Next Record If",
  SKIPIF: "Insert Word Field: Skip Record If",
}

function RuleDialog({ rule, onClose }: { rule: RuleKind; onClose: () => void }) {
  const fields = useMailMerge((state) => state.source?.fields ?? [...ADDRESS_FIELDS])
  const [field, setField] = useState(fields[0] ?? "")
  const [operator, setOperator] = useState("=")
  const [value, setValue] = useState("")
  const [then, setThen] = useState("")
  const [otherwise, setOtherwise] = useState("")
  const blank = operator === "blank" || operator === "notblank"
  return (
    <DialogFrame
      title={RULE_TITLES[rule]}
      width={520}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const editor = getDocumentEditor()
        if (editor && field) {
          insertField(editor, ruleCode(rule, field, operator, value, then, otherwise))
        }
        onClose()
      }}
    >
      <p className="text-[13px]">{rule === "IF" ? "IF" : rule === "NEXTIF" ? "Next Record If" : "Skip Record If"}</p>
      <div className="mailings-rule">
        <Label htmlFor="rule-field" text="Field name:" letter="F" />
        <Label htmlFor="rule-operator" text="Comparison:" letter="C" />
        <Label htmlFor="rule-value" text="Compare to:" letter="T" />
        <select id="rule-field" value={field} onChange={(event) => setField(event.target.value)}>
          {fields.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select id="rule-operator" value={operator} onChange={(event) => setOperator(event.target.value)}>
          {RULE_OPERATORS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <input id="rule-value" className="word-dialog-text" disabled={blank} value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      {rule === "IF" ? (
        <>
          <Label htmlFor="rule-then" text="Insert this text:" letter="I" />
          <textarea id="rule-then" className="word-dialog-text mailings-textarea" value={then} onChange={(event) => setThen(event.target.value)} />
          <Label htmlFor="rule-else" text="Otherwise insert this text:" letter="O" />
          <textarea id="rule-else" className="word-dialog-text mailings-textarea" value={otherwise} onChange={(event) => setOtherwise(event.target.value)} />
        </>
      ) : null}
      <DialogButtons submit okDisabled={!field} onCancel={onClose} />
    </DialogFrame>
  )
}

/* ---------- Preview Results ---------- */

function FindEntryDialog({ onClose }: { onClose: () => void }) {
  const fields = useMailMerge((state) => state.source?.fields ?? [])
  const [text, setText] = useState("")
  const [field, setField] = useState<string | null>(null)
  const [missed, setMissed] = useState(false)
  return (
    <DialogFrame
      title="Find Entry"
      width={420}
      level={120}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const state = useMailMerge.getState()
        const place = findRecipient(text, field, state.position)
        setMissed(place < 0)
        if (place >= 0) {
          state.setPreview(true)
          state.go(place)
        }
      }}
    >
      <Label htmlFor="find-text" text="Find:" letter="n" />
      <input id="find-text" className="word-dialog-text mailings-wide" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      <p className="mt-2 text-[13px]">Look in:</p>
      <label className="word-dialog-check">
        <input type="radio" name="find-in" checked={field === null} onChange={() => setField(null)} />
        <span>All fields</span>
      </label>
      <div className="mailings-find-field">
        <label className="word-dialog-check">
          <input type="radio" name="find-in" checked={field !== null} onChange={() => setField(fields[0] ?? null)} />
          <span>This field:</span>
        </label>
        <select aria-label="Field" disabled={field === null} value={field ?? ""} onChange={(event) => setField(event.target.value)}>
          {fields.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {missed ? <p className="mailings-note mt-2">Inkspire has finished searching the recipient list. The item was not found.</p> : null}
      <DialogButtons submit ok="Find Next" cancel="Close" okDisabled={!text.trim()} onCancel={onClose} />
    </DialogFrame>
  )
}

function mainDocumentJson() {
  const editor = getDocumentEditor()
  return editor ? (editor.getJSON() as JsonNode) : { type: "doc" }
}

/** Check for Errors: simulate the merge and report errors, or merge and report them (Word's three choices). */
function CheckErrorsDialog({ onClose }: { onClose: () => void }) {
  const [choice, setChoice] = useState<"simulate" | "pause" | "complete">("simulate")
  return (
    <DialogFrame
      title="Checking and Reporting Errors"
      width={480}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const state = useMailMerge.getState()
        const missing = missingFields(mainDocumentJson(), state.source?.fields ?? [], state.fieldMap)
        const name = useDocumentStore.getState().fileName || "the main document"
        if (missing.length) {
          show({
            kind: "message",
            title: "Invalid Merge Field",
            lines: [
              "This merge field is used in the main document, but it does not exist in the data source:",
              ...missing.map((item) => `${item.name}${item.count > 1 ? ` (used ${item.count} times)` : ""}`),
              "Remove the field from the main document, or use Match Fields to match it to a field in the data source.",
            ],
          })
          return
        }
        if (choice === "simulate") {
          show({ kind: "message", title: "Checking and Reporting Errors", lines: [`No mail merge errors have been found in ${name}.`] })
          return
        }
        onClose()
        void finishMerge({ kind: "all" }, "edit")
      }}
    >
      <div role="radiogroup" aria-label="Error checking">
        {(
          [
            ["pause", "Complete the merge, pausing to report each error as it occurs."],
            ["complete", "Complete the merge without pausing. Report errors in a new document."],
            ["simulate", "Simulate the merge and report errors in a new document."],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="word-dialog-check mailings-choice">
            <input type="radio" name="check-errors" checked={choice === value} onChange={() => setChoice(value)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/* ---------- Finish & Merge ---------- */

function MergeRangeDialog({ then, onClose }: { then: "edit" | "print"; onClose: () => void }) {
  const count = activeRecords(useMailMerge.getState()).length
  const [kind, setKind] = useState<MergeRange["kind"]>("all")
  const [from, setFrom] = useState("1")
  const [to, setTo] = useState(String(count))
  const range: MergeRange = kind === "range" ? { kind, from: Number(from) || 1, to: Number(to) || count } : { kind }
  return (
    <DialogFrame
      title={then === "edit" ? "Merge to New Document" : "Merge to Printer"}
      width={360}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onClose()
        void finishMerge(range, then)
      }}
    >
      <p className="text-[13px] font-semibold">Merge records</p>
      <div role="radiogroup" aria-label="Merge records" className="mailings-range">
        <label className="word-dialog-check">
          <input type="radio" name="merge-range" checked={kind === "all"} onChange={() => setKind("all")} />
          <span>All</span>
        </label>
        <label className="word-dialog-check">
          <input type="radio" name="merge-range" checked={kind === "current"} onChange={() => setKind("current")} />
          <span>Current record</span>
        </label>
        <div className="mailings-range-row">
          <label className="word-dialog-check">
            <input type="radio" name="merge-range" checked={kind === "range"} onChange={() => setKind("range")} />
            <span>From:</span>
          </label>
          <input aria-label="From" className="word-dialog-text" inputMode="numeric" value={from} onFocus={() => setKind("range")} onChange={(event) => setFrom(event.target.value)} />
          <span>To:</span>
          <input aria-label="To" className="word-dialog-text" inputMode="numeric" value={to} onFocus={() => setKind("range")} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>
      <DialogButtons submit okDisabled={!count} onCancel={onClose} />
    </DialogFrame>
  )
}

function MessageDialog({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  return (
    <DialogFrame title={title} width={420} level={130} onClose={onClose} onSubmit={(event) => (event.preventDefault(), onClose())}>
      {lines.map((line, index) => (
        <p key={index} className="mailings-message">
          {line}
        </p>
      ))}
      <DialogButtons submit cancel="Close" onCancel={onClose} />
    </DialogFrame>
  )
}

/* ---------- Create, and Start Mail Merge's Envelopes and Labels ---------- */

/** The address the Envelopes and Labels dialog starts with: the selected text, as Word takes it. */
function selectedText() {
  const editor = getDocumentEditor()
  if (!editor || editor.state.selection.empty) {
    return ""
  }
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, "\n").trim()
}

function EnvelopesLabelsDialog({ initialTab, onClose }: { initialTab: "envelopes" | "labels"; onClose: () => void }) {
  const [tab, setTab] = useState(initialTab)
  const [delivery, setDelivery] = useState(selectedText)
  const [returnAddress, setReturnAddress] = useState("")
  const [omit, setOmit] = useState(false)
  const [size, setSize] = useState(ENVELOPE_SIZES[0]!.id)
  const [labelText, setLabelText] = useState(selectedText)
  const [product, setProduct] = useState(LABEL_PRODUCTS[0]!.id)
  const [single, setSingle] = useState(false)
  const [row, setRow] = useState("1")
  const [column, setColumn] = useState("1")
  const envelope = ENVELOPE_SIZES.find((item) => item.id === size)!
  const sheet = LABEL_PRODUCTS.find((item) => item.id === product)!
  const make = (print: boolean) => {
    if (tab === "envelopes") {
      void openHtmlAsNewDocument(envelopeHtml(envelope, delivery, omit ? null : returnAddress), envelopePageSetup(envelope), print)
    } else {
      const at = single ? { row: Math.min(sheet.rows, Number(row) || 1), column: Math.min(sheet.columns, Number(column) || 1) } : undefined
      void openHtmlAsNewDocument(labelsHtml(sheet, { text: labelText }, at), labelsPageSetup(sheet), print)
    }
    onClose()
  }
  return (
    <DialogFrame
      title="Envelopes and Labels"
      width={600}
      level={100}
      tabs={[
        { id: "envelopes", label: "Envelopes" },
        { id: "labels", label: "Labels" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as "envelopes" | "labels")}
      onClose={onClose}
    >
      {tab === "envelopes" ? (
        <div className="mailings-envelope">
          <Label htmlFor="env-delivery" text="Delivery address:" letter="D" />
          <textarea id="env-delivery" className="word-dialog-text mailings-address" value={delivery} onChange={(event) => setDelivery(event.target.value)} />
          <div className="mailings-return">
            <Label htmlFor="env-return" text="Return address:" letter="R" />
            <Check id="env-omit" text="Omit" letter="m" checked={omit} onChange={setOmit} />
          </div>
          <textarea id="env-return" className="word-dialog-text mailings-address" disabled={omit} value={returnAddress} onChange={(event) => setReturnAddress(event.target.value)} />
          <div className="mailings-size">
            <Label htmlFor="env-size" text="Envelope size:" letter="s" />
            <select id="env-size" value={size} onChange={(event) => setSize(event.target.value)}>
              {ENVELOPE_SIZES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="mailings-envelope">
          <Label htmlFor="label-address" text="Address:" letter="A" />
          <textarea id="label-address" className="word-dialog-text mailings-address" value={labelText} onChange={(event) => setLabelText(event.target.value)} />
          <div className="mailings-two">
            <div role="radiogroup" aria-label="Print">
              <p className="text-[13px]">Print</p>
              <label className="word-dialog-check">
                <input type="radio" name="label-print" checked={!single} onChange={() => setSingle(false)} />
                <span>Full page of the same label</span>
              </label>
              <label className="word-dialog-check">
                <input type="radio" name="label-print" checked={single} onChange={() => setSingle(true)} />
                <span>Single label</span>
              </label>
              <div className="mailings-range-row mailings-label-at">
                <span>Row:</span>
                <input aria-label="Row" className="word-dialog-text" disabled={!single} value={row} onChange={(event) => setRow(event.target.value)} />
                <span>Column:</span>
                <input aria-label="Column" className="word-dialog-text" disabled={!single} value={column} onChange={(event) => setColumn(event.target.value)} />
              </div>
            </div>
            <div className="min-w-0">
              <Label htmlFor="label-product" text="Label:" letter="L" />
              <select id="label-product" className="mailings-wide" value={product} onChange={(event) => setProduct(event.target.value)}>
                {LABEL_PRODUCTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.vendor}, {item.number} {item.type}
                  </option>
                ))}
              </select>
              <p className="mailings-note">
                {sheet.type}: {trim(sheet.height / 10)} cm x {trim(sheet.width / 10)} cm, {sheet.columns * sheet.rows} per page
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={() => make(true)}>
          Print…
        </button>
        <button type="button" className="dialog-btn is-primary" onClick={() => make(false)}>
          New Document
        </button>
        <span className="flex-1" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </DialogFrame>
  )
}

function trim(value: number) {
  return String(Math.round(value * 100) / 100)
}

/** Start Mail Merge > Envelopes…: the document becomes an envelope of the size chosen, with an Address Block. */
function EnvelopeOptionsDialog({ onClose }: { onClose: () => void }) {
  const [size, setSize] = useState(ENVELOPE_SIZES[0]!.id)
  return (
    <DialogFrame
      title="Envelope Options"
      width={420}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const envelope = ENVELOPE_SIZES.find((item) => item.id === size)!
        replaceMainDocument(envelopeHtml(envelope, "", "", `<p>${ADDRESS_BLOCK_FIELD}</p>`), envelopePageSetup(envelope))
        useMailMerge.getState().setType("envelopes")
        onClose()
      }}
    >
      <Label htmlFor="opt-env-size" text="Envelope size:" letter="s" />
      <select id="opt-env-size" className="mailings-wide" value={size} onChange={(event) => setSize(event.target.value)}>
        {ENVELOPE_SIZES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <p className="mailings-note mt-2">The document's page becomes the envelope, with an Address Block where the delivery address goes.</p>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** Start Mail Merge > Labels…: the document becomes a sheet of labels, each after the first starting with «Next Record». */
function LabelOptionsDialog({ onClose }: { onClose: () => void }) {
  const [product, setProduct] = useState(LABEL_PRODUCTS[0]!.id)
  const sheet = LABEL_PRODUCTS.find((item) => item.id === product)!
  return (
    <DialogFrame
      title="Label Options"
      width={480}
      level={100}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        replaceMainDocument(labelsHtml(sheet, { merge: "" }), labelsPageSetup(sheet))
        useMailMerge.getState().setType("labels")
        onClose()
      }}
    >
      <div className="word-list-box mailings-formats" role="listbox" aria-label="Product number">
        {LABEL_PRODUCTS.map((item) => (
          <div
            key={item.id}
            role="option"
            aria-selected={item.id === product}
            className={`word-list-item${item.id === product ? " is-selected" : ""}`}
            onClick={() => setProduct(item.id)}
          >
            {item.vendor} {item.number} – {item.type}
          </div>
        ))}
      </div>
      <p className="mailings-note mt-2">
        {sheet.type}: {trim(sheet.height / 10)} cm x {trim(sheet.width / 10)} cm, {sheet.columns} x {sheet.rows} per page.
        The document's content is replaced by the sheet of labels.
      </p>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

function replaceMainDocument(html: string, pageSetup: ReturnType<typeof envelopePageSetup>) {
  const editor = getDocumentEditor()
  if (!editor) {
    return
  }
  useDocumentStore.getState().setPageSetup(pageSetup)
  editor.chain().focus().setContent(html).run()
}

/** Update Labels: the first label's content in every other label, after its «Next Record». */
export function updateLabels() {
  const editor = getDocumentEditor()
  if (!editor) {
    return false
  }
  const { state } = editor
  let table: { node: ProseNode; pos: number } | null = null
  state.doc.descendants((node, pos) => {
    if (table) {
      return false
    }
    if (node.type.name === "table") {
      table = { node, pos }
      return false
    }
    return true
  })
  const found = table as { node: ProseNode; pos: number } | null
  const firstCell = found?.node.firstChild?.firstChild
  if (!found || !firstCell) {
    return false
  }
  const width = JSON.stringify(firstCell.attrs.colwidth)
  const next = state.schema.nodes.wordField!.create({ instr: "NEXT", result: "«Next Record»" })
  const cells: number[] = []
  found.node.descendants((node, offset) => {
    if (/cell/i.test(node.type.name)) {
      if (offset > 1 && JSON.stringify(node.attrs.colwidth) === width) {
        cells.push(found.pos + 1 + offset)
      }
      return false
    }
    return true
  })
  let tr = state.tr
  for (const pos of cells.reverse()) {
    const cell = tr.doc.nodeAt(pos)
    if (!cell) {
      continue
    }
    const content: ProseNode[] = []
    firstCell.content.forEach((block, _offset, index) => {
      content.push(index === 0 ? block.type.create(block.attrs, [next, ...childrenOf(block)], block.marks) : block)
    })
    tr = tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, content)
  }
  editor.view.dispatch(tr)
  return true
}

function childrenOf(node: ProseNode) {
  const list: ProseNode[] = []
  node.content.forEach((child) => {
    if (!(child.type.name === "wordField" && /^\s*NEXT\s*$/i.test(String(child.attrs.instr)))) {
      list.push(child)
    }
  })
  return list
}

export { mergeContext }
