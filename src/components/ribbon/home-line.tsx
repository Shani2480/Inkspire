import { AddInsMenu } from "@/components/addins"
import { applyFontColor, toggleBold } from "@/editor/shape-text"
import { useEditorPane } from "@/editor/grammar"
import { openFontMenu } from "@/components/font-menu"
import { requestFormatDialog } from "@/components/format-dialogs"
import { BulletLibrary, ListDialogs, MultilevelLibrary, NumberingLibrary } from "@/components/list-library"
import {
  activeStyleId,
  applyGalleryStyle,
  BordersMenu,
  CaseMenu,
  FindMenu,
  FontColorMenu,
  FontNameMenu,
  FontSizeMenu,
  HighlightMenu,
  LineSpacingMenu,
  PasteMenu,
  SelectMenu,
  ShadingMenu,
  StylesMenu,
  themeBodyLabel,
  useStyleFont,
  UnderlineMenu,
  type BorderId,
} from "@/components/ribbon/home-menus"
import {
  AddInsIcon,
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BordersIcon,
  BulletsIcon,
  ChecklistIcon,
  ChevronDownIcon,
  ClearFormatIcon,
  DictateIcon,
  EditorIcon,
  FindIcon,
  FontColorIcon,
  FormatPainterIcon,
  GrowFontIcon,
  HighlightIcon,
  IndentIcon,
  LetterGlyph,
  LineSpacingIcon,
  MultilevelIcon,
  NumberingIcon,
  OutdentIcon,
  PasteIcon,
  RedoIcon,
  ShadingIcon,
  ShrinkFontIcon,
  SortIcon,
  TextEffectsIcon,
  UndoIcon,
} from "@/components/ribbon/icons"
import { fontLabelAt, fontSizeLabel } from "@/components/ribbon/options"
import { MenuButton, RibbonPopover } from "@/components/ribbon/ribbon-button"
import { lineMore, SingleLineBar, type LineCommand } from "@/components/ribbon/single-line"
import { TextEffectsMenu } from "@/components/text-effects-menu"
import { useDocumentStore } from "@/document/store"
import { useStyleStore } from "@/document/styles"
import { useViewStore } from "@/document/view"
import { changeIndent, stepFontSize } from "@/editor/actions"
import { dictationSupported, useDictation } from "@/editor/dictation"
import { useDocumentEditor } from "@/editor/document-editor"
import {
  applyBullet,
  applyMultilevel,
  applyNumbering,
  armFormatPainter,
  clearFormatting,
  clearList,
  currentBulletMarker,
  currentMultilevel,
  currentNumberMarker,
  formatPainterActive,
  pasteFromClipboard,
  setBlockBorder,
  setShading,
  sortBlocks,
  subscribeFormatPainter,
} from "@/editor/home-actions"
import { chainWithSelection } from "@/editor/selection-memory"
import { useActiveMarks } from "@/editor/use-active-marks"
import { formattingMarksShortcut } from "@/lib/platform"
import { useEditorState } from "@tiptap/react"
import { useEffect, useState, useSyncExternalStore } from "react"

/** Word for the web's checklist; until list items carry a check box, it is a bullet list with an empty box. */
const CHECKLIST_MARKER = "'☐ '"

const ALIGNMENTS = [
  { id: "left", label: "Align Left", icon: <AlignLeftIcon /> },
  { id: "center", label: "Center", icon: <AlignCenterIcon /> },
  { id: "right", label: "Align Right", icon: <AlignRightIcon /> },
  { id: "justify", label: "Justify", icon: <AlignJustifyIcon /> },
] as const

/** The Home tab on the single line ribbon, in the order of Word for the web (`screenshots/ribbon/`). */
export function HomeLine() {
  const editor = useDocumentEditor()
  const marks = useActiveMarks(editor)
  const bodyLabel = themeBodyLabel(useDocumentStore((state) => state.pageSetup.bodyFont))
  const styleFont = useStyleFont(marks)
  const showFormattingMarks = useViewStore((state) => state.showFormattingMarks)
  const toggleFormattingMarks = useViewStore((state) => state.toggleFormattingMarks)
  const openFind = useViewStore((state) => state.openFind)
  const listening = useDictation((state) => state.listening)
  const painting = useSyncExternalStore(subscribeFormatPainter, formatPainterActive)
  const [listDialog, setListDialog] = useState<null | "number-format" | "number-value" | "bullet" | "multilevel">(null)
  const [highlightColor, setHighlightColor] = useState("#fff2cc")
  const [fontColor, setFontColor] = useState("#d13438")
  const [shadingColor, setShadingColor] = useState("#deecf9")
  const [lastBorder, setLastBorder] = useState<BorderId>("bottom")
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
    }),
  })
  const docStyles = useStyleStore((state) => state.styles)
  const styleId = activeStyleId(marks, docStyles)
  const styleLabel = docStyles.find((style) => style.id === styleId)?.name ?? "Normal"
  const alignment = ALIGNMENTS.find((align) => align.id === marks.align) ?? ALIGNMENTS[0]
  const checklist = marks.bulletList && marks.bulletMarker === CHECKLIST_MARKER
  const off = !editor

  useEffect(() => {
    editor?.view.dom.classList.toggle("format-painter", painting)
  }, [editor, painting])

  const chain = () => chainWithSelection(editor!)

  const undo: LineCommand[] = [
    {
      id: "undo",
      label: "Undo",
      icon: <UndoIcon />,
      priority: 3,
      disabled: off || !history?.undo,
      onClick: () => editor?.chain().focus().undo().run(),
      menu: (close) => (
        <div className="flex w-36 flex-col">
          <MenuButton
            className={history?.redo ? undefined : "pointer-events-none opacity-50"}
            onClick={() => {
              editor?.chain().focus().redo().run()
              close()
            }}
          >
            <span className="mr-2 inline-flex">
              <RedoIcon />
            </span>
            Redo
          </MenuButton>
        </div>
      ),
    },
  ]

  const clipboard: LineCommand[] = [
    {
      id: "paste",
      label: "Paste",
      icon: <PasteIcon size={16} />,
      priority: 3,
      disabled: off,
      onClick: () => editor && void pasteFromClipboard(editor, "source"),
      menu: (close) => <PasteMenu editor={editor} close={close} />,
    },
    {
      id: "format-painter",
      label: "Format Painter",
      icon: <FormatPainterIcon />,
      priority: 1,
      active: painting,
      disabled: off,
      onClick: () => editor && armFormatPainter(editor, false),
    },
  ]

  const font: LineCommand[] = [
    {
      id: "font-name",
      label: "Font",
      priority: 3,
      field: (
        <RibbonPopover
          label="Font"
          className="ribbon-combo line-combo w-32"
          disabled={off}
          onOpen={openFontMenu}
          content={(close) => <FontNameMenu editor={editor} marks={marks} bodyLabel={bodyLabel} close={close} />}
        >
          <span className="truncate">{fontLabelAt(marks.fontFamily || styleFont.family, bodyLabel)}</span>
          <ChevronDownIcon />
        </RibbonPopover>
      ),
    },
    {
      id: "font-size",
      label: "Font Size",
      priority: 3,
      field: (
        <RibbonPopover
          label="Font Size"
          className="ribbon-combo line-combo w-14"
          disabled={off}
          content={(close) => <FontSizeMenu editor={editor} marks={marks} close={close} />}
        >
          <span className="tabular-nums">{fontSizeLabel(marks.fontSize || styleFont.size)}</span>
          <ChevronDownIcon />
        </RibbonPopover>
      ),
    },
    {
      id: "grow-font",
      label: "Grow Font",
      icon: <GrowFontIcon />,
      priority: 1,
      disabled: off,
      onClick: () => editor && stepFontSize(editor, 1),
    },
    {
      id: "shrink-font",
      label: "Shrink Font",
      icon: <ShrinkFontIcon />,
      priority: 1,
      disabled: off,
      onClick: () => editor && stepFontSize(editor, -1),
    },
    {
      id: "bold",
      label: "Bold",
      icon: (
        <LetterGlyph>
          <span className="ribbon-bold-glyph">B</span>
        </LetterGlyph>
      ),
      priority: 3,
      active: marks.bold,
      disabled: off,
      onClick: () => editor && toggleBold(editor),
    },
    {
      id: "italic",
      label: "Italic",
      icon: (
        <LetterGlyph>
          <span className="italic">I</span>
        </LetterGlyph>
      ),
      priority: 3,
      active: marks.italic,
      disabled: off,
      onClick: () => chain().toggleItalic().run(),
    },
    {
      id: "underline",
      label: "Underline",
      icon: (
        <LetterGlyph>
          <span className="underline">U</span>
        </LetterGlyph>
      ),
      priority: 3,
      active: marks.underline,
      disabled: off,
      onClick: () =>
        marks.underline ? chain().unsetUnderline().run() : chain().setMark("underline", { style: "solid" }).run(),
      menu: (close) => <UnderlineMenu editor={editor} marks={marks} close={close} />,
    },
    {
      id: "highlight",
      label: "Text Highlight Color",
      icon: <HighlightIcon color={marks.highlight || highlightColor} />,
      priority: 2,
      active: Boolean(marks.highlight),
      disabled: off,
      onClick: () =>
        chain()
          .setHighlight({ color: marks.highlight || highlightColor })
          .run(),
      menu: (close) => <HighlightMenu editor={editor} marks={marks} onPick={setHighlightColor} close={close} />,
    },
    {
      id: "font-color",
      label: "Font Color",
      icon: <FontColorIcon color={marks.color || fontColor} />,
      priority: 2,
      active: Boolean(marks.color),
      disabled: off,
      onClick: () => editor && applyFontColor(editor, marks.color || fontColor),
      menu: (close) => <FontColorMenu editor={editor} marks={marks} onPick={setFontColor} close={close} />,
    },
    {
      id: "clear-formatting",
      label: "Clear All Formatting",
      icon: <ClearFormatIcon />,
      priority: 1,
      disabled: off,
      onClick: () => editor && clearFormatting(editor),
    },
    lineMore(
      "font-more",
      "More Font Options",
      [
        {
          id: "strikethrough",
          label: "Strikethrough",
          icon: <LetterGlyph strike>ab</LetterGlyph>,
          active: marks.strike,
          disabled: off,
          onClick: () => chain().toggleStrike().run(),
        },
        {
          id: "subscript",
          label: "Subscript",
          icon: (
            <LetterGlyph>
              x<sub className="text-[9px]">2</sub>
            </LetterGlyph>
          ),
          active: marks.subscript,
          disabled: off,
          onClick: () => chain().toggleMark("subscript").run(),
        },
        {
          id: "superscript",
          label: "Superscript",
          icon: (
            <LetterGlyph>
              x<sup className="text-[9px]">2</sup>
            </LetterGlyph>
          ),
          active: marks.superscript,
          disabled: off,
          onClick: () => chain().toggleMark("superscript").run(),
        },
        {
          id: "change-case",
          label: "Change Case",
          icon: <LetterGlyph>Aa</LetterGlyph>,
          disabled: off,
          menu: (close) => <CaseMenu editor={editor} close={close} />,
        },
        {
          id: "text-effects",
          label: "Text Effects and Typography",
          icon: <TextEffectsIcon />,
          active: Boolean(marks.effect),
          disabled: off,
          menu: (close) => (editor ? <TextEffectsMenu editor={editor} active={marks.effect} onClose={close} /> : null),
        },
        {
          id: "font-dialog",
          label: "Font…",
          icon: <LetterGlyph>A</LetterGlyph>,
          onClick: () => requestFormatDialog("font"),
        },
      ],
      2,
    ),
  ]

  const paragraph: LineCommand[] = [
    {
      id: "bullets",
      label: "Bullets",
      icon: <BulletsIcon />,
      priority: 3,
      active: marks.bulletList && !checklist,
      disabled: off,
      onClick: () => {
        if (!editor) {
          return
        }
        if (marks.bulletList && !checklist) {
          clearList(editor)
          return
        }
        applyBullet(editor, currentBulletMarker())
      },
      menu: (close) =>
        editor ? (
          <BulletLibrary
            editor={editor}
            active={marks.bulletMarker}
            inList={marks.bulletList}
            onDialog={setListDialog}
            onClose={close}
          />
        ) : null,
    },
    {
      id: "numbering",
      label: "Numbering",
      icon: <NumberingIcon />,
      priority: 3,
      active: marks.orderedList,
      disabled: off,
      onClick: () => {
        if (!editor) {
          return
        }
        if (marks.orderedList) {
          clearList(editor)
          return
        }
        applyNumbering(editor, currentNumberMarker())
      },
      menu: (close) =>
        editor ? (
          <NumberingLibrary
            editor={editor}
            active={marks.numberMarker}
            inList={marks.orderedList}
            onDialog={setListDialog}
            onClose={close}
          />
        ) : null,
    },
    {
      id: "checklist",
      label: "Checklist",
      icon: <ChecklistIcon />,
      priority: 1,
      active: checklist,
      disabled: off,
      onClick: () => {
        if (!editor) {
          return
        }
        if (checklist) {
          clearList(editor)
          return
        }
        applyBullet(editor, CHECKLIST_MARKER)
      },
    },
    {
      id: "decrease-indent",
      label: "Decrease Indent",
      icon: <OutdentIcon />,
      priority: 1,
      disabled: off,
      onClick: () => editor && changeIndent(editor, -1),
    },
    {
      id: "increase-indent",
      label: "Increase Indent",
      icon: <IndentIcon />,
      priority: 1,
      disabled: off,
      onClick: () => editor && changeIndent(editor, 1),
    },
    {
      id: "align",
      label: "Align",
      icon: alignment.icon,
      priority: 2,
      disabled: off,
      menu: (close) => (
        <div className="flex w-40 flex-col">
          {ALIGNMENTS.map((align) => (
            <MenuButton
              key={align.id}
              selected={marks.align === align.id}
              onClick={() => {
                chain().setTextAlign(align.id).run()
                close()
              }}
            >
              <span className="mr-2 inline-flex">{align.icon}</span>
              {align.label}
            </MenuButton>
          ))}
        </div>
      ),
    },
    {
      id: "borders",
      label: "Borders",
      icon: <BordersIcon />,
      priority: 1,
      active: Boolean(marks.border),
      disabled: off,
      onClick: () => editor && setBlockBorder(editor, lastBorder),
      menu: (close) => <BordersMenu editor={editor} marks={marks} onPick={setLastBorder} close={close} />,
    },
    {
      id: "shading",
      label: "Shading",
      icon: <ShadingIcon />,
      priority: 1,
      active: Boolean(marks.shading),
      disabled: off,
      onClick: () => editor && setShading(editor, marks.shading || shadingColor),
      menu: (close) => <ShadingMenu editor={editor} marks={marks} onPick={setShadingColor} close={close} />,
    },
    lineMore(
      "paragraph-more",
      "More Paragraph Options",
      [
        {
          id: "multilevel",
          label: "Multilevel List",
          icon: <MultilevelIcon />,
          disabled: off,
          onClick: () => editor && applyMultilevel(editor, currentMultilevel()),
          menu: (close) =>
            editor ? (
              <MultilevelLibrary
                editor={editor}
                scheme={marks.listScheme}
                inList={marks.bulletList || marks.orderedList}
                onDialog={setListDialog}
                onClose={close}
              />
            ) : null,
        },
        {
          id: "sort",
          label: "Sort",
          icon: <SortIcon />,
          disabled: off,
          onClick: () => editor && sortBlocks(editor, "asc"),
        },
        {
          id: "formatting-marks",
          label: "Show/Hide ¶",
          icon: <span className="text-[15px] leading-none">¶</span>,
          shortcut: formattingMarksShortcut(),
          active: showFormattingMarks,
          disabled: off,
          onClick: toggleFormattingMarks,
        },
        {
          id: "line-spacing",
          label: "Line and Paragraph Spacing",
          icon: <LineSpacingIcon />,
          disabled: off,
          menu: (close) => <LineSpacingMenu editor={editor} marks={marks} close={close} />,
        },
        {
          id: "paragraph-dialog",
          label: "Paragraph…",
          icon: <span className="text-[15px] leading-none">¶</span>,
          onClick: () => requestFormatDialog("paragraph"),
        },
      ],
      2,
    ),
  ]

  const styles: LineCommand[] = [
    {
      id: "styles",
      label: "Styles",
      priority: 2,
      field: (
        <RibbonPopover
          label="Styles"
          className="ribbon-combo line-combo w-28"
          disabled={off}
          content={(close) => (
            <StylesMenu
              editor={editor}
              activeId={styleId}
              onApply={(style) => editor && applyGalleryStyle(editor, style)}
              close={close}
            />
          )}
        >
          <span className="truncate">{styleLabel}</span>
          <ChevronDownIcon />
        </RibbonPopover>
      ),
    },
  ]

  const tools: LineCommand[][] = [
    [
      {
        id: "find",
        label: "Find",
        icon: <FindIcon />,
        showLabel: true,
        priority: 2,
        disabled: off,
        menu: (close) => (
          <div className="flex flex-col">
            <FindMenu close={close} />
            <MenuButton
              onClick={() => {
                openFind(true)
                close()
              }}
            >
              Replace…
            </MenuButton>
            <SelectMenu editor={editor} close={close} />
          </div>
        ),
      },
    ],
    [
      {
        id: "dictate",
        label: "Dictate",
        icon: <DictateIcon />,
        showLabel: true,
        description: dictationSupported
          ? "Type with your voice at the cursor. Select again to stop."
          : "Speech recognition is not available here.",
        active: listening,
        disabled: off || !dictationSupported,
        onClick: () => {
          if (listening) {
            useDictation.getState().stop()
          } else if (editor) {
            useDictation.getState().start(editor)
          }
        },
      },
    ],
    [
      {
        id: "editor",
        label: "Editor",
        icon: <EditorIcon />,
        showLabel: true,
        description: "Check spelling, grammar and writing suggestions.",
        disabled: off,
        onClick: () => useEditorPane.getState().openPane(),
      },
    ],
    [
      {
        id: "add-ins",
        label: "Add-ins",
        icon: <AddInsIcon size={16} />,
        menu: (close) => <AddInsMenu close={close} />,
      },
    ],
  ]

  return (
    <>
      <SingleLineBar
        label="Home"
        groups={[
          { id: "undo", commands: undo },
          { id: "clipboard", commands: clipboard },
          { id: "font", commands: font },
          { id: "paragraph", commands: paragraph },
          { id: "styles", commands: styles },
          ...tools.map((commands) => ({ id: commands[0].id, commands })),
        ]}
      />
      <ListDialogs editor={editor} dialog={listDialog} onClose={() => setListDialog(null)} />
    </>
  )
}
