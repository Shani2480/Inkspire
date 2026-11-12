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

/** Characters that end an operand in linear text: a fraction or a script takes the run up to one of these. */
const OPERATORS = new Set([..."+-=±×÷·<>≤≥≠≈≡→←↔⇒⇔∈⊂∪∩,; "])

type Piece = { tex: string; group: boolean }

/** The `(`…`)` group starting at `from`, as text, and the index after it; null when it is not closed. */
function parenthesised(text: string[], from: number): { inside: string[]; end: number } | null {
  let depth = 0
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "(") {
      depth += 1
    } else if (text[index] === ")") {
      depth -= 1
      if (depth === 0) {
        return { inside: text.slice(from + 1, index), end: index + 1 }
      }
    }
  }
  return null
}

/** A group's TeX in a structure's argument: its brackets were only there to group, so they go. */
const argument = (piece: Piece) => (piece.group ? piece.tex.slice(7, -9) : piece.tex)

/**
 * LaTeX for an equation typed in Word's linear format (UnicodeMath), for converting selected text to an equation:
 * `a^2`, `x_(i+1)`, `(a+b)/2`, `√(x+1)` and symbols such as α, ≤ and ² are built up; brackets that only group a
 * fraction's or a script's argument are dropped, as Word does. Text with a backslash is taken as LaTeX already.
 */
export function texFromLinear(linear: string): string {
  const text = linear.trim()
  if (text.includes("\\")) {
    return text
  }
  return run([...text])
}

function run(chars: string[]): string {
  // First the pieces: groups, roots, scripts bound to what they follow; operators stay pieces of their own.
  const pieces: (Piece | { op: string })[] = []
  for (let index = 0; index < chars.length;) {
    const char = chars[index]!
    if (char === "(") {
      const found = parenthesised(chars, index)
      if (found) {
        pieces.push({ tex: `\\left( ${run(found.inside)} \\right) `, group: true })
        index = found.end
        continue
      }
    }
    if (char === "^" || char === "_" || char === "√") {
      const next = operand(chars, index + 1)
      if (next) {
        const inner = argument(next.piece)
        if (char === "√") {
          pieces.push({ tex: `\\sqrt{${inner}}`, group: false })
        } else {
          const base = pieces[pieces.length - 1]
          const tex = `${char}{${inner}}`
          if (base && "tex" in base) {
            base.tex += tex
            base.group = false
          } else {
            pieces.push({ tex: `{}${tex}`, group: false })
          }
        }
        index = next.end
        continue
      }
    }
    if (char === "/") {
      pieces.push({ op: "/" })
      index += 1
      continue
    }
    if (OPERATORS.has(char)) {
      pieces.push({ op: char })
      index += 1
      continue
    }
    const tex = UNICODE_TEX[char]
    if (tex?.startsWith("^")) {
      const base = pieces[pieces.length - 1]
      if (base && "tex" in base) {
        base.tex += tex
        base.group = false
        index += 1
        continue
      }
    }
    pieces.push({ tex: tex ?? char, group: false })
    index += 1
  }
  // Then the fractions: a slash takes the run of pieces on either side up to an operator.
  let out = ""
  let term: Piece[] = []
  let numerator: Piece[] | null = null
  const flush = () => {
    const tex = (list: Piece[]) => (list.length === 1 ? argument(list[0]!) : list.map((item) => item.tex).join(""))
    if (numerator) {
      out += `\\frac{${tex(numerator)}}{${tex(term)}}`
    } else {
      out += term.map((item) => item.tex).join("")
    }
    numerator = null
    term = []
  }
  for (const piece of pieces) {
    if ("op" in piece) {
      if (piece.op === "/") {
        if (numerator) {
          flush()
        }
        numerator = term
        term = []
        continue
      }
      flush()
      out += piece.op === " " ? " " : (UNICODE_TEX[piece.op] ?? piece.op)
      continue
    }
    term.push(piece)
  }
  flush()
  return out.replace(/\s+/g, " ").trim()
}

/** One operand after a script mark or a root: a group, a number, or one character. */
function operand(chars: string[], from: number): { piece: Piece; end: number } | null {
  const char = chars[from]
  if (char === undefined || OPERATORS.has(char) || char === "/") {
    return null
  }
  if (char === "(") {
    const found = parenthesised(chars, from)
    return found ? { piece: { tex: `\\left( ${run(found.inside)} \\right) `, group: true }, end: found.end } : null
  }
  if (/\d/.test(char)) {
    let end = from
    while (end < chars.length && /[\d.]/.test(chars[end]!)) {
      end += 1
    }
    return { piece: { tex: chars.slice(from, end).join(""), group: false }, end }
  }
  return { piece: { tex: UNICODE_TEX[char]?.trim() ?? char, group: false }, end: from + 1 }
}
