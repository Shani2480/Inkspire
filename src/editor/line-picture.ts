import { bindResize, paintImage, PositionedImage, resizeAttrs } from "@/editor/objects"
import { bindPictureCrop, useCropMode } from "@/editor/picture-crop"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"

/**
 * A picture In Line with Text among a line's words, as Word sets it: a character of the line, standing on its
 * baseline and moving with the text. The editor's pictures are blocks of their own (`image`); this one is kept where a
 * Word paragraph holds text beside its picture, so the line reads as Word lays it out. It has every picture
 * attribute, so the Picture Format tab, the Format Picture pane, crop and Reset Picture work on it, and it saves as Word's
 * in-line drawing in its paragraph.
 */
export const LinePicture = PositionedImage.extend({
  name: "linePicture",
  inline: true,
  group: "inline",
  draggable: false,
  // Before the block picture's own rule, which takes any <img>.
  parseHTML() {
    return [{ tag: "img[data-line-picture]", priority: 60 }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, "data-line-picture": "" }]
  },
  // The picture's commands and plugins (paste, nudging, wrap) are the block picture's; one copy is enough.
  addCommands() {
    return {}
  },
  addProseMirrorPlugins() {
    return []
  },
  addKeyboardShortcuts() {
    return {}
  },
  addInputRules() {
    return []
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span")
      let current = node
      const paint = (next: ProseNode) => {
        current = next
        paintImage(dom, next)
        dom.classList.add("is-line-picture")
        dom.contentEditable = "false"
      }
      paint(node)
      const stopResize = bindResize(dom, editor.view, getPos, ["linePicture"])
      // Crop mode, as for any picture: its handles show on the selected one and the hidden parts are drawn faint.
      const syncCropping = (active: boolean) => {
        const on = active && dom.classList.contains("ProseMirror-selectednode")
        if (on !== dom.classList.contains("is-cropping")) {
          dom.classList.toggle("is-cropping", on)
          paint(current)
        }
      }
      const stopCropMode = useCropMode.subscribe((state) => syncCropping(state.active))
      const stopCrop = bindPictureCrop(dom, editor.view, getPos, (picture, box, edge, from) =>
        resizeAttrs(picture, box, edge, from),
      )
      const onSelect = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target : null
        if (event.button !== 0 || target?.closest("[data-resize], [data-crop-edge]")) {
          return
        }
        const pos = getPos()
        if (pos == null) {
          return
        }
        event.preventDefault()
        editor.view.dispatch(editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, pos)))
      }
      dom.addEventListener("pointerdown", onSelect)
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== "linePicture") {
            return false
          }
          paint(next)
          return true
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
          syncCropping(useCropMode.getState().active)
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
          if (dom.classList.contains("is-cropping")) {
            useCropMode.getState().set(false)
          }
          syncCropping(false)
        },
        destroy() {
          stopCropMode()
          stopCrop()
          stopResize()
          dom.removeEventListener("pointerdown", onSelect)
        },
      }
    }
  },
})
