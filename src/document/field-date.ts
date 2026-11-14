/**
 * Word's DATE and TIME fields show the moment the document is opened (Word updates them every time), formatted by
 * the field's date-time picture (`\@ "d MMMM yyyy"`) or, without one, the system's short date or time.
 */

/** The result a DATE or TIME field shows at `now`, or null for any other field. */
export function dateFieldResult(instruction: string, now = new Date(), locale?: string): string | null {
  const match = /^\s*(DATE|TIME)\b(.*)$/is.exec(instruction)
  if (!match) {
    return null
  }
  const picture = /\\@\s*(?:"([^"]*)"|(\S+))/.exec(match[2] ?? "")
  const pattern = picture ? (picture[1] ?? picture[2] ?? "") : ""
  if (pattern) {
    return formatPicture(now, pattern, locale)
  }
  try {
    return match[1]!.toUpperCase() === "TIME"
      ? now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      : now.toLocaleDateString(locale)
  } catch {
    return now.toLocaleDateString()
  }
}

const TOKENS = /'[^']*'|yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|AM\/PM|am\/pm|A\/P|a\/p/g

/** A date written to Word's date-time picture: its year, month, day, hour, minute and AM/PM codes, 'quoted' text. */
export function formatPicture(date: Date, pattern: string, locale?: string) {
  const pad = (value: number) => String(value).padStart(2, "0")
  const name = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, options).format(date)
    } catch {
      return new Intl.DateTimeFormat(undefined, options).format(date)
    }
  }
  const hours12 = date.getHours() % 12 || 12
  const pm = date.getHours() >= 12
  return pattern.replace(TOKENS, (token) => {
    switch (token) {
      case "yyyy":
        return String(date.getFullYear())
      case "yy":
        return pad(date.getFullYear() % 100)
      case "MMMM":
        return name({ month: "long" })
      case "MMM":
        return name({ month: "short" })
      case "MM":
        return pad(date.getMonth() + 1)
      case "M":
        return String(date.getMonth() + 1)
      case "dddd":
        return name({ weekday: "long" })
      case "ddd":
        return name({ weekday: "short" })
      case "dd":
        return pad(date.getDate())
      case "d":
        return String(date.getDate())
      case "HH":
        return pad(date.getHours())
      case "H":
        return String(date.getHours())
      case "hh":
        return pad(hours12)
      case "h":
        return String(hours12)
      case "mm":
        return pad(date.getMinutes())
      case "m":
        return String(date.getMinutes())
      case "ss":
        return pad(date.getSeconds())
      case "s":
        return String(date.getSeconds())
      case "AM/PM":
        return pm ? "PM" : "AM"
      case "am/pm":
        return pm ? "pm" : "am"
      case "A/P":
        return pm ? "P" : "A"
      case "a/p":
        return pm ? "p" : "a"
      default:
        return token.slice(1, -1)
    }
  })
}
