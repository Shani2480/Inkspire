import { formatDay, useUserSettings } from "@/document/user-settings"
export type DateFormat = "date" | "time" | "datetime"

export type FieldResult = { ok: true; value: string } | { ok: false; error: string }

export const IF_OPERATORS = ["=", "≠", ">", "<", "≥", "≤"] as const

export type IfOperator = (typeof IF_OPERATORS)[number]

const FORMULA_CHARS = /^[\d\s.+\-*/()]+$/

/** Word's date picture for each of the editor's date formats (`DATE \@ "…"`). */
export const DATE_PICTURES: Record<DateFormat, string> = {
  date: "M/d/yyyy",
  time: "h:mm am/pm",
  datetime: "M/d/yyyy h:mm am/pm",
}

export function dateFormat(value: unknown): DateFormat {
  return value === "time" || value === "datetime" ? value : "date"
}

export function formatDate(format: DateFormat, date = new Date()) {
  const time = date.toLocaleTimeString(useUserSettings.getState().locale || undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (format === "time") {
    return time
  }
  const day = formatDay(date)
  return format === "datetime" ? `${day} ${time}` : day
}

export function evaluateFormula(source: string): FieldResult {
  const text = source.trim().replace(/^=\s*/, "")
  if (!text) {
    return { ok: false, error: "Empty formula" }
  }
  if (!FORMULA_CHARS.test(text)) {
    return { ok: false, error: "Invalid formula" }
  }
  try {
    const parser = new FormulaParser(text)
    const value = parser.parseExpression()
    parser.finish()
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Invalid formula" }
    }
    return { ok: true, value: formatNumber(value) }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid formula"
    return { ok: false, error: message === "Cannot divide by zero" ? message : "Invalid formula" }
  }
}

export function evaluateIf(
  left: string,
  operator: string,
  right: string,
  whenTrue: string,
  whenFalse: string,
): FieldResult {
  if (!isIfOperator(operator)) {
    return { ok: false, error: "Invalid comparison" }
  }
  const leftNumber = numericLiteral(left)
  const rightNumber = numericLiteral(right)
  if (leftNumber !== null && rightNumber !== null) {
    return { ok: true, value: compare(leftNumber, operator, rightNumber) ? whenTrue : whenFalse }
  }
  if (operator === "=" || operator === "≠") {
    const same = left === right
    return { ok: true, value: (operator === "=" ? same : !same) ? whenTrue : whenFalse }
  }
  return { ok: false, error: "Invalid comparison" }
}

export function isIfOperator(value: string): value is IfOperator {
  return (IF_OPERATORS as readonly string[]).includes(value)
}

export function clipFieldText(value: string) {
  return value.slice(0, 200)
}

function formatNumber(value: number) {
  if (Object.is(value, -0)) {
    return "0"
  }
  const rounded = Math.round(value * 1e6) / 1e6
  return String(rounded)
}

function numericLiteral(value: string) {
  const text = value.trim()
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return null
  }
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function compare(left: number, operator: IfOperator, right: number) {
  switch (operator) {
    case "=":
      return left === right
    case "≠":
      return left !== right
    case ">":
      return left > right
    case "<":
      return left < right
    case "≥":
      return left >= right
    case "≤":
      return left <= right
  }
}

class FormulaParser {
  private index = 0
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  parseExpression(): number {
    let value = this.parseTerm()
    for (;;) {
      this.skip()
      const operator = this.peek()
      if (operator !== "+" && operator !== "-") {
        return value
      }
      this.index += 1
      const right = this.parseTerm()
      value = operator === "+" ? value + right : value - right
    }
  }

  finish() {
    this.skip()
    if (this.index !== this.source.length) {
      throw new Error("Invalid formula")
    }
  }

  private parseTerm() {
    let value = this.parseFactor()
    for (;;) {
      this.skip()
      const operator = this.peek()
      if (operator !== "*" && operator !== "/") {
        return value
      }
      this.index += 1
      const right = this.parseFactor()
      if (operator === "/" && right === 0) {
        throw new Error("Cannot divide by zero")
      }
      value = operator === "*" ? value * right : value / right
    }
  }

  private parseFactor(): number {
    this.skip()
    const sign = this.peek()
    if (sign === "+" || sign === "-") {
      this.index += 1
      const value = this.parseFactor()
      return sign === "-" ? -value : value
    }
    if (this.peek() === "(") {
      this.index += 1
      const value = this.parseExpression()
      this.skip()
      if (this.peek() !== ")") {
        throw new Error("Invalid formula")
      }
      this.index += 1
      return value
    }
    return this.parseNumber()
  }

  private parseNumber() {
    this.skip()
    const match = /^\d+(?:\.\d+)?/.exec(this.source.slice(this.index))
    if (!match) {
      throw new Error("Invalid formula")
    }
    this.index += match[0].length
    return Number(match[0])
  }

  private skip() {
    while (this.source[this.index] === " ") {
      this.index += 1
    }
  }

  private peek() {
    return this.source[this.index] ?? ""
  }
}
