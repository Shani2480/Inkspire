import { RelativeTime } from "@/components/relative-time"
import { commentAnchorPoints, markCommentEnds, type AnchorBox } from "@/editor/comment-anchor"
import {
  addCommentReply,
  authorInitials,
  deleteComment,
  editCommentText,
  listComments,
  selectComment,
  updateComment,
  type CommentRecord,
} from "@/editor/comments"
import { useBodyEditor } from "@/editor/document-editor"
import { useReviewStore } from "@/document/review"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useEditorState } from "@tiptap/react"
import { Check, MoreHorizontal, PanelRight, MessageSquare, X } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"

type MarkerGroup = {
  key: string
  top: number
  left: number
  ids: string[]
  primary: CommentRecord
}

export function CommentMarkers() {
  const editor = useBodyEditor()
  const pageSetup = useDocumentStore((state) => state.pageSetup)
  const metrics = pageMetrics(pageSetup)
  const zoom = useViewStore((state) => state.zoom)
  const showComments = useReviewStore((state) => state.showComments)
  const showResolved = useReviewStore((state) => state.showResolved)
  const activeCommentId = useReviewStore((state) => state.activeCommentId)
  const popoverCommentId = useReviewStore((state) => state.popoverCommentId)
  const focusComment = useReviewStore((state) => state.focusComment)
  const setPopoverCommentId = useReviewStore((state) => state.setPopoverCommentId)
  const setPanel = useReviewStore((state) => state.setPanel)
  const hostRef = useRef<HTMLDivElement>(null)
  const [groups, setGroups] = useState<MarkerGroup[]>([])
  const comments = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listComments(current.state.doc) : []),
  })

  const visible = useMemo(
    () => (comments ?? []).filter((comment) => showResolved || !comment.resolved),
    [comments, showResolved],
  )

  useLayoutEffect(() => {
    if (!editor || !hostRef.current) {
      setGroups([])
      return
    }
    const host = hostRef.current
    const article = host.closest(".page-canvas") as HTMLElement | null
    if (!article) {
      return
    }

    function measure() {
      if (!editor || !article) {
        return
      }
      const articleRect = article.getBoundingClientRect()
      const next: MarkerGroup[] = []
      const buckets = new Map<string, MarkerGroup>()

      for (const comment of visible) {
        try {
          const coords = editor.view.coordsAtPos(comment.from)
          const top = (coords.top - articleRect.top) / zoom
          const left = metrics.width - 26
          const lineKey = String(Math.round(top / 8))
          const existing = buckets.get(lineKey)
          if (existing) {
            existing.ids.push(comment.id)
            if (comment.from < existing.primary.from) {
              existing.primary = comment
              existing.top = top
            }
          } else {
            const group: MarkerGroup = {
              key: lineKey,
              top,
              left,
              ids: [comment.id],
              primary: comment,
            }
            buckets.set(lineKey, group)
            next.push(group)
          }
        } catch {
          // Position may be temporarily invalid during pagination.
        }
      }
      setGroups(next)
    }

    measure()
    const scroll = document.getElementById("document-scroll")
    scroll?.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    const observer = new ResizeObserver(measure)
    observer.observe(article)
    return () => {
      scroll?.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
      observer.disconnect()
    }
  }, [editor, visible, zoom, metrics.width, comments])

  useEffect(() => {
    const marks = [...document.querySelectorAll<HTMLElement>(".comment-mark")]
    markCommentEnds(marks, showComments ? activeCommentId : null)
  }, [activeCommentId, comments, groups, showComments])

  const popoverComment = showComments ? (visible.find((item) => item.id === popoverCommentId) ?? null) : null
  const popoverAnchor = showComments ? groups.find((group) => group.ids.includes(popoverCommentId ?? "")) : undefined

  if (!showComments) {
    return null
  }

  return (
    <div
      ref={hostRef}
      className="comment-markers pointer-events-none absolute inset-0 z-20"
      aria-hidden={!groups.length}
    >
      {groups.map((group) => {
        const active = group.ids.includes(activeCommentId ?? "")
        return (
          <button
            key={group.key}
            type="button"
            data-anchor-key={group.key}
            className={`comment-margin-marker pointer-events-auto ${active ? "is-active" : ""}`}
            style={{ top: group.top, left: group.left }}
            aria-label={group.ids.length > 1 ? `${group.ids.length} comments` : `Comment by ${group.primary.author}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const id = group.ids.includes(activeCommentId ?? "") ? (activeCommentId as string) : group.primary.id
              focusComment(id, { openPopover: true })
              if (editor) {
                selectComment(editor, id)
              }
            }}
          >
            <MessageSquare className="size-3" strokeWidth={2} />
            {group.ids.length > 1 ? <span className="comment-margin-count">{group.ids.length}</span> : null}
          </button>
        )
      })}
      {popoverComment && popoverAnchor ? (
        <CommentPopover
          comment={popoverComment}
          anchorKey={popoverAnchor.key}
          onClose={() => setPopoverCommentId(null)}
          onOpenSidebar={() => {
            setPanel(true)
            focusComment(popoverComment.id, { closePopover: true, openPanel: true })
          }}
        />
      ) : null}
    </div>
  )
}

const POPOVER_WIDTH = 280
const POPOVER_GAP = 10
const POPOVER_PAD = 8

function placeCommentPopover(marker: HTMLElement, card: HTMLElement | null) {
  const rect = marker.getBoundingClientRect()
  const width = card?.offsetWidth || POPOVER_WIDTH
  const height = card?.offsetHeight || 180
  const viewW = window.innerWidth
  const viewH = window.innerHeight

  // Beside the page, as Word's card sits in the margin; over the document (left of the marker) when that is clipped.
  let left = rect.right + POPOVER_GAP
  if (left + width > viewW - POPOVER_PAD) {
    left = rect.left - width - POPOVER_GAP
  }
  left = Math.min(Math.max(POPOVER_PAD, left), viewW - width - POPOVER_PAD)

  let top = rect.top - 4
  top = Math.min(Math.max(POPOVER_PAD, top), viewH - height - POPOVER_PAD)

  return { top, left }
}

/** The anchor line's points from the end of the comment's range to its card, in viewport pixels. */
function anchorLine(commentId: string, card: AnchorBox) {
  const marks = document.querySelectorAll<HTMLElement>(`.comment-mark[data-comment-id="${CSS.escape(commentId)}"]`)
  const rects = marks.length ? [...marks[marks.length - 1].getClientRects()] : []
  const end = rects[rects.length - 1]
  if (!end) {
    return null
  }
  const points = commentAnchorPoints(end, card)
  return points ? points.map((point) => point.join(",")).join(" ") : null
}

function CommentPopover({
  comment,
  anchorKey,
  onClose,
  onOpenSidebar,
}: {
  comment: CommentRecord
  anchorKey: string
  onClose: () => void
  onOpenSidebar: () => void
}) {
  const editor = useBodyEditor()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)
  const [reply, setReply] = useState("")
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [line, setLine] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(comment.text)
    setEditing(false)
    setReply("")
  }, [comment.id, comment.text])

  useLayoutEffect(() => {
    function reposition() {
      const marker = document.querySelector<HTMLElement>(
        `.comment-margin-marker[data-anchor-key="${CSS.escape(anchorKey)}"]`,
      )
      if (!marker) {
        return
      }
      const next = placeCommentPopover(marker, cardRef.current)
      setPos(next)
      const card = cardRef.current
      const width = card?.offsetWidth || POPOVER_WIDTH
      const height = card?.offsetHeight || 180
      setLine(
        anchorLine(comment.id, { left: next.left, top: next.top, right: next.left + width, bottom: next.top + height }),
      )
    }
    reposition()
    // Second pass after content paints so tall cards clamp correctly.
    const frame = requestAnimationFrame(reposition)
    const scroll = document.getElementById("document-scroll")
    scroll?.addEventListener("scroll", reposition, { passive: true })
    window.addEventListener("resize", reposition)
    return () => {
      cancelAnimationFrame(frame)
      scroll?.removeEventListener("scroll", reposition)
      window.removeEventListener("resize", reposition)
    }
  }, [anchorKey, comment.id, comment.text, comment.replies.length, editing, menuOpen])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (cardRef.current?.contains(target)) {
        return
      }
      if ((target as HTMLElement | null)?.closest?.(".comment-margin-marker")) {
        return
      }
      onClose()
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])

  function submitEdit() {
    if (!editor || !editCommentText(editor, comment.id, draft)) {
      return
    }
    setEditing(false)
  }

  function submitReply(event?: FormEvent) {
    event?.preventDefault()
    if (!editor || !addCommentReply(editor, comment.id, reply)) {
      return
    }
    setReply("")
  }

  function onReplyKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      submitReply()
    }
  }

  return createPortal(
    <>
      {line ? (
        <svg className="comment-anchor-line" aria-hidden>
          <polyline points={line} />
        </svg>
      ) : null}
      <div
        ref={cardRef}
        className="comment-popover pointer-events-auto"
        style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
        role="dialog"
        aria-label="Comment"
      >
        <div className="comment-popover-header">
          <span className="comment-avatar" aria-hidden>
            {authorInitials(comment.author)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[var(--app-ribbon-text)]">{comment.author}</p>
            <p className="text-[11px] text-[var(--app-ribbon-muted)]">
              <RelativeTime value={comment.created} />
            </p>
          </div>
          <div className="relative flex items-center gap-0.5">
            <button
              type="button"
              className="comment-icon-btn"
              title={comment.resolved ? "Reopen" : "Resolve"}
              aria-label={comment.resolved ? "Reopen" : "Resolve"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor && updateComment(editor, comment.id, !comment.resolved)}
            >
              <Check className="size-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="comment-icon-btn"
              title="More"
              aria-label="More actions"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="size-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="comment-icon-btn"
              title="View in Sidebar"
              aria-label="View in Sidebar"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onOpenSidebar}
            >
              <PanelRight className="size-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="comment-icon-btn"
              title="Close"
              aria-label="Close"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClose}
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
            {menuOpen ? (
              <div className="comment-more-menu">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setMenuOpen(false)
                    setEditing(true)
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setMenuOpen(false)
                    editor && deleteComment(editor, comment.id)
                    onClose()
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {comment.resolved ? <p className="comment-resolved-badge">Resolved</p> : null}
        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="comment-input"
              value={draft}
              rows={3}
              aria-label="Edit comment"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  submitEdit()
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="comment-text-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="comment-primary-btn" onClick={submitEdit}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-body">{comment.text}</p>
        )}
        {comment.replies.length > 0 ? (
          <ul className="comment-replies">
            {comment.replies.map((item) => (
              <li key={item.id}>
                <p className="text-[11px] font-medium text-[var(--app-ribbon-text)]">
                  {item.author} · <RelativeTime value={item.created} />
                </p>
                <p className="text-[12px] text-[var(--app-ribbon-text)]">{item.text}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {!comment.resolved ? (
          <form className="mt-2" onSubmit={submitReply}>
            <textarea
              className="comment-input"
              rows={2}
              placeholder="Reply..."
              aria-label="Reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={onReplyKey}
            />
            <div className="mt-1.5 flex justify-end">
              <button type="submit" className="comment-primary-btn" disabled={!reply.trim()}>
                Post
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
