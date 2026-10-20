import { WrapGlyph } from "@/components/menu-icons"
import { useObjectPreview } from "@/components/object-preview-hook"
import { Check, DialogButtons, DialogFrame, Section, SpinField, trimNumber } from "@/components/word-dialog"
import { useLayoutDialog, type LayoutTab } from "@/document/object-layout"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import type { ObjectRun } from "@/editor/object-preview"
import {
  objectAnchoring,
  objectWrap,
  selectedObject,
  wrapDistance,
  wrapGaps,
  wrapSide,
  wrapsBeside,
  WRAP_CHOICES,
  WRAP_SIDES,
  type ObjectAnchoring,
  type ObjectWrap,
  type WrapSide,
} from "@/editor/objects"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

const PX_PER_CM = 96 / 2.54
const cm = (px: number) => trimNumber(px / PX_PER_CM)
const px = (value: string) => Math.round((Number(value) || 0) * PX_PER_CM)

const TABS: { id: LayoutTab; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "wrap", label: "Text Wrapping" },
  { id: "size", label: "Size" },
]

type HorizontalMode = "align" | "absolute"
type VerticalMode = "align" | "absolute"

/** The choices the dialog holds until OK: each change previews live, and OK is one undo step. */
type Draft = {
  wrap: ObjectWrap
  anchoring: ObjectAnchoring
  hMode: HorizontalMode
  alignH: string
  fromH: "margin" | "page"
  x: number
  vMode: VerticalMode
  alignV: string
  /** Below the margin (fixed on the page) or below the paragraph (moves with text). */
  fromV: "margin" | "paragraph"
  y: number
  lockAnchor: boolean
  allowOverlap: boolean
  side: WrapSide
  dist: { top: number; bottom: number; left: number; right: number }
  width: number
  height: number
  rotate: number
  lockRatio: boolean
}

/** Word's Layout dialog (More Layout Options…): Position, Text Wrapping and Size for the selected object. */
export function LayoutDialog({ editor }: { editor: Editor | null }) {
  const tab = useLayoutDialog((state) => state.tab)
  const close = useLayoutDialog((state) => state.close)
  if (!tab || !editor || !selectedObject(editor)) {
    return null
  }
  // On the body: the page canvas is transformed, which would carry a fixed dialog with it.
  return createPortal(<LayoutDialogBody editor={editor} initialTab={tab} onClose={close} />, document.body)
}

function LayoutDialogBody({
  editor,
  initialTab,
  onClose,
}: {
  editor: Editor
  initialTab: LayoutTab
  onClose: () => void
}) {
  const preview = useObjectPreview(editor)
  const [tab, setTab] = useState<LayoutTab>(initialTab)
  // The object as the dialog opened, and its size and place on the page then.
  const opened = useMemo(() => {
    const object = selectedObject(editor)!
    const dom = editor.view.nodeDOM(object.pos)
    const element = dom instanceof HTMLElement ? dom : null
    const image = element?.querySelector("img")
    const shownWidth = element?.offsetWidth ?? (Number(object.attrs.width) || 160)
    const shownHeight = element?.offsetHeight ?? (Number(object.attrs.height) || 80)
    const natural =
      object.name === "image" && image?.naturalWidth
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: Number(object.attrs.width) || shownWidth, height: Number(object.attrs.height) || shownHeight }
    return { object, shownWidth, shownHeight, natural }
  }, [editor])
  const { object } = opened
  const attrs = object.attrs
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  const startWrap = objectWrap(attrs.wrap)

  const [draft, setDraft] = useState<Draft>(() => {
    // An object leaving the line moves with its text, as the Wrap Text menu does.
    const anchoring = startWrap === "inline" ? "move" : objectAnchoring(attrs.anchoring)
    const node = editor.state.doc.nodeAt(object.pos)!
    const gaps = wrapGaps(node)
    return {
      wrap: object.name === "textBox" && startWrap === "inline" ? "front" : startWrap,
      anchoring,
      hMode: attrs.alignH ? "align" : "absolute",
      alignH: String(attrs.alignH || "left"),
      fromH: attrs.fromH === "page" ? "page" : "margin",
      x: Number(attrs.x) || 0,
      vMode: attrs.alignV && anchoring === "fixed" ? "align" : "absolute",
      alignV: String(attrs.alignV || "top"),
      fromV: anchoring === "move" ? "paragraph" : "margin",
      y: anchoring === "move" ? Number(attrs.dy) || 0 : Number(attrs.y) || 0,
      lockAnchor: attrs.lockAnchor === true,
      allowOverlap: attrs.allowOverlap !== false,
      side: wrapSide(attrs.wrapSide),
      dist: gaps,
      width: Number(attrs.width) || opened.shownWidth,
      height: Number(attrs.height) || opened.shownHeight,
      rotate: Number(attrs.rotate) || 0,
      lockRatio: object.name === "image",
    }
  })
  const [start] = useState(draft)
  const floating = draft.wrap !== "inline"
  const hasHeight = object.name !== "textBox"

  /** The commands that turn the object as it opened into the draft. */
  const runFor = (next: Draft): ObjectRun => {
    return (chain) => {
      let result = chain
      if (next.wrap !== startWrap) {
        result = result.setObjectWrap(next.wrap)
      }
      if (next.wrap !== "inline" && next.anchoring !== start.anchoring) {
        result = result.setObjectAnchoring(next.anchoring)
      }
      const changes: Record<string, unknown> = {}
      const width = next.width
      const height = next.height
      if (next.width !== start.width || next.height !== start.height) {
        changes.width = width
        if (hasHeight) {
          changes.height = height
        }
      }
      if (next.rotate !== start.rotate) {
        changes.rotate = next.rotate
      }
      if (next.wrap !== "inline") {
        const placed =
          next.hMode !== start.hMode ||
          next.alignH !== start.alignH ||
          next.fromH !== start.fromH ||
          next.x !== start.x ||
          next.vMode !== start.vMode ||
          next.alignV !== start.alignV ||
          next.y !== start.y ||
          next.anchoring !== start.anchoring ||
          // An aligned object stays aligned at its new size.
          (changes.width !== undefined && (next.hMode === "align" || next.vMode === "align"))
        if (placed) {
          Object.assign(changes, placeAttrs(next, width, height))
        }
        if (next.side !== start.side) {
          changes.wrapSide = next.side
        }
        if (JSON.stringify(next.dist) !== JSON.stringify(start.dist)) {
          Object.assign(changes, {
            distT: next.dist.top,
            distB: next.dist.bottom,
            distL: next.dist.left,
            distR: next.dist.right,
          })
        }
        if (next.lockAnchor !== start.lockAnchor) {
          changes.lockAnchor = next.lockAnchor
        }
        if (next.allowOverlap !== start.allowOverlap) {
          changes.allowOverlap = next.allowOverlap
        }
      }
      return Object.keys(changes).length ? result.updateObject(changes) : result
    }
  }

  // x is always from the left margin; the page choice only changes how it is shown and saved.
  /** x, y (or dy) and the alignments for the draft's Position choices. */
  const placeAttrs = (next: Draft, width: number, height: number) => {
    const attrs: Record<string, unknown> = { fromH: next.fromH }
    if (next.hMode === "align") {
      const across = next.fromH === "page" ? metrics.width : contentWidth
      const at = next.alignH === "center" ? (across - width) / 2 : next.alignH === "right" ? across - width : 0
      attrs.x = Math.round(next.fromH === "page" ? at - metrics.marginLeft : at)
      attrs.alignH = next.alignH
    } else {
      attrs.x = Math.round(next.x)
      attrs.alignH = ""
    }
    if (next.anchoring === "fixed" && next.vMode === "align") {
      const room = metrics.contentHeight - height
      attrs.y = Math.round(next.alignV === "center" ? room / 2 : next.alignV === "bottom" ? room : 0)
      attrs.alignV = next.alignV
    } else if (next.anchoring === "fixed") {
      attrs.y = Math.max(0, Math.round(next.y))
      attrs.alignV = ""
    } else {
      attrs.dy = Math.round(next.y)
      attrs.relative = "paragraph"
      attrs.alignV = ""
    }
    return attrs
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(start)
  useEffect(() => {
    if (changed) {
      preview?.preview(runFor(draft))
    } else {
      preview?.restore()
    }
    // runFor reads only the draft and what the dialog opened with.
  }, [draft])

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const accept = () => {
    if (changed) {
      preview?.commit(runFor(draft))
    } else {
      preview?.restore()
    }
    onClose()
  }
  const cancel = () => {
    preview?.restore()
    onClose()
  }

  const setSize = (dimension: "width" | "height", value: number) => {
    const ratio = draft.width / Math.max(1, draft.height)
    const next = Math.max(24, value)
    if (dimension === "width") {
      update({ width: next, height: draft.lockRatio && hasHeight ? Math.round(next / ratio) : draft.height })
    } else {
      update({ height: next, width: draft.lockRatio ? Math.round(next * ratio) : draft.width })
    }
  }
  const scale = (dimension: "width" | "height") =>
    Math.round((draft[dimension] / Math.max(1, opened.natural[dimension])) * 100)

  return (
    <DialogFrame
      title="Layout"
      width={560}
      onClose={cancel}
      tabs={TABS}
      tab={tab}
      onTab={(id) => setTab(id as LayoutTab)}
      bodyHeight={430}
    >
      <div className="layout-dialog">
        {tab === "position" ? (
          <>
            {!floating ? (
              <p className="layout-dialog-note">
                An object in line with the text moves with it. Choose a wrap on Text Wrapping to place it.
              </p>
            ) : null}
            <Section title="Horizontal">
              <fieldset className="layout-dialog-grid" disabled={!floating}>
                <label className="layout-dialog-radio">
                  <input type="radio" checked={draft.hMode === "align"} onChange={() => update({ hMode: "align" })} />
                  Alignment
                </label>
                <select
                  aria-label="Horizontal alignment"
                  value={draft.alignH}
                  disabled={draft.hMode !== "align"}
                  onChange={(event) => update({ alignH: event.target.value })}
                >
                  <option value="left">Left</option>
                  <option value="center">Centered</option>
                  <option value="right">Right</option>
                </select>
                <span>relative to</span>
                <FromH value={draft.fromH} disabled={draft.hMode !== "align"} onChange={(fromH) => update({ fromH })} />
                <label className="layout-dialog-radio">
                  <input
                    type="radio"
                    checked={draft.hMode === "absolute"}
                    onChange={() => update({ hMode: "absolute" })}
                  />
                  Absolute position
                </label>
                <SpinField
                  id="layout-x"
                  unit="cm"
                  step={0.1}
                  min={-30}
                  value={cm(draft.fromH === "page" ? draft.x + metrics.marginLeft : draft.x)}
                  disabled={draft.hMode !== "absolute"}
                  onChange={(value) => update({ x: px(value) - (draft.fromH === "page" ? metrics.marginLeft : 0) })}
                />
                <span>to the right of</span>
                <FromH
                  value={draft.fromH}
                  disabled={draft.hMode !== "absolute"}
                  onChange={(fromH) => update({ fromH })}
                />
              </fieldset>
            </Section>
            <Section title="Vertical">
              <fieldset className="layout-dialog-grid" disabled={!floating}>
                <label className="layout-dialog-radio">
                  <input
                    type="radio"
                    checked={draft.vMode === "align" && draft.anchoring === "fixed"}
                    onChange={() => update({ vMode: "align", anchoring: "fixed", fromV: "margin" })}
                  />
                  Alignment
                </label>
                <select
                  aria-label="Vertical alignment"
                  value={draft.alignV}
                  disabled={draft.vMode !== "align" || draft.anchoring !== "fixed"}
                  onChange={(event) => update({ alignV: event.target.value })}
                >
                  <option value="top">Top</option>
                  <option value="center">Centered</option>
                  <option value="bottom">Bottom</option>
                </select>
                <span>relative to</span>
                <select aria-label="Vertical alignment relative to" value="margin" disabled>
                  <option value="margin">Margin</option>
                </select>
                <label className="layout-dialog-radio">
                  <input
                    type="radio"
                    checked={draft.vMode === "absolute" || draft.anchoring === "move"}
                    onChange={() => update({ vMode: "absolute" })}
                  />
                  Absolute position
                </label>
                <SpinField
                  id="layout-y"
                  unit="cm"
                  step={0.1}
                  min={-30}
                  value={cm(draft.y)}
                  disabled={draft.vMode === "align" && draft.anchoring === "fixed"}
                  onChange={(value) => update({ y: px(value) })}
                />
                <span>below</span>
                <select
                  aria-label="Absolute vertical position below"
                  value={draft.fromV}
                  disabled={draft.vMode === "align" && draft.anchoring === "fixed"}
                  onChange={(event) => {
                    const fromV = event.target.value === "paragraph" ? "paragraph" : "margin"
                    update({ fromV, anchoring: fromV === "paragraph" ? "move" : "fixed", vMode: "absolute" })
                  }}
                >
                  <option value="margin">Margin</option>
                  <option value="paragraph">Paragraph</option>
                </select>
              </fieldset>
            </Section>
            <Section title="Options">
              <div className="layout-dialog-checks">
                <Check
                  id="layout-move"
                  text="Move object with text"
                  letter="M"
                  disabled={!floating}
                  checked={floating && draft.anchoring === "move"}
                  onChange={(checked) =>
                    update({
                      anchoring: checked ? "move" : "fixed",
                      fromV: checked ? "paragraph" : "margin",
                      vMode: checked ? "absolute" : draft.vMode,
                    })
                  }
                />
                <Check
                  id="layout-lock"
                  text="Lock anchor"
                  letter="L"
                  disabled={!floating}
                  checked={draft.lockAnchor}
                  onChange={(lockAnchor) => update({ lockAnchor })}
                />
                <Check
                  id="layout-overlap"
                  text="Allow overlap"
                  letter="v"
                  disabled={!floating}
                  checked={draft.allowOverlap}
                  onChange={(allowOverlap) => update({ allowOverlap })}
                />
              </div>
            </Section>
          </>
        ) : null}
        {tab === "wrap" ? (
          <>
            <Section title="Wrapping style">
              <div className="layout-dialog-wraps" role="radiogroup" aria-label="Wrapping style">
                {WRAP_CHOICES.filter((choice) => !(object.name === "textBox" && choice.id === "inline")).map(
                  (choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={draft.wrap === choice.id}
                      className="layout-dialog-wrap"
                      onClick={() => {
                        const side = wrapDistance(choice.id)
                        const gaps = { top: 0, bottom: 0, left: side, right: side }
                        update({ wrap: choice.id, dist: draft.dist === start.dist ? gaps : draft.dist })
                      }}
                    >
                      <WrapGlyph kind={choice.id} size={32} />
                      <span>{choice.label}</span>
                    </button>
                  ),
                )}
              </div>
            </Section>
            <Section title="Wrap text">
              <div className="layout-dialog-sides" role="radiogroup" aria-label="Wrap text">
                {WRAP_SIDES.map((side) => (
                  <label key={side.id} className="layout-dialog-radio">
                    <input
                      type="radio"
                      disabled={!wrapsBeside(draft.wrap)}
                      checked={draft.side === side.id}
                      onChange={() => update({ side: side.id })}
                    />
                    {side.label}
                  </label>
                ))}
              </div>
            </Section>
            <Section title="Distance from text">
              <div className="layout-dialog-distances">
                {(
                  [
                    ["top", "Top", draft.wrap === "square" || draft.wrap === "topBottom"],
                    ["left", "Left", wrapsBeside(draft.wrap)],
                    ["bottom", "Bottom", draft.wrap === "square" || draft.wrap === "topBottom"],
                    ["right", "Right", wrapsBeside(draft.wrap)],
                  ] as const
                ).map(([key, label, enabled]) => (
                  <label key={key} className="layout-dialog-distance">
                    <span>{label}</span>
                    <SpinField
                      id={`layout-dist-${key}`}
                      unit="cm"
                      step={0.1}
                      value={cm(draft.dist[key])}
                      disabled={!enabled}
                      onChange={(value) => update({ dist: { ...draft.dist, [key]: px(value) } })}
                    />
                  </label>
                ))}
              </div>
            </Section>
          </>
        ) : null}
        {tab === "size" ? (
          <>
            <Section title="Height">
              <div className="layout-dialog-size">
                <span>Absolute</span>
                <SpinField
                  id="layout-height"
                  unit="cm"
                  step={0.1}
                  min={0.1}
                  value={cm(draft.height)}
                  disabled={!hasHeight}
                  onChange={(value) => setSize("height", px(value))}
                />
              </div>
            </Section>
            <Section title="Width">
              <div className="layout-dialog-size">
                <span>Absolute</span>
                <SpinField
                  id="layout-width"
                  unit="cm"
                  step={0.1}
                  min={0.1}
                  value={cm(draft.width)}
                  onChange={(value) => setSize("width", px(value))}
                />
              </div>
            </Section>
            <Section title="Rotate">
              <div className="layout-dialog-size">
                <span>Rotation</span>
                <SpinField
                  id="layout-rotate"
                  unit="°"
                  step={1}
                  min={-360}
                  max={360}
                  value={String(draft.rotate)}
                  onChange={(value) => update({ rotate: Math.round(Number(value) || 0) })}
                />
              </div>
            </Section>
            <Section title="Scale">
              <div className="layout-dialog-size">
                <span>Height</span>
                <SpinField
                  id="layout-scale-height"
                  unit="%"
                  step={1}
                  min={1}
                  value={String(scale("height"))}
                  disabled={!hasHeight}
                  onChange={(value) =>
                    setSize("height", Math.round((opened.natural.height * (Number(value) || 100)) / 100))
                  }
                />
                <span>Width</span>
                <SpinField
                  id="layout-scale-width"
                  unit="%"
                  step={1}
                  min={1}
                  value={String(scale("width"))}
                  onChange={(value) =>
                    setSize("width", Math.round((opened.natural.width * (Number(value) || 100)) / 100))
                  }
                />
              </div>
              <div className="layout-dialog-checks">
                <Check
                  id="layout-ratio"
                  text="Lock aspect ratio"
                  letter="a"
                  checked={draft.lockRatio}
                  onChange={(lockRatio) => update({ lockRatio })}
                />
              </div>
            </Section>
            <Section title="Original size">
              <div className="layout-dialog-size">
                <span>Height: {cm(opened.natural.height)} cm</span>
                <span>Width: {cm(opened.natural.width)} cm</span>
                <button
                  type="button"
                  className="dialog-btn"
                  onClick={() => update({ width: opened.natural.width, height: opened.natural.height, rotate: 0 })}
                >
                  Reset
                </button>
              </div>
            </Section>
          </>
        ) : null}
      </div>
      <DialogButtons onOk={accept} onCancel={cancel} />
    </DialogFrame>
  )
}

function FromH({
  value,
  disabled,
  onChange,
}: {
  value: "margin" | "page"
  disabled: boolean
  onChange: (value: "margin" | "page") => void
}) {
  return (
    <select
      aria-label="Relative to"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === "page" ? "page" : "margin")}
    >
      <option value="margin">Margin</option>
      <option value="page">Page</option>
    </select>
  )
}
