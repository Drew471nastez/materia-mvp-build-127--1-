/**
 * ===========================================================================
 *  A PRODUCT'S SIZE CHART IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The markup Storelib draws a chart with on an imported theme's product
 * page (lib/storelib-theme/compat/size-chart.ts decides where): a "Size
 * guide" link, and the chart it opens.
 *
 * NO SCRIPT. The link is `<button popovertarget>` and the chart a
 * `<div popover>`, so the browser opens it over the page, closes it on a
 * press outside or Escape, and nothing has to run first: not on the live
 * page, not in the builder's canvas (an iframe of the theme's own page), not
 * after a theme draws its section again for a new variant. The cm and in
 * switch is two radio buttons and CSS: each table is there, the one not
 * chosen is hidden.
 *
 * It takes the theme's own font and text colour (inherit, currentColor) so
 * it reads as the theme's, on the theme's own background colour when the
 * theme names one. Everything the seller typed is escaped here.
 *
 * Pure: the same in the canvas and on the website.
 */
import { hasMeasurements, rowsIn, type SizeChart, type SizeUnit } from "./model"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const RULER = `<svg class="slsc-open__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>`
const CROSS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>`

/** Drawn once per page, before the first chart. */
export const SIZE_CHART_CSS = `<style data-storelib-size-chart-css>
.slsc-open{display:inline-flex;align-items:center;gap:.4em;margin:0;padding:0;border:0;background:none;font:inherit;font-size:.92em;color:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:.25em}
.slsc-open__icon{flex:none}
.slsc-open--button{justify-content:center;width:100%;min-height:44px;padding:0 1em;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:var(--buttons-radius,4px);text-decoration:none}
.slsc-line{display:block;margin:.25em 0 1em}
legend .slsc-open,label+.slsc-open{margin-left:.75em}
.slsc{position:fixed;inset:0;margin:auto;width:min(680px,calc(100% - 32px));height:fit-content;max-height:min(86vh,760px);overflow:auto;overscroll-behavior:contain;padding:20px 24px 24px;border:0;border-radius:14px;box-sizing:border-box;background:var(--slsc-bg,Canvas);color:var(--slsc-fg,CanvasText);font:inherit;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.slsc::backdrop{background:rgba(0,0,0,.4)}
.slsc{display:none}
.slsc[data-sl-open]{display:block}
.slsc:popover-open{display:block}
.slsc__head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}
.slsc__title{margin:0;font-size:1.15em;font-weight:600;line-height:1.3}
.slsc__x{display:grid;place-items:center;flex:none;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;cursor:pointer}
.slsc__u{position:absolute;opacity:0;pointer-events:none}
.slsc__units{display:inline-flex;margin:0 0 12px;padding:3px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent)}
.slsc__units label{min-width:48px;padding:6px 12px;border-radius:999px;font-size:.88em;font-weight:500;text-align:center;cursor:pointer;opacity:.7}
.slsc__u--cm:checked~.slsc__units .slsc__l--cm,.slsc__u--in:checked~.slsc__units .slsc__l--in{opacity:1;background:var(--slsc-bg,Canvas);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.slsc__u--cm:focus-visible~.slsc__units .slsc__l--cm,.slsc__u--in:focus-visible~.slsc__units .slsc__l--in{outline:2px solid currentColor;outline-offset:1px}
.slsc__u--cm:checked~.slsc__tables .slsc__t--in,.slsc__u--in:checked~.slsc__tables .slsc__t--cm{display:none}
.slsc__scroll{overflow-x:auto}
.slsc table{width:100%;margin:0;border-collapse:collapse;font-size:.95em;font-variant-numeric:tabular-nums;text-align:left}
.slsc th,.slsc td{padding:10px 12px;border:0;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);white-space:nowrap;text-align:left}
.slsc th:first-child,.slsc td:first-child{padding-left:0}
.slsc thead th{font-weight:600}
.slsc tbody th{font-weight:500}
.slsc__unit{font-weight:400;opacity:.65}
.slsc__img{display:block;max-width:100%;max-height:260px;margin:0 0 16px;border-radius:8px}
.slsc__notes{margin:16px 0 0;font-size:.9em;line-height:1.55;opacity:.8;white-space:pre-line}
@media (max-width:639px){.slsc{inset:auto 0 0 0;width:100%;max-width:100%;max-height:88vh;margin:0;padding:16px 20px max(20px,env(safe-area-inset-bottom));border-radius:18px 18px 0 0}}
</style>`

export interface SizeChartMarkupOptions {
  /** Unique on the page: the chart's popover id is made from it. */
  uid: string
  /** The link's words ("Size guide" in the page's language). */
  label: string
  look?: "link" | "button"
  icon?: boolean
  closeLabel?: string
}

const uidOf = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "chart"

function table(chart: SizeChart, unit: SizeUnit, unitClass: string): string {
  const rows = rowsIn(chart, unit)
  const head = chart.columns.map((c) => `<th scope="col">${esc(c.name)}${c.measure ? ` <span class="slsc__unit">(${unit})</span>` : ""}</th>`).join("")
  const body = rows.map((row) => `<tr>${row.map((cell, i) => (i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${cell ? esc(cell) : "&ndash;"}</td>`)).join("")}</tr>`).join("")
  return `<div class="slsc__scroll${unitClass}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

/** The id of the popover a chart is drawn in, for a theme's own button (`popovertarget`). */
export function sizeChartPopoverId(uid: string): string {
  return `storelib-size-chart-${uidOf(uid)}`
}

/** The link that opens the chart. */
export function sizeChartOpenerHtml(opts: SizeChartMarkupOptions, extraClass = ""): string {
  const id = sizeChartPopoverId(opts.uid)
  const look = opts.look === "button" ? " slsc-open--button" : ""
  return `<button type="button" class="slsc-open${look}${extraClass ? ` ${extraClass}` : ""}" popovertarget="${id}" aria-haspopup="dialog" data-storelib-size-chart-open>${opts.icon ? RULER : ""}<span>${esc(opts.label)}</span></button>`
}

/** The chart itself, closed until its link is pressed. */
export function sizeChartDialogHtml(chart: SizeChart, opts: SizeChartMarkupOptions): string {
  const id = sizeChartPopoverId(opts.uid)
  const both = hasMeasurements(chart)
  const name = `${id}-unit`
  const units = both
    ? `<input class="slsc__u slsc__u--cm" type="radio" name="${name}" id="${name}-cm" value="cm"${chart.unit === "cm" ? " checked" : ""}><input class="slsc__u slsc__u--in" type="radio" name="${name}" id="${name}-in" value="in"${chart.unit === "in" ? " checked" : ""}><div class="slsc__units" role="presentation"><label class="slsc__l--cm" for="${name}-cm">cm</label><label class="slsc__l--in" for="${name}-in">in</label></div>`
    : ""
  const tables = both ? `<div class="slsc__tables">${table(chart, "cm", " slsc__t--cm")}${table(chart, "in", " slsc__t--in")}</div>` : `<div class="slsc__tables">${table(chart, chart.unit, "")}</div>`
  const image = chart.imageUrl ? `<img class="slsc__img" src="${esc(chart.imageUrl)}" alt="" loading="lazy">` : ""
  const notes = chart.notes ? `<p class="slsc__notes">${esc(chart.notes)}</p>` : ""
  return `<div id="${id}" class="slsc" popover role="dialog" aria-label="${esc(chart.name)}" data-storelib-size-chart><div class="slsc__head"><p class="slsc__title">${esc(chart.name)}</p><button type="button" class="slsc__x" popovertarget="${id}" popovertargetaction="hide" aria-label="${esc(opts.closeLabel ?? "Close")}">${CROSS}</button></div>${image}${units}${tables}${notes}</div>`
}

/** The link and its chart together, with the styles: what an app block or the snippet draws. */
export function sizeChartHtml(chart: SizeChart, opts: SizeChartMarkupOptions, withCss = true): string {
  return `${withCss ? SIZE_CHART_CSS : ""}<div class="slsc-block" data-storelib-size-chart-block>${sizeChartOpenerHtml(opts)}${sizeChartDialogHtml(chart, opts)}</div>`
}
