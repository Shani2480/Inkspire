type Katex = typeof import("katex").default

let loaded: Katex | null = null
let loading: Promise<Katex> | null = null

/** KaTeX and its fonts are large and only equations need them, so they load on first use rather than at start. */
export function loadKatex() {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([module]) => {
    loaded = module.default
    return loaded
  })
  return loading
}

/** KaTeX when it has already loaded, for drawing at once; null before that. */
export function katexIfLoaded() {
  return loaded
}
