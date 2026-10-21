/** Fluent's decelerate curve: quick start, gentle landing. Kept in step with --motion-ease-in in index.css. */
export const EASE_DECELERATE = "cubic-bezier(0.1, 0.9, 0.2, 1)"

export function prefersReducedMotion() {
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-no-motion")) {
    return true
  }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/**
 * A document that was just created, opened or recovered fades in. The pages themselves never animate: a cover in
 * the workspace colour fades away over them. Animating the pages put them on a layer the desktop webview dropped
 * on the last frame, repainting every page at once (a blink as the animation ended).
 */
export function playDocumentEntrance() {
  if (prefersReducedMotion()) {
    return
  }
  requestAnimationFrame(() => {
    const scroller = document.getElementById("document-scroll")
    if (!scroller) {
      return
    }
    const box = scroller.getBoundingClientRect()
    const cover = document.createElement("div")
    cover.className = "document-entrance-cover"
    Object.assign(cover.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
    document.body.appendChild(cover)
    if (typeof cover.animate !== "function") {
      cover.remove()
      return
    }
    const animation = cover.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 280,
      easing: EASE_DECELERATE,
      fill: "forwards",
    })
    const done = () => cover.remove()
    animation.finished.then(done, done)
  })
}
