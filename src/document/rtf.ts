/** Lightweight RTF → plain-ish HTML fallback for browser preview (no Pandoc). */

function decodeRtfHex(hex: string) {
  const value = Number.parseInt(hex, 16)
  return Number.isFinite(value) ? String.fromCharCode(value) : ""
}

export function rtfToHtml(rtf: string) {
  const text = rtf
    .replace(/\r\n?/g, "\n")
    .replace(/\{\\fonttbl[\s\S]*?\}/g, "")
    .replace(/\{\\colortbl[\s\S]*?\}/g, "")
    .replace(/\{\\stylesheet[\s\S]*?\}/g, "")
    .replace(/\{\\info[\s\S]*?\}/g, "")
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) => decodeRtfHex(match.slice(2)))
    .replace(/\\u(-?\d+)\??/g, (_match, code) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCharCode(n < 0 ? n + 65536 : n) : ""
    })
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!text) {
    return "<p></p>"
  }

  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}
