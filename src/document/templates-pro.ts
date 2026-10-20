import type { DocumentTemplate } from "@/document/templates"

/*
 * Designed templates: three styles each of a résumé, a report, an invoice, a flyer and a newsletter.
 * They are written in the HTML the editor reads (tables for layout, cell shading, run formatting), so they open
 * and save as ordinary Word content. Wording in [brackets] is for the user to replace.
 */

/** The width of the text between the default margins, in pixels. */
const WIDTH = 624

type Run = {
  size?: number
  color?: string
  font?: string
  bold?: boolean
  italic?: boolean
  spacing?: number
}

/** A run of text with its own look. */
function t(text: string, run: Run = {}) {
  const style = [
    run.font ? `font-family: ${run.font}` : "",
    run.size ? `font-size: ${run.size}pt` : "",
    run.color ? `color: ${run.color}` : "",
    run.spacing ? `letter-spacing: ${run.spacing}pt` : "",
  ]
    .filter(Boolean)
    .join("; ")
  let html = style ? `<span style="${style}">${text}</span>` : text
  if (run.bold) {
    html = `<strong>${html}</strong>`
  }
  if (run.italic) {
    html = `<em>${html}</em>`
  }
  return html
}

type Block = { align?: "left" | "center" | "right"; before?: number; after?: number; line?: number; bg?: string }

/** A paragraph; spacing is in points, line is a multiple of the single line. */
function p(inner: string, block: Block = {}) {
  const style = [
    block.align ? `text-align: ${block.align}` : "",
    block.before !== undefined ? `margin-top: ${block.before}pt` : "",
    block.after !== undefined ? `margin-bottom: ${block.after}pt` : "",
    block.line ? `line-height: ${block.line}` : "",
    block.bg ? `background-color: ${block.bg}` : "",
  ]
    .filter(Boolean)
    .join("; ")
  return `<p${style ? ` style="${style}"` : ""}>${inner}</p>`
}

type Cell = {
  width: number
  bg?: string
  valign?: "top" | "middle" | "bottom"
  /** Sides drawn, such as "bottom" or "top bottom", with the pen they are drawn in. */
  borders?: string
  pen?: string
}

function cell(inner: string, options: Cell) {
  const style = [
    options.bg ? `background-color: ${options.bg}` : "",
    options.pen ? `--cell-border: ${options.pen}; --cell-border-color: ${options.pen.split(" ")[2]}` : "",
  ]
    .filter(Boolean)
    .join("; ")
  const attrs = [
    `colwidth="${options.width}"`,
    options.valign && options.valign !== "top" ? `data-valign="${options.valign}"` : "",
    options.borders ? `data-borders="${options.borders}"` : "",
    style ? `style="${style}"` : "",
  ]
    .filter(Boolean)
    .join(" ")
  return `<td ${attrs}>${inner}</td>`
}

type TableLook = { pad?: "narrow" | "normal" | "wide"; frame?: "none" | "all" }

/** A table used for layout: no frame or grid unless a cell draws its own border. */
function table(rows: string[][], look: TableLook = {}) {
  const body = rows.map((row) => `<tr>${row.join("")}</tr>`).join("")
  return `<table data-frame="${look.frame ?? "none"}" data-gridlines="0" data-cell-pad="${look.pad ?? "normal"}"><tbody>${body}</tbody></table>`
}

const rule = (color: string, weight = "1px") => `${weight} solid ${color}`

const bullets = (items: string[], size = 10, color = "#333333") =>
  `<ul>${items.map((item) => `<li>${t(item, { size, color })}</li>`).join("")}</ul>`

const spacer = (points = 6) => p(t("&nbsp;", { size: points }), { after: 0, line: 1 })

/* ------------------------------------------------------------------ Résumés */

function resumeSidebar() {
  const navy = "#1f3a5f"
  const side = (heading: string, body: string) =>
    p(t(heading, { size: 10, bold: true, color: "#9fc3e8", spacing: 1.5, font: "Calibri" }), { before: 14, after: 4 }) +
    body
  const small = (text: string) => p(t(text, { size: 9.5, color: "#ffffff", font: "Calibri" }), { after: 3 })
  const left =
    p(t("&nbsp;", { size: 8 }), { after: 0 }) +
    side(
      "CONTACT",
      small("[City, Country]") +
        small("[email@example.com]") +
        small("[+00 000 000 000]") +
        small("[linkedin.com/in/you]"),
    ) +
    side("SKILLS", small("[Skill one]") + small("[Skill two]") + small("[Skill three]") + small("[Skill four]")) +
    side("LANGUAGES", small("[Language] — native") + small("[Language] — fluent")) +
    side("INTERESTS", small("[Interest] · [Interest] · [Interest]"))
  const job = (role: string, place: string, dates: string, points: string[]) =>
    p(
      t(role, { size: 11.5, bold: true, color: navy, font: "Calibri" }) +
        t(`  ${place}`, { size: 10.5, color: "#555555" }),
      {
        before: 8,
        after: 0,
      },
    ) +
    p(t(dates, { size: 9, italic: true, color: "#777777" }), { after: 2 }) +
    bullets(points, 10)
  const head = (title: string) =>
    p(t(title, { size: 11, bold: true, color: navy, spacing: 1.5, font: "Calibri" }), { before: 14, after: 2 })
  const right =
    p(t("[Your Name]", { size: 30, bold: true, color: navy, font: "Calibri" }), { before: 6, after: 0 }) +
    p(t("[Professional Title]", { size: 13, color: "#4a6fa5", font: "Calibri", spacing: 1 }), { after: 8 }) +
    head("PROFILE") +
    p(
      t("[Two or three sentences on who you are, the work you do best and what you want to do next.]", {
        size: 10,
        color: "#333333",
      }),
      { line: 1.2 },
    ) +
    head("EXPERIENCE") +
    job("[Job Title]", "[Company], [City]", "[Month Year] – Present", [
      "[Result you delivered, with a number if you can]",
      "[What you led, built or improved]",
      "[Skill or tool you used to do it]",
    ]) +
    job("[Job Title]", "[Company], [City]", "[Month Year] – [Month Year]", [
      "[Result you delivered, with a number if you can]",
      "[What you led, built or improved]",
    ]) +
    head("EDUCATION") +
    p(
      t("[Degree]", { size: 11, bold: true, color: "#333333" }) +
        t("  [University], [Year]", { size: 10.5, color: "#555555" }),
      {
        after: 2,
      },
    )
  return table([[cell(left, { width: 190, bg: navy }), cell(right, { width: WIDTH - 190 })]], { pad: "wide" })
}

function resumeClassic() {
  const ink = "#222222"
  const head = (title: string) =>
    table(
      [
        [
          cell(
            p(t(title, { size: 11, bold: true, color: ink, spacing: 2, font: "Cambria" }), { before: 8, after: 2 }),
            { width: WIDTH, borders: "bottom", pen: rule(ink, "1px") },
          ),
        ],
      ],
      { pad: "narrow" },
    )
  const job = (role: string, place: string, dates: string, points: string[]) =>
    p(
      t(role, { size: 11, bold: true, color: ink, font: "Cambria" }) +
        t(`, ${place}`, { size: 11, color: ink, font: "Cambria" }) +
        t(`    ${dates}`, { size: 10, italic: true, color: "#666666", font: "Cambria" }),
      {
        before: 8,
        after: 2,
      },
    ) + bullets(points, 10.5, ink)
  return (
    p(t("[YOUR NAME]", { size: 26, color: ink, font: "Cambria", spacing: 4 }), { align: "center", after: 2 }) +
    p(
      t("[City] · [email@example.com] · [+00 000 000 000] · [linkedin.com/in/you]", {
        size: 10,
        color: "#555555",
        font: "Cambria",
      }),
      {
        align: "center",
        after: 10,
      },
    ) +
    head("SUMMARY") +
    p(
      t("[A short paragraph describing your experience, strengths and the role you are after.]", {
        size: 10.5,
        color: ink,
        font: "Cambria",
      }),
      {
        before: 4,
        line: 1.25,
      },
    ) +
    head("PROFESSIONAL EXPERIENCE") +
    job("[Job Title]", "[Company], [City]", "[Year] – Present", [
      "[Achievement with a measurable result]",
      "[Responsibility or project you owned]",
      "[Team or tools you worked with]",
    ]) +
    job("[Job Title]", "[Company], [City]", "[Year] – [Year]", [
      "[Achievement with a measurable result]",
      "[Responsibility or project you owned]",
    ]) +
    head("EDUCATION") +
    p(
      t("[Degree]", { size: 11, bold: true, color: ink, font: "Cambria" }) +
        t(", [University], [Year]", { size: 11, color: ink, font: "Cambria" }),
      {
        before: 6,
      },
    ) +
    head("SKILLS") +
    p(t("[Skill] · [Skill] · [Skill] · [Skill] · [Skill] · [Skill]", { size: 10.5, color: ink, font: "Cambria" }), {
      before: 6,
    })
  )
}

function resumeBanner() {
  const teal = "#0f766e"
  const banner = cell(
    p(t("[Your Name]", { size: 30, bold: true, color: "#ffffff", font: "Calibri" }), { before: 8, after: 0 }) +
      p(
        t("[Professional Title]  |  [City]  |  [email@example.com]  |  [+00 000 000 000]", {
          size: 10.5,
          color: "#ccfbf1",
          font: "Calibri",
        }),
        {
          after: 8,
        },
      ),
    { width: WIDTH, bg: teal, valign: "middle" },
  )
  const head = (title: string) =>
    p(t(title, { size: 12, bold: true, color: teal, font: "Calibri" }), { before: 12, after: 3 })
  const sideHead = (title: string) =>
    p(t(title, { size: 11, bold: true, color: teal, font: "Calibri" }), { before: 12, after: 3 })
  const job = (role: string, place: string, dates: string, points: string[]) =>
    p(t(role, { size: 11.5, bold: true, color: "#1f2937" }), { before: 6, after: 0 }) +
    p(t(`${place}  ·  ${dates}`, { size: 9.5, color: "#6b7280" }), { after: 2 }) +
    bullets(points, 10, "#374151")
  const main =
    head("Work experience") +
    job("[Job Title]", "[Company], [City]", "[Month Year] – Present", [
      "[Achievement with a measurable result]",
      "[Responsibility or project you owned]",
      "[Tools or methods you used]",
    ]) +
    job("[Job Title]", "[Company], [City]", "[Month Year] – [Month Year]", [
      "[Achievement with a measurable result]",
      "[Responsibility or project you owned]",
    ]) +
    head("Education") +
    p(t("[Degree]", { size: 11, bold: true, color: "#1f2937" }), { after: 0 }) +
    p(t("[University]  ·  [Year]", { size: 9.5, color: "#6b7280" }))
  const aside =
    sideHead("About me") +
    p(t("[Two sentences about you and what drives your work.]", { size: 9.5, color: "#374151" }), { line: 1.2 }) +
    sideHead("Skills") +
    p(t("[Skill one]<br/>[Skill two]<br/>[Skill three]<br/>[Skill four]", { size: 9.5, color: "#374151" }), {
      line: 1.5,
    }) +
    sideHead("Languages") +
    p(t("[Language] — native<br/>[Language] — fluent", { size: 9.5, color: "#374151" }), { line: 1.5 }) +
    sideHead("Certificates") +
    p(t("[Certificate], [Year]", { size: 9.5, color: "#374151" }))
  return (
    table([[banner]], { pad: "wide" }) +
    table([[cell(main, { width: 410 }), cell(aside, { width: WIDTH - 410, bg: "#f0fdfa" })]], { pad: "wide" })
  )
}

/* ------------------------------------------------------------------ Reports */

function reportExecutive() {
  const navy = "#12355b"
  const cover = table(
    [
      [
        cell(
          p(t("ANNUAL REPORT", { size: 10, bold: true, color: "#8fb8de", spacing: 3, font: "Calibri" }), {
            before: 24,
            after: 6,
          }) +
            p(t("[Report Title]", { size: 34, bold: true, color: "#ffffff", font: "Calibri" }), { after: 4 }) +
            p(
              t("[A one-line description of what this report covers]", { size: 13, color: "#d6e6f5", font: "Calibri" }),
              { after: 24 },
            ) +
            p(t("[Prepared by]  ·  [Department]  ·  [Month Year]", { size: 10, color: "#8fb8de", font: "Calibri" }), {
              after: 12,
            }),
          { width: WIDTH, bg: navy },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const h2 = (title: string) => `<h2>${t(title, { size: 16, bold: true, color: navy, font: "Calibri" })}</h2>`
  const body = (text: string) => p(t(text, { size: 10.5, color: "#2b2b2b", font: "Calibri" }), { line: 1.3, after: 8 })
  const findings = table(
    [
      [
        cell(p(t("Finding", { size: 10, bold: true, color: "#ffffff" })), { width: 150, bg: navy }),
        cell(p(t("What we saw", { size: 10, bold: true, color: "#ffffff" })), { width: 300, bg: navy }),
        cell(p(t("Impact", { size: 10, bold: true, color: "#ffffff" })), { width: WIDTH - 450, bg: navy }),
      ],
      ...[1, 2, 3].map((n) => [
        cell(p(t(`[Finding ${n}]`, { size: 10, bold: true, color: navy })), {
          width: 150,
          bg: n % 2 ? "#eef4fa" : "#ffffff",
        }),
        cell(p(t("[One sentence describing the result]", { size: 10, color: "#2b2b2b" })), {
          width: 300,
          bg: n % 2 ? "#eef4fa" : "#ffffff",
        }),
        cell(p(t("[High / Medium / Low]", { size: 10, color: "#2b2b2b" })), {
          width: WIDTH - 450,
          bg: n % 2 ? "#eef4fa" : "#ffffff",
        }),
      ]),
    ],
    { pad: "normal" },
  )
  const callout = table(
    [
      [
        cell(
          p(t("Recommendation", { size: 11, bold: true, color: navy }), { after: 2 }) +
            p(
              t("[State the one thing you want the reader to decide or do, and by when.]", {
                size: 10.5,
                color: "#2b2b2b",
              }),
            ),
          { width: WIDTH, bg: "#fff4d6", borders: "left", pen: rule("#e0a100", "3px") },
        ),
      ],
    ],
    { pad: "wide" },
  )
  return (
    cover +
    spacer(10) +
    h2("Executive summary") +
    body(
      "[Summarise the purpose of the report, the main result and what happens next in a short paragraph. Busy readers may read only this page.]",
    ) +
    h2("Key findings") +
    findings +
    spacer(4) +
    h2("Background") +
    body("[Explain the context: what prompted the work, who was involved and what period it covers.]") +
    h2("Analysis") +
    body(
      "[Present the detail behind the findings. Use headings for each topic so a table of contents can be built from them.]",
    ) +
    callout +
    spacer(4) +
    h2("Next steps") +
    bullets(["[Action, owner and date]", "[Action, owner and date]", "[Action, owner and date]"], 10.5, "#2b2b2b")
  )
}

function reportBrief() {
  const ink = "#1c1c1c"
  const accent = "#c2410c"
  const meta = table(
    [
      ["Prepared for", "[Client or team]"],
      ["Prepared by", "[Your name]"],
      ["Date", "[Month Day, Year]"],
      ["Status", "[Draft / Final]"],
    ].map(([label, value]) => [
      cell(p(t(label, { size: 9.5, bold: true, color: "#777777", font: "Arial" }), { before: 2, after: 2 }), {
        width: 130,
        borders: "bottom",
        pen: rule("#dddddd"),
      }),
      cell(p(t(value, { size: 10, color: ink, font: "Arial" }), { before: 2, after: 2 }), {
        width: WIDTH - 130,
        borders: "bottom",
        pen: rule("#dddddd"),
      }),
    ]),
    { pad: "narrow" },
  )
  const kpi = (value: string, label: string, width: number) =>
    cell(
      p(t(value, { size: 26, bold: true, color: accent, font: "Arial" }), { align: "center", before: 6, after: 0 }) +
        p(t(label, { size: 9, color: "#555555", font: "Arial" }), { align: "center", after: 6 }),
      { width, bg: "#fff7ed" },
    )
  const cardWidth = Math.floor(WIDTH / 3)
  const kpis = table(
    [
      [
        kpi("[00%]", "[Measure one]", cardWidth),
        kpi("[0.0x]", "[Measure two]", cardWidth),
        kpi("[000]", "[Measure three]", WIDTH - cardWidth * 2),
      ],
    ],
    {
      pad: "wide",
    },
  )
  const h2 = (title: string) => `<h2>${t(title, { size: 14, bold: true, color: ink, font: "Arial" })}</h2>`
  const body = (text: string) => p(t(text, { size: 10, color: "#333333", font: "Arial" }), { line: 1.35, after: 8 })
  return (
    p(t("BUSINESS BRIEF", { size: 9, bold: true, color: accent, spacing: 3, font: "Arial" }), { after: 2 }) +
    `<h1>${t("[Report Title]", { size: 28, bold: true, color: ink, font: "Arial" })}</h1>` +
    p(
      t("[One sentence that says what this brief is about and why it matters now.]", {
        size: 12,
        color: "#555555",
        font: "Arial",
      }),
      { after: 10 },
    ) +
    meta +
    spacer(8) +
    h2("At a glance") +
    kpis +
    spacer(4) +
    h2("Situation") +
    body("[Describe where things stand today. Keep it factual and short.]") +
    h2("Options") +
    bullets(
      ["[Option A and what it would take]", "[Option B and what it would take]", "[Option C and what it would take]"],
      10,
      "#333333",
    ) +
    h2("Recommendation") +
    body("[Say which option you recommend, why, and the first step.]")
  )
}

function reportResearch() {
  const ink = "#1a1a1a"
  const h2 = (title: string) => `<h2>${t(title, { size: 14, bold: true, color: ink, font: "Georgia" })}</h2>`
  const body = (text: string) => p(t(text, { size: 11, color: ink, font: "Georgia" }), { line: 1.5, after: 8 })
  return (
    p(t("[Institution or Department]", { size: 10, color: "#666666", font: "Georgia", spacing: 2 }), {
      align: "center",
      before: 20,
      after: 18,
    }) +
    `<h1 style="text-align: center">${t("[Title of the Study]", { size: 24, bold: true, color: ink, font: "Georgia" })}</h1>` +
    p(t("[Author One], [Author Two]", { size: 12, color: ink, font: "Georgia" }), { align: "center", after: 2 }) +
    p(t("[Affiliation]  ·  [Month Year]", { size: 10, italic: true, color: "#666666", font: "Georgia" }), {
      align: "center",
      after: 16,
    }) +
    table(
      [
        [
          cell(
            p(t("Abstract", { size: 10.5, bold: true, color: ink, font: "Georgia" }), { after: 2 }) +
              p(
                t("[Summarise the question, method, main result and conclusion in about 150 words.]", {
                  size: 10,
                  italic: true,
                  color: "#333333",
                  font: "Georgia",
                }),
                {
                  line: 1.4,
                },
              ),
            { width: WIDTH, bg: "#f4f1ea" },
          ),
        ],
      ],
      { pad: "wide" },
    ) +
    spacer(6) +
    h2("1. Introduction") +
    body("[State the problem, what is already known and what this report adds.]") +
    h2("2. Method") +
    body("[Describe what was done in enough detail for someone else to repeat it.]") +
    h2("3. Results") +
    body("[Report what was found. Refer to each figure and table by number.]") +
    h2("4. Discussion") +
    body("[Interpret the results, note the limits and say what should happen next.]") +
    h2("References") +
    p(t("[1] [Author. Title. Journal, Year.]", { size: 10, color: "#333333", font: "Georgia" }), { after: 2 }) +
    p(t("[2] [Author. Title. Journal, Year.]", { size: 10, color: "#333333", font: "Georgia" }), { after: 2 })
  )
}

/* ------------------------------------------------------------------ Invoices */

type Line = [string, string, string, string]

const LINES: Line[] = [
  ["[Service or product]", "1", "$0.00", "$0.00"],
  ["[Service or product]", "1", "$0.00", "$0.00"],
  ["[Service or product]", "1", "$0.00", "$0.00"],
]

function invoiceClassic() {
  const ink = "#1c1c1c"
  const head = table(
    [
      [
        cell(
          p(t("[Your Company]", { size: 18, bold: true, color: ink, font: "Georgia" }), { before: 0, after: 2 }) +
            p(
              t("[Street Address]<br/>[City, State ZIP]<br/>[email@example.com] · [+00 000 000 000]", {
                size: 9.5,
                color: "#555555",
                font: "Georgia",
              }),
              { line: 1.4 },
            ),
          { width: 360 },
        ),
        cell(
          p(t("INVOICE", { size: 28, color: ink, font: "Georgia", spacing: 3 }), { align: "right", after: 2 }) +
            p(
              t("No. [0001]<br/>Date: [Month Day, Year]<br/>Due: [Month Day, Year]", {
                size: 9.5,
                color: "#555555",
                font: "Georgia",
              }),
              { align: "right", line: 1.4 },
            ),
          { width: WIDTH - 360 },
        ),
      ],
    ],
    { pad: "normal" },
  )
  const billTo = table(
    [
      [
        cell(
          p(t("BILL TO", { size: 9, bold: true, color: "#777777", spacing: 2, font: "Georgia" }), { after: 2 }) +
            p(t("[Client Name]<br/>[Client Company]<br/>[Client Address]", { size: 10, color: ink, font: "Georgia" }), {
              line: 1.4,
            }),
          { width: 312, borders: "top", pen: rule(ink, "2px") },
        ),
        cell(
          p(t("PAYMENT", { size: 9, bold: true, color: "#777777", spacing: 2, font: "Georgia" }), { after: 2 }) +
            p(
              t("Bank: [Bank name]<br/>Account: [Account number]<br/>Reference: [Invoice number]", {
                size: 10,
                color: ink,
                font: "Georgia",
              }),
              { line: 1.4 },
            ),
          { width: WIDTH - 312, borders: "top", pen: rule(ink, "2px") },
        ),
      ],
    ],
    { pad: "normal" },
  )
  const th = (text: string, width: number, align: "left" | "right" = "left") =>
    cell(
      p(t(text, { size: 9.5, bold: true, color: ink, spacing: 1, font: "Georgia" }), { align, before: 2, after: 2 }),
      {
        width,
        borders: "top bottom",
        pen: rule(ink, "1px"),
      },
    )
  const td = (text: string, width: number, align: "left" | "right" = "left") =>
    cell(p(t(text, { size: 10, color: ink, font: "Georgia" }), { align, before: 3, after: 3 }), {
      width,
      borders: "bottom",
      pen: rule("#dddddd"),
    })
  const items = table(
    [
      [th("DESCRIPTION", 330), th("QTY", 60, "right"), th("PRICE", 110, "right"), th("AMOUNT", WIDTH - 500, "right")],
      ...LINES.map(([name, qty, price, amount]) => [
        td(name, 330),
        td(qty, 60, "right"),
        td(price, 110, "right"),
        td(amount, WIDTH - 500, "right"),
      ]),
    ],
    { pad: "normal" },
  )
  const sum = (label: string, value: string, strong = false) => [
    cell(p(""), { width: 330 }),
    cell(p(""), { width: 60 }),
    cell(
      p(t(label, { size: 10, bold: strong, color: ink, font: "Georgia" }), { align: "right", before: 2, after: 2 }),
      {
        width: 110,
        borders: strong ? "top" : undefined,
        pen: strong ? rule(ink, "1px") : undefined,
      },
    ),
    cell(
      p(t(value, { size: strong ? 12 : 10, bold: strong, color: ink, font: "Georgia" }), {
        align: "right",
        before: 2,
        after: 2,
      }),
      {
        width: WIDTH - 500,
        borders: strong ? "top" : undefined,
        pen: strong ? rule(ink, "1px") : undefined,
      },
    ),
  ]
  const totals = table([sum("Subtotal", "$0.00"), sum("Tax ([0]%)", "$0.00"), sum("TOTAL", "$0.00", true)], {
    pad: "narrow",
  })
  return (
    head +
    spacer(8) +
    billTo +
    spacer(8) +
    items +
    totals +
    spacer(10) +
    p(t("Notes", { size: 10, bold: true, color: ink, font: "Georgia" }), { after: 2 }) +
    p(t("[Payment terms, thank-you message or late-fee policy.]", { size: 9.5, color: "#555555", font: "Georgia" }))
  )
}

function invoiceModern() {
  const green = "#15803d"
  const mint = "#ecfdf3"
  const banner = table(
    [
      [
        cell(
          p(t("INVOICE", { size: 30, bold: true, color: "#ffffff", font: "Calibri", spacing: 2 }), {
            before: 8,
            after: 0,
          }) + p(t("[Your Company]", { size: 12, color: "#d1fae5", font: "Calibri" }), { after: 8 }),
          { width: 380, bg: green, valign: "middle" },
        ),
        cell(
          p(
            t("Invoice no. [0001]<br/>Issued [Month Day, Year]<br/>Due [Month Day, Year]", {
              size: 10,
              color: "#ffffff",
              font: "Calibri",
            }),
            { align: "right", line: 1.4, before: 8 },
          ),
          { width: WIDTH - 380, bg: green, valign: "middle" },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const card = (title: string, body: string, width: number) =>
    cell(
      p(t(title, { size: 9, bold: true, color: green, spacing: 2, font: "Calibri" }), { after: 2 }) +
        p(t(body, { size: 10, color: "#1f2937", font: "Calibri" }), { line: 1.4 }),
      {
        width,
        bg: mint,
      },
    )
  const parties = table(
    [
      [
        card("FROM", "[Your Company]<br/>[Street Address]<br/>[City, State ZIP]", 312),
        card("BILLED TO", "[Client Name]<br/>[Client Company]<br/>[Client Address]", WIDTH - 312),
      ],
    ],
    { pad: "wide" },
  )
  const th = (text: string, width: number, align: "left" | "right" = "left") =>
    cell(p(t(text, { size: 10, bold: true, color: "#ffffff", font: "Calibri" }), { align, before: 2, after: 2 }), {
      width,
      bg: "#166534",
    })
  const td = (text: string, width: number, row: number, align: "left" | "right" = "left") =>
    cell(p(t(text, { size: 10, color: "#1f2937", font: "Calibri" }), { align, before: 3, after: 3 }), {
      width,
      bg: row % 2 ? "#f3f4f6" : "#ffffff",
    })
  const items = table(
    [
      [th("Description", 330), th("Qty", 60, "right"), th("Price", 110, "right"), th("Amount", WIDTH - 500, "right")],
      ...LINES.map(([name, qty, price, amount], index) => [
        td(name, 330, index),
        td(qty, 60, index, "right"),
        td(price, 110, index, "right"),
        td(amount, WIDTH - 500, index, "right"),
      ]),
    ],
    { pad: "normal" },
  )
  const totals = table(
    [
      [
        cell(
          p(t("[Thank you for your business.]", { size: 10, italic: true, color: "#4b5563", font: "Calibri" }), {
            before: 6,
          }),
          { width: 330 },
        ),
        cell(
          p(t("Subtotal<br/>Tax ([0]%)", { size: 10, color: "#1f2937", font: "Calibri" }), {
            align: "right",
            line: 1.5,
            before: 4,
          }),
          { width: 170 },
        ),
        cell(
          p(t("$0.00<br/>$0.00", { size: 10, color: "#1f2937", font: "Calibri" }), {
            align: "right",
            line: 1.5,
            before: 4,
          }),
          { width: WIDTH - 500 },
        ),
      ],
      [
        cell(p(""), { width: 330 }),
        cell(
          p(t("TOTAL DUE", { size: 12, bold: true, color: "#ffffff", font: "Calibri" }), {
            align: "right",
            before: 3,
            after: 3,
          }),
          { width: 170, bg: green },
        ),
        cell(
          p(t("$0.00", { size: 12, bold: true, color: "#ffffff", font: "Calibri" }), {
            align: "right",
            before: 3,
            after: 3,
          }),
          { width: WIDTH - 500, bg: green },
        ),
      ],
    ],
    { pad: "narrow" },
  )
  return (
    banner +
    spacer(8) +
    parties +
    spacer(8) +
    items +
    totals +
    spacer(10) +
    p(t("Payment details", { size: 10, bold: true, color: green, font: "Calibri" }), { after: 2 }) +
    p(
      t("Bank: [Bank name] · Account: [Account number] · Reference: [Invoice number]", {
        size: 9.5,
        color: "#4b5563",
        font: "Calibri",
      }),
    )
  )
}

function invoiceMinimal() {
  const ink = "#111111"
  const grey = "#8a8a8a"
  const top = table(
    [
      [
        cell(p(t("Invoice", { size: 34, color: ink, font: "Arial" }), { before: 0, after: 0 }), { width: 312 }),
        cell(
          p(
            t("[Your Company]<br/>[email@example.com]<br/>[+00 000 000 000]", {
              size: 9.5,
              color: grey,
              font: "Arial",
            }),
            { align: "right", line: 1.5 },
          ),
          { width: WIDTH - 312 },
        ),
      ],
    ],
    { pad: "narrow" },
  )
  const info = (label: string, value: string, width: number) =>
    cell(
      p(t(label, { size: 8.5, color: grey, spacing: 1.5, font: "Arial" }), { after: 1 }) +
        p(t(value, { size: 10, color: ink, font: "Arial" }), { line: 1.4 }),
      { width },
    )
  const details = table(
    [
      [
        info("NUMBER", "[0001]", 120),
        info("ISSUED", "[Month Day, Year]", 140),
        info("DUE", "[Month Day, Year]", 140),
        info("BILLED TO", "[Client Name]<br/>[Client Address]", WIDTH - 400),
      ],
    ],
    { pad: "narrow" },
  )
  const th = (text: string, width: number, align: "left" | "right" = "left") =>
    cell(p(t(text, { size: 8.5, color: grey, spacing: 1.5, font: "Arial" }), { align, before: 2, after: 2 }), {
      width,
      borders: "bottom",
      pen: rule(ink),
    })
  const td = (text: string, width: number, align: "left" | "right" = "left") =>
    cell(p(t(text, { size: 10, color: ink, font: "Arial" }), { align, before: 5, after: 5 }), { width })
  const items = table(
    [
      [th("DESCRIPTION", 330), th("QTY", 60, "right"), th("PRICE", 110, "right"), th("AMOUNT", WIDTH - 500, "right")],
      ...LINES.map(([name, qty, price, amount]) => [
        td(name, 330),
        td(qty, 60, "right"),
        td(price, 110, "right"),
        td(amount, WIDTH - 500, "right"),
      ]),
    ],
    { pad: "normal" },
  )
  const total = table(
    [
      [
        cell(p(""), { width: 330 }),
        cell(p(t("Total due", { size: 10, color: grey, font: "Arial" }), { align: "right", before: 8 }), {
          width: 170,
          borders: "top",
          pen: rule(ink),
        }),
        cell(p(t("$0.00", { size: 18, bold: true, color: ink, font: "Arial" }), { align: "right", before: 4 }), {
          width: WIDTH - 500,
          borders: "top",
          pen: rule(ink),
        }),
      ],
    ],
    { pad: "narrow" },
  )
  return (
    top +
    spacer(14) +
    details +
    spacer(14) +
    items +
    total +
    spacer(20) +
    p(t("Payment", { size: 8.5, color: grey, spacing: 1.5, font: "Arial" }), { after: 2 }) +
    p(
      t(
        "[Bank name] · [Account number] · Reference [Invoice number]<br/>[Payment terms, for example: payable within 14 days.]",
        { size: 9.5, color: ink, font: "Arial" },
      ),
      {
        line: 1.5,
      },
    )
  )
}

/* ------------------------------------------------------------------ Flyers */

function flyerEvent() {
  const purple = "#4c1d95"
  const hot = "#f59e0b"
  const banner = table(
    [
      [
        cell(
          p(t("YOU ARE INVITED", { size: 12, bold: true, color: hot, spacing: 4, font: "Arial" }), {
            align: "center",
            before: 28,
            after: 6,
          }) +
            p(t("[EVENT NAME]", { size: 44, bold: true, color: "#ffffff", font: "Arial" }), {
              align: "center",
              after: 4,
              line: 1,
            }) +
            p(
              t("[A short line that says what makes this event worth coming to]", {
                size: 13,
                color: "#ddd6fe",
                font: "Arial",
              }),
              { align: "center", after: 28 },
            ),
          { width: WIDTH, bg: purple, valign: "middle" },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const info = (label: string, line1: string, line2: string, width: number, bg: string) =>
    cell(
      p(t(label, { size: 10, bold: true, color: purple, spacing: 3, font: "Arial" }), {
        align: "center",
        before: 10,
        after: 2,
      }) +
        p(t(line1, { size: 16, bold: true, color: "#1f1235", font: "Arial" }), { align: "center", after: 0 }) +
        p(t(line2, { size: 11, color: "#4b5563", font: "Arial" }), { align: "center", after: 10 }),
      { width, bg },
    )
  const third = Math.floor(WIDTH / 3)
  const when = table(
    [
      [
        info("WHEN", "[Saturday, June 14]", "[6:00 PM – 10:00 PM]", third, "#ede9fe"),
        info("WHERE", "[Venue Name]", "[Street, City]", third, "#fef3c7"),
        info("COST", "[Free entry]", "[RSVP by June 7]", WIDTH - third * 2, "#ede9fe"),
      ],
    ],
    { pad: "wide" },
  )
  return (
    banner +
    spacer(10) +
    when +
    spacer(12) +
    p(t("What to expect", { size: 18, bold: true, color: purple, font: "Arial" }), { align: "center", after: 6 }) +
    p(
      t("[Two or three sentences about the event: who is coming, what will happen and why people should join.]", {
        size: 12,
        color: "#374151",
        font: "Arial",
      }),
      {
        align: "center",
        line: 1.5,
        after: 12,
      },
    ) +
    table(
      [
        [
          cell(
            p(t("[Highlight one]", { size: 12, bold: true, color: purple, font: "Arial" }), { align: "center" }) +
              p(t("[Short detail]", { size: 10, color: "#4b5563", font: "Arial" }), { align: "center" }),
            { width: third },
          ),
          cell(
            p(t("[Highlight two]", { size: 12, bold: true, color: purple, font: "Arial" }), { align: "center" }) +
              p(t("[Short detail]", { size: 10, color: "#4b5563", font: "Arial" }), { align: "center" }),
            { width: third },
          ),
          cell(
            p(t("[Highlight three]", { size: 12, bold: true, color: purple, font: "Arial" }), { align: "center" }) +
              p(t("[Short detail]", { size: 10, color: "#4b5563", font: "Arial" }), { align: "center" }),
            { width: WIDTH - third * 2 },
          ),
        ],
      ],
      { pad: "wide" },
    ) +
    spacer(12) +
    table(
      [
        [
          cell(
            p(
              t("RSVP  ·  [email@example.com]  ·  [+00 000 000 000]", {
                size: 12,
                bold: true,
                color: "#1f1235",
                font: "Arial",
              }),
              { align: "center", before: 6, after: 6 },
            ),
            { width: WIDTH, bg: hot },
          ),
        ],
      ],
      { pad: "wide" },
    )
  )
}

function flyerSale() {
  const red = "#dc2626"
  const yellow = "#fde047"
  const top = table(
    [
      [
        cell(
          p(t("[YOUR STORE]", { size: 14, bold: true, color: "#ffffff", spacing: 4, font: "Arial" }), {
            align: "center",
            before: 8,
            after: 8,
          }),
          { width: WIDTH, bg: "#111111" },
        ),
      ],
      [
        cell(
          p(t("BIG", { size: 40, bold: true, color: "#ffffff", font: "Arial" }), {
            align: "center",
            before: 14,
            after: 0,
            line: 1,
          }) +
            p(t("SALE", { size: 80, bold: true, color: yellow, font: "Arial" }), {
              align: "center",
              after: 0,
              line: 1,
            }) +
            p(t("UP TO 50% OFF", { size: 26, bold: true, color: "#ffffff", font: "Arial", spacing: 2 }), {
              align: "center",
              after: 14,
            }),
          { width: WIDTH, bg: red, valign: "middle" },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const deal = (what: string, price: string, was: string, width: number) =>
    cell(
      p(t(what, { size: 12, bold: true, color: "#111111", font: "Arial" }), { align: "center", before: 8, after: 2 }) +
        p(t(price, { size: 24, bold: true, color: red, font: "Arial" }), { align: "center", after: 0 }) +
        p(t(was, { size: 10, color: "#6b7280", font: "Arial" }), { align: "center", after: 8 }),
      { width, bg: "#fef9c3" },
    )
  const third = Math.floor(WIDTH / 3)
  return (
    top +
    spacer(10) +
    p(t("THIS WEEKEND ONLY", { size: 16, bold: true, color: "#111111", spacing: 3, font: "Arial" }), {
      align: "center",
      after: 2,
    }) +
    p(
      t("[Friday, June 13 – Sunday, June 15]  ·  [10:00 AM – 8:00 PM]", { size: 12, color: "#374151", font: "Arial" }),
      { align: "center", after: 12 },
    ) +
    table(
      [
        [
          deal("[Product one]", "$[00]", "was $[00]", third),
          deal("[Product two]", "$[00]", "was $[00]", third),
          deal("[Product three]", "$[00]", "was $[00]", WIDTH - third * 2),
        ],
      ],
      { pad: "wide" },
    ) +
    spacer(10) +
    p(
      t("[A line about free delivery, a bonus gift or a loyalty offer.]", {
        size: 12,
        color: "#374151",
        font: "Arial",
      }),
      { align: "center", after: 10 },
    ) +
    table(
      [
        [
          cell(
            p(
              t("[Street Address, City]  ·  [www.yourstore.com]  ·  [+00 000 000 000]", {
                size: 11,
                bold: true,
                color: "#ffffff",
                font: "Arial",
              }),
              { align: "center", before: 6, after: 6 },
            ),
            { width: WIDTH, bg: "#111111" },
          ),
        ],
      ],
      { pad: "wide" },
    )
  )
}

function flyerOpenHouse() {
  const cream = "#faf6ee"
  const gold = "#a16207"
  const ink = "#2b2118"
  const frame = (inner: string) =>
    table([[cell(inner, { width: WIDTH, bg: cream, borders: "top bottom left right", pen: rule(gold, "3px") })]], {
      pad: "wide",
    })
  return frame(
    p(t("[SPACE FOR LOGO]", { size: 9, color: "#a8a29e", spacing: 2, font: "Georgia" }), {
      align: "center",
      before: 14,
      after: 10,
    }) +
      p(t("Please join us for an", { size: 14, italic: true, color: gold, font: "Georgia" }), {
        align: "center",
        after: 2,
      }) +
      p(t("OPEN HOUSE", { size: 46, color: ink, font: "Georgia", spacing: 4 }), {
        align: "center",
        after: 2,
        line: 1,
      }) +
      p(t("◆  ◆  ◆", { size: 12, color: gold }), { align: "center", after: 12 }) +
      p(t("[Name of the school, studio or business]", { size: 18, color: ink, font: "Georgia" }), {
        align: "center",
        after: 14,
      }) +
      p(t("[Saturday, September 20]", { size: 20, bold: true, color: ink, font: "Georgia" }), {
        align: "center",
        after: 0,
      }) +
      p(t("[1:00 PM – 4:00 PM]", { size: 14, color: gold, font: "Georgia" }), { align: "center", after: 14 }) +
      p(t("[Building name]<br/>[Street Address, City]", { size: 13, color: ink, font: "Georgia" }), {
        align: "center",
        line: 1.5,
        after: 14,
      }) +
      p(
        t(
          "Tour the space, meet the team, and enjoy light refreshments. [Add one more sentence about what visitors will see or win.]",
          { size: 12, color: "#57493b", font: "Georgia" },
        ),
        {
          align: "center",
          line: 1.6,
          after: 16,
        },
      ) +
      p(
        t("[email@example.com]  ·  [+00 000 000 000]  ·  [www.example.com]", {
          size: 11,
          color: gold,
          font: "Georgia",
        }),
        { align: "center", after: 14 },
      ),
  )
}

/* ------------------------------------------------------------------ Newsletters */

function newsletterCompany() {
  const blue = "#0b5cad"
  const mast = table(
    [
      [
        cell(
          p(t("[Company Newsletter]", { size: 30, bold: true, color: "#ffffff", font: "Calibri" }), {
            before: 8,
            after: 0,
          }) + p(t("News, wins and what is coming up", { size: 11, color: "#cfe3f7", font: "Calibri" }), { after: 8 }),
          { width: 440, bg: blue, valign: "middle" },
        ),
        cell(
          p(t("Issue [12]<br/>[Month Year]", { size: 11, color: "#ffffff", font: "Calibri" }), {
            align: "right",
            line: 1.5,
            before: 10,
          }),
          {
            width: WIDTH - 440,
            bg: blue,
            valign: "middle",
          },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const headline = (text: string) =>
    p(t(text, { size: 15, bold: true, color: blue, font: "Calibri" }), { before: 4, after: 3 })
  const body = (text: string) => p(t(text, { size: 10, color: "#2b2b2b", font: "Calibri" }), { line: 1.35, after: 8 })
  const main =
    headline("[Lead story headline]") +
    body(
      "[Open with the most important news in one or two sentences. Then give the detail readers need: what happened, who is involved and what it means for them.]",
    ) +
    body("[A second paragraph with a quote or a figure helps the story stand out.]") +
    headline("[Second story headline]") +
    body("[Two or three sentences about a project, a customer or a team success.]")
  const aside =
    p(t("In this issue", { size: 12, bold: true, color: blue, font: "Calibri" }), { before: 4, after: 3 }) +
    p(
      t("[Lead story] ........ 1<br/>[Second story] ........ 1<br/>[Spotlight] ........ 2<br/>[Dates] ........ 2", {
        size: 9.5,
        color: "#2b2b2b",
        font: "Calibri",
      }),
      { line: 1.6, after: 10 },
    ) +
    p(t("Team spotlight", { size: 12, bold: true, color: blue, font: "Calibri" }), { after: 3 }) +
    p(
      t("[Name], [Role]<br/>[One line on what they do and a fun fact.]", {
        size: 9.5,
        color: "#2b2b2b",
        font: "Calibri",
      }),
      { line: 1.4, after: 10 },
    ) +
    p(t("Dates to remember", { size: 12, bold: true, color: blue, font: "Calibri" }), { after: 3 }) +
    p(
      t("[Date] — [Event]<br/>[Date] — [Event]<br/>[Date] — [Event]", { size: 9.5, color: "#2b2b2b", font: "Calibri" }),
      { line: 1.5 },
    )
  return (
    mast +
    spacer(6) +
    table([[cell(main, { width: 410 }), cell(aside, { width: WIDTH - 410, bg: "#eef5fc" })]], { pad: "wide" }) +
    spacer(4) +
    p(
      t("[Company Name]  ·  [Address]  ·  [email@example.com]  ·  Unsubscribe: [link]", {
        size: 8.5,
        color: "#6b7280",
        font: "Calibri",
      }),
      { align: "center" },
    )
  )
}

function newsletterCommunity() {
  const orange = "#ea580c"
  const green = "#16a34a"
  const sky = "#0284c7"
  const mast = table(
    [
      [
        cell(
          p(t("The [School / Club] Times", { size: 32, bold: true, color: "#ffffff", font: "Trebuchet MS" }), {
            align: "center",
            before: 8,
            after: 0,
          }) +
            p(t("[Month Year]  ·  Volume [1], Issue [3]", { size: 11, color: "#ffedd5", font: "Trebuchet MS" }), {
              align: "center",
              after: 8,
            }),
          { width: WIDTH, bg: orange },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const card = (title: string, body: string, color: string, tint: string, width: number) =>
    cell(
      p(t(title, { size: 13, bold: true, color, font: "Trebuchet MS" }), { before: 2, after: 3 }) +
        p(t(body, { size: 10, color: "#334155", font: "Trebuchet MS" }), { line: 1.4 }),
      { width, bg: tint, borders: "top", pen: rule(color, "4px") },
    )
  const half = Math.floor(WIDTH / 2)
  const cards = table(
    [
      [
        card(
          "[Welcome note]",
          "[A friendly opening from the editor or the head of the group. Say what is in this issue.]",
          orange,
          "#fff7ed",
          half,
        ),
        card(
          "[News & updates]",
          "[Share news, new members, thanks and recent results in a few short lines.]",
          green,
          "#f0fdf4",
          WIDTH - half,
        ),
      ],
    ],
    { pad: "wide" },
  )
  const row = (date: string, what: string, where: string, bg: string) => [
    cell(p(t(date, { size: 10, bold: true, color: sky, font: "Trebuchet MS" })), { width: 130, bg }),
    cell(p(t(what, { size: 10, color: "#334155", font: "Trebuchet MS" })), { width: 280, bg }),
    cell(p(t(where, { size: 10, color: "#334155", font: "Trebuchet MS" })), { width: WIDTH - 410, bg }),
  ]
  const calendar = table(
    [
      [
        cell(p(t("Date", { size: 10, bold: true, color: "#ffffff", font: "Trebuchet MS" })), { width: 130, bg: sky }),
        cell(p(t("Event", { size: 10, bold: true, color: "#ffffff", font: "Trebuchet MS" })), { width: 280, bg: sky }),
        cell(p(t("Where", { size: 10, bold: true, color: "#ffffff", font: "Trebuchet MS" })), {
          width: WIDTH - 410,
          bg: sky,
        }),
      ],
      row("[Mon, Jun 2]", "[Event name]", "[Place]", "#f0f9ff"),
      row("[Wed, Jun 11]", "[Event name]", "[Place]", "#ffffff"),
      row("[Fri, Jun 20]", "[Event name]", "[Place]", "#f0f9ff"),
    ],
    { pad: "normal" },
  )
  return (
    mast +
    spacer(8) +
    cards +
    spacer(8) +
    p(t("Coming up", { size: 16, bold: true, color: sky, font: "Trebuchet MS" }), { after: 4 }) +
    calendar +
    spacer(8) +
    p(t("Member of the month", { size: 16, bold: true, color: green, font: "Trebuchet MS" }), { after: 3 }) +
    p(
      t("[Name] — [A sentence or two about what they did and why we are grateful.]", {
        size: 10.5,
        color: "#334155",
        font: "Trebuchet MS",
      }),
      { line: 1.4, after: 8 },
    ) +
    p(
      t("Questions or news for the next issue? Write to [email@example.com].", {
        size: 10,
        italic: true,
        color: "#64748b",
        font: "Trebuchet MS",
      }),
      { align: "center" },
    )
  )
}

function newsletterEditorial() {
  const ink = "#1f1f1f"
  const red = "#b91c1c"
  const mast =
    p(t("[THE JOURNAL]", { size: 34, color: ink, font: "Georgia", spacing: 6 }), {
      align: "center",
      before: 4,
      after: 2,
    }) +
    table(
      [
        [
          cell(p(t("Issue [No. 12]", { size: 9.5, color: "#555555", font: "Georgia" }), { before: 3, after: 3 }), {
            width: 208,
            borders: "top bottom",
            pen: rule(ink, "1px"),
          }),
          cell(
            p(t("[Month Year]", { size: 9.5, color: "#555555", font: "Georgia" }), {
              align: "center",
              before: 3,
              after: 3,
            }),
            { width: 208, borders: "top bottom", pen: rule(ink, "1px") },
          ),
          cell(
            p(t("[www.example.com]", { size: 9.5, color: "#555555", font: "Georgia" }), {
              align: "right",
              before: 3,
              after: 3,
            }),
            { width: WIDTH - 416, borders: "top bottom", pen: rule(ink, "1px") },
          ),
        ],
      ],
      { pad: "narrow" },
    )
  const body = (text: string) => p(t(text, { size: 10.5, color: ink, font: "Georgia" }), { line: 1.5, after: 8 })
  const quote = table(
    [
      [
        cell(
          p(
            t("“[A sentence from the article that is worth pausing on.]”", {
              size: 15,
              italic: true,
              color: red,
              font: "Georgia",
            }),
            { line: 1.3, before: 4, after: 4 },
          ),
          { width: WIDTH, borders: "left", pen: rule(red, "3px") },
        ),
      ],
    ],
    { pad: "wide" },
  )
  const col = (kicker: string, title: string, text: string, width: number) =>
    cell(
      p(t(kicker, { size: 8.5, bold: true, color: red, spacing: 2, font: "Georgia" }), { before: 4, after: 2 }) +
        p(t(title, { size: 14, bold: true, color: ink, font: "Georgia" }), { after: 3 }) +
        p(t(text, { size: 10, color: "#333333", font: "Georgia" }), { line: 1.45 }),
      { width },
    )
  const half = Math.floor(WIDTH / 2)
  return (
    mast +
    spacer(8) +
    p(t("FEATURE", { size: 9, bold: true, color: red, spacing: 3, font: "Georgia" }), { after: 2 }) +
    `<h1>${t("[Headline of the main article goes here]", { size: 26, color: ink, font: "Georgia" })}</h1>` +
    p(t("By [Author Name]", { size: 10, italic: true, color: "#666666", font: "Georgia" }), { after: 8 }) +
    body(
      "[Begin the article here. A strong first paragraph states the point and invites the reader to continue. Keep paragraphs short, and use the quote below to break up long stretches of text.]",
    ) +
    quote +
    spacer(4) +
    body("[Continue the article. Add detail, an example or a short story that supports the main point.]") +
    table(
      [
        [
          col(
            "ESSAY",
            "[Second article title]",
            "[Two or three sentences introducing a shorter piece, with a pointer to where readers can find more.]",
            half,
          ),
          col(
            "NOTES",
            "[Third article title]",
            "[Two or three sentences introducing another shorter piece for readers who skim.]",
            WIDTH - half,
          ),
        ],
      ],
      { pad: "wide" },
    ) +
    spacer(4) +
    p(
      t("Thank you for reading. Forward this to a friend, or write back at [email@example.com].", {
        size: 9.5,
        italic: true,
        color: "#666666",
        font: "Georgia",
      }),
      { align: "center" },
    )
  )
}

/* ------------------------------------------------------------------ Gallery */

export const PRO_TEMPLATES: DocumentTemplate[] = [
  {
    id: "resume-sidebar",
    title: "Résumé — Modern sidebar",
    category: "personal",
    description: "Dark sidebar for contact and skills, experience on the right.",
    preview: "live",
    html: resumeSidebar(),
  },
  {
    id: "resume-classic",
    title: "Résumé — Classic",
    category: "personal",
    description: "Single-column serif résumé with ruled headings.",
    preview: "live",
    html: resumeClassic(),
  },
  {
    id: "resume-banner",
    title: "Résumé — Teal banner",
    category: "personal",
    description: "Full-width name banner with a tinted side column.",
    preview: "live",
    html: resumeBanner(),
  },
  {
    id: "report-executive",
    title: "Report — Executive",
    category: "reports",
    description: "Cover band, summary, findings table and a recommendation box.",
    preview: "live",
    html: reportExecutive(),
  },
  {
    id: "report-brief",
    title: "Report — Business brief",
    category: "reports",
    description: "Short brief with details table and three headline figures.",
    preview: "live",
    html: reportBrief(),
  },
  {
    id: "report-research",
    title: "Report — Research paper",
    category: "reports",
    description: "Serif paper with abstract, sections and references.",
    preview: "live",
    html: reportResearch(),
  },
  {
    id: "invoice-classic",
    title: "Invoice — Classic",
    category: "business",
    description: "Ruled serif invoice with bill-to, items and totals.",
    preview: "live",
    html: invoiceClassic(),
  },
  {
    id: "invoice-modern",
    title: "Invoice — Green modern",
    category: "business",
    description: "Colour banner, banded items and a highlighted total.",
    preview: "live",
    html: invoiceModern(),
  },
  {
    id: "invoice-minimal",
    title: "Invoice — Minimal",
    category: "business",
    description: "Clean black and grey layout with a large total.",
    preview: "live",
    html: invoiceMinimal(),
  },
  {
    id: "flyer-event",
    title: "Flyer — Event invitation",
    category: "flyers",
    description: "Purple banner with when, where and cost boxes.",
    preview: "live",
    html: flyerEvent(),
  },
  {
    id: "flyer-sale",
    title: "Flyer — Big sale",
    category: "flyers",
    description: "Bold red promotion with three price boxes.",
    preview: "live",
    html: flyerSale(),
  },
  {
    id: "flyer-open-house",
    title: "Flyer — Open house",
    category: "flyers",
    description: "Framed cream invitation set in serif type.",
    preview: "live",
    html: flyerOpenHouse(),
  },
  {
    id: "newsletter-company",
    title: "Newsletter — Company",
    category: "newsletters",
    description: "Blue masthead, lead stories and a side column of dates.",
    preview: "live",
    html: newsletterCompany(),
  },
  {
    id: "newsletter-community",
    title: "Newsletter — Community",
    category: "newsletters",
    description: "Colourful school or club newsletter with an events table.",
    preview: "live",
    html: newsletterCommunity(),
  },
  {
    id: "newsletter-editorial",
    title: "Newsletter — Editorial",
    category: "newsletters",
    description: "Serif masthead, feature article and a pull quote.",
    preview: "live",
    html: newsletterEditorial(),
  },
]
