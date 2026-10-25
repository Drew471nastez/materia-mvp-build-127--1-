/**
 * ===========================================================================
 *  SIZE CHARTS: ONE TABLE OF MEASUREMENTS, SHARED BY MANY PRODUCTS
 * ===========================================================================
 * A clothing shop writes its size table once ("Tees": Size, Chest, Length)
 * and gives it to every product it fits. A chart belongs to the store
 * (`size_charts`); a product points at one or none (`product_size_charts`).
 * Shopify's size chart apps work the same way, and so does the seller's
 * habit: one chart per cut, not one per product.
 *
 * A chart is a name, the unit its numbers were typed in (cm or in), its
 * columns and its rows. Each column says whether it is a measurement: Chest
 * and Waist are, Size and "EU size" are not. Only a measurement is
 * converted when a buyer switches between cm and in, so "38" under EU size
 * stays 38 and "86-91" under Chest becomes "33.9-35.8".
 *
 * Read by every place a chart is drawn or saved, so they agree on it:
 *
 *   the seller's editor         components/physical/size-chart-editor.tsx
 *   the server                  lib/size-charts/server.ts (saving checks it here)
 *   a Storelib theme            the product section's Size chart block and the
 *                               Size guide link in its variant picker
 *   an imported Shopify theme   product.metafields.storelib.size_chart and the
 *                               markup in ./html.ts
 *
 * Pure and safe in the browser. Everything a seller types here is plain
 * text, escaped wherever it is printed.
 */

export type SizeUnit = "cm" | "in"

export interface SizeChartColumn {
  name: string
  /** A measurement, converted between cm and in. False for a size label (S, M, 38). */
  measure: boolean
}

export interface SizeChart {
  /** The chart's row id; absent on a chart drawn for a visitor. */
  id?: string
  name: string
  unit: SizeUnit
  columns: SizeChartColumn[]
  /** One list of cells per size, each as long as `columns`. */
  rows: string[][]
  /** A line under the table: how to measure, or how the cut fits. */
  notes: string
  /** A picture of where to measure, shown beside the table. */
  imageUrl: string | null
}

export const SIZE_CHART_LIMITS = { name: 80, columns: 10, rows: 40, cell: 40, notes: 1500, image: 2048 } as const

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v).slice(0, max) : "")
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "")

export const isSizeUnit = (v: unknown): v is SizeUnit => v === "cm" || v === "in"

/** A picture address a chart may show: https, or Storelib's own path. Anything else is dropped. */
function imageOf(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s || s.length > SIZE_CHART_LIMITS.image) return null
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) || /^\/[^/\s"'<>][^\s"'<>]*$/.test(s)) return s
  return null
}

/**
 * A chart as it may be stored or drawn: names and cells trimmed and cut to
 * their limits, every row as long as the columns, empty rows left out.
 * Null when nothing is left to show (no column, or no row with a size).
 * Lenient: a stored chart from an older shape is still read.
 */
export function readSizeChart(raw: unknown): SizeChart | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const rawColumns = Array.isArray(r.columns) ? r.columns.slice(0, SIZE_CHART_LIMITS.columns) : []
  const columns: SizeChartColumn[] = rawColumns.map((c, i) => {
    if (typeof c === "string") return { name: line(c, SIZE_CHART_LIMITS.cell), measure: i > 0 }
    const o = (c ?? {}) as Record<string, unknown>
    return { name: line(o.name, SIZE_CHART_LIMITS.cell), measure: typeof o.measure === "boolean" ? o.measure : i > 0 }
  })
  if (!columns.length) return null
  const rows = (Array.isArray(r.rows) ? r.rows : [])
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => columns.map((_, i) => line(row[i], SIZE_CHART_LIMITS.cell)))
    .filter((row) => row.some(Boolean))
    .slice(0, SIZE_CHART_LIMITS.rows)
  if (!rows.length) return null
  return {
    ...(typeof r.id === "string" && r.id ? { id: r.id } : {}),
    name: line(r.name, SIZE_CHART_LIMITS.name) || "Size chart",
    unit: isSizeUnit(r.unit) ? r.unit : "cm",
    columns,
    rows,
    notes: text(r.notes, SIZE_CHART_LIMITS.notes),
    imageUrl: imageOf(r.imageUrl ?? r.image_url),
  }
}

/**
 * A chart a seller sent to be saved: what readSizeChart keeps, or the one
 * sentence that says what to fix. Stricter than reading: it needs a name,
 * a name on every column and a size in every row's first cell.
 */
export function checkSizeChart(raw: unknown): { ok: true; chart: SizeChart } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (!line(r.name, SIZE_CHART_LIMITS.name)) return { ok: false, error: "Give the chart a name." }
  if (Array.isArray(r.columns) && r.columns.length > SIZE_CHART_LIMITS.columns) return { ok: false, error: `A chart can have up to ${SIZE_CHART_LIMITS.columns} columns.` }
  if (Array.isArray(r.rows) && r.rows.length > SIZE_CHART_LIMITS.rows) return { ok: false, error: `A chart can have up to ${SIZE_CHART_LIMITS.rows} sizes.` }
  const chart = readSizeChart(r)
  if (!chart) return { ok: false, error: "Add at least one size to the chart." }
  if (chart.columns.some((c) => !c.name)) return { ok: false, error: "Name every column." }
  if (chart.rows.some((row) => !row[0])) return { ok: false, error: `Fill in the ${chart.columns[0].name} column for every row.` }
  return { ok: true, chart }
}

/* ── Units ─────────────────────────────────────────────────────────────── */

const CM_PER_IN = 2.54
/** A cell that is only numbers and the marks between them: "86", "86-91", "86 / 91", "86,5". */
const NUMERIC_CELL = /^[\s\d.,\-–—/x×~+]*\d[\s\d.,\-–—/x×~+]*$/

function round1(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * A measurement cell in the other unit. Every number in it is converted
 * (a range stays a range), to one decimal, with the decimal mark it was
 * typed with ("86,5" stays comma). A cell with words in it ("One size",
 * "Fits most") is left as typed.
 */
export function convertCell(cell: string, from: SizeUnit, to: SizeUnit): string {
  if (from === to || !NUMERIC_CELL.test(cell)) return cell
  const comma = /\d,\d(?!\d)/.test(cell)
  const factor = from === "cm" ? 1 / CM_PER_IN : CM_PER_IN
  const pattern = comma ? /\d+(?:,\d+)?/g : /\d+(?:\.\d+)?/g
  return cell.replace(pattern, (m) => {
    const n = Number(comma ? m.replace(",", ".") : m)
    if (!Number.isFinite(n)) return m
    const out = round1(n * factor)
    return comma ? out.replace(".", ",") : out
  })
}

/** The chart's rows in `unit`: its measurement columns converted, everything else as typed. */
export function rowsIn(chart: Pick<SizeChart, "unit" | "columns" | "rows">, unit: SizeUnit): string[][] {
  if (unit === chart.unit) return chart.rows
  return chart.rows.map((row) => row.map((cell, i) => (chart.columns[i]?.measure ? convertCell(cell, chart.unit, unit) : cell)))
}

/** Whether the buyer can switch units: the chart has a measurement with a number in it. */
export function hasMeasurements(chart: Pick<SizeChart, "columns" | "rows">): boolean {
  return chart.columns.some((c, i) => c.measure && chart.rows.some((row) => /\d/.test(row[i] ?? "")))
}

/* ── Which option is the size ─────────────────────────────────────────── */

/**
 * An option name that means size, in the languages shops write them in:
 * "Size", "Shoe size", "Talla", "Taille", "Größe", "Tamanho", "Taglia",
 * "Maat", "Rozmiar", "Beden", "サイズ" and the rest.
 */
const SIZE_NAMES = /^(sizes?|talla|tallas|tama[nñ]o|taille|tailles|pointure|gr[öo](?:ß|ss)e|gr[öo]e?sse|tamanho|taglia|taglie|maat|maten|storlek|st[øo]rrelse|koko|velikost|rozmiar|beden|m[ée]ret|m[ăa]rime|μέγεθος|размер|розмір|サイズ|사이즈|尺码|尺碼|尺寸|ukuran|k[íi]ch c[ỡo])$/i

export function isSizeOptionName(name: unknown): boolean {
  if (typeof name !== "string") return false
  const n = name.trim()
  return SIZE_NAMES.test(n) || /\bsizes?\b/i.test(n)
}

/** The index of the product's size option, or -1 when none of its options is a size. */
export function sizeOptionIndex(options: readonly ({ name?: unknown } | string | null | undefined)[]): number {
  return options.findIndex((o) => isSizeOptionName(typeof o === "string" ? o : o?.name))
}

/* ── Starting points ──────────────────────────────────────────────────── */

export type SizeChartTemplate = "tops" | "bottoms" | "dresses" | "shoes" | "blank"
export const SIZE_CHART_TEMPLATES: readonly SizeChartTemplate[] = ["tops", "bottoms", "dresses", "shoes", "blank"]

/**
 * A new chart's columns and sizes, with every measurement empty: the
 * seller's own garments decide the numbers, so none are made up here.
 * `t` puts the column names in the seller's language as they are made.
 */
export function sizeChartTemplate(key: SizeChartTemplate, t: (s: string) => string = (s) => s): Omit<SizeChart, "id"> {
  const letters = ["XS", "S", "M", "L", "XL", "XXL"]
  const make = (name: string, measures: string[], sizes: string[], first = t("Size")): Omit<SizeChart, "id"> => ({
    name,
    unit: "cm",
    columns: [{ name: first, measure: false }, ...measures.map((m) => ({ name: m, measure: true }))],
    rows: sizes.map((s) => [s, ...measures.map(() => "")]),
    notes: "",
    imageUrl: null,
  })
  switch (key) {
    case "tops":
      return make(t("Tops"), [t("Chest"), t("Length"), t("Sleeve")], letters)
    case "bottoms":
      return make(t("Bottoms"), [t("Waist"), t("Hip"), t("Inseam")], letters)
    case "dresses":
      return make(t("Dresses"), [t("Bust"), t("Waist"), t("Hip"), t("Length")], letters)
    case "shoes": {
      const eu = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"]
      const chart = make(t("Shoes"), [t("Foot length")], eu, "EU")
      return { ...chart, columns: [chart.columns[0], { name: "UK", measure: false }, { name: "US", measure: false }, chart.columns[1]], rows: eu.map((s) => [s, "", "", ""]) }
    }
    default:
      return make(t("Size chart"), [t("Chest"), t("Waist")], ["S", "M", "L"])
  }
}

/** The chart the builder draws on its sample product, so a creator sees what the block looks like. Never on a live page. */
export const SAMPLE_SIZE_CHART: SizeChart = {
  name: "Size chart",
  unit: "cm",
  columns: [
    { name: "Size", measure: false },
    { name: "Chest", measure: true },
    { name: "Waist", measure: true },
    { name: "Length", measure: true },
  ],
  rows: [
    ["S", "86-91", "71-76", "69"],
    ["M", "91-97", "76-81", "71"],
    ["L", "97-102", "81-86", "74"],
    ["XL", "102-107", "86-91", "76"],
  ],
  notes: "Measured flat, in centimetres.",
  imageUrl: null,
}

/** What a unit is called beside a number. */
export const SIZE_UNIT_LABELS: Readonly<Record<SizeUnit, string>> = { cm: "cm", in: "in" }

/**
 * The chart in the shape a theme's Liquid reads
 * (product.metafields.storelib.size_chart.value), the same JSON wherever a
 * product is drawn: its own page, a featured product, a card.
 *
 *   name, title      the chart's name (`title` for a theme that says so)
 *   unit             the unit the numbers were typed in, "cm" or "in"
 *   unit_label       that unit as it is printed
 *   units            the units the chart can be read in: both when it has a
 *                    measurement with a number, else only its own
 *   columns          { name, measure, unit }: `unit` the column's unit when
 *                    it is a measurement, null for a size label
 *   rows             the cells as typed
 *   rows_cm, rows_in the same table in each unit, measurements converted
 *   tables           { cm: { unit, unit_label, rows }, in: { ... } }, only
 *                    the units in `units`
 *   notes, image     the line under the table and the picture of where to
 *                    measure
 *   measuring_guide  { text, image }: the same two, for a theme that draws a
 *                    How to measure part
 */
export function sizeChartJson(chart: SizeChart): Record<string, unknown> {
  const both = hasMeasurements(chart)
  const units: SizeUnit[] = both ? ["cm", "in"] : [chart.unit]
  const tables: Record<string, unknown> = {}
  for (const u of units) tables[u] = { unit: u, unit_label: SIZE_UNIT_LABELS[u], rows: rowsIn(chart, u) }
  return {
    name: chart.name,
    title: chart.name,
    unit: chart.unit,
    unit_label: SIZE_UNIT_LABELS[chart.unit],
    units,
    has_measurements: both,
    columns: chart.columns.map((c) => ({ name: c.name, measure: c.measure, unit: c.measure ? chart.unit : null })),
    rows: chart.rows,
    /* The same table in the other unit, so a theme can offer the switch without doing the arithmetic in Liquid. */
    rows_cm: rowsIn(chart, "cm"),
    rows_in: rowsIn(chart, "in"),
    tables,
    notes: chart.notes,
    image: chart.imageUrl,
    measuring_guide: { text: chart.notes, image: chart.imageUrl },
  }
}
