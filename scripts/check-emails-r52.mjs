/**
 * ===========================================================================
 *  ROUND 52: EMAILS, FORMS AND A COMMUNITY MEMBER, LOOKED AT AND MEASURED
 * ===========================================================================
 * The real components (scripts/render-emails-r52.tsx) against a stand-in
 * server, at 390x844 and 1280x800, light and dark, with nothing yet, while
 * loading and when every read fails. Each scene is a picture in SHOTS_DIR and
 * a few numbers that say the page is clean:
 *
 *   - the page never scrolls sideways at 390;
 *   - Emails has its three tabs and one main action per tab (New email on
 *     Campaigns, Create automation on Automations, none on Settings), and
 *     the old tabs (subscribers, flows) are gone from it;
 *   - Contacts › Forms draws no heading or back arrow of its own on its list
 *     (the Contacts bar is the page's), and no link from it goes to the old
 *     Emails leads tab;
 *   - a form opens on Edit | Responses | Insights | Settings, a response has
 *     View contact, the inbox and a message open;
 *   - a member's sheet has their activity, their answers and View contact.
 *
 *   node scripts/check-emails-r52.mjs           (SCENES=a,b for some; no build needed)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const ORIGIN = "https://storelib.test"
const work = mkdtempSync(join(tmpdir(), "storelib-emails-r52-"))
const stubs = join(work, "stubs")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(
  join(stubs, "navigation.js"),
  `import { useSyncExternalStore } from "react"
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())
for (const m of ["pushState", "replaceState"]) {
  const orig = history[m].bind(history)
  history[m] = (...a) => { orig(...a); notify() }
}
window.addEventListener("popstate", notify)
window.__nav = []
const router = { push(u) { window.__nav.push("push " + u) }, replace(u) { window.__nav.push("replace " + u) }, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const usePathname = () => location.pathname
export function useSearchParams() {
  const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => location.search, () => "")
  return new URLSearchParams(s)
}
export function redirect() {}
export function notFound() {}
`,
)
writeFileSync(
  join(stubs, "link.jsx"),
  `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : String(href), ref, ...rest, onClick: (e) => { e.preventDefault(); window.__nav.push("link " + href); rest.onClick && rest.onClick(e) } }, children)
})
`,
)
writeFileSync(
  join(stubs, "supabase-client.js"),
  `export const isNativePlatform = () => false
const q = { select() { return q }, eq() { return q }, in() { return q }, order() { return q }, limit() { return q }, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then(r) { return Promise.resolve({ data: [], error: null }).then(r) } }
export function createClient() {
  const ch = { on() { return ch }, subscribe() { return ch } }
  return { from: () => q, rpc: async () => ({ data: [], error: null }), channel: () => ch, removeChannel() {}, auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }), getSession: async () => ({ data: { session: null } }) } }
}
`,
)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-emails-r52.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_MAIN_DOMAIN": "undefined", "process.env.NEXT_PUBLIC_APP_URL": "undefined" },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx") },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process=globalThis.process||{env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true};globalThis.process=process;" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const css = await appCss(root)
const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${interFaces(root)}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const VIEWPORTS = { 390: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800, deviceScaleFactor: 1 } }

async function open({ mode, path, state = "ok", width, darkMode }) {
  const page = await browser.newPage()
  await page.setViewport(VIEWPORTS[width])
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await page.evaluateOnNewDocument((p) => {
    window.__probe = p
  }, { mode, state })
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith(ORIGIN) && r.isNavigationRequest() ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
  if (darkMode) await page.evaluate(() => document.documentElement.setAttribute("data-sl-dark", ""))
  /* A failed forms read is asked once more after a pause (lib/forms/client), so the error is waited for. */
  await sleep(state === "error" ? 2600 : state === "loading" ? 900 : 700)
  return { page, errors }
}

const sideways = (page) => page.evaluate(() => {
  const s = document.querySelector(".page-scroll, .app-content-scroll") || document.documentElement
  return Math.max(document.documentElement.scrollWidth, s.scrollWidth) - innerWidth
})

/* name, mode, address, state, and what to check there. */
const SCENES = [
  ["emails-campaigns", "emails", "/app/emails", "ok", async (p) => {
    const r = await p.evaluate(() => ({
      tabs: [...document.querySelectorAll("[data-email-tabs] [role=tab], [data-email-tabs] button")].map((b) => b.textContent.trim()),
      phoneViews: [...document.querySelectorAll("[data-email-views-phone] button")].map((b) => b.textContent.trim()),
      primary: [...document.querySelectorAll(innerWidth < 600 ? "[data-phone-new-email]" : "[data-new-email], [data-new-automation]")].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()),
      rows: document.querySelectorAll("[data-campaign-row]").length,
    }))
    if (innerWidthOf(p) > 600) expect(JSON.stringify(r.tabs) === JSON.stringify(["Campaigns", "Automations", "Settings"]), "Campaigns | Automations | Settings", r.tabs)
    expect(r.primary.length === 1 && /New email/.test(r.primary[0]), "one main action on Campaigns: New email", r.primary)
    expect(r.rows > 0, "the emails are listed", r.rows)
    expect(!r.phoneViews.some((v) => /Subscribers|Flows|Leads|Messages/.test(v)) && !r.tabs.some((v) => /Subscribers|Flows|Leads|Messages/.test(v)), "no tab of the old page is left", [...r.tabs, ...r.phoneViews])
  }],
  ["emails-sent", "emails", "/app/emails?tab=campaigns&show=sent", "ok"],
  ["emails-drafts", "emails", "/app/emails?tab=campaigns&show=drafts", "ok"],
  ["emails-campaigns-empty", "emails", "/app/emails", "empty"],
  ["emails-campaigns-loading", "emails", "/app/emails", "loading"],
  ["emails-campaigns-error", "emails", "/app/emails", "error", async (p) => {
    const r = await p.evaluate(() => ({ failed: !!document.querySelector("[data-tab-failed]"), empty: /No emails yet/.test(document.body.innerText) }))
    expect(r.failed && !r.empty, "a failed read says so with Try again, not No emails yet", r)
  }],
  ["emails-settings-error", "emails", "/app/emails?tab=settings&section=sending", "error"],
  ["emails-email", "emails", `/app/emails?email=00000000-0000-4000-8000-000000000001`, "ok"],
  ["emails-automations", "emails", "/app/emails?tab=automations", "ok", async (p) => {
    /* A phone keeps Automation and New email on every view (round w5, the owner); the one main action is a computer's. */
    if (innerWidthOf(p) < 600) return
    const primary = await p.evaluate(() => [...document.querySelectorAll("[data-new-email], [data-new-automation]")].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()))
    expect(primary.length === 1 && /automation/i.test(primary[0]), "one main action on Automations: Create automation", primary)
  }],
  ["emails-automations-empty", "emails", "/app/emails?tab=automations", "empty"],
  ["automation-templates", "chooser", "/app/emails/flow/new", "ok"],
  ["emails-settings", "emails", "/app/emails?tab=settings&section=sending", "ok", async (p) => {
    if (innerWidthOf(p) < 600) return
    const primary = await p.evaluate(() => [...document.querySelectorAll("[data-new-email], [data-new-automation]")].filter((e) => e.getClientRects().length).length)
    expect(primary === 0, "no main action on Settings", primary)
  }],
  ["emails-settings-customer", "emails", "/app/emails?tab=settings&section=customer", "ok"],
  ["forms-list", "forms", "/app/contacts/forms", "ok", async (p) => {
    const r = await p.evaluate(() => ({
      headings: [...document.querySelectorAll("[data-contacts-forms] h1, [data-contacts-forms] h2")].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()),
      back: [...document.querySelectorAll("[data-contacts-forms] [aria-label^='Back']")].length,
      oldLinks: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /\/app\/emails(\?tab=leads|\/forms)/.test(h)),
      rows: document.querySelectorAll("[data-form-row]").length,
    }))
    expect(r.headings.length === 0, "the list draws no heading of its own inside Contacts", r.headings)
    expect(r.back === 0, "and no back arrow of its own", r.back)
    expect(r.oldLinks.length === 0, "no link goes to the old Emails leads", r.oldLinks)
    expect(r.rows >= 5, "the forms and the website inbox are listed", r.rows)
  }],
  ["forms-list-empty", "forms", "/app/contacts/forms", "empty"],
  ["forms-list-loading", "forms", "/app/contacts/forms", "loading"],
  ["forms-list-error", "forms", "/app/contacts/forms", "error", async (p) => {
    const t = await p.evaluate(() => document.body.innerText)
    expect(/did not load/.test(t) && /Try again/.test(t), "a failed read of the forms says so with Try again", t.slice(0, 120))
  }],
  ["forms-inbox", "forms", "/app/contacts/forms?inbox=1", "ok"],
  ["forms-message", "forms", "/app/contacts/forms?message=00000000-0000-4000-8000-000000000601", "ok"],
  ["forms-edit", "forms", "/app/contacts/forms?form=00000000-0000-4000-8000-000000000401", "ok", async (p) => {
    const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-form-tabs] button")].map((b) => b.textContent.trim()))
    expect(JSON.stringify(tabs) === JSON.stringify(["Edit", "Responses", "Insights", "Settings"]), "a form opens on Edit | Responses | Insights | Settings", tabs)
  }],
  ["forms-responses", "forms", "/app/contacts/forms?form=00000000-0000-4000-8000-000000000401&view=responses&response=00000000-0000-4000-8000-000000000700", "ok", async (p) => {
    const n = await p.evaluate(() => document.querySelectorAll("[data-view-contact]").length)
    expect(n === 1, "the response opened has View contact", n)
  }],
  ["forms-responses-empty", "forms", "/app/contacts/forms?form=00000000-0000-4000-8000-000000000401&view=responses", "noanswers"],
  ["forms-insights", "forms", "/app/contacts/forms?form=00000000-0000-4000-8000-000000000401&view=insights", "ok"],
  ["forms-settings", "forms", "/app/contacts/forms?form=00000000-0000-4000-8000-000000000401&view=settings", "ok"],
  ["forms-siteform", "forms", "/app/contacts/forms?siteform=00000000-0000-4000-8000-000000000501", "ok"],
  ["members", "members", "/app/community/x/members", "ok"],
  ["members-empty", "members", "/app/community/x/members", "empty"],
  ["member-sheet", "members", "/app/community/x/members?member=00000000-0000-4000-8000-000000000903", "ok", async (p) => {
    const r = await p.evaluate(() => ({ activity: !!document.querySelector("[data-member-activity]"), answers: !!document.querySelector("[data-member-join-answers]"), contact: document.querySelector("[data-member-contact]")?.getAttribute("href") ?? null }))
    expect(r.activity && r.answers, "the member's activity and answers are in the sheet", r)
    expect(/\/app\/contacts\/open\?from=community_member/.test(r.contact ?? ""), "View contact opens them in Contacts", r.contact)
  }],
  ["products", "products", "/app/products", "ok"],
]
const innerWidthOf = (p) => p.viewport().width

const only = (process.env.SCENES ?? "").split(",").filter(Boolean)
const widths = (process.env.WIDTHS ?? "390,1280").split(",").map(Number)
/*
  Light by default. /app is never drawn dark on the site (lib/appearance THEMED_PREFIXES leaves the dashboard out),
  so TONES=light,dark is a look at what the dark rules would do, not at a page anyone sees.
*/
const tones = (process.env.TONES ?? "light").split(",")
for (const [name, mode, path, state0, check] of SCENES) {
  if (only.length && !only.includes(name)) continue
  console.log(`\n${name}`)
  for (const width of widths) {
    for (const tone of tones) {
      if (tone === "dark" && /loading|error/.test(name)) continue
      const { page, errors } = await open({ mode, path, state: state0, width, darkMode: tone === "dark" })
      await page.screenshot({ path: join(shots, `${name}-${width}-${tone}.png`), fullPage: false })
      const side = await sideways(page)
      if (tone === "light") {
        expect(side <= 0, `${width}: no sideways scroll`, side)
        expect(errors.length === 0, `${width}: no error on the page`, errors)
        if (check) await check(page)
      }
      await page.close()
    }
  }
}
await browser.close()
console.log(`\nPictures in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed.` : "\nAll checks passed.")
process.exit(broken ? 1 : 0)
