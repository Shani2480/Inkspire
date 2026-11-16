import {
  chooseContacts,
  startNewList,
  updateLabels,
  useExistingList,
  useMailingsDialogs,
  type RuleKind,
} from "@/components/mailings-dialogs"
import { insertField } from "@/components/quick-parts-dialogs"
import { MenuButton, RibbonButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { RibbonSvg } from "@/components/ribbon/icons"
import { SingleLineBar, type LineCommand } from "@/components/ribbon/single-line"
import { MenuSeparator } from "@/components/shape-menus"
import { activeRecords, useMailMerge, type MainDocumentType } from "@/document/mail-merge"
import { ADDRESS_FIELDS, mergeFieldName } from "@/document/merge-fields"
import { useViewStore } from "@/document/view"
import { getDocumentEditor } from "@/document/editor-ref"
import { useDocumentEditor } from "@/editor/document-editor"
import { useState, type ReactNode } from "react"

/**
 * Word's Mailings tab: Create (Envelopes, Labels), Start Mail Merge, Write & Insert Fields, Preview Results and
 * Finish. Recipient lists are CSV and text files, Excel workbooks, contacts exported from Outlook (vCard or CSV),
 * or a list typed here. Finish & Merge edits the merged documents or prints them; Send Email Messages is left out.
 */

const show = (open: Parameters<ReturnType<typeof useMailingsDialogs.getState>["show"]>[0]) =>
  useMailingsDialogs.getState().show(open)

const START_TYPES: { id: MainDocumentType; label: string; description: string }[] = [
  { id: "letters", label: "Letters", description: "Each recipient gets a letter of their own." },
  { id: "envelopes", label: "Envelopes…", description: "Address envelopes to the recipients." },
  { id: "labels", label: "Labels…", description: "Make a sheet of address labels." },
  { id: "directory", label: "Directory", description: "List every recipient one after another, in one document." },
  { id: "normal", label: "Normal Word Document", description: "Stop the mail merge: this is an ordinary document." },
]

function startMerge(type: MainDocumentType) {
  if (type === "envelopes") {
    show({ kind: "envelope-options" })
  } else if (type === "labels") {
    show({ kind: "label-options" })
  } else {
    useMailMerge.getState().setType(type)
  }
}

const RULES: { label: string; run: () => void }[] = [
  { label: "If…Then…Else…", run: () => rule("IF") },
  { label: "Merge Record #", run: () => insertCode("MERGEREC") },
  { label: "Merge Sequence #", run: () => insertCode("MERGESEQ") },
  { label: "Next Record", run: () => insertCode("NEXT") },
  { label: "Next Record If…", run: () => rule("NEXTIF") },
  { label: "Skip Record If…", run: () => rule("SKIPIF") },
]

function rule(kind: RuleKind) {
  show({ kind: "rule", rule: kind })
}

function insertCode(code: string) {
  const editor = getDocumentEditor()
  if (editor) {
    insertField(editor, code)
  }
}

export function MailingsTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const state = useMailMerge()
  const count = activeRecords(state).length
  const ready = Boolean(state.source)
  const merging = state.type !== "normal"
  const [recordText, setRecordText] = useState<string | null>(null)
  const fields = state.source?.fields ?? [...ADDRESS_FIELDS]

  const startMenu = (close: () => void) => (
    <div className="mailings-menu is-wide p-1" role="menu">
      {START_TYPES.map((item) => (
        <MenuButton key={item.id} className="h-auto py-1" selected={state.type === item.id} onClick={() => (close(), startMerge(item.id))}>
          <span className="mailings-menu-item">
            <span>{item.label}</span>
            <span className="mailings-menu-detail">{item.description}</span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const recipientsMenu = (close: () => void) => (
    <div className="mailings-menu p-1" role="menu">
      <MenuButton onClick={() => (close(), startNewList())}>Type a New List…</MenuButton>
      <MenuButton onClick={() => (close(), void useExistingList())}>Use an Existing List…</MenuButton>
      <MenuButton onClick={() => (close(), void chooseContacts())}>Choose from Outlook Contacts…</MenuButton>
    </div>
  )
  const fieldMenu = (close: () => void) => (
    <div className="mailings-field-menu p-1" role="menu">
      {fields.map((field) => (
        <MenuButton key={field} onClick={() => (close(), insertCode(`MERGEFIELD ${mergeFieldName(field)}`))}>
          {field}
        </MenuButton>
      ))}
    </div>
  )
  const rulesMenu = (close: () => void) => (
    <div className="mailings-menu p-1" role="menu">
      {RULES.map((item, index) => (
        <div key={item.label}>
          {index === 1 || index === 3 ? <MenuSeparator /> : null}
          <MenuButton onClick={() => (close(), item.run())}>{item.label}</MenuButton>
        </div>
      ))}
    </div>
  )
  const finishMenu = (close: () => void) => (
    <div className="mailings-menu p-1" role="menu">
      <MenuButton onClick={() => (close(), show({ kind: "merge", then: "edit" }))}>Edit Individual Documents…</MenuButton>
      <MenuButton onClick={() => (close(), show({ kind: "merge", then: "print" }))}>Print Documents…</MenuButton>
    </div>
  )
  const go = (position: number) => {
    state.setPreview(true)
    state.go(position)
  }
  const recordField = (
    <form
      className="mailings-record"
      onSubmit={(event) => {
        event.preventDefault()
        const value = Number(recordText)
        if (Number.isFinite(value) && value >= 1) {
          go(value - 1)
        }
        setRecordText(null)
      }}
    >
      <input
        aria-label="Go to Record"
        className="mailings-record-box"
        disabled={!count}
        value={recordText ?? (count ? String(state.position + 1) : "")}
        onChange={(event) => setRecordText(event.target.value)}
        onBlur={() => setRecordText(null)}
      />
    </form>
  )
  const nav = [
    { id: "first-record", label: "First Record", icon: <NavIcon kind="first" />, disabled: !count || state.position === 0, onClick: () => go(0) },
    { id: "previous-record", label: "Previous Record", icon: <NavIcon kind="prev" />, disabled: !count || state.position === 0, onClick: () => go(state.position - 1) },
    { id: "next-record", label: "Next Record", icon: <NavIcon kind="next" />, disabled: !count || state.position >= count - 1, onClick: () => go(state.position + 1) },
    { id: "last-record", label: "Last Record", icon: <NavIcon kind="last" />, disabled: !count || state.position >= count - 1, onClick: () => go(count - 1) },
  ]

  const commands = {
    envelopes: { id: "envelopes", label: "Envelopes", description: "Create and print envelopes.", icon: (size: number) => <EnvelopeIcon size={size} />, disabled: !editor, onClick: () => show({ kind: "envelopes-labels", tab: "envelopes" }) },
    labels: { id: "labels", label: "Labels", description: "Create and print labels.", icon: (size: number) => <LabelsIcon size={size} />, disabled: !editor, onClick: () => show({ kind: "envelopes-labels", tab: "labels" }) },
    start: { id: "start", label: "Start Mail Merge", description: "Create one document and send it to many people: letters, envelopes, labels or a directory.", icon: (size: number) => <StartIcon size={size} />, disabled: !editor, menu: startMenu },
    recipients: { id: "recipients", label: "Select Recipients", description: "Choose the list of people you want to send your document to.", icon: (size: number) => <RecipientsIcon size={size} />, disabled: !editor, menu: recipientsMenu },
    edit: { id: "edit-list", label: "Edit Recipient List", description: "Choose, sort and filter the recipients, or edit a list typed here.", icon: (size: number) => <EditListIcon size={size} />, disabled: !ready, onClick: () => show({ kind: "recipients" }) },
    highlight: { id: "highlight", label: "Highlight Merge Fields", description: "Shade the merge fields in your document, so you can see where they are.", icon: (size: number) => <HighlightIcon size={size} />, active: state.highlight, onClick: () => state.setHighlight(!state.highlight) },
    address: { id: "address-block", label: "Address Block", description: "Add an address from your recipient list.", icon: (size: number) => <AddressIcon size={size} />, disabled: !editor, onClick: () => show({ kind: "address-block" }) },
    greeting: { id: "greeting-line", label: "Greeting Line", description: "Add a greeting, such as \"Dear «First Name»,\".", icon: (size: number) => <GreetingIcon size={size} />, disabled: !editor, onClick: () => show({ kind: "greeting-line" }) },
    field: { id: "merge-field", label: "Insert Merge Field", description: "Add a field from your recipient list, such as last name, phone number or company.", icon: (size: number) => <FieldIcon size={size} />, disabled: !editor, menu: fieldMenu },
    rules: { id: "rules", label: "Rules", description: "Set rules for the merge, such as skipping a record when a field has a certain value.", icon: (size: number) => <RulesIcon size={size} />, disabled: !editor, menu: rulesMenu },
    match: { id: "match-fields", label: "Match Fields", description: "Tell Inkspire which columns of your list are the address's parts.", icon: (size: number) => <MatchIcon size={size} />, disabled: !ready, onClick: () => show({ kind: "match-fields" }) },
    update: { id: "update-labels", label: "Update Labels", description: "Copy the first label's layout and fields to every label on the sheet.", icon: (size: number) => <UpdateLabelsIcon size={size} />, disabled: !editor || state.type !== "labels", onClick: () => void updateLabels() },
    preview: { id: "preview", label: "Preview Results", description: "Show each recipient's information in place of the merge fields.", icon: (size: number) => <PreviewIcon size={size} />, active: state.preview, disabled: !ready, onClick: () => state.setPreview(!state.preview) },
    find: { id: "find-recipient", label: "Find Recipient", description: "Find and preview a recipient in your list.", icon: (size: number) => <FindIcon size={size} />, disabled: !count, onClick: () => show({ kind: "find" }) },
    check: { id: "check-errors", label: "Check for Errors", description: "Check the merge for fields the list doesn't have.", icon: (size: number) => <CheckIcon size={size} />, disabled: !ready || !editor, onClick: () => show({ kind: "check-errors" }) },
    finish: { id: "finish", label: "Finish & Merge", description: "Make the merged documents to edit, or print them.", icon: (size: number) => <FinishIcon size={size} />, disabled: !editor || !count || !merging, menu: finishMenu },
  }

  if (ribbonLayout === "single") {
    const line = (command: (typeof commands)[keyof typeof commands], showLabel = false): LineCommand => ({
      ...command,
      icon: command.icon(16),
      showLabel,
    })
    return (
      <SingleLineBar
        label="Mailings"
        groups={[
          { id: "create", commands: [line(commands.envelopes, true), line(commands.labels, true)] },
          { id: "start", commands: [line(commands.start, true), line(commands.recipients, true), line(commands.edit)] },
          { id: "write", commands: [line(commands.address), line(commands.greeting), line(commands.field, true), line(commands.rules)] },
          {
            id: "preview",
            commands: [
              line(commands.preview, true),
              { ...nav[1]!, priority: 0 },
              { id: "record", label: "Go to Record", field: recordField },
              { ...nav[2]!, priority: 0 },
            ],
          },
          { id: "finish", commands: [line(commands.finish, true)] },
        ]}
        more={[
          { id: "write-more", commands: [line(commands.highlight), line(commands.match), line(commands.update)] },
          { id: "preview-more", commands: [nav[0]!, nav[3]!, line(commands.find), line(commands.check)] },
        ]}
      />
    )
  }

  const large = (command: (typeof commands)[keyof typeof commands]) => (
    <RibbonCommand key={command.id} {...command}>
      {command.icon(32)}
    </RibbonCommand>
  )
  const small = (command: (typeof commands)[keyof typeof commands]) => (
    <RibbonCommand key={command.id} size="small" {...command}>
      {command.icon(16)}
    </RibbonCommand>
  )
  return (
    <div role="toolbar" aria-label="Mailings" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Create" className="shrink-0">
        {large(commands.envelopes)}
        {large(commands.labels)}
      </RibbonGroup>
      <RibbonGroup label="Start Mail Merge" className="shrink-0">
        {large(commands.start)}
        {large(commands.recipients)}
        {large(commands.edit)}
      </RibbonGroup>
      <RibbonGroup label="Write & Insert Fields" className="shrink-0">
        {large(commands.highlight)}
        {large(commands.address)}
        {large(commands.greeting)}
        {large(commands.field)}
        <div className="ribbon-side-stack">
          {small(commands.rules)}
          {small(commands.match)}
          {small(commands.update)}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Preview Results" className="shrink-0">
        {large(commands.preview)}
        <div className="ribbon-side-stack">
          <div className="mailings-nav">
            {nav.slice(0, 2).map((item) => (
              <RibbonButton key={item.id} label={item.label} disabled={item.disabled} onClick={item.onClick}>
                {item.icon}
              </RibbonButton>
            ))}
            {recordField}
            {nav.slice(2).map((item) => (
              <RibbonButton key={item.id} label={item.label} disabled={item.disabled} onClick={item.onClick}>
                {item.icon}
              </RibbonButton>
            ))}
          </div>
          {small(commands.find)}
          {small(commands.check)}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Finish" className="shrink-0">
        {large(commands.finish)}
      </RibbonGroup>
    </div>
  )
}

/* Outline icons on the 16 grid with one 1.2 stroke, base colour plus one accent, as the Help tab's. */

const base = {
  stroke: "var(--icon-base-color)",
  strokeWidth: 1.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
} as const
const accent = { ...base, stroke: "var(--icon-accent-color)" } as const

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return <RibbonSvg size={size}>{children}</RibbonSvg>
}

function EnvelopeIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1" {...base} />
      <path d="M2 4l6 4.6L14 4" {...accent} />
    </Icon>
  )
}

function LabelsIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="2.4" y="1.6" width="11.2" height="12.8" rx="1" {...base} />
      <rect x="4" y="3.4" width="8" height="3.6" rx="0.8" {...accent} />
      <rect x="4" y="9" width="8" height="3.6" rx="0.8" {...base} />
    </Icon>
  )
}

function StartIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2.2 2.4h6.4l2 2v8.2H2.2Z" {...base} />
      <path d="M4 6.4h4.2M4 8.6h4.2" {...base} />
      <path d="M10.8 8.6h3.4M12.8 6.8l1.6 1.8-1.6 1.8" {...accent} />
    </Icon>
  )
}

function RecipientsIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <circle cx="6" cy="5.2" r="2.2" {...base} />
      <path d="M2 13.4c.3-2.4 1.8-3.8 4-3.8s3.7 1.4 4 3.8" {...base} />
      <circle cx="11.4" cy="5.8" r="1.8" {...accent} />
      <path d="M11 9.6c1.8 0 2.9 1.2 3.1 3.2" {...accent} />
    </Icon>
  )
}

function EditListIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2.4 3.6h7M2.4 6.6h7M2.4 9.6h4" {...base} />
      <path d="M8.6 13.4l.4-2 4-4 1.6 1.6-4 4Z" {...accent} />
    </Icon>
  )
}

function HighlightIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="1.6" y="5.4" width="12.8" height="5.2" rx="1" {...accent} />
      <path d="M4.2 8h1.2M7.4 8h1.2M10.6 8h1.2" {...base} strokeWidth={1.4} />
    </Icon>
  )
}

function AddressIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1" {...base} />
      <path d="M6.4 6.4h5.4M6.4 8.6h5.4M6.4 10.8h3.4" {...accent} />
    </Icon>
  )
}

function GreetingIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2 4.6h12M2 11.8h8" {...base} />
      <path d="M2.4 8.4c1-1.4 2-1.4 2.8 0s1.8 1.4 2.8 0 1.8-1.4 2.8 0" {...accent} />
    </Icon>
  )
}

function FieldIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="1.6" y="4" width="12.8" height="8" rx="1" {...base} />
      <path d="M6 6.2 4.4 8 6 9.8M10 6.2 11.6 8 10 9.8" {...accent} />
    </Icon>
  )
}

function RulesIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M8 2.2 13 7l-5 4.8L3 7Z" {...base} />
      <path d="M8 11.8v2.4M3 7H1.6M13 7h1.4" {...accent} />
    </Icon>
  )
}

function MatchIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M1.8 4.4h4.4M1.8 8h4.4M1.8 11.6h4.4M9.8 4.4h4.4M9.8 8h4.4M9.8 11.6h4.4" {...base} />
      <path d="M6.6 4.4l2.8 3.6M6.6 8l2.8 3.6M6.6 11.6l2.8-7.2" {...accent} />
    </Icon>
  )
}

function UpdateLabelsIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <rect x="1.8" y="2" width="7.4" height="5" rx="0.8" {...base} />
      <rect x="6.8" y="9" width="7.4" height="5" rx="0.8" {...base} />
      <path d="M11.4 3.6a2.8 2.8 0 0 1 1.6 3.4M12.2 7.6 13 7l.6.8" {...accent} />
    </Icon>
  )
}

function PreviewIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2.4 1.8h7.4l3.8 3.8v8.6H2.4Z" {...base} />
      <path d="M4.6 7.4h3.6M4.6 9.6h2.4" {...base} />
      <circle cx="10.4" cy="10.6" r="1.9" {...accent} />
    </Icon>
  )
}

function FindIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <circle cx="6.8" cy="6.8" r="4.2" {...base} />
      <path d="M10 10l4 4" {...accent} />
    </Icon>
  )
}

function CheckIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M2.4 1.8h7.4l3.8 3.8v8.6H2.4Z" {...base} />
      <path d="M5 9.2l2 2 3.8-4.4" {...accent} />
    </Icon>
  )
}

function FinishIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M1.8 3.4h5.6v9.2H1.8ZM8.6 3.4h5.6v9.2H8.6Z" {...base} />
      <path d="M3.4 8.2l1.2 1.2 2-2.4M10.2 8.2l1.2 1.2 2-2.4" {...accent} />
    </Icon>
  )
}

function NavIcon({ kind }: { kind: "first" | "prev" | "next" | "last" }) {
  const path = {
    first: "M4.4 4v8M11.6 4 7.2 8l4.4 4",
    prev: "M10.4 4 6 8l4.4 4",
    next: "M5.6 4 10 8l-4.4 4",
    last: "M11.6 4v8M4.4 4 8.8 8l-4.4 4",
  }[kind]
  return (
    <Icon size={16}>
      <path d={path} {...accent} />
    </Icon>
  )
}
