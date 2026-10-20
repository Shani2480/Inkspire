import { describe, expect, it } from "vitest"
import { MceError } from "@/document/docx/mce"
import { openPackage, OpcError } from "@/document/docx/opc"
import { classifyFileError, describeFileProblem } from "@/document/file-errors"

const CFB = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])

describe("file problems", () => {
  it("sorts the desktop app's read and write errors", () => {
    const open = (message: string) => classifyFileError(message, { operation: "open", file: "/a/b.docx" })
    const save = (message: string) => classifyFileError(message, { operation: "save", file: "/a/b.docx" })
    expect(open("The selected file could not be found.")).toBe("not-found")
    expect(open("Could not read the document: Permission denied (os error 13)")).toBe("permission")
    expect(save("Could not save the document: Permission denied (os error 13)")).toBe("permission")
    expect(save("Could not save the document: Read-only file system (os error 30)")).toBe("read-only")
    expect(save("Could not save the document: No space left on device (os error 28)")).toBe("disk-full")
    expect(
      save(
        "Could not save the document: The process cannot access the file because it is being used by another process. (os error 32)",
      ),
    ).toBe("in-use")
    expect(save("The folder for that file could not be found.")).toBe("folder-missing")
    expect(open("Inkspire can only open and save .docx, .odt, .rtf, .html, .md, .txt, and .pdf files.")).toBe(
      "unsupported",
    )
    expect(save(new Error("Saving .odt requires the desktop app."))).toBe("desktop-only")
    expect(save("Something odd")).toBe("unknown")
  })

  it("tells an old .doc and a password-protected .docx from a damaged file", async () => {
    const error = await openPackage(CFB, "x.docx").catch((caught: unknown) => caught)
    expect(classifyFileError(error, { operation: "open", file: "x.docx", bytes: CFB })).toBe("protected")
    expect(classifyFileError(error, { operation: "open", file: "x.doc", bytes: CFB })).toBe("legacy-word")
    expect(classifyFileError(error, { operation: "open", file: "x.docx", bytes: new Uint8Array([1, 2, 3]) })).toBe(
      "damaged",
    )
    expect(classifyFileError(new OpcError("missing-main-part", "no"), { operation: "open", file: "x.docx" })).toBe(
      "damaged",
    )
    expect(classifyFileError(new MceError("unknown-namespace", "urn:x"), { operation: "open", file: "x.docx" })).toBe(
      "unsupported",
    )
  })

  it("offers the buttons that fit, naming only the file", () => {
    const missing = describeFileProblem("The selected file could not be found.", {
      operation: "open",
      file: "/home/me/Report.docx",
      recent: true,
    })
    expect(missing).toMatchObject({ kind: "not-found", fileName: "Report.docx" })
    expect(missing.actions).toEqual(["open-other", "remove-recent", "close"])
    expect(missing.message).toContain('"Report.docx"')
    expect(missing.message).not.toContain("/home/me")

    const full = describeFileProblem("No space left on device (os error 28)", { operation: "save", file: "/x/a.docx" })
    expect(full.actions[0]).toBe("save-as")
    expect(full.detail).toContain("os error 28")
  })
})
