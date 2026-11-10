/**
 * Round R (R4): the evaluation as one HTML page. Per scenario, the two
 * engines side by side (desktop and phone screenshots, the phone menu open),
 * before and after where a refinement ran, the checks table, the novelty
 * table, and what the run did and did not measure, said first.
 *
 * Pure: a string from the results. Picture paths are relative to the page.
 */
import { CHECKS, type CheckStatus, type EvalResult, type EvalShot } from "./types"
import { statusCounts, noveltyTable, siteTokens } from "./checks"

export interface ReportInput {
  results: EvalResult[]
  mode: "scripted" | "live"
  generatedAt: string
  /** Lines said at the top: what is scripted, what is a stand-in, what did not run. */
  honesty: string[]
  /** Findings about the system the run surfaced, in plain words. */
  findings: string[]
  /** Per engine: the implementation and its version, for the record. */
  versions?: Record<string, string>
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const MARK: Record<CheckStatus, string> = { pass: "Pass", fail: "Fail", warn: "Warn", pending: "Not run", skip: "Skip" }

function shot(s: EvalShot | null | undefined, label: string): string {
  if (!s) return `<div class="noshot">${esc(label)}: no picture (no browser)</div>`
  const img = (src: string | undefined, cls: string, alt: string) => (src ? `<a href="${esc(src)}"><img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy"></a>` : "")
  return `<figure class="shots"><figcaption>${esc(label)} · ${esc(s.page)}</figcaption><div class="pair">${img(s.desktopFold ?? s.desktop, "desk", `${label}, desktop 1440`)}${img(s.mobileFold ?? s.mobile, "phone", `${label}, phone 390`)}${img(s.mobileMenu, "phone", `${label}, phone menu open`)}</div>${s.desktop || s.mobile ? `<details><summary>Whole page</summary><div class="pair tall">${img(s.desktop, "desk", "whole page, desktop")}${img(s.mobile, "phone", "whole page, phone")}</div></details>` : ""}</figure>`
}

export function renderReport(input: ReportInput): string {
  const { results } = input
  const counts = statusCounts(results)
  const scenarios = [...new Map(results.map((r) => [r.site.scenario.id, r.site.scenario])).values()]
  const engines = [...new Set(results.map((r) => r.site.engine))]
  const byKey = new Map(results.map((r) => [`${r.site.engine}:${r.site.scenario.id}`, r]))

  const header = `<header><h1>AI website generation: evaluation</h1><p class="meta">${esc(input.mode === "live" ? "Live run on real providers" : "Scripted run (no API key)")} · ${esc(input.generatedAt)} · ${scenarios.length} businesses × ${engines.length} engines · ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail, ${counts.pending} not run</p></header>`
  const honesty = `<section class="honest"><h2>Read this first</h2><ul>${input.honesty.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>`
  const findings = input.findings.length ? `<section><h2>What the run found</h2><ol>${input.findings.map((l) => `<li>${esc(l)}</li>`).join("")}</ol></section>` : ""

  const table = `<section><h2>Checks</h2><div class="scroll"><table class="checks"><thead><tr><th>Check</th>${results.map((r) => `<th title="${esc(r.site.engineLabel)}">${esc(r.site.scenario.name)}<br><span>${esc(r.site.engine)}</span></th>`).join("")}</tr></thead><tbody>${CHECKS.map((c) => `<tr><th>${esc(c.label)}</th>${results.map((r) => {
    const x = r.checks.find((k) => k.id === c.id)!
    return `<td class="${x.status}" title="${esc(x.detail)}">${MARK[x.status]}</td>`
  }).join("")}</tr>`).join("")}</tbody></table></div><p class="hint">Hover a cell for its detail; every detail is also under its scenario below.</p></section>`

  const novelty = engines
    .map((e) => {
      const rows = noveltyTable(results.filter((r) => r.site.engine === e).map((r) => r.site))
      return `<h3>${esc(e)}</h3><table class="nov"><thead><tr><th>Site</th><th>Hero</th><th>Palette</th><th>Type</th><th>Closest (similarity)</th><th>Palette ΔE to closest</th><th>Fonts</th></tr></thead><tbody>${rows
        .map((r) => {
          const site = results.find((x) => x.site.engine === e && x.site.scenario.id === r.scenario)!.site
          const t = siteTokens(site)
          return `<tr><td>${esc(site.scenario.name)}</td><td>${esc(r.fingerprint.hero)}</td><td><span class="sw" style="background:${esc(t.colors.background)}"></span><span class="sw" style="background:${esc(t.colors.accent)}"></span><span class="sw" style="background:${esc(t.colors.text)}"></span> ${esc(r.fingerprint.palette)}</td><td>${esc(r.fingerprint.type)}</td><td>${esc(r.nearest?.scenario ?? "")} (${r.nearest?.similarity ?? "-"})</td><td>${r.palette?.deltaE ?? "-"}</td><td>${esc(t.fonts.heading)} / ${esc(t.fonts.body)}</td></tr>`
        })
        .join("")}</tbody></table>`
    })
    .join("")

  const cards = scenarios
    .map((sc) => {
      const cols = engines
        .map((e) => {
          const r = byKey.get(`${e}:${sc.id}`)
          if (!r) return `<div class="col"><h4>${esc(e)}</h4><p>Not run.</p></div>`
          const s = r.site
          const shots = s.browser?.shots ?? []
          const before = s.refinement ? `<div class="ba"><h5>${esc(s.refinement.label)}</h5><p class="hint">${esc(s.refinement.detail)}</p><div class="pair">${shot(s.refinement.before, "Before")}${shot(s.refinement.after, "After")}</div></div>` : ""
          return `<div class="col"><h4>${esc(s.engineLabel)}</h4><p class="meta">${esc(s.status)}${s.template ? ` · template ${esc(s.template)}` : ""}${s.modelCalls !== undefined ? ` · ${s.modelCalls} model calls` : ""}${s.costUsd ? ` · $${s.costUsd.toFixed(2)}` : ""}</p>${shots.map((x) => shot(x, x.page === "home" ? "Home" : x.page)).join("") || shot(null, "Home")}${before}<table class="detail">${r.checks.map((c) => `<tr><td class="${c.status}">${MARK[c.status]}</td><th>${esc(CHECKS.find((k) => k.id === c.id)?.label)}</th><td>${esc(c.detail)}</td></tr>`).join("")}</table>${s.notes.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`
        })
        .join("")
      return `<section class="scenario" id="${esc(sc.id)}"><h2>${esc(sc.name)}</h2><p class="prompt">“${esc(sc.prompt)}”</p><div class="cols">${cols}</div></section>`
    })
    .join("")

  const nav = `<nav>${scenarios.map((s) => `<a href="#${esc(s.id)}">${esc(s.name)}</a>`).join("")}</nav>`
  const versions = input.versions ? `<p class="meta">${Object.entries(input.versions).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</p>` : ""

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI build evaluation</title><style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#17181a;--muted:#5f6368;--line:#dcdcd6;--pass:#1d7a46;--fail:#b3261e;--warn:#9a6700;--pending:#6b6b6b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121314;--card:#1b1c1e;--ink:#ececea;--muted:#a3a39e;--line:#33352f;--pass:#5bc58a;--fail:#ff8a80;--warn:#f2c14e;--pending:#9a9a9a}}
:root[data-theme="dark"]{--bg:#121314;--card:#1b1c1e;--ink:#ececea;--muted:#a3a39e;--line:#33352f;--pass:#5bc58a;--fail:#ff8a80;--warn:#f2c14e;--pending:#9a9a9a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header,section,nav{max-width:1400px;margin:0 auto;padding:16px}h1{font-size:28px;margin:8px 0}h2{font-size:21px;margin:24px 0 8px}h3{font-size:16px}h4{font-size:15px;margin:0 0 4px}h5{margin:8px 0 2px;font-size:14px}
.meta,.hint{color:var(--muted);font-size:13px}.honest{background:var(--card);border:1px solid var(--line);border-radius:8px}
nav{display:flex;flex-wrap:wrap;gap:12px}nav a{color:var(--ink)}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}thead th span{color:var(--muted);font-weight:400}
td.pass{color:var(--pass);font-weight:600}td.fail{color:var(--fail);font-weight:600}td.warn{color:var(--warn);font-weight:600}td.pending,td.skip{color:var(--pending)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:16px}.col{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
.prompt{font-style:normal;color:var(--muted)}.pair{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}.shots{margin:8px 0}figcaption{font-size:12px;color:var(--muted)}
img.desk{width:min(100%,380px);height:auto;border:1px solid var(--line)}img.phone{width:120px;height:auto;border:1px solid var(--line)}.tall img.desk{width:220px}.tall img.phone{width:110px}
.detail{width:100%;margin-top:8px}.detail th{width:30%;font-weight:500}.notes{font-size:12px;color:var(--muted);padding-left:18px;overflow-wrap:anywhere}.noshot{font-size:12px;color:var(--muted);padding:8px;border:1px dashed var(--line)}
.sw{display:inline-block;width:12px;height:12px;border:1px solid var(--line);vertical-align:middle;margin-right:2px}.ba{border-top:1px solid var(--line);margin-top:8px}
</style></head><body>${header}${nav}${honesty}${findings}${versions ? `<section>${versions}</section>` : ""}${table}<section><h2>Distinct from each other (O3 fingerprints, palette and type)</h2>${novelty}</section>${cards}</body></html>`
}
