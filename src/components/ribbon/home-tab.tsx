import { applyFontColor, toggleBold } from "@/editor/shape-text"
import { openFontMenu } from "@/components/font-menu"
import { ListDialogs, BulletLibrary, MultilevelLibrary, NumberingLibrary } from "@/components/list-library"
import { requestFormatDialog } from "@/components/format-dialogs"
import { useStyleDialogs } from "@/components/style-dialogs"
import { TextEffectsMenu } from "@/components/text-effects-menu"
import { useClipboard } from "@/document/clipboard"
import {
  AddInsIcon,
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BordersIcon,
  BulletsIcon,
  ChevronDownIcon,
  ClearFormatIcon,
  CopyIcon,
  CutIcon,
  FindIcon,
  FormatPainterIcon,
  GrowFontIcon,
  IndentIcon,
  LetterGlyph,
  LineSpacingIcon,
  MultilevelIcon,
  NumberingIcon,
  OutdentIcon,
  PasteIcon,
  ReplaceIcon,
  SelectIcon,
  ShadingIcon,
  ShrinkFontIcon,
  SortIcon,
  TextEffectsIcon,
} from "@/components/ribbon/icons"
import {
  activeStyleId,
  applyGalleryStyle,
  BordersMenu,
  CaseMenu,
  FindMenu,
  FontColorMenu,
  FontNameMenu,
  FontSizeMenu,
  useGalleryStyles,
  type GalleryStyle,
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
import { HomeLine } from "@/components/ribbon/home-line"
import { fontLabelAt, fontSizeLabel } from "@/components/ribbon/options"
import {
  RibbonGroup,
  RibbonHover,
  RibbonPopover,
  RibbonSplit,
  RibbonTipContent,
} from "@/components/ribbon/ribbon-button"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useDocumentStore } from "@/document/store"
import { useStyleStore } from "@/document/styles"
import { useViewStore } from "@/document/view"
import { formattingMarksShortcut } from "@/lib/platform"
import { changeIndent, stepFontSize } from "@/editor/actions"
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
  copySelection,
  cutSelection,
  formatPainterActive,
  pasteFromClipboard,
  setBlockBorder,
  sortBlocks,
  subscribeFormatPainter,
} from "@/editor/home-actions"
import { chainWithSelection } from "@/editor/selection-memory"
import { useActiveMarks } from "@/editor/use-active-marks"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react"

const STYLES_MIN = 96
const COLLAPSED_GROUP = 54

function useHomeCollapse() {
  const barRef = useRef<HTMLDivElement>(null)
  const cache = useRef({ editing: 108, addins: 70 })
  const [level, setLevel] = useState(0)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) {
      return
    }
    const measure = () => {
      const width = (group: string) => bar.querySelector<HTMLElement>(`[data-group="${group}"]`)?.offsetWidth ?? 0
      const editing = bar.querySelector<HTMLElement>('[data-group="editing"]')
      const addins = bar.querySelector<HTMLElement>('[data-group="addins"]')
      if (editing && editing.dataset.collapsed !== "true") {
        cache.current.editing = editing.offsetWidth
      }
      if (addins && addins.dataset.collapsed !== "true") {
        cache.current.addins = addins.offsetWidth
      }
      const left = width("clipboard") + width("font") + width("paragraph")
      const available = bar.clientWidth
      const needed = (next: number) =>
        left +
        STYLES_MIN +
        (next >= 2 ? COLLAPSED_GROUP : cache.current.editing) +
        (next >= 1 ? COLLAPSED_GROUP : cache.current.addins)
      let next = 0
      if (needed(0) > available) {
        next = 1
      }
      if (needed(1) > available) {
        next = 2
      }
      setLevel((current) => (current === next ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  return { barRef, level }
}

export function HomeTab() {
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  return ribbonLayout === "single" ? <HomeLine /> : <ClassicHome />
}

function ClassicHome() {
  const editor = useDocumentEditor()
  const marks = useActiveMarks(editor)
  const bodyLabel = themeBodyLabel(useDocumentStore((state) => state.pageSetup.bodyFont))
  const styleFont = useStyleFont(marks)
  const showFormattingMarks = useViewStore((state) => state.showFormattingMarks)
  const toggleFormattingMarks = useViewStore((state) => state.toggleFormattingMarks)
  const painting = useSyncExternalStore(subscribeFormatPainter, formatPainterActive)
  const [listDialog, setListDialog] = useState<null | "number-format" | "number-value" | "bullet" | "multilevel">(null)
  const [highlightColor, setHighlightColor] = useState("#fff2cc")
  const [fontColor, setFontColor] = useState("#d13438")
  const [lastBorder, setLastBorder] = useState<BorderId>("bottom")
  const selectionEmpty = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.state.selection.empty ?? true,
  })
  const docStyles = useStyleStore((state) => state.styles)
  const styleId = activeStyleId(marks, docStyles)
  const gallery = useGalleryStyles()
  const { barRef, level } = useHomeCollapse()

  useEffect(() => {
    editor?.view.dom.classList.toggle("format-painter", painting)
  }, [editor, painting])

  function run(command: () => void) {
    if (!editor) {
      return
    }
    command()
  }

  return (
    <div ref={barRef} role="toolbar" aria-label="Home" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup
        name="clipboard"
        label="Clipboard"
        className="shrink-0"
        launchLabel="Clipboard"
        onLaunch={() => useClipboard.getState().toggle()}
      >
        <div className="flex items-start gap-0.5 pt-0.5">
          <div className="flex w-[52px] flex-col items-center">
            <Pressable
              label="Paste"
              className="ribbon-large"
              disabled={!editor}
              onClick={() => editor && void pasteFromClipboard(editor, "source")}
            >
              <PasteIcon />
            </Pressable>
            <div className="flex items-center">
              <Pressable
                label="Paste"
                className="px-0.5 text-[11px] text-[var(--app-ribbon-text)]"
                disabled={!editor}
                onClick={() => editor && void pasteFromClipboard(editor, "source")}
              >
                Paste
              </Pressable>
              <RibbonPopover
                label="Paste options"
                className="h-3 w-2.5 gap-0 px-0"
                disabled={!editor}
                content={(close) => <PasteMenu editor={editor} close={close} />}
              >
                <ChevronDownIcon />
              </RibbonPopover>
            </div>
          </div>
          <div className="flex flex-col">
            <Pressable
              label="Cut"
              className="ribbon-mini"
              disabled={!editor || (selectionEmpty ?? true)}
              onClick={() => editor && cutSelection(editor)}
            >
              <CutIcon />
              <span>Cut</span>
            </Pressable>
            <Pressable
              label="Copy"
              className="ribbon-mini"
              disabled={!editor || (selectionEmpty ?? true)}
              onClick={() => editor && copySelection(editor)}
            >
              <CopyIcon />
              <span>Copy</span>
            </Pressable>
            <Pressable
              label="Format Painter"
              className="ribbon-mini"
              pressed={painting}
              disabled={!editor}
              onClick={() => editor && armFormatPainter(editor, false)}
              onDoubleClick={() => editor && armFormatPainter(editor, true)}
            >
              <FormatPainterIcon />
              <span>Format Painter</span>
            </Pressable>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup
        name="font"
        label="Font"
        className="shrink-0"
        onLaunch={() => requestFormatDialog("font")}
        launchLabel="Font"
      >
        <div className="flex flex-col gap-0.5 pt-0.5">
          <div className="flex items-center gap-0.5">
            <RibbonPopover
              label="Font"
              className="ribbon-combo w-36"
              onOpen={openFontMenu}
              content={(close) => <FontNameMenu editor={editor} marks={marks} bodyLabel={bodyLabel} close={close} />}
            >
              <span className="truncate">{fontLabelAt(marks.fontFamily || styleFont.family, bodyLabel)}</span>
              <ChevronDownIcon />
            </RibbonPopover>
            <RibbonPopover
              label="Font size"
              className="ribbon-combo w-14"
              content={(close) => <FontSizeMenu editor={editor} marks={marks} close={close} />}
            >
              <span className="tabular-nums">{fontSizeLabel(marks.fontSize || styleFont.size)}</span>
              <ChevronDownIcon />
            </RibbonPopover>
            <Pressable
              label="Grow Font"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && stepFontSize(editor, 1)}
            >
              <GrowFontIcon />
            </Pressable>
            <Pressable
              label="Shrink Font"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && stepFontSize(editor, -1)}
            >
              <ShrinkFontIcon />
            </Pressable>
            <RibbonPopover
              label="Change Case"
              className="ribbon-tool w-auto gap-0 px-0.5"
              disabled={!editor || (selectionEmpty ?? true)}
              content={(close) => <CaseMenu editor={editor} close={close} />}
            >
              <LetterGlyph>Aa</LetterGlyph>
              <ChevronDownIcon />
            </RibbonPopover>
            <Pressable
              label="Clear All Formatting"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && clearFormatting(editor)}
            >
              <ClearFormatIcon />
            </Pressable>
          </div>
          <div className="flex items-center gap-0.5">
            <Pressable
              label="Bold"
              className="ribbon-tool"
              pressed={marks.bold}
              disabled={!editor}
              onClick={() => run(() => toggleBold(editor!))}
            >
              <LetterGlyph>
                <span className="ribbon-bold-glyph">B</span>
              </LetterGlyph>
            </Pressable>
            <Pressable
              label="Italic"
              className="ribbon-tool"
              pressed={marks.italic}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).toggleItalic().run())}
            >
              <LetterGlyph>
                <span className="italic">I</span>
              </LetterGlyph>
            </Pressable>
            <RibbonSplit
              label="Underline"
              menuLabel="Underline styles"
              className="ribbon-tool w-auto px-0.5"
              active={marks.underline}
              disabled={!editor}
              onClick={() =>
                run(() =>
                  marks.underline
                    ? chainWithSelection(editor!).unsetUnderline().run()
                    : chainWithSelection(editor!).setMark("underline", { style: "solid" }).run(),
                )
              }
              menu={(close) => <UnderlineMenu editor={editor} marks={marks} close={close} />}
            >
              <LetterGlyph>
                <span className="underline">U</span>
              </LetterGlyph>
            </RibbonSplit>
            <Pressable
              label="Strikethrough"
              className="ribbon-tool"
              pressed={marks.strike}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).toggleStrike().run())}
            >
              <LetterGlyph strike>ab</LetterGlyph>
            </Pressable>
            <Pressable
              label="Subscript"
              className="ribbon-tool"
              pressed={marks.subscript}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).toggleMark("subscript").run())}
            >
              <LetterGlyph>
                x<sub className="text-[9px]">2</sub>
              </LetterGlyph>
            </Pressable>
            <Pressable
              label="Superscript"
              className="ribbon-tool"
              pressed={marks.superscript}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).toggleMark("superscript").run())}
            >
              <LetterGlyph>
                x<sup className="text-[9px]">2</sup>
              </LetterGlyph>
            </Pressable>
            <RibbonPopover
              label="Text Effects and Typography"
              className="ribbon-tool"
              contentClassName="w-max p-1"
              active={Boolean(marks.effect)}
              disabled={!editor}
              content={(close) =>
                editor ? <TextEffectsMenu editor={editor} active={marks.effect} onClose={close} /> : null
              }
            >
              <TextEffectsIcon />
            </RibbonPopover>
            <RibbonSplit
              label="Text Highlight Color"
              menuLabel="Text Highlight Color menu"
              className="ribbon-tool w-auto flex-col gap-0 px-0.5"
              active={Boolean(marks.highlight)}
              disabled={!editor}
              onClick={() =>
                run(() =>
                  chainWithSelection(editor!)
                    .setHighlight({ color: marks.highlight || highlightColor })
                    .run(),
                )
              }
              menu={(close) => <HighlightMenu editor={editor} marks={marks} onPick={setHighlightColor} close={close} />}
            >
              <span className="text-[13px] leading-none font-semibold text-[var(--app-ribbon-text)]">ab</span>
              <span
                className="mt-0.5 h-[3px] w-4 rounded-sm"
                style={{ background: marks.highlight || highlightColor }}
              />
            </RibbonSplit>
            <RibbonSplit
              label="Font Color"
              menuLabel="Font Color menu"
              className="ribbon-tool w-auto flex-col gap-0 px-0.5"
              active={Boolean(marks.color)}
              disabled={!editor}
              onClick={() => run(() => applyFontColor(editor!, marks.color || fontColor))}
              menu={(close) => <FontColorMenu editor={editor} marks={marks} onPick={setFontColor} close={close} />}
            >
              <span className="text-[14px] leading-none font-semibold text-[var(--app-ribbon-text)]">A</span>
              <span className="mt-0.5 h-[3px] w-4 rounded-sm" style={{ background: marks.color || fontColor }} />
            </RibbonSplit>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup
        name="paragraph"
        label="Paragraph"
        className="shrink-0"
        onLaunch={() => requestFormatDialog("paragraph")}
        launchLabel="Paragraph"
      >
        <div className="flex flex-col gap-0.5 pt-0.5">
          <div className="flex items-center gap-0.5">
            <RibbonSplit
              label="Bullets"
              menuLabel="Bullets menu"
              className="ribbon-tool w-auto px-0.5"
              contentClassName="w-max p-1"
              active={marks.bulletList}
              disabled={!editor}
              onClick={() => {
                if (!editor) {
                  return
                }
                if (marks.bulletList) {
                  clearList(editor)
                  return
                }
                applyBullet(editor, currentBulletMarker())
              }}
              menu={(close) =>
                editor ? (
                  <BulletLibrary
                    editor={editor}
                    active={marks.bulletMarker}
                    inList={marks.bulletList}
                    onDialog={setListDialog}
                    onClose={close}
                  />
                ) : null
              }
            >
              <BulletsIcon />
            </RibbonSplit>
            <RibbonSplit
              label="Numbering"
              menuLabel="Numbering menu"
              className="ribbon-tool w-auto px-0.5"
              contentClassName="w-max p-1"
              active={marks.orderedList}
              disabled={!editor}
              onClick={() => {
                if (!editor) {
                  return
                }
                if (marks.orderedList) {
                  clearList(editor)
                  return
                }
                applyNumbering(editor, currentNumberMarker())
              }}
              menu={(close) =>
                editor ? (
                  <NumberingLibrary
                    editor={editor}
                    active={marks.numberMarker}
                    inList={marks.orderedList}
                    onDialog={setListDialog}
                    onClose={close}
                  />
                ) : null
              }
            >
              <NumberingIcon />
            </RibbonSplit>
            <RibbonSplit
              label="Multilevel List"
              menuLabel="Multilevel List menu"
              className="ribbon-tool w-auto px-0.5"
              contentClassName="w-max p-1"
              disabled={!editor}
              onClick={() => {
                if (!editor) {
                  return
                }
                applyMultilevel(editor, currentMultilevel())
              }}
              menu={(close) =>
                editor ? (
                  <MultilevelLibrary
                    editor={editor}
                    scheme={marks.listScheme}
                    inList={marks.bulletList || marks.orderedList}
                    onDialog={setListDialog}
                    onClose={close}
                  />
                ) : null
              }
            >
              <MultilevelIcon />
            </RibbonSplit>
            <Pressable
              label="Decrease Indent"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && changeIndent(editor, -1)}
            >
              <OutdentIcon />
            </Pressable>
            <Pressable
              label="Increase Indent"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && changeIndent(editor, 1)}
            >
              <IndentIcon />
            </Pressable>
            <Pressable
              label="Sort"
              className="ribbon-tool"
              disabled={!editor}
              onClick={() => editor && sortBlocks(editor, "asc")}
            >
              <SortIcon />
            </Pressable>
            <Pressable
              label="Show/Hide ¶"
              className="ribbon-tool"
              pressed={showFormattingMarks}
              disabled={!editor}
              shortcut={formattingMarksShortcut()}
              onClick={toggleFormattingMarks}
            >
              <span className="text-[15px] leading-none text-[var(--app-ribbon-text)]">¶</span>
            </Pressable>
          </div>
          <div className="flex items-center gap-0.5">
            <Pressable
              label="Align Left"
              className="ribbon-tool"
              pressed={marks.align === "left"}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).setTextAlign("left").run())}
            >
              <AlignLeftIcon />
            </Pressable>
            <Pressable
              label="Center"
              className="ribbon-tool"
              pressed={marks.align === "center"}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).setTextAlign("center").run())}
            >
              <AlignCenterIcon />
            </Pressable>
            <Pressable
              label="Align Right"
              className="ribbon-tool"
              pressed={marks.align === "right"}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).setTextAlign("right").run())}
            >
              <AlignRightIcon />
            </Pressable>
            <Pressable
              label="Justify"
              className="ribbon-tool"
              pressed={marks.align === "justify"}
              disabled={!editor}
              onClick={() => run(() => chainWithSelection(editor!).setTextAlign("justify").run())}
            >
              <AlignJustifyIcon />
            </Pressable>
            <RibbonPopover
              label="Line and Paragraph Spacing"
              className="ribbon-tool w-auto gap-0 px-0.5"
              content={(close) => <LineSpacingMenu editor={editor} marks={marks} close={close} />}
            >
              <LineSpacingIcon />
              <ChevronDownIcon />
            </RibbonPopover>
            <RibbonPopover
              label="Shading"
              className="ribbon-tool"
              active={Boolean(marks.shading)}
              disabled={!editor}
              content={(close) => <ShadingMenu editor={editor} marks={marks} close={close} />}
            >
              <ShadingIcon />
            </RibbonPopover>
            <RibbonSplit
              label="Borders"
              menuLabel="Borders menu"
              className="ribbon-tool w-auto px-0.5"
              contentClassName="w-max p-1"
              active={Boolean(marks.border)}
              disabled={!editor}
              onClick={() => {
                if (!editor) {
                  return
                }
                setBlockBorder(editor, lastBorder)
              }}
              menu={(close) => <BordersMenu editor={editor} marks={marks} onPick={setLastBorder} close={close} />}
            >
              <BordersIcon />
            </RibbonSplit>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup
        name="styles"
        label="Styles"
        className="min-w-[96px] flex-1"
        launchLabel="Manage Styles"
        onLaunch={() => useStyleDialogs.getState().openManage()}
      >
        <StyleStrip
          styles={gallery}
          editor={editor}
          activeId={styleId}
          disabled={!editor}
          onApply={(style) => {
            if (editor) {
              applyGalleryStyle(editor, style)
            }
          }}
        />
      </RibbonGroup>

      {level >= 2 ? (
        <CollapsedGroup name="editing" label="Editing" icon={<FindIcon />}>
          {(close) => <EditingControls editor={editor} close={close} />}
        </CollapsedGroup>
      ) : (
        <RibbonGroup name="editing" label="Editing" className="shrink-0">
          <EditingControls editor={editor} />
        </RibbonGroup>
      )}

      {level >= 1 ? (
        <CollapsedGroup name="addins" label="Add-ins" icon={<AddInsIcon size={20} />}>
          {() => <p className="w-44 px-2 py-1 text-xs text-neutral-600">No add-ins are installed.</p>}
        </CollapsedGroup>
      ) : (
        <RibbonGroup name="addins" label="Add-ins" className="shrink-0">
          <div className="flex items-start pt-0.5">
            <RibbonPopover
              label="Add-ins"
              className="ribbon-large h-auto w-[52px] flex-col px-1"
              content={() => <p className="w-44 px-2 py-1 text-xs text-neutral-600">No add-ins are installed.</p>}
            >
              <AddInsIcon />
              <span className="text-[11px]">Add-ins</span>
            </RibbonPopover>
          </div>
        </RibbonGroup>
      )}

      <ListDialogs editor={editor} dialog={listDialog} onClose={() => setListDialog(null)} />
    </div>
  )
}

function CollapsedGroup({
  name,
  label,
  icon,
  children,
}: {
  name: string
  label: string
  icon: ReactNode
  children: (close: () => void) => ReactNode
}) {
  return (
    <div data-group={name} data-collapsed="true" className="ribbon-group-labeled shrink-0">
      <div className="ribbon-group-body">
        <RibbonPopover
          label={label}
          className="ribbon-collapsed"
          content={(close) => (
            <div className="ribbon-group-flyout">
              {children(close)}
              <div className="ribbon-caption">{label}</div>
            </div>
          )}
        >
          <span className="ribbon-command-icon">{icon}</span>
          <span className="ribbon-command-label">
            {label}
            <ChevronDownIcon />
          </span>
        </RibbonPopover>
      </div>
    </div>
  )
}

function EditingControls({ editor, close }: { editor: Editor | null; close?: () => void }) {
  const openFind = useViewStore((state) => state.openFind)
  const finish = (menuClose: () => void) => {
    menuClose()
    close?.()
  }

  return (
    <div className="flex flex-col pt-0.5">
      <RibbonPopover
        label="Find"
        className="ribbon-mini w-full justify-start"
        disabled={!editor}
        content={(menuClose) => <FindMenu close={() => finish(menuClose)} />}
      >
        <FindIcon />
        <span>Find</span>
        <ChevronDownIcon />
      </RibbonPopover>
      <Pressable
        label="Replace"
        className="ribbon-mini"
        disabled={!editor}
        onClick={() => {
          openFind(true)
          close?.()
        }}
      >
        <ReplaceIcon />
        <span>Replace</span>
      </Pressable>
      <RibbonPopover
        label="Select"
        className="ribbon-mini w-full justify-start"
        disabled={!editor}
        content={(menuClose) => <SelectMenu editor={editor} close={() => finish(menuClose)} />}
      >
        <SelectIcon />
        <span>Select</span>
        <ChevronDownIcon />
      </RibbonPopover>
    </div>
  )
}

function StyleStrip({
  styles,
  editor,
  activeId,
  disabled,
  onApply,
}: {
  styles: GalleryStyle[]
  editor: Editor | null
  activeId: string
  disabled: boolean
  onApply: (style: GalleryStyle) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(1)
  const [start, setStart] = useState(0)

  useEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    const measure = () => {
      const chip = 68
      const gap = 4
      const fit = Math.max(1, Math.floor((element.clientWidth + gap) / (chip + gap)))
      setCount(Math.min(styles.length, fit))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [styles.length])

  const maxStart = Math.max(0, styles.length - count)
  const origin = Math.min(start, maxStart)
  const visible = styles.slice(origin, origin + count)

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-0.5 pt-1 pr-0.5">
      <div ref={scroller} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {visible.map((style) => (
          <StyleChip
            key={style.id}
            label={style.label}
            style={style.style}
            pressed={activeId === style.id}
            disabled={disabled}
            onClick={() => onApply(style)}
            onContextMenu={(event) => {
              event.preventDefault()
              const box = event.currentTarget.getBoundingClientRect()
              useStyleDialogs.getState().openChipMenu(style.id, box.left, box.bottom + 2)
            }}
          />
        ))}
      </div>
      <div className="ribbon-gallery-nav">
        <RibbonHover label="Previous styles">
          <button
            type="button"
            aria-label="Previous styles"
            aria-disabled={origin === 0 || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (origin > 0) {
                setStart(origin - 1)
              }
            }}
          >
            <GalleryArrow direction="up" />
          </button>
        </RibbonHover>
        <RibbonHover label="Next styles">
          <button
            type="button"
            aria-label="Next styles"
            aria-disabled={origin >= maxStart || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (origin < maxStart) {
                setStart(origin + 1)
              }
            }}
          >
            <GalleryArrow direction="down" />
          </button>
        </RibbonHover>
        <RibbonPopover
          label="More styles"
          className="ribbon-gallery-more"
          content={(close) => <StylesMenu editor={editor} activeId={activeId} onApply={onApply} close={close} />}
        >
          <GalleryMoreIcon />
        </RibbonPopover>
      </div>
    </div>
  )
}

function GalleryArrow({ direction }: { direction: "up" | "down" }) {
  const path = direction === "up" ? "M1.6 5.2 4 2.8 6.4 5.2" : "M1.6 2.8 4 5.2 6.4 2.8"
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GalleryMoreIcon() {
  return (
    <svg className="ribbon-chevron" viewBox="0 0 8 8" aria-hidden>
      <path
        d="M1 1.5h6M1.6 3.4 4 5.7 6.4 3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StyleChip({
  label,
  style,
  pressed,
  disabled,
  onClick,
  onContextMenu,
}: {
  label: string
  style: CSSProperties
  pressed: boolean
  disabled: boolean
  onClick: () => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <Pressable
      label={label}
      pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="ribbon-style"
    >
      <span className="ribbon-style-sample" style={style}>
        AaBbCc
      </span>
      <span className="ribbon-style-label max-w-full truncate text-[10px] leading-none font-normal text-[var(--app-ribbon-muted)] not-italic">
        {label}
      </span>
    </Pressable>
  )
}

function Pressable({
  label,
  description,
  shortcut,
  pressed = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  className,
  children,
}: {
  label: string
  description?: string
  shortcut?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={className}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) {
            onClick()
          }
        }}
        onDoubleClick={() => {
          if (!disabled) {
            onDoubleClick?.()
          }
        }}
        onContextMenu={onContextMenu}
      >
        {children}
      </TooltipTrigger>
      <RibbonTipContent label={label} description={description} shortcut={shortcut} />
    </Tooltip>
  )
}
