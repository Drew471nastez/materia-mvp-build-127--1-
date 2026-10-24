/**
 * ===========================================================================
 *  A PRODUCT'S SIZE CHART IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The chart the product editor gave a product (lib/size-charts) has no
 * slot in a Shopify theme: on Shopify a size chart app supplies one. So it
 * reaches an imported theme four ways, from the product's own data, and the
 * first that applies on a page wins:
 *
 *   THE METAFIELD        `product.metafields.storelib.size_chart` (./objects.ts):
 *                        `.value` the name, unit, columns, rows (also as
 *                        `rows_cm` and `rows_in`), notes and picture. A theme
 *                        whose code reads it draws the chart itself, and
 *                        Storelib adds nothing.
 *   THE SNIPPET          `{% render 'storelib-size-chart' %}`, or the filter
 *                        `{{ product | storelib_size_chart }}`: the link and
 *                        the chart, where the theme's code puts them.
 *   THE APP BLOCK        "Size chart" under Apps in Add block, in any section
 *                        that takes `@app` (Dawn's main product, Horizon's
 *                        product information), as a size chart app's block is
 *                        on Shopify. A block kept from such an app (Kiwi
 *                        Sizing, a "size chart" app) is drawn the same way.
 *   BESIDE THE SIZE      otherwise, on the product page only, a "Size guide"
 *                        link is put beside the size option's label in the
 *                        main product section (its <legend> or <label>), or
 *                        above the product form when nothing is named Size.
 *
 * The markup is lib/size-charts/html.ts: no script, so it works in the
 * builder's canvas, on the live page and after the theme draws its section
 * again for another variant. Pure.
 */
import type { BlockSchema } from "@/lib/website-builder/types"
import { isSizeOptionName, readSizeChart, type SizeChart } from "@/lib/size-charts/model"
import { SIZE_CHART_CSS, sizeChartDialogHtml, sizeChartHtml, sizeChartOpenerHtml, type SizeChartMarkupOptions } from "@/lib/size-charts/html"

type O = Record<string, unknown>

/** Storelib's own Size chart app block, kept on a page by its address as Shopify keeps an app's. */
export const SIZE_CHART_APP_BLOCK = "shopify://apps/storelib-size-charts/blocks/size-chart/storelib"

/** A size chart app's block, from Shopify or Storelib's own. */
const SIZE_CHART_APPS = /^shopify:\/\/apps\/[^/]*(kiwi-?siz|size-?charts?|size-?guides?|sizing|easysize|fit-?finder|storelib-size-charts)[^/]*\/blocks\//i

export function isSizeChartAppBlock(type: unknown): boolean {
  return typeof type === "string" && SIZE_CHART_APPS.test(type)
}

/** What Add block offers under Apps (lib/website-builder/storelib-schemas.ts). Read as stored by sizeChartBlockHtml. */
export const SIZE_CHART_APP_BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    type: SIZE_CHART_APP_BLOCK,
    name: "Size chart",
    theme: true,
    limit: 1,
    fields: [
      { id: "label", label: "Label", type: "text", default: "", placeholder: "Size guide", info: "Shows when the product has a size chart (Products, Size charts)." },
      {
        id: "style",
        label: "Style",
        type: "select",
        default: "link",
        options: [
          { label: "Text link", value: "link" },
          { label: "Button", value: "button" },
        ],
      },
      { id: "show_icon", label: "Ruler icon", type: "toggle", default: true },
    ],
  },
]

export function sizeChartAppBlockSchema(type: string): BlockSchema | undefined {
  return SIZE_CHART_APP_BLOCK_SCHEMAS.find((b) => b.type === type)
}

/** The product's chart from the page's `product`, or null. */
export function sizeChartOf(product: unknown): SizeChart | null {
  const mf = (product as O | null | undefined)?.metafields as O | undefined
  const value = ((mf?.storelib as O | undefined)?.size_chart as O | undefined)?.value as O | undefined
  if (!value || typeof value !== "object") return null
  return readSizeChart({ ...value, imageUrl: value.image })
}

/** Whether a theme's own code reads the chart, so it draws it itself. */
export function themeReadsSizeChart(sources: Iterable<string>): boolean {
  for (const s of sources) if (/metafields\.storelib\.size_chart|metafields\.storelib\[['"]size_chart['"]\]/.test(s)) return true
  return false
}

/** Whether a section already holds a size chart block, at any depth: the chart then opens from there. */
export function holdsSizeChartBlock(blocks: readonly { type: string; blocks?: unknown }[] | undefined): boolean {
  return (blocks ?? []).some((b) => isSizeChartAppBlock(b.type) || holdsSizeChartBlock(b.blocks as { type: string; blocks?: unknown }[] | undefined))
}

/** The id a product's chart is drawn under on its page. */
export function sizeChartUid(product: unknown): string {
  const p = (product ?? {}) as O
  return String(p.id ?? p.handle ?? "chart")
}

const strip = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/**
 * The main product section's markup with a Size guide link beside its size
 * option and the chart after it, or null when this section is not where it
 * goes: no product form (Shopify's /cart/add), or the link already drawn.
 *
 *   a <legend> naming the size     the link inside it, after the name
 *   a <label> naming the size      the link right after it
 *   nothing named Size             a line with the link above the product form
 */
export function withSizeGuide(html: string, optionNames: readonly string[], chart: SizeChart, opts: SizeChartMarkupOptions, withCss = true): string | null {
  if (/data-storelib-size-chart-open/.test(html)) return null
  if (!/action=["'][^"']*\/cart\/add/i.test(html)) return null
  const dialog = `${withCss ? SIZE_CHART_CSS : ""}${sizeChartDialogHtml(chart, opts)}`
  const sizeName = optionNames.find((n) => isSizeOptionName(n))?.trim().toLowerCase() ?? null
  if (sizeName) {
    const labelled = /<(legend|label)\b[^>]*>([\s\S]{0,600}?)<\/\1>/gi
    let m: RegExpExecArray | null
    while ((m = labelled.exec(html))) {
      const said = strip(m[2]).toLowerCase()
      if (said !== sizeName && !said.startsWith(`${sizeName}:`) && !said.startsWith(`${sizeName} `)) continue
      const opener = sizeChartOpenerHtml(opts)
      if (m[1].toLowerCase() === "legend") {
        const close = m.index + m[0].length - "</legend>".length
        return html.slice(0, close) + opener + html.slice(close) + dialog
      }
      const end = m.index + m[0].length
      return html.slice(0, end) + opener + html.slice(end) + dialog
    }
  }
  /* The buy form, never a theme's second form for instalments (Dawn's product-form-installment). */
  const forms = /<form\b[^>]*action=["'][^"']*\/cart\/add[^>]*>/gi
  let f: RegExpExecArray | null
  while ((f = forms.exec(html))) {
    if (/installment/i.test(f[0])) continue
    let at = f.index
    /* Out of the form's own wrapper (Dawn's <product-form>), so it is not inside the buy buttons' box. */
    const before = html.slice(Math.max(0, at - 300), at)
    const wrapper = before.match(/<product-form\b[^>]*>\s*$/i)
    if (wrapper) at -= wrapper[0].length
    return html.slice(0, at) + `<div class="slsc-line">${sizeChartOpenerHtml(opts)}</div>` + html.slice(at) + dialog
  }
  return null
}

/** A size chart app block's markup, for the product in scope; a quiet line in the builder when it has none. */
export function sizeChartBlockHtml(product: unknown, settings: O, words: { sizeGuide: string; close: string }, opts: { inEditor: boolean; withCss: boolean; dialog: boolean }): string {
  const chart = sizeChartOf(product)
  if (!chart) return opts.inEditor ? `<p class="slsc-note" style="margin:0;font-size:12px;font-style:italic;opacity:.55">Size chart: shows the product's size chart once it has one (Products, Size charts)</p>` : ""
  const label = typeof settings.label === "string" && settings.label.trim() ? settings.label.trim() : words.sizeGuide
  const markup: SizeChartMarkupOptions = { uid: sizeChartUid(product), label, look: settings.style === "button" ? "button" : "link", icon: settings.show_icon !== false, closeLabel: words.close }
  /* A second opener for a chart already on the page points at that one. */
  if (!opts.dialog) return `<div class="slsc-block">${sizeChartOpenerHtml(markup)}</div>`
  return sizeChartHtml(chart, markup, opts.withCss)
}

/** `{% render 'storelib-size-chart' %}`: the snippet a theme can call, drawn by the filter below. */
export const SIZE_CHART_SNIPPET_NAME = "storelib-size-chart"
export const SIZE_CHART_SNIPPET = "{{ product | storelib_size_chart: label: label, style: style }}"
