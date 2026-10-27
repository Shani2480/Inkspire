import { normalizeChartSpec, type ChartSpec } from "@/editor/chart-spec"

/**
 * Word's chart templates (Save as Template…, and Templates in Insert Chart and Change Chart Type): a chart's type,
 * elements and formatting kept under a name. Applied to a chart it keeps that chart's data; inserted, it brings the
 * data it was saved with. Kept in this browser or profile, as Word keeps them in the user's Charts folder.
 */

export type ChartTemplate = { id: string; name: string; spec: ChartSpec }

export const TEMPLATES_KEY = "inkspire.chartTemplates"
export const TEMPLATE_PREFIX = "template:"

export function loadChartTemplates(): ChartTemplate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]") as unknown
    if (!Array.isArray(raw)) {
      return []
    }
    return raw.flatMap((item: Partial<ChartTemplate>) =>
      item && typeof item.id === "string" && typeof item.name === "string" && item.spec && typeof item.spec === "object"
        ? [{ id: item.id, name: item.name, spec: normalizeChartSpec(item.spec) }]
        : [],
    )
  } catch {
    return []
  }
}

function store(templates: ChartTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
    return true
  } catch {
    return false
  }
}

/** Saves the chart as a template; one of the same name is replaced, as saving over a .crtx would. */
export function saveChartTemplate(name: string, spec: ChartSpec) {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const templates = loadChartTemplates()
  const existing = templates.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
  const template = { id: existing?.id ?? `t${Date.now().toString(36)}`, name: trimmed, spec: structuredClone(spec) }
  const next = existing
    ? templates.map((item) => (item.id === existing.id ? template : item))
    : [...templates, template]
  return store(next) ? template : null
}

export function deleteChartTemplate(id: string) {
  store(loadChartTemplates().filter((item) => item.id !== id))
}

export function chartTemplate(id: string) {
  const bare = id.startsWith(TEMPLATE_PREFIX) ? id.slice(TEMPLATE_PREFIX.length) : id
  return loadChartTemplates().find((item) => item.id === bare) ?? null
}

/**
 * A chart drawn by a template: the template's type, elements, style and formatting, with the chart's own data,
 * titles and series names. Each series takes the options of the template's series in its place (its own type and
 * axis in a combo, its trendline), or of the template's last series when the chart has more.
 */
export function applyChartTemplate(spec: ChartSpec, template: ChartSpec): ChartSpec {
  const last = template.series[template.series.length - 1]
  return {
    ...structuredClone(template),
    categories: spec.categories,
    levels: spec.levels,
    hiddenCategories: spec.hiddenCategories,
    title: { ...template.title, text: spec.title.text },
    axisTitles: {
      category: { ...template.axisTitles.category, text: spec.axisTitles.category.text },
      value: { ...template.axisTitles.value, text: spec.axisTitles.value.text },
    },
    series: spec.series.map((serie, index) => {
      const model = template.series[index] ?? (index > 0 ? last : undefined)
      return {
        name: serie.name,
        values: serie.values,
        ...(serie.hidden ? { hidden: true } : {}),
        ...(model?.type ? { type: model.type } : {}),
        ...(model?.secondary ? { secondary: true } : {}),
        ...(model?.trendline ? { trendline: model.trendline } : {}),
        ...(model?.tick ? { tick: true } : {}),
      }
    }),
  }
}
