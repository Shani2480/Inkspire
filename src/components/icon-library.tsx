import { readCache, readCacheAsync, writeCache } from "@/lib/asset-cache"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

type IconHit = {
  prefix: string
  name: string
}

const COLLECTIONS = [
  { id: "mdi", label: "Material" },
  { id: "lucide", label: "Lucide" },
  { id: "ph", label: "Phosphor" },
  { id: "tabler", label: "Tabler" },
] as const

const POPULAR = [
  "home",
  "star",
  "heart",
  "check",
  "mail",
  "user",
  "calendar",
  "settings",
  "search",
  "file",
  "folder",
  "image",
  "camera",
  "phone",
  "bell",
  "cloud",
  "download",
  "upload",
  "edit",
  "trash",
  "lock",
  "globe",
  "map",
  "chart",
]

export function IconLibrary({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [collection, setCollection] = useState<(typeof COLLECTIONS)[number]["id"]>("mdi")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<IconHit[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const needle = query.trim().toLowerCase() || "icon"
    const cacheKey = `icons:${collection}:${needle}`
    const cached = readCache<IconHit[]>(cacheKey)
    if (cached?.length) {
      setHits(cached)
      setStatus("From cache")
    } else {
      setStatus("Loading…")
    }
    setBusy(true)
    const url = `https://api.iconify.design/search?query=${encodeURIComponent(needle)}&prefix=${collection}&limit=64`
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status))
        }
        return response.json() as Promise<{ icons?: string[] }>
      })
      .then((payload) => {
        const next = (payload.icons ?? []).map((id) => {
          const [prefix, name] = id.includes(":") ? id.split(":") : [collection, id]
          return { prefix, name }
        })
        setHits(next.length ? next : POPULAR.map((name) => ({ prefix: collection, name })))
        writeCache(cacheKey, next)
        setStatus("")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        if (!cached?.length) {
          setHits(POPULAR.map((name) => ({ prefix: collection, name })))
          setStatus("Offline — showing common names")
        }
      })
      .finally(() => setBusy(false))
    return () => controller.abort()
  }, [collection, query])

  const shown = useMemo(() => hits.slice(0, 64), [hits])

  async function insert(hit: IconHit) {
    const id = `${hit.prefix}:${hit.name}`
    const svg = await loadIconSvg(hit.prefix, hit.name)
    const dataUrl = svg
      ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      : `https://api.iconify.design/${hit.prefix}/${hit.name}.svg`
    editor.chain().focus().insertFigure("icon", hit.name).run()
    editor
      .chain()
      .focus()
      .updateAttributes("figure", { src: dataUrl, alt: id, variant: hit.name, kind: "icon", width: 32, height: 32 })
      .run()
    onClose()
  }

  // On the page itself, not in the ribbon panel's layer (see DialogFrame).
  return createPortal(
    <div className="asset-library-backdrop" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Icons"
        className="asset-library"
        data-theme={
          document.documentElement.dataset.theme ||
          (document.documentElement.classList.contains("dark") ? "dark" : "light")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="asset-library-header">
          <div>
            <div className="asset-library-title">Icons</div>
            <div className="asset-library-sub">Iconify · free icons · cached offline</div>
          </div>
          <button type="button" className="asset-library-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="asset-library-tabs">
          {COLLECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`asset-library-chip${collection === item.id ? " is-active" : ""}`}
              onClick={() => setCollection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="asset-library-search">
          <input
            aria-label="Search icons"
            placeholder="Search icons…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="asset-library-grid cols-8">
          {busy && !shown.length
            ? Array.from({ length: 24 }, (_, index) => <div key={index} className="icon-shimmer" />)
            : shown.map((hit) => (
                <button
                  key={`${hit.prefix}:${hit.name}`}
                  type="button"
                  title={`${hit.prefix}:${hit.name}`}
                  className="asset-library-tile"
                  onClick={() => void insert(hit)}
                >
                  <CachedIconImg prefix={hit.prefix} name={hit.name} />
                </button>
              ))}
        </div>
        <div className="asset-library-footer">
          {busy ? "Loading…" : status || `${shown.length} icons`} · Powered by Iconify
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CachedIconImg({ prefix, name }: { prefix: string; name: string }) {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = readCache<string>(`icon-svg:${prefix}:${name}`)
    return cached ? `data:image/svg+xml;utf8,${encodeURIComponent(cached)}` : null
  })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadIconSvg(prefix, name).then((svg) => {
      if (cancelled || !svg) {
        if (!cancelled && !svg) {
          setFailed(true)
        }
        return
      }
      setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      cancelled = true
    }
  }, [prefix, name])

  if (failed) {
    return <span className="icon-fallback">◇</span>
  }
  if (!src) {
    return <span className="icon-shimmer inline" />
  }
  return <img src={src} alt="" className="asset-library-icon" loading="lazy" />
}

async function loadIconSvg(prefix: string, name: string) {
  const cacheKey = `icon-svg:${prefix}:${name}`
  const cached = (await readCacheAsync<string>(cacheKey)) ?? readCache<string>(cacheKey)
  if (cached) {
    return cached
  }
  try {
    const response = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`)
    if (!response.ok) {
      return null
    }
    const svg = await response.text()
    writeCache(cacheKey, svg)
    return svg
  } catch {
    return null
  }
}
