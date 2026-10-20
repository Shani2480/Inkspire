import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    onlineVideo: {
      insertOnlineVideo: (src: string) => ReturnType
    }
  }
}

/** Turn a watch URL into an embeddable iframe src, or null if unsupported. */
export function embedVideoSrc(raw: string) {
  const value = raw.trim()
  if (!value) {
    return null
  }
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop()
      if (url.pathname.includes("/embed/") && id) {
        return `https://www.youtube.com/embed/${id}`
      }
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    if (url.pathname.includes("/embed/") || host.includes("player.")) {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

function paintVideo(dom: HTMLElement, node: ProseNode) {
  const src = String(node.attrs.src || "")
  dom.className = "online-video"
  dom.dataset.onlineVideo = ""
  dom.replaceChildren()
  if (!src) {
    const empty = document.createElement("div")
    empty.className = "online-video-empty"
    empty.textContent = "Video"
    dom.append(empty)
    return
  }
  const frame = document.createElement("iframe")
  frame.src = src
  frame.title = "Online video"
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  frame.allowFullscreen = true
  frame.loading = "lazy"
  frame.referrerPolicy = "strict-origin-when-cross-origin"
  dom.append(frame)
}

export const OnlineVideo = Node.create({
  name: "onlineVideo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-src") || element.querySelector("iframe")?.getAttribute("src") || "",
        renderHTML: (attributes) => ({ "data-src": attributes.src || "" }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-online-video]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-online-video": "", class: "online-video" })]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      paintVideo(dom, node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "onlineVideo") {
            return false
          }
          paintVideo(dom, next)
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertOnlineVideo:
        (src) =>
        ({ commands }) => {
          const embed = embedVideoSrc(src)
          if (!embed) {
            return false
          }
          return commands.insertContent({ type: this.name, attrs: { src: embed } })
        },
    }
  },
})
