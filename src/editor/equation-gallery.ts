import { UNICODE_TEX } from "@/editor/equation-templates"

/** Word's Built-In equations (22.2), as LaTeX. */
export const BUILT_IN_EQUATIONS: { label: string; tex: string }[] = [
  { label: "Area of Circle", tex: "A=\\pi r^{2}" },
  { label: "Binomial Theorem", tex: "(x+a)^{n}=\\sum_{k=0}^{n}\\binom{n}{k}x^{k}a^{n-k}" },
  {
    label: "Expansion of a Sum",
    tex: "(1+x)^{n}=1+\\frac{nx}{1!}+\\frac{n(n-1)x^{2}}{2!}+\\cdots",
  },
  {
    label: "Fourier Series",
    tex: "f(x)=a_{0}+\\sum_{n=1}^{\\infty}\\left(a_{n}\\cos\\frac{n\\pi x}{L}+b_{n}\\sin\\frac{n\\pi x}{L}\\right)",
  },
  { label: "Pythagorean Theorem", tex: "a^{2}+b^{2}=c^{2}" },
  { label: "Quadratic Formula", tex: "x=\\dfrac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}" },
]

export type SavedEquation = { label: string; tex: string }

const KEY = "aiword.equation-gallery"

/** The user's own equations ("Save Selection to Equation Gallery…"), kept in this browser or app profile. */
export function loadSavedEquations(): SavedEquation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedEquation =>
            typeof item?.label === "string" && typeof item?.tex === "string" && item.label.trim() !== "",
        )
      : []
  } catch {
    return []
  }
}

/** Adds (or replaces, by name) one saved equation and returns the new list. */
export function saveEquation(label: string, tex: string): SavedEquation[] {
  const name = label.trim()
  const next = [...loadSavedEquations().filter((item) => item.label !== name), { label: name, tex }]
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage can be blocked; the equation is then simply not remembered.
  }
  return next
}

export type EquationText = "unicode" | "latex" | "text"

const TEX_UNICODE = new Map([
  ...Object.entries(UNICODE_TEX).map(([char, command]) => [command.trim(), char] as [string, string]),
  ["\\cdots", "⋯"],
  ["\\ldots", "…"],
  ["\\cdot", "·"],
])

/** `{...}` group starting at `from` (which is at the `{`): its inside and the index after it, or null. */
function group(tex: string, from: number): { inside: string; end: number } | null {
  if (tex[from] !== "{") {
    return null
  }
  let depth = 0
  for (let index = from; index < tex.length; index += 1) {
    if (tex[index] === "{") {
      depth += 1
    } else if (tex[index] === "}") {
      depth -= 1
      if (depth === 0) {
        return { inside: tex.slice(from + 1, index), end: index + 1 }
      }
    }
  }
  return null
}

const bracket = (text: string) => (/^(\w|\d+(\.\d+)?)$/.test(text) ? text : `(${text})`)

/**
 * An equation as text for Equation → Conversions → Convert: Unicode (symbols as characters, fractions as a/b), LaTeX
 * as it is stored, or plain text (as Unicode, with the names of functions left bare).
 */
export function equationToText(tex: string, mode: EquationText): string {
  if (mode === "latex") {
    return tex
  }
  let out = ""
  for (let index = 0; index < tex.length;) {
    const fraction = /^\\(?:d?frac|binom)/.exec(tex.slice(index))
    if (fraction) {
      const top = group(tex, index + fraction[0].length)
      const bottom = top ? group(tex, top.end) : null
      if (top && bottom) {
        const upper = equationToText(top.inside, mode)
        const lower = equationToText(bottom.inside, mode)
        out += fraction[0].endsWith("binom") ? `(${upper}¦${lower})` : `${bracket(upper)}/${bracket(lower)}`
        index = bottom.end
        continue
      }
    }
    if (tex.startsWith("\\sqrt", index)) {
      const inner = group(tex, index + 5)
      if (inner) {
        out += `√${bracket(equationToText(inner.inside, mode))}`
        index = inner.end
        continue
      }
    }
    if (tex[index] === "\\") {
      const name = /^\\([A-Za-z]+|.)/.exec(tex.slice(index))
      const command = name ? `\\${name[1]}` : "\\"
      index += command.length
      if (command === "\\left" || command === "\\right") {
        if (tex[index] === ".") {
          index += 1
        }
        continue
      }
      const known = TEX_UNICODE.get(command)
      out += known ?? (/^\\[A-Za-z]+$/.test(command) ? command.slice(1) : command.slice(1))
      continue
    }
    if (tex[index] === "{" || tex[index] === "}") {
      index += 1
      continue
    }
    out += tex[index]
    index += 1
  }
  return out.replace(/\s+/g, " ").trim()
}
