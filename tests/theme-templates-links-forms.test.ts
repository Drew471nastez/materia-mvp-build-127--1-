/**
 * ===========================================================================
 *  EVERY TEMPLATE'S LINKS AND FORMS, WALKED THROUGH THE REAL ENGINE
 * ===========================================================================
 * tests/theme-templates-pages.test.ts draws a fixed list of pages for each
 * template and follows the links on them. This one walks each template the
 * way a visitor does: from the home page, every page any link reaches (the
 * template's own pages too: a lookbook, a booking page, a free chapter), and
 * on every one of them
 *
 *   links      every link to the site opens a page (header, footer, menus
 *              and content alike); a link that opens a form popup
 *              (#open-form-<name>, alone or after a page's address) finds
 *              that popup on the page it lands on
 *   forms      every contact form, newsletter box and form popup posts to
 *              the site's own /contact (or /account, a newsletter as
 *              Shopify's do) and is sent to Storelib as what it is: a
 *              message with its email and its words, or a sign up with its
 *              email; posted as a page does, it comes back to the page it
 *              was on with the thank you showing; posted as a popup's
 *              script does, the answer is ok in JSON
 *   payment    the footer shows the ways the checkout takes money: Visa,
 *              Mastercard, American Express, Apple Pay and Google Pay, and
 *              never PayPal, which Storelib's checkout does not take
 *
 * For the shop with a catalogue, a blog and policies (scripts/theme-
 * templates/fixtures.ts). No database and no browser.
 *
 *   npx tsx tests/theme-templates-links-forms.test.ts [template ...]
 */
import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer, type SiteData, type SiteRequest } from "../lib/storelib-theme/compat/site"
import { importTemplate } from "../scripts/theme-templates/site"
import { auditCart, auditPaths, auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 900)}` : ""}`)
  }
}

/** The most pages walked for one template: every template has fewer. */
const MAX_PAGES = 90
const named = process.argv.slice(2)
const TEMPLATES = CODE_TEMPLATES.filter((t) => !named.length || named.includes(t.template) || named.includes(t.slug))

const strip = (html: string) => html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
const visibleText = (html: string) => strip(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ")
const attr = (tag: string, name: string) => new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i").exec(tag)?.[2]?.replace(/&amp;/g, "&") ?? null
const hrefsOf = (html: string) => [...strip(html).matchAll(/<a\b[^>]*?\shref=(["'])(.*?)\1/gi)].map((m) => m[2].replace(/&amp;/g, "&"))
/** A page of the site: not a file, an account, a checkout or the cart's own endpoints. */
const internal = (href: string) => href.startsWith("/") && !href.startsWith("//") && !/^\/(__media|__asset|__product|_next|cdn|api|account|checkout)(\/|$)/.test(href) && !/^\/cart\//.test(href)
/** A page worth walking on from: a visitor's page, not a variation of one by its query. */
const PAGE = /^\/(?:|products\/[^/?#]+|collections|collections\/[^/?#]+|pages\/[^/?#]+|blogs\/[^/?#]+(?:\/[^/?#]+)?|policies\/[^/?#]+|cart|search)$/
const canonical = (path: string) => path.replace(/^\/collections\/[^/]+(?=\/products\/)/, "").replace(/\/+$/, "") || "/"

const request = (path: string, init: Partial<SiteRequest> = {}): SiteRequest => {
  const u = new URL(path, "http://x")
  return { method: "GET", path: u.pathname, query: u.searchParams, body: null, cart: [], ...init }
}

/** What a form popup is called on a page: data-form-modal="<name>". */
const popupsOn = (html: string) => new Set([...html.matchAll(/data-form-modal="([^"]+)"/g)].map((m) => m[1]))

/** A form's fields as a browser would send them, with a visitor's answers in the ones that need one. */
function fieldsOf(form: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of form.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const tag = m[2]
    const name = attr(tag, "name")
    if (!name) continue
    const type = (attr(tag, "type") ?? (m[1].toLowerCase() === "input" ? "text" : m[1].toLowerCase())).toLowerCase()
    if (["submit", "button", "image", "file", "reset"].includes(type)) continue
    if ((type === "checkbox" || type === "radio") && !/\schecked\b/i.test(tag)) {
      /* A required box is ticked, the way a visitor has to. */
      if (!/\srequired\b/i.test(tag)) continue
    }
    const value = attr(tag, "value") ?? ""
    /* The trap for robots stays empty, as a person leaves it. */
    if (/company|honeypot|url_trap/i.test(name) && type !== "hidden") {
      out[name] = ""
      continue
    }
    if (type === "email" || /email/i.test(name)) out[name] = "visitor@example.com"
    else if (/body|message|comment/i.test(name) || m[1].toLowerCase() === "textarea") out[name] = value || "Do you ship to Canada?"
    else if (/phone|tel/i.test(name) || type === "tel") out[name] = value || "+1 555 0100"
    else if (/name/i.test(name) && type !== "hidden") out[name] = value || "Sam Visitor"
    else out[name] = value || (type === "checkbox" ? "on" : value)
  }
  return out
}

async function walk(template: string, slug: string) {
  console.log(`\n${template} (${slug})\n`)
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
  const built = auditSite(imported, template, false)
  const site: SiteData = built.site
  const cart = auditCart(built)

  /* ── The walk ── */
  const pages = new Map<string, string>()
  const statusOf = new Map<string, number>()
  const queue = [...new Set(["/", ...auditPaths(built).map(([, p]) => p).filter((p) => !p.includes("__cart") && !p.startsWith("/no-such"))])]
  const linkedFrom = new Map<string, string>()
  while (queue.length && pages.size < MAX_PAGES) {
    const path = queue.shift()!
    if (pages.has(path) || statusOf.has(path)) continue
    const out = await answer(site, request(path, { cart: path === "/cart" ? cart : [] }))
    statusOf.set(path, out.status)
    if (out.status !== 200 || typeof out.body !== "string") continue
    pages.set(path, out.body)
    for (const href of hrefsOf(out.body)) {
      if (!internal(href)) continue
      const to = canonical(href.split(/[?#]/)[0])
      if (!linkedFrom.has(href)) linkedFrom.set(href, path)
      if (PAGE.test(to) && !pages.has(to) && !statusOf.has(to)) queue.push(to)
    }
  }
  check(`walked ${pages.size} pages from the home page`, pages.size >= 12 && pages.size < MAX_PAGES, [...pages.keys()].slice(0, 20))

  /* ── Links ── */
  const dead: string[] = []
  let links = 0
  const asked = new Map<string, number>()
  for (const [href, on] of linkedFrom) {
    links++
    const path = href.split("#")[0] || "/"
    let status = asked.get(path) ?? statusOf.get(canonical(path.split("?")[0]))
    if (status === undefined || path.includes("?")) {
      status = (await answer(site, request(path))).status
      asked.set(path, status)
    }
    if (status >= 400) dead.push(`${status} ${href} (on ${on})`)
  }
  check(`every one of its ${links} links to the site opens a page: header, footer, menus and content`, dead.length === 0, dead.slice(0, 12))

  const lost: string[] = []
  for (const [path, html] of pages) {
    for (const href of hrefsOf(html)) {
      const m = /^([^#]*)#open-form-([\w-]+)$/.exec(href)
      if (!m) continue
      const target = m[1] ? pages.get(canonical(m[1].split("?")[0])) ?? (await answer(site, request(m[1]))).body : html
      if (typeof target !== "string" || !popupsOn(target).has(m[2])) lost.push(`${href} on ${path}`)
    }
  }
  check("  every link that opens a form popup finds it on the page it lands on", lost.length === 0, [...new Set(lost)].slice(0, 10))

  /* ── Forms ── */
  type Found = { page: string; action: string; type: string; fields: Record<string, string>; popup: boolean; tag: string }
  const found: Found[] = []
  const seen = new Set<string>()
  for (const [path, html] of pages) {
    for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
      const action = attr(m[1], "action") ?? ""
      if (!/^\/(contact|account)(?:[#?]|$)/.test(action)) continue
      const fields = fieldsOf(m[2])
      const type = fields.form_type ?? ""
      if (type !== "contact" && type !== "customer") continue
      /* One of each form per template: the same footer box is on every page. */
      const key = `${attr(m[1], "id") ?? ""}|${type}|${Object.keys(fields).sort().join(",")}`
      if (seen.has(key)) continue
      seen.add(key)
      const popup = /data-form-modal=/.test(html.slice(Math.max(0, m.index! - 4000), m.index!)) && /\bfm__form\b/.test(m[1])
      found.push({ page: path, action, type, fields, popup, tag: (attr(m[1], "id") ?? attr(m[1], "class") ?? "form").slice(0, 60) })
    }
  }
  const kinds = new Set(found.map((f) => f.type))
  check(`it has ${found.length} forms that send to Storelib (${[...kinds].join(" and ") || "none"})`, found.length > 0, found.map((f) => `${f.page} ${f.tag}`))

  const wrong: string[] = []
  const noThanks: string[] = []
  for (const f of found) {
    const sent: { kind: string; payload: Record<string, unknown> }[] = []
    const submit: SiteRequest["submit"] = async (kind, payload) => {
      sent.push({ kind, payload: payload as Record<string, unknown> })
      return { ok: true, status: 200 }
    }
    const want = f.type === "customer" ? "subscribe" : "contact"
    const url = new URL(f.action, "http://x")
    /* As the page posts it: back to where it was, the thank you showing. */
    const out = await answer(site, request(url.pathname, { method: "POST", body: { ...f.fields }, referer: f.page, submit }))
    const where = out.headers?.Location ?? ""
    const ok =
      sent.length === 1 &&
      sent[0].kind === want &&
      sent[0].payload.email === "visitor@example.com" &&
      sent[0].payload.creator_id === site.creatorId &&
      (want === "subscribe" || String(sent[0].payload.message ?? "").length > 0 || Object.keys(f.fields).every((k) => !/body|message|comment/i.test(k))) &&
      out.status === 303 &&
      where.startsWith(f.page.split("?")[0]) &&
      where.includes(`${f.type}_posted=true`)
    if (!ok) wrong.push(`${f.page} ${f.tag}: sent ${JSON.stringify(sent.map((s) => s.kind))} ${out.status} ${where} ${JSON.stringify(sent[0]?.payload ?? null).slice(0, 160)}`)
    if (ok && !f.popup) {
      const back = await answer(site, request(where))
      const before = visibleText(pages.get(f.page) ?? "")
      const after = typeof back.body === "string" ? back.body : ""
      /* The form's own posted state: the theme's thank you, drawn because the page was opened with <type>_posted=true, or the marker materia-forms.js turns into it (data-mt-posted). */
      const THANKS = /thank|you're in|you are in|on the list|subscribed|received|got it|be in touch|inbox|message (?:was |has been )?sent|we'll reply|we will reply|signed up/gi
      const grew = (visibleText(after).match(THANKS)?.length ?? 0) > (before.match(THANKS)?.length ?? 0) || /posted_successfully|data-mt-posted|data-fm-posted|form__message--success|newsletter-form__message--success|form-status--success|data-posted="true"/i.test(after)
      if (back.status !== 200 || !grew) noThanks.push(`${f.page} ${f.tag} (${f.type})`)
    }
    /* As a popup's script posts it: JSON, ok. */
    const sentBefore = sent.length
    const ajax = await answer(site, request(url.pathname, { method: "POST", body: { ...f.fields }, referer: f.page, submit, ajax: true }))
    const body = typeof ajax.body === "string" ? ajax.body : ""
    if (ajax.status !== 200 || !/"ok":true/.test(body) || sent.length !== sentBefore + 1 || sent[sent.length - 1].kind !== want) wrong.push(`${f.page} ${f.tag} in the background: ${ajax.status} ${body.slice(0, 120)}`)
  }
  check("  each is sent to Storelib as what it is (a message, or a sign up), with its email and its words, and comes back to its page", wrong.length === 0, wrong.slice(0, 8))
  check("  posted from its page, each opens again with its thank you showing", noThanks.length === 0, noThanks.slice(0, 8))

  /* ── The footer's payment marks ── */
  const home = pages.get("/") ?? ""
  const foot = home.slice(Math.max(0, home.search(/id="shopify-section-[^"]*footer[^"]*"|<footer\b/i)))
  const marks = ["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay"].filter((n) => new RegExp(`aria-label="${n}"`).test(foot))
  check("  its footer shows Visa, Mastercard, American Express, Apple Pay and Google Pay, and no PayPal", marks.length === 5 && !/aria-label="PayPal"/i.test(foot), { marks, paypal: /aria-label="PayPal"/i.test(foot) })
}

async function main() {
  for (const t of TEMPLATES) await walk(t.template, t.slug)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
