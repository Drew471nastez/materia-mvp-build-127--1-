/**
 * Round BB: the website AI learns from the owner's AI source bank only, and the bank takes uploads.
 * The owner: "trained on... only and only [what] I'm attaching in the storelib.com admin in the AI source bank...
 * build a picker where I could upload zips or HTML or any kind of file and theme... make it stop using the old
 * references... imported with animations... get rid of the limit of credits usage for AI website building."
 *
 *   1. Upload: what the browser sends (text files, best first, no vendored code, pictures or lockfiles, under the
 *      request limit), how a theme moves pulled out on its own, a reference entry in the bank's id shape.
 *   2. The agent's templates: no built-in template for a new site; an uploaded theme read on every brief, its
 *      motion and its files shown, however far its words are from the brief.
 *   3. Knowledge search: the platform's working rules only, never the kit, the stock components or the looks.
 *   4. Design references: the admin's own only, never the built-in seeds.
 *   5. Limits: a short burst guard, no hourly or daily cap, a job budget that does not stop a site half built.
 *   6. SQL part 468, the upload route behind the admin gate, the admin page's picker.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-bank-only-bb.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { chooseUploadFiles, isUploadable, motionOf, motionScore, uploadSnapshot, UPLOAD_MAX_CHARS } from "@/lib/storelib-ai/bank/upload"
import { listingOf } from "@/lib/storelib-ai/bank/fit"
import { bankRowView } from "@/lib/storelib-ai/bank/admin"
import { bankTemplateLibrary, type BankReader } from "@/lib/ai-builder/agent/bank-templates"
import { briefFrom } from "@/lib/storelib-ai/direction/brief"
import { runSearchKnowledge, isRuleEntry } from "@/lib/storelib-ai/library/tool"
import { rankReferences, searchReferences } from "@/lib/storelib-ai/references/search"
import { LIMITS } from "@/lib/api/rate-limit"
import { AGENT_LIMITS, THEME_AGENT_LIMITS } from "@/lib/sites/rate-limit"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import type { SiteTemplate } from "@/lib/storelib-ai/templates"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail === undefined ? "" : `\n       ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── 1. upload ─────────────────────────────────────────────────────────── */
console.log("1. an uploaded theme")
const html = `<!doctype html><html><head><title>Northwind Coffee</title><style>
.hero{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
.card{transition:transform .3s ease, box-shadow .3s ease}
@media (prefers-reduced-motion: reduce){.hero{animation:none;opacity:1}}
</style></head><body><header class="nav">Northwind roasters</header><section class="hero"><h1>Roasted on Tuesdays, at your door by Friday</h1></section>
<script>const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")))</script></body></html>`
const files = [
  { path: "northwind/index.html", text: html },
  { path: "northwind/about.html", text: "<h1>About the roastery</h1><p>Small batches of single origin coffee.</p>" },
  { path: "northwind/css/site.css", text: ".grid{display:grid}\n.btn{transition:background .2s}" },
  { path: "northwind/js/app.js", text: "document.querySelectorAll('.reveal').forEach((el) => el.animate([{opacity:0},{opacity:1}], 400))" },
  { path: "northwind/js/vendor.min.js", text: "!function(){}" },
  { path: "northwind/node_modules/x/index.js", text: "module.exports = 1" },
  { path: "northwind/images/hero.jpg", text: "binary" },
  { path: "northwind/.DS_Store", text: "x" },
  { path: "northwind/package-lock.json", text: "{}" },
  { path: "northwind/sections/main-product.liquid", text: "<div class=\"product\">{{ product.title }}</div>{% schema %}{\"name\":\"Product\"}{% endschema %}" },
]
check("pictures, vendored code, dotfiles and lockfiles are not sent", !isUploadable("a/b.jpg") && !isUploadable("node_modules/a.js") && !isUploadable("a/.env") && !isUploadable("x/app.min.js") && !isUploadable("pnpm-lock.yaml"))
check("pages, styles, scripts, Liquid and Storelib files are", ["a.html", "b.css", "c.js", "d.liquid", "e.storelib", "f.tsx", "g.vue"].every(isUploadable))
const chosen = chooseUploadFiles(files)
check("the index page comes first", chosen.files[0]?.path === "northwind/index.html", chosen.files.map((f) => f.path))
check("only readable files are chosen", chosen.files.length === 5, chosen.files.map((f) => f.path))
const big = Array.from({ length: 40 }, (_, i) => ({ path: `p${i}.html`, text: "x".repeat(150_000) }))
const capped = chooseUploadFiles(big)
check("the batch stays under the request limit", capped.files.reduce((n, f) => n + f.text.length + f.path.length, 0) <= UPLOAD_MAX_CHARS && capped.left > 0, { kept: capped.files.length, left: capped.left })
check("a file that moves ranks over one that does not", motionScore(html) >= 4 && motionScore("<p>still</p>") === 0)
const motion = motionOf(Object.fromEntries(files.map((f) => [f.path, f.text])))
check("its keyframes are pulled out whole", /@keyframes rise\{from\{opacity:0;transform:translateY\(24px\)\}to\{opacity:1;transform:none\}\}/.test(motion), motion)
check("the rules that run them and the transitions too", /animation:rise/.test(motion) && /transition:transform/.test(motion))
check("the reduced motion answer and the script that starts reveals", /prefers-reduced-motion/.test(motion) && /IntersectionObserver/.test(motion) && /\.animate\(/.test(motion))
const snap = uploadSnapshot("Northwind coffee", files, "seed")!
check("an upload is a reference entry", snap.profile.kind === "reference" && snap.template.pages.length === 0)
check("its id fits part 467's check", /^bank-bk[0-9a-z]{1,8}$/.test(snap.template.id), snap.template.id)
check("how it moves is the first example", snap.profile.examples[0] === "__motion.css" && !!snap.template.files["__motion.css"])
check("its pages and sections are examples too", snap.profile.examples.includes("northwind/index.html") && snap.profile.examples.includes("northwind/sections/main-product.liquid"))
check("it has no website behind it", snap.template.source?.kind === "bank" && snap.template.source.installId === "")
check("its words become keywords to match briefs", snap.profile.keywords.includes("coffee"), snap.profile.keywords)
check("nothing readable is no entry", uploadSnapshot("x", [{ path: "a.png", text: "x" }]) === null)
check("two uploads of different themes get different ids", uploadSnapshot("A", files, "1")!.template.id !== uploadSnapshot("B", [{ path: "b.html", text: "<p>b</p>" }], "2")!.template.id)
const view = bankRowView({ id: "1", install_id: null, template_id: snap.template.id, name: "Northwind", kind: "reference", enabled: true, industries: null, keywords: null, profile: snap.profile, snapshot_at: "2026-11-16T00:00:00Z" })
check("the admin view of an upload has no website id", view.installId === "" && view.counts.files === 5)

async function main() {
/* ── 2. the agent's templates ──────────────────────────────────────────── */
console.log("2. the agent's templates")
const reader = (entries: { template: SiteTemplate; profile: typeof snap.profile }[]): BankReader => ({
  list: async () => entries.map((e) => listingOf(e.template.id, e.template.name, e.profile)),
  load: async (id) => entries.find((e) => e.template.id === id) ?? null,
})
const coach = briefFrom("A personal strength coach in Bucharest. People book a free first call, then train with me in the gym or online.")
const shop = briefFrom("An online store for my supplements: clean energy powders, sold with a cart and checkout.")
const empty = bankTemplateLibrary(reader([]))
check("an empty bank starts no new site from a built-in template", (await empty.choose(shop, null)) === null && (await empty.choose(coach, null)) === null)
check("an empty bank has no worked examples", (await empty.patterns(shop, null)) === "")
const withUpload = bankTemplateLibrary(reader([snap]))
check("an uploaded theme is never poured in", (await withUpload.choose(coach, null)) === null)
const pat = await withUpload.patterns(coach, null)
check("it is read on a brief its words do not match", pat.includes("Northwind coffee"), pat.slice(0, 200))
check("its motion is shown and named", pat.includes("how it moves") && pat.includes("@keyframes rise"))
check("its page is shown", pat.includes("Roasted on Tuesdays") || pat.includes("northwind/index.html"))
check("it is called the owner's standard", /uploaded as the standard/.test(pat))
check("an old job's built-in template still reads back", typeof withUpload.byId === "function")
}

/* ── 3. knowledge search ───────────────────────────────────────────────── */
console.log("3. knowledge search")
const queries = ["header menu drawer cart", "hero section layout", "product card grid", "testimonials carousel", "pricing table", "footer", "colour palette dark luxury", "type pairing display serif", "scroll reveal motion"]
const ids = queries.flatMap((q) => runSearchKnowledge({ query: q, limit: 6 }, { bankOnly: true }).entries.map((e) => e.id))
check("never the chrome kit", !ids.includes("chrome-kit"), ids)
check("never the stock component library", !ids.includes("component-interactive-library"))
check("never a look (hero, cards, pricing, testimonials)", !ids.some((id) => /^component-(hero|cards|pricing|testimonials|product-showcase|stats|gallery)$/.test(id)))
check("never a palette, a pairing, a layout or a style", !ids.some((id) => /^(color|style|layout|header|footer|industry|motion)-/.test(id)))
check("never a site template", !ids.some((id) => /^template[:-]/.test(id)))
check("every answer is a working rule", ids.every(isRuleEntry), ids.filter((id) => !isRuleEntry(id)))
const drawer = runSearchKnowledge({ query: "drawer focus trap scroll lock", limit: 4 }, { bankOnly: true }).entries.map((e) => e.id)
check("the rules are still there (a drawer's behaviour)", drawer.length > 0, drawer)
check("the agent searches bank-only", /bankOnly: true/.test(read("lib/ai-builder/agent/knowledge.ts")))

/* ── 4. design references ──────────────────────────────────────────────── */
console.log("4. design references")
check("no built-in seed is ranked when built-ins are off", rankReferences({ text: "a coffee roastery", industry: "food" }, { builtIns: false }).length === 0)
check("built-ins are still there for the gallery", rankReferences({ text: "a coffee roastery", industry: "food" }).length > 0)
check("search returns the admin's only", searchReferences({ text: "coffee" }, { builtIns: false }).length === 0)
check("the agent's reference search leaves built-ins out", /builtIns: false/.test(read("lib/storelib-ai/references/store.ts")) && /builtIns: false/.test(read("lib/ai-builder/agent/knowledge.ts")))

/* ── 5. limits ─────────────────────────────────────────────────────────── */
console.log("5. limits")
const longest = (ws: readonly { seconds: number }[]) => Math.max(...ws.map((w) => w.seconds))
check("building with AI has no window longer than a minute", longest(LIMITS.siteAi) <= 60 && longest(LIMITS.siteGenerate) <= 60 && longest(LIMITS.aiImage) <= 60, { siteAi: LIMITS.siteAi, siteGenerate: LIMITS.siteGenerate, aiImage: LIMITS.aiImage })
check("the website agent has no hourly or daily cap", longest(AGENT_LIMITS) <= 60 && longest(THEME_AGENT_LIMITS) <= 60, { AGENT_LIMITS, THEME_AGENT_LIMITS })
check("a job is not stopped half built by its budget", DEFAULT_JOB_BUDGET.maxUsd >= 200 && DEFAULT_JOB_BUDGET.maxIterations >= 400 && DEFAULT_JOB_BUDGET.maxWallMs >= 120 * 60_000, DEFAULT_JOB_BUDGET)

/* ── 6. SQL, route, page ───────────────────────────────────────────────── */
console.log("6. SQL part 468, the route and the page")
const sql = read("supabase/sql/run-now/468_ai_bank_uploads.sql")
check("part 468 lets install_id be empty", /ALTER COLUMN install_id DROP NOT NULL/.test(sql) && /to_regclass\('public\.ai_template_bank'\) IS NULL/.test(sql))
check("its migration copy matches", read("supabase/migrations/20271468_ai_bank_uploads.sql") === sql)
const after = read("supabase/sql/run-now/99_check_after.sql")
check("the after check knows it, and part 465 stays last", /as p468_ai_bank_uploads/.test(after) && after.indexOf("p468_") < after.indexOf("p465_"))
check("the README lists it", /`468_ai_bank_uploads\.sql`/.test(read("supabase/sql/run-now/README.md")))
const route = read("app/api/admin/ai-bank/upload/route.ts")
check("the upload route is behind the admin gate", /const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/.test(route))
const page = read("app/(storelib)/admin/ai-bank/ai-bank-admin.tsx")
check("the page takes a zip, files or a folder", /jszip/.test(page) && /webkitdirectory/.test(page) && /type="file" multiple/.test(page) && /onDrop/.test(page))
check("the page says nothing of built-in templates", !/built-in templates/.test(page))
check("prompts no longer point at the chrome kit", !/chromeKitForPrompt/.test(read("lib/ai-builder/agent/prompts.ts")))

void main().then(() => {
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  if (failed > 0) process.exit(1)
})
