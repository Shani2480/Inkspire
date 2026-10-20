import { openColorDialog } from "@/components/color-dialog"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { chainWithSelection } from "@/editor/selection-memory"
import type { Editor } from "@tiptap/core"
import {
  GLOW_COLORS,
  OUTLINE_COLORS,
  OUTLINE_WEIGHTS,
  REFLECT_SECTIONS,
  SHADOW_SECTIONS,
  TEXT_PRESETS,
  effectCss,
} from "@/editor/text-effects"
import { useState, type CSSProperties } from "react"

export function applyTextPreset(editor: Editor, effect: string, color?: string) {
  let chain = chainWithSelection(editor)
  if (color) {
    chain = chain.setColor(color)
  }
  chain
    .setMark("textStyle", { effect: effect || null })
    .removeEmptyTextStyle()
    .run()
}

export function TextEffectsMenu({
  editor,
  active,
  onClose,
  onPick,
  layout = "menu",
}: {
  editor?: Editor | null
  active: string
  onClose: () => void
  onPick?: (effect: string, color?: string) => void
  /** "menu" opens Outline, Shadow, … as flyouts; "panel" (a dialog tab) shows them beside the list instead. */
  layout?: "menu" | "panel"
}) {
  const [flyout, setFlyout] = useState<"outline" | "shadow" | "reflect" | "glow" | null>(null)

  function pick(effect: string, color?: string) {
    if (onPick) {
      onPick(effect, color)
      onClose()
      return
    }
    if (editor) {
      applyTextPreset(editor, effect, color)
    }
    onClose()
  }

  const choices = flyout ? (
    <>
      {flyout === "outline" ? <OutlineFlyout onPick={pick} /> : null}
      {flyout === "shadow" ? <ShadowFlyout onPick={pick} /> : null}
      {flyout === "reflect" ? <ReflectFlyout onPick={pick} /> : null}
      {flyout === "glow" ? <GlowFlyout onPick={pick} /> : null}
    </>
  ) : null

  return (
    <div className={layout === "panel" ? "flex items-start gap-3" : "relative w-[232px]"}>
      <div className="w-[232px] shrink-0">
        <div className="grid grid-cols-5 gap-1 p-1">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-label={preset.label}
              aria-pressed={active === preset.effect && preset.effect !== ""}
              title={preset.label}
              className="effect-tile flex h-9 items-center justify-center rounded border border-[#e1e1e1] bg-white text-[18px] leading-none font-semibold aria-pressed:border-[#0f6cbd] aria-pressed:bg-[#f3f9fd]"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(preset.effect, preset.color)}
            >
              <EffectSample css={preset.css} />
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-[#ededed] pt-1">
          <EffectRow
            label="Outline"
            open={flyout === "outline"}
            onOpen={() => setFlyout(flyout === "outline" ? null : "outline")}
          />
          <EffectRow
            label="Shadow"
            open={flyout === "shadow"}
            onOpen={() => setFlyout(flyout === "shadow" ? null : "shadow")}
          />
          <EffectRow
            label="Reflection"
            open={flyout === "reflect"}
            onOpen={() => setFlyout(flyout === "reflect" ? null : "reflect")}
          />
          <EffectRow
            label="Glow"
            open={flyout === "glow"}
            onOpen={() => setFlyout(flyout === "glow" ? null : "glow")}
          />
        </div>
      </div>
      {layout === "panel" ? (
        <div className="h-[236px] min-w-0 flex-1 overflow-y-auto rounded-md border border-[#e1e1e1] p-2">
          {choices ?? (
            <p className="p-2 text-xs text-neutral-500">
              Choose Outline, Shadow, Reflection or Glow to see its options.
            </p>
          )}
        </div>
      ) : flyout ? (
        <div className="absolute top-0 left-full z-10 ml-1 w-[248px] rounded-md border border-[#d0d0d0] bg-white p-2 shadow-md">
          {choices}
        </div>
      ) : null}
    </div>
  )
}

function EffectRow({ label, open, onOpen }: { label: string; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className="flex h-8 w-full items-center px-2 text-left text-[13px] text-[#242424] hover:bg-[#f3f3f3]"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <span className="flex-1">{label}</span>
      <span aria-hidden className="text-[#767676]">
        ›
      </span>
    </button>
  )
}

function OutlineFlyout({ onPick }: { onPick: (effect: string) => void }) {
  return (
    <div>
      <MenuButton onClick={() => onPick("")}>No Outline</MenuButton>
      <p className="mt-1 px-1 text-[11px] text-[#767676]">Theme Colors</p>
      <div className="mt-1 grid grid-cols-9 gap-1">
        {OUTLINE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            className="effect-tile flex h-7 items-center justify-center rounded border border-[#e1e1e1] text-[15px] font-semibold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(`outline:${color}|1`)}
          >
            <EffectSample css={effectCss(`outline:${color}|1`)} />
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px] text-[#767676]">Weight</p>
      <div className="mt-1 flex flex-col">
        {OUTLINE_WEIGHTS.map((weight) => (
          <button
            key={weight.id}
            type="button"
            className="flex h-7 items-center gap-2 px-1 text-left text-[12px] hover:bg-[#f3f3f3]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(`outline:#242424|${weight.id}`)}
          >
            <span className="w-16 shrink-0 bg-[#242424]" style={{ height: `${Math.max(1, Number(weight.id))}px` }} />
            {weight.label}
          </button>
        ))}
      </div>
      <MenuButton onClick={() => openColorDialog("#2e75b6", (color) => onPick(`outline:${color}|1`))}>
        More Outline Colors…
      </MenuButton>
    </div>
  )
}

function ShadowFlyout({ onPick }: { onPick: (effect: string) => void }) {
  return (
    <div>
      <MenuButton onClick={() => onPick("")}>No Shadow</MenuButton>
      {SHADOW_SECTIONS.map((section) => (
        <div key={section.title} className="mt-2">
          <p className="px-1 text-[11px] text-[#767676]">{section.title}</p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {section.ids.map((id) => (
              <LetterButton key={id} id={id} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ReflectFlyout({ onPick }: { onPick: (effect: string) => void }) {
  return (
    <div>
      <MenuButton onClick={() => onPick("")}>No Reflection</MenuButton>
      {REFLECT_SECTIONS.map((section) => (
        <div key={section.title} className="mt-2">
          <p className="px-1 text-[11px] text-[#767676]">{section.title}</p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {section.ids.map((id) => (
              <LetterButton key={id} id={id} tall onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GlowFlyout({ onPick }: { onPick: (effect: string) => void }) {
  return (
    <div>
      <MenuButton onClick={() => onPick("")}>No Glow</MenuButton>
      <p className="mt-2 px-1 text-[11px] text-[#767676]">Glow Variations</p>
      <div className="mt-1 grid grid-cols-5 gap-1">
        {GLOW_COLORS.map((glow) => (
          <LetterButton key={glow.id} id={glow.id} label={glow.label} onPick={onPick} />
        ))}
      </div>
      <MenuButton onClick={() => openColorDialog("#5b9bd5", (color) => onPick(`glow:${color}`))}>
        More Glow Colors…
      </MenuButton>
    </div>
  )
}

function LetterButton({
  id,
  label,
  tall = false,
  onPick,
}: {
  id: string
  label?: string
  tall?: boolean
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={label || id}
      title={label || id}
      className={`effect-tile flex items-center justify-center rounded border border-[#e1e1e1] bg-white text-[16px] font-semibold ${tall ? "h-12 pb-3" : "h-9"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(id)}
    >
      <EffectSample css={effectCss(id) || "color: #242424"} />
    </button>
  )
}

/**
 * The "A" a tile shows, wearing the effect. The effect goes on the letter, not the tile: a reflection or glow on
 * the tile would mirror its border and spill into the next row.
 */
function EffectSample({ css }: { css: string }) {
  return (
    <span className="leading-none" style={cssProperties(css)}>
      A
    </span>
  )
}

export function effectPreviewStyle(effect: string): CSSProperties {
  return cssProperties(effectCss(effect))
}

function cssProperties(css: string): CSSProperties {
  const style: Record<string, string> = {}
  for (const part of css.split(";")) {
    const split = part.indexOf(":")
    if (split === -1) {
      continue
    }
    const key = part
      .slice(0, split)
      .trim()
      .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    const value = part.slice(split + 1).trim()
    if (key && value) {
      style[key] = value
    }
  }
  return style
}
