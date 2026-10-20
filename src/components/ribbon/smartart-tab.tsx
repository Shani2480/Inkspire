import { SmartArtColorsMenu, SmartArtLayoutsMenu } from "@/components/object-menus"
import { LineColorsIcon, LineQuickLayoutIcon, LineShapesIcon } from "@/components/ribbon/line-icons"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { GalleryNav } from "@/components/ribbon/shape-format-tab"
import { SingleLineBar, type LineCommand } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { useDocumentEditor } from "@/editor/document-editor"
import { selectedObject } from "@/editor/objects"
import {
  SMARTART_LAYOUTS,
  SMARTART_STYLES,
  useSmartArtItem,
  type SmartArtLayout,
  type SmartArtStyle,
} from "@/editor/smartart"
import {
  addBullet,
  addShape,
  canDemote,
  canMoveDown,
  canMoveUp,
  canPromote,
  demote,
  moveItem,
  promote,
  readItems,
  writeItems,
  type SmartArtItem,
} from "@/editor/smartart-model"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import type { ReactNode } from "react"
import { create } from "zustand"

/** Whether the Text Pane beside the graphic is open (22.1). */
export const useSmartArtPane = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  close: () => set({ open: false }),
}))

const DEFAULT_ACCENT = "#0f6cbd"

function Arrow({ children }: { children: string }) {
  return (
    <span aria-hidden className="text-[18px] leading-none">
      {children}
    </span>
  )
}

/** The selected SmartArt graphic's items and look, or null when no graphic is selected. */
export function useSmartArtState() {
  const editor = useDocumentEditor()
  const found = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const object = selectedObject(current)
      if (object?.name !== "smartArt") {
        return null
      }
      return {
        labels: String(object.attrs.labels ?? "[]"),
        levels: String(object.attrs.levels ?? "[]"),
        pictures: String(object.attrs.pictures ?? "[]"),
        layout: String(object.attrs.layout || "list"),
        style: String(object.attrs.style || "flat"),
        rtl: object.attrs.rtl === true,
      }
    },
  })
  const active = useSmartArtItem((state) => state.index)
  const items = found ? readItems(found.labels, found.levels, found.pictures) : []
  return { editor, found, items, active: Math.min(active, Math.max(0, items.length - 1)) }
}

/** Writes new items to the selected graphic and moves the Design tab's active item. */
export function setItems(editor: Editor | null, items: SmartArtItem[], index: number) {
  editor?.chain().updateAttributes("smartArt", writeItems(items)).run()
  useSmartArtItem.getState().set(index)
}

/** The SmartArt Design tab (22.1): appears with a selected SmartArt graphic. */
export function SmartArtDesignTab() {
  const { editor, found, items, active } = useSmartArtState()
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const pane = useSmartArtPane()
  const ready = Boolean(editor && found)
  const set = (next: Record<string, unknown>) => editor?.chain().updateAttributes("smartArt", next).run()

  const addShapeMenu = (close: () => void) => (
    <>
      <MenuButton
        onClick={() => {
          const next = addShape(items, active, true)
          setItems(editor, next.items, next.index)
          close()
        }}
      >
        Add Shape After
      </MenuButton>
      <MenuButton
        onClick={() => {
          const next = addShape(items, active, false)
          setItems(editor, next.items, next.index)
          close()
        }}
      >
        Add Shape Before
      </MenuButton>
    </>
  )
  const bullet = () => {
    const next = addBullet(items, active)
    setItems(editor, next.items, next.index)
  }
  const move = (direction: "up" | "down") => {
    const next = moveItem(items, active, direction)
    setItems(editor, next.items, next.index)
  }
  const reset = () => set({ accent: DEFAULT_ACCENT, style: "flat", rtl: false })
  const colors = (close: () => void) => <SmartArtColorsMenu editor={editor} close={close} />
  const layoutsMenu = (close: () => void) => <SmartArtLayoutsMenu editor={editor} close={close} />
  const stylesMenu = (close: () => void) => (
    <>
      {SMARTART_STYLES.map((style) => (
        <MenuButton
          key={style.id}
          selected={found?.style === style.id}
          onClick={() => {
            set({ style: style.id satisfies SmartArtStyle })
            close()
          }}
        >
          {style.label}
        </MenuButton>
      ))}
    </>
  )

  if (ribbonLayout === "single") {
    const commands: LineCommand[] = [
      {
        id: "add-shape",
        label: "Add Shape",
        icon: <LineShapesIcon />,
        showLabel: true,
        disabled: !ready,
        menu: addShapeMenu,
      },
      { id: "add-bullet", label: "Add Bullet", icon: <Arrow>•</Arrow>, disabled: !ready, onClick: bullet },
      {
        id: "text-pane",
        label: "Text Pane",
        icon: <Arrow>‹</Arrow>,
        disabled: !ready,
        active: pane.open,
        onClick: pane.toggle,
      },
      {
        id: "layouts",
        label: "Layouts",
        icon: <LineQuickLayoutIcon />,
        showLabel: true,
        disabled: !ready,
        menu: layoutsMenu,
      },
      {
        id: "colors",
        label: "Change Colors",
        icon: <LineColorsIcon />,
        showLabel: true,
        disabled: !ready,
        menu: colors,
      },
      { id: "styles", label: "SmartArt Styles", icon: <LineShapesIcon />, disabled: !ready, menu: stylesMenu },
      { id: "reset", label: "Reset Graphic", icon: <Arrow>↺</Arrow>, disabled: !ready, onClick: reset },
    ]
    return <SingleLineBar label="SmartArt Design" groups={[{ id: "design", commands }]} />
  }

  const small = (label: string, glyph: ReactNode, enabled: boolean, onClick: () => void) => (
    <RibbonCommand key={label} size="small" label={label} disabled={!ready || !enabled} onClick={onClick}>
      {glyph}
    </RibbonCommand>
  )

  return (
    <div role="toolbar" aria-label="SmartArt Design" className="ribbon-home flex items-stretch overflow-x-auto">
      <RibbonGroup label="Create Graphic">
        <RibbonCommand size="large" label="Add Shape" disabled={!ready} menu={addShapeMenu}>
          <LineShapesIcon />
        </RibbonCommand>
        <div className="flex flex-col py-0.5">
          {small("Add Bullet", <Arrow>•</Arrow>, true, bullet)}
          <RibbonCommand size="small" label="Text Pane" disabled={!ready} active={pane.open} onClick={pane.toggle}>
            <Arrow>‹</Arrow>
          </RibbonCommand>
        </div>
        <div className="flex flex-col py-0.5">
          {small("Promote", <Arrow>←</Arrow>, canPromote(items, active), () =>
            setItems(editor, promote(items, active), active),
          )}
          {small("Demote", <Arrow>→</Arrow>, canDemote(items, active), () =>
            setItems(editor, demote(items, active), active),
          )}
        </div>
        <div className="flex flex-col py-0.5">
          {small("Move Up", <Arrow>↑</Arrow>, canMoveUp(items, active), () => move("up"))}
          {small("Move Down", <Arrow>↓</Arrow>, canMoveDown(items, active), () => move("down"))}
        </div>
        <RibbonCommand
          size="small"
          label="Right to Left"
          disabled={!ready}
          active={found?.rtl}
          onClick={() => set({ rtl: !found?.rtl })}
        >
          <Arrow>⇄</Arrow>
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Layouts">
        <div className="flex items-center gap-1">
          {SMARTART_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              aria-label={layout.label}
              aria-pressed={found?.layout === layout.id}
              disabled={!ready}
              className="smartart-layout-chip"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => set({ layout: layout.id satisfies SmartArtLayout })}
            >
              {layout.label}
            </button>
          ))}
        </div>
        <GalleryNav
          label="layouts"
          canUp={false}
          canDown={false}
          onUp={() => {}}
          onDown={() => {}}
          more={layoutsMenu}
        />
      </RibbonGroup>
      <RibbonGroup label="SmartArt Styles">
        <RibbonCommand size="large" label="Change Colors" disabled={!ready} menu={colors}>
          <LineColorsIcon />
        </RibbonCommand>
        <RibbonCommand size="large" label="SmartArt Styles" disabled={!ready} menu={stylesMenu}>
          <LineShapesIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Reset">
        <RibbonCommand size="large" label="Reset Graphic" disabled={!ready} onClick={reset}>
          <Arrow>↺</Arrow>
        </RibbonCommand>
      </RibbonGroup>
    </div>
  )
}
