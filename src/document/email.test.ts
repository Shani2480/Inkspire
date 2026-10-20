import { describe, expect, it, vi } from "vitest"

const openExternal = vi.fn()
vi.mock("@/document/help", async (original) => ({
  ...(await original<typeof import("@/document/help")>()),
  openExternal: (url: string) => openExternal(url),
}))

import { emailDocument } from "@/document/commands"
import { useDocumentStore } from "@/document/store"

describe("emailDocument", () => {
  it("opens a mail message titled after the document where files cannot be attached", async () => {
    useDocumentStore.getState().setDocumentProps({ title: "Q3 plan & budget" })
    expect(await emailDocument()).toBe("message")
    expect(openExternal).toHaveBeenCalledWith("mailto:?subject=Q3%20plan%20%26%20budget")
  })
})
