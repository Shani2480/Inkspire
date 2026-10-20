import { MenuButton, RibbonButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import {
  addressBlockHtml,
  applyMergeToHtml,
  checkMergeErrors,
  findRecipientIndex,
  greetingLineHtml,
  insertMergeMark,
  labelsTableHtml,
  mappedFieldName,
  parseRecipientCsv,
  STANDARD_FIELDS,
  useMailMerge,
  type FieldMap,
  type MergeRecord,
} from "@/document/mail-merge"
import { useViewStore } from "@/document/view"
import {
  LineEnvelopeIcon,
  LineFinishIcon,
  LineLabelsIcon,
  LineMergeFieldIcon,
  LinePreviewIcon,
  LineRecipientsIcon,
  LineRecordIcon,
  LineStartMergeIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { insertHtmlAsNewDocument } from "@/document/commands"
import { useDocumentEditor } from "@/editor/document-editor"
import { MERGE_FIELDS } from "@/editor/merge-field"
import { chainWithSelection } from "@/editor/selection-memory"
import { useRef, useState, type ReactNode } from "react"
import { DialogFrame } from "@/components/word-dialog"

export function MailingsTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const highlight = useViewStore((state) => state.highlightMerge)
  const setHighlight = useViewStore((state) => state.setHighlightMerge)
  const mode = useMailMerge((state) => state.mode)
  const recipients = useMailMerge((state) => state.recipients)
  const fields = useMailMerge((state) => state.fields)
  const fieldMap = useMailMerge((state) => state.fieldMap)
  const index = useMailMerge((state) => state.index)
  const preview = useMailMerge((state) => state.preview)
  const setMode = useMailMerge((state) => state.setMode)
  const setRecipients = useMailMerge((state) => state.setRecipients)
  const setFieldMap = useMailMerge((state) => state.setFieldMap)
  const setIndex = useMailMerge((state) => state.setIndex)
  const setPreview = useMailMerge((state) => state.setPreview)
  const next = useMailMerge((state) => state.next)
  const prev = useMailMerge((state) => state.prev)
  const first = useMailMerge((state) => state.first)
  const last = useMailMerge((state) => state.last)
  const clear = useMailMerge((state) => state.clear)
  const fileInput = useRef<HTMLInputElement>(null)
  const [envelope, setEnvelope] = useState(false)
  const [labels, setLabels] = useState(false)
  const [editing, setEditing] = useState(false)
  const [matching, setMatching] = useState(false)
  const [finding, setFinding] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [recordInput, setRecordInput] = useState("")
  const record = recipients[index]
  const ready = recipients.length > 0
  const fieldNames = fields.length ? fields : [...MERGE_FIELDS]

  function finishMerge(kind: "edit" | "print") {
    if (!editor || !ready) {
      return
    }
    const source = editor.getHTML()
    const pages = recipients.map((row) => applyMergeToHtml(source, row)).join('<div data-page-break=""></div>')
    insertHtmlAsNewDocument(pages)
    if (kind === "print") {
      window.setTimeout(() => window.print(), 400)
    }
  }

  function insertField(name: string) {
    if (!editor) {
      return
    }
    chainWithSelection(editor).insertContent(insertMergeMark(name)).run()
  }

  function updateLabelsSheet() {
    if (!editor || !ready) {
      return
    }
    const html = labelsTableHtml(recipients)
    if (!html) {
      return
    }
    editor.chain().focus().setContent(html).run()
  }

  function runErrorCheck() {
    if (!editor) {
      return
    }
    const result = checkMergeErrors(editor.getHTML(), fieldNames)
    if (result.ok) {
      setErrors([`No unmatched fields. ${result.used.length} merge field${result.used.length === 1 ? "" : "s"} found.`])
      return
    }
    setErrors(result.missing.map((name) => `«${name}» is not in the recipient list.`))
  }

  const startMergeMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      {(
        [
          ["letters", "Letters"],
          ["email", "E-mail Messages"],
          ["envelopes", "Envelopes"],
          ["labels", "Labels"],
          ["directory", "Directory"],
        ] as const
      ).map(([id, label]) => (
        <MenuButton
          key={id}
          selected={mode === id}
          onClick={() => {
            setMode(id)
            close()
          }}
        >
          {label}
        </MenuButton>
      ))}
      <MenuButton
        onClick={() => {
          clear()
          close()
        }}
      >
        Normal Word Document
      </MenuButton>
    </div>
  )
  const recipientsMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          fileInput.current?.click()
          close()
        }}
      >
        Use an Existing List…
      </MenuButton>
      <MenuButton
        onClick={() => {
          setRecipients([
            {
              FirstName: "Alex",
              LastName: "Rivera",
              Title: "Mx",
              Company: "Inkspire",
              Address: "1 Harbor Way",
              City: "Seattle",
              PostalCode: "98101",
              Email: "alex@example.com",
            },
            {
              FirstName: "Jordan",
              LastName: "Lee",
              Title: "Mx",
              Company: "Northwind",
              Address: "44 Pike St",
              City: "Portland",
              PostalCode: "97201",
              Email: "jordan@example.com",
            },
            {
              FirstName: "Sam",
              LastName: "Ortiz",
              Title: "Dr",
              Company: "Contoso",
              Address: "9 Market St",
              City: "Austin",
              PostalCode: "78701",
              Email: "sam@example.com",
            },
          ])
          close()
        }}
      >
        Type a New List… (Sample)
      </MenuButton>
    </div>
  )
  const mergeFieldMenu = (close: () => void) => (
    <div className="flex max-h-64 w-44 flex-col overflow-auto">
      {fieldNames.map((name) => (
        <MenuButton
          key={name}
          onClick={() => {
            insertField(name)
            close()
          }}
        >
          {name}
        </MenuButton>
      ))}
    </div>
  )
  const rulesMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      <MenuButton
        onClick={() => {
          editor?.chain().focus().insertIf().run()
          close()
        }}
      >
        If…Then…Else…
      </MenuButton>
      <MenuButton
        onClick={() => {
          insertField("MergeRecord#")
          close()
        }}
      >
        Merge Record #
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) {
            chainWithSelection(editor).insertContent("<p>«Next Record»</p>").run()
          }
          close()
        }}
      >
        Next Record
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) {
            const field = mappedFieldName(fieldMap, "LastName", fieldNames)
            chainWithSelection(editor).insertContent(`<p>«Skip Record If ${field} = ""»</p>`).run()
          }
          close()
        }}
      >
        Skip Record If…
      </MenuButton>
    </div>
  )
  const finishMenu = (close: () => void) => (
    <div className="flex w-56 flex-col">
      <MenuButton
        onClick={() => {
          finishMerge("edit")
          close()
        }}
      >
        Edit Individual Documents…
      </MenuButton>
      <MenuButton
        onClick={() => {
          finishMerge("print")
          close()
        }}
      >
        Print Documents…
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (!editor || !ready) {
            return
          }
          const source = editor.getHTML()
          const mailto = recipients
            .map((row) => row.Email || row.email)
            .filter(Boolean)
            .slice(0, 20)
            .join(",")
          const body = applyMergeToHtml(source, recipients[0] ?? {})
            .replace(/<[^>]+>/g, " ")
            .trim()
          if (mailto) {
            window.open(
              `mailto:${encodeURIComponent(mailto)}?subject=${encodeURIComponent("Merged message")}&body=${encodeURIComponent(body.slice(0, 1200))}`,
            )
          }
          close()
        }}
      >
        Send E-mail Messages…
      </MenuButton>
    </div>
  )
  const recordNavigator = (
    <div className="flex h-[22px] items-center">
      <RibbonButton label="First Record" disabled={!ready} onClick={first}>
        <NavIcon kind="first" />
      </RibbonButton>
      <RibbonButton label="Previous Record" disabled={!ready} onClick={prev}>
        <NavIcon kind="prev" />
      </RibbonButton>
      <form
        className="flex items-center gap-1 px-0.5"
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(recordInput || index + 1)
          if (Number.isFinite(value)) {
            setIndex(value - 1)
          }
          setRecordInput("")
        }}
      >
        <input
          aria-label="Record number"
          className="h-5 w-10 rounded border border-black/15 px-1 text-center text-[11px] tabular-nums"
          disabled={!ready}
          placeholder={ready ? String(index + 1) : "—"}
          value={recordInput}
          onChange={(event) => setRecordInput(event.target.value)}
        />
        <span className="text-[11px] text-[var(--app-ribbon-muted)]">{ready ? `of ${recipients.length}` : ""}</span>
      </form>
      <RibbonButton label="Next Record" disabled={!ready} onClick={next}>
        <NavIcon kind="next" />
      </RibbonButton>
      <RibbonButton label="Last Record" disabled={!ready} onClick={last}>
        <NavIcon kind="last" />
      </RibbonButton>
    </div>
  )
  const insertAddressBlock = () =>
    editor && chainWithSelection(editor).insertContent(addressBlockHtml(fieldMap, fieldNames)).run()
  const insertGreetingLine = () =>
    editor && chainWithSelection(editor).insertContent(greetingLineHtml(fieldMap, fieldNames)).run()
  const dialogs = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) {
            return
          }
          const text = await file.text()
          setRecipients(parseRecipientCsv(text))
        }}
      />
      {envelope ? (
        <AddressDialog
          title="Envelopes"
          onClose={() => setEnvelope(false)}
          onInsert={(html) => editor?.chain().focus().insertContent(html).run()}
        />
      ) : null}
      {labels ? (
        <AddressDialog
          title="Labels"
          onClose={() => setLabels(false)}
          onInsert={(html) => {
            const cell = `<td><p>${html}</p></td>`
            const row = `<tr>${cell}${cell}</tr>`
            editor?.chain().focus().insertContent(`<table>${row}${row}${row}</table>`).run()
            setMode("labels")
          }}
        />
      ) : null}
      {editing ? (
        <RecipientEditor recipients={recipients} onChange={setRecipients} onClose={() => setEditing(false)} />
      ) : null}
      {matching ? (
        <MatchFieldsDialog
          fields={fieldNames}
          fieldMap={fieldMap}
          onSave={(next) => {
            setFieldMap(next)
            setMatching(false)
          }}
          onClose={() => setMatching(false)}
        />
      ) : null}
      {finding ? (
        <FindRecipientDialog
          recipients={recipients}
          onFind={(nextIndex) => {
            setIndex(nextIndex)
            setFinding(false)
          }}
          onClose={() => setFinding(false)}
        />
      ) : null}
      {errors ? <MessageDialog title="Check for Errors" lines={errors} onClose={() => setErrors(null)} /> : null}
    </>
  )

  if (ribbonLayout === "single") {
    const create: LineCommand[] = [
      {
        id: "envelopes",
        label: "Envelopes",
        icon: <LineEnvelopeIcon />,
        disabled: !editor,
        onClick: () => setEnvelope(true),
      },
      { id: "labels", label: "Labels", icon: <LineLabelsIcon />, disabled: !editor, onClick: () => setLabels(true) },
    ]
    const start: LineCommand[] = [
      { id: "start-merge", label: "Start Mail Merge", icon: <LineStartMergeIcon />, priority: 2, menu: startMergeMenu },
      {
        id: "select-recipients",
        label: "Select Recipients",
        icon: <LineRecipientsIcon />,
        priority: 2,
        disabled: !editor,
        menu: recipientsMenu,
      },
    ]
    const write: LineCommand[] = [
      {
        id: "merge-field",
        label: "Insert Merge Field",
        icon: <LineMergeFieldIcon />,
        priority: 1,
        disabled: !editor,
        menu: mergeFieldMenu,
      },
    ]
    const results: LineCommand[] = [
      {
        id: "preview",
        label: "Preview Results",
        icon: <LinePreviewIcon />,
        showLabel: true,
        priority: 1,
        active: preview,
        disabled: !ready,
        onClick: () => setPreview(!preview),
      },
      {
        id: "previous-record",
        label: "Previous Record",
        icon: <LineRecordIcon direction="previous" />,
        disabled: !ready,
        onClick: prev,
      },
      {
        id: "record",
        label: "Record",
        field: (
          <span
            className="line-record"
            aria-live="polite"
            title={record ? Object.values(record).slice(0, 3).join(" · ") : undefined}
          >
            {ready ? `${index + 1} of ${recipients.length}` : "—"}
          </span>
        ),
      },
      {
        id: "next-record",
        label: "Next Record",
        icon: <LineRecordIcon direction="next" />,
        disabled: !ready,
        onClick: next,
      },
    ]
    const finish: LineCommand[] = [
      {
        id: "finish",
        label: "Finish & Merge",
        icon: <LineFinishIcon />,
        showLabel: true,
        priority: 2,
        disabled: !editor || !ready,
        menu: finishMenu,
      },
    ]
    const labelled = (commands: LineCommand[]) => commands.map((command) => ({ ...command, showLabel: true }))
    // The classic tab's small commands, grouped as there.
    const more: LineGroup[] = [
      {
        id: "recipients",
        commands: [
          {
            id: "edit-list",
            label: "Edit Recipient List",
            icon: <EditListIcon />,
            disabled: !ready,
            onClick: () => setEditing(true),
          },
        ],
      },
      {
        id: "write",
        commands: [
          {
            id: "highlight-fields",
            label: "Highlight Merge Fields",
            icon: <HighlightIcon />,
            active: highlight,
            onClick: () => setHighlight(!highlight),
          },
          {
            id: "address-block",
            label: "Address Block",
            icon: <AddressIcon />,
            disabled: !editor,
            onClick: insertAddressBlock,
          },
          {
            id: "greeting-line",
            label: "Greeting Line",
            icon: <GreetingIcon />,
            disabled: !editor,
            onClick: insertGreetingLine,
          },
          { id: "rules", label: "Rules", icon: <RulesIcon />, disabled: !editor, menu: rulesMenu },
          {
            id: "match-fields",
            label: "Match Fields",
            icon: <MatchIcon />,
            disabled: !ready,
            onClick: () => setMatching(true),
          },
          {
            id: "update-labels",
            label: "Update Labels",
            icon: <LabelIcon />,
            disabled: !editor || !ready || mode !== "labels",
            onClick: updateLabelsSheet,
          },
        ],
      },
      {
        id: "preview",
        commands: [
          {
            id: "first-record",
            label: "First Record",
            icon: <NavIcon kind="first" />,
            disabled: !ready,
            onClick: first,
          },
          { id: "last-record", label: "Last Record", icon: <NavIcon kind="last" />, disabled: !ready, onClick: last },
          {
            id: "find-recipient",
            label: "Find Recipient",
            icon: <FindIcon />,
            disabled: !ready,
            onClick: () => setFinding(true),
          },
          {
            id: "check-errors",
            label: "Check for Errors",
            icon: <CheckIcon />,
            disabled: !editor || !ready,
            onClick: runErrorCheck,
          },
        ],
      },
    ]
    return (
      <>
        <SingleLineBar
          label="Mailings"
          groups={[
            { id: "create", commands: labelled(create) },
            { id: "start", commands: labelled(start) },
            { id: "write", commands: labelled(write) },
            { id: "results", commands: results },
            { id: "finish", commands: finish },
          ]}
          more={more}
        />
        {dialogs}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Mailings" className="ribbon-home relative flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Create" className="shrink-0">
        <RibbonCommand label="Envelopes" disabled={!editor} onClick={() => setEnvelope(true)}>
          <MailIcon />
        </RibbonCommand>
        <RibbonCommand label="Labels" disabled={!editor} onClick={() => setLabels(true)}>
          <LabelIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Start Mail Merge" className="shrink-0">
        <RibbonCommand label="Start Mail Merge" menu={startMergeMenu}>
          <MergeStartIcon />
        </RibbonCommand>
        <RibbonCommand label="Select Recipients" disabled={!editor} menu={recipientsMenu}>
          <RecipientsIcon />
        </RibbonCommand>
        <RibbonCommand size="small" label="Edit Recipient List" disabled={!ready} onClick={() => setEditing(true)}>
          <EditListIcon />
        </RibbonCommand>
      </RibbonGroup>

      <RibbonGroup label="Write & Insert Fields" className="shrink-0">
        <div className="ribbon-side-stack is-centered">
          <RibbonCommand
            size="small"
            label="Highlight Merge Fields"
            active={highlight}
            onClick={() => setHighlight(!highlight)}
          >
            <HighlightIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Address Block" disabled={!editor} onClick={insertAddressBlock}>
            <AddressIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Greeting Line" disabled={!editor} onClick={insertGreetingLine}>
            <GreetingIcon />
          </RibbonCommand>
        </div>
        <RibbonCommand label="Insert Merge Field" disabled={!editor} menu={mergeFieldMenu}>
          <FieldIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand size="small" label="Rules" disabled={!editor} menu={rulesMenu}>
            <RulesIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Match Fields" disabled={!ready} onClick={() => setMatching(true)}>
            <MatchIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Update Labels"
            disabled={!editor || !ready || mode !== "labels"}
            onClick={updateLabelsSheet}
          >
            <LabelIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Preview Results" className="shrink-0">
        <RibbonCommand label="Preview Results" active={preview} disabled={!ready} onClick={() => setPreview(!preview)}>
          <PreviewIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          {/* The record navigator sits on one row, as in Word: |◀ ◀ [record] ▶ ▶| */}
          {recordNavigator}
          <RibbonCommand size="small" label="Find Recipient" disabled={!ready} onClick={() => setFinding(true)}>
            <FindIcon />
          </RibbonCommand>
          <RibbonCommand size="small" label="Check for Errors" disabled={!editor || !ready} onClick={runErrorCheck}>
            <CheckIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Finish" className="shrink-0">
        <RibbonCommand label="Finish & Merge" disabled={!editor || !ready} menu={finishMenu}>
          <FinishIcon />
        </RibbonCommand>
      </RibbonGroup>

      {preview && record ? (
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded bg-[#0f6cbd] px-2 py-0.5 text-[11px] text-white">
          Preview: {Object.values(record).slice(0, 3).join(" · ")}
        </div>
      ) : null}
      {dialogs}
    </div>
  )
}

function AddressDialog({
  title,
  onClose,
  onInsert,
}: {
  title: string
  onClose: () => void
  onInsert: (html: string) => void
}) {
  const [returnTo, setReturnTo] = useState("")
  const [recipient, setRecipient] = useState("")
  return (
    <DialogFrame
      title={title}
      width={420}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const body =
          title === "Envelopes"
            ? `<p>${escapeHtml(returnTo).replace(/\n/g, "<br>")}</p><p></p><p>${escapeHtml(recipient).replace(/\n/g, "<br>")}</p>`
            : escapeHtml(recipient).replace(/\n/g, "<br>")
        onInsert(body)
        onClose()
      }}
    >
      {title === "Envelopes" ? (
        <label className="mt-3 block text-xs text-neutral-500">
          Return address
          <textarea
            aria-label="Return address"
            value={returnTo}
            className="mt-1 h-16 w-full rounded border border-black/15 px-2 py-1 text-sm text-neutral-900"
            onChange={(event) => setReturnTo(event.target.value)}
          />
        </label>
      ) : null}
      <label className="mt-3 block text-xs text-neutral-500">
        {title === "Labels" ? "Label text" : "Delivery address"}
        <textarea
          aria-label="Recipient"
          value={recipient}
          className="mt-1 h-20 w-full rounded border border-black/15 px-2 py-1 text-sm text-neutral-900"
          onChange={(event) => setRecipient(event.target.value)}
        />
      </label>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="dialog-btn is-primary">
          Insert
        </button>
      </div>
    </DialogFrame>
  )
}

function RecipientEditor({
  recipients,
  onChange,
  onClose,
}: {
  recipients: MergeRecord[]
  onChange: (recipients: MergeRecord[]) => void
  onClose: () => void
}) {
  const columns = recipients[0] ? Object.keys(recipients[0]) : ["FirstName", "LastName", "Email"]
  const [rows, setRows] = useState(() => recipients.map((row) => ({ ...row })))

  function patch(rowIndex: number, column: string, value: string) {
    setRows((current) => current.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)))
  }

  return (
    <DialogFrame title="Edit Recipient List" width={720} onClose={onClose}>
      <div className="mt-3 max-h-[50vh] overflow-auto rounded border border-black/10">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-[#f5f5f5]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-black/10 px-2 py-1 font-semibold">
                  {column}
                </th>
              ))}
              <th className="border-b border-black/10 px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column} className="border-b border-black/5 p-1">
                    <input
                      aria-label={`${column} row ${rowIndex + 1}`}
                      value={row[column] ?? ""}
                      className="h-7 w-full min-w-[88px] rounded border border-black/10 px-1"
                      onChange={(event) => patch(rowIndex, column, event.target.value)}
                    />
                  </td>
                ))}
                <td className="border-b border-black/5 p-1">
                  <button
                    type="button"
                    className="text-[11px] text-neutral-500"
                    onClick={() => setRows((current) => current.filter((_, index) => index !== rowIndex))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-between gap-2">
        <button
          type="button"
          className="dialog-btn"
          onClick={() =>
            setRows((current) => [...current, Object.fromEntries(columns.map((column) => [column, ""])) as MergeRecord])
          }
        >
          New Entry
        </button>
        <div className="flex gap-2">
          <button type="button" className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn is-primary"
            onClick={() => {
              onChange(rows)
              onClose()
            }}
          >
            OK
          </button>
        </div>
      </div>
    </DialogFrame>
  )
}

function MatchFieldsDialog({
  fields,
  fieldMap,
  onSave,
  onClose,
}: {
  fields: string[]
  fieldMap: FieldMap
  onSave: (fieldMap: FieldMap) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<FieldMap>(() => ({ ...fieldMap }))
  return (
    <DialogFrame
      title="Match Fields"
      width={420}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <p className="mt-1 text-[12px] text-neutral-500">Map required address fields to columns in your list.</p>
      <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-auto">
        {STANDARD_FIELDS.map((field) => (
          <label key={field} className="grid grid-cols-[120px_1fr] items-center gap-2 text-[12px]">
            <span>{field}</span>
            <select
              aria-label={`Match ${field}`}
              value={draft[field] ?? ""}
              className="dialog-btn"
              onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value || undefined }))}
            >
              <option value="">(not matched)</option>
              {fields.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="dialog-btn is-primary">
          OK
        </button>
      </div>
    </DialogFrame>
  )
}

function FindRecipientDialog({
  recipients,
  onFind,
  onClose,
}: {
  recipients: MergeRecord[]
  onFind: (index: number) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  return (
    <DialogFrame
      title="Find Recipient"
      width={360}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const found = findRecipientIndex(recipients, query)
        if (found < 0) {
          setMessage("No recipient matched that text.")
          return
        }
        onFind(found)
      }}
    >
      <input
        aria-label="Find text"
        value={query}
        autoFocus
        className="mt-3 h-8 w-full rounded border border-black/15 px-2 text-sm"
        placeholder="Search any field"
        onChange={(event) => {
          setQuery(event.target.value)
          setMessage("")
        }}
      />
      {message ? <p className="mt-2 text-[12px] text-[#d13438]">{message}</p> : null}
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="dialog-btn is-primary">
          Find Next
        </button>
      </div>
    </DialogFrame>
  )
}

function MessageDialog({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  return (
    <DialogFrame title={title} width={420} onClose={onClose}>
      <ul className="mt-3 max-h-56 list-disc space-y-1 overflow-auto pl-5 text-[13px] text-neutral-800">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button type="button" className="dialog-btn is-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </DialogFrame>
  )
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      {children}
    </svg>
  )
}

function MailIcon() {
  return (
    <Svg>
      <rect x="4" y="8" width="20" height="12" rx="1" fill="#deecf9" stroke="#0f6cbd" />
      <path d="M5 9 14 15 23 9" stroke="#0f6cbd" />
    </Svg>
  )
}
function LabelIcon() {
  return (
    <Svg>
      <rect x="5" y="7" width="18" height="14" rx="2" fill="#fff4ce" stroke="#8a6116" />
      <path d="M8 12h12M8 16h8" stroke="#8a6116" />
    </Svg>
  )
}
function HighlightIcon() {
  return (
    <Svg>
      <path d="M7 18 16 9l3 3-9 9H7z" fill="#fff2cc" stroke="#c4a35a" />
    </Svg>
  )
}
function FieldIcon() {
  return (
    <Svg>
      <rect x="5" y="8" width="18" height="12" rx="1" fill="#fff" stroke="#0f6cbd" />
      <text x="14" y="17" textAnchor="middle" fontSize="8" fill="#0f6cbd">
        «»
      </text>
    </Svg>
  )
}
function MergeStartIcon() {
  return (
    <Svg>
      <rect x="4" y="6" width="10" height="14" fill="#fff" stroke="#0f6cbd" />
      <rect x="14" y="8" width="10" height="14" fill="#deecf9" stroke="#0f6cbd" />
    </Svg>
  )
}
function RecipientsIcon() {
  return (
    <Svg>
      <circle cx="10" cy="10" r="3" fill="#0f6cbd" />
      <circle cx="18" cy="10" r="3" fill="#5aa2e0" />
      <path d="M5 20c1-3 3-4 5-4s4 1 5 4M13 20c1-3 3-4 5-4s4 1 5 4" stroke="#0f6cbd" />
    </Svg>
  )
}
function EditListIcon() {
  return (
    <Svg>
      <rect x="5" y="6" width="18" height="16" fill="#fff" stroke="#0f6cbd" />
      <path d="M8 11h12M8 15h8" stroke="#0f6cbd" />
    </Svg>
  )
}
function AddressIcon() {
  return (
    <Svg>
      <rect x="6" y="5" width="16" height="18" fill="#fff" stroke="#5c5c5c" />
      <path d="M9 10h10M9 14h10M9 18h6" stroke="#0f6cbd" />
    </Svg>
  )
}
function GreetingIcon() {
  return (
    <Svg>
      <path d="M6 10c2-4 14-4 16 0" stroke="#0f6cbd" strokeWidth="1.4" />
      <path d="M8 16h12" stroke="#8a8a8a" />
    </Svg>
  )
}
function RulesIcon() {
  return (
    <Svg>
      <path d="M8 7h12v5H8zM8 16h12v5H8z" fill="#deecf9" stroke="#0f6cbd" />
      <path d="M14 12v4" stroke="#0f6cbd" />
    </Svg>
  )
}
function MatchIcon() {
  return (
    <Svg>
      <path d="M8 10h5M15 10h5M10.5 7v6M17.5 7v6" stroke="#0f6cbd" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 18h12" stroke="#8a8a8a" />
    </Svg>
  )
}
function PreviewIcon() {
  return (
    <Svg>
      <circle cx="14" cy="14" r="6" stroke="#0f6cbd" />
      <circle cx="14" cy="14" r="2" fill="#0f6cbd" />
    </Svg>
  )
}
function FindIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="5" stroke="#0f6cbd" strokeWidth="1.6" />
      <path d="M16 16l5 5" stroke="#0f6cbd" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}
function CheckIcon() {
  return (
    <Svg>
      <circle cx="14" cy="14" r="8" stroke="#0f6cbd" />
      <path d="M10 14l3 3 5-6" stroke="#107c10" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}
function FinishIcon() {
  return (
    <Svg>
      <path d="M7 14 12 19 21 8" stroke="#107c10" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  )
}
function NavIcon({ kind }: { kind: "first" | "prev" | "next" | "last" }) {
  const path =
    kind === "first"
      ? "M10 8v12M18 8 12 14l6 6"
      : kind === "prev"
        ? "M18 8 12 14l6 6"
        : kind === "next"
          ? "M10 8l6 6-6 6"
          : "M18 8v12M10 8l6 6-6 6"
  return (
    <Svg>
      <path d={path} stroke="#0f6cbd" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}
