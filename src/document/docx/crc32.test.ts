import { crc32 } from "@/document/docx/zip"
import { it, expect } from "vitest"
it("crc", () => {
  const ref = (d: Uint8Array) => {
    let c = 0xffffffff
    for (const b of d) {
      c ^= b
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return (c ^ 0xffffffff) >>> 0
  }
  for (const n of [0, 1, 2, 3, 4, 5, 7, 8, 100, 1001]) {
    const d = new Uint8Array(n).map((_, i) => (i * 131 + 7) & 255)
    expect(crc32(d)).toBe(ref(d))
  }
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
})
