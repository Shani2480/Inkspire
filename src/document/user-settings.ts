import { create } from "zustand"

/** What the first-run setup (21.42) confirms, and what the app then uses for the author and for dates and numbers. */
export type UserSettings = {
  /** The setup has been answered (confirmed or skipped) and is not shown again. */
  setupDone: boolean
  author: string
  initials: string
  /** A BCP 47 tag such as `en-GB`; blank when the system gave none. */
  locale: string
  /** A pattern such as `dd/MM/yyyy`; blank when unknown. */
  dateFormat: string
  decimalSeparator: string
  groupSeparator: string
}

/** The raw facts the system offers: the desktop session's environment and the browser's own locale. */
export type SystemFacts = {
  user?: string
  full_name?: string
  lang?: string
  lc_all?: string
  lc_time?: string
  lc_numeric?: string
  /** `navigator.language` or the like, used only when the environment says nothing. */
  intlLocale?: string
}

export const SETTINGS_KEY = "aiword.user-settings"

/** `en_GB.UTF-8` → `en-GB`; `C`, `POSIX` and empty give "". */
export function localeFromEnvironment(value: string | undefined): string {
  const base = (value ?? "").trim().split(/[.@]/)[0]
  if (!base || base === "C" || base === "POSIX") {
    return ""
  }
  const tag = base.replace(/_/g, "-")
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? ""
  } catch {
    return ""
  }
}

/** The languages and regions offered in the first-run dropdown (21.44); anything else is typed under "Other…". */
export const LOCALE_OPTIONS: string[] = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "en-IN",
  "fr-FR",
  "fr-CA",
  "de-DE",
  "de-CH",
  "es-ES",
  "es-MX",
  "it-IT",
  "pt-BR",
  "pt-PT",
  "nl-NL",
  "sv-SE",
  "da-DK",
  "nb-NO",
  "fi-FI",
  "pl-PL",
  "cs-CZ",
  "ru-RU",
  "tr-TR",
  "ar-SA",
  "he-IL",
  "hi-IN",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "zh-TW",
]

export const DATE_FORMAT_OPTIONS: string[] = [
  "M/d/yyyy",
  "MM/dd/yyyy",
  "d/M/yyyy",
  "dd/MM/yyyy",
  "dd.MM.yyyy",
  "d.M.yyyy",
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd-MM-yyyy",
  "d MMM yyyy",
  "d MMMM yyyy",
  "MMMM d, yyyy",
]

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("")
}

/** The short date pattern a locale uses, such as `dd/MM/yyyy`; "" when it cannot be worked out. */
export function datePatternFor(locale: string): string {
  if (!locale) {
    return ""
  }
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(
      new Date(2031, 10, 22),
    )
    return parts
      .map((part) => {
        switch (part.type) {
          case "day":
            return "dd"
          case "month":
            return "MM"
          case "year":
            return "yyyy"
          default:
            return part.value
        }
      })
      .join("")
  } catch {
    return ""
  }
}

export function separatorsFor(locale: string): { decimal: string; group: string } {
  if (!locale) {
    return { decimal: "", group: "" }
  }
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
    return {
      decimal: parts.find((part) => part.type === "decimal")?.value ?? "",
      group: parts.find((part) => part.type === "group")?.value ?? "",
    }
  } catch {
    return { decimal: "", group: "" }
  }
}

/**
 * A name read from an account name such as `john.smith`, `jane_doe` or `MariaGarcia`: only when it falls apart into
 * two or more plain words. `shani248` or `admin` say nothing about a person, so they give "".
 */
export function nameFromAccount(account: string): string {
  const words = account
    .trim()
    .replace(/([\p{Ll}])(\p{Lu})/gu, "$1 $2")
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (words.length < 2 || !words.every((word) => /^\p{L}{2,}$/u.test(word))) {
    return ""
  }
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join(" ")
}

/**
 * The setup's starting values. The environment wins (`LC_ALL`, then `LC_TIME`/`LC_NUMERIC` for the date and number
 * formats, then `LANG`), the browser's locale fills in only when it says nothing, and what is not known stays blank
 * for the person to type.
 */
export function detectSettings(facts: SystemFacts): UserSettings {
  const general = localeFromEnvironment(facts.lc_all) || localeFromEnvironment(facts.lang)
  const locale = general || localeFromEnvironment(facts.intlLocale?.replace("-", "_"))
  const timeLocale = localeFromEnvironment(facts.lc_all) || localeFromEnvironment(facts.lc_time) || locale
  const numberLocale = localeFromEnvironment(facts.lc_all) || localeFromEnvironment(facts.lc_numeric) || locale
  const author = (facts.full_name ?? "").trim() || nameFromAccount(facts.user ?? "")
  const separators = separatorsFor(numberLocale)
  return {
    setupDone: false,
    author,
    initials: initialsOf(author),
    locale,
    dateFormat: datePatternFor(timeLocale),
    decimalSeparator: separators.decimal,
    groupSeparator: separators.group,
  }
}

const BLANK: UserSettings = {
  setupDone: false,
  author: "",
  initials: "",
  locale: "",
  dateFormat: "",
  decimalSeparator: "",
  groupSeparator: "",
}

function load(): UserSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<UserSettings> | null
    if (!parsed || typeof parsed !== "object") {
      return BLANK
    }
    const text = (value: unknown) => (typeof value === "string" ? value : "")
    return {
      setupDone: parsed.setupDone === true,
      author: text(parsed.author),
      initials: text(parsed.initials),
      locale: text(parsed.locale),
      dateFormat: text(parsed.dateFormat),
      decimalSeparator: text(parsed.decimalSeparator),
      groupSeparator: text(parsed.groupSeparator),
    }
  } catch {
    return BLANK
  }
}

function save(settings: UserSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Without storage the setup is simply asked again next time.
  }
}

type SettingsStore = UserSettings & {
  /** Stores the confirmed values and marks the setup as done. */
  confirm: (values: Omit<UserSettings, "setupDone">) => void
  /** Marks the setup as done without changing anything. */
  skip: () => void
  /** Shows the setup again, as "Run setup again" does. */
  reopen: () => void
}

export const useUserSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  confirm: (values) => {
    set({ ...values, setupDone: true })
    save(pick(get()))
  },
  skip: () => {
    set({ setupDone: true })
    save(pick(get()))
  },
  reopen: () => {
    set({ setupDone: false })
    save(pick(get()))
  },
}))

function pick(state: UserSettings): UserSettings {
  const { setupDone, author, initials, locale, dateFormat, decimalSeparator, groupSeparator } = state
  return { setupDone, author, initials, locale, dateFormat, decimalSeparator, groupSeparator }
}

/** A date written to a pattern such as `dd/MM/yyyy`: `yyyy`, `yy`, `MMMM`, `MMM`, `MM`, `M`, `dd` and `d`. */
export function formatWithPattern(date: Date, pattern: string, locale = ""): string {
  const month = (style: "long" | "short") => {
    try {
      return new Intl.DateTimeFormat(locale || undefined, { month: style }).format(date)
    } catch {
      return String(date.getMonth() + 1)
    }
  }
  const pad = (value: number) => String(value).padStart(2, "0")
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d/g, (token) => {
    switch (token) {
      case "yyyy":
        return String(date.getFullYear())
      case "yy":
        return pad(date.getFullYear() % 100)
      case "MMMM":
        return month("long")
      case "MMM":
        return month("short")
      case "MM":
        return pad(date.getMonth() + 1)
      case "M":
        return String(date.getMonth() + 1)
      case "dd":
        return pad(date.getDate())
      default:
        return String(date.getDate())
    }
  })
}

/** The day as the person set it up: their date pattern when they have one, the system's own format otherwise. */
export function formatDay(date: Date): string {
  const { dateFormat, locale } = useUserSettings.getState()
  return dateFormat ? formatWithPattern(date, dateFormat, locale) : date.toLocaleDateString(locale || undefined)
}
