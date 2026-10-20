import { openRecentDocument } from "@/document/commands"
import { useBackstage } from "@/document/backstage"
import { documentName, useDocumentStore } from "@/document/store"
import { isTauriRuntime } from "@/lib/platform"
import { revealDocument, revealTitle } from "@/document/reveal"
import { FileText, FolderOpen, Pin, PinOff, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

export function RecentTable({
  mode = "recent",
  searchPlaceholder = "Search recent files...",
}: {
  mode?: "recent" | "pinned"
  searchPlaceholder?: string
}) {
  const closeBackstage = useBackstage((state) => state.closeBackstage)
  const recentFiles = useDocumentStore((state) => state.recentFiles)
  const pinnedFiles = useDocumentStore((state) => state.pinnedFiles)
  const forgetRecent = useDocumentStore((state) => state.forgetRecent)
  const togglePinned = useDocumentStore((state) => state.togglePinned)
  const [filter, setFilter] = useState<"recent" | "pinned">(mode)
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const source = filter === "pinned" ? pinnedFiles : recentFiles
    const needle = query.trim().toLowerCase()
    return source.filter((path) => {
      if (!needle) {
        return true
      }
      return `${documentName(path)} ${path}`.toLowerCase().includes(needle)
    })
  }, [filter, pinnedFiles, query, recentFiles])

  return (
    <div className="backstage-recent">
      <div className="backstage-recent-toolbar">
        <div className="backstage-filter-tabs" role="tablist" aria-label="Recent filter">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "recent"}
            className={filter === "recent" ? "is-active" : ""}
            onClick={() => setFilter("recent")}
          >
            Recent
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "pinned"}
            className={filter === "pinned" ? "is-active" : ""}
            onClick={() => setFilter("pinned")}
          >
            Pinned
          </button>
        </div>
        <input
          className="backstage-search"
          value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p className="backstage-empty">
          {filter === "pinned" ? "Pin documents to keep them here." : "Documents you open will show up here."}
        </p>
      ) : (
        <div className="backstage-table" role="table">
          <div className="backstage-table-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Date modified</span>
            <span role="columnheader" className="backstage-table-actions">
              Actions
            </span>
          </div>
          {rows.map((path) => {
            const pinned = pinnedFiles.includes(path)
            return (
              <div key={path} className="backstage-table-row" role="row">
                <button
                  type="button"
                  className="backstage-table-name"
                  onClick={() => {
                    openRecentDocument(path)
                    closeBackstage()
                  }}
                >
                  <FileText className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="min-w-0">
                    <span className="block truncate">{documentName(path)}</span>
                    <span className="backstage-table-path block truncate" title={path}>
                      {path}
                    </span>
                  </span>
                </button>
                <span className="backstage-table-date">—</span>
                <span className="backstage-table-actions">
                  <button
                    type="button"
                    title={pinned ? "Unpin" : "Pin"}
                    aria-label={pinned ? "Unpin" : "Pin"}
                    onClick={() => togglePinned(path)}
                  >
                    {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    title={revealTitle()}
                    aria-label="Open containing folder"
                    disabled={!isTauriRuntime()}
                    onClick={() => void revealDocument(path, forgetRecent)}
                  >
                    <FolderOpen className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Remove from list"
                    aria-label="Remove from list"
                    onClick={() => forgetRecent(path)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function greetingForNow(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) {
    return "Good morning"
  }
  if (hour < 18) {
    return "Good afternoon"
  }
  return "Good evening"
}
