import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import {
  applyTemplate,
  EQUATION_STRUCTURES,
  EQUATION_SYMBOLS,
  texFromTyped,
  type EquationGroup,
} from "@/editor/equation-templates"
import { EQUATION_PRESETS } from "@/editor/equation"
import { loadKatex } from "@/lib/katex-lazy"
import { useLayoutEffect, useRef, useState } from "react"

/** An equation as KaTeX draws it, or the reason it cannot be drawn. */
export function EquationPreview({ tex, display = true }: { tex: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [error, setError] = useState("")
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    let current = true
    void loadKatex().then((katex) => {
      if (!current) {
        return
      }
      try {
        katex.render(texFromTyped(tex) || "\\square", element, { throwOnError: true, displayMode: display })
        setError("")
      } catch (failure) {
        katex.render(texFromTyped(tex) || "\\square", element, { throwOnError: false, displayMode: display })
        setError(failure instanceof Error ? failure.message.replace(/^KaTeX parse error:\s*/, "") : "Cannot draw this")
      }
    })
    return () => {
      current = false
    }
  }, [tex, display])
  return (
    <>
      <span ref={ref} className="equation-preview-math" />
      {error ? (
        <p role="status" className="equation-error">
          {error}
        </p>
      ) : null}
    </>
  )
}

type Tab = "structures" | "symbols" | "examples"

/**
 * The equation editor (21.23): type LaTeX or UnicodeMath-style symbols, build with structure and symbol buttons,
 * and see the equation drawn as you go.
 */
export function EquationEditor({
  title,
  initial,
  ok,
  onOk,
  onClose,
}: {
  title: string
  initial: string
  ok: string
  onOk: (tex: string) => void
  onClose: () => void
}) {
  const [tex, setTex] = useState(initial)
  const [tab, setTab] = useState<Tab>("structures")
  const field = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const range = pending.current
    if (range && field.current) {
      field.current.focus()
      field.current.setSelectionRange(range.start, range.end)
      pending.current = null
    }
  }, [tex])

  const insert = (template: string) => {
    const area = field.current
    const from = area?.selectionStart ?? tex.length
    const to = area?.selectionEnd ?? tex.length
    const next = applyTemplate(tex, from, to, template)
    pending.current = { start: next.start, end: next.end }
    setTex(next.tex)
  }

  const groups: EquationGroup[] = tab === "structures" ? EQUATION_STRUCTURES : EQUATION_SYMBOLS

  return (
    <DialogFrame
      title={title}
      width={560}
      onClose={onClose}
      onSubmit={() => onOk(tex)}
      tabs={[
        { id: "structures", label: "Structures" },
        { id: "symbols", label: "Symbols" },
        { id: "examples", label: "Examples" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as Tab)}
    >
      <div className="equation-palette" role="group" aria-label={tab}>
        {tab === "examples"
          ? EQUATION_PRESETS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="equation-example"
                title={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTex(item.tex)}
              >
                <EquationPreview tex={item.tex} display={false} />
              </button>
            ))
          : groups.map((group) => (
              <div key={group.id} className="equation-group">
                <span className="equation-group-label">{group.label}</span>
                <div className="equation-group-items">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="equation-item"
                      title={item.label}
                      aria-label={item.label}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insert(item.tex)}
                    >
                      <EquationPreview tex={item.tex.replace(/#\d/g, "\\square ")} display={false} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
      </div>
      <label className="text-prompt-label" htmlFor="equation-editor-tex">
        LaTeX or symbols
      </label>
      <textarea
        id="equation-editor-tex"
        ref={field}
        rows={3}
        spellCheck={false}
        value={tex}
        className="text-prompt-field equation-source"
        onChange={(event) => setTex(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onOk(tex)
          }
        }}
      />
      <div className="equation-preview" aria-label="Preview">
        <EquationPreview tex={tex} />
      </div>
      <DialogButtons submit ok={ok} onCancel={onClose} />
    </DialogFrame>
  )
}
