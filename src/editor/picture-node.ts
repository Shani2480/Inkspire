import type { Node as ProseNode } from "@tiptap/pm/model"

/** A picture: one of its own (`image`) or one among a line's words (`linePicture`). */
export function isPictureNode(node: ProseNode | null | undefined): node is ProseNode {
  return node?.type.name === "image" || node?.type.name === "linePicture"
}
