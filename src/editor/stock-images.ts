/**
 * Insert > Pictures > Stock Images: photos to search and insert, as Word's Stock Images. Word's come from Microsoft's
 * own library; these come from Openverse (openverse.org, run by WordPress), an index of openly licensed images, asked
 * for public-domain photos only (CC0 and the Public Domain Mark), so a picture needs no credit line. Only the search
 * words leave the computer; the pictures go into the document as files of their own.
 *
 * Only Flickr's and Wikimedia Commons' pictures are asked for: their servers let the app read the picture, and they
 * are the hosts the desktop app's content policy lists.
 */

const API = "https://api.openverse.org/v1/images/"

/** Word's Stock Images categories, each with the words searched for it (one word alone finds too much else). */
export const STOCK_CATEGORIES = [
  { name: "Nature", words: "forest landscape" },
  { name: "Business", words: "office desk laptop" },
  { name: "Food", words: "food plate" },
  { name: "Travel", words: "travel landmark" },
  { name: "Animals", words: "wildlife animal" },
  { name: "Architecture", words: "building architecture" },
  { name: "Technology", words: "computer technology" },
  { name: "Sports", words: "sport game" },
  { name: "People", words: "people portrait" },
  { name: "Flowers", words: "flower blossom" },
  { name: "Ocean", words: "ocean waves" },
  { name: "Mountains", words: "mountain peak" },
] as const

export type StockImage = {
  id: string
  title: string
  /** A small copy for the gallery (Openverse's, about 600 pixels wide). */
  thumbnail: string
  /** The picture inserted: the original, or Commons' 1920-pixel copy of a larger Wikimedia picture. */
  url: string
  /** The original picture, when `url` is a smaller copy (tried if the copy fails). */
  original: string
  width: number
  height: number
  creator: string
  /** Where the picture comes from, to look it up. */
  landing: string
}

type OpenverseResult = {
  id?: string
  title?: string | null
  url?: string
  thumbnail?: string
  width?: number | null
  height?: number | null
  creator?: string | null
  foreign_landing_url?: string | null
  license?: string
  mature?: boolean
}

/** The search Openverse is asked: public domain photos from Flickr and Wikimedia Commons, safe for work. */
export function stockSearchUrl(query: string, page = 1) {
  const params = new URLSearchParams({
    q: query.trim() || "nature",
    license: "cc0,pdm",
    category: "photograph",
    source: "flickr,wikimedia",
    mature: "false",
    // The most Openverse gives without an account; more come a page at a time.
    page_size: "20",
    page: String(page),
  })
  return `${API}?${params.toString()}`
}

const HOSTS = ["live.staticflickr.com", "upload.wikimedia.org"]

/**
 * A Wikimedia Commons picture wider than 1920 pixels as Commons' own 1920-pixel copy (originals reach 50 megapixels). Commons
 * makes copies only at its standard widths (1280, 1920, …), so not any width.
 * Commons names it `/thumb/<hash path>/<file>/1920px-<file>`; SVG and TIFF copies are PNG and JPEG, left as they are.
 */
export function insertedUrl(url: string, width: number) {
  const match =
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+\.(?:jpe?g|png))$/i.exec(url)
  if (!match || width <= 1920) {
    return url
  }
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${match[1]}/${match[2]}/1920px-${match[2]}`
}

/** The pictures of an Openverse answer that can be inserted. */
export function readStockResults(payload: unknown): StockImage[] {
  const results = (payload as { results?: OpenverseResult[] } | null)?.results ?? []
  return results.flatMap((result) => {
    const url = result.url ?? ""
    const host = /^https:\/\/([^/]+)\//.exec(url)?.[1] ?? ""
    if (!result.id || !result.thumbnail || !HOSTS.includes(host) || result.mature) {
      return []
    }
    if (result.license && !["cc0", "pdm"].includes(result.license)) {
      return []
    }
    const width = result.width ?? 0
    return [
      {
        id: result.id,
        title: (result.title ?? "").trim() || "Photo",
        thumbnail: result.thumbnail,
        url: insertedUrl(url, width),
        original: url,
        width,
        height: result.height ?? 0,
        creator: creatorName(result.creator ?? ""),
        landing: result.foreign_landing_url ?? "",
      },
    ]
  })
}

/** Who took the picture, without what some add after their name ("Sam - 2 Million Views - Thank you"). */
export function creatorName(creator: string) {
  const name = creator.split(/\s[-|~·]\s/)[0]!.trim()
  return name.length > 40 ? `${name.slice(0, 39).trimEnd()}…` : name
}

/** The picture's alternative text: its title, and who took it, as the picture's description in Word. */
export function stockAltText(image: StockImage) {
  return image.creator ? `${image.title}, by ${image.creator} (public domain)` : `${image.title} (public domain)`
}

export async function searchStockImages(query: string, page = 1, signal?: AbortSignal) {
  const response = await fetch(stockSearchUrl(query, page), { signal })
  if (response.status === 429) {
    throw new Error("Too many searches for now. Wait a minute and try again.")
  }
  if (!response.ok) {
    throw new Error(`The search failed (${response.status}).`)
  }
  return readStockResults(await response.json())
}

/** The picture's bytes as a data URL, for the document to keep. */
export async function downloadStockImage(image: StockImage) {
  let response = await fetch(image.url)
  if (!response.ok && image.original !== image.url) {
    response = await fetch(image.original)
  }
  if (!response.ok) {
    throw new Error(`The picture could not be downloaded (${response.status}).`)
  }
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("The picture could not be read."))
    reader.readAsDataURL(blob)
  })
}
