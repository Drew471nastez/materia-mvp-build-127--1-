/**
 * ===========================================================================
 *  ROUND R, R3: THE NATIVE DRAFT, LOOKED AT AND REFINED
 * ===========================================================================
 * lib/website-builder/ai-site/native-review: a page built from Storelib's
 * NATIVE sections is drawn the way the live site draws it (ThemePage, the
 * section renderers, the app's compiled CSS), photographed and measured at
 * 1440 and 390 with JavaScript off, and fixed with small typed patches to the
 * draft's data, at most two rounds, with an honest status.
 *
 *   1. The patch language, pure: paths validated against the real schemas,
 *      values held to their type, options and range; refusals with reasons;
 *      patches become the editor's own operations.
 *   2. The checks the data answers, pure: the same section three times in a
 *      row, spacing with no rhythm, links to nowhere, the extended browser
 *      measurements as defects (the header over the page is a gate).
 *   3. The served page made into the critic's document: no script, the
 *      site's stylesheets, React's streamed sections put back.
 *   4. REAL CHROMIUM on fixture native sites: overflow at 390 found and fixed
 *      by a patch; a broken picture found and emptied; unreadable text fixed
 *      by a patch; repetition flagged and broken up; rounds bounded; no page
 *      script runs; a scripted vision review answers with patches (a bad one
 *      refused) and its spend is counted; a cap too small for the review
 *      leaves it "measured" with no call; no browser is "not visually checked".
 *   5. The classic job's check step runs the review: the patches are in the
 *      job's log for the editor, the draft is saved, the outcome is kept and
 *      said in plain words while it runs.
 *
 * Without a browser here, sections 4 and 5 say so and are skipped.
 *
 * Run: node scripts/run-push-tests.mjs (or the SUITES subset approach).
 */
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import postcss from "postcss"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { SiteState } from "@/lib/website-builder/ai-site/apply"
import { applyPatches, compilePatch, fitValue, parsePath, registryLookup, schemaLookup, sectionPath, type NativePatch } from "@/lib/website-builder/ai-site/native-review/patch"
import { knownLinks, repeatedRuns, structuralDefects } from "@/lib/website-builder/ai-site/native-review/checks"
import { fixFor, planFixes } from "@/lib/website-builder/ai-site/native-review/fixes"
import { nativeCriticDocument, servedToDocument, SETTLE_ID, UNSTREAM } from "@/lib/website-builder/ai-site/native-review/document"
import { reviewNativeDraft, defectScore, MAX_REVIEW_ROUNDS, type NativeRenderer } from "@/lib/website-builder/ai-site/native-review/review"
import { nativeReviewEnabled } from "@/lib/website-builder/ai-site/native-review/flag"
import { REVIEW_PHASE_WORDS } from "@/lib/website-builder/ai-site/native-review/words"
import { localNativeRenderer } from "@/lib/website-builder/ai-site/native-review/render-local"
import { extendedDefects, measuredDefects, type Measurements } from "@/lib/ai-builder/visual-critic/measure"
import { shootPages, type ShotPage } from "@/lib/ai-builder/visual-critic/shoot"
import { newJob, publicView, runStep, type Job, type JobDeps, type NativeReviewPort } from "@/lib/website-builder/ai-site/job"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "@/lib/sites/agent/types"
import { ZERO_USAGE } from "@/lib/sites/agent/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail)?.slice(0, 1500)}`}`)
  }
}
const section = (t: string) => console.log(`\n── ${t}`)

const CHROMIUM = process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH) ? process.env.CHROMIUM_PATH : existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null
const schemas = SECTION_SCHEMAS
const lookup = schemaLookup(schemas)

const sec = (id: string, type: string, settings: Record<string, unknown>, blocks: SectionInstance["blocks"] = []): SectionInstance => ({ id, type, name: type, settings, blocks })
const header = () =>
  sec("hdr", "header", { logo_text: "Northside Strength", logo_mode: "text" }, [
    { id: "n1", type: "nav_link", settings: { label: "Coaching", url: "/coaching" } },
    { id: "n2", type: "nav_link", settings: { label: "Contact", url: "/contact" } },
  ])
/* A header whose menu leads only to pages the site has. */
const headerOk = () => sec("hdr", "header", { logo_text: "Northside Strength", logo_mode: "text" }, [{ id: "n2", type: "nav_link", settings: { label: "Contact", url: "/contact" } }])
const footer = () => sec("ftr", "footer", {})
const hero = (extra: Record<string, unknown> = {}) => sec("hero1", "hero", { heading: "Strength coaching for busy people", subheading: "Three sessions a week, planned around your job.", button_text: "Book a free call", button_url: "/contact", ...extra })
const features = (id: string, heading: string) =>
  sec(id, "feature_grid", { heading, columns: "3" }, [
    { id: `${id}-a`, type: "feature", settings: { title: "A plan", description: "Written for you." } },
    { id: `${id}-b`, type: "feature", settings: { title: "Check-ins", description: "Every week." } },
    { id: `${id}-c`, type: "feature", settings: { title: "Video review", description: "Within a day." } },
  ])
const contactPage = () => [header(), sec("rt-c", "rich_text", { heading: "Get in touch", body: "<p>Write to us.</p>" }), footer()]

/** The app's stylesheet, as the build makes it: app/site.css through scripts/site-css.cjs and Tailwind. */
async function siteCss(): Promise<string> {
  const root = process.cwd()
  const built = join(root, ".next-css", "site.css")
  if (existsSync(built)) return readFileSync(built, "utf8")
  const req = createRequire(join(root, "package.json"))
  const from = join(root, "app", "site.css")
  const out = await postcss([req(join(root, "scripts", "site-css.cjs"))(), req("@tailwindcss/postcss")()]).process(readFileSync(from, "utf8"), { from })
  return out.css
}

function scriptedVision(answer: (req: ProviderRequest, n: number) => string): { provider: AgentProvider; calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = []
  const provider = {
    id: "anthropic",
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      calls.push(req)
      return { text: answer(req, calls.length), toolCalls: [], usage: { ...ZERO_USAGE, inputTokens: 9_000, outputTokens: 700 }, stop: "end" } as unknown as ProviderTurn
    },
  } as unknown as AgentProvider
  return { provider, calls }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("1. The patch language")
  // ═══════════════════════════════════════════════════════════════════════
  const site: SiteState = { settings: {}, pages: { home: [header(), hero(), sec("rt1", "rich_text", { heading: "How it works", text_color: "#eeeeee" }), footer()], contact: contactPage() } }
  check("paths parse to their targets", JSON.stringify(parsePath("/pages/home/sections/rt1/settings/text_color")) === JSON.stringify({ kind: "section-setting", page: "home", section: "rt1", key: "text_color" }) && (parsePath("/theme/page_width") as { kind: string }).kind === "theme" && (parsePath("/pages/home/sections/hdr/blocks/n1/settings/url") as { kind: string }).kind === "block-setting")
  check("a path that names nothing is refused", "error" in parsePath("/pages/home/rt1") && "error" in parsePath("pages/home") && "error" in parsePath("/pages/home/sections/a b"))
  const field = lookup.sectionField("hero", "font_size_heading")!
  check("a range is held to its range and snapped to its step", fitValue(field, 200).ok === false && fitValue(field, 40).ok === true)
  check("a link is never a script address", fitValue(lookup.sectionField("hero", "button_url")!, "javascript:alert(1)").ok === false && fitValue(lookup.sectionField("hero", "button_url")!, "/contact").ok === true)
  check("a select takes only its options", fitValue(lookup.sectionField("rich_text", "color_scheme")!, "neon").ok === false && fitValue(lookup.sectionField("rich_text", "color_scheme")!, "dark").ok === true)
  const unknown = compilePatch(site, { op: "set", path: sectionPath("home", "rt1", "settings", "glow"), value: 1 }, lookup)
  check("a setting the section does not declare is refused, with the reason", "error" in unknown && /no setting "glow"/.test((unknown as { error: string }).error), unknown)
  check("the header is never removed or hidden by a review", "error" in compilePatch(site, { op: "remove", path: sectionPath("home", "hdr") }, lookup) && "error" in compilePatch(site, { op: "set", path: sectionPath("home", "hdr", "hidden"), value: true }, lookup))
  const out = applyPatches(
    site,
    [
      { op: "remove", path: sectionPath("home", "rt1", "settings", "text_color") },
      { op: "set", path: sectionPath("home", "hero1", "settings", "font_size_heading"), value: 999 },
      { op: "reorder", path: sectionPath("home", "rt1"), to: 1 },
      { op: "remove", path: sectionPath("home", "hdr", "blocks", "n1") },
    ],
    lookup,
    schemas,
  )
  const rt = out.site.pages.home.find((s) => s.id === "rt1")!
  check("valid patches apply; the bad one is refused and changes nothing", out.applied.length === 3 && out.refused.length === 1 && rt.settings.text_color === undefined && out.site.pages.home.find((s) => s.id === "hero1")!.settings.font_size_heading === undefined, { applied: out.applied.length, refused: out.refused })
  check("patches become the editor's own operations, for its replay", out.ops.map((o) => o.op.kind).join(",") === "update_section,move_section,remove_block", out.ops.map((o) => o.op.kind))
  const reg = registryLookup({ sections: { rich_text: { settings: [{ id: "color_scheme", fieldType: "select", values: ["light", "dark"] }], blocks: [] } }, theme: { settings: [] } }, lookup)
  check("R2's registry stands in for the schema: only what it lists, header from the fallback", "error" in compilePatch(site, { op: "set", path: sectionPath("home", "rt1", "settings", "text_color"), value: "#000000" }, reg) && !("error" in compilePatch(site, { op: "set", path: sectionPath("home", "rt1", "settings", "color_scheme"), value: "dark" }, reg)) && "error" in compilePatch(site, { op: "set", path: sectionPath("home", "rt1", "settings", "color_scheme"), value: "white" }, reg) && !("error" in compilePatch(site, { op: "set", path: sectionPath("home", "hdr", "settings", "show_cta_button"), value: false }, reg)))
  check("the original draft is not touched (pure)", site.pages.home.find((s) => s.id === "rt1")!.settings.text_color === "#eeeeee")

  // ═══════════════════════════════════════════════════════════════════════
  section("2. What the data says, and the extended measurements")
  // ═══════════════════════════════════════════════════════════════════════
  const repetitive: SiteState = { settings: {}, pages: { home: [header(), hero(), features("fa", "What you get"), features("fb", "How we coach"), features("fc", "Where we train"), sec("rt9", "rich_text", { heading: "Start", padding_top: 10, padding_bottom: 20 }), footer()] } }
  check("the same section three times in a row is found", repeatedRuns(repetitive.pages.home).length === 1 && repeatedRuns(repetitive.pages.home)[0].ids.length === 3)
  const sd = structuralDefects(repetitive, ["home"])
  check("it is a repetition defect on the third", sd.some((d) => d.kind === "repetition" && d.sectionId === "fc"), sd)
  const plan = planFixes(sd, { site: repetitive, schemas })
  const move = plan.patches.find((p) => p.op === "reorder")
  check("its fix moves the third after the next different section", !!move && move.path === sectionPath("home", "fc") && (move as { to: number }).to === 5, plan.patches)
  const moved = applyPatches(repetitive, plan.patches, lookup, schemas)
  check("after the patch there is no run of three", repeatedRuns(moved.site.pages.home).length === 0, moved.site.pages.home.map((s) => s.type))
  const rhythm = structuralDefects({ settings: {}, pages: { home: [header(), sec("a", "rich_text", { padding_top: 10, padding_bottom: 20 }), sec("b", "rich_text", { padding_top: 30, padding_bottom: 40 }), sec("c", "faq", { padding_top: 50, padding_bottom: 60 }), footer()] } }, ["home"])
  check("spacing with six different paddings has no rhythm", rhythm.some((d) => d.kind === "rhythm"))
  const base: Measurements = { viewport: "mobile", width: 390, foldHeight: 844, scrollOverflow: 0, widest: null, headings: [], smallTargets: [], contrast: [], brokenImages: [], missingImages: [], foldCtas: [{ sectionId: "hero1", sectionType: "hero", selector: "a.btn", href: "/coaching", tag: "a", hooked: false, text: "Book" }], placeholders: [], pageHeight: 2000 }
  const ext: Measurements = {
    ...base,
    overlaps: [{ sectionId: "hero1", sectionType: "hero", selector: "h1", text: "Strength", other: "Coaching", nav: true }],
    fonts: { families: [{ family: "a", chars: 100 }, { family: "b", chars: 100 }, { family: "c", chars: 100 }, { family: "d", chars: 100 }], sizes: [] },
    motion: [{ sectionId: "m1", sectionType: "scrolling_text", selector: "div.track", name: "marquee" }],
    links: [{ sectionId: "hero1", sectionType: "hero", selector: "a.btn", href: "/coaching", text: "Book", hooked: false, missing: false }, { sectionId: "rt1", sectionType: "rich_text", selector: "a", href: "#nowhere", text: "Jump", hooked: false, missing: true }],
  }
  const known = knownLinks({ settings: {}, pages: { home: [], contact: [] } })
  const extDefects = extendedDefects("home", ext, { known })
  check("the header drawn over the headline is a hard gate", extDefects.some((d) => d.kind === "overlap" && d.gate))
  check("four type families is a defect", extDefects.some((d) => d.kind === "font-families"))
  check("endless motion under reduced motion is a defect", extDefects.some((d) => d.kind === "reduced-motion" && d.sectionId === "m1"))
  check("the first screen's call to action to a page the site does not have is a gate; an anchor to nothing is a defect", extDefects.some((d) => d.kind === "broken-link" && d.gate && /\/coaching/.test(d.what)) && extDefects.some((d) => d.kind === "broken-link" && !d.gate && /#nowhere/.test(d.what)), extDefects.filter((d) => d.kind === "broken-link"))
  check("the agent's critic is unchanged: no extended defects unless asked", measuredDefects("home", ext).every((d) => !["overlap", "font-families", "reduced-motion", "broken-link"].includes(d.kind)))
  const relink = fixFor(extDefects.find((d) => d.kind === "broken-link" && d.gate)!, { site: { settings: {}, pages: { home: [header(), hero({ button_url: "/coaching" }), footer()], contact: contactPage() } }, schemas, primaryAction: { label: "Contact", href: "/contact" } })
  check("the dead call to action is pointed at the site's contact page", relink.length === 1 && relink[0].op === "set" && (relink[0] as { value: unknown }).value === "/contact", relink)
  const navFix = fixFor({ ...extDefects.find((d) => d.kind === "broken-link" && d.gate)!, sectionId: undefined, sectionType: "header" }, { site: { settings: {}, pages: { home: [header(), footer()] } }, schemas })
  check("a menu item to nowhere is taken out of the menu", navFix.length === 1 && navFix[0].op === "remove" && navFix[0].path === sectionPath("home", "hdr", "blocks", "n1"), navFix)
  check("the switch: on by default, off with AI_NATIVE_ENGINE=0 or AI_NATIVE_REVIEW=0", nativeReviewEnabled({}) && !nativeReviewEnabled({ AI_NATIVE_ENGINE: "0" }) && !nativeReviewEnabled({ AI_NATIVE_REVIEW: "off" }))
  check("a defect score weighs gates over everything", defectScore([{ ...extDefects[0], gate: true }]) > defectScore(extDefects.filter((d) => !d.gate)))

  // ═══════════════════════════════════════════════════════════════════════
  section("3. A served page made into the critic's document")
  // ═══════════════════════════════════════════════════════════════════════
  const served = `<!DOCTYPE html><html lang="ro"><head><link rel="stylesheet" href="/_next/static/chunks/a.css"><script src="/_next/static/chunks/main.js"></script><style>.x{color:red}</style></head><body><div onclick="steal()"><img src="/_next/image?url=a&amp;w=640" srcset="/x 1x"><a href="javascript:alert(1)">x</a></div><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><section>late</section></div><script>$RC("B:0","S:0")</script></body></html>`
  const docServed = servedToDocument(served, "https://storelib.com", { "https://storelib.com/_next/static/chunks/a.css": ".a{background:url(/_next/static/media/f.woff2)}" })
  check("no script, no handler, no script address survives", !/<script/i.test(docServed.html) && !/onclick/i.test(docServed.html) && !/javascript:/i.test(docServed.html))
  check("the site's stylesheet is put inline, its addresses made absolute", /url\(https:\/\/storelib\.com\/_next\/static\/media\/f\.woff2\)/.test(docServed.html) && docServed.cssHrefs[0] === "https://storelib.com/_next/static/chunks/a.css")
  check("pictures are addressed at the site; responsive sources dropped", /src="https:\/\/storelib\.com\/_next\/image\?url=a&amp;w=640"/.test(docServed.html) && !/srcset/.test(docServed.html))
  check("a CSP forbids scripts and the settle sheet carries its id", /script-src 'none'/.test(docServed.html) && docServed.html.includes(`id="${SETTLE_ID}"`) && /lang="ro"/.test(docServed.html))

  if (!CHROMIUM) {
    console.log("\n  (no Chromium here: sections 4 and 5 skipped)")
    return finish()
  }
  process.env.CHROMIUM_PATH = CHROMIUM

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Real Chromium, fixture native sites")
  // ═══════════════════════════════════════════════════════════════════════
  const t0 = Date.now()
  const css = await siteCss()
  console.log(`  (the app's stylesheet: ${Math.round(css.length / 1024)}KB in ${Date.now() - t0}ms)`)
  const local = localNativeRenderer({ css })
  let renders = 0
  const counted: NativeRenderer = async (s, pages) => {
    renders++
    return local(s, pages)
  }
  const writes: { pages: string[] }[] = []
  const deps = { render: counted, shoot: shootPages, schemas, write: async (_s: SiteState, pages: string[]) => void writes.push({ pages }) }

  /* A whole fixture site: an ebook showcase whose 3D mockup sticks out of a phone, unreadable text, a broken picture, three feature grids in a row. */
  const fixture: SiteState = {
    settings: {},
    pages: {
      home: [
        header(),
        hero(),
        sec("rt1", "rich_text", { heading: "How it works", body: "<p>We start with a call.</p>", text_color: "#eeeeee" }),
        features("fa", "What you get"),
        features("fb", "How we coach"),
        features("fc", "Where we train"),
        sec("sc1", "split_content", { heading: "Meet your coach", body: "<p>Ten years coaching.</p>", image: "https://images.invalid/coach.jpg" }),
        sec("eb1", "ebook_showcase", { heading: "The training book", buy_button_text: "Get the book", buy_button_url: "/contact" }),
        footer(),
      ],
      contact: contactPage(),
    },
  }
  const phases: string[] = []
  const r = await reviewNativeDraft(
    { site: fixture, pages: ["home"], brief: "A strength coach for busy people.", primaryAction: { label: "Contact", href: "/contact" }, known: knownLinks(fixture), maxUsd: 1, timeoutMs: 170_000 },
    { ...deps, progress: (p) => void phases.push(p) },
  )
  const kinds = (list: { kind: string }[]) => list.map((d) => d.kind)
  check("the page was drawn and measured with the page's own scripts off", r.status === "measured" && r.jsDisabled, { status: r.status, reason: r.reason })
  check("no vision model: measured only, said so", r.label === "Measured on a laptop and a phone, not looked over by the reviewer" && /no vision model/.test(r.reason ?? ""))
  const overflow = r.found.find((d) => d.kind === "overflow" && d.sectionId === "eb1")
  check("OVERFLOW at 390 found in the ebook showcase (a hard gate)", !!overflow && overflow.gate && overflow.viewport === "mobile", r.found.map((d) => `${d.kind}:${d.sectionId}`))
  check("…and fixed by a patch: its mockup set to flat", r.applied.some((p) => p.path === sectionPath("home", "eb1", "settings", "mockup_style") && (p as { value: unknown }).value === "flat") && !r.remaining.some((d) => d.kind === "overflow"), { applied: r.applied, remaining: kinds(r.remaining) })
  check("an EMPTY (broken) picture found", r.found.some((d) => d.kind === "image-broken" && d.sectionId === "sc1"))
  check("…its picture setting emptied, the words kept", r.site.pages.home.find((s) => s.id === "sc1")!.settings.image === "" && !r.site.pages.home.find((s) => s.id === "sc1")!.hidden && !r.remaining.some((d) => d.kind === "image-broken"))
  check("CONTRAST found (light grey on white is unreadable, a gate)", r.found.some((d) => d.kind === "contrast" && d.sectionId === "rt1" && d.gate))
  check("…and fixed: the section's own text colour taken off, re-measured clean", r.site.pages.home.find((s) => s.id === "rt1")!.settings.text_color === undefined && !r.remaining.some((d) => d.kind === "contrast" && d.sectionId === "rt1"), kinds(r.remaining))
  check("REPETITION flagged: three feature grids in a row", r.found.some((d) => d.kind === "repetition"))
  check("…and broken up by moving one", repeatedRuns(r.site.pages.home).length === 0 && r.applied.some((p) => p.op === "reorder"))
  const hdr = r.site.pages.home.find((s) => s.id === "hdr")!
  check("the built-in header's default \"Shop Now\" going to \"#\" is found (a gate) and given the site's main action", r.found.some((d) => d.kind === "dead-cta" && d.sectionType === "header" && d.gate) && hdr.settings.cta_text === "Contact" && hdr.settings.cta_url === "/contact", { found: r.found.filter((d) => d.kind === "dead-cta"), hdr: hdr.settings })
  check("the menu item to a page the site does not have is taken out", !(hdr.blocks ?? []).some((b) => b.settings.url === "/coaching"))
  check(`BOUNDED: at most ${MAX_REVIEW_ROUNDS} rounds, one look per round plus the first`, r.rounds >= 1 && r.rounds <= MAX_REVIEW_ROUNDS && renders <= MAX_REVIEW_ROUNDS + 1, { rounds: r.rounds, renders })
  check("every round of patches was saved through the job's writer", writes.length === r.rounds + r.reverted.length && writes.every((w) => w.pages.includes("home")))
  check("the patches are the editor's operations, nothing regenerated", r.ops.length >= 4 && r.ops.every((o) => ["update_section", "move_section", "set_section_visibility", "update_block", "remove_block"].includes(o.op.kind)), r.ops.map((o) => o.op.kind))
  check("the phases, in plain words", phases[0] === "checking" && phases.includes("fixing") && phases.includes("rechecking") && REVIEW_PHASE_WORDS.checking === "Checking the design on a laptop and a phone")
  check("a gate count lower after than before", r.remaining.filter((d) => d.gate).length < r.found.filter((d) => d.gate).length, { before: kinds(r.found.filter((d) => d.gate)), after: kinds(r.remaining.filter((d) => d.gate)) })

  /* No JavaScript: a renderer whose document still carries a script (as if stripping had failed) is photographed with that script NOT run. */
  const sneaky: NativeRenderer = async (s, pages) => {
    const docs = (await local(s, pages)) ?? []
    return docs.map((d) => ({ ...d, html: d.html.replace("</body>", `<script>document.documentElement.setAttribute('data-critic-js','1');document.body.innerHTML=''</script></body>`) }))
  }
  const noJs = await reviewNativeDraft({ site: { settings: {}, pages: { home: [headerOk(), hero(), footer()], contact: contactPage() } }, pages: ["home"], brief: "x", maxUsd: 0, timeoutMs: 60_000 }, { ...deps, render: sneaky })
  check("NO JS EXECUTED: the page's script did not run (proved by the browser), the page was still measured", noJs.jsDisabled && noJs.status === "measured" && !noJs.found.some((d) => d.kind === "empty-section"), { js: noJs.jsDisabled, status: noJs.status })

  /* A defect no patch can place: rounds stay bounded and the job is told. */
  let loops = 0
  const stubborn: NativeRenderer = async (s, pages) => {
    loops++
    const docs = (await local(s, pages)) ?? []
    return docs.map((d) => ({ ...d, html: d.html.replace("</body>", `<div style="width:900px;height:10px"></div></body>`) }))
  }
  const st = await reviewNativeDraft({ site: { settings: {}, pages: { home: [headerOk(), hero(), footer()], contact: contactPage() } }, pages: ["home"], brief: "x", maxUsd: 0, timeoutMs: 60_000 }, { ...deps, render: stubborn })
  check("BOUNDED: an overflow no setting causes is reported, never patched, not looped on", loops <= MAX_REVIEW_ROUNDS + 1 && st.rounds <= MAX_REVIEW_ROUNDS && st.remaining.some((d) => d.kind === "overflow" && d.gate) && !st.applied.some((p) => /overflow/.test(p.why ?? "")), { loops, rounds: st.rounds, applied: st.applied })

  /* The vision review, scripted: scores, one valid patch, one that names a setting that does not exist. */
  const vision = scriptedVision(() =>
    JSON.stringify({
      scores: { identity: 3, composition: 3, typography: 4, offer: 4, mobile: 4, motion: 3, technical: 4 },
      verdict: "Clear, a little plain.",
      defects: [{ severity: "medium", page: "home", section: "hero1", observation: "The hero headline is very large for what it says.", why: "It crowds the offer.", fix: "A smaller heading size.", viewport: "desktop", observed: true }],
      patches: [
        { op: "set", path: "/pages/home/sections/hero1/settings/font_size_heading", value: 56, why: "calmer headline" },
        { op: "set", path: "/pages/home/sections/hero1/settings/sparkle", value: true },
      ],
    }),
  )
  const reviewedSite: SiteState = { settings: {}, pages: { home: [header(), hero({ font_size_heading: 96 }), sec("rt2", "rich_text", { heading: "How it works", body: "<p>We start with a call.</p>" }), footer()], contact: contactPage() } }
  const rv = await reviewNativeDraft({ site: reviewedSite, pages: ["home"], brief: "A strength coach.", primaryAction: { label: "Contact", href: "/contact" }, known: knownLinks(reviewedSite), maxUsd: 1, timeoutMs: 170_000 }, { ...deps, vision: { provider: vision.provider, model: "claude-opus-5-5" } })
  const sent = vision.calls[0]
  const firstTurn = (sent?.turns[0] ?? {}) as { content?: unknown; images?: unknown[] }
  check("REVIEWED: the vision model looked, once", rv.status === "reviewed" && vision.calls.length === 1 && rv.label === "Reviewed on a laptop and a phone", { status: rv.status, reason: rv.reason, calls: vision.calls.length })
  check("it was sent the photographs and the editable settings", !!sent && (firstTurn.images?.length ?? 0) === 4 && /THE EDITABLE SETTINGS/.test(String(firstTurn.content)) && /hero1 \(hero\)/.test(String(firstTurn.content)) && /"patches"/.test(sent.system))
  check("its valid patch applied, its invented one refused with the reason", rv.site.pages.home.find((s) => s.id === "hero1")!.settings.font_size_heading === 56 && rv.refused.some((x) => /no setting "sparkle"/.test(x.reason)), { refused: rv.refused })
  check("its spend is counted", rv.usage.calls === 1 && rv.usage.usd > 0 && rv.model === "claude-opus-5-5", rv.usage)
  check("the scores and verdict are kept", rv.weighted !== undefined && rv.verdict === "Clear, a little plain.")

  const capped = scriptedVision(() => "{}")
  const cp = await reviewNativeDraft({ site: reviewedSite, pages: ["home"], brief: "x", maxUsd: 0.001, timeoutMs: 120_000 }, { ...deps, vision: { provider: capped.provider, model: "claude-opus-5-5" } })
  check("a spending cap the review cannot fit: no call, measured, said why", capped.calls.length === 0 && cp.status === "measured" && /spending cap/.test(cp.reason ?? ""), { calls: capped.calls.length, reason: cp.reason })

  const none = await reviewNativeDraft({ site: reviewedSite, pages: ["home"], brief: "x", maxUsd: 1, timeoutMs: 60_000 }, { ...deps, available: () => ({ ok: false, reason: "no browser is available on this server" }) })
  check("no browser: NOT VISUALLY CHECKED, never a pass", none.status === "unverified" && none.label === "Not visually checked" && none.found.length === 0 && none.applied.length === 0)

  // ═══════════════════════════════════════════════════════════════════════
  section("5. The classic job's check step runs the review")
  // ═══════════════════════════════════════════════════════════════════════
  let stored: SiteState = JSON.parse(JSON.stringify({ settings: {}, pages: { home: [header(), hero(), sec("rt1", "rich_text", { heading: "How it works", body: "<p>We start with a call.</p>", text_color: "#eeeeee" }), footer()], contact: contactPage() } }))
  const saved: Job[] = []
  const port: NativeReviewPort = (req, hooks) => reviewNativeDraft(req, { render: local, shoot: shootPages, write: hooks.write, schemas: hooks.schemas, progress: hooks.progress })
  const jobDeps: JobDeps = {
    models: {} as JobDeps["models"],
    site: {
      read: async () => JSON.parse(JSON.stringify(stored)),
      write: async (s) => {
        stored = JSON.parse(JSON.stringify(s))
      },
    },
    capabilities: async () => {
      throw new Error("not used")
    },
    images: {} as JobDeps["images"],
    schemas,
    addable: [],
    nativeReview: port,
    save: async (j) => void saved.push(JSON.parse(JSON.stringify(j))),
  }
  let job: Job = newJob({ id: "7b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: "A strength coach" })
  job = { ...job, step: "check", status: "running", progress: 88, state: { ...job.state, checked: [], pages: [{ key: "home", title: "Home" }, { key: "contact", title: "Contact" }] } }
  const done = await runStep(job, jobDeps)
  check("the job finishes, the review kept on it", done.step === "done" && done.state.review?.status === "measured" && (done.state.review?.applied ?? 0) >= 1, done.state.review)
  check("the fix is in the job's log, so the editor replays it onto the canvas", done.state.ops.some((o) => o.op.kind === "update_section" && (o.op as { id: string }).id === "rt1"))
  check("…and in the saved draft", stored.pages.home.find((s) => s.id === "rt1")!.settings.text_color === undefined)
  check("while it ran, the progress view said what it was doing in plain words", saved.some((j) => publicView(j, 0).reviewing === "Checking the design on a laptop and a phone") && saved.some((j) => publicView(j, 0).reviewing === "Fixing what the check found"))
  check("after, no phase words, and the outcome in plain words", publicView(done, 0).reviewing === null && publicView(done, 0).review?.label === "Measured on a laptop and a phone, not looked over by the reviewer")
  check("nothing left that holds it back: complete", done.status === "complete" && done.state.findings.length === 0, { status: done.status, findings: done.state.findings })
  const late = await runStep({ ...job, state: { ...job.state } }, { ...jobDeps, deadline: Date.now() + 20_000 })
  check("too little time left in the request: the review waits for the next one", late.step === "check" && !late.state.review)
  const off = await runStep({ ...job }, { ...jobDeps, nativeReview: undefined })
  check("without the review (switch off): the check step ends as before, no review on the job", off.step === "done" && !off.state.review && publicView(off, 0).review === null)

  return finish()
}

function finish() {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
