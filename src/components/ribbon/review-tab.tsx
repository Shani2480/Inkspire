import { useEditingOptions } from "@/document/editing-options"
import { readability } from "@/lib/readability"
import { useProofing } from "@/ai/proofing"
import { useEditorPane } from "@/editor/grammar"
import { EditorIcon, RibbonSvg } from "@/components/ribbon/icons"
import {
  LineAccessibilityIcon,
  LineCommentIcon,
  LineDeleteCommentIcon,
  LineMarkupIcon,
  LineSettleIcon,
  LineShowCommentsIcon,
  LineSpellingIcon,
  LineStepChangeIcon,
  LineStepCommentIcon,
  LineTrackChangesIcon,
  LineTranslateIcon,
  LineWordCountIcon,
} from "@/components/ribbon/line-icons"
import { MenuButton, RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { useReviewStore, type MarkupMode } from "@/document/review"
import { addComment, deleteComment, listComments, selectComment } from "@/editor/comments"
import { useDocumentEditor } from "@/editor/document-editor"
import { checkSpellingNow } from "@/editor/spellcheck"
import { acceptChanges, changeAtSelection, listChanges, rejectChanges } from "@/editor/track-changes"
import { DOCUMENT_LANGUAGES } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { useAccessibility } from "@/ai/accessibility-check"
import { openCompare } from "@/components/compare-dialog"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useState } from "react"
import { DialogFrame } from "@/components/word-dialog"

const MARKUP: { id: MarkupMode; label: string }[] = [
  { id: "simple", label: "Simple Markup" },
  { id: "all", label: "All Markup" },
  { id: "original", label: "Original" },
]

export function ReviewTab() {
  const editor = useDocumentEditor()
  const panel = useReviewStore((state) => state.panel)
  const showComments = useReviewStore((state) => state.showComments)
  const tracking = useReviewStore((state) => state.tracking)
  const markup = useReviewStore((state) => state.markup)
  const setPanel = useReviewStore((state) => state.setPanel)
  const setShowComments = useReviewStore((state) => state.setShowComments)
  const setTracking = useReviewStore((state) => state.setTracking)
  const setMarkup = useReviewStore((state) => state.setMarkup)
  const review = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return { commentable: false, change: false, any: false }
      }
      return {
        // Word allows New Comment with only a caret — anchors to the word/line.
        commentable: true,
        any: listChanges(current.state.doc).length > 0,
      }
    },
  })
  const commentable = review?.commentable ?? false
  const hasAny = review?.any ?? false
  const spellCheck = useViewStore((state) => state.spellCheck)
  const toggleSpellCheck = useViewStore((state) => state.toggleSpellCheck)
  const hideInk = useViewStore((state) => state.hideInk)
  const setHideInk = useViewStore((state) => state.setHideInk)
  const openProofing = useProofing((state) => state.openPanel)
  const openEditorPane = useEditorPane((state) => state.openPane)
  const [countOpen, setCountOpen] = useState(false)
  const openAccessibility = useAccessibility((state) => state.openPane)
  const [notesOpen, setNotesOpen] = useState(false)
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const restricted = useViewStore((state) => state.restricted)
  const markupLabel = MARKUP.find((item) => item.id === markup)?.label ?? "Simple Markup"

  const off = !editor
  const noChanges = off || !hasAny

  const spellingMenu = (close: () => void) => (
    <div className="flex w-60 flex-col">
      <MenuButton
        onClick={() => {
          close()
          if (editor) {
            void checkSpellingNow(editor)
          }
        }}
      >
        Check Spelling Now
      </MenuButton>
      {/* Stays open so the page can be seen clearing or filling in. */}
      <MenuButton selected={spellCheck} onClick={toggleSpellCheck}>
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={spellCheck} readOnly tabIndex={-1} className="pointer-events-none" />
          Check spelling as you type
        </span>
      </MenuButton>
      <MenuButton
        onClick={() => {
          openEditorPane()
          close()
        }}
      >
        Editor (spelling and grammar)
      </MenuButton>
    </div>
  )
  const accessibilityMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          openAccessibility()
          close()
        }}
      >
        Check Accessibility
      </MenuButton>
      <MenuButton
        onClick={() => {
          openAccessibility()
          close()
        }}
      >
        Check Accessibility again
      </MenuButton>
    </div>
  )
  const translateMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          openProofing("translation")
          close()
        }}
      >
        Translate Selection
      </MenuButton>
      <MenuButton
        onClick={() => {
          if (editor) {
            editor.chain().focus().selectAll().run()
          }
          openProofing("translation")
          close()
        }}
      >
        Translate Document
      </MenuButton>
    </div>
  )
  const commentMenu = (close: () => void) => <CommentForm close={close} />
  const deleteMenu = (close: () => void) => (
    <div className="flex w-40 flex-col">
      <MenuButton
        onClick={() => {
          editor && deleteCurrentComment(editor)
          close()
        }}
      >
        Delete
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor && deleteAllComments(editor)
          close()
        }}
      >
        Delete all
      </MenuButton>
    </div>
  )
  const markupMenu = (close: () => void) => (
    <div className="flex w-40 flex-col">
      {MARKUP.map((item) => (
        <MenuButton
          key={item.id}
          selected={markup === item.id}
          onClick={() => {
            setMarkup(item.id)
            close()
          }}
        >
          {item.label}
        </MenuButton>
      ))}
    </div>
  )
  const acceptMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      <MenuButton
        onClick={() => {
          editor && settleCurrent(editor, "accept")
          close()
        }}
      >
        Accept and move to next
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor && acceptChanges(editor)
          close()
        }}
      >
        Accept all
      </MenuButton>
    </div>
  )
  const rejectMenu = (close: () => void) => (
    <div className="flex w-48 flex-col">
      <MenuButton
        onClick={() => {
          editor && settleCurrent(editor, "reject")
          close()
        }}
      >
        Reject and move to next
      </MenuButton>
      <MenuButton
        onClick={() => {
          editor && rejectChanges(editor)
          close()
        }}
      >
        Reject all
      </MenuButton>
    </div>
  )
  const compareMenu = (close: () => void) => (
    <div className="flex w-52 flex-col">
      <MenuButton
        disabled={!editor}
        onClick={() => {
          editor && openCompare(editor)
          close()
        }}
      >
        Compare…
      </MenuButton>
      <MenuButton
        disabled={!editor}
        onClick={() => {
          editor && openCompare(editor)
          close()
        }}
      >
        Combine…
      </MenuButton>
    </div>
  )
  const dialogs = (
    <>
      {countOpen ? <WordCountDialog editor={editor} onClose={() => setCountOpen(false)} /> : null}
      {notesOpen && editor ? <LinkedNotesDialog editor={editor} onClose={() => setNotesOpen(false)} /> : null}
    </>
  )

  if (ribbonLayout === "single") {
    // Word for the web's single line Review tab, left to right (`screenshots/ribbon/`). Mark All as Read and the
    // comment Filter are left out: comments here have no read state or people to filter by.
    const proofing: LineCommand[] = [
      {
        id: "editor",
        label: "Editor",
        icon: <EditorIcon />,
        showLabel: true,
        priority: 2,
        description: "Check spelling, grammar and writing suggestions.",
        onClick: () => openEditorPane(),
      },
      {
        id: "spelling",
        label: "Spelling & Grammar",
        icon: <LineSpellingIcon />,
        showLabel: true,
        priority: 1,
        active: spellCheck,
        menu: spellingMenu,
      },
      {
        id: "word-count",
        label: "Word Count",
        icon: <LineWordCountIcon />,
        showLabel: true,
        onClick: () => setCountOpen(true),
      },
      {
        id: "accessibility",
        label: "Check Accessibility",
        icon: <LineAccessibilityIcon />,
        showLabel: true,
        onClick: () => openAccessibility(),
      },
    ]
    const language: LineCommand[] = [
      { id: "translate", label: "Translate", icon: <LineTranslateIcon />, showLabel: true, menu: translateMenu },
    ]
    const comments: LineCommand[] = [
      {
        id: "new-comment",
        label: "New Comment",
        icon: <LineCommentIcon />,
        priority: 3,
        chevron: false,
        disabled: off || !commentable,
        menu: commentMenu,
      },
      { id: "delete-comment", label: "Delete Comment", icon: <LineDeleteCommentIcon />, priority: 1, menu: deleteMenu },
      {
        id: "previous-comment",
        label: "Previous Comment",
        icon: <LineStepCommentIcon direction="previous" />,
        onClick: () => editor && stepComment(editor, -1),
      },
      {
        id: "next-comment",
        label: "Next Comment",
        icon: <LineStepCommentIcon direction="next" />,
        onClick: () => editor && stepComment(editor, 1),
      },
      {
        id: "show-comments",
        label: "Show Comments",
        icon: <LineShowCommentsIcon />,
        showLabel: true,
        priority: 2,
        active: showComments,
        description: "Show or hide comment markers in the margin.",
        onClick: () => setShowComments(!showComments),
      },
    ]
    const markupView: LineCommand[] = [
      {
        id: "markup-view",
        label: "Markup view",
        icon: <LineMarkupIcon />,
        showLabel: true,
        priority: 1,
        description: `Choose how changes and comments show. Currently ${markupLabel}.`,
        menu: markupMenu,
      },
    ]
    const changes: LineCommand[] = [
      {
        id: "track-changes",
        label: "Track Changes",
        icon: <LineTrackChangesIcon />,
        showLabel: true,
        priority: 3,
        active: tracking,
        onClick: () => setTracking(!tracking),
      },
      {
        id: "accept",
        label: "Accept",
        icon: <LineSettleIcon kind="accept" />,
        priority: 2,
        disabled: noChanges,
        onClick: () => editor && settleCurrent(editor, "accept"),
        menu: acceptMenu,
      },
      {
        id: "reject",
        label: "Reject",
        icon: <LineSettleIcon kind="reject" />,
        priority: 2,
        disabled: noChanges,
        onClick: () => editor && settleCurrent(editor, "reject"),
        menu: rejectMenu,
      },
      {
        id: "previous-change",
        label: "Previous Change",
        icon: <LineStepChangeIcon direction="previous" />,
        disabled: noChanges,
        onClick: () => editor && stepChange(editor, -1),
      },
      {
        id: "next-change",
        label: "Next Change",
        icon: <LineStepChangeIcon direction="next" />,
        disabled: noChanges,
        onClick: () => editor && stepChange(editor, 1),
      },
    ]
    const more: LineGroup[] = [
      {
        id: "proofing",
        commands: [
          { id: "thesaurus", label: "Thesaurus", icon: <BookIcon />, onClick: () => openProofing("thesaurus") },
          { id: "read-aloud", label: "Read Aloud", icon: <ReadAloudIcon />, onClick: () => speak(editor) },
          {
            id: "language",
            label: "Language",
            icon: <LanguageIcon />,
            menu: (close) => <LanguageList close={close} />,
          },
        ],
      },
      {
        id: "tracking",
        commands: [
          {
            id: "reviewing-pane",
            label: "Reviewing Pane",
            icon: <PaneIcon />,
            active: panel,
            onClick: () => setPanel(!panel),
          },
          { id: "compare", label: "Compare", icon: <CompareIcon />, menu: compareMenu },
        ],
      },
      {
        id: "protect",
        commands: [
          {
            id: "block-authors",
            label: "Block Authors",
            icon: <AuthorsIcon />,
            active: restricted,
            menu: (close) => <BlockAuthorsList editor={editor} close={close} />,
          },
          {
            id: "restrict-editing",
            label: "Restrict Editing",
            icon: <ProtectIcon />,
            active: restricted,
            menu: (close) => <RestrictList editor={editor} close={close} />,
          },
        ],
      },
      {
        id: "ink",
        commands: [
          {
            id: "hide-ink",
            label: "Hide Ink",
            icon: <InkIcon />,
            active: hideInk,
            onClick: () => setHideInk(!hideInk),
          },
          { id: "linked-notes", label: "Linked Notes", icon: <NotesIcon />, onClick: () => setNotesOpen(true) },
        ],
      },
    ]
    const disable = (commands: LineCommand[]) =>
      commands.map((command) => ({ ...command, disabled: command.disabled || off }))

    return (
      <>
        <SingleLineBar
          label="Review"
          groups={[
            { id: "proofing", commands: disable(proofing) },
            { id: "language", commands: disable(language) },
            { id: "comments", commands: disable(comments) },
            { id: "markup", commands: markupView },
            { id: "changes", commands: disable(changes) },
          ]}
          more={more.map((group) => ({ ...group, commands: disable(group.commands) }))}
        />
        {dialogs}
      </>
    )
  }

  return (
    <div role="toolbar" aria-label="Review" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Proofing" className="shrink-0">
        <RibbonCommand label="Spelling & Grammar" active={spellCheck} disabled={off} menu={spellingMenu}>
          <SpellIcon />
        </RibbonCommand>
        <RibbonCommand label="Thesaurus" disabled={off} onClick={() => openProofing("thesaurus")}>
          <BookIcon />
        </RibbonCommand>
        <RibbonCommand label="Word Count" disabled={off} onClick={() => setCountOpen(true)}>
          <CountIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Speech" className="shrink-0">
        <RibbonCommand label="Read Aloud" disabled={off} onClick={() => speak(editor)}>
          <ReadAloudIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Accessibility" className="shrink-0">
        <RibbonCommand label="Check Accessibility" disabled={off} menu={accessibilityMenu}>
          <AccessIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Language" className="shrink-0">
        <RibbonCommand label="Translate" disabled={off} menu={translateMenu}>
          <TranslateIcon />
        </RibbonCommand>
        <RibbonCommand label="Language" menu={(close) => <LanguageList close={close} />}>
          <LanguageIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Comments" className="shrink-0">
        <RibbonCommand label="New Comment" disabled={off || !commentable} menu={commentMenu}>
          <NewCommentIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack is-tight">
          <RibbonCommand size="small" label="Delete" disabled={off} menu={deleteMenu}>
            <TrashIcon />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Previous"
            description="Jump to the previous comment."
            disabled={off}
            onClick={() => editor && stepComment(editor, -1)}
          >
            <PageArrow direction="left" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Next"
            description="Jump to the next comment."
            disabled={off}
            onClick={() => editor && stepComment(editor, 1)}
          >
            <PageArrow direction="right" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Show Comments"
            description="Show or hide comment markers in the margin."
            active={showComments}
            disabled={off}
            onClick={() => setShowComments(!showComments)}
          >
            <CommentIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Tracking" className="shrink-0">
        <RibbonCommand label="Track Changes" active={tracking} disabled={off} onClick={() => setTracking(!tracking)}>
          <TrackIcon />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Simple Markup"
            description={`Show markup. Currently ${markupLabel}.`}
            menu={markupMenu}
          >
            <span className="max-w-[72px] truncate text-[10px] leading-tight">{markupLabel}</span>
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Reviewing Pane"
            active={panel}
            disabled={off}
            onClick={() => setPanel(!panel)}
          >
            <PaneIcon />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Changes" className="shrink-0">
        <RibbonCommand label="Accept" disabled={noChanges} menu={acceptMenu}>
          <PageMark kind="check" />
        </RibbonCommand>
        <RibbonCommand label="Reject" disabled={noChanges} menu={rejectMenu}>
          <PageMark kind="cross" />
        </RibbonCommand>
        <div className="ribbon-side-stack">
          <RibbonCommand
            size="small"
            label="Previous"
            description="Jump to the previous tracked change."
            disabled={noChanges}
            onClick={() => editor && stepChange(editor, -1)}
          >
            <PageArrow direction="left" />
          </RibbonCommand>
          <RibbonCommand
            size="small"
            label="Next"
            description="Jump to the next tracked change."
            disabled={noChanges}
            onClick={() => editor && stepChange(editor, 1)}
          >
            <PageArrow direction="right" />
          </RibbonCommand>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Compare" className="shrink-0">
        <RibbonCommand label="Compare" disabled={off} menu={compareMenu}>
          <CompareIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Protect" className="shrink-0">
        <RibbonCommand
          label="Block Authors"
          active={restricted}
          menu={(close) => <BlockAuthorsList editor={editor} close={close} />}
        >
          <AuthorsIcon />
        </RibbonCommand>
        <RibbonCommand
          label="Restrict Editing"
          active={restricted}
          menu={(close) => <RestrictList editor={editor} close={close} />}
        >
          <ProtectIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Ink" className="shrink-0">
        <RibbonCommand label="Hide Ink" active={hideInk} disabled={off} onClick={() => setHideInk(!hideInk)}>
          <InkIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="OneNote" className="shrink-0">
        <RibbonCommand label="Linked Notes" disabled={off} onClick={() => setNotesOpen(true)}>
          <NotesIcon />
        </RibbonCommand>
      </RibbonGroup>
      {dialogs}
    </div>
  )
}

function speak(editor: Editor | null) {
  if (!editor || typeof speechSynthesis === "undefined") {
    return
  }
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel()
    return
  }
  const { from, to, empty } = editor.state.selection
  const text = empty ? editor.state.doc.textContent : editor.state.doc.textBetween(from, to, "\n")
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000))
  utterance.lang = useDocumentStore.getState().pageSetup.language || "en"
  speechSynthesis.speak(utterance)
}

function stepComment(editor: Editor, direction: 1 | -1) {
  const comments = listComments(editor.state.doc)
  if (comments.length === 0) {
    return
  }
  const head = editor.state.selection.from
  const index = comments.findIndex((comment) => comment.from > head)
  const next =
    direction > 0
      ? comments[index === -1 ? 0 : index]
      : comments[Math.max(0, (index === -1 ? comments.length : index) - 1)]
  if (next) {
    selectComment(editor, next.id)
  }
}

function deleteCurrentComment(editor: Editor) {
  const head = editor.state.selection.from
  const current = listComments(editor.state.doc).find((comment) => comment.from <= head && head <= comment.to)
  if (current) {
    deleteComment(editor, current.id)
  }
}

function deleteAllComments(editor: Editor) {
  for (const comment of [...listComments(editor.state.doc)].reverse()) {
    deleteComment(editor, comment.id)
  }
}

function stepChange(editor: Editor, direction: 1 | -1) {
  const changes = listChanges(editor.state.doc)
  if (changes.length === 0) {
    return
  }
  const head = editor.state.selection.from
  const index = changes.findIndex((change) => change.from > head)
  const next =
    direction > 0
      ? changes[index === -1 ? 0 : index]
      : changes[Math.max(0, (index === -1 ? changes.length : index) - 1)]
  if (next) {
    editor.chain().focus().setTextSelection({ from: next.from, to: next.to }).scrollIntoView().run()
  }
}

function LanguageList({ close }: { close: () => void }) {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  return (
    <div className="flex w-56 flex-col">
      {DOCUMENT_LANGUAGES.map((item) => (
        <MenuButton
          key={item.id}
          selected={setup.language === item.id}
          onClick={() => {
            setPageSetup({ ...setup, language: item.id })
            close()
          }}
        >
          {item.label}
        </MenuButton>
      ))}
    </div>
  )
}

/** Turns editing off or on for everyone, the effect of both Block Authors and Restrict Editing here. */
function setProtected(editor: Editor | null, protect: boolean) {
  editor?.setEditable(!protect)
  useViewStore.getState().setRestricted(protect)
}

function BlockAuthorsList({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          setProtected(editor, true)
          close()
        }}
      >
        Block All Authors
      </MenuButton>
      <MenuButton
        onClick={() => {
          setProtected(editor, false)
          close()
        }}
      >
        Unblock All
      </MenuButton>
    </div>
  )
}

function RestrictList({ editor, close }: { editor: Editor | null; close: () => void }) {
  return (
    <div className="flex w-52 flex-col">
      <MenuButton
        onClick={() => {
          setProtected(editor, true)
          close()
        }}
      >
        Read only
      </MenuButton>
      <MenuButton
        onClick={() => {
          setProtected(editor, false)
          close()
        }}
      >
        Stop protection
      </MenuButton>
    </div>
  )
}

function SpellIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.6" y="11.2" fontSize="6.4" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        abc
      </text>
      <path
        d="M11.2 7.4 12.5 8.8 15.4 5.4"
        fill="none"
        stroke="#107c10"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function BookIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M1.8 3h5.4c.7 1.1.7 8.8 0 10H1.8V3Z" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.8" />
      <path d="M8.8 3h5.4v10H8.8c-.7-1.2-.7-8.9 0-10Z" fill="#fff" stroke="#0f6cbd" strokeWidth="0.8" />
      <path d="M7.4 3v10" stroke="#0f6cbd" strokeWidth="0.7" />
      <path d="M3.2 5.6h2.8M3.2 7.4h2.8M10.2 5.6h2.6M10.2 7.4h2.6" stroke="#5c5c5c" strokeWidth="0.6" />
    </RibbonSvg>
  )
}

function CountIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="3.2" y="1.6" width="9.6" height="12.6" rx="0.7" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <text x="4.1" y="9.6" fontSize="4.6" fontWeight="700" fill="#0f6cbd" fontFamily="Segoe UI, sans-serif">
        123
      </text>
    </RibbonSvg>
  )
}

function ReadAloudIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.8" y="12.4" fontSize="9" fontWeight="700" fill="#0f6cbd" fontFamily="Georgia, serif">
        A
      </text>
      <path
        d="M9.6 5.4c1.3 1.1 1.3 3.6 0 4.7M11.4 3.6c2.1 1.7 2.1 6.4 0 8.2"
        fill="none"
        stroke="#107c10"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function TranslateIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.4" y="12" fontSize="8.2" fontWeight="700" fill="#0f6cbd" fontFamily="Georgia, serif">
        A
      </text>
      <text x="8.4" y="12.2" fontSize="6.4" fill="#107c10" fontFamily="Segoe UI, sans-serif">
        文
      </text>
      <path
        d="M9.2 4.6 11 2.8l1.8 1.8"
        fill="none"
        stroke="#107c10"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </RibbonSvg>
  )
}

function LanguageIcon() {
  return (
    <RibbonSvg size={20}>
      <text x="0.6" y="12.2" fontSize="8.4" fontWeight="700" fill="#0f6cbd" fontFamily="Georgia, serif">
        A
      </text>
      <text x="8.6" y="8.2" fontSize="5.2" fill="#107c10" fontFamily="Segoe UI, sans-serif">
        字
      </text>
      <path d="M9.4 13.4h5.2" stroke="#8a8a8a" strokeWidth="0.8" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function NewCommentIcon() {
  return (
    <RibbonSvg size={20}>
      <path
        d="M1.6 2.4h9.4a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H6.2L3.2 12.6V10H2.6a1 1 0 0 1-1-1V3.4a1 1 0 0 1 1-1Z"
        fill="#fff"
        stroke="#5c5c5c"
        strokeWidth="0.8"
      />
      <path d="M11.2 6.2v3.4M9.5 7.9h3.4" stroke="#107c10" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function TrashIcon() {
  return (
    <RibbonSvg>
      <path d="M3 4.4h10" stroke="#5c5c5c" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M6.2 3.2h3.6v1.2" fill="none" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M4.4 5h7.2l-.6 8H5Z" fill="#fde7e9" stroke="#d13438" strokeWidth="0.8" />
    </RibbonSvg>
  )
}

function CommentIcon() {
  return (
    <RibbonSvg>
      <path
        d="M1.8 2.6h11a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H6.6L3.4 13.2V10.2H2.8a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1Z"
        fill="#fff4ce"
        stroke="#8a6116"
        strokeWidth="0.8"
      />
    </RibbonSvg>
  )
}

function PageArrow({ direction }: { direction: "left" | "right" }) {
  const arrow = direction === "left" ? "M14.2 8H10.6M12 6.4 10.4 8 12 9.6" : "M10.2 8h3.6M12.4 6.4 14 8l-1.6 1.6"
  return (
    <RibbonSvg>
      <rect x="1.4" y="2.6" width="7.4" height="10" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M3 5.2h4.2M3 7.2h4.2M3 9.2h2.6" stroke="#b0b0b0" strokeWidth="0.7" />
      <path d={arrow} fill="none" stroke="#0f6cbd" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </RibbonSvg>
  )
}

function TrackIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="1.6" y="2" width="8.2" height="11.2" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M3.2 5h4.8M3.2 7.2h4.8M3.2 9.4h3" stroke="#b0b0b0" strokeWidth="0.7" />
      <path d="M8.8 8.4 12.6 4.6l1.4 1.4-3.8 3.8-1.8.4.4-1.8Z" fill="#0f6cbd" />
    </RibbonSvg>
  )
}

function PaneIcon() {
  return (
    <RibbonSvg>
      <rect x="1.6" y="2.4" width="12.8" height="11" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M9 2.4v11" stroke="#5c5c5c" strokeWidth="0.7" />
      <rect x="9" y="2.4" width="5.4" height="11" fill="#deecf9" />
      <path d="M9 2.4v11M14.4 2.4v11" stroke="#0f6cbd" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function PageMark({ kind }: { kind: "check" | "cross" }) {
  const mark =
    kind === "check" ? (
      <path
        d="M8.4 8.2 10.2 10.2 14.4 5.4"
        fill="none"
        stroke="#107c10"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path d="M9 6.2 13.4 10.8M13.4 6.2 9 10.8" fill="none" stroke="#d13438" strokeWidth="1.5" strokeLinecap="round" />
    )
  return (
    <RibbonSvg size={20}>
      <rect x="1.4" y="2" width="8.2" height="11.4" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M3 5h4.6M3 7h4.6M3 9h2.8" stroke="#d0d0d0" strokeWidth="0.7" />
      {mark}
    </RibbonSvg>
  )
}

function CompareIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="5" y="3.4" width="8.6" height="10.6" rx="0.6" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.8" />
      <rect x="2" y="1.6" width="8.6" height="10.6" rx="0.6" fill="#fff" stroke="#5c5c5c" strokeWidth="0.8" />
      <path d="M3.6 4.4h5.2M3.6 6.4h5.2M3.6 8.4h3.4" stroke="#b0b0b0" strokeWidth="0.7" />
    </RibbonSvg>
  )
}

function ProtectIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="5" cy="4.2" r="1.7" fill="#5c5c5c" />
      <path d="M1.8 12.6c.5-2.6 1.8-3.6 3.2-3.6s2.7 1 3.2 3.6" fill="#5c5c5c" />
      <rect x="9.2" y="7.4" width="5" height="4" rx="0.4" fill="#fff4ce" stroke="#8a6116" strokeWidth="0.7" />
      <path d="M10.4 7.4V6.1a1.3 1.3 0 0 1 2.6 0v1.3" fill="none" stroke="#8a6116" strokeWidth="0.8" />
    </RibbonSvg>
  )
}

function AccessIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="8" cy="8" r="6.2" fill="#deecf9" stroke="#0f6cbd" strokeWidth="0.9" />
      <path d="M8 4.8v.2M8 7v4.2" stroke="#0f6cbd" strokeWidth="1.3" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function AuthorsIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="5.2" cy="5" r="2" fill="#5c5c5c" />
      <circle cx="10.8" cy="5" r="2" fill="#0f6cbd" />
      <path
        d="M1.8 13c.6-2.4 1.8-3.4 3.4-3.4s2.8 1 3.4 3.4M7.4 13c.6-2.4 1.8-3.4 3.4-3.4s2.8 1 3.4 3.4"
        fill="#5c5c5c"
      />
    </RibbonSvg>
  )
}

function InkIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M3 12.4 10.2 3.8l2.2 2-7.2 8.6H3z" fill="#fff4ce" stroke="#8a6116" strokeWidth="0.8" />
      <path d="M9.4 4.6 11.6 6.6" stroke="#8a6116" strokeWidth="0.8" />
      <path d="M2 14.2h12" stroke="#d13438" strokeWidth="1.2" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function NotesIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2.2" y="1.8" width="9.4" height="12.4" rx="0.6" fill="#fff4ce" stroke="#8a6116" strokeWidth="0.8" />
      <path d="M4 5h5.6M4 7.4h5.6M4 9.8h3.6" stroke="#8a6116" strokeWidth="0.7" />
      <path d="M12 6.2 14.4 8.6 10.2 13H8.4v-1.8z" fill="#0f6cbd" />
    </RibbonSvg>
  )
}

const LINKED_NOTES_KEY = "aiword-linked-notes"

function LinkedNotesDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ").trim()
  const [note, setNote] = useState("")
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LINKED_NOTES_KEY) || "[]") as { text: string; note: string }[]
    } catch {
      return []
    }
  })
  return (
    <DialogFrame
      title="Linked Notes"
      width={420}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        const body = note.trim()
        if (!body) {
          return
        }
        const next = [{ text: selected.slice(0, 80) || "Document", note: body }, ...saved].slice(0, 40)
        localStorage.setItem(LINKED_NOTES_KEY, JSON.stringify(next))
        setSaved(next)
        setNote("")
      }}
    >
      <p className="mt-1 text-[12px] text-neutral-500">
        {selected ? `Linked to “${selected.slice(0, 60)}”` : "Linked to the current document location."}
      </p>
      <textarea
        aria-label="Linked note"
        value={note}
        className="mt-3 h-24 w-full rounded border border-black/15 px-2 py-1 text-sm"
        placeholder="Write a note…"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="mt-2 max-h-32 overflow-auto text-[12px] text-neutral-600">
        {saved.map((item, index) => (
          <p key={`${item.text}-${index}`} className="border-t border-black/5 py-1">
            <span className="font-medium text-neutral-800">{item.text}</span> — {item.note}
          </p>
        ))}
      </div>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={onClose}>
          Close
        </button>
        <button type="submit" className="dialog-btn is-primary">
          Save Note
        </button>
      </div>
    </DialogFrame>
  )
}

function WordCountDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const text = editor?.state.doc.textContent ?? ""
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  let paragraphs = 0
  editor?.state.doc.descendants((node) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      paragraphs += 1
    }
  })
  const pages = editor?.storage.pagination?.pageCount ?? 1
  const showReadability = useEditingOptions((state) => state.readability)
  const scores = showReadability
    ? readability(editor?.state.doc.textBetween(0, editor.state.doc.content.size, "\n", " ") ?? "")
    : null
  return (
    <DialogFrame title="Word Count" width={288} onClose={onClose}>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt>Pages</dt>
        <dd>{pages}</dd>
        <dt>Words</dt>
        <dd>{words}</dd>
        <dt>Characters</dt>
        <dd>{text.length}</dd>
        <dt>Paragraphs</dt>
        <dd>{paragraphs}</dd>
      </dl>
      {showReadability ? (
        <dl aria-label="Readability" className="mt-3 grid grid-cols-2 gap-y-1 border-t pt-2 text-sm">
          <dt>Sentences</dt>
          <dd>{scores?.sentences ?? 0}</dd>
          <dt>Flesch Reading Ease</dt>
          <dd>{scores?.ease ?? "—"}</dd>
          <dt>Flesch-Kincaid Grade Level</dt>
          <dd>{scores?.grade ?? "—"}</dd>
        </dl>
      ) : null}
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="button" className="dialog-btn is-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

function settleCurrent(editor: Editor, action: "accept" | "reject") {
  const { from, to } = editor.state.selection
  const change = changeAtSelection(editor.state.doc, from, to)
  if (!change) {
    return
  }
  if (action === "accept") {
    acceptChanges(editor, [change.id])
    return
  }
  rejectChanges(editor, [change.id])
}

function CommentForm({ close }: { close: () => void }) {
  const editor = useDocumentEditor()
  const [text, setText] = useState("")

  return (
    <form
      className="flex w-64 flex-col gap-2 p-1"
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        if (!editor || !text.trim()) {
          return
        }
        addComment(editor, text)
        close()
      }}
    >
      <label className="text-xs text-[var(--app-ribbon-muted)]" htmlFor="new-comment">
        Comment
      </label>
      <textarea
        id="new-comment"
        aria-label="Comment"
        maxLength={2000}
        value={text}
        rows={3}
        className="w-full resize-none rounded-md border border-[var(--app-popover-border)] bg-[var(--app-popover-bg)] px-2 py-1.5 text-xs text-[var(--app-ribbon-text)] outline-none focus:border-[var(--app-theme-primary)]"
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="submit"
        className="self-end rounded-md bg-[var(--app-theme-primary)] px-2.5 py-1 text-xs text-white disabled:opacity-50"
        disabled={!text.trim()}
      >
        Add
      </button>
    </form>
  )
}
