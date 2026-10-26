import { openTableProperties } from "@/components/table-properties-dialog"
import { openBordersAndShading } from "@/components/borders-shading-dialog"
import { useCropMode } from "@/editor/picture-crop"
import { useLayoutDialog } from "@/document/object-layout"
import { useViewStore } from "@/document/view"
import { MenuLabel } from "@/components/menu-icons"
import { ChartSheetDialog } from "@/components/chart-sheet-dialog"
import { CHART_VARIANTS, chartSpecOf, partLabel, type ChartSpec } from "@/editor/chart-spec"
import {
  changeChart,
  formatChartPart,
  useChartPart,
  useChartTypeDialog,
  useSelectDataDialog,
} from "@/components/chart-menus"
import { ICON_NAMES, MODEL_NAMES, SHAPE_NAMES, iconMarkup } from "@/editor/insert-blocks"
import { IconLibrary } from "@/components/icon-library"
import { IF_OPERATORS, type DateFormat, type IfOperator } from "@/editor/formula"
import { pasteFromClipboard, copySelection, cutSelection } from "@/editor/home-actions"
import { openModelFormat } from "@/components/model-format-dialog"
import { objectAnchoring, objectWrap, patchObject, wrapChoicesFor } from "@/editor/objects"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection, findTable } from "@tiptap/pm/tables"
import { useEditorState } from "@tiptap/react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { EquationEditor } from "@/components/equation-editor"
import { DialogFrame } from "@/components/word-dialog"

const OBJECTS = new Set([
  "image",
  "table",
  "wordArt",
  "figure",
  "signatureLine",
  "formulaField",
  "dateField",
  "ifField",
  "textBox",
  "note",
  "threeDModel",
])

type Target = {
  name: string
  pos: number
  click: number
}

type DialogName = "alt" | "wordart" | "equation" | "figure" | "signature" | "date" | "if" | "note" | "textbox"

export function ObjectContextMenu({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<{ x: number; y: number; target: Target } | null>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const anchor = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? selectionAnchor(current) : ""),
  })

  const openedAt = useRef("")

  /** Opens the menu for `found` at `at`; a plain click never gets here (21.41), only a right-click or Shift+F10. */
  const openMenu = useCallback(
    (found: Target, at: { x: number; y: number }) => {
      openedAt.current = selectionAnchor(editor)
      setTarget(found)
      setOpenSub(null)
      setMenu({ ...at, target: found })
    },
    [editor],
  )

  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      const found = targetAtPoint(editor, event)
      if (!found) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      openMenu(found, { x: event.clientX, y: event.clientY })
    }
    const onKeyMenu = (event: KeyboardEvent) => {
      if (!(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
        return
      }
      const found = selectionTarget(editor)
      if (!found) {
        return
      }
      event.preventDefault()
      openMenu(found, placeMenu(editor, found))
    }
    const root = editor.view.dom
    // Before the text menu, which listens on the same element and leaves a right-click this menu took.
    root.addEventListener("contextmenu", onContext, true)
    root.addEventListener("keydown", onKeyMenu)
    return () => {
      root.removeEventListener("contextmenu", onContext, true)
      root.removeEventListener("keydown", onKeyMenu)
    }
  }, [editor, openMenu])

  // Moving the selection off the object the menu belongs to closes it.
  useEffect(() => {
    if (anchor !== openedAt.current) {
      setMenu(null)
    }
  }, [anchor])

  useEffect(() => {
    if (!menu) {
      return
    }
    const close = (event: PointerEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest(".object-menu, .object-dialog")) {
        return
      }
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null)
      }
    }
    const dismiss = () => setMenu(null)
    const scroller = document.getElementById("document-scroll")
    let zoom = useViewStore.getState().zoom
    const unsubscribe = useViewStore.subscribe((state) => {
      if (state.zoom === zoom) {
        return
      }
      zoom = state.zoom
      dismiss()
    })
    window.addEventListener("pointerdown", close, true)
    window.addEventListener("keydown", onKey)
    scroller?.addEventListener("scroll", dismiss, { passive: true })
    window.addEventListener("resize", dismiss)
    return () => {
      unsubscribe()
      window.removeEventListener("pointerdown", close, true)
      window.removeEventListener("keydown", onKey)
      scroller?.removeEventListener("scroll", dismiss)
      window.removeEventListener("resize", dismiss)
    }
  }, [editor, menu])

  function openDialog(name: DialogName) {
    setDialog(name)
    setMenu(null)
  }

  const current = menu?.target ?? target
  const node = current ? nodeAtPos(editor, current.pos) : null

  return (
    <>
      {menu && node
        ? createPortal(
            <div
              className="object-menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {itemsFor(
                editor,
                menu.target,
                node.attrs,
                openDialog,
                () => setMenu(null),
                openSub,
                setOpenSub,
                () => {
                  setMenu(null)
                  setIconLibraryOpen(true)
                },
              )}
            </div>,
            document.body,
          )
        : null}
      {dialog && current ? (
        <ObjectDialogs
          editor={editor}
          dialog={dialog}
          target={current}
          onClose={() => setDialog(null)}
          onOpenIconLibrary={() => {
            setDialog(null)
            setIconLibraryOpen(true)
          }}
        />
      ) : null}
      {iconLibraryOpen ? <IconLibrary editor={editor} onClose={() => setIconLibraryOpen(false)} /> : null}
    </>
  )
}

function itemsFor(
  editor: Editor,
  target: Target,
  attrs: Record<string, unknown>,
  openDialog: (name: DialogName) => void,
  close: () => void,
  openSub: string | null,
  setOpenSub: (name: string | null) => void,
  openIconLibrary: () => void,
) {
  const run = (command: () => void) => {
    selectTarget(editor, target)
    command()
    close()
  }
  const shared = [
    leaf("Cut", () => run(() => cutSelection(editor))),
    leaf("Copy", () => run(() => copySelection(editor))),
    leaf("Paste", () => run(() => void pasteFromClipboard(editor, "source"))),
    sep(),
  ]
  if (target.name === "image") {
    return (
      <>
        {shared}
        {leaf("Edit Alt Text...", () => openDialog("alt"))}
        {leaf("Change Picture...", () => changePicture(editor, target))}
        {leaf("Crop", () => run(() => useCropMode.getState().set(true)))}
        {leaf("Size and Position...", () => {
          selectTarget(editor, target)
          close()
          useLayoutDialog.getState().show("size")
        })}
        {submenu("Wrap Text", openSub, setOpenSub, wrapItems(editor, target, close, attrs))}
        {leaf("Rotate Right", () => run(() => editor.chain().focus().setObjectRotate(90).run()))}
        {leaf("Bring to Front", () => run(() => editor.chain().focus().setObjectLayer("front").run()))}
        {leaf("Send to Back", () => run(() => editor.chain().focus().setObjectLayer("back").run()))}
      </>
    )
  }
  if (target.name === "textBox") {
    return (
      <>
        {shared}
        {leaf("Format Shape...", () => openDialog("textbox"))}
        {submenu("Wrap Text", openSub, setOpenSub, wrapItems(editor, target, close, attrs))}
        {leaf("Bring to Front", () => run(() => editor.chain().focus().setObjectLayer("front").run()))}
        {leaf("Send to Back", () => run(() => editor.chain().focus().setObjectLayer("back").run()))}
      </>
    )
  }
  if (target.name === "table") {
    const empty = editor.state.selection.empty
    return (
      <>
        {leaf("Cut", () => run(() => cutSelection(editor)), empty)}
        {leaf("Copy", () => run(() => copySelection(editor)), empty)}
        {leaf("Paste", () => run(() => void pasteFromClipboard(editor, "source")))}
        {sep()}
        {submenu("Insert", openSub, setOpenSub, [
          leaf(
            "Columns to the Left",
            () => run(() => editor.chain().focus().addColumnBefore().run()),
            !editor.can().addColumnBefore(),
          ),
          leaf(
            "Columns to the Right",
            () => run(() => editor.chain().focus().addColumnAfter().run()),
            !editor.can().addColumnAfter(),
          ),
          leaf(
            "Rows Above",
            () => run(() => editor.chain().focus().addRowBefore().run()),
            !editor.can().addRowBefore(),
          ),
          leaf("Rows Below", () => run(() => editor.chain().focus().addRowAfter().run()), !editor.can().addRowAfter()),
        ])}
        {submenu("Delete", openSub, setOpenSub, [
          leaf("Columns", () => run(() => editor.chain().focus().deleteColumn().run()), !editor.can().deleteColumn()),
          leaf("Rows", () => run(() => editor.chain().focus().deleteRow().run()), !editor.can().deleteRow()),
          leaf("Table", () => run(() => editor.chain().focus().deleteTable().run()), !editor.can().deleteTable()),
        ])}
        {sep()}
        {leaf("Merge Cells", () => run(() => editor.chain().focus().mergeCells().run()), !editor.can().mergeCells())}
        {leaf("Split Cells", () => run(() => editor.chain().focus().splitCell().run()), !editor.can().splitCell())}
        {submenu("Cell Alignment", openSub, setOpenSub, [
          leaf("Align Left", () => run(() => editor.chain().focus().setCellAttribute("align", "left").run())),
          leaf("Center", () => run(() => editor.chain().focus().setCellAttribute("align", "center").run())),
          leaf("Align Right", () => run(() => editor.chain().focus().setCellAttribute("align", "right").run())),
        ])}
        {sep()}
        {leaf("Borders and Shading...", () => run(() => openBordersAndShading(editor)))}
        {leaf("Table Properties...", () => run(() => openTableProperties(editor)))}
      </>
    )
  }
  if (target.name === "wordArt") {
    return (
      <>
        {shared}
        {leaf("Edit Text...", () => openDialog("wordart"))}
        {submenu("WordArt Style", openSub, setOpenSub, [
          leaf("Gradient Blue", () => run(() => patchNode(editor, target.pos, { preset: "blue", path: "none" }))),
          leaf("Gold Shadow", () => run(() => patchNode(editor, target.pos, { preset: "gold", path: "none" }))),
          leaf("Blue Outline", () => run(() => patchNode(editor, target.pos, { preset: "outline", path: "none" }))),
          leaf("Arch Up", () => run(() => patchNode(editor, target.pos, { preset: "arc", path: "arc" }))),
          leaf("Wave", () => run(() => patchNode(editor, target.pos, { preset: "wave", path: "wave" }))),
        ])}
      </>
    )
  }
  if (target.name === "figure") {
    const kind = String(attrs.kind || "shape")
    if (kind === "icon") {
      return (
        <>
          {shared}
          {submenu(
            "Change Icon",
            openSub,
            setOpenSub,
            <IconChangeMenu
              current={String(attrs.variant || "")}
              onPick={(name) => run(() => patchNode(editor, target.pos, { variant: name, kind: "icon", src: "" }))}
              onOnline={() => {
                close()
                openIconLibrary()
              }}
            />,
          )}
        </>
      )
    }
    if (kind === "chart") {
      return (
        <>
          {shared}
          {chartItems(editor, target, openDialog, run, close, openSub, setOpenSub, attrs)}
        </>
      )
    }
    const label = kind === "model" ? "Change 3D Model..." : "Format Shape..."
    return (
      <>
        {shared}
        {leaf(label, () => openDialog("figure"))}
        {submenu("Wrap Text", openSub, setOpenSub, wrapItems(editor, target, close, attrs))}
        {leaf("Bring to Front", () => run(() => editor.chain().focus().setObjectLayer("front").run()))}
        {leaf("Send to Back", () => run(() => editor.chain().focus().setObjectLayer("back").run()))}
      </>
    )
  }
  if (target.name === "formulaField") {
    return (
      <>
        {shared}
        {leaf("Edit Equation...", () => openDialog("equation"))}
      </>
    )
  }
  if (target.name === "signatureLine") {
    return (
      <>
        {shared}
        {leaf("Signature Setup...", () => openDialog("signature"))}
      </>
    )
  }
  if (target.name === "dateField") {
    return (
      <>
        {shared}
        {leaf("Update Field", () => run(() => patchNode(editor, target.pos, { tick: Date.now() })))}
        {leaf("Edit Field...", () => openDialog("date"))}
      </>
    )
  }
  if (target.name === "ifField") {
    return (
      <>
        {shared}
        {leaf("Edit Field...", () => openDialog("if"))}
      </>
    )
  }
  if (target.name === "threeDModel") {
    return (
      <>
        {shared}
        {leaf("Format 3D Model...", () => run(() => openModelFormat()))}
        {leaf("Reset 3D Model", () =>
          run(() => editor.chain().focus().updateAttributes("threeDModel", { yaw: 0.45, pitch: 0.3, roll: 0 }).run()),
        )}
      </>
    )
  }
  return (
    <>
      {shared}
      {leaf("Edit Note...", () => openDialog("note"))}
    </>
  )
}

/** Word's Wrap Text submenu: the seven wraps, then whether a floating object moves with its text. */
function wrapItems(editor: Editor, target: Target, close: () => void, attrs: Record<string, unknown>) {
  const wrap = objectWrap(attrs.wrap)
  const anchoring = objectAnchoring(attrs.anchoring)
  const floating = target.name === "textBox" || wrap !== "inline"
  const choose = (command: () => void) => {
    selectTarget(editor, target)
    command()
    close()
  }
  return [
    ...wrapChoicesFor(editor, target.name).map((choice) =>
      leaf(
        choice.label,
        () => choose(() => editor.chain().focus().setObjectWrap(choice.id).run()),
        false,
        choice.id === wrap,
      ),
    ),
    sep(),
    leaf(
      "Move with Text",
      () => choose(() => editor.chain().focus().setObjectAnchoring("move").run()),
      !floating,
      floating && anchoring === "move",
    ),
    leaf(
      "Fix Position on Page",
      () => choose(() => editor.chain().focus().setObjectAnchoring("fixed").run()),
      !floating,
      floating && anchoring === "fixed",
    ),
    sep(),
    leaf("More Layout Options...", () => choose(() => useLayoutDialog.getState().show("wrap"))),
  ]
}

/** Word's menu for the part of a chart that was right-clicked (20.8). */
function chartItems(
  editor: Editor,
  target: Target,
  openDialog: (name: DialogName) => void,
  run: (command: () => void) => void,
  close: () => void,
  openSub: string | null,
  setOpenSub: (name: string | null) => void,
  attrs: Record<string, unknown>,
) {
  const spec = chartSpecOf(attrs)
  const picked = useChartPart.getState()
  const part = picked.pos === target.pos ? picked.part : "chartArea"
  const series = part.startsWith("series:") ? Number(part.slice("series:".length)) : -1
  const removable: Record<string, (current: ChartSpec) => ChartSpec> = {
    title: (current) => ({ ...current, title: { ...current.title, show: false } }),
    legend: (current) => ({ ...current, legend: "none" }),
    dataLabels: (current) => ({ ...current, dataLabels: "none" }),
    dataTable: (current) => ({ ...current, dataTable: false }),
    gridlines: (current) => ({ ...current, gridlines: { major: false, minor: false, vertical: false } }),
    "axisTitle:category": (current) => ({
      ...current,
      axisTitles: { ...current.axisTitles, category: { ...current.axisTitles.category, show: false } },
    }),
    "axisTitle:value": (current) => ({
      ...current,
      axisTitles: { ...current.axisTitles, value: { ...current.axisTitles.value, show: false } },
    }),
    "axis:category": (current) => ({ ...current, axes: { ...current.axes, category: false } }),
    "axis:value": (current) => ({ ...current, axes: { ...current.axes, value: false } }),
  }
  const change = (next: (current: ChartSpec) => ChartSpec) => run(() => changeChart(editor, next))
  const round = spec.type === "pie" || spec.type === "doughnut"
  return (
    <>
      {removable[part] ? leaf("Delete", () => change(removable[part]!)) : null}
      {leaf("Reset to Match Style", () =>
        change((current) => {
          const format = { ...current.format }
          delete format[part]
          return { ...current, format }
        }),
      )}
      {sep()}
      {leaf("Change Chart Type...", () => run(() => useChartTypeDialog.getState().show("change")))}
      {leaf("Select Data...", () => run(() => useSelectDataDialog.getState().show()))}
      {leaf("Edit Data...", () => openDialog("figure"))}
      {series >= 0 ? (
        <>
          {sep()}
          {leaf(spec.dataLabels === "none" ? "Add Data Labels" : "Delete Data Labels", () =>
            change((current) => ({
              ...current,
              dataLabels: current.dataLabels === "none" ? (round ? "bestFit" : "outsideEnd") : "none",
            })),
          )}
          {!round && spec.type !== "radar" && spec.grouping === "clustered"
            ? leaf("Add Trendline", () =>
                change((current) => ({
                  ...current,
                  series: current.series.map((serie, index) =>
                    index === series ? { ...serie, trendline: "linear" } : serie,
                  ),
                })),
              )
            : null}
        </>
      ) : null}
      {sep()}
      {leaf(`Format ${partLabel(spec, part)}...`, () => {
        selectTarget(editor, target)
        close()
        formatChartPart(editor, part)
      })}
      {submenu("Wrap Text", openSub, setOpenSub, wrapItems(editor, target, close, attrs))}
      {leaf("Bring to Front", () => run(() => editor.chain().focus().setObjectLayer("front").run()))}
      {leaf("Send to Back", () => run(() => editor.chain().focus().setObjectLayer("back").run()))}
    </>
  )
}

function leaf(label: string, onClick: () => void, disabled = false, checked?: boolean) {
  return (
    <button
      key={label}
      type="button"
      className="object-menu-item"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      data-checked={checked || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <MenuLabel label={label} />
    </button>
  )
}

let sepCount = 0

function sep() {
  sepCount += 1
  return <div key={`sep-${sepCount}`} className="object-menu-sep" role="separator" />
}

function submenu(
  label: string,
  openSub: string | null,
  setOpenSub: (name: string | null) => void,
  children: ReactNode,
) {
  const open = openSub === label
  return (
    <div key={label} className="object-menu-sub">
      <button
        type="button"
        className="object-menu-item"
        role="menuitem"
        aria-expanded={open}
        onClick={() => setOpenSub(open ? null : label)}
      >
        <MenuLabel label={label} />
        <span aria-hidden>›</span>
      </button>
      {open ? <div className="object-menu object-menu-flyout">{children}</div> : null}
    </div>
  )
}

function ObjectDialogs({
  editor,
  dialog,
  target,
  onClose,
  onOpenIconLibrary,
}: {
  editor: Editor
  dialog: DialogName
  target: Target
  onClose: () => void
  onOpenIconLibrary: () => void
}) {
  const node = nodeAtPos(editor, target.pos)
  if (!node) {
    return null
  }
  const attrs = node.attrs
  if (dialog === "alt") {
    return (
      <FormDialog
        title="Alt Text"
        onClose={onClose}
        onSubmit={(data) => patchNode(editor, target.pos, { alt: data.get("alt") ?? "" })}
      >
        <label>
          Description
          <input name="alt" defaultValue={String(attrs.alt ?? "")} />
        </label>
      </FormDialog>
    )
  }
  if (dialog === "wordart") {
    return (
      <FormDialog
        title="Edit WordArt"
        onClose={onClose}
        onSubmit={(data) => {
          const preset = data.get("preset") || "blue"
          const text = String(data.get("text") || "WordArt").slice(0, 80)
          patchNode(editor, target.pos, { preset })
          const next = nodeAtPos(editor, target.pos)
          if (!next) {
            return
          }
          editor
            .chain()
            .focus()
            .setTextSelection({ from: target.pos + 1, to: target.pos + next.nodeSize - 1 })
            .insertContent(text)
            .run()
        }}
      >
        <label>
          Text
          <input name="text" defaultValue={node.textContent || "WordArt"} />
        </label>
        <label>
          Style
          <select name="preset" defaultValue={String(attrs.preset || "blue")}>
            <option value="blue">Gradient Blue</option>
            <option value="orange">Gradient Orange</option>
            <option value="gold">Gold Shadow</option>
            <option value="outline">Blue Outline</option>
            <option value="arc">Arch Up</option>
            <option value="wave">Wave</option>
            <option value="deflate">Deflate</option>
            <option value="plain">Plain Black</option>
          </select>
        </label>
      </FormDialog>
    )
  }
  if (dialog === "equation") {
    return (
      <EquationEditor
        title="Edit Equation"
        initial={String(attrs.tex ?? "")}
        ok="OK"
        onClose={onClose}
        onOk={(tex) => {
          patchNode(editor, target.pos, { tex: tex.trim() || "x=y" })
          onClose()
        }}
      />
    )
  }
  if (dialog === "figure") {
    const kind = String(attrs.kind || "shape")
    if (kind === "chart") {
      return <ChartSheetDialog editor={editor} onClose={onClose} />
    }
    if (kind === "icon") {
      return createPortal(
        <DialogFrame title="Change Icon" width={224} onClose={onClose} className="object-dialog">
          <IconChangeMenu
            current={String(attrs.variant || "")}
            onPick={(name) => {
              patchNode(editor, target.pos, { variant: name, kind: "icon", src: "" })
              onClose()
            }}
            onOnline={() => {
              onClose()
              onOpenIconLibrary()
            }}
          />
        </DialogFrame>,
        document.body,
      )
    }
    return (
      <FormDialog
        title={kind === "model" ? "Change 3D Model" : "Format Shape"}
        onClose={onClose}
        onSubmit={(data) =>
          patchNode(editor, target.pos, {
            variant: data.get("variant") || attrs.variant,
            values: data.get("values") || attrs.values,
          })
        }
      >
        <label>
          {kind === "model" ? "Model" : "Shape"}
          <select name="variant" defaultValue={String(attrs.variant || "")}>
            {figureOptions(kind).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </FormDialog>
    )
  }
  if (dialog === "signature") {
    return (
      <FormDialog
        title="Signature Setup"
        onClose={onClose}
        onSubmit={(data) =>
          patchNode(editor, target.pos, { name: data.get("name") ?? "", title: data.get("title") ?? "" })
        }
      >
        <label>
          Suggested signer
          <input name="name" defaultValue={String(attrs.name ?? "")} />
        </label>
        <label>
          Suggested signer's title
          <input name="title" defaultValue={String(attrs.title ?? "")} />
        </label>
      </FormDialog>
    )
  }
  if (dialog === "date") {
    return (
      <FormDialog
        title="Date and Time"
        onClose={onClose}
        onSubmit={(data) =>
          patchNode(editor, target.pos, { format: (data.get("format") || "date") as DateFormat, tick: Date.now() })
        }
      >
        <label>
          Format
          <select name="format" defaultValue={String(attrs.format || "date")}>
            <option value="date">Date</option>
            <option value="time">Time</option>
            <option value="datetime">Date and time</option>
          </select>
        </label>
      </FormDialog>
    )
  }
  if (dialog === "if") {
    return (
      <FormDialog
        title="IF Field"
        onClose={onClose}
        onSubmit={(data) =>
          patchNode(editor, target.pos, {
            left: data.get("left") ?? "",
            operator: (data.get("operator") || "=") as IfOperator,
            right: data.get("right") ?? "",
            thenText: data.get("thenText") ?? "",
            elseText: data.get("elseText") ?? "",
          })
        }
      >
        <label>
          Left
          <input name="left" defaultValue={String(attrs.left ?? "")} />
        </label>
        <label>
          Operator
          <select name="operator" defaultValue={String(attrs.operator || "=")}>
            {IF_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>
        <label>
          Right
          <input name="right" defaultValue={String(attrs.right ?? "")} />
        </label>
        <label>
          Show if true
          <input name="thenText" defaultValue={String(attrs.thenText ?? "")} />
        </label>
        <label>
          Show if false
          <input name="elseText" defaultValue={String(attrs.elseText ?? "")} />
        </label>
      </FormDialog>
    )
  }
  if (dialog === "note") {
    return (
      <FormDialog
        title="Note"
        onClose={onClose}
        onSubmit={(data) => patchNode(editor, target.pos, { text: data.get("text") ?? "" })}
      >
        <label>
          Note text
          <input name="text" defaultValue={String(attrs.text ?? "")} />
        </label>
      </FormDialog>
    )
  }
  return (
    <FormDialog
      title="Format Shape"
      onClose={onClose}
      onSubmit={(data) =>
        patchObject(editor, target.pos, {
          width: Math.max(80, Number(data.get("width")) || 200),
          fill: data.get("fill") || "#ffffff",
          border: data.get("border") || "single",
          borderColor: data.get("borderColor") || "#d4d4d4",
        })
      }
    >
      <label>
        Width
        <input name="width" type="number" min={80} defaultValue={String(attrs.width ?? 200)} />
      </label>
      <label>
        Fill
        <input name="fill" defaultValue={String(attrs.fill ?? "#ffffff")} />
      </label>
      <label>
        Line
        <select name="border" defaultValue={String(attrs.border || "single")}>
          <option value="none">No line</option>
          <option value="single">Solid</option>
          <option value="double">Double</option>
        </select>
      </label>
      <label>
        Line color
        <input name="borderColor" defaultValue={String(attrs.borderColor ?? "#d4d4d4")} />
      </label>
    </FormDialog>
  )
}

function FormDialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit: (data: FormData) => void
  children: ReactNode
}) {
  return createPortal(
    <DialogFrame
      title={title}
      width={320}
      onClose={onClose}
      className="object-dialog"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(new FormData(event.currentTarget))
        onClose()
      }}
    >
      <div className="mt-3 flex flex-col gap-2 text-sm">{children}</div>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="dialog-btn is-primary">
          OK
        </button>
      </div>
    </DialogFrame>,
    document.body,
  )
}

function figureOptions(kind: string) {
  if (kind === "icon") {
    return ICON_NAMES
  }
  if (kind === "model") {
    return MODEL_NAMES
  }
  if (kind === "chart") {
    return CHART_VARIANTS.map((variant) => variant.id)
  }
  return SHAPE_NAMES
}

function IconChangeMenu({
  current,
  onPick,
  onOnline,
}: {
  current: string
  onPick: (name: string) => void
  onOnline: () => void
}) {
  return (
    <div className="flex w-56 flex-col">
      <div className="grid max-h-48 grid-cols-4 gap-1 overflow-auto p-1">
        {ICON_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={current === name}
            className={`flex h-9 items-center justify-center rounded hover:bg-[var(--app-hover)]${current === name ? " bg-[var(--app-hover)] ring-1 ring-[#0f6cbd]" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(name)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: iconMarkup(name) }}
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        className="object-menu-item"
        role="menuitem"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOnline}
      >
        <MenuLabel label="Online Icons…" />
      </button>
    </div>
  )
}

function changePicture(editor: Editor, target: Target) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      selectTarget(editor, target)
      patchNode(editor, target.pos, { src: String(reader.result || "") })
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

/** The node at `pos`, or null when an edit (such as Undo) has left the remembered place outside the document. */
function nodeAtPos(editor: Editor, pos: number) {
  return pos >= 0 && pos < editor.state.doc.content.size ? editor.state.doc.nodeAt(pos) : null
}

function patchNode(editor: Editor, pos: number, attrs: Record<string, unknown>) {
  const node = nodeAtPos(editor, pos)
  if (!node) {
    return
  }
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
  if (node.isAtom && tr.doc.nodeAt(pos)) {
    tr.setSelection(NodeSelection.create(tr.doc, pos))
  }
  editor.view.dispatch(tr)
}

function selectionAnchor(editor: Editor): string {
  const found = selectionTarget(editor)
  if (!found) {
    return ""
  }
  const { from, to } = editor.state.selection
  return `${found.name}:${found.pos}:${from}:${to}`
}

/**
 * Whether `pos` falls in the selection: in one of its selected cells for a cell selection, whose `from` and `to`
 * cover only the first cell. An empty selection holds nothing.
 */
export function insideSelection(editor: Editor, pos: number) {
  return editor.state.selection.ranges.some(
    (range) => range.$from.pos !== range.$to.pos && pos >= range.$from.pos && pos <= range.$to.pos,
  )
}

/** The object under a right-click, selecting it first; null leaves the click to the rest of the editor. */
function targetAtPoint(editor: Editor, event: MouseEvent): Target | null {
  const element = event.target instanceof Element ? event.target.closest(".page-image, .image-frame") : null
  if (element instanceof HTMLElement) {
    const at = editor.view.posAtDOM(element, 0)
    const direct = editor.state.doc.nodeAt(at)
    const before = at > 0 ? editor.state.doc.nodeAt(at - 1) : null
    const pos = direct?.type.name === "image" ? at : before?.type.name === "image" ? at - 1 : null
    if (pos != null) {
      editor.commands.setNodeSelection(pos)
      return { name: "image", pos, click: pos }
    }
  }
  const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (hit) {
    const places = hit.inside >= 0 ? [hit.inside] : []
    for (const place of places) {
      const $pos = editor.state.doc.resolve(place)
      const node = editor.state.doc.nodeAt(place)
      if (node && OBJECTS.has(node.type.name)) {
        editor.commands.setNodeSelection(place)
        return { name: node.type.name, pos: place, click: place }
      }
      for (let depth = $pos.depth; depth > 0; depth--) {
        const ancestor = $pos.node(depth)
        if (ancestor.type.name === "table") {
          // As in Word, a right-click in a table is in its cell: the caret goes there, or a selection it falls in
          // stays, so the menu's commands act on that cell and not on the whole table.
          if (!insideSelection(editor, hit.pos)) {
            editor.commands.setTextSelection(hit.pos)
          }
          return { name: "table", pos: $pos.before(depth), click: editor.state.selection.from }
        }
        if (OBJECTS.has(ancestor.type.name)) {
          const at = $pos.before(depth)
          editor.commands.setNodeSelection(at)
          return { name: ancestor.type.name, pos: at, click: at }
        }
      }
    }
  }
  // Selected cells answer a right-click only on them; one elsewhere goes to the text menu, which moves the caret.
  if (editor.state.selection instanceof CellSelection && !(hit && insideSelection(editor, hit.pos))) {
    return null
  }
  return selectionTarget(editor)
}

function selectionTarget(editor: Editor): Target | null {
  const selection = editor.state.selection
  if (selection instanceof CellSelection) {
    const table = findTable(selection.$anchorCell)
    if (!table) {
      return null
    }
    return { name: "table", pos: table.pos, click: selection.$anchorCell.pos }
  }
  if (selection instanceof NodeSelection && OBJECTS.has(selection.node.type.name)) {
    return { name: selection.node.type.name, pos: selection.from, click: selection.from }
  }
  return null
}

function placeMenu(editor: Editor, target: Target) {
  const dom = editor.view.nodeDOM(target.pos)
  const element = dom instanceof HTMLElement ? dom : dom instanceof Element ? dom.parentElement : null
  const rect = element?.getBoundingClientRect()
  if (rect && rect.width > 0) {
    return {
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
      y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 280)),
    }
  }
  const pos = Math.max(1, Math.min(target.pos + 1, editor.state.doc.content.size))
  const coords = editor.view.coordsAtPos(pos)
  return {
    x: Math.max(8, Math.min(coords.left, window.innerWidth - 220)),
    y: Math.max(8, Math.min(coords.bottom + 8, window.innerHeight - 280)),
  }
}

function selectTarget(editor: Editor, target: Target) {
  if (target.name === "table") {
    // A right-click inside the selection keeps it (selected cells stay selected), as in Word.
    if (insideSelection(editor, target.click)) {
      return
    }
    const pos = Math.max(1, Math.min(target.click, editor.state.doc.content.size))
    editor.commands.setTextSelection(pos)
    return
  }
  if (target.name === "wordArt" || target.name === "textBox") {
    editor.commands.setNodeSelection(target.pos)
    return
  }
  editor.commands.setNodeSelection(target.pos)
}
