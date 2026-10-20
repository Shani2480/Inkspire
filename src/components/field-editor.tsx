import { useDocumentEditor } from "@/editor/document-editor"
import { clipFieldText, evaluateFormula, evaluateIf, IF_OPERATORS, isIfOperator } from "@/editor/formula"
import { NodeSelection } from "@tiptap/pm/state"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type FormulaDraft = {
  kind: "formula"
  pos: number
  expression: string
  left: number
  top: number
}

type IfDraft = {
  kind: "if"
  pos: number
  leftValue: string
  operator: string
  right: string
  thenText: string
  elseText: string
  left: number
  top: number
}

type FieldDraft = FormulaDraft | IfDraft

const inputClass =
  "h-8 min-w-0 rounded-md border border-black/10 px-2 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-400"

export function FieldEditor() {
  const editor = useDocumentEditor()
  const [field, setField] = useState<FieldDraft | null>(null)

  useEffect(() => {
    if (!editor) {
      return
    }
    const sync = () => {
      const { selection } = editor.state
      if (!(selection instanceof NodeSelection)) {
        setField(null)
        return
      }
      const name = selection.node.type.name
      if (name !== "formulaField" && name !== "ifField") {
        setField(null)
        return
      }
      const dom = editor.view.nodeDOM(selection.from)
      if (!(dom instanceof HTMLElement)) {
        setField(null)
        return
      }
      const rect = dom.getBoundingClientRect()
      const left = rect.left
      const top = rect.bottom + 6
      setField((current) => {
        if (
          current &&
          current.pos === selection.from &&
          current.kind === (name === "formulaField" ? "formula" : "if")
        ) {
          return { ...current, left, top }
        }
        if (name === "formulaField") {
          return {
            kind: "formula",
            pos: selection.from,
            expression: String(selection.node.attrs.expression ?? "").replace(/^=\s*/, ""),
            left,
            top,
          }
        }
        return {
          kind: "if",
          pos: selection.from,
          leftValue: String(selection.node.attrs.left ?? ""),
          operator: String(selection.node.attrs.operator ?? "="),
          right: String(selection.node.attrs.right ?? ""),
          thenText: String(selection.node.attrs.thenText ?? ""),
          elseText: String(selection.node.attrs.elseText ?? ""),
          left,
          top,
        }
      })
    }
    sync()
    editor.on("selectionUpdate", sync)
    return () => {
      editor.off("selectionUpdate", sync)
    }
  }, [editor])

  useEffect(() => {
    if (!field) {
      return
    }
    const close = () => setField(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        close()
        return
      }
      const element = target instanceof Element ? target : target.parentElement
      if (element?.closest("[data-field-editor], .formula-field, .if-field")) {
        return
      }
      close()
    }
    const scroll = document.getElementById("document-scroll")
    scroll?.addEventListener("scroll", close)
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onPointer)
    return () => {
      scroll?.removeEventListener("scroll", close)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onPointer)
    }
  }, [field])

  if (!editor || !field) {
    return null
  }

  const width = field.kind === "formula" ? 260 : 300
  const left = Math.max(8, Math.min(field.left, window.innerWidth - width - 8))
  const top = field.top + 220 > window.innerHeight ? Math.max(8, field.top - 226) : field.top

  function apply() {
    if (!editor || !field) {
      return
    }
    const pos = field.pos
    const attrs =
      field.kind === "formula"
        ? { expression: clipFieldText(field.expression.replace(/^=\s*/, "")) }
        : {
            left: clipFieldText(field.leftValue),
            operator: isIfOperator(field.operator) ? field.operator : "=",
            right: clipFieldText(field.right),
            thenText: clipFieldText(field.thenText),
            elseText: clipFieldText(field.elseText),
          }
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(pos)
        if (!node || (node.type.name !== "formulaField" && node.type.name !== "ifField")) {
          return false
        }
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
        tr.setSelection(NodeSelection.create(tr.doc, pos))
        return true
      })
      .run()
  }

  const preview =
    field.kind === "formula"
      ? evaluateFormula(field.expression)
      : evaluateIf(field.leftValue, field.operator, field.right, field.thenText, field.elseText)

  return createPortal(
    <form
      data-field-editor
      className="app-popup fixed z-50 rounded-lg border border-[var(--app-popover-border)] bg-[var(--app-popover-bg)] p-2 shadow-md"
      style={{ left, top, width }}
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      {field.kind === "formula" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-neutral-500">Formula</span>
          <span className="flex items-center gap-1">
            <span className="text-sm text-neutral-500">=</span>
            <input
              autoFocus
              className={`${inputClass} w-full`}
              maxLength={200}
              value={field.expression}
              aria-label="Formula"
              spellCheck={false}
              onChange={(event) => setField({ ...field, expression: event.target.value })}
            />
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-neutral-500">IF</span>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className={`${inputClass} w-full`}
              maxLength={200}
              value={field.leftValue}
              aria-label="Left value"
              spellCheck={false}
              onChange={(event) => setField({ ...field, leftValue: event.target.value })}
            />
            <select
              className={`${inputClass} w-14 px-1`}
              value={isIfOperator(field.operator) ? field.operator : "="}
              aria-label="Comparison"
              onChange={(event) => setField({ ...field, operator: event.target.value })}
            >
              {IF_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
            <input
              className={`${inputClass} w-full`}
              maxLength={200}
              value={field.right}
              aria-label="Right value"
              spellCheck={false}
              onChange={(event) => setField({ ...field, right: event.target.value })}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500">If true</span>
            <input
              className={inputClass}
              maxLength={200}
              value={field.thenText}
              aria-label="Text if true"
              onChange={(event) => setField({ ...field, thenText: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500">If false</span>
            <input
              className={inputClass}
              maxLength={200}
              value={field.elseText}
              aria-label="Text if false"
              onChange={(event) => setField({ ...field, elseText: event.target.value })}
            />
          </label>
        </div>
      )}
      <p className={`mt-2 text-xs ${preview.ok ? "text-neutral-600" : "text-red-700"}`}>
        {preview.ok ? preview.value || "Empty result" : preview.error}
      </p>
      <button
        type="submit"
        className="mt-2 h-8 w-full rounded-md bg-neutral-900 text-sm text-white hover:bg-neutral-800"
      >
        Apply
      </button>
    </form>,
    document.body,
  )
}
