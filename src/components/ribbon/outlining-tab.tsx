import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { ChevronDownIcon, RibbonSvg } from "@/components/ribbon/icons"
import {
  MenuButton,
  RibbonButton,
  RibbonCommand,
  RibbonGroup,
  RibbonHover,
  RibbonPopover,
} from "@/components/ribbon/ribbon-button"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import {
  BODY_LEVEL,
  outlineCollapse,
  outlineExpand,
  outlineMove,
  outlinePromoteDemote,
  outlineState,
  selectionLevel,
  setOutlineLevel,
  setOutlineOption,
  showOutlineLevel,
} from "@/editor/outline-view"

/**
 * Word's Outlining tab, shown in front of Home while the document is in Outline view: Outline Tools (promote and
 * demote, the Outline Level box, move, expand and collapse, Show Level, Show Text Formatting, Show First Line Only)
 * and Close Outline View. Word's Master Document group is left out: the app has no subdocuments to show.
 */

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const levelName = (level: number) => (level >= BODY_LEVEL ? "Body Text" : `Level ${level}`)
const showName = (level: number) => (level >= BODY_LEVEL ? "All Levels" : `Level ${level}`)

const stroke = {
  stroke: "var(--icon-base-color)",
  strokeWidth: 1.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
} as const
const accent = { ...stroke, stroke: "var(--icon-accent-color)", strokeWidth: 1.4 } as const

function ArrowIcon({ direction, double = false }: { direction: "left" | "right"; double?: boolean }) {
  const flip = direction === "right" ? "matrix(-1 0 0 1 16 0)" : undefined
  return (
    <RibbonSvg>
      <g transform={flip}>
        {double ? (
          <>
            <path d="M8 3.5 3.5 8 8 12.5" {...accent} />
            <path d="M12.5 3.5 8 8l4.5 4.5" {...accent} />
          </>
        ) : (
          <>
            <path d="M7 3.5 2.5 8 7 12.5" {...accent} />
            <path d="M3 8h10.5" {...accent} />
          </>
        )}
      </g>
    </RibbonSvg>
  )
}

function MoveIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <RibbonSvg>
      <g transform={direction === "down" ? "matrix(1 0 0 -1 0 16)" : undefined}>
        <path d="M3.5 7.5 8 3l4.5 4.5" {...accent} />
        <path d="M8 3.5V13" {...accent} />
      </g>
    </RibbonSvg>
  )
}

function ExpandIcon({ expand }: { expand: boolean }) {
  return (
    <RibbonSvg>
      <circle cx="8" cy="8" r="5.5" {...stroke} />
      <path d={expand ? "M5.5 8h5M8 5.5v5" : "M5.5 8h5"} {...accent} />
    </RibbonSvg>
  )
}

function CloseOutlineIcon({ size }: { size: 16 | 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="5" y="5" width="18" height="18" rx="2" fill="#c42b1c" />
      <path d="M10 10l8 8M18 10l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function useOutline(editor: Editor | null) {
  return (
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        if (!current) {
          return null
        }
        const state = outlineState(current.state)
        return {
          level: selectionLevel(current.state),
          showLevel: state.showLevel,
          showFormatting: state.showFormatting,
          firstLineOnly: state.firstLineOnly,
        }
      },
    }) ?? { level: BODY_LEVEL, showLevel: BODY_LEVEL, showFormatting: true, firstLineOnly: false }
  )
}

export function OutliningTab() {
  const editor = useBodyEditor()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const outline = useOutline(editor)
  const run = (action: (editor: Editor) => unknown) => () => {
    if (editor) {
      action(editor)
      editor.view.focus()
    }
  }
  const promoteTop = run((current) => setOutlineLevel(current, 1))
  const promote = run((current) => outlinePromoteDemote(current, -1))
  const demote = run((current) => outlinePromoteDemote(current, 1))
  const demoteBody = run((current) => setOutlineLevel(current, BODY_LEVEL))
  const moveUp = run((current) => outlineMove(current, -1))
  const moveDown = run((current) => outlineMove(current, 1))
  const expand = run(outlineExpand)
  const collapse = run(outlineCollapse)
  const toggleFormatting = run((current) => setOutlineOption(current, { showFormatting: !outline.showFormatting }))
  const toggleFirstLine = run((current) => setOutlineOption(current, { firstLineOnly: !outline.firstLineOnly }))
  const close = () => {
    setLayoutMode("print")
    editor?.view.focus()
  }

  const levelMenu = (done: () => void) => (
    <div className="flex w-36 flex-col" role="menu" aria-label="Outline Level">
      {[...LEVELS, BODY_LEVEL].map((level) => (
        <MenuButton
          key={level}
          selected={outline.level === level}
          onClick={() => {
            run((current) => setOutlineLevel(current, level))()
            done()
          }}
        >
          {levelName(level)}
        </MenuButton>
      ))}
    </div>
  )
  const showLevelMenu = (done: () => void) => (
    <div className="flex w-36 flex-col" role="menu" aria-label="Show Level">
      {[...LEVELS, BODY_LEVEL].map((level) => (
        <MenuButton
          key={level}
          selected={outline.showLevel === level}
          onClick={() => {
            run((current) => showOutlineLevel(current, level))()
            done()
          }}
        >
          {showName(level)}
        </MenuButton>
      ))}
    </div>
  )

  const levelBox = (
    <RibbonPopover
      label="Outline Level"
      description="Set the outline level of the selected paragraphs."
      className="outline-level-box"
      content={levelMenu}
    >
      <span className="min-w-[68px] text-left">{levelName(outline.level)}</span>
      <ChevronDownIcon />
    </RibbonPopover>
  )
  const showLevelBox = (
    <RibbonPopover
      label="Show Level"
      description="Show only the headings down to this level."
      className="outline-level-box"
      content={showLevelMenu}
    >
      <span className="min-w-[68px] text-left">{showName(outline.showLevel)}</span>
      <ChevronDownIcon />
    </RibbonPopover>
  )

  if (ribbonLayout === "single") {
    const tools: LineCommand[] = [
      {
        id: "promote-top",
        label: "Promote to Heading 1",
        icon: <ArrowIcon direction="left" double />,
        onClick: promoteTop,
      },
      {
        id: "promote",
        label: "Promote",
        icon: <ArrowIcon direction="left" />,
        shortcut: "Alt+Shift+Left",
        priority: 2,
        onClick: promote,
      },
      { id: "level", label: "Outline Level", field: levelBox, priority: 2 },
      {
        id: "demote",
        label: "Demote",
        icon: <ArrowIcon direction="right" />,
        shortcut: "Alt+Shift+Right",
        priority: 2,
        onClick: demote,
      },
      {
        id: "demote-body",
        label: "Demote to Body Text",
        icon: <ArrowIcon direction="right" double />,
        onClick: demoteBody,
      },
    ]
    const arrange: LineCommand[] = [
      {
        id: "move-up",
        label: "Move Up",
        icon: <MoveIcon direction="up" />,
        shortcut: "Alt+Shift+Up",
        priority: 1,
        onClick: moveUp,
      },
      {
        id: "move-down",
        label: "Move Down",
        icon: <MoveIcon direction="down" />,
        shortcut: "Alt+Shift+Down",
        priority: 1,
        onClick: moveDown,
      },
      {
        id: "expand",
        label: "Expand",
        icon: <ExpandIcon expand />,
        shortcut: "Alt+Shift+Plus",
        priority: 1,
        onClick: expand,
      },
      {
        id: "collapse",
        label: "Collapse",
        icon: <ExpandIcon expand={false} />,
        shortcut: "Alt+Shift+Minus",
        priority: 1,
        onClick: collapse,
      },
      { id: "show-level", label: "Show Level", field: showLevelBox, priority: 2 },
    ]
    const closeGroup: LineCommand[] = [
      {
        id: "close",
        label: "Close Outline View",
        icon: <CloseOutlineIcon size={16} />,
        showLabel: true,
        priority: 3,
        onClick: close,
      },
    ]
    const more: LineGroup[] = [
      {
        id: "options",
        commands: [
          {
            id: "show-formatting",
            label: "Show Text Formatting",
            active: outline.showFormatting,
            onClick: toggleFormatting,
          },
          {
            id: "first-line",
            label: "Show First Line Only",
            shortcut: "Alt+Shift+L",
            active: outline.firstLineOnly,
            onClick: toggleFirstLine,
          },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="Outlining"
        groups={[
          { id: "tools", commands: tools },
          { id: "arrange", commands: arrange },
          { id: "close", commands: closeGroup },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="Outlining" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Outline Tools" className="shrink-0">
        <div className="flex flex-col justify-center gap-1 px-1">
          <div className="flex items-center gap-0.5">
            <RibbonButton
              label="Promote to Heading 1"
              description="Make the selected paragraphs Heading 1."
              onClick={promoteTop}
            >
              <ArrowIcon direction="left" double />
            </RibbonButton>
            <RibbonButton
              label="Promote"
              description="Move the selected paragraphs up a level."
              shortcut="Alt+Shift+Left"
              onClick={promote}
            >
              <ArrowIcon direction="left" />
            </RibbonButton>
            {levelBox}
            <RibbonButton
              label="Demote"
              description="Move the selected paragraphs down a level."
              shortcut="Alt+Shift+Right"
              onClick={demote}
            >
              <ArrowIcon direction="right" />
            </RibbonButton>
            <RibbonButton
              label="Demote to Body Text"
              description="Make the selected paragraphs body text."
              onClick={demoteBody}
            >
              <ArrowIcon direction="right" double />
            </RibbonButton>
          </div>
          <div className="flex items-center gap-0.5">
            <RibbonButton
              label="Move Up"
              description="Move the selected paragraphs above the one before them."
              shortcut="Alt+Shift+Up"
              onClick={moveUp}
            >
              <MoveIcon direction="up" />
            </RibbonButton>
            <RibbonButton
              label="Move Down"
              description="Move the selected paragraphs below the one after them."
              shortcut="Alt+Shift+Down"
              onClick={moveDown}
            >
              <MoveIcon direction="down" />
            </RibbonButton>
            <RibbonButton
              label="Expand"
              description="Show the next level under the selected headings."
              shortcut="Alt+Shift+Plus"
              onClick={expand}
            >
              <ExpandIcon expand />
            </RibbonButton>
            <RibbonButton
              label="Collapse"
              description="Hide the lowest level shown under the selected headings."
              shortcut="Alt+Shift+Minus"
              onClick={collapse}
            >
              <ExpandIcon expand={false} />
            </RibbonButton>
          </div>
        </div>
        <div className="ribbon-checks outline-options">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">Show Level:</span>
            {showLevelBox}
          </div>
          <RibbonHover
            label="Show Text Formatting"
            description="Show the text with its fonts and sizes, or all in plain text."
          >
            <label className="ribbon-check">
              <input type="checkbox" checked={outline.showFormatting} onChange={toggleFormatting} />
              Show Text Formatting
            </label>
          </RibbonHover>
          <RibbonHover
            label="Show First Line Only"
            description="Show only the first line of each body text paragraph."
            shortcut="Alt+Shift+L"
          >
            <label className="ribbon-check">
              <input type="checkbox" checked={outline.firstLineOnly} onChange={toggleFirstLine} />
              Show First Line Only
            </label>
          </RibbonHover>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Close" className="ribbon-wide-label">
        <RibbonCommand label="Close Outline View" description="Go back to Print Layout." onClick={close}>
          <CloseOutlineIcon size={28} />
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}
