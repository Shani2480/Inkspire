import { SaxesParser } from "saxes"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import { texFromTyped } from "@/editor/equation-templates"

/**
 * Word's equations (Office Math Markup, `m:oMath`) to and from the LaTeX the editor's equations keep. Writing covers
 * what the equation editor makes (fractions, scripts, radicals, large operators, brackets, matrices, cases,
 * functions, limits, accents, bars, braces, boxes, text); reading covers the same elements as Word writes them, and
 * anything unknown is read for its text so the equation still shows.
 */

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

// ---------------------------------------------------------------------------------------------------------------
// Characters

/** LaTeX commands that stand for one character. */
const SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ϵ",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "ϕ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "⋅",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  bullet: "∙",
  oplus: "⊕",
  ominus: "⊖",
  otimes: "⊗",
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  in: "∈",
  notin: "∉",
  ni: "∋",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  varnothing: "∅",
  setminus: "∖",
  neg: "¬",
  lnot: "¬",
  land: "∧",
  wedge: "∧",
  lor: "∨",
  vee: "∨",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  vdots: "⋮",
  ddots: "⋱",
  prime: "′",
  angle: "∠",
  triangle: "△",
  degree: "°",
  hbar: "ℏ",
  ell: "ℓ",
  Re: "ℜ",
  Im: "ℑ",
  aleph: "ℵ",
  wp: "℘",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  ll: "≪",
  gg: "≫",
  propto: "∝",
  sim: "∼",
  simeq: "≃",
  cong: "≅",
  perp: "⊥",
  parallel: "∥",
  mid: "∣",
  vdash: "⊢",
  models: "⊨",
  rightarrow: "→",
  to: "→",
  leftarrow: "←",
  gets: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  implies: "⟹",
  iff: "⟺",
  mapsto: "↦",
  uparrow: "↑",
  downarrow: "↓",
  longrightarrow: "⟶",
  longleftarrow: "⟵",
  rightleftharpoons: "⇌",
  langle: "⟨",
  rangle: "⟩",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  vert: "|",
  Vert: "‖",
  lvert: "|",
  rvert: "|",
  lVert: "‖",
  rVert: "‖",
  backslash: "\\",
  quad: " ",
  qquad: "  ",
  ",": " ",
  ":": " ",
  ">": " ",
  ";": " ",
  " ": " ",
  "{": "{",
  "}": "}",
  "%": "%",
  "#": "#",
  "&": "&",
  _: "_",
  $: "$",
  "|": "‖",
}

/** The character each symbol is read back as, preferring the first name given for it above. */
const SYMBOL_NAMES = new Map<string, string>()
for (const [name, char] of Object.entries(SYMBOLS)) {
  if (!SYMBOL_NAMES.has(char) && /^[A-Za-z]+$/.test(name)) {
    SYMBOL_NAMES.set(char, name)
  }
}
SYMBOL_NAMES.set("ε", "varepsilon")
SYMBOL_NAMES.set("·", "cdot")
SYMBOL_NAMES.set(" ", "quad")

const DOUBLE_STRUCK: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ" }

/** Function names set upright, with their argument after them. */
const FUNCTIONS = new Set(
  "sin cos tan cot sec csc sinh cosh tanh coth arcsin arccos arctan log ln lg exp det dim gcd deg arg ker hom Pr".split(
    " ",
  ),
)
/** Names whose scripts go under them (`\lim_{x \to 0}`). */
const LIMIT_FUNCTIONS = new Set("lim max min sup inf limsup liminf".split(" "))

/** Large operators: their character, and whether their limits sit under and over (rather than at the side). */
const NARY: Record<string, { chr: string; under: boolean }> = {
  sum: { chr: "∑", under: true },
  prod: { chr: "∏", under: true },
  coprod: { chr: "∐", under: true },
  bigcup: { chr: "⋃", under: true },
  bigcap: { chr: "⋂", under: true },
  bigvee: { chr: "⋁", under: true },
  bigwedge: { chr: "⋀", under: true },
  bigoplus: { chr: "⨁", under: true },
  bigotimes: { chr: "⨂", under: true },
  int: { chr: "∫", under: false },
  iint: { chr: "∬", under: false },
  iiint: { chr: "∭", under: false },
  oint: { chr: "∮", under: false },
}
const NARY_NAMES = new Map(Object.entries(NARY).map(([name, item]) => [item.chr, name]))

const ACCENTS: Record<string, string> = {
  hat: "̂",
  widehat: "̂",
  check: "̌",
  tilde: "̃",
  widetilde: "̃",
  acute: "́",
  grave: "̀",
  dot: "̇",
  ddot: "̈",
  breve: "̆",
  bar: "̅",
  vec: "⃗",
}
const ACCENT_NAMES = new Map<string, string>([
  ["̂", "hat"],
  ["̌", "check"],
  ["̃", "tilde"],
  ["́", "acute"],
  ["̀", "grave"],
  ["̇", "dot"],
  ["̈", "ddot"],
  ["̆", "breve"],
  ["̅", "bar"],
  ["¯", "bar"],
  ["⃗", "vec"],
  ["⃑", "vec"],
])

/** Bracket characters after `\left` / `\right` (and in Word's `m:begChr` / `m:endChr`). */
const DELIMITERS: Record<string, string> = {
  "\\{": "{",
  "\\}": "}",
  "\\|": "‖",
  "\\langle": "⟨",
  "\\rangle": "⟩",
  "\\lfloor": "⌊",
  "\\rfloor": "⌋",
  "\\lceil": "⌈",
  "\\rceil": "⌉",
  "\\vert": "|",
  "\\Vert": "‖",
  "\\lvert": "|",
  "\\rvert": "|",
  "\\lVert": "‖",
  "\\rVert": "‖",
  ".": "",
}
const DELIMITER_TEX: Record<string, string> = {
  "": ".",
  "{": "\\{",
  "}": "\\}",
  "‖": "\\|",
  "⟨": "\\langle",
  "〈": "\\langle",
  "⟩": "\\rangle",
  "〉": "\\rangle",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
}

/** Matrix environments and the brackets Word puts round its `m:m`. */
const MATRICES: Record<string, [string, string] | null> = {
  matrix: null,
  smallmatrix: null,
  array: null,
  pmatrix: ["(", ")"],
  bmatrix: ["[", "]"],
  Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"],
  Vmatrix: ["‖", "‖"],
  cases: ["{", ""],
}
const ALIGNED = new Set(["aligned", "align", "align*", "gathered", "gather", "gather*", "split", "eqnarray"])

// ---------------------------------------------------------------------------------------------------------------
// LaTeX → a tree of Word's math elements

type Row = MathNode[]
type MathNode =
  | { t: "run"; text: string; sty?: "p" | "b" | "nor" }
  | { t: "frac"; num: Row; den: Row; bar: boolean }
  | { t: "script"; base: Row; sub: Row | null; sup: Row | null }
  | { t: "pre"; sub: Row | null; sup: Row | null; base: Row }
  | { t: "rad"; deg: Row | null; e: Row }
  | { t: "nary"; chr: string; under: boolean; sub: Row | null; sup: Row | null; e: Row }
  | { t: "delim"; open: string; close: string; items: Row[] }
  | { t: "matrix"; rows: Row[][] }
  | { t: "eqArr"; rows: Row[] }
  | { t: "func"; name: Row; e: Row }
  | { t: "acc"; chr: string; e: Row }
  | { t: "bar"; top: boolean; e: Row }
  | { t: "lim"; upper: boolean; e: Row; lim: Row }
  | { t: "group"; chr: string; top: boolean; e: Row }
  | { t: "box"; e: Row }

type Token = { kind: "cmd"; name: string } | { kind: "char"; char: string }

function tokenize(tex: string): Token[] {
  const tokens: Token[] = []
  const chars = [...tex]
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!
    if (char === "\\") {
      const next = chars[index + 1]
      if (next === undefined) {
        tokens.push({ kind: "char", char: "\\" })
      } else if (/[A-Za-z]/.test(next)) {
        let name = ""
        while (index + 1 < chars.length && /[A-Za-z]/.test(chars[index + 1]!)) {
          name += chars[index + 1]
          index += 1
        }
        // `\begin{align*}`, `\operatorname*`: the star belongs to the name.
        if (chars[index + 1] === "*" && (name === "operatorname" || name === "limits")) {
          index += 1
        }
        tokens.push({ kind: "cmd", name })
      } else {
        tokens.push({ kind: "cmd", name: next })
        index += 1
      }
    } else if (char === "%") {
      while (index + 1 < chars.length && chars[index + 1] !== "\n") {
        index += 1
      }
    } else if (!/\s/.test(char)) {
      tokens.push({ kind: "char", char })
    }
  }
  return tokens
}

const isChar = (token: Token | undefined, char: string) => token?.kind === "char" && token.char === char
const isCmd = (token: Token | undefined, name: string) => token?.kind === "cmd" && token.name === name

/** Where a large operator's body ends: before the next sign or relation at its own level. */
const BODY_ENDS = new Set(["+", "-", "=", "<", ">", ",", "≠", "≤", "≥", "≈", "≡", "→", "∼", "±", "∓"])

class TexParser {
  private at = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): Row {
    return this.row(() => false)
  }

  private peek() {
    return this.tokens[this.at]
  }

  private next() {
    return this.tokens[this.at++]
  }

  /** Nodes until `stop` says so (the token that stopped it is left unread). */
  private row(stop: (token: Token) => boolean, bodyOf = false): Row {
    const items: Row = []
    while (this.at < this.tokens.length) {
      const token = this.peek()!
      if (stop(token) || isChar(token, "}")) {
        break
      }
      if (bodyOf && items.length > 0 && this.endsBody(token)) {
        break
      }
      const before = this.at
      this.item(items, stop)
      if (this.at === before) {
        this.at += 1
      }
    }
    return items
  }

  private endsBody(token: Token) {
    if (token.kind === "char") {
      return BODY_ENDS.has(token.char)
    }
    const char = SYMBOLS[token.name]
    return char !== undefined && BODY_ENDS.has(char)
  }

  /** One atom with its scripts, added to `items`. */
  private item(items: Row, stop: (token: Token) => boolean) {
    const token = this.next()!
    if (token.kind === "cmd" && NARY[token.name]) {
      const nary = NARY[token.name]!
      let under = nary.under
      const scripts = this.scripts(() => {
        if (isCmd(this.peek(), "limits")) {
          under = true
          return true
        }
        if (isCmd(this.peek(), "nolimits")) {
          under = false
          return true
        }
        return false
      })
      const e = this.row(stop, true)
      items.push({ t: "nary", chr: nary.chr, under, sub: scripts.sub, sup: scripts.sup, e })
      return
    }
    if (
      token.kind === "cmd" &&
      (FUNCTIONS.has(token.name) || LIMIT_FUNCTIONS.has(token.name) || token.name === "operatorname")
    ) {
      const name: MathNode = {
        t: "run",
        text: token.name === "operatorname" ? this.groupText() : token.name,
        sty: "p",
      }
      const scripts = this.scripts(() => isCmd(this.peek(), "limits") || isCmd(this.peek(), "nolimits"))
      let head: Row = [name]
      if (LIMIT_FUNCTIONS.has(token.name) && scripts.sub && !scripts.sup) {
        head = [{ t: "lim", upper: false, e: head, lim: scripts.sub }]
      } else if (scripts.sub || scripts.sup) {
        head = [{ t: "script", base: head, sub: scripts.sub, sup: scripts.sup }]
      }
      items.push({ t: "func", name: head, e: this.operand(stop) })
      return
    }
    const atom = this.atom(token)
    if (atom === null) {
      return
    }
    const scripts = this.scripts(() => false)
    if (!scripts.sub && !scripts.sup) {
      items.push(...atom)
      return
    }
    // `{}^{a}x`: scripts on nothing, before what follows, are Word's pre-scripts.
    const following = this.peek()
    if (atom.length === 0 && following && !stop(following) && !isChar(following, "}")) {
      const base = this.atom(this.next()!) ?? []
      items.push({ t: "pre", sub: scripts.sub, sup: scripts.sup, base })
      return
    }
    // A brace under or over takes its script as the label beside it, as Word draws it.
    const only = atom.length === 1 ? atom[0]! : null
    if (only?.t === "group" && !only.top && scripts.sub && !scripts.sup) {
      items.push({ t: "lim", upper: false, e: atom, lim: scripts.sub })
      return
    }
    if (only?.t === "group" && only.top && scripts.sup && !scripts.sub) {
      items.push({ t: "lim", upper: true, e: atom, lim: scripts.sup })
      return
    }
    items.push({ t: "script", base: atom, sub: scripts.sub, sup: scripts.sup })
  }

  /** The `_` and `^` after an atom; `skip` passes over `\limits` and the like. */
  private scripts(skip: () => boolean) {
    let sub: Row | null = null
    let sup: Row | null = null
    for (;;) {
      if (skip()) {
        this.at += 1
        continue
      }
      const token = this.peek()
      if (isChar(token, "_") && !sub) {
        this.at += 1
        sub = this.argument()
      } else if (isChar(token, "^") && !sup) {
        this.at += 1
        sup = this.argument()
      } else if (isChar(token, "'")) {
        this.at += 1
        sup = [...(sup ?? []), { t: "run", text: "′" }]
      } else {
        return { sub, sup }
      }
    }
  }

  /** What a function applies to: the next atom with its scripts. */
  private operand(stop: (token: Token) => boolean): Row {
    const token = this.peek()
    if (!token || stop(token) || isChar(token, "}")) {
      return []
    }
    const items: Row = []
    this.item(items, stop)
    return items
  }

  /** A command's argument: a `{…}` group, or the next single atom. */
  private argument(): Row {
    const token = this.next()
    if (!token) {
      return []
    }
    return this.atom(token) ?? []
  }

  private group(): Row {
    if (!isChar(this.peek(), "{")) {
      return this.argument()
    }
    this.at += 1
    const inside = this.row(() => false)
    if (isChar(this.peek(), "}")) {
      this.at += 1
    }
    return inside
  }

  /** The text of a `{…}` group as written (for `\text`, `\operatorname`, environment names). */
  private groupText(): string {
    if (!isChar(this.peek(), "{")) {
      const token = this.next()
      return token?.kind === "char" ? token.char : (token?.name ?? "")
    }
    this.at += 1
    let depth = 1
    let text = ""
    while (this.at < this.tokens.length) {
      const token = this.next()!
      if (isChar(token, "{")) {
        depth += 1
      } else if (isChar(token, "}")) {
        depth -= 1
        if (depth === 0) {
          break
        }
      }
      text += token.kind === "char" ? token.char : (SYMBOLS[token.name] ?? token.name)
    }
    return text
  }

  /** `[…]` after `\sqrt`. */
  private optional(): Row | null {
    if (!isChar(this.peek(), "[")) {
      return null
    }
    this.at += 1
    const inside = this.row((token) => isChar(token, "]"))
    if (isChar(this.peek(), "]")) {
      this.at += 1
    }
    return inside
  }

  private delimiter(): string {
    const token = this.next()
    if (!token) {
      return ""
    }
    if (token.kind === "char") {
      return token.char === "." ? "" : token.char
    }
    const key = `\\${token.name}`
    return DELIMITERS[key] ?? SYMBOLS[token.name] ?? ""
  }

  /** An atom: null for a token that is not one (a stray `}` or `&`), an empty row for `{}`. */
  private atom(token: Token): Row | null {
    if (token.kind === "char") {
      if (token.char === "{") {
        this.at -= 1
        const inside = this.group()
        return inside
      }
      if (token.char === "}" || token.char === "&" || token.char === "^" || token.char === "_") {
        return null
      }
      return [{ t: "run", text: token.char === "~" ? " " : token.char === "'" ? "′" : token.char }]
    }
    const name = token.name
    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "cfrac":
        return [{ t: "frac", num: this.group(), den: this.group(), bar: true }]
      case "binom":
      case "dbinom":
      case "tbinom":
        return [
          {
            t: "delim",
            open: "(",
            close: ")",
            items: [[{ t: "frac", num: this.group(), den: this.group(), bar: false }]],
          },
        ]
      case "sqrt": {
        const deg = this.optional()
        return [{ t: "rad", deg, e: this.group() }]
      }
      case "left": {
        const open = this.delimiter()
        const items: Row[] = [[]]
        for (;;) {
          items[items.length - 1]!.push(...this.row((next) => isCmd(next, "right") || isCmd(next, "middle")))
          if (isCmd(this.peek(), "middle")) {
            this.at += 1
            this.delimiter()
            items.push([])
            continue
          }
          break
        }
        let close = ")"
        if (isCmd(this.peek(), "right")) {
          this.at += 1
          close = this.delimiter()
        }
        return [{ t: "delim", open, close, items }]
      }
      case "right":
      case "middle":
        this.delimiter()
        return null
      case "begin":
        return this.environment()
      case "end":
        this.groupText()
        return null
      case "text":
      case "textrm":
      case "mbox":
      case "textnormal":
        return [{ t: "run", text: this.groupText(), sty: "nor" }]
      case "mathrm":
      case "textup":
        return this.styled("p")
      case "mathbf":
      case "textbf":
      case "boldsymbol":
      case "bm":
        return this.styled("b")
      case "mathit":
      case "textit":
      case "mathnormal":
        return this.group()
      case "mathbb": {
        const text = this.groupText()
        return [{ t: "run", text: [...text].map((char) => DOUBLE_STRUCK[char] ?? char).join("") }]
      }
      case "overline":
        return [{ t: "bar", top: true, e: this.group() }]
      case "underline":
        return [{ t: "bar", top: false, e: this.group() }]
      case "overbrace":
        return [{ t: "group", chr: "⏞", top: true, e: this.group() }]
      case "underbrace":
        return [{ t: "group", chr: "⏟", top: false, e: this.group() }]
      case "overset":
      case "stackrel": {
        const lim = this.group()
        return [{ t: "lim", upper: true, e: this.group(), lim }]
      }
      case "underset": {
        const lim = this.group()
        return [{ t: "lim", upper: false, e: this.group(), lim }]
      }
      case "xrightarrow":
      case "xleftarrow": {
        this.optional()
        const lim = this.group()
        return [{ t: "lim", upper: true, e: [{ t: "run", text: name === "xrightarrow" ? "→" : "←" }], lim }]
      }
      case "boxed":
      case "fbox":
        return [{ t: "box", e: this.group() }]
      case "phantom":
      case "hphantom":
      case "vphantom":
        this.group()
        return []
      case "displaystyle":
      case "textstyle":
      case "scriptstyle":
      case "limits":
      case "nolimits":
      case "!":
        return []
      case "mathop":
      case "operatorname":
        return [{ t: "run", text: this.groupText(), sty: "p" }]
      case "\\":
        return null
      default:
        break
    }
    if (ACCENTS[name]) {
      return [{ t: "acc", chr: ACCENTS[name]!, e: this.group() }]
    }
    if (SYMBOLS[name] !== undefined) {
      return [{ t: "run", text: SYMBOLS[name]! }]
    }
    // A command this does not know is kept by name, upright, so nothing typed disappears.
    return [{ t: "run", text: name, sty: "p" }]
  }

  private styled(sty: "p" | "b"): Row {
    return this.group().map((node) => (node.t === "run" && !node.sty ? { ...node, sty } : node))
  }

  private environment(): Row {
    const name = this.groupText()
    if (name === "array") {
      this.groupText()
    }
    const rows: Row[][] = [[[]]]
    const done = (token: Token) => isChar(token, "&") || isCmd(token, "\\") || isCmd(token, "end")
    while (this.at < this.tokens.length) {
      rows[rows.length - 1]![rows[rows.length - 1]!.length - 1]!.push(...this.row(done))
      const token = this.next()
      if (!token || isCmd(token, "end")) {
        this.groupText()
        break
      }
      if (isChar(token, "&")) {
        rows[rows.length - 1]!.push([])
      } else if (isCmd(token, "\\")) {
        rows.push([[]])
      } else if (isChar(token, "}")) {
        // A stray closing brace inside an environment: skip it.
        continue
      }
    }
    // A trailing `\\` leaves an empty last row.
    if (rows.length > 1 && rows[rows.length - 1]!.every((cell) => cell.length === 0)) {
      rows.pop()
    }
    if (ALIGNED.has(name)) {
      return [
        {
          t: "eqArr",
          rows: rows.map((cells) =>
            cells.flatMap((cell, index) => (index === 0 ? cell : [{ t: "run", text: "&" } as MathNode, ...cell])),
          ),
        },
      ]
    }
    const matrix: MathNode = { t: "matrix", rows }
    const brackets = MATRICES[name]
    return brackets ? [{ t: "delim", open: brackets[0], close: brackets[1], items: [[matrix]] }] : [matrix]
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The tree → OMML

const RUN_FONT = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>'
const val = (name: string, value: string) => `<m:${name} m:val="${escapeXml(value)}"/>`
const wrap = (name: string, inner: string) => `<m:${name}>${inner}</m:${name}>`

function writeRow(row: Row): string {
  let out = ""
  for (let index = 0; index < row.length; index += 1) {
    const node = row[index]!
    if (node.t === "run") {
      // Neighbouring runs of the same kind are one run, as Word writes them.
      let text = node.text
      while (row[index + 1]?.t === "run" && (row[index + 1] as { sty?: string }).sty === node.sty) {
        text += (row[index + 1] as { text: string }).text
        index += 1
      }
      out += writeRun(text, node.sty)
      continue
    }
    out += writeNode(node)
  }
  return out
}

function writeRun(text: string, sty?: "p" | "b" | "nor") {
  const properties = sty === "nor" ? "<m:rPr><m:nor/></m:rPr>" : sty ? `<m:rPr>${val("sty", sty)}</m:rPr>` : ""
  return `<m:r>${properties}${RUN_FONT}<m:t xml:space="preserve">${escapeXmlText(text)}</m:t></m:r>`
}

const arg = (name: string, row: Row | null) => (row && row.length > 0 ? wrap(name, writeRow(row)) : `<m:${name}/>`)

function writeNode(node: Exclude<MathNode, { t: "run" }>): string {
  switch (node.t) {
    case "frac":
      return wrap(
        "f",
        `${node.bar ? "" : wrap("fPr", val("type", "noBar"))}${arg("num", node.num)}${arg("den", node.den)}`,
      )
    case "script": {
      if (node.sub && node.sup) {
        return wrap("sSubSup", `${arg("e", node.base)}${arg("sub", node.sub)}${arg("sup", node.sup)}`)
      }
      return node.sup
        ? wrap("sSup", `${arg("e", node.base)}${arg("sup", node.sup)}`)
        : wrap("sSub", `${arg("e", node.base)}${arg("sub", node.sub)}`)
    }
    case "pre":
      return wrap("sPre", `${arg("sub", node.sub)}${arg("sup", node.sup)}${arg("e", node.base)}`)
    case "rad":
      return node.deg && node.deg.length > 0
        ? wrap("rad", `${arg("deg", node.deg)}${arg("e", node.e)}`)
        : wrap("rad", `${wrap("radPr", val("degHide", "1"))}<m:deg/>${arg("e", node.e)}`)
    case "nary": {
      const properties =
        val("chr", node.chr) +
        val("limLoc", node.under ? "undOvr" : "subSup") +
        (node.sub ? "" : val("subHide", "1")) +
        (node.sup ? "" : val("supHide", "1"))
      return wrap(
        "nary",
        `${wrap("naryPr", properties)}${arg("sub", node.sub)}${arg("sup", node.sup)}${arg("e", node.e)}`,
      )
    }
    case "delim":
      return wrap(
        "d",
        wrap("dPr", val("begChr", node.open) + val("endChr", node.close)) +
          node.items.map((item) => arg("e", item)).join(""),
      )
    case "matrix": {
      const columns = Math.max(1, ...node.rows.map((row) => row.length))
      const properties = wrap(
        "mPr",
        wrap("mcs", wrap("mc", wrap("mcPr", val("count", String(columns)) + val("mcJc", "center")))),
      )
      const rows = node.rows.map((row) =>
        wrap("mr", Array.from({ length: columns }, (_, index) => arg("e", row[index] ?? [])).join("")),
      )
      return wrap("m", properties + rows.join(""))
    }
    case "eqArr":
      return wrap("eqArr", node.rows.map((row) => arg("e", row)).join(""))
    case "func":
      return wrap("func", `${arg("fName", node.name)}${arg("e", node.e)}`)
    case "acc":
      return wrap("acc", `${wrap("accPr", val("chr", node.chr))}${arg("e", node.e)}`)
    case "bar":
      return wrap("bar", `${wrap("barPr", val("pos", node.top ? "top" : "bot"))}${arg("e", node.e)}`)
    case "lim":
      return wrap(node.upper ? "limUpp" : "limLow", `${arg("e", node.e)}${arg("lim", node.lim)}`)
    case "group":
      return wrap(
        "groupChr",
        `${wrap("groupChrPr", val("chr", node.chr) + val("pos", node.top ? "top" : "bot") + val("vertJc", node.top ? "bot" : "top"))}${arg("e", node.e)}`,
      )
    case "box":
      return wrap("borderBox", arg("e", node.e))
  }
}

/** Word's markup for an equation the editor keeps as LaTeX; `display` puts it on a line of its own. */
export function texToOmml(tex: string, display = false): string {
  const row = new TexParser(tokenize(tex)).parse()
  const math = `<m:oMath xmlns:m="${MATH_NS}">${writeRow(row)}</m:oMath>`
  return display ? `<m:oMathPara xmlns:m="${MATH_NS}">${math.replace(` xmlns:m="${MATH_NS}"`, "")}</m:oMathPara>` : math
}

// ---------------------------------------------------------------------------------------------------------------
// OMML → LaTeX

type Element = { name: string; attrs: Record<string, string>; children: (Element | string)[] }

const local = (name: string) => name.slice(name.indexOf(":") + 1)

/** A small tree of the equation's markup; prefixes are dropped (the part declares them, the fragment may not). */
function parseTree(xml: string): Element | null {
  const parser = new SaxesParser({ xmlns: false })
  const root: Element = { name: "#root", attrs: {}, children: [] }
  const stack: Element[] = [root]
  let failed = false
  parser.on("error", () => {
    failed = true
  })
  parser.on("opentag", (tag) => {
    const attrs: Record<string, string> = {}
    for (const [key, value] of Object.entries(tag.attributes)) {
      attrs[local(key)] = typeof value === "string" ? value : String(value)
    }
    const element: Element = { name: local(tag.name), attrs, children: [] }
    stack[stack.length - 1]!.children.push(element)
    if (!tag.isSelfClosing) {
      stack.push(element)
    }
  })
  parser.on("closetag", (tag) => {
    if (!tag.isSelfClosing) {
      stack.pop()
    }
  })
  parser.on("text", (text) => {
    stack[stack.length - 1]!.children.push(text)
  })
  try {
    parser.write(xml).close()
  } catch {
    return null
  }
  const first = root.children.find((child): child is Element => typeof child !== "string")
  return failed || !first ? null : first
}

const elements = (element: Element | undefined) =>
  (element?.children ?? []).filter((child): child is Element => typeof child !== "string")
const child = (element: Element | undefined, name: string) => elements(element).find((item) => item.name === name)
/** A property's `m:val`: absent element → undefined, an element without a value → "" (on, for flags). */
const property = (element: Element | undefined, properties: string, name: string) => {
  const found = child(child(element, properties), name)
  return found ? (found.attrs.val ?? "") : undefined
}
const flag = (value: string | undefined) => value !== undefined && value !== "0" && value !== "off" && value !== "false"

function textOf(element: Element): string {
  return element.children.map((item) => (typeof item === "string" ? item : textOf(item))).join("")
}

/** Joins pieces of LaTeX, keeping a command name apart from a letter after it. */
function join(parts: string[]) {
  let out = ""
  for (const part of parts) {
    if (!part) {
      continue
    }
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(part)) {
      out += " "
    }
    out += part
  }
  return out
}

const TEX_SPECIAL: Record<string, string> = {
  "{": "\\{",
  "}": "\\}",
  "#": "\\#",
  "%": "\\%",
  $: "\\$",
  _: "\\_",
  "&": "\\&",
  "\\": "\\backslash",
  "^": "\\hat{}",
  "~": "\\sim",
  " ": "\\,",
  " ": "\\;",
  " ": "~",
}

/** A run's characters as LaTeX. */
function runText(text: string, inArray: boolean) {
  return join(
    [...text].map((char) => {
      if (char === "&" && inArray) {
        return "&"
      }
      if (TEX_SPECIAL[char]) {
        return TEX_SPECIAL[char]!
      }
      const name = SYMBOL_NAMES.get(char)
      return name ? `\\${name}` : char
    }),
  )
}

function readRun(run: Element, inArray: boolean) {
  const text = elements(run)
    .filter((item) => item.name === "t")
    .map(textOf)
    .join("")
  if (!text) {
    return ""
  }
  const properties = child(run, "rPr")
  if (child(properties, "nor")) {
    return `\\text{${text.replace(/[{}\\]/g, (char) => `\\${char}`)}}`
  }
  const sty = property(run, "rPr", "sty")
  const body = runText(text, inArray)
  if (sty === "p" && /^[A-Za-z]{2,}$/.test(text)) {
    return FUNCTIONS.has(text) || LIMIT_FUNCTIONS.has(text) ? `\\${text}` : `\\mathrm{${text}}`
  }
  if (sty === "b") {
    return `\\mathbf{${body}}`
  }
  return body
}

/** The LaTeX for an element's children. */
function readAll(element: Element | undefined, inArray = false): string {
  return join(elements(element).map((item) => read(item, inArray)))
}

const braced = (element: Element | undefined, inArray = false) => `{${readAll(element, inArray)}}`

/** A bracket character as `\left` / `\right` take it. */
const delimiterTex = (char: string) => DELIMITER_TEX[char] ?? (char.length === 1 && /[()[\]|/]/.test(char) ? char : ".")

/** The one element a container holds, if it holds just one. */
function single(element: Element | undefined) {
  const items = elements(element).filter((item) => !item.name.endsWith("Pr"))
  return items.length === 1 ? items[0] : undefined
}

/** What scripts sit on: a lone character or command as it is (so `\\log_{b}` stays a function), else in braces. */
function scriptBase(element: Element) {
  const base = readAll(child(element, "e"))
  return /^(\\[A-Za-z]+|[^\\{}\s^_])$/u.test(base) ? base : `{${base}}`
}

function read(element: Element, inArray: boolean): string {
  switch (element.name) {
    case "r":
      return readRun(element, inArray)
    case "f": {
      const type = property(element, "fPr", "type")
      const num = readAll(child(element, "num"))
      const den = readAll(child(element, "den"))
      if (type === "noBar") {
        return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`
      }
      if (type === "lin" || type === "skw") {
        return `{${num}}/{${den}}`
      }
      return `\\frac{${num}}{${den}}`
    }
    case "sSup":
      return `${scriptBase(element)}^${braced(child(element, "sup"))}`
    case "sSub":
      return `${scriptBase(element)}_${braced(child(element, "sub"))}`
    case "sSubSup":
      return `${scriptBase(element)}_${braced(child(element, "sub"))}^${braced(child(element, "sup"))}`
    case "sPre":
      return `{}_${braced(child(element, "sub"))}^${braced(child(element, "sup"))}${braced(child(element, "e"))}`
    case "rad": {
      const degree = readAll(child(element, "deg"))
      const hidden = flag(property(element, "radPr", "degHide"))
      return `\\sqrt${!hidden && degree ? `[${degree}]` : ""}${braced(child(element, "e"))}`
    }
    case "nary": {
      const chr = property(element, "naryPr", "chr") || "∫"
      const name = NARY_NAMES.get(chr)
      const under = name ? NARY[name]!.under : true
      const location = property(element, "naryPr", "limLoc")
      const limits =
        location === undefined
          ? ""
          : location === "undOvr" && !under
            ? "\\limits"
            : location === "subSup" && under
              ? "\\nolimits"
              : ""
      const sub = flag(property(element, "naryPr", "subHide")) ? "" : readAll(child(element, "sub"))
      const sup = flag(property(element, "naryPr", "supHide")) ? "" : readAll(child(element, "sup"))
      return join([
        name ? `\\${name}` : `\\mathop{${runText(chr, false)}}`,
        limits,
        sub ? `_{${sub}}` : "",
        sup ? `^{${sup}}` : "",
        braced(child(element, "e")),
      ])
    }
    case "d": {
      const open = property(element, "dPr", "begChr") ?? "("
      const close = property(element, "dPr", "endChr") ?? ")"
      const separator = property(element, "dPr", "sepChr") ?? "|"
      const items = elements(element).filter((item) => item.name === "e")
      const only = items.length === 1 ? single(items[0]) : undefined
      if (only?.name === "f" && open === "(" && close === ")" && property(only, "fPr", "type") === "noBar") {
        return `\\binom{${readAll(child(only, "num"))}}{${readAll(child(only, "den"))}}`
      }
      if (only?.name === "m") {
        const environment = Object.entries(MATRICES).find(
          ([name, brackets]) => brackets && brackets[0] === open && brackets[1] === close && name !== "array",
        )?.[0]
        if (environment) {
          return matrixTex(only, environment)
        }
      }
      const middle = `\\middle${delimiterTex(separator)}`
      return join([
        `\\left${delimiterTex(open)}`,
        items.map((item) => readAll(item)).join(middle),
        `\\right${delimiterTex(close)}`,
      ])
    }
    case "m":
      return matrixTex(element, "matrix")
    case "eqArr":
      return `\\begin{aligned}${elements(element)
        .filter((item) => item.name === "e")
        .map((item) => readAll(item, true))
        .join("\\\\")}\\end{aligned}`
    case "func": {
      const name = child(element, "fName")
      const only = single(name)
      const plain = only?.name === "r" ? textOf(child(only, "t") ?? only) : ""
      const head =
        plain && /^[A-Za-z]+$/.test(plain) && !FUNCTIONS.has(plain) && !LIMIT_FUNCTIONS.has(plain)
          ? `\\operatorname{${plain}}`
          : readAll(name)
      const body = child(element, "e")
      const inner = single(body)
      return join([head, inner?.name === "d" ? readAll(body) : braced(body)])
    }
    case "acc": {
      const chr = property(element, "accPr", "chr") ?? "̂"
      const name = ACCENT_NAMES.get(chr) ?? "hat"
      return `\\${name}${braced(child(element, "e"))}`
    }
    case "bar":
      return `\\${property(element, "barPr", "pos") === "top" ? "overline" : "underline"}${braced(child(element, "e"))}`
    case "limLow":
    case "limUpp": {
      const base = child(element, "e")
      const only = single(base)
      const word = only?.name === "r" ? textOf(child(only, "t") ?? only) : ""
      const lim = readAll(child(element, "lim"))
      if (element.name === "limLow" && LIMIT_FUNCTIONS.has(word)) {
        return `\\${word}_{${lim}}`
      }
      const brace = only?.name === "groupChr" ? read(only, false) : ""
      if (brace) {
        return `${brace}${element.name === "limLow" ? "_" : "^"}{${lim}}`
      }
      return `\\${element.name === "limLow" ? "underset" : "overset"}{${lim}}${braced(base)}`
    }
    case "groupChr": {
      const chr = property(element, "groupChrPr", "chr") ?? "⏟"
      const top = property(element, "groupChrPr", "pos") === "top"
      if (chr === "⏟" || chr === "⏞") {
        return `\\${chr === "⏞" ? "overbrace" : "underbrace"}${braced(child(element, "e"))}`
      }
      return `\\${top ? "overset" : "underset"}{${runText(chr, false)}}${braced(child(element, "e"))}`
    }
    case "borderBox":
      return `\\boxed${braced(child(element, "e"))}`
    case "box":
    case "phant":
      return braced(child(element, "e"))
    case "oMath":
      return readAll(element, inArray)
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "lim":
    case "fName":
      return readAll(element, inArray)
    case "t":
      return runText(textOf(element), inArray)
    default:
      // Properties say nothing on their own; anything else is read for what it holds.
      return element.name.endsWith("Pr") ? "" : readAll(element, inArray)
  }
}

function matrixTex(element: Element, environment: string) {
  const rows = elements(element)
    .filter((item) => item.name === "mr")
    .map((row) =>
      elements(row)
        .filter((item) => item.name === "e")
        .map((cell) => readAll(cell))
        .join(" & "),
    )
  return `\\begin{${environment}}${rows.join(" \\\\ ")}\\end{${environment}}`
}

/** LaTeX for a Word equation (`m:oMath`, or `m:oMathPara` for one on its own line); null when it cannot be read. */
export function ommlToTex(xml: string): { tex: string; display: boolean } | null {
  const root = parseTree(xml)
  if (!root || (root.name !== "oMath" && root.name !== "oMathPara")) {
    return null
  }
  if (root.name === "oMath") {
    return { tex: read(root, false).trim(), display: false }
  }
  const lines = elements(root)
    .filter((item) => item.name === "oMath")
    .map((item) => read(item, false).trim())
  return {
    tex: lines.length > 1 ? `\\begin{gathered}${lines.join("\\\\")}\\end{gathered}` : (lines[0] ?? ""),
    display: true,
  }
}

/** Whether `xml` is a Word equation, by its outermost element. */
export function isOmml(xml: string) {
  return /^\s*<(?:[\w-]+:)?oMath(?:Para)?[\s>/]/.test(xml)
}

/**
 * What an editor equation is saved as: the markup Word wrote, while its LaTeX and its layout are as they were read,
 * so an equation that was only looked at goes back exactly; otherwise markup made from the LaTeX.
 */
export function equationOmml(attrs: Record<string, unknown> | undefined) {
  const tex = texFromTyped(String(attrs?.tex ?? ""))
  const display = attrs?.display === true
  const kept = typeof attrs?.omml === "string" ? attrs.omml : ""
  if (kept && attrs?.ommlTex === attrs?.tex && /^\s*<(?:[\w-]+:)?oMathPara[\s>]/.test(kept) === display) {
    return kept
  }
  return texToOmml(tex || "x", display)
}
