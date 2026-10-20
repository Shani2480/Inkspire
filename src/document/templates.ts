export type DocumentTemplate = {
  id: string
  title: string
  category:
    | "all"
    | "business"
    | "personal"
    | "reports"
    | "letters"
    | "cards"
    | "flyers"
    | "newsletters"
    | "education"
    | "holiday"
  description: string
  /** "live" draws the template itself, scaled down. */
  preview: "blank" | "handbook" | "letter" | "resume" | "report" | "memo" | "live"
  html: string
}

import { PRO_TEMPLATES } from "@/document/templates-pro"

const blank = '<p style="text-align: left;"></p>'

const letterHtml = `
<p>[Your Name]<br/>[Your Address]<br/>[City, State ZIP]<br/>[Email] · [Phone]</p>
<p>[Date]</p>
<p>[Recipient Name]<br/>[Company]<br/>[Address]</p>
<p>Dear [Recipient Name],</p>
<p>I am writing to [purpose of letter]. Please find the details below and let me know if you need anything further.</p>
<p>Sincerely,<br/><br/>[Your Name]</p>
`.trim()

const reportHtml = `
<h1>Status Report</h1>
<p><strong>Project:</strong> [Project Name]<br/><strong>Week of:</strong> [Date]</p>
<h2>Highlights</h2>
<ul>
<li>[Highlight]</li>
<li>[Highlight]</li>
</ul>
<h2>Risks</h2>
<ul>
<li>[Risk] — mitigation: [Plan]</li>
</ul>
<h2>Next week</h2>
<ul>
<li>[Next step]</li>
</ul>
`.trim()

const tocHtml = `<h1>Document title</h1><h2>Section one</h2><p></p><h2>Section two</h2><p></p>`

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  ...PRO_TEMPLATES,
  {
    id: "blank",
    title: "Blank document",
    category: "all",
    description: "Start from a clean page.",
    preview: "blank",
    html: blank,
  },
  {
    id: "handbook",
    title: "Studio handbook (sample)",
    category: "business",
    description: "Sample studio guide with sections and a table.",
    preview: "handbook",
    html: `
<h1>Studio Handbook</h1>
<p>Welcome to the studio. This sample handbook outlines working agreements, project stages, and delivery standards.</p>
<h2>Working hours</h2>
<p>Core collaboration hours are Monday–Friday, 10:00–16:00. Async updates are welcome outside that window.</p>
<h2>Delivery checklist</h2>
<table>
<tbody>
<tr><th>Stage</th><th>Owner</th><th>Status</th></tr>
<tr><td>Brief</td><td>Producer</td><td>Complete</td></tr>
<tr><td>Draft</td><td>Writer</td><td>In progress</td></tr>
<tr><td>Review</td><td>Editor</td><td>Pending</td></tr>
</tbody>
</table>
`.trim(),
  },
  {
    id: "letter",
    title: "Letter",
    category: "letters",
    description: "Formal letter with sender block and greeting.",
    preview: "letter",
    html: letterHtml,
  },
  {
    id: "memo",
    title: "Memo",
    category: "business",
    description: "Internal memo with To / From / Subject lines.",
    preview: "memo",
    html: `
<h1>Memorandum</h1>
<p><strong>To:</strong> [Recipient]<br/><strong>From:</strong> [Author]<br/><strong>Date:</strong> [Date]<br/><strong>Subject:</strong> [Subject]</p>
<p>[Opening paragraph summarizing the purpose of this memo.]</p>
<p>[Supporting details and requested actions.]</p>
`.trim(),
  },
  {
    id: "welcome",
    title: "Welcome to Word",
    category: "all",
    description: "Take a tour",
    preview: "blank",
    html: `<h1>Welcome to Inkspire</h1><p>Start writing, or pick another template from New.</p>`,
  },
  {
    id: "single-spaced",
    title: "Single spaced (blank)",
    category: "all",
    description: "Blank page with single spacing",
    preview: "blank",
    html: blank,
  },
  {
    id: "snapshot-calendar",
    title: "Snapshot calendar",
    category: "holiday",
    description: "Monthly calendar layout",
    preview: "blank",
    html: blank,
  },
  {
    id: "toc-first",
    title: "Insert your first table of contents",
    category: "reports",
    description: "Starter with headings for a TOC",
    preview: "report",
    html: tocHtml,
  },
  {
    id: "cover-modern",
    title: "Modern chronological cover letter",
    category: "letters",
    description: "Matching cover letter",
    preview: "letter",
    html: letterHtml,
  },
  {
    id: "cover-blue",
    title: "Blue spheres cover letter",
    category: "letters",
    description: "Styled cover letter",
    preview: "letter",
    html: letterHtml,
  },
  {
    id: "education-brochure",
    title: "Education brochure",
    category: "education",
    description: "Program overview flyer",
    preview: "blank",
    html: blank,
  },
  {
    id: "bubbles-calendar",
    title: "Bubbles appointment calendar",
    category: "holiday",
    description: "Appointment calendar",
    preview: "blank",
    html: blank,
  },
  {
    id: "banner-calendar",
    title: "Banner calendar",
    category: "holiday",
    description: "Year calendar banner",
    preview: "blank",
    html: blank,
  },
  {
    id: "student-report",
    title: "Student report with photo",
    category: "education",
    description: "School report layout",
    preview: "report",
    html: reportHtml,
  },
  {
    id: "apa-paper",
    title: "Professional APA Style paper",
    category: "education",
    description: "Academic paper starter",
    preview: "report",
    html: tocHtml,
  },
  {
    id: "award",
    title: "World’s best award certificate",
    category: "cards",
    description: "Certificate template",
    preview: "blank",
    html: blank,
  },
  {
    id: "employee",
    title: "Colorful employee of the month",
    category: "cards",
    description: "Recognition certificate",
    preview: "blank",
    html: blank,
  },
  {
    id: "thank-you",
    title: "General professional thank you",
    category: "letters",
    description: "Thank-you letter",
    preview: "letter",
    html: letterHtml,
  },
]

export const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "business", label: "Business" },
  { id: "cards", label: "Cards" },
  { id: "flyers", label: "Flyers" },
  { id: "newsletters", label: "Newsletters" },
  { id: "letters", label: "Letters" },
  { id: "education", label: "Education" },
  { id: "personal", label: "Resumes and Cover Letters" },
  { id: "holiday", label: "Holiday" },
  { id: "reports", label: "Reports" },
] as const

export const SUGGESTED_SEARCHES = [
  { id: "business", label: "Business" },
  { id: "cards", label: "Cards" },
  { id: "flyers", label: "Flyers" },
  { id: "newsletters", label: "Newsletters" },
  { id: "letters", label: "Letters" },
  { id: "education", label: "Education" },
  { id: "personal", label: "Resumes and Cover Letters" },
  { id: "holiday", label: "Holiday" },
] as const

export const HOME_FEATURED_IDS = [
  "blank",
  "resume-sidebar",
  "report-executive",
  "invoice-modern",
  "flyer-event",
  "newsletter-company",
  "cover-modern",
  "cover-blue",
] as const

export const NEW_GALLERY_IDS = [
  "blank",
  "welcome",
  "resume-sidebar",
  "report-executive",
  "invoice-modern",
  "flyer-event",
  "newsletter-company",
  "resume-classic",
  "resume-banner",
  "report-brief",
  "report-research",
  "invoice-classic",
  "invoice-minimal",
  "flyer-sale",
  "flyer-open-house",
  "newsletter-community",
  "newsletter-editorial",
  "single-spaced",
  "snapshot-calendar",
  "toc-first",
  "cover-modern",
  "cover-blue",
  "education-brochure",
  "bubbles-calendar",
  "banner-calendar",
  "student-report",
  "apa-paper",
  "award",
  "employee",
  "thank-you",
] as const

export function templatesByIds(ids: readonly string[]) {
  return ids
    .map((id) => DOCUMENT_TEMPLATES.find((item) => item.id === id))
    .filter((item): item is DocumentTemplate => Boolean(item))
}

export function filterTemplates(category: string, query: string) {
  const needle = query.trim().toLowerCase()
  const ordered = templatesByIds(NEW_GALLERY_IDS)
  const extras = DOCUMENT_TEMPLATES.filter(
    (item) => !NEW_GALLERY_IDS.includes(item.id as (typeof NEW_GALLERY_IDS)[number]),
  )
  return [...ordered, ...extras].filter((item) => {
    if (category !== "all" && item.category !== category && item.id !== "blank") {
      return false
    }
    if (!needle) {
      return true
    }
    return `${item.title} ${item.description}`.toLowerCase().includes(needle)
  })
}
