export const EFFECT_CSS: Record<string, string> = {
  shadow: "text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.45)",
  "shadow-soft": "text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35)",
  "shadow-hard": "text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.55)",
  "shadow-left": "text-shadow: -2px 1px 2px rgba(0, 0, 0, 0.45)",
  "shadow-top": "text-shadow: 0 -1px 2px rgba(0, 0, 0, 0.4)",
  "outer-br": "text-shadow: 2px 2px 2px rgba(0,0,0,.45)",
  "outer-b": "text-shadow: 0 3px 2px rgba(0,0,0,.4)",
  "outer-bl": "text-shadow: -2px 2px 2px rgba(0,0,0,.45)",
  "outer-r": "text-shadow: 3px 0 2px rgba(0,0,0,.4)",
  "outer-c": "text-shadow: 0 0 4px rgba(0,0,0,.45)",
  "outer-l": "text-shadow: -3px 0 2px rgba(0,0,0,.4)",
  "outer-tr": "text-shadow: 2px -2px 2px rgba(0,0,0,.45)",
  "outer-t": "text-shadow: 0 -3px 2px rgba(0,0,0,.4)",
  "outer-tl": "text-shadow: -2px -2px 2px rgba(0,0,0,.45)",
  "inner-br": "text-shadow: inset 0 0 0 transparent, 1px 1px 1px rgba(0,0,0,.55), -1px -1px 0 rgba(255,255,255,.35)",
  "inner-b": "text-shadow: 0 1px 1px rgba(0,0,0,.55), 0 -1px 0 rgba(255,255,255,.4)",
  "inner-bl": "text-shadow: -1px 1px 1px rgba(0,0,0,.55), 1px -1px 0 rgba(255,255,255,.35)",
  "inner-r": "text-shadow: 1px 0 1px rgba(0,0,0,.55)",
  "inner-c": "text-shadow: 0 0 2px rgba(0,0,0,.65)",
  "inner-l": "text-shadow: -1px 0 1px rgba(0,0,0,.55)",
  "inner-tr": "text-shadow: 1px -1px 1px rgba(0,0,0,.55)",
  "inner-t": "text-shadow: 0 -1px 1px rgba(0,0,0,.55)",
  "inner-tl": "text-shadow: -1px -1px 1px rgba(0,0,0,.55)",
  "persp-bl": "text-shadow: -1px 2px 0 rgba(0,0,0,.2), -3px 6px 0 rgba(0,0,0,.15), -6px 12px 4px rgba(0,0,0,.2)",
  "persp-br": "text-shadow: 1px 2px 0 rgba(0,0,0,.2), 3px 6px 0 rgba(0,0,0,.15), 6px 12px 4px rgba(0,0,0,.2)",
  "persp-tl": "text-shadow: -1px -2px 0 rgba(0,0,0,.2), -3px -6px 0 rgba(0,0,0,.15), -6px -12px 4px rgba(0,0,0,.2)",
  "persp-tr": "text-shadow: 1px -2px 0 rgba(0,0,0,.2), 3px -6px 0 rgba(0,0,0,.15), 6px -12px 4px rgba(0,0,0,.2)",
  "persp-back": "text-shadow: 0 8px 0 rgba(0,0,0,.12), 0 14px 6px rgba(0,0,0,.18)",
  "shadow-blue": "color: #2e75b6; text-shadow: 1px 1px 2px rgba(46, 117, 182, 0.65)",
  "shadow-orange": "color: #c45911; text-shadow: 1px 1px 2px rgba(196, 89, 17, 0.6)",
  "shadow-gray": "color: #595959; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.45)",
  outline: "-webkit-text-stroke: 0.65px #1c1c1c; -webkit-text-fill-color: transparent",
  "outline-blue": "-webkit-text-stroke: 0.7px #2e75b6; -webkit-text-fill-color: transparent",
  "outline-orange": "-webkit-text-stroke: 0.7px #c45911; -webkit-text-fill-color: transparent",
  "outline-gold": "-webkit-text-stroke: 0.7px #bf8f00; -webkit-text-fill-color: transparent",
  "outline-green": "-webkit-text-stroke: 0.7px #548235; -webkit-text-fill-color: transparent",
  "outline-red": "-webkit-text-stroke: 0.7px #c00000; -webkit-text-fill-color: transparent",
  glow: "text-shadow: 0 0 4px #7eb6ff, 0 0 10px #5aa2ff",
  "glow-blue": "text-shadow: 0 0 4px #5b9bd5, 0 0 10px #2e75b6",
  "glow-orange": "text-shadow: 0 0 4px #f4b183, 0 0 10px #c45911",
  "glow-green": "text-shadow: 0 0 4px #a9d08e, 0 0 10px #548235",
  "glow-purple": "text-shadow: 0 0 4px #d5a6e6, 0 0 10px #7030a0",
  "glow-red": "text-shadow: 0 0 4px #f4b4b6, 0 0 10px #c00000",
  reflect:
    "display: inline-block; -webkit-box-reflect: below -0.22em linear-gradient(transparent 50%, rgba(0, 0, 0, 0.28))",
  "reflect-half":
    "display: inline-block; -webkit-box-reflect: below -0.35em linear-gradient(transparent 30%, rgba(0, 0, 0, 0.35))",
  "reflect-full":
    "display: inline-block; -webkit-box-reflect: below 0 linear-gradient(transparent, rgba(0, 0, 0, 0.4))",
  "reflect-tight-0":
    "display: inline-block; -webkit-box-reflect: below -0.08em linear-gradient(transparent 62%, rgba(0,0,0,.35))",
  "reflect-tight-4":
    "display: inline-block; -webkit-box-reflect: below 0.12em linear-gradient(transparent 62%, rgba(0,0,0,.3))",
  "reflect-tight-8":
    "display: inline-block; -webkit-box-reflect: below 0.35em linear-gradient(transparent 62%, rgba(0,0,0,.25))",
  "reflect-half-0":
    "display: inline-block; -webkit-box-reflect: below -0.08em linear-gradient(transparent 40%, rgba(0,0,0,.4))",
  "reflect-half-4":
    "display: inline-block; -webkit-box-reflect: below 0.12em linear-gradient(transparent 40%, rgba(0,0,0,.35))",
  "reflect-half-8":
    "display: inline-block; -webkit-box-reflect: below 0.35em linear-gradient(transparent 40%, rgba(0,0,0,.3))",
  "reflect-full-0":
    "display: inline-block; -webkit-box-reflect: below -0.02em linear-gradient(transparent, rgba(0,0,0,.45))",
  "reflect-full-4":
    "display: inline-block; -webkit-box-reflect: below 0.18em linear-gradient(transparent, rgba(0,0,0,.4))",
  "reflect-full-8":
    "display: inline-block; -webkit-box-reflect: below 0.4em linear-gradient(transparent, rgba(0,0,0,.32))",
}

export function effectCss(effect: unknown) {
  if (typeof effect !== "string" || !effect) {
    return ""
  }
  const known = EFFECT_CSS[effect]
  if (known) {
    return known
  }
  const color = customEffectColor(effect)
  if (!color) {
    return ""
  }
  if (effect.startsWith("glow:")) {
    return `text-shadow: 0 0 4px ${color}, 0 0 10px ${color}`
  }
  if (effect.startsWith("outline:")) {
    const width = effect.split("|")[1]
    const size = width && Number(width) > 0 ? `${width}px` : "0.7px"
    return `-webkit-text-stroke: ${size} ${color}; -webkit-text-fill-color: transparent`
  }
  if (effect.startsWith("shadow:")) {
    return `text-shadow: 1px 1px 2px ${color}`
  }
  return ""
}

function customEffectColor(effect: string) {
  const split = effect.indexOf(":")
  if (split === -1) {
    return ""
  }
  const color = effect
    .slice(split + 1)
    .split("|")[0]
    .trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : ""
}

export type TextPreset = {
  id: string
  label: string
  effect: string
  color?: string
  css: string
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: "none", label: "No text effect", effect: "", css: "color: #242424" },
  { id: "fill-blue", label: "Blue", effect: "", color: "#2e75b6", css: "color: #2e75b6; font-weight: 700" },
  { id: "fill-orange", label: "Orange", effect: "", color: "#c45911", css: "color: #c45911; font-weight: 700" },
  { id: "fill-gray", label: "Gray", effect: "", color: "#595959", css: "color: #595959; font-weight: 700" },
  { id: "fill-gold", label: "Gold", effect: "", color: "#bf8f00", css: "color: #bf8f00; font-weight: 700" },
  { id: "outline-blue", label: "Blue outline", effect: "outline-blue", css: EFFECT_CSS["outline-blue"] },
  { id: "outline", label: "Black outline", effect: "outline", css: EFFECT_CSS.outline },
  { id: "shadow-blue", label: "Blue shadow", effect: "shadow-blue", css: EFFECT_CSS["shadow-blue"] },
  { id: "shadow-orange", label: "Orange shadow", effect: "shadow-orange", css: EFFECT_CSS["shadow-orange"] },
  { id: "shadow-gray", label: "Gray shadow", effect: "shadow-gray", css: EFFECT_CSS["shadow-gray"] },
  { id: "glow-blue", label: "Blue glow", effect: "glow-blue", css: EFFECT_CSS["glow-blue"] },
  { id: "glow-orange", label: "Orange glow", effect: "glow-orange", css: EFFECT_CSS["glow-orange"] },
  { id: "glow-green", label: "Green glow", effect: "glow-green", css: EFFECT_CSS["glow-green"] },
  { id: "glow-purple", label: "Purple glow", effect: "glow-purple", css: EFFECT_CSS["glow-purple"] },
  { id: "glow-red", label: "Red glow", effect: "glow-red", css: EFFECT_CSS["glow-red"] },
]

/** Insert → WordArt gallery presets (gradients, shadows, outline, simple path warps). */
export type WordArtPreset = {
  id: string
  label: string
  path?: "none" | "arc" | "wave" | "deflate"
}

export const WORD_ART_PRESETS: WordArtPreset[] = [
  { id: "blue", label: "Gradient Blue" },
  { id: "orange", label: "Gradient Orange" },
  { id: "green", label: "Gradient Green" },
  { id: "silver", label: "Gradient Silver" },
  { id: "gold", label: "Gold Shadow" },
  { id: "red", label: "Red Shadow" },
  { id: "purple", label: "Purple Glow" },
  { id: "outline", label: "Blue Outline" },
  { id: "arc", label: "Arch Up", path: "arc" },
  { id: "wave", label: "Wave", path: "wave" },
  { id: "deflate", label: "Deflate", path: "deflate" },
  { id: "plain", label: "Plain Black" },
]

export const OUTLINE_COLORS = [
  "#000000",
  "#4472c4",
  "#ed7d31",
  "#a5a5a5",
  "#ffc000",
  "#5b9bd5",
  "#70ad47",
  "#c00000",
  "#7030a0",
]

export const OUTLINE_WEIGHTS = [
  { id: "0.5", label: "¼ pt" },
  { id: "0.75", label: "½ pt" },
  { id: "1", label: "¾ pt" },
  { id: "1.25", label: "1 pt" },
  { id: "1.75", label: "1½ pt" },
  { id: "2.25", label: "2¼ pt" },
  { id: "3", label: "3 pt" },
]

export const SHADOW_SECTIONS = [
  {
    title: "Outer",
    ids: ["outer-tl", "outer-t", "outer-tr", "outer-l", "outer-c", "outer-r", "outer-bl", "outer-b", "outer-br"],
  },
  {
    title: "Inner",
    ids: ["inner-tl", "inner-t", "inner-tr", "inner-l", "inner-c", "inner-r", "inner-bl", "inner-b", "inner-br"],
  },
  { title: "Perspective", ids: ["persp-tl", "persp-tr", "persp-bl", "persp-br", "persp-back"] },
]

export const REFLECT_SECTIONS = [
  { title: "Tight Reflection", ids: ["reflect-tight-0", "reflect-tight-4", "reflect-tight-8"] },
  { title: "Half Reflection", ids: ["reflect-half-0", "reflect-half-4", "reflect-half-8"] },
  { title: "Full Reflection", ids: ["reflect-full-0", "reflect-full-4", "reflect-full-8"] },
]

export const GLOW_COLORS = [
  { id: "glow-blue", label: "Blue", color: "#5b9bd5" },
  { id: "glow-orange", label: "Orange", color: "#ed7d31" },
  { id: "glow-green", label: "Green", color: "#70ad47" },
  { id: "glow-purple", label: "Purple", color: "#7030a0" },
  { id: "glow-red", label: "Red", color: "#c00000" },
]
