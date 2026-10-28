import { SMARTART_LAYOUTS, type SmartArtLayout } from "@/editor/smartart"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { createPortal } from "react-dom"

type Category = {
  id: string
  label: string
  layouts: { id: SmartArtLayout; label: string }[]
}

const CATEGORIES: Category[] = [
  {
    id: "list",
    label: "List",
    layouts: [
      { id: "list", label: "Basic List" },
      { id: "vlist", label: "Vertical List" },
      { id: "blocklist", label: "Basic Block List" },
    ],
  },
  {
    id: "process",
    label: "Process",
    layouts: [
      { id: "process", label: "Basic Process" },
      { id: "chevron", label: "Chevron Process" },
      { id: "stepup", label: "Step Up Process" },
    ],
  },
  {
    id: "cycle",
    label: "Cycle",
    layouts: [{ id: "cycle", label: "Basic Cycle" }],
  },
  {
    id: "hierarchy",
    label: "Hierarchy",
    layouts: [{ id: "hierarchy", label: "Organization Chart" }],
  },
  {
    id: "relationship",
    label: "Relationship",
    layouts: [
      { id: "relationship", label: "Basic Relationship" },
      { id: "venn", label: "Basic Venn" },
    ],
  },
  {
    id: "matrix",
    label: "Matrix",
    layouts: [{ id: "matrix", label: "Grid Matrix" }],
  },
  {
    id: "pyramid",
    label: "Pyramid",
    layouts: [{ id: "pyramid", label: "Basic Pyramid" }],
  },
  {
    id: "picture",
    label: "Picture",
    layouts: [
      { id: "piclist", label: "Picture Caption List" },
      { id: "vpiclist", label: "Vertical Picture List" },
    ],
  },
]

const DESCRIPTIONS: Record<SmartArtLayout, string> = {
  vlist: "Use to show non-sequential or grouped blocks of information, stacked one above another.",
  chevron: "Use to show a progression of steps, each pointing to the next.",
  list: "Use to show non-sequential or grouped blocks of information. Works well for bulleted lists of text.",
  process: "Use to show a progression, a sequential flow of steps in a task, process or workflow.",
  cycle: "Use to show a continuing sequence of stages, tasks or events in a circular flow.",
  hierarchy: "Use to show organizational information or a decision tree, with a top item and items beneath it.",
  relationship: "Use to illustrate how items overlap or connect to one another.",
  matrix: "Use to show how parts relate to a whole in four quadrants.",
  blocklist: "Use to show non-sequential or grouped blocks of information, in rows of blocks.",
  stepup: "Use to show a progression that rises, each step higher than the one before.",
  venn: "Use to show overlapping or interconnected relationships.",
  piclist: "Use to show a picture with a caption beneath it for each item; click a picture to insert one.",
  vpiclist:
    "Use to show pictures with their text beside them, stacked one above another; click a picture to insert one.",
  pyramid: "Use to show proportional or hierarchical relationships that grow upward from the base.",
}

/** "All" lists every layout of every category once, as Word's dialog does. */
const ALL_LAYOUTS = CATEGORIES.flatMap((category) => category.layouts)

export function SmartArtMenu({ editor, onClose, onMore }: { editor: Editor; onClose: () => void; onMore: () => void }) {
  return (
    <div className="smartart-menu">
      {CATEGORIES.map((category) => (
        <div key={category.id} className="smartart-menu-section">
          <p className="smartart-menu-label">{category.label}</p>
          <div className="smartart-menu-row">
            {category.layouts.map((layout, index) => (
              <button
                key={`${layout.id}-${index}`}
                type="button"
                title={layout.label}
                className="smartart-thumb"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  editor.chain().focus().insertSmartArt(layout.id).run()
                  onClose()
                }}
              >
                <SmartArtThumb layout={layout.id} />
                <span>{layout.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="smartart-more" onMouseDown={(event) => event.preventDefault()} onClick={onMore}>
        More SmartArt Graphics…
      </button>
    </div>
  )
}

export function SmartArtDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [category, setCategory] = useState("all")
  const [picked, setPicked] = useState(0)
  const shown = category === "all" ? ALL_LAYOUTS : (CATEGORIES.find((item) => item.id === category)?.layouts ?? [])
  const current = shown[picked] ?? shown[0]
  const layout: SmartArtLayout = current?.id ?? "list"

  // On the page itself, not in the ribbon panel's layer (see DialogFrame).
  return createPortal(
    <div className="asset-library-backdrop" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a SmartArt Graphic"
        className="asset-library smartart-dialog"
        data-theme={
          document.documentElement.dataset.theme ||
          (document.documentElement.classList.contains("dark") ? "dark" : "light")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="asset-library-header">
          <div className="asset-library-title">Choose a SmartArt Graphic</div>
          <button type="button" className="asset-library-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="smartart-dialog-body">
          <div className="smartart-dialog-cats">
            {[{ id: "all", label: "All" }, ...CATEGORIES].map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.id ? "is-active" : ""}
                onClick={() => {
                  setCategory(item.id)
                  setPicked(0)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="smartart-dialog-grid">
            {shown.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                className={current === item ? "is-active" : ""}
                onClick={() => setPicked(index)}
              >
                <SmartArtThumb layout={item.id} large />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="smartart-dialog-preview">
            <SmartArtThumb layout={layout} large />
            <p>
              <strong>{current?.label ?? SMARTART_LAYOUTS.find((item) => item.id === layout)?.label}</strong>
            </p>
            <p>{DESCRIPTIONS[layout]}</p>
          </div>
        </div>
        <div className="asset-library-footer smartart-dialog-actions">
          <button type="button" className="asset-library-chip" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="asset-library-chip is-active"
            onClick={() => {
              editor.chain().focus().insertSmartArt(layout).run()
              onClose()
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SmartArtThumb({ layout, large = false }: { layout: SmartArtLayout; large?: boolean }) {
  const size = large ? 88 : 56
  if (layout === "vlist") {
    return (
      <svg width={size} height={size * 0.7} viewBox="0 0 80 56" aria-hidden>
        <rect x="6" y="4" width="68" height="14" rx="2" fill="#deecf9" stroke="#0f6cbd" />
        <rect x="14" y="21" width="60" height="14" rx="2" fill="#9cc7f0" stroke="#0f6cbd" />
        <rect x="14" y="38" width="60" height="14" rx="2" fill="#9cc7f0" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "chevron") {
    return (
      <svg width={size} height={size * 0.55} viewBox="0 0 120 66" aria-hidden>
        <polygon points="4,18 30,18 40,33 30,48 4,48 14,33" fill="#deecf9" stroke="#0f6cbd" />
        <polygon points="42,18 68,18 78,33 68,48 42,48 52,33" fill="#9cc7f0" stroke="#0f6cbd" />
        <polygon points="80,18 106,18 116,33 106,48 80,48 90,33" fill="#5aa2e0" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "blocklist") {
    return (
      <svg width={size} height={size * 0.7} viewBox="0 0 80 56" aria-hidden>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={4 + i * 25} y="6" width="22" height="20" rx="2" fill="#deecf9" stroke="#0f6cbd" />
        ))}
        {[0, 1].map((i) => (
          <rect key={i} x={16 + i * 25} y="30" width="22" height="20" rx="2" fill="#9cc7f0" stroke="#0f6cbd" />
        ))}
      </svg>
    )
  }
  if (layout === "stepup") {
    return (
      <svg width={size} height={size * 0.7} viewBox="0 0 80 56" aria-hidden>
        <rect x="4" y="34" width="22" height="16" rx="2" fill="#deecf9" stroke="#0f6cbd" />
        <rect x="29" y="22" width="22" height="28" rx="2" fill="#9cc7f0" stroke="#0f6cbd" />
        <rect x="54" y="8" width="22" height="42" rx="2" fill="#5aa2e0" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "venn") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <circle cx="30" cy="30" r="20" fill="#9cc7f0" stroke="#0f6cbd" opacity="0.7" />
        <circle cx="50" cy="30" r="20" fill="#deecf9" stroke="#0f6cbd" opacity="0.7" />
        <circle cx="40" cy="48" r="20" fill="#5aa2e0" stroke="#0f6cbd" opacity="0.5" />
      </svg>
    )
  }
  if (layout === "piclist" || layout === "vpiclist") {
    const stacked = layout === "vpiclist"
    return (
      <svg width={size} height={size * 0.7} viewBox="0 0 80 56" aria-hidden>
        {[0, 1, 2].map((i) =>
          stacked ? (
            <g key={i}>
              <rect x="6" y={4 + i * 18} width="14" height="14" fill="#9cc7f0" stroke="#0f6cbd" />
              <rect x="22" y={4 + i * 18} width="52" height="14" rx="2" fill="#deecf9" stroke="#0f6cbd" />
            </g>
          ) : (
            <g key={i}>
              <rect x={4 + i * 25} y="6" width="22" height="26" fill="#9cc7f0" stroke="#0f6cbd" />
              <rect x={4 + i * 25} y="35" width="22" height="14" rx="2" fill="#deecf9" stroke="#0f6cbd" />
            </g>
          ),
        )}
      </svg>
    )
  }
  if (layout === "process") {
    return (
      <svg width={size} height={size * 0.55} viewBox="0 0 120 66" aria-hidden>
        <rect x="4" y="18" width="28" height="30" rx="3" fill="#deecf9" stroke="#0f6cbd" />
        <path d="M36 33h10" stroke="#0f6cbd" strokeWidth="2" />
        <polygon points="46,28 54,33 46,38" fill="#0f6cbd" />
        <rect x="56" y="18" width="28" height="30" rx="3" fill="#deecf9" stroke="#0f6cbd" />
        <path d="M88 33h10" stroke="#0f6cbd" strokeWidth="2" />
        <polygon points="98,28 106,33 98,38" fill="#0f6cbd" />
        <rect x="108" y="18" width="8" height="30" rx="2" fill="#9cc7f0" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "cycle") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r="28" fill="none" stroke="#0f6cbd" strokeWidth="8" strokeDasharray="24 12" />
        <circle cx="40" cy="12" r="8" fill="#deecf9" stroke="#0f6cbd" />
        <circle cx="64" cy="52" r="8" fill="#deecf9" stroke="#0f6cbd" />
        <circle cx="16" cy="52" r="8" fill="#deecf9" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "hierarchy") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <rect x="28" y="6" width="24" height="16" rx="2" fill="#deecf9" stroke="#0f6cbd" />
        <path d="M40 22v12M20 34h40" stroke="#0f6cbd" />
        <rect x="8" y="46" width="24" height="16" rx="2" fill="#deecf9" stroke="#0f6cbd" />
        <rect x="48" y="46" width="24" height="16" rx="2" fill="#deecf9" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "pyramid") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <polygon points="40,8 56,28 24,28" fill="#9cc7f0" stroke="#0f6cbd" />
        <polygon points="20,32 60,32 68,52 12,52" fill="#deecf9" stroke="#0f6cbd" />
        <polygon points="8,56 72,56 78,72 2,72" fill="#5aa2e0" stroke="#0f6cbd" />
      </svg>
    )
  }
  if (layout === "relationship") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <circle cx="28" cy="40" r="18" fill="#9cc7f0" stroke="#0f6cbd" opacity="0.9" />
        <circle cx="52" cy="40" r="18" fill="#deecf9" stroke="#0f6cbd" opacity="0.9" />
      </svg>
    )
  }
  if (layout === "matrix") {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
        <rect x="8" y="8" width="30" height="30" fill="#deecf9" stroke="#0f6cbd" />
        <rect x="42" y="8" width="30" height="30" fill="#9cc7f0" stroke="#0f6cbd" />
        <rect x="8" y="42" width="30" height="30" fill="#9cc7f0" stroke="#0f6cbd" />
        <rect x="42" y="42" width="30" height="30" fill="#deecf9" stroke="#0f6cbd" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 80 56" aria-hidden>
      <rect x="6" y="6" width="68" height="12" rx="2" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="6" y="22" width="68" height="12" rx="2" fill="#deecf9" stroke="#0f6cbd" />
      <rect x="6" y="38" width="68" height="12" rx="2" fill="#deecf9" stroke="#0f6cbd" />
    </svg>
  )
}
