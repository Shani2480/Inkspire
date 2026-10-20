/**
 * What the equation editor offers (21.23): structure templates, symbols, and the helpers that put them into the
 * LaTeX text. In a template `#1`, `#2` … mark the places to fill in; the first takes the selected text.
 */

export type EquationItem = {
  label: string
  tex: string
  /** Shown on the button when it differs from the rendering. */ hint?: string
}
export type EquationGroup = { id: string; label: string; items: EquationItem[] }

export const EQUATION_STRUCTURES: EquationGroup[] = [
  {
    id: "fractions",
    label: "Fraction",
    items: [
      { label: "Fraction", tex: "\\frac{#1}{#2}" },
      { label: "Small fraction", tex: "\\tfrac{#1}{#2}" },
      { label: "Binomial", tex: "\\binom{#1}{#2}" },
      { label: "Derivative", tex: "\\frac{d#1}{d#2}" },
      { label: "Partial derivative", tex: "\\frac{\\partial #1}{\\partial #2}" },
    ],
  },
  {
    id: "scripts",
    label: "Script",
    items: [
      { label: "Superscript", tex: "#1^{#2}" },
      { label: "Subscript", tex: "#1_{#2}" },
      { label: "Sub-superscript", tex: "#1_{#2}^{#3}" },
      { label: "Left superscript", tex: "{}^{#2}#1" },
    ],
  },
  {
    id: "radicals",
    label: "Radical",
    items: [
      { label: "Square root", tex: "\\sqrt{#1}" },
      { label: "Nth root", tex: "\\sqrt[#2]{#1}" },
    ],
  },
  {
    id: "integrals",
    label: "Integral",
    items: [
      { label: "Integral", tex: "\\int #1\\,d#2" },
      { label: "Definite integral", tex: "\\int_{#2}^{#3} #1\\,dx" },
      { label: "Double integral", tex: "\\iint #1\\,dA" },
      { label: "Contour integral", tex: "\\oint #1\\,d#2" },
    ],
  },
  {
    id: "large",
    label: "Large operator",
    items: [
      { label: "Sum", tex: "\\sum_{#2}^{#3} #1" },
      { label: "Product", tex: "\\prod_{#2}^{#3} #1" },
      { label: "Union", tex: "\\bigcup_{#2}^{#3} #1" },
      { label: "Intersection", tex: "\\bigcap_{#2}^{#3} #1" },
    ],
  },
  {
    id: "brackets",
    label: "Bracket",
    items: [
      { label: "Parentheses", tex: "\\left(#1\\right)" },
      { label: "Square brackets", tex: "\\left[#1\\right]" },
      { label: "Braces", tex: "\\left\\{#1\\right\\}" },
      { label: "Absolute value", tex: "\\left|#1\\right|" },
      { label: "Norm", tex: "\\left\\|#1\\right\\|" },
      { label: "Cases", tex: "\\begin{cases} #1 & #2 \\\\ #3 & #4 \\end{cases}" },
    ],
  },
  {
    id: "functions",
    label: "Function",
    items: [
      { label: "Sine", tex: "\\sin\\left(#1\\right)" },
      { label: "Cosine", tex: "\\cos\\left(#1\\right)" },
      { label: "Tangent", tex: "\\tan\\left(#1\\right)" },
    ],
  },
  {
    id: "limits",
    label: "Limit and Log",
    items: [
      { label: "Logarithm", tex: "\\log_{#2}\\left(#1\\right)" },
      { label: "Natural log", tex: "\\ln\\left(#1\\right)" },
      { label: "Limit", tex: "\\lim_{#1 \\to #2} #3" },
      { label: "Maximum", tex: "\\max_{#1} #2" },
      { label: "Minimum", tex: "\\min_{#1} #2" },
    ],
  },
  {
    id: "operator-structures",
    label: "Operator",
    items: [
      { label: "Equal with text above", tex: "\\overset{#1}{=}" },
      { label: "Right arrow with text above", tex: "\\xrightarrow{#1}" },
      { label: "Left arrow with text above", tex: "\\xleftarrow{#1}" },
      { label: "Delta equal", tex: "\\overset{\\Delta}{=}" },
      { label: "Colon equal", tex: ":=" },
      { label: "Yields", tex: "\\vdash" },
    ],
  },
  {
    id: "accents",
    label: "Accent",
    items: [
      { label: "Hat", tex: "\\hat{#1}" },
      { label: "Bar", tex: "\\bar{#1}" },
      { label: "Vector", tex: "\\vec{#1}" },
      { label: "Dot", tex: "\\dot{#1}" },
      { label: "Tilde", tex: "\\tilde{#1}" },
      { label: "Overline", tex: "\\overline{#1}" },
      { label: "Underline", tex: "\\underline{#1}" },
    ],
  },
  {
    id: "matrices",
    label: "Matrix",
    items: [
      { label: "2×2 matrix", tex: "\\begin{pmatrix} #1 & #2 \\\\ #3 & #4 \\end{pmatrix}" },
      { label: "3×3 matrix", tex: "\\begin{pmatrix} #1 & #2 & #3 \\\\ #4 & #5 & #6 \\\\ #7 & #8 & #9 \\end{pmatrix}" },
      { label: "Bracket matrix", tex: "\\begin{bmatrix} #1 & #2 \\\\ #3 & #4 \\end{bmatrix}" },
      { label: "Determinant", tex: "\\begin{vmatrix} #1 & #2 \\\\ #3 & #4 \\end{vmatrix}" },
    ],
  },
]

const sym = (label: string, tex: string): EquationItem => ({ label, tex })

export const EQUATION_SYMBOLS: EquationGroup[] = [
  {
    id: "greek",
    label: "Greek letters",
    items: [
      ["alpha", "\\alpha"],
      ["beta", "\\beta"],
      ["gamma", "\\gamma"],
      ["delta", "\\delta"],
      ["epsilon", "\\epsilon"],
      ["theta", "\\theta"],
      ["lambda", "\\lambda"],
      ["mu", "\\mu"],
      ["pi", "\\pi"],
      ["rho", "\\rho"],
      ["sigma", "\\sigma"],
      ["phi", "\\phi"],
      ["omega", "\\omega"],
      ["Gamma", "\\Gamma"],
      ["Delta", "\\Delta"],
      ["Theta", "\\Theta"],
      ["Lambda", "\\Lambda"],
      ["Sigma", "\\Sigma"],
      ["Phi", "\\Phi"],
      ["Omega", "\\Omega"],
    ].map(([label, tex]) => sym(label, tex)),
  },
  {
    id: "operators",
    label: "Operators",
    items: [
      ["Plus or minus", "\\pm"],
      ["Times", "\\times"],
      ["Divide", "\\div"],
      ["Dot", "\\cdot"],
      ["Partial", "\\partial"],
      ["Nabla", "\\nabla"],
      ["Infinity", "\\infty"],
      ["For all", "\\forall"],
      ["There exists", "\\exists"],
      ["Element of", "\\in"],
      ["Subset", "\\subset"],
      ["Union", "\\cup"],
      ["Intersection", "\\cap"],
      ["Empty set", "\\emptyset"],
      ["Ellipsis", "\\cdots"],
    ].map(([label, tex]) => sym(label, tex)),
  },
  {
    id: "relations",
    label: "Relations",
    items: [
      ["Not equal", "\\neq"],
      ["Approximately", "\\approx"],
      ["Equivalent", "\\equiv"],
      ["Less or equal", "\\leq"],
      ["Greater or equal", "\\geq"],
      ["Much less", "\\ll"],
      ["Much greater", "\\gg"],
      ["Proportional", "\\propto"],
      ["Similar", "\\sim"],
    ].map(([label, tex]) => sym(label, tex)),
  },
  {
    id: "arrows",
    label: "Arrows",
    items: [
      ["Right arrow", "\\rightarrow"],
      ["Left arrow", "\\leftarrow"],
      ["Left-right arrow", "\\leftrightarrow"],
      ["Implies", "\\Rightarrow"],
      ["If and only if", "\\Leftrightarrow"],
      ["Maps to", "\\mapsto"],
    ].map(([label, tex]) => sym(label, tex)),
  },
]

/** Both lists, for a menu or a search. */
export function allEquationItems(): EquationItem[] {
  return [...EQUATION_STRUCTURES, ...EQUATION_SYMBOLS].flatMap((group) => group.items)
}

/**
 * Puts `template` into `tex` in place of the selection `[from, to)`. The selected text fills the first place; other
 * places are left empty (`{}` stays, so the structure is still there to fill). Returns the new text and the range to
 * select next: the first place, so typing replaces it.
 */
export function applyTemplate(tex: string, from: number, to: number, template: string) {
  const chosen = tex.slice(from, to)
  const marks = [...template.matchAll(/#(\d)/g)]
  const first = marks.length > 0 ? marks.reduce((a, b) => (Number(b[1]) < Number(a[1]) ? b : a)) : null
  let built = ""
  let caret: { start: number; end: number } | null = null
  let cursor = 0
  for (const mark of marks.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    built += template.slice(cursor, mark.index)
    if (mark === first) {
      caret = { start: built.length, end: built.length + chosen.length }
      built += chosen
    }
    cursor = (mark.index ?? 0) + mark[0].length
  }
  built += template.slice(cursor)
  const start = from + (caret?.start ?? built.length)
  const end = from + (caret?.end ?? built.length)
  return { tex: tex.slice(0, from) + built + tex.slice(to), start, end }
}

/** Adds a template at the end of an equation, for the ribbon, where there is no caret. */
export function appendTemplate(tex: string, template: string) {
  return applyTemplate(tex, tex.length, tex.length, template).tex
}

export const UNICODE_TEX: Record<string, string> = {
  α: "\\alpha ",
  β: "\\beta ",
  γ: "\\gamma ",
  δ: "\\delta ",
  ε: "\\epsilon ",
  θ: "\\theta ",
  λ: "\\lambda ",
  μ: "\\mu ",
  π: "\\pi ",
  ρ: "\\rho ",
  σ: "\\sigma ",
  φ: "\\phi ",
  ω: "\\omega ",
  Γ: "\\Gamma ",
  Δ: "\\Delta ",
  Θ: "\\Theta ",
  Λ: "\\Lambda ",
  Σ: "\\Sigma ",
  Φ: "\\Phi ",
  Ω: "\\Omega ",
  "±": "\\pm ",
  "×": "\\times ",
  "÷": "\\div ",
  "·": "\\cdot ",
  "∂": "\\partial ",
  "∇": "\\nabla ",
  "∞": "\\infty ",
  "∀": "\\forall ",
  "∃": "\\exists ",
  "∈": "\\in ",
  "⊂": "\\subset ",
  "∪": "\\cup ",
  "∩": "\\cap ",
  "∅": "\\emptyset ",
  "≠": "\\neq ",
  "≈": "\\approx ",
  "≡": "\\equiv ",
  "≤": "\\leq ",
  "≥": "\\geq ",
  "→": "\\rightarrow ",
  "←": "\\leftarrow ",
  "↔": "\\leftrightarrow ",
  "⇒": "\\Rightarrow ",
  "⇔": "\\Leftrightarrow ",
  "∑": "\\sum ",
  "∏": "\\prod ",
  "∫": "\\int ",
  "√": "\\sqrt",
  "²": "^{2}",
  "³": "^{3}",
}

/**
 * LaTeX for what was typed: UnicodeMath-style symbols (α, ≤, ∞, √, ², …) become their commands, so either way of
 * writing an equation renders the same. Text that is already LaTeX is left alone.
 */
export function texFromTyped(typed: string): string {
  let out = ""
  for (const char of typed) {
    out += UNICODE_TEX[char] ?? char
  }
  // "√x" and "√2" take the next character as their argument.
  return out.replace(/\\sqrt(?=[A-Za-z0-9])(.)/g, "\\sqrt{$1}")
}
