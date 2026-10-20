import { RelativeTime } from "@/components/relative-time"
import { useReviewStore } from "@/document/review"
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
import { useDocumentEditor } from "@/editor/document-editor"
import { acceptChanges, listChanges, rejectChanges, type TrackedChange } from "@/editor/track-changes"
import { useEditorState } from "@tiptap/react"
import { Check, MoreHorizontal, X } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

export function ReviewPanel() {
  const editor = useDocumentEditor()
  const panel = useReviewStore((state) => state.panel)
  const showResolved = useReviewStore((state) => state.showResolved)
  const setShowResolved = useReviewStore((state) => state.setShowResolved)
  const setPanel = useReviewStore((state) => state.setPanel)
  const activeCommentId = useReviewStore((state) => state.activeCommentId)
  const focusComment = useReviewStore((state) => state.focusComment)
  const listRef = useRef<HTMLDivElement>(null)
  const comments = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listComments(current.state.doc) : []),
  })
  const changes = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? listChanges(current.state.doc) : []),
  })

  useEffect(() => {
    if (!panel || !activeCommentId || !listRef.current) {
      return
    }
    const card = listRef.current.querySelector<HTMLElement>(`[data-comment-card="${activeCommentId}"]`)
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [panel, activeCommentId, comments])

  if (!panel) {
    return null
  }

  const visible = (comments ?? []).filter((comment) => showResolved || !comment.resolved)

  return (
    <aside aria-label="Comments" className="comments-sidebar app-overlay flex min-h-0 w-80 shrink-0 flex-col">
      <div className="comments-sidebar-header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--app-ribbon-text)]">Comments</h2>
          <button
            type="button"
            className="comment-icon-btn"
            aria-label="Close comments"
            onClick={() => setPanel(false)}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--app-ribbon-muted)]">
          <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />
          Show resolved
        </label>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {visible.length === 0 ? <p className="text-xs text-[var(--app-ribbon-muted)]">No comments</p> : null}
        <ul className="space-y-2">
          {visible.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              active={comment.id === activeCommentId}
              onActivate={() => {
                focusComment(comment.id, { closePopover: true })
                if (editor) {
                  selectComment(editor, comment.id)
                }
              }}
            />
          ))}
        </ul>
        <h2 className="mt-4 mb-2 text-sm font-semibold text-[var(--app-ribbon-text)]">Changes</h2>
        {(changes ?? []).length === 0 ? <p className="text-xs text-[var(--app-ribbon-muted)]">No changes</p> : null}
        <ul className="space-y-2">
          {(changes ?? []).map((change) => (
            <ChangeRow key={`${change.kind}-${change.id}-${change.from}`} change={change} />
          ))}
        </ul>
      </div>
    </aside>
  )
}

function CommentCard({
  comment,
  active,
  onActivate,
}: {
  comment: CommentRecord
  active: boolean
  onActivate: () => void
}) {
  const editor = useDocumentEditor()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)
  const [reply, setReply] = useState("")

  useEffect(() => {
    setDraft(comment.text)
  }, [comment.text])

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

  return (
    <li
      data-comment-card={comment.id}
      className={`comment-sidebar-card ${active ? "is-active" : ""} ${comment.resolved ? "is-resolved" : ""}`}
    >
      <button
        type="button"
        className="w-full text-left"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onActivate}
      >
        <div className="flex items-start gap-2">
          <span className="comment-avatar" aria-hidden>
            {authorInitials(comment.author)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[var(--app-ribbon-text)]">{comment.author}</p>
            <p className="text-[11px] text-[var(--app-ribbon-muted)]">
              <RelativeTime value={comment.created} />
            </p>
          </div>
          <div className="relative flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
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
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {comment.resolved ? <p className="comment-resolved-badge">Resolved</p> : null}
        {comment.excerpt ? (
          <p className="mt-1 truncate text-[11px] text-[var(--app-ribbon-muted)]">“{comment.excerpt}”</p>
        ) : null}
      </button>
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
        <p className="comment-body mt-1.5">{comment.text}</p>
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
    </li>
  )
}

function ChangeRow({ change }: { change: TrackedChange }) {
  const editor = useDocumentEditor()
  return (
    <li className="comment-sidebar-card">
      <p className="text-[11px] text-[var(--app-ribbon-muted)]">
        {change.kind === "insertion" ? "Inserted" : "Deleted"}
      </p>
      <p className={`mt-1 text-xs ${change.kind === "deletion" ? "text-red-700 line-through" : "text-green-800"}`}>
        {change.text || " "}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="comment-text-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor && acceptChanges(editor, [change.id])}
        >
          Accept
        </button>
        <button
          type="button"
          className="comment-text-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor && rejectChanges(editor, [change.id])}
        >
          Reject
        </button>
      </div>
    </li>
  )
}
