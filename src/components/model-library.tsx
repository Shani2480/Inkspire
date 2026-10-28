import { fetchPolyHavenModel } from "@/editor/polyhaven"
import { THREED_STOCK, type ThreeDPreset } from "@/editor/three-d-model"
import { readCache, writeCache } from "@/lib/asset-cache"
import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

type OnlineAsset = {
  id: string
  name: string
  thumb: string
  tags: string
}

const CACHE_KEY = "polyhaven-models"
const CATEGORIES = ["Primitives", "Electronics", "Anatomy", "Furniture", "Symbols", "Online"] as const

export function ModelLibrary({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Primitives")
  const [assets, setAssets] = useState<OnlineAsset[]>(() => readCache<OnlineAsset[]>(CACHE_KEY) ?? [])
  const [query, setQuery] = useState("")
  /** The online model being downloaded, while the library waits to insert it. */
  const [downloading, setDownloading] = useState<string | null>(null)
  const download = useRef<AbortController | null>(null)
  const [status, setStatus] = useState(assets.length ? "From cache" : "")
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (category !== "Online") {
      return
    }
    const controller = new AbortController()
    if (!assets.length) {
      setStatus("Loading Poly Haven…")
    }
    fetch("https://api.polyhaven.com/assets?type=models", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status))
        }
        return response.json() as Promise<Record<string, { name?: string; thumbnail_url?: string; tags?: string[] }>>
      })
      .then((catalog) => {
        const rows = Object.entries(catalog).map(([id, asset]) => ({
          id,
          name: asset.name || id,
          thumb: asset.thumbnail_url || "",
          tags: (asset.tags || []).join(" "),
        }))
        rows.sort((left, right) => left.name.localeCompare(right.name))
        setAssets(rows)
        writeCache(CACHE_KEY, rows)
        setStatus("")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        setStatus(assets.length ? "Offline — using cached catalog" : "Could not reach Poly Haven.")
      })
    return () => controller.abort()
  }, [assets.length, category])

  useEffect(() => () => download.current?.abort(), [])

  const stock = useMemo(() => THREED_STOCK.filter((item) => item.category === category), [category])
  const pictures = useStockPictures(useMemo(() => stock.map((item) => item.id), [stock]))

  const online = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = needle
      ? assets.filter((asset) => `${asset.name} ${asset.tags} ${asset.id}`.toLowerCase().includes(needle))
      : assets
    return matched.slice(0, 36)
  }, [assets, query])

  function insertPreset(preset: ThreeDPreset, label: string) {
    editor.chain().focus().insertThreeDModel({ preset, alt: label }).run()
    onClose()
  }

  /**
   * A Poly Haven model is downloaded as one `.glb` and inserted as that model, its thumbnail standing in while the
   * viewer loads it. The library stays open with the progress in its footer until the file is in; a failure says so
   * and leaves the library open.
   */
  async function insertOnline(asset: OnlineAsset) {
    if (downloading) {
      return
    }
    const controller = new AbortController()
    download.current = controller
    setDownloading(asset.id)
    setStatus(`Downloading ${asset.name}…`)
    try {
      const blob = await fetchPolyHavenModel(asset.id, controller.signal, (received, total) => {
        const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`
        setStatus(total ? `Downloading ${asset.name}… ${mb(received)} of ${mb(total)}` : `Downloading ${asset.name}…`)
      })
      editor
        .chain()
        .focus()
        .insertThreeDModel({
          preset: "cube",
          src: URL.createObjectURL(blob),
          snapshot: asset.thumb,
          alt: asset.name,
          width: 260,
          height: 180,
        })
        .run()
      onClose()
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      console.error("The online 3D model could not be downloaded", error)
      setStatus(`Could not download ${asset.name}.`)
      setDownloading(null)
    }
  }

  async function onLocalFile(file: File) {
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: file.type || "model/gltf-binary" })
    const url = URL.createObjectURL(blob)
    editor
      .chain()
      .focus()
      .insertThreeDModel({
        preset: "cube",
        src: url,
        alt: file.name,
        width: 260,
        height: 180,
      })
      .run()
    onClose()
  }

  // On the page itself, not in the ribbon panel's layer (see DialogFrame).
  return createPortal(
    <div className="asset-library-backdrop" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="3D Models"
        className="asset-library model-library"
        data-theme={
          document.documentElement.dataset.theme ||
          (document.documentElement.classList.contains("dark") ? "dark" : "light")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="asset-library-header">
          <div>
            <div className="asset-library-title">3D Models</div>
            <div className="asset-library-sub">Stock previews · local .glb/.gltf · Poly Haven online</div>
          </div>
          <button type="button" className="asset-library-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="asset-library-tabs">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={`asset-library-chip${category === item ? " is-active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
          <button type="button" className="asset-library-chip" onClick={() => fileInput.current?.click()}>
            From Local File…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) {
                void onLocalFile(file)
              }
            }}
          />
        </div>
        {category === "Online" ? (
          <div className="asset-library-search">
            <input
              aria-label="Search 3D models"
              placeholder="Search chairs, plants, rocks…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        ) : null}
        <div className="asset-library-grid cols-4">
          {category === "Online"
            ? online.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={`asset-library-tile tall${downloading === asset.id ? " is-downloading" : ""}`}
                  disabled={Boolean(downloading)}
                  aria-busy={downloading === asset.id || undefined}
                  onClick={() => void insertOnline(asset)}
                >
                  {asset.thumb ? (
                    <img src={asset.thumb} alt="" className="model-thumb" />
                  ) : (
                    <span className="icon-shimmer" />
                  )}
                  <span className="tile-caption">{asset.name}</span>
                </button>
              ))
            : stock.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="asset-library-tile tall"
                  onClick={() => insertPreset(item.id, item.label)}
                >
                  <StockThumb src={pictures[item.id]} />
                  <span className="tile-caption">{item.label}</span>
                </button>
              ))}
        </div>
        <div className="asset-library-footer">
          {category === "Online"
            ? status || `${online.length} of ${assets.length} models · Poly Haven`
            : `${stock.length} stock models`}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The stock models' pictures, drawn from the models themselves once three.js has loaded; none without WebGL. */
function useStockPictures(presets: string[]) {
  const [pictures, setPictures] = useState<Record<string, string>>({})
  const key = presets.join(" ")
  useEffect(() => {
    if (!key) {
      return
    }
    let live = true
    void import("@/editor/model-stock")
      .then((module) => {
        // A frame first, so the tiles show before the models are drawn.
        requestAnimationFrame(() => {
          if (!live) {
            return
          }
          try {
            setPictures(module.stockPictures(key.split(" ")))
          } catch (error) {
            console.error("The 3D model pictures could not be drawn", error)
          }
        })
      })
      .catch((error: unknown) => console.error("The 3D model pictures could not be drawn", error))
    return () => {
      live = false
    }
  }, [key])
  return pictures
}

function StockThumb({ src }: { src: string | undefined }) {
  return src ? <img src={src} alt="" className="model-thumb is-stock" /> : <span className="icon-shimmer" />
}
