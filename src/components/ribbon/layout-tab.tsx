import {
  AlignObjectsMenu,
  BringForwardMenu,
  GroupMenu,
  RotateObjectMenu,
  SendBackwardMenu,
} from "@/components/arrange-menus"
import { openColumnsDialog } from "@/components/columns-dialog"
import { ColorMenu } from "@/components/color-menu"
import { RibbonSvg } from "@/components/ribbon/icons"
import {
  LineBreaksIcon,
  LineColumnsIcon,
  LineIndentLeftIcon,
  LineIndentRightIcon,
  LineMarginsIcon,
  LineNumbersLineIcon,
  LineOrientationIcon,
  LinePageBordersIcon,
  LinePageColorIcon,
  LineSizeIcon,
  LineSpacingAfterIcon,
  LineSpacingBeforeIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover } from "@/components/ribbon/ribbon-button"
import { requestPageBorders, requestPageSetup } from "@/components/design-dialogs"
import { requestFormatDialog } from "@/components/format-dialogs"
import { MARGIN_PRESETS, PAPER_SIZES, clampMargin, marginPresetId, type PageSetup } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import { updateBlocks } from "@/editor/block-format"
import { INDENT_STEP_PX, clampIndent } from "@/editor/indent"
import { selectedObject } from "@/editor/objects"
import { WrapTextMenu } from "@/components/wrap-menu"
import { PositionMenu } from "@/components/position-menu"
import { CurrentPositionIcon, CurrentWrapIcon } from "@/components/object-layout-icons"
import { insertAtSelectionEnd } from "@/editor/selection-memory"
import { useEditorState } from "@tiptap/react"
import { useEffect, useState } from "react"

const MARGIN_FIELDS = [
  { key: "marginTop", label: "Top" },
  { key: "marginRight", label: "Right" },
  { key: "marginBottom", label: "Bottom" },
  { key: "marginLeft", label: "Left" },
] as const

export function LayoutTab() {
  const editor = useDocumentEditor()
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const object = useEditorState({
    editor,
    selector: ({ editor: current }) => selectedObject(current),
  })
  const selectionPane = useViewStore((state) => state.selectionPane)
  const toggleSelectionPane = useViewStore((state) => state.toggleSelectionPane)
  const spacing = useParagraphSpacing(editor)
  function update(next: Partial<PageSetup>) {
    setPageSetup({ ...setup, ...next })
  }

  const marginsMenu = () => (
    <div className="flex w-56 flex-col gap-2 p-1">
      <div className="flex flex-col">
        {MARGIN_PRESETS.map((item) => (
          <MenuButton
            key={item.id}
            selected={marginPresetId(setup) === item.id}
            onClick={() =>
              update({
                marginTop: item.top,
                marginRight: item.right,
                marginBottom: item.bottom,
                marginLeft: item.left,
              })
            }
          >
            {item.label}
          </MenuButton>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-black/10 pt-2">
        {MARGIN_FIELDS.map((field) => (
          <MarginField
            key={field.key}
            label={field.label}
            value={setup[field.key]}
            onCommit={(value) => update({ [field.key]: value })}
          />
        ))}
      </div>
    </div>
  )
  const orientationMenu = (close: () => void) => (
    <div className="flex w-40 flex-col">
      <MenuButton
        selected={setup.orientation === "portrait"}
        onClick={() => {
          update({ orientation: "portrait" })
          close()
        }}
      >
        Portrait
      </MenuButton>
      <MenuButton
        selected={setup.orientation === "landscape"}
        onClick={() => {
          update({ orientation: "landscape" })
          close()
        }}
      >
        Landscape
      </MenuButton>
    </div>
  )
  const sizeMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      {PAPER_SIZES.map((item) => (
        <MenuButton
          key={item.id}
          selected={setup.paper === item.id}
          onClick={() => {
            update({ paper: item.id })
            close()
          }}
        >
          <span className="flex w-full items-baseline justify-between gap-3">
            <span>{item.label}</span>
            <span className="text-[11px] text-neutral-500">{item.detail}</span>
          </span>
        </MenuButton>
      ))}
    </div>
  )
  const columnsMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      {([1, 2, 3] as const).map((count) => (
        <MenuButton
          key={count}
          selected={setup.columns === count}
          onClick={() => {
            update({ columns: count })
            close()
          }}
        >
          <MenuGlyph kind={`columns-${count}`} />
          {count === 1 ? "One" : count === 2 ? "Two" : "Three"}
        </MenuButton>
      ))}
      <div className="mx-2 my-1 border-t border-black/10" />
      <MenuButton
        onClick={() => {
          openColumnsDialog(editor)
          close()
        }}
      >
        <MenuGlyph kind="columns-more" />
        More Columns…
      </MenuButton>
    </div>
  )
  const breaksMenu = (close: () => void) => (
    <div className="flex w-72 flex-col">
      <div className="break-menu-heading">Page Breaks</div>
      <BreakRow
        kind="page"
        name="Page"
        detail="Mark the point at which one page ends and the next page begins."
        onPick={() => {
          editor && insertAtSelectionEnd(editor).setPageBreak().run()
          close()
        }}
      />
      <BreakRow
        kind="column"
        name="Column"
        detail="Indicate that the text following the column break will begin in the next column."
        onPick={() => {
          editor?.chain().focus().setColumnBreak().run()
          close()
        }}
      />
      <BreakRow
        kind="wrap"
        name="Text Wrapping"
        detail="Separate text around objects on web pages, such as caption text from body text."
        onPick={() => {
          editor?.chain().focus().setHardBreak().run()
          close()
        }}
      />
      <div className="break-menu-heading">Section Breaks</div>
      <BreakRow
        kind="next"
        name="Next Page"
        detail="Insert a section break and start the new section on the next page."
        onPick={() => {
          editor?.chain().focus().insertSectionBreak("nextPage").run()
          close()
        }}
      />
      <BreakRow
        kind="continuous"
        name="Continuous"
        detail="Insert a section break and start the new section on the same page."
        onPick={() => {
          editor?.chain().focus().insertSectionBreak("continuous").run()
          close()
        }}
      />
      <BreakRow
        kind="even"
        name="Even Page"
        detail="Insert a section break and start the new section on the next even-numbered page."
        onPick={() => {
          editor?.chain().focus().insertSectionBreak("evenPage").run()
          close()
        }}
      />
      <BreakRow
        kind="odd"
        name="Odd Page"
        detail="Insert a section break and start the new section on the next odd-numbered page."
        onPick={() => {
          editor?.chain().focus().insertSectionBreak("oddPage").run()
          close()
        }}
      />
    </div>
  )
  const lineNumbersMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      <MenuButton
        selected={!setup.lineNumbers}
        onClick={() => {
          update({ lineNumbers: false })
          close()
        }}
      >
        None
      </MenuButton>
      <MenuButton
        selected={setup.lineNumbers && setup.lineNumberRestart !== "page"}
        onClick={() => {
          update({ lineNumbers: true, lineNumberRestart: "continuous" })
          close()
        }}
      >
        Continuous
      </MenuButton>
      <MenuButton
        selected={setup.lineNumbers && setup.lineNumberRestart === "page"}
        onClick={() => {
          update({ lineNumbers: true, lineNumberRestart: "page" })
          close()
        }}
      >
        Restart Each Page
      </MenuButton>
      <MenuButton
        onClick={() => {
          requestPageSetup("layout")
          close()
        }}
      >
        Line Numbering Options…
      </MenuButton>
    </div>
  )
  const hyphenationMenu = (close: () => void) => (
    <div className="flex w-40 flex-col">
      <MenuButton
        selected={!setup.hyphenation}
        onClick={() => {
          update({ hyphenation: false })
          close()
        }}
      >
        None
      </MenuButton>
      <MenuButton
        selected={setup.hyphenation}
        onClick={() => {
          update({ hyphenation: true })
          close()
        }}
      >
        Automatic
      </MenuButton>
    </div>
  )
  const positionMenu = (close: () => void) => <PositionMenu editor={editor} close={close} />
  const wrapMenu = (close: () => void) => <WrapTextMenu editor={editor} close={close} />
  const forwardMenu = (close: () => void) => <BringForwardMenu editor={editor} close={close} />
  const backwardMenu = (close: () => void) => <SendBackwardMenu editor={editor} close={close} />
  const alignMenu = (close: () => void) => <AlignObjectsMenu editor={editor} close={close} />
  const groupMenu = (close: () => void) => <GroupMenu editor={editor} close={close} />
  const rotateMenu = (close: () => void) => <RotateObjectMenu editor={editor} close={close} />

  if (ribbonLayout === "single") {
    const off = !editor
    // Word for the web's single line Layout tab, left to right (`screenshots/ribbon/`); Hyphenation and Arrange
    // are under More options.
    const page: LineCommand[] = [
      { id: "margins", label: "Margins", icon: <LineMarginsIcon />, priority: 3, menu: marginsMenu },
      {
        id: "orientation",
        label: "Orientation",
        icon: <LineOrientationIcon />,
        priority: 3,
        menu: orientationMenu,
      },
      { id: "size", label: "Size", icon: <LineSizeIcon />, priority: 3, menu: sizeMenu },
      { id: "columns", label: "Columns", icon: <LineColumnsIcon />, priority: 2, menu: columnsMenu },
      { id: "breaks", label: "Breaks", icon: <LineBreaksIcon />, priority: 2, disabled: off, menu: breaksMenu },
      { id: "line-numbers", label: "Line Numbers", icon: <LineNumbersLineIcon />, menu: lineNumbersMenu },
    ].map((command) => ({ ...command, showLabel: true }))
    const paragraph: LineCommand[] = [
      {
        id: "indent-left",
        label: "Indent Left",
        icon: <LineIndentLeftIcon />,
        description: "Move the left side of the paragraph in.",
        field: <LineSpin label="Indent Left" unit="cm" {...spacing.left} disabled={off} />,
      },
      {
        id: "indent-right",
        label: "Indent Right",
        icon: <LineIndentRightIcon />,
        field: <LineSpin label="Indent Right" unit="cm" {...spacing.right} disabled={off} />,
      },
      {
        id: "spacing-before",
        label: "Spacing Before",
        icon: <LineSpacingBeforeIcon />,
        field: <LineSpin label="Spacing Before" unit="pt" {...spacing.before} disabled={off} />,
      },
      {
        id: "spacing-after",
        label: "Spacing After",
        icon: <LineSpacingAfterIcon />,
        field: <LineSpin label="Spacing After" unit="pt" {...spacing.after} disabled={off} />,
      },
    ].map((command) => ({ ...command, showLabel: true, priority: 1 }))
    const background: LineCommand[] = [
      {
        id: "page-borders",
        label: "Page Borders",
        icon: <LinePageBordersIcon />,
        showLabel: true,
        onClick: () => requestPageBorders({ setup, onApply: (patch) => update(patch) }),
      },
      {
        id: "page-color",
        label: "Page Color",
        icon: <LinePageColorIcon color={setup.pageColor} />,
        menu: (close) => (
          <ColorMenu
            active={setup.pageColor}
            clearLabel="No Color"
            onClear={() => {
              update({ pageColor: "" })
              close()
            }}
            onSelect={(pageColor) => {
              update({ pageColor })
              close()
            }}
          />
        ),
      },
    ]
    const more: LineGroup[] = [
      {
        id: "page-setup",
        commands: [
          {
            id: "hyphenation",
            label: "Hyphenation",
            icon: <HyphenIcon />,
            active: setup.hyphenation,
            menu: hyphenationMenu,
          },
          { id: "page-setup-dialog", label: "Page Setup…", icon: <MarginsIcon />, onClick: () => requestPageSetup() },
          {
            id: "paragraph-dialog",
            label: "Paragraph…",
            icon: <span className="text-[15px] leading-none">¶</span>,
            onClick: () => requestFormatDialog("paragraph"),
          },
        ],
      },
      {
        id: "arrange",
        commands: [
          {
            id: "position",
            label: "Position",
            icon: <CurrentPositionIcon editor={editor} />,
            disabled: !object,
            menu: positionMenu,
          },
          {
            id: "wrap-text",
            label: "Wrap Text",
            icon: <CurrentWrapIcon editor={editor} />,
            disabled: !object,
            menu: wrapMenu,
          },
          {
            id: "bring-forward",
            label: "Bring Forward",
            icon: <StackIcon front />,
            disabled: !object,
            menu: forwardMenu,
          },
          { id: "send-backward", label: "Send Backward", icon: <StackIcon />, disabled: !object, menu: backwardMenu },
          {
            id: "selection-pane",
            label: "Selection Pane",
            icon: <SelectionPaneIcon />,
            active: selectionPane,
            onClick: () => toggleSelectionPane(),
          },
          { id: "align", label: "Align", icon: <AlignIcon />, disabled: !object, menu: alignMenu },
          { id: "group", label: "Group", icon: <GroupIcon />, disabled: off, menu: groupMenu },
          { id: "rotate", label: "Rotate", icon: <RotateIcon />, disabled: !object, menu: rotateMenu },
        ],
      },
    ]

    return (
      <SingleLineBar
        label="Layout"
        groups={[
          { id: "page", commands: page },
          { id: "paragraph", commands: paragraph },
          { id: "background", commands: background },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Layout" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Page Setup" className="shrink-0" onLaunch={() => requestPageSetup()} launchLabel="Page Setup">
        <RibbonCommand label="Margins" menu={marginsMenu}>
          <MarginsIcon />
        </RibbonCommand>
        <RibbonCommand label="Orientation" menu={orientationMenu}>
          <OrientationIcon landscape={setup.orientation === "landscape"} />
        </RibbonCommand>
        <RibbonCommand label="Size" menu={sizeMenu}>
          <SizeIcon />
        </RibbonCommand>
        <RibbonCommand label="Columns" menu={columnsMenu}>
          <ColumnsIcon />
        </RibbonCommand>
        <RibbonCommand label="Breaks" disabled={!editor} menu={breaksMenu}>
          <BreaksIcon />
        </RibbonCommand>
        <RibbonCommand label="Line Numbers" menu={lineNumbersMenu}>
          <LineNumbersIcon />
        </RibbonCommand>
        <RibbonCommand label="Hyphenation" active={setup.hyphenation} menu={hyphenationMenu}>
          <HyphenIcon />
        </RibbonCommand>
      </RibbonGroup>
      <ParagraphFields spacing={spacing} />
      <RibbonGroup label="Arrange" className="shrink-0">
        <RibbonCommand label="Position" disabled={!object} menu={positionMenu}>
          <CurrentPositionIcon editor={editor} size={20} />
        </RibbonCommand>
        <RibbonCommand label="Wrap Text" disabled={!object} menu={wrapMenu}>
          <CurrentWrapIcon editor={editor} size={20} />
        </RibbonCommand>
        <RibbonCommand label="Bring Forward" disabled={!object} menu={forwardMenu}>
          <StackIcon front />
        </RibbonCommand>
        <RibbonCommand label="Send Backward" disabled={!object} menu={backwardMenu}>
          <StackIcon />
        </RibbonCommand>
        <RibbonCommand label="Selection Pane" active={selectionPane} onClick={() => toggleSelectionPane()}>
          <SelectionPaneIcon />
        </RibbonCommand>
        <RibbonCommand label="Align" disabled={!object} menu={alignMenu}>
          <AlignIcon />
        </RibbonCommand>
        <RibbonCommand label="Group" disabled={!editor} menu={groupMenu}>
          <GroupIcon />
        </RibbonCommand>
        <RibbonCommand label="Rotate" disabled={!object} menu={rotateMenu}>
          <RotateIcon />
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}

const STEP_CM = (INDENT_STEP_PX / 96) * 2.54

type SpinValue = { value: string; onCommit: (value: number) => void; onStep: (direction: 1 | -1) => void }

/** The paragraph's indents and spacing as the Layout tab edits them, in either ribbon. */
function useParagraphSpacing(editor: ReturnType<typeof useDocumentEditor>) {
  const block = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return { left: 0, right: 0, before: 0, after: 8 }
      }
      const source = current.isActive("heading") ? "heading" : "paragraph"
      const attrs = current.getAttributes(source)
      return {
        left: clampIndent(attrs.indent),
        right: Number(attrs.indentRight) || 0,
        before: Number(attrs.spaceBefore) || 0,
        after: attrs.spaceAfter == null || attrs.spaceAfter === "" ? 8 : Number(attrs.spaceAfter) || 0,
      }
    },
  })
  const left = block?.left ?? 0
  const right = block?.right ?? 0
  const before = block?.before ?? 0
  const after = block?.after ?? 8

  function apply(attrs: Record<string, unknown>) {
    if (editor) {
      updateBlocks(editor, attrs)
    }
  }

  return {
    left: {
      value: (left * STEP_CM).toFixed(2),
      onCommit: (value) => apply({ indent: clampIndent(Math.round(value / STEP_CM)) }),
      onStep: (direction) => apply({ indent: clampIndent(left + direction) }),
    },
    right: {
      value: (right / 10).toFixed(2),
      onCommit: (value) => apply({ indentRight: Math.max(0, value * 10) }),
      onStep: (direction) => apply({ indentRight: Math.max(0, right + direction) }),
    },
    before: {
      value: String(before),
      onCommit: (value) => apply({ spaceBefore: Math.max(0, value) }),
      onStep: (direction) => apply({ spaceBefore: Math.max(0, before + direction) }),
    },
    after: {
      value: String(after),
      onCommit: (value) => apply({ spaceAfter: Math.max(0, value) }),
      onStep: (direction) => apply({ spaceAfter: Math.max(0, after + direction) }),
    },
  } satisfies Record<string, SpinValue>
}

function ParagraphFields({ spacing }: { spacing: ReturnType<typeof useParagraphSpacing> }) {
  return (
    <RibbonGroup
      label="Paragraph"
      className="shrink-0"
      onLaunch={() => requestFormatDialog("paragraph")}
      launchLabel="Paragraph"
    >
      <div className="layout-paragraph">
        <div className="layout-paragraph-col">
          <div className="layout-paragraph-heading">Indent</div>
          <SpinField label="Left" unit="cm" {...spacing.left} />
          <SpinField label="Right" unit="cm" {...spacing.right} />
        </div>
        <div className="layout-paragraph-col">
          <div className="layout-paragraph-heading">Spacing</div>
          <SpinField label="Before" unit="pt" {...spacing.before} />
          <SpinField label="After" unit="pt" {...spacing.after} />
        </div>
      </div>
    </RibbonGroup>
  )
}

/**
 * A spin box on the single line ribbon (Indent Left [0 cm]): the number with its unit, typed and committed on Enter
 * or when focus leaves, or stepped with the arrows.
 */
function LineSpin({
  label,
  unit,
  value,
  onCommit,
  onStep,
  disabled = false,
}: SpinValue & { label: string; unit: string; disabled?: boolean }) {
  const shown = `${Number(value)} ${unit}`
  const [text, setText] = useState(shown)

  useEffect(() => {
    setText(shown)
  }, [shown])

  function commit() {
    const number = Number.parseFloat(text.replace(",", "."))
    if (Number.isFinite(number) && `${number} ${unit}` !== shown) {
      onCommit(Math.max(0, number))
    } else {
      setText(shown)
    }
  }

  return (
    <span className="line-spin" aria-disabled={disabled || undefined}>
      <input
        aria-label={`${label} in ${unit === "cm" ? "centimeters" : "points"}`}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            onStep(event.key === "ArrowUp" ? 1 : -1)
          }
        }}
      />
      <span className="line-spin-buttons">
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onStep(1)}
        >
          <Caret direction="up" />
        </button>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onStep(-1)}
        >
          <Caret direction="down" />
        </button>
      </span>
    </span>
  )
}

function SpinField({
  label,
  unit,
  value,
  onCommit,
  onStep,
}: {
  label: string
  unit: string
  value: string
  onCommit: (value: number) => void
  onStep: (direction: 1 | -1) => void
}) {
  return (
    <RibbonHover label={label}>
      <label className="layout-spin">
        <span className="layout-spin-name">{label}</span>
        <input
          aria-label={
            label === "Left" || label === "Right"
              ? `${label} indent in centimeters`
              : `Spacing ${label.toLowerCase()} in points`
          }
          type="number"
          min={0}
          step={unit === "cm" ? 0.1 : 1}
          value={value}
          onChange={(event) => onCommit(Math.max(0, Number(event.target.value) || 0))}
        />
        <span className="layout-spin-buttons">
          <button
            type="button"
            aria-label={`Increase ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onStep(1)}
          >
            <Caret direction="up" />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onStep(-1)}
          >
            <Caret direction="down" />
          </button>
        </span>
        <span className="layout-spin-unit">{unit}</span>
      </label>
    </RibbonHover>
  )
}

function Caret({ direction }: { direction: "up" | "down" }) {
  const path = direction === "up" ? "M1 4.2 3.5 1.6 6 4.2" : "M1 1.8 3.5 4.4 6 1.8"
  return (
    <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function MarginField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit() {
    const next = clampMargin(Number(text))
    setText(String(next))
    if (next !== value) {
      onCommit(next)
    }
  }

  return (
    <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={10}
          max={60}
          step={0.1}
          aria-label={`${label} margin in millimeters`}
          value={text}
          className="h-7 w-full rounded-md border border-black/10 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-neutral-400"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
        />
        <span>mm</span>
      </span>
    </label>
  )
}

function MarginsIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="3.2" y="1.4" width="9.6" height="13.2" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M5.2 3.6h5.6M5.2 12.4h5.6M5.2 3.6v8.8M10.8 3.6v8.8" fill="none" stroke="#0f6cbd" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function OrientationIcon({ landscape }: { landscape: boolean }) {
  const box = landscape ? { x: 1.6, y: 3.6, w: 12.8, h: 8.8 } : { x: 3.4, y: 1.4, w: 9.2, h: 13.2 }
  return (
    <RibbonSvg size={20}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M5.2 6.2h5.6M5.2 8.2h4" stroke="#b0b0b0" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function SizeIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="3.2" y="1.4" width="9.6" height="13.2" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path
        d="M5 12.4h6.2M5 12.4v-1.4M11.2 12.4v-1.4"
        fill="none"
        stroke="#0f6cbd"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function ColumnsIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2.2" y="1.6" width="11.6" height="12.8" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M6.2 1.6v12.8M9.8 1.6v12.8" stroke="#0f6cbd" strokeWidth="0.8" />
    </RibbonSvg>
  )
}

function BreaksIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="3.4" y="1.4" width="9.2" height="5.2" rx="0.5" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <rect x="3.4" y="9.4" width="9.2" height="5.2" rx="0.5" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M5.2 8h5.6" stroke="#0f6cbd" strokeWidth="0.9" strokeDasharray="1.1 0.8" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function LineNumbersIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.6" y="5.2" fontSize="3.4" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        1
      </text>
      <text x="0.6" y="8.6" fontSize="3.4" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        2
      </text>
      <text x="0.6" y="12" fontSize="3.4" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        3
      </text>
      <rect x="4.4" y="1.6" width="9.4" height="12.8" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M6.2 4.6h5.6M6.2 7.2h5.6M6.2 9.8h4" stroke="#b0b0b0" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function HyphenIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.8" y="10.6" fontSize="6.2" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        ab
      </text>
      <path d="M9.6 7.6h4.4" stroke="#0f6cbd" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function StackIcon({ front = false }: { front?: boolean }) {
  const back = front
    ? { x: 2, y: 6.2, fill: "#f3f3f3", stroke: "#8a8a8a" }
    : { x: 2, y: 2.2, fill: "#deecf9", stroke: "#0f6cbd" }
  const top = front
    ? { x: 6.4, y: 2.2, fill: "#deecf9", stroke: "#0f6cbd" }
    : { x: 6.4, y: 6.2, fill: "#f3f3f3", stroke: "#8a8a8a" }
  return (
    <RibbonSvg size={20}>
      <rect
        x={back.x}
        y={back.y}
        width="7.2"
        height="7.2"
        rx="0.4"
        fill={back.fill}
        stroke={back.stroke}
        strokeWidth="0.8"
      />
      <rect
        x={top.x}
        y={top.y}
        width="7.2"
        height="7.2"
        rx="0.4"
        fill={top.fill}
        stroke={top.stroke}
        strokeWidth="0.8"
      />
    </RibbonSvg>
  )
}

function SelectionPaneIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="1.6" y="2" width="12.8" height="12" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M3.4 5.2h9.2M3.4 8h9.2M3.4 10.8h6.4" stroke="#0f6cbd" strokeWidth="0.9" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function GroupIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="1.6" y="4.4" width="7.2" height="7.2" rx="0.4" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <rect x="7.2" y="1.6" width="7.2" height="7.2" rx="0.4" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.8" />
    </RibbonSvg>
  )
}

function AlignIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M1.6 3.2h12.8" stroke="#0f6cbd" strokeWidth="0.9" />
      <rect x="2" y="4.2" width="3.2" height="3.2" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.7" />
      <rect x="6.2" y="4.2" width="3.2" height="5.4" fill="#fff" stroke="#5c5c5c" strokeWidth="0.7" />
      <rect x="10.4" y="4.2" width="3.2" height="2.4" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function RotateIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="4.4" y="5" width="7" height="8" rx="0.5" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M8 1.6a6.2 6.2 0 0 1 5.6 3.6" fill="none" stroke="#0f6cbd" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M12.4 3.4 14.2 5.6 11.6 5.4" fill="#0f6cbd" />
    </RibbonSvg>
  )
}

/** The small page glyph beside a Breaks or Columns menu row (22.20, 22.21). */
function MenuGlyph({ kind }: { kind: string }) {
  const columns = kind.startsWith("columns-") ? Number(kind.slice(8)) || 0 : 0
  return (
    <svg className="menu-glyph" viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <rect x="6" y="3" width="12" height="18" rx="1" fill="none" stroke="currentColor" />
      {columns > 0
        ? Array.from({ length: columns }, (_, index) => {
            const width = 8 / columns
            return (
              <rect
                key={index}
                x={8 + index * (8 / columns)}
                y="6"
                width={width - 1}
                height="12"
                fill="currentColor"
                opacity="0.35"
              />
            )
          })
        : null}
      {kind === "columns-more" ? <path d="M9 12h6M12 9v6" stroke="currentColor" /> : null}
      {columns === 0 && kind !== "columns-more" ? (
        <path
          d={kind === "page" || kind === "next" ? "M6 12h12" : kind === "column" ? "M12 3v18" : "M8 12h8"}
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      ) : null}
    </svg>
  )
}

function BreakRow({ kind, name, detail, onPick }: { kind: string; name: string; detail: string; onPick: () => void }) {
  return (
    <MenuButton className="break-menu-row h-auto py-1" onClick={onPick}>
      <MenuGlyph kind={kind} />
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="font-medium">{name}</span>
        <span className="whitespace-normal text-[11px] text-neutral-500">{detail}</span>
      </span>
    </MenuButton>
  )
}
