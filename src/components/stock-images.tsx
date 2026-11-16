import { readCache, writeCache } from "@/lib/asset-cache"
import { insertFittedImage } from "@/editor/image-fit"
import {
  downloadStockImage,
  searchStockImages,
  STOCK_CATEGORIES,
  stockAltText,
  type StockImage,
} from "@/editor/stock-images"
import type { Editor } from "@tiptap/core"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/**
 * Insert > Pictures > Stock Images…: Word's dialog of photos to search, with its categories, several pictures chosen
 * at once and Insert (n). The photos are public domain, found through Openverse.
 */
export function StockImages({ editor, at, onClose }: { editor: Editor; at?: number; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof STOCK_CATEGORIES)[number]>(STOCK_CATEGORIES[0])
  const [images, setImages] = useState<StockImage[]>([])
  const [chosen, setChosen] = useState<StockImage[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const words = query.trim() || category.words

  useEffect(() => {
    const controller = new AbortController()
    const key = `stock:${words.toLowerCase()}`
    const cached = readCache<StockImage[]>(key, 24 * 60 * 60 * 1000)
    if (cached) {
      setImages(cached)
      setPage(1)
      setMore(cached.length > 0)
      setStatus("")
      return
    }
    // Waits for typing to stop: Openverse allows a few searches a minute without an account.
    const timer = window.setTimeout(() => {
      setBusy(true)
      setStatus("")
      searchStockImages(words, 1, controller.signal)
        .then((found) => {
          setImages(found)
          setPage(1)
          setMore(found.length > 0)
          writeCache(key, found)
          setStatus(found.length ? "" : `No pictures of “${words}”.`)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          setImages([])
          setStatus(
            error instanceof TypeError
              ? "Stock Images needs an internet connection."
              : error instanceof Error
                ? error.message
                : "The search failed.",
          )
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setBusy(false)
          }
        })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [words])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inserting) {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [inserting, onClose])

  const toggle = (image: StockImage) =>
    setChosen((list) =>
      list.some((item) => item.id === image.id) ? list.filter((item) => item.id !== image.id) : [...list, image],
    )

  async function loadMore() {
    setBusy(true)
    try {
      const found = await searchStockImages(words, page + 1)
      setImages((list) => [...list, ...found.filter((image) => !list.some((item) => item.id === image.id))])
      setPage(page + 1)
      setMore(found.length > 0)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The search failed.")
    } finally {
      setBusy(false)
    }
  }

  async function insert() {
    setInserting(true)
    setStatus(`Downloading ${chosen.length === 1 ? "the picture" : `${chosen.length} pictures`}…`)
    let place = at
    let failed = 0
    for (const image of chosen) {
      try {
        const src = await downloadStockImage(image)
        await insertFittedImage(editor, { src, alt: stockAltText(image), at: place })
        // The next picture goes after this one.
        place = place === undefined ? undefined : editor.state.selection.to
      } catch {
        failed += 1
      }
    }
    setInserting(false)
    if (failed) {
      setStatus(`${failed === chosen.length ? "The pictures" : `${failed} of the pictures`} could not be downloaded.`)
      return
    }
    onClose()
  }

  // On the page itself, not in the ribbon panel's layer (see DialogFrame).
  return createPortal(
    <div className="asset-library-backdrop" onMouseDown={() => !inserting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Stock Images"
        className="asset-library stock-images"
        data-theme={
          document.documentElement.dataset.theme ||
          (document.documentElement.classList.contains("dark") ? "dark" : "light")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="asset-library-header">
          <div>
            <div className="asset-library-title">Stock Images</div>
            <div className="asset-library-sub">Public domain photos, free to use without credit</div>
          </div>
          <button
            type="button"
            className="asset-library-close"
            aria-label="Close"
            onClick={onClose}
            disabled={inserting}
          >
            ×
          </button>
        </div>
        <div className="asset-library-search">
          <input
            aria-label="Search stock images"
            placeholder="Search for pictures"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="asset-library-tabs">
          {STOCK_CATEGORIES.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`asset-library-chip${!query.trim() && category.name === item.name ? " is-active" : ""}`}
              onClick={() => {
                setQuery("")
                setCategory(item)
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="asset-library-grid stock-images-grid" aria-busy={busy}>
          {busy && !images.length
            ? Array.from({ length: 12 }, (_, index) => (
                <div key={index} className="icon-shimmer stock-images-shimmer" />
              ))
            : images.map((image) => {
                const picked = chosen.some((item) => item.id === image.id)
                return (
                  <button
                    key={image.id}
                    type="button"
                    title={stockAltText(image)}
                    aria-pressed={picked}
                    className={`stock-images-tile${picked ? " is-chosen" : ""}`}
                    disabled={inserting}
                    onClick={() => toggle(image)}
                  >
                    <img src={image.thumbnail} alt={image.title} loading="lazy" />
                    <span className="stock-images-check" aria-hidden="true">
                      {picked ? "✓" : ""}
                    </span>
                  </button>
                )
              })}
          {more && images.length > 0 && !busy ? (
            <button type="button" className="stock-images-more" disabled={inserting} onClick={() => void loadMore()}>
              More pictures
            </button>
          ) : null}
        </div>
        <div className="stock-images-footer">
          <span className="stock-images-status" role="status">
            {status || (busy ? "Searching…" : "Found through Openverse · only the search words are sent")}
          </span>
          <button
            type="button"
            className="stock-images-button is-primary"
            disabled={!chosen.length || inserting}
            onClick={() => void insert()}
          >
            {chosen.length ? `Insert (${chosen.length})` : "Insert"}
          </button>
          <button type="button" className="stock-images-button" disabled={inserting} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
