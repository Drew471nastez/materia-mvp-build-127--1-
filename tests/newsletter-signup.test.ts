/**
 * ===========================================================================
 *  THE NEWSLETTER, FROM THE WEBSITE TO EMAILS › SUBSCRIBERS
 * ===========================================================================
 * The Email app's newsletter in the website builder (App embeds), in a
 * Storelib theme and in an imported one, end to end:
 *
 *   THE ROUTE     /api/website-builder/subscribe run for real against an
 *                 in-memory database: one subscriber, subscribed, with the
 *                 website and the box it came from, read in Emails as that
 *                 website and "Newsletter section"; twice is still one row;
 *                 an unknown site writes nothing.
 *   AN IMPORTED   its {% form 'customer' %} says which box it is (a section
 *   THEME         or the footer), the website's /contact sends it through
 *                 that route, and the subscriber says the same box. In the
 *                 builder's canvas it shows the theme's thank you and sends
 *                 nothing (it showed "It did not send" before).
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/newsletter-signup.test.ts
 */
import { register } from "node:module"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData, type SiteRequest } from "../lib/storelib-theme/compat/site"
import { sourceView } from "../lib/contacts/contact-source"
import { signupMode } from "../lib/website-builder/subscribe-client"
import { withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { NEWSLETTER_SECTION_TYPE } from "../lib/storelib-theme/compat/storelib-newsletter"
import { customAddableSections, customSectionSchemas } from "../lib/website-builder/storelib-schemas"
import { appForSection } from "../lib/website-builder/app-sections"
import { isStorelibNativeSection } from "../lib/storelib-theme/compat/native-sections"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}

const CREATOR = "11111111-1111-4111-8111-111111111111"

/* ── The route, with its database, its emails and its rate limit stood in ── */

const S: any = ((globalThis as any).__nlStubs = { admin: null, flows: [] as any[] })
const dir = mkdtempSync(join(tmpdir(), "nl-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__nlStubs.admin\n`),
  "@/lib/email": stub("email", `export const triggerEmailFlows = async (_db, p) => { globalThis.__nlStubs.flows.push(p) }\n`),
  "@/lib/api/rate-limit": stub("rate", `export const rateLimit = async () => null\nexport const addressSubject = () => "ip"\nexport const emailSubject = (e) => String(e)\nexport const LIMITS = { subscribe: [] }\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundleRoute(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__nl-routes__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
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

const db = () => fakeDb({ creators: [{ id: CREATOR, banned_at: null }], subscribers: [], contact_attributions: [], checkout_starts: [], store_theme_installs: [] }, { unique: { subscribers: [["creator_id", "email"]] } })
const post = (body: unknown, page = "https://luca.storelib.com/") =>
  new Request("https://luca.storelib.com/api/website-builder/subscribe", { method: "POST", headers: { "content-type": "application/json", referer: page, origin: new URL(page).origin, "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) })

async function routeChecks(route: { POST: (r: Request) => Promise<Response> }) {
  console.log("\nThe subscribe route")
  const d = db()
  S.admin = d
  S.flows = []
  const r = await route.POST(post({ creator_id: CREATOR, email: " Ana@Example.com ", placement: "newsletter", origin: { from: "direct" } }) as never)
  const rows = d.tables.subscribers
  const row = rows[0] ?? {}
  check("a sign up is answered ok", r.status === 200, r.status)
  check("one subscriber, subscribed, for this creator, the address lowercased", rows.length === 1 && row.creator_id === CREATOR && row.email === "ana@example.com" && row.status === "subscribed" && row.is_active === true, row)
  check("  with the website builder's source and a consent line that says the newsletter section", row.source === "website_builder_newsletter" && /newsletter section/.test(String(row.consent_text)), row)
  check("  and where: this website, the newsletter box", row.source_detail?.surface === "website" && row.source_detail?.site === "luca.storelib.com" && row.source_detail?.form === "newsletter", row.source_detail)
  const view = sourceView(row.source_detail, row.source)
  check("Emails › Subscribers reads it as the website and its newsletter section", view.label === "luca.storelib.com" && /Newsletter section/.test(view.detail), view)
  check("the welcome automation is started", S.flows.length === 1 && S.flows[0].triggerType === "new_subscriber" && S.flows[0].recipientEmail === "ana@example.com")
  const again = await route.POST(post({ creator_id: CREATOR, email: "ana@example.com", placement: "newsletter" }) as never)
  check("twice is the same answer and still one row", again.status === 200 && d.tables.subscribers.length === 1)
  const footer = await route.POST(post({ creator_id: CREATOR, email: "bo@example.com", placement: "footer" }) as never)
  const bo = d.tables.subscribers.find((x: any) => x.email === "bo@example.com")
  check("the footer's box is recorded as the footer's", footer.status === 200 && bo?.source_detail?.form === "footer" && /footer/.test(String(bo?.consent_text)), bo)
  const unknown = await route.POST(post({ creator_id: "22222222-2222-4222-8222-222222222222", email: "cy@example.com" }) as never)
  check("an unknown site writes nothing", unknown.status === 404 && !d.tables.subscribers.some((x: any) => x.email === "cy@example.com"))
  const bad = await route.POST(post({ creator_id: CREATOR, email: "not an email" }) as never)
  check("a bad address is refused in words", bad.status === 400 && /valid email/.test(String((await bad.json()).error)))
  check("a Storelib theme's form sends, never from the canvas", signupMode({ inEditor: false, creatorId: CREATOR }) === "send" && signupMode({ inEditor: true, creatorId: CREATOR }) === "preview")
}

/* ── An imported theme ── */

const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
const NL = `{% form 'customer' %}{% if form.posted_successfully? %}<p class="ok">Thanks for subscribing</p>{% endif %}{% if form.errors %}<p class="bad">{{ form.errors.messages.email }}</p>{% endif %}<input type="hidden" name="contact[tags]" value="newsletter"><input type="email" name="contact[email]">{% endform %}`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`),
  "sections/newsletter.storelib": section("newsletter", `<div class="nl-section">${NL}</div>`),
  "sections/footer.storelib": section("footer", `<footer class="ft">${NL}</footer>`),
}
const pages = { home: [{ id: "newsletter", type: "newsletter" }, { id: "footer", type: "footer", group: "footer" }] }
const shop = { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" }
const siteOf = (extra: Partial<SiteData> = {}): SiteData => ({ creatorId: CREATOR, theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }), pages, products: [], collections: [], menus: {}, shop, host: "luca.storelib.com", ...extra })
const call = (site: SiteData, method: string, url: string, extra: Partial<SiteRequest> = {}) => {
  const [p, q] = url.split("?")
  return answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body: null, cart: [], ...extra })
}
/** A form's fields as the browser sends them. */
function fieldsOf(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) out[m[1]] = m[2]
  return out
}

async function importedChecks(route: { POST: (r: Request) => Promise<Response> }) {
  console.log("\nAn imported theme's newsletter")
  const html = String((await call(siteOf(), "GET", "/")).body)
  const inSection = /<div class="nl-section">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ""
  const inFooter = /<footer class="ft">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? ""
  check("the section's form says it is the newsletter, the footer's the footer", fieldsOf(inSection).storelib_placement === "newsletter" && fieldsOf(inFooter).storelib_placement === "footer", [fieldsOf(inSection), fieldsOf(inFooter)])
  check("  and both are Storelib sign ups posted to the website's /contact", /data-storelib-form="subscribe"/.test(inSection) && /action="\/contact#contact_form"/.test(inSection))

  const d = db()
  S.admin = d
  /* The website's own route hands the sign up to the subscribe route, with the page's headers (app/api/site-theme/site route.ts). */
  const submit = async (kind: "subscribe" | "contact", payload: Record<string, unknown>) => {
    const r = await route.POST(post(payload, "https://luca.storelib.com/") as never)
    return { ok: r.ok && kind === "subscribe", status: r.status }
  }
  const sent = await call(siteOf(), "POST", "/contact", { body: { ...fieldsOf(inSection), "contact[email]": "dee@example.com" }, ajax: true, submit })
  const dee = d.tables.subscribers.find((x: any) => x.email === "dee@example.com")
  check("subscribing from the live page creates the subscriber", sent.status === 200 && JSON.parse(String(sent.body)).ok === true && dee?.status === "subscribed", dee)
  check("  as the newsletter section of this website", dee?.source_detail?.form === "newsletter" && dee?.source_detail?.site === "luca.storelib.com" && /newsletter section/.test(String(dee?.consent_text)), dee)
  await call(siteOf(), "POST", "/contact", { body: { ...fieldsOf(inFooter), "contact[email]": "eve@example.com" }, ajax: true, submit })
  check("  and the footer's as the footer's", d.tables.subscribers.find((x: any) => x.email === "eve@example.com")?.source_detail?.form === "footer")
  const old = await call(siteOf(), "POST", "/contact", { body: { form_type: "customer", "contact[email]": "fay@example.com" }, ajax: true, submit })
  check("  a page drawn before forms said so still subscribes, as the footer's (as before)", old.status === 200 && d.tables.subscribers.find((x: any) => x.email === "fay@example.com")?.source_detail?.form === "footer")

  console.log("\nIn the builder's canvas")
  const canvas = siteOf({ designMode: true })
  const before = d.tables.subscribers.length
  const back = await call(canvas, "POST", "/contact", { body: { ...fieldsOf(inSection), "contact[email]": "gus@example.com" }, referer: "/" })
  check("sending it answers as the website does, with the thank you", back.status === 303 && /customer_posted=true/.test(back.headers?.Location ?? ""), back.headers)
  check("  and nobody is subscribed from the editor", d.tables.subscribers.length === before)
  const thanks = String((await call(canvas, "GET", "/?customer_posted=true")).body)
  check("  the theme draws its own thank you there", /<p class="ok">Thanks for subscribing<\/p>/.test(thanks))
  const preview = await call(siteOf(), "POST", "/contact", { body: { form_type: "customer", "contact[email]": "hal@example.com" } })
  check("a page with nothing to send it with (a preview link) still says it did not go", /form_error=failed/.test(preview.headers?.Location ?? ""))
}

async function embedChecks(route: { POST: (r: Request) => Promise<Response> }) {
  console.log("\nStorelib Newsletter, the Email app's embed, in a theme with no newsletter of its own")
  const bare = withStorelibReviewsSection({
    "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body style="--color-button: 200,0,0"><main>{{ content_for_layout }}</main></body></html>`),
    "sections/hero.storelib": section("hero", `<h1>Home</h1>`),
  })
  const schemas = customSectionSchemas(bare)
  check("every imported theme has it, in Add section, filed under the Email app (App embeds)", !!bare[`sections/${NEWSLETTER_SECTION_TYPE}.storelib`] && customAddableSections(schemas).includes(NEWSLETTER_SECTION_TYPE) && appForSection(NEWSLETTER_SECTION_TYPE)?.app.id === "email", Object.keys(schemas))
  check("  a bar, a popup and a band in the page", (schemas[NEWSLETTER_SECTION_TYPE]?.presets ?? []).map((p: any) => p.settings?.look).join() === "bar,popup,inline")
  check("  kept by an import and a GitHub push like Storelib Reviews' sections", isStorelibNativeSection(NEWSLETTER_SECTION_TYPE))
  const site = (look: string, extra: Partial<SiteData> = {}): SiteData => ({ ...siteOf(extra), theme: new CompatTheme(bare, {}, { assetUrl: (n) => `/a/${n}` }), pages: { home: [{ id: "hero", type: "hero" }, { id: "nl", type: NEWSLETTER_SECTION_TYPE, settings: { look, heading: "Join us", consent: "Unsubscribe any time." } }] } as never })
  const live = String((await call(site("bar"), "GET", "/")).body)
  const bar = /<div class="slnl slnl--bar"[\s\S]*?<\/script>\s*<\/div>/.exec(live)?.[0] ?? ""
  check("on the website: a slim bar with its heading, an email box, the button and the consent line", !!bar && /Join us/.test(bar) && /type="email" name="contact\[email\]"/.test(bar) && /class="slnl__b"/.test(bar) && /Unsubscribe any time\./.test(bar), live.slice(0, 400))
  check("  a Storelib sign up, posted to the website's /contact, naming the bar", /data-storelib-form="subscribe"/.test(bar) && /action="\/contact#storelib-newsletter-nl"/.test(bar) && fieldsOf(bar).storelib_placement === "bar" && (bar.match(/name="storelib_placement"/g) ?? []).length === 1, fieldsOf(bar))
  check("  in the theme's colours and font: its button colour, inherited type", /var\(--color-button/.test(live) && /\.slnl\{font:inherit;color:inherit/.test(live))
  check("  with its script, which closes it and opens a popup after its delay", /<script>\(function\(\)\{var s=document\.currentScript/.test(bar))
  const canvas = String((await call(site("popup", { designMode: true }), "GET", "/")).body)
  check("in the builder's canvas: drawn open in the page, no script", /class="slnl slnl--popup slnl--canvas"/.test(canvas) && /data-canvas="1"/.test(canvas) && !/var s=document\.currentScript/.test(canvas))

  const d = db()
  S.admin = d
  const submit = async (_kind: "subscribe" | "contact", payload: Record<string, unknown>) => {
    const r = await route.POST(post(payload) as never)
    return { ok: r.ok, status: r.status }
  }
  const sent = await call(site("bar"), "POST", "/contact", { body: { ...fieldsOf(bar), "contact[email]": "ivy@example.com" }, ajax: true, submit })
  const ivy = d.tables.subscribers.find((x: any) => x.email === "ivy@example.com")
  check("subscribing from the bar creates the subscriber, recorded as the sign-up bar", sent.status === 200 && ivy?.status === "subscribed" && ivy?.source_detail?.form === "bar" && /sign-up bar/.test(String(ivy?.consent_text)), ivy)
  check("  Emails reads it as this website's Subscribe bar", sourceView(ivy?.source_detail, ivy?.source).detail === "Subscribe bar")
  const popupHtml = String((await call(site("popup"), "GET", "/")).body)
  await call(site("popup"), "POST", "/contact", { body: { ...fieldsOf(popupHtml), "contact[email]": "jo@example.com" }, ajax: true, submit })
  const jo = d.tables.subscribers.find((x: any) => x.email === "jo@example.com")
  check("  from the popup: a sign-up form, its consent line the popup's", fieldsOf(popupHtml).storelib_placement === "popup" && jo?.source_detail?.form === "section" && /popup/.test(String(jo?.consent_text)), jo)
  const thanks = String((await call(site("bar"), "GET", "/?customer_posted=true")).body)
  check("  and the bar then says thank you in place of the box", /<p class="slnl__ok" role="status">Thanks for subscribing\.<\/p>/.test(thanks) && !/class="slnl__i"/.test(thanks))
}

async function main() {
  const route = (await import(await bundleRoute("app/api/website-builder/subscribe/route.ts"))) as { POST: (r: Request) => Promise<Response> }
  await routeChecks(route)
  await importedChecks(route)
  await embedChecks(route)
  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`  failing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
