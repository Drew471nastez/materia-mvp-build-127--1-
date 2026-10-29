/**
 * ===========================================================================
 *  A POLICY WRITTEN IN WEBSITE SETTINGS, SAVED WHERE IT LIVES, CLEANED
 * ===========================================================================
 * Website Settings › Policies edits the refund, privacy, terms and shipping
 * policies in a rich text field. Pinned here:
 *
 *   THE WORDS     lib/website-builder/policy-editing: which section holds a
 *                 policy's words, what counts as empty, and a body written
 *                 back into the page without touching anything else on it.
 *   THE SAVE      loadPolicy and savePolicy against the real sections route
 *                 (app/api/website-builder/themes/[installId]/sections), with
 *                 its database swapped for an in-memory one: a draft, never
 *                 the live page, and script, handlers and javascript: links
 *                 cleaned out by the route's own sanitiser even when the
 *                 browser sent them.
 *   SHIPPING      a template like the others, not one of the pages every
 *                 site is given, grouped with the policies once it exists.
 *   THE SCREEN    one card a policy, the builder's own writer for the page
 *                 the builder has open, and the field's page variant.
 *
 *   npx tsx tests/policy-editing.test.ts
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import {
  EDITABLE_POLICIES,
  POLICY_PAGES,
  POLICY_PAGE_KEYS,
  SHIPPING_POLICY,
  policyPageSections,
} from "@/lib/website-builder/policy-pages"
import {
  editedLabel,
  isBlankHtml,
  loadPolicy,
  policyBodyOf,
  policyBodySection,
  savePolicy,
  withPolicyBody,
} from "@/lib/website-builder/policy-editing"
import { pageGroupOf } from "@/lib/website-builder/page-groups"
import type { SectionInstance } from "@/lib/website-builder/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const HEADER: SectionInstance = { id: "header", type: "header", name: "Header", settings: {}, blocks: [], hidden: false }
const FOOTER: SectionInstance = { id: "footer", type: "footer", name: "Footer", settings: {}, blocks: [], hidden: false }
const refund = POLICY_PAGES.find((p) => p.key === "refund-policy")!

/** What a hostile or careless paste could put in a policy. */
const DIRTY =
  `<h2>Returns</h2><p onclick="steal()">Within <strong>30</strong> days.</p>` +
  `<script>alert(1)</script><img src=x onerror="alert(2)">` +
  `<p><a href="javascript:alert(3)">click</a> or <a href="/contact">contact us</a></p>` +
  `<ul><li>One</li></ul><blockquote>Quoted</blockquote><p style="background:url(https://evil.example/x)">styled</p>`

const clean = (html: string) =>
  !/<script|onerror|onclick|javascript:|style=|alert\(1\)/i.test(html)

function words() {
  console.log("\nWhich section holds a policy's words")
  const page = policyPageSections(refund, { brand: "Acme", header: HEADER, footer: FOOTER })
  const body = policyBodySection(page)
  check("the page's rich text section, between the header and the footer", !!body && body.type === "rich_text" && page.indexOf(body) === 1)
  check("its body is the template's text", /Last updated/.test(policyBodyOf(page)) && /Acme/.test(policyBodyOf(page)))
  check("a page with no rich text section has no words, not an error", policyBodyOf([HEADER, FOOTER]) === "")

  console.log("\nWhat counts as empty")
  check("nothing, an empty paragraph and spaces are empty", isBlankHtml("") && isBlankHtml("<p></p>") && isBlankHtml("<p> &nbsp; </p><br>") && isBlankHtml(null))
  check("one word is not", !isBlankHtml("<p>Hi</p>"))

  console.log("\nA body written back")
  const next = withPolicyBody(page, refund, DIRTY, "Acme")
  const written = policyBodyOf(next)
  check("only the body changes: the header, the footer and the body's other settings are the same objects or values",
    next[0] === page[0] && next[2] === page[2] && next[1].id === page[1].id && next[1].settings.heading === page[1].settings.heading && next[1].settings.max_width === "narrow")
  check("the page's own copy is not changed in place", /Last updated/.test(policyBodyOf(page)))
  check("it is cleaned on the way out of the field: no script, handler, style or javascript: link", clean(written), written)
  check("and what a policy is written with survives: H2, bold, a list, a quote, a link to a page",
    /<h2>Returns<\/h2>/.test(written) && /<strong>30<\/strong>/.test(written) && /<ul><li>One<\/li><\/ul>/.test(written) && /<blockquote>Quoted<\/blockquote>/.test(written) && /<a href="\/contact">contact us<\/a>/.test(written), written)
  const bare = withPolicyBody([HEADER, FOOTER], refund, "<p>Mine</p>", "Acme")
  check("a page whose text section was deleted gets the policy's own back, above the footer",
    bare.length === 3 && bare[1].type === "rich_text" && bare[2].id === "footer" && policyBodyOf(bare) === "<p>Mine</p>")

  console.log("\nLast edited")
  const now = new Date("2026-10-03T12:00:00Z")
  const sept = editedLabel("2026-09-12T08:00:00Z", now)
  check("today, yesterday, a date", editedLabel("2026-10-03T08:00:00Z", now) === "Edited today" && editedLabel("2026-10-02T08:00:00Z", now) === "Edited yesterday" && (sept === "Edited 12 Sept" || sept === "Edited 12 Sep"), sept)
  check("an older year says the year", /2025/.test(editedLabel("2025-01-05T08:00:00Z", now) ?? ""))
  check("no date, no line", editedLabel(null) === null && editedLabel("not a date") === null)
}

function shipping() {
  console.log("\nShipping")
  check("it is edited with the other three", EDITABLE_POLICIES.map((p) => p.key).join() === "refund-policy,privacy-policy,terms-of-service,shipping-policy")
  check("but it is not one of the pages every site is given", !POLICY_PAGES.includes(SHIPPING_POLICY) && POLICY_PAGE_KEYS.join() === "refund-policy,privacy-policy,terms-of-service")
  check("its address is the one the footer looks for", read("lib/website-builder/footer-settings.ts").includes(`"${SHIPPING_POLICY.key}"`))
  check("its template is placeholders in square brackets, not promises", /\[[^\]]+\]/.test(SHIPPING_POLICY.body("Acme")) && !/guarantee/i.test(SHIPPING_POLICY.body("Acme")))
  check("in the page switcher it sits with the policies, after them", pageGroupOf(SHIPPING_POLICY.key) === "policies")
}

/* ─── The real route, with the database swapped ─────────────────────────── */

const S: any = ((globalThis as any).__policyStubs = { db: null, user: null })
const dir = mkdtempSync(join(tmpdir(), "policy-editing-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/server": stub(
    "server",
    `export const createClient = async () => ({ from: (t) => globalThis.__policyStubs.db.from(t), auth: { getUser: async () => ({ data: { user: globalThis.__policyStubs.user }, error: null }) } })\n`,
  ),
  "@/lib/api/rate-limit": stub("rate", `export const LIMITS = new Proxy({}, { get: () => [] })\nexport const rateLimit = async () => null\n`),
  "@/lib/website-builder/published-site": stub("published", `export const revalidatePublishedSite = async () => { globalThis.__policyStubs.revalidated = true }\n`),
  "@/lib/website-builder/custom-schemas": stub("custom", `export const customSchemaLookup = async () => undefined\n`),
  /* Changed on purpose (round 44): the route announces a page published or deleted on the live site (IndexNow); off here, as without a key. */
  "@/lib/seo/announce": stub("announce", `export const announce = async () => {}\nexport const websiteAddresses = async () => []\n`),
  "@/lib/seo/indexnow": stub("indexnow", `export const indexNowKey = () => null\n`),
  /* Changed on purpose (round 42 team): the route asks lib/team/website whose store and install; the owner's path, on the stubbed database. */
  "@/lib/team/website": stub(
    "website",
    `export const websiteInstallCaller = async (installId) => {
  const S = globalThis.__policyStubs, user = S.user
  if (!user) return { error: "Unauthorized", status: 401, supabase: null, install: null }
  const { data: c } = await S.db.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const { data: install } = c ? await S.db.from("store_theme_installs").select("id, creator_id").eq("id", installId).eq("creator_id", c.id).maybeSingle() : { data: null }
  if (!install) return { error: "Theme not found", status: 404, supabase: null, install: null }
  return { error: null, status: 200, supabase: S.db, user, userId: user.id, creatorId: c.id, creator: { id: c.id }, isOwner: true, ownerUserId: user.id, acting: null, install }
}\n`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__policy-editing__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    plugins: [
      {
        name: "stand-ins",
        setup(b) {
          const names = new Set(Object.keys(stubs))
          b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined))
        },
      },
    ],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const INSTALL = "33333333-3333-4333-8333-333333333333"

async function theRoute() {
  const route = (await import(await bundle("app/api/website-builder/themes/[installId]/sections/route.ts"))) as any
  const live = policyPageSections(refund, { brand: "Acme", header: HEADER, footer: FOOTER })
  const db = fakeDb({
    creators: [{ id: CREATOR, user_id: OWNER }],
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR }],
    store_theme_custom_files: [],
    store_theme_pages: [
      { id: "p-refund", install_id: INSTALL, page_key: "refund-policy", sections: live, draft_sections: null, updated_at: "2026-09-20T10:00:00Z" },
    ],
  })
  S.db = db
  S.user = { id: OWNER }
  const params = { params: Promise.resolve({ installId: INSTALL }) }
  const calls: string[] = []
  /* The browser's fetch, answered by the route as it ships. */
  const fetcher = async (input: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${input}`)
    const req = new Request(`https://storelib.test${input}`, init)
    return init?.method === "PUT" ? route.PUT(req, params) : route.GET(req, params)
  }
  const row = (key: string): any => db.tables.store_theme_pages.find((r: any) => r.page_key === key)

  console.log("\nOpening a policy")
  const opened = await loadPolicy(fetcher, INSTALL, "refund-policy")
  check("it reads the page the builder would open, by the builder's route", calls[0] === `GET /api/website-builder/themes/${INSTALL}/sections?page=refund-policy`, calls[0])
  check("with its words and when it was last saved", /Acme/.test(policyBodyOf(opened.sections)) && opened.exists && opened.updatedAt === "2026-09-20T10:00:00Z", opened.updatedAt)
  const none = await loadPolicy(fetcher, INSTALL, "shipping-policy")
  check("a shipping policy nobody has written is not there, and that is not an error", !none.exists && none.sections.length === 0)

  console.log("\nSaving one")
  /* What the field sends is already clean; this sends the dirty markup straight, as a client that skipped the field would. */
  const raw = opened.sections.map((s) => (s.type === "rich_text" ? { ...s, settings: { ...s.settings, body: DIRTY } } : s))
  await savePolicy(fetcher, INSTALL, "refund-policy", raw)
  const saved = row("refund-policy")
  check("it is saved as a draft: the live page is untouched", Array.isArray(saved.draft_sections) && saved.sections === live && !S.revalidated)
  const stored = policyBodyOf(saved.draft_sections)
  check("the route's sanitiser cleaned what the browser sent", clean(stored), stored)
  check("and kept what a policy is written with", /<h2>Returns<\/h2>/.test(stored) && /<blockquote>Quoted<\/blockquote>/.test(stored) && /href="\/contact"/.test(stored), stored)
  check("the header and footer went back as they came", saved.draft_sections[0].id === "header" && saved.draft_sections[2].id === "footer" && saved.draft_sections.length === 3)
  const again = await loadPolicy(fetcher, INSTALL, "refund-policy")
  check("opened again, it shows the draft", policyBodyOf(again.sections) === stored)

  console.log("\nA shipping policy from its template")
  const made = withPolicyBody(policyPageSections(SHIPPING_POLICY, { brand: "Acme", header: HEADER, footer: FOOTER }), SHIPPING_POLICY, SHIPPING_POLICY.body("Acme"), "Acme")
  await savePolicy(fetcher, INSTALL, SHIPPING_POLICY.key, made)
  const ship = row(SHIPPING_POLICY.key)
  check("Use template creates the page, as a draft, with the site's header and footer", !!ship && Array.isArray(ship.draft_sections) && ship.draft_sections.map((s: SectionInstance) => s.type).join() === "header,rich_text,footer")
  check("and the template's words", /Where we ship/.test(policyBodyOf(ship.draft_sections)))

  console.log("\nWhen the route says no")
  S.user = null
  let message = ""
  try {
    await savePolicy(fetcher, INSTALL, "refund-policy", raw)
  } catch (e) {
    message = (e as Error).message
  }
  check("a save that fails throws the route's own sentence, so the card can say it", message === "Unauthorized", message)
  S.user = { id: OWNER }
}

function screen() {
  console.log("\nThe screen")
  const settings = read("components/website-builder/website-settings/policies.tsx")
  const field = read("components/website-builder/rich-text-field.tsx")
  check("one card a policy, shipping last", /POLICY_PAGES\.map\(\(page\) => \(\s*<PolicyCard/.test(settings) && /<PolicyCard ctx=\{ctx\} page=\{SHIPPING_POLICY\} optional \/>/.test(settings))
  check("a policy is written in the builder's rich text field, in its page variant", /<RichTextField\s+variant="page"/.test(settings))
  check("saved through loadPolicy and savePolicy, never a second store", /savePolicy\(fetcher, ctx\.installId, page\.key, next\)/.test(settings) && !/localStorage|onSettingChange\("policy/.test(settings))
  check("the page open in the builder is written with the builder's own section writer", /ctx\.onSectionSetting\?\.\(liveBody\.id, "body", html\)/.test(settings))
  check("Use template fills in the template's words", /write\(page\.body\(brand\)\)/.test(settings))
  check("the field's page variant: H2, H3 and a quote, a sticky bar, no ceiling",
    /label="Heading 2"/.test(field) && /label="Heading 3"/.test(field) && /label="Quote"/.test(field) && /sticky top-12 z-\[2\] md:top-0/.test(field) && /!max-h-none/.test(field))
  check("16px on a phone in the field and the link box, so iOS does not zoom", /page && "!max-h-none px-4 py-3 text-\[15px\] leading-\[1\.6\] max-sm:text-\[16px\]"/.test(field) && /max-sm:text-\[16px\] outline-none focus:border-neutral-400/.test(field))
  check("44px toolbar buttons on a phone", /size === "page" \? "h-8 w-8 max-sm:h-11 max-sm:w-11"/.test(field))
  check("no em dash in what the screen prints", !/>[^<]*—[^<]*</.test(settings))
}

async function main() {
  words()
  shipping()
  await theRoute()
  screen()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
