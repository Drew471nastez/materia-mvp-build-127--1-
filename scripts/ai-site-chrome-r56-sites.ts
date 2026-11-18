/**
 * The websites scripts/check-ai-site-chrome-r56.mjs measures, written to one
 * JSON file (OUT, argv[2]):
 *
 *   eval       the scripted evaluation's sites (tests/_eval/run.ts) through
 *              both engines, six businesses each: the agent's (a starting
 *              template adapted, its own kit header and footer) and the
 *              native JSON engine's (Storelib's built-in header and footer)
 *   template   every starting template (lib/storelib-ai/templates) as it is
 *              applied before any adaptation: its files, its pages, its
 *              tokens as Theme settings over the theme's defaults
 *
 * For each, the home page as the live site draws it on the server: the
 * universal chrome (lib/website-builder/universal-chrome.ts) and every
 * .storelib section rendered by renderWithSources. The browser side mounts
 * that with the live page's own React tree (./ai-site-chrome-r56-probe.tsx).
 *
 * Compiled and run like scripts/ai-builder/eval.ts (the push suites' loader,
 * the journey's in-memory database): nothing real is written.
 */
import "../tests/_journey/env"
import { writeFileSync } from "node:fs"

process.env.AI_JOB_SECRET = process.env.AI_JOB_SECRET || "eval-ai-job-secret-local-only"
process.env.CHROMIUM_PATH = "/nonexistent/chromium-for-the-agent"

interface OutSite {
  key: string
  source: "eval" | "template"
  engine: "agent" | "native" | "template"
  label: string
  status: string
  sells: boolean
  theme: Record<string, unknown>
  sections: unknown[]
  prerendered: Record<string, unknown>
  template: string
  pages: string[]
  slop?: { chrome: { warnings: number; errors: number; rules: string[] }; site: { warnings: number; errors: number; rules: string[] }; chromeFiles: string[] }
}

async function main() {
  const out = process.argv[2]
  if (!out) throw new Error("usage: ai-site-chrome-r56-sites.js <out.json>")
  const only = (process.env.SITES ?? "").split(",").filter(Boolean)
  const { withUniversalChrome } = await import("@/lib/website-builder/universal-chrome")
  const { renderWithSources } = await import("@/lib/website-builder/storefront-render")
  const { templateForPage } = await import("@/lib/website-builder/site-pages")
  const { THEME_SETTINGS_GROUPS } = await import("@/lib/website-builder/theme-settings-schema")
  const { tokensToThemeSettings } = await import("@/lib/ai-builder/agent/tokens")
  const { evaluateSlop } = await import("@/lib/ai-builder/slop")
  const defaults = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as Record<string, unknown>

  const { siteMenus } = await import("@/lib/website-builder/storefront-data")
  const sites: OutSite[] = []
  /* What was generated, kept so a later run can draw the same sites again with changed renderers (STATES_IN). */
  const states: { o: Omit<OutSite, "sections" | "prerendered" | "template">; home: unknown[]; sources: Record<string, string> }[] = []
  const draw = (o: Omit<OutSite, "sections" | "prerendered" | "template">, home: unknown[], sources: Record<string, string>) => {
    states.push({ o, home, sources })
    const sections = withUniversalChrome(home as never, {})
    const template = templateForPage("home")
    /* The menus the live site hands the renderer (render-site.tsx: the store's menus, the theme's, main-menu from the header). */
    const data = { menus: siteMenus(o.theme as never, sections) }
    const prerendered = renderWithSources(sources, sections, o.theme as never, template, [], { title: "Home" }, data as never)
    sites.push({ ...o, sections, prerendered, template })
  }
  /* ── the starting templates, as applied ── */
  const { SITE_TEMPLATES, tokensFor } = await import("@/lib/storelib-ai/templates")
  for (const t of SITE_TEMPLATES) {
    const key = `template-${t.id}`
    if (only.length && !only.some((x) => key.includes(x))) continue
    const own = (t.themeSettings ?? {}) as Record<string, unknown>
    const mapped = tokensToThemeSettings(tokensFor(t) as never, { ...defaults, ...own }).settings as Record<string, unknown>
    const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
    const schemes = isRecord(own.color_schemes) && isRecord(mapped.color_schemes) ? { color_schemes: { ...own.color_schemes, ...mapped.color_schemes } } : {}
    const theme = { ...defaults, ...own, ...mapped, ...schemes, menus: t.menus }
    const home = t.pages.find((p) => p.key === "home") ?? t.pages[0]
    const sells = t.bindings?.some((b) => b.kind === "product" || b.kind === "products" || b.kind === "collection") ?? false
    draw({ key, source: "template", engine: "template", label: t.name, status: "applied", sells, theme, pages: t.pages.map((p) => p.key) }, home?.sections ?? [], t.files)
    /* The AI look warnings the template starts with: its frame (header and footer group) alone, and the whole site. */
    const chromeTypes = new Set((home?.sections ?? []).filter((s) => s.group === "header" || s.group === "footer").map((s) => s.type))
    const files = Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")).map(([path, content]) => ({ path, content }))
    const chromeFiles = files.filter((f) => chromeTypes.has(f.path.replace(/^sections\//, "").replace(/\.storelib$/, "")))
    const warn = (r: ReturnType<typeof evaluateSlop>) => ({ warnings: r.counts.warn, errors: r.counts.error, rules: r.findings.filter((f) => f.severity !== "info").map((f) => `${f.severity} ${f.rule}: ${f.message.slice(0, 120)}`) })
    sites[sites.length - 1].slop = { chrome: warn(evaluateSlop({ sources: chromeFiles })), site: warn(evaluateSlop({ sources: files, tokens: tokensFor(t) as never })), chromeFiles: chromeFiles.map((f) => f.path) }
  }

  /* ── the scripted evaluation's sites, both engines ── */
  if (process.env.STATES_IN) {
    /* The evaluation's sites as generated earlier, drawn again by today's renderers (the templates above are always today's). */
    const { readFileSync } = await import("node:fs")
    for (const x of JSON.parse(readFileSync(process.env.STATES_IN, "utf8"))) if (x.o.source === "eval" && (!only.length || only.some((y: string) => x.o.key.includes(y)))) draw(x.o, x.home, x.sources)
  } else if (process.env.SKIP_EVAL !== "1") {
    const { runEval } = await import("../tests/_eval/run")
    const r = await runEval({ outDir: null, browser: false, log: (l) => console.log(l) })
    for (const x of r.results) {
      const s = x.site
      const key = `${s.engine}-${s.scenario.id}`
      if (only.length && !only.some((y) => key.includes(y))) continue
      const home = s.pages.find((p) => p.key === "home")
      if (!home) continue
      const sells = s.pages.some((p) => p.sections.some((sec) => /product|collection|shop/.test(sec.type))) || /clothing|skincare/.test(s.scenario.id)
      draw({ key, source: "eval", engine: s.engine, label: `${s.scenario.name} (${s.engine})`, status: s.status, sells, theme: s.settings as Record<string, unknown>, pages: s.pages.map((p) => p.key) }, home.sections, s.sources ?? {})
    }
  }
  writeFileSync(out, JSON.stringify(sites))
  writeFileSync(out.replace(/\.json$/, "") + ".states.json", JSON.stringify(states))
  console.log(`${sites.length} sites written to ${out}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
