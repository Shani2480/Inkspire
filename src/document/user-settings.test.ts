import { beforeEach, describe, expect, it } from "vitest"
import {
  nameFromAccount,
  datePatternFor,
  formatDay,
  formatWithPattern,
  detectSettings,
  initialsOf,
  localeFromEnvironment,
  SETTINGS_KEY,
  useUserSettings,
} from "@/document/user-settings"

describe("first-run detection (21.42)", () => {
  it("reads a locale from an environment value", () => {
    expect(localeFromEnvironment("en_GB.UTF-8")).toBe("en-GB")
    expect(localeFromEnvironment("de_DE@euro")).toBe("de-DE")
    expect(localeFromEnvironment("C")).toBe("")
    expect(localeFromEnvironment("POSIX")).toBe("")
    expect(localeFromEnvironment(undefined)).toBe("")
  })

  it("works out date patterns and number separators", () => {
    expect(datePatternFor("en-GB")).toBe("dd/MM/yyyy")
    expect(datePatternFor("en-US")).toBe("MM/dd/yyyy")
    expect(datePatternFor("de-DE")).toBe("dd.MM.yyyy")
    expect(datePatternFor("")).toBe("")
  })

  it("fills everything from a full environment", () => {
    const found = detectSettings({ user: "sam", full_name: "Sam Doe", lang: "de_DE.UTF-8" })
    expect(found).toMatchObject({
      author: "Sam Doe",
      initials: "SD",
      locale: "de-DE",
      dateFormat: "dd.MM.yyyy",
      decimalSeparator: ",",
      groupSeparator: ".",
      setupDone: false,
    })
  })

  it("reads a name from an account name only when it is plainly two words", () => {
    expect(nameFromAccount("john.smith")).toBe("John Smith")
    expect(nameFromAccount("jane_doe")).toBe("Jane Doe")
    expect(nameFromAccount("MariaGarcia")).toBe("Maria Garcia")
    expect(nameFromAccount("shani248")).toBe("")
    expect(nameFromAccount("sam")).toBe("")
    expect(nameFromAccount("admin")).toBe("")
    expect(detectSettings({ user: "jane.doe" })).toMatchObject({ author: "Jane Doe", initials: "JD" })
  })

  it("uses LC_TIME and LC_NUMERIC for dates and numbers, and leaves the name blank when the system has none", () => {
    const found = detectSettings({
      user: "sam",
      lang: "en_US.UTF-8",
      lc_time: "en_GB.UTF-8",
      lc_numeric: "de_DE.UTF-8",
    })
    expect(found.author).toBe("")
    expect(found.locale).toBe("en-US")
    expect(found.dateFormat).toBe("dd/MM/yyyy")
    expect(found.decimalSeparator).toBe(",")
  })

  it("falls back to the browser's locale only when the environment says nothing", () => {
    expect(detectSettings({ lang: "C", intlLocale: "fr-FR" }).locale).toBe("fr-FR")
    expect(detectSettings({ lang: "en_GB.UTF-8", intlLocale: "fr-FR" }).locale).toBe("en-GB")
  })

  it("leaves every field blank when the system gives nothing", () => {
    expect(detectSettings({})).toEqual({
      setupDone: false,
      author: "",
      initials: "",
      locale: "",
      dateFormat: "",
      decimalSeparator: "",
      groupSeparator: "",
    })
  })

  it("makes initials from up to three words", () => {
    expect(initialsOf("  ada  lovelace ")).toBe("AL")
    expect(initialsOf("")).toBe("")
  })
})

describe("the stored setup", () => {
  beforeEach(() => {
    localStorage.clear()
    useUserSettings.setState({ ...detectSettings({}) })
  })

  it("is asked once and read back", () => {
    expect(useUserSettings.getState().setupDone).toBe(false)
    useUserSettings.getState().confirm({
      author: "Sam Doe",
      initials: "SD",
      locale: "en-GB",
      dateFormat: "dd/MM/yyyy",
      decimalSeparator: ".",
      groupSeparator: ",",
    })
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
    expect(stored).toMatchObject({ setupDone: true, author: "Sam Doe", dateFormat: "dd/MM/yyyy" })
  })

  it("can be skipped and reopened", () => {
    useUserSettings.getState().skip()
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").setupDone).toBe(true)
    useUserSettings.getState().reopen()
    expect(useUserSettings.getState().setupDone).toBe(false)
  })
})

describe("dates written to the person's pattern", () => {
  const day = new Date(2031, 10, 5)

  it("formats the pattern's tokens", () => {
    expect(formatWithPattern(day, "dd/MM/yyyy")).toBe("05/11/2031")
    expect(formatWithPattern(day, "d.M.yy")).toBe("5.11.31")
    expect(formatWithPattern(day, "d MMMM yyyy", "en-GB")).toBe("5 November 2031")
    expect(formatWithPattern(day, "MMM d, yyyy", "en-US")).toBe("Nov 5, 2031")
  })

  it("is used for dates, and the system's format when no pattern is set", () => {
    useUserSettings.setState({ ...detectSettings({}), dateFormat: "yyyy-MM-dd" })
    expect(formatDay(day)).toBe("2031-11-05")
    useUserSettings.setState({ dateFormat: "", locale: "de-DE" })
    expect(formatDay(day)).toBe("5.11.2031")
  })
})
