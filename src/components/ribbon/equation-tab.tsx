import { EquationEditor, EquationPreview } from "@/components/equation-editor"
import { LineEquationIcon } from "@/components/ribbon/line-icons"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { SingleLineBar, type LineCommand } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import { appendTemplate, EQUATION_STRUCTURES, EQUATION_SYMBOLS, type EquationGroup } from "@/editor/equation-templates"
import { useEditorState } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { useState, type ReactNode } from "react"
import { askText } from "@/components/text-prompt"
import {
  BUILT_IN_EQUATIONS,
  equationToText,
  loadSavedEquations,
  saveEquation,
  type EquationText,
} from "@/editor/equation-gallery"

/** The Equation tab (21.23): appears with a selected equation and edits it with structures, symbols and the editor. */
export function EquationTab() {
  const editor = useDocumentEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const [editing, setEditing] = useState(false)
  const tex = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const selection = current?.state.selection
      return selection instanceof NodeSelection && selection.node.type.name === "equation"
        ? String(selection.node.attrs.tex ?? "")
        : null
    },
  })
  const ready = Boolean(editor) && tex !== null
  const [saved, setSaved] = useState(loadSavedEquations)
  const [conversion, setConversion] = useState<EquationText>("unicode")
  const [category, setCategory] = useState(EQUATION_SYMBOLS[0]!.id)
  const symbols = EQUATION_SYMBOLS.find((group) => group.id === category) ?? EQUATION_SYMBOLS[0]!

  const setTex = (next: string) => editor?.chain().focus().updateAttributes("equation", { tex: next }).run()
  const convert = () => {
    if (!editor || tex === null) {
      return
    }
    const text = equationToText(tex, conversion)
    const { selection, schema } = editor.state
    const paragraph = schema.nodes.paragraph
    if (!paragraph || !text) {
      return
    }
    const node = selection instanceof NodeSelection ? selection.node : null
    // An equation inside a line becomes text in that line; one of its own becomes a paragraph.
    const replacement = node?.isInline ? schema.text(text) : paragraph.create(null, schema.text(text))
    editor.view.dispatch(editor.state.tr.replaceWith(selection.from, selection.to, replacement).scrollIntoView())
  }
  const saveSelection = async () => {
    if (tex === null) {
      return
    }
    const name = await askText({ title: "Save Selection to Equation Gallery", label: "Name", value: "", ok: "Save" })
    if (name?.trim()) {
      setSaved(saveEquation(name, tex))
    }
  }
  const galleryMenu = (close: () => void) => (
    <div className="flex min-w-[240px] flex-col gap-0.5 p-1">
      <div className="px-2 py-1 text-[11px] font-semibold">Built-In</div>
      {[...BUILT_IN_EQUATIONS, ...(saved.length ? [{ label: "", tex: "" }, ...saved] : [])].map((item, index) =>
        item.label === "" ? (
          <div key={`saved-${index}`} className="px-2 py-1 text-[11px] font-semibold">
            General
          </div>
        ) : (
          <MenuButton
            key={`${item.label}-${index}`}
            onClick={() => {
              setTex(item.tex)
              close()
            }}
          >
            <span className="flex flex-col items-start gap-0.5" title={item.label} aria-label={item.label}>
              <span className="text-[11px] opacity-70">{item.label}</span>
              <EquationPreview tex={item.tex} display={false} />
            </span>
          </MenuButton>
        ),
      )}
      <div className="mx-2 my-1 border-t border-black/10" />
      <MenuButton
        onClick={() => {
          close()
          void saveSelection()
        }}
      >
        Save Selection to Equation Gallery…
      </MenuButton>
    </div>
  )
  const conversionPicker = (
    <label className="flex items-center gap-1 text-[11px]">
      <span className="sr-only">Convert to</span>
      <select
        aria-label="Convert to"
        value={conversion}
        disabled={!ready}
        onChange={(event) => setConversion(event.target.value as EquationText)}
      >
        <option value="unicode">Unicode</option>
        <option value="latex">LaTeX</option>
        <option value="text">Text</option>
      </select>
    </label>
  )

  const add = (template: string) => {
    if (tex !== null) {
      editor
        ?.chain()
        .focus()
        .updateAttributes("equation", { tex: appendTemplate(tex, template) })
        .run()
    }
  }
  const menuFor = (group: EquationGroup) => (close: () => void) => (
    <div className="flex min-w-[200px] flex-col gap-0.5 p-1">
      {group.items.map((item) => (
        <MenuButton
          key={item.label}
          onClick={() => {
            add(item.tex)
            close()
          }}
        >
          <span className="flex items-center gap-3" title={item.label} aria-label={item.label}>
            <EquationPreview tex={item.tex.replace(/#\d/g, "\\square ")} display={false} />
            <span className="text-[11px] opacity-70">{item.label}</span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const dialog =
    editing && editor && tex !== null ? (
      <EquationEditor
        title="Edit Equation"
        initial={tex}
        ok="OK"
        onClose={() => setEditing(false)}
        onOk={(next) => {
          editor
            .chain()
            .focus()
            .updateAttributes("equation", { tex: next.trim() || "x=y" })
            .run()
          setEditing(false)
        }}
      />
    ) : null

  if (ribbonLayout === "single") {
    const menus = (groups: EquationGroup[]): LineCommand[] =>
      groups.map((group) => ({
        id: group.id,
        label: group.label,
        showLabel: true,
        disabled: !ready,
        menu: menuFor(group),
      }))
    return (
      <>
        <SingleLineBar
          label="Equation"
          groups={[
            {
              id: "tools",
              commands: [
                {
                  id: "gallery",
                  label: "Equation",
                  icon: <LineEquationIcon />,
                  showLabel: true,
                  priority: 1,
                  disabled: !ready,
                  menu: galleryMenu,
                },
                {
                  id: "convert",
                  label: "Convert",
                  icon: <LineEquationIcon />,
                  priority: 2,
                  disabled: !ready,
                  onClick: convert,
                },
                {
                  id: "edit",
                  label: "Edit Equation",
                  icon: <LineEquationIcon />,
                  showLabel: true,
                  priority: 1,
                  disabled: !ready,
                  onClick: () => setEditing(true),
                },
              ],
            },
            { id: "structures", commands: menus(EQUATION_STRUCTURES) },
          ]}
          more={[{ id: "symbols", commands: menus(EQUATION_SYMBOLS) }]}
        />
        {dialog}
      </>
    )
  }

  const row = (groups: EquationGroup[]): ReactNode =>
    groups.map((group) => (
      <RibbonCommand key={group.id} size="small" label={group.label} disabled={!ready} menu={menuFor(group)}>
        <LineEquationIcon />
      </RibbonCommand>
    ))

  return (
    <div role="toolbar" aria-label="Equation" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Tools">
        <RibbonCommand size="large" label="Equation" disabled={!ready} menu={galleryMenu}>
          <LineEquationIcon />
        </RibbonCommand>
        <RibbonCommand size="large" label="Edit Equation" disabled={!ready} onClick={() => setEditing(true)}>
          <LineEquationIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Conversions">
        <div className="flex flex-col gap-1 py-1">
          {conversionPicker}
          <RibbonCommand size="small" label="Convert" disabled={!ready} onClick={convert}>
            <LineEquationIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <div className="flex max-w-[320px] flex-wrap items-center gap-0.5 py-1">
          {symbols.items.slice(0, 14).map((item) => (
            <button
              key={item.label}
              type="button"
              className="equation-item"
              title={item.label}
              aria-label={item.label}
              disabled={!ready}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(item.tex)}
            >
              <EquationPreview tex={item.tex} display={false} />
            </button>
          ))}
        </div>
        <select aria-label="Symbol category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {EQUATION_SYMBOLS.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </RibbonGroup>
      <RibbonGroup label="Structures">{row(EQUATION_STRUCTURES)}</RibbonGroup>
      {dialog}
    </div>
  )
}
