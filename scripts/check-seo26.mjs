/**
 * ===========================================================================
 *  ROUND 26 (W6), MEASURED ON THE REAL APP: COMMUNITY SEO BY STATE, AND THE
 *  MEMBER LINKS INSIDE A COMMUNITY
 * ===========================================================================
 * Drives a `next dev` of this checkout against scripts/seo26-stub.mjs.
 *
 *   HTML     every state's page and About as a signed out visitor (a search
 *            engine): title, description, robots, canonical, Open Graph, X
 *            card, icon, JSON-LD, one h1; nothing about a draft, a
 *            suspended or a deleted community; the member links never in
 *            any of it; an old address is a 308; the sitemap and robots.txt
 *   MEMBER   the member's own page: the links in the left column, noindex on
 *            the member area
 *   LINKS    headless Chromium at 1440x900, 820x1180 and 390x844 (touch, 4x
 *            CPU), light and dark: the links under the card (computer), in
 *            the account menu (tablet) and the account sheet (phone), each
 *            screenshotted to SHOTS_DIR; a press reaches the click route and
 *            the route writes the press
 *
 *   node scripts/seo26-stub.mjs     (leave it running)
 *   (the app, see scripts/seo26-stub.mjs)
 *   BASE=http://127.0.0.1:3966 SHOTS_DIR=dir node scripts/check-seo26.mjs [HTML MEMBER LINKS]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://127.0.0.1:3966"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS_DIR || join(process.cwd(), ".seo26-shots")
mkdirSync(shots, { recursive: true })
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const SESSION = JSON.parse(readFileSync("/tmp/storelib-seo26-session.json", "utf8"))
const SECRETS = ["member_links", "memberLinks", "Clay shop", "shop.example.com", "Glazing course", "Secret drafts", "hidden.example.com", "Weekly call notes", "notes.example.com", "lk_shop"]
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const attr = (html, re) => (re.exec(html) ?? [])[1] ?? null
const meta = (html, key) => attr(html, new RegExp(`<meta[^>]*(?:name|property)="${key.replace(/[:]/g, "\\:")}"[^>]*content="([^"]*)"`, "i"))
function head(html) {
  return {
    title: attr(html, /<title>([^<]*)<\/title>/),
    description: meta(html, "description"),
    robots: meta(html, "robots"),
    canonical: attr(html, /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/),
    ogTitle: meta(html, "og:title"),
    ogDescription: meta(html, "og:description"),
    ogImage: meta(html, "og:image"),
    ogUrl: meta(html, "og:url"),
    twitterCard: meta(html, "twitter:card"),
    twitterImage: meta(html, "twitter:image"),
    icon: attr(html, /<link[^>]*rel="icon"[^>]*href="([^"]*)"/),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
    h1: (html.match(/<h1[\s>]/g) ?? []).length,
  }
}

async function get(path, { cookie = null, redirect = "manual" } = {}) {
  const res = await fetch(BASE + path, { redirect, headers: cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {} })
  return { status: res.status, location: res.headers.get("location"), html: await res.text() }
}

if (want("HTML")) {
  console.log("\nHTML, signed out")
  const out = {}
  const states = {
    open: { status: 200, indexed: true, preview: true },
    private: { status: 200, indexed: false, preview: true },
    unlisted: { status: 200, indexed: false, preview: true },
    inviteonly: { status: 200, indexed: false, preview: true },
    archived: { status: 200, indexed: false, preview: true },
    hidden: { status: 200, indexed: false, preview: true },
    draft: { status: 404, indexed: false, preview: false },
    suspended: { status: 404, indexed: false, preview: false },
    deleted: { status: 404, indexed: false, preview: false },
  }
  for (const [slug, s] of Object.entries(states)) {
    for (const path of [`/community/${slug}`, `/community/${slug}/about`]) {
      const r = await get(path)
      const h = head(r.html)
      out[path] = { status: r.status, ...h, jsonLd: h.jsonLd.map((j) => JSON.parse(j)) }
      const name = `Clay ${slug} club`
      expect(r.status === s.status, `${path}: ${s.status}`, r.status)
      expect((h.robots ?? "").includes(s.indexed ? "index, follow" : "noindex") && !(s.indexed && /noindex/.test(h.robots ?? "")), `  robots ${s.indexed ? "index, follow" : "noindex"}`, h.robots)
      if (s.preview && !s.indexed) {
        /* Its page answers whoever has the link, so the tab says its name; a shared link and a search engine get nothing else. */
        const about = path.endsWith("/about")
        expect(h.title === (about ? `About ${name}` : name), "  the tab's title is its name (its page shows it)", h.title)
        expect(h.description === "A community on Storelib." && h.ogDescription === h.description, "  a neutral line, never its own words", h.description)
        expect(!h.ogImage && !h.twitterImage && h.twitterCard === "summary", "  no picture in its preview, a small X card", { og: h.ogImage, tw: h.twitterCard })
        expect(!/<meta[^>]*(og:|twitter:)[^>]*(tagline|short description|long description)/i.test(r.html), "  no tagline or description in any preview tag")
        expect(h.canonical === `https://storelib.com/community/${slug}`, "  one canonical, the landing page", h.canonical)
        expect(h.h1 === 1, "  one h1", h.h1)
      } else if (s.preview) {
        const about = path.endsWith("/about")
        expect(h.title === (about ? `About ${name}` : name), "  the title is the community's", h.title)
        expect(h.description === `The ${slug} short description.`, "  the description is the short description", h.description)
        expect(h.canonical === `https://storelib.com/community/${slug}`, "  one canonical, the landing page", h.canonical)
        expect(h.ogUrl === h.canonical && h.ogTitle === name && h.ogDescription === h.description, "  Open Graph says the same", { url: h.ogUrl, title: h.ogTitle })
        expect(!!h.ogImage && h.ogImage.startsWith(`https://storelib.com/community/${slug}/share.png?v=`) && h.twitterCard === "summary_large_image" && h.twitterImage === h.ogImage, "  a 1200x630 picture drawn for it (no cover), a large X card", h.ogImage)
        expect(!!h.icon && h.icon.startsWith(`/community/${slug}/tab-icon.png?v=`), "  the tab's icon is the community's own", h.icon)
        expect(h.h1 === 1, "  one h1", h.h1)
      } else {
        expect(!r.html.includes(name) && !r.html.includes(`The ${slug} short description.`) && !new RegExp(`/community/${slug}/(share\\.png|cover\\.jpg|tab-icon\\.png)`).test(r.html) && !h.canonical, "  says nothing about it (no name, line, its picture or canonical; Storelib's own preview)", h.ogImage)
      }
      const jsonLdWanted = s.indexed && !path.endsWith("/about")
      expect(jsonLdWanted ? h.jsonLd.length === 1 && JSON.parse(h.jsonLd[0])["@type"] === "Organization" && !/aggregateRating|review/i.test(h.jsonLd[0]) : h.jsonLd.length === 0, `  JSON-LD ${jsonLdWanted ? "an Organization, no rating" : "none"}`, h.jsonLd.map((j) => JSON.parse(j)["@type"]))
      const leaked = SECRETS.filter((x) => r.html.includes(x))
      expect(leaked.length === 0, "  no member link in the HTML", leaked)
    }
  }
  const moved = await get("/community/old-clay/about?x=1")
  expect(moved.status === 308 && /\/community\/open\/about\?x=1$/.test(moved.location ?? ""), "an old address: 308 to the current one, path and query kept", `${moved.status} ${moved.location}`)
  const inside = await get("/community/open/members")
  /* The member area's door runs under its loading screen, so the redirect is the one Next streams (a refresh to About), not a 30x. */
  const toAbout = [307, 308].includes(inside.status) ? /\/community\/open\/about$/.test(inside.location ?? "") : /http-equiv="refresh" content="\d+;url=\/community\/open\/about"/.test(inside.html)
  expect(toAbout && SECRETS.every((x) => !inside.html.includes(x)) && (inside.status !== 200 || /<meta name="robots" content="noindex/.test(inside.html)), "a member page, signed out: sent to About, noindex, nothing of the links", `${inside.status} ${inside.location ?? ""}`)
  const sitemap = await get("/sitemap/communities-0.xml")
  const locs = [...sitemap.html.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
  expect(sitemap.status === 200 && JSON.stringify(locs) === JSON.stringify(["https://storelib.com/community/open"]), "the sitemap names the published, public, open community only", locs)
  const index = await get("/sitemap.xml")
  expect(/sitemap\/communities-0\.xml/.test(index.html), "the sitemap index names the communities file")
  const robots = await get("/robots.txt")
  expect(/Sitemap: https:\/\/storelib\.com\/sitemap\.xml/.test(robots.html) && !/Disallow: \/community/.test(robots.html), "robots.txt: the sitemap, communities crawlable (each page's own tag decides)")
  writeFileSync(join(shots, "html-heads.json"), JSON.stringify(out, null, 1))
  console.log(`  (every head: ${join(shots, "html-heads.json")})`)
}

if (want("MEMBER")) {
  console.log("\nHTML, the signed in member")
  const r = await get("/community/open", { cookie: SESSION })
  expect(r.status === 200 && /data-member-links="column"/.test(r.html), "the member's page draws the links in the left column, on the server", r.status)
  expect(r.html.includes("Clay shop") && r.html.includes("Glazing course") && r.html.includes("Weekly call notes") && !r.html.includes("Secret drafts") && !r.html.includes("hidden.example.com"), "the three visible links, never the hidden one")
  const ext = /<a href="https:\/\/shop\.example\.com\/clay" target="_blank" rel="noopener noreferrer"/.test(r.html)
  expect(ext, "another site's link opens in a new tab, noopener noreferrer")
  const members = await get("/community/open/members", { cookie: SESSION })
  expect(/<meta name="robots" content="noindex, nofollow"/.test(members.html), "a member page says noindex", members.status)
  const notMine = await get("/community/private", { cookie: SESSION })
  expect(notMine.status === 200 && SECRETS.every((x) => !notMine.html.includes(x)), "a community they are not in: no links", { status: notMine.status, leaked: SECRETS.filter((x) => notMine.html.includes(x)) })
}

if (want("LINKS")) {
  console.log("\nThe links on screen")
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
  const views = [
    { name: "1440", vp: { width: 1440, height: 900, deviceScaleFactor: 1 }, cpu: 1, where: "column" },
    { name: "820", vp: { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, cpu: 4, where: "menu" },
    { name: "390", vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, cpu: 4, where: "sheet" },
  ]
  for (const v of views) {
    for (const dark of [false, true]) {
      const ctx = await browser.createBrowserContext()
      const p = await ctx.newPage()
      await p.setViewport(v.vp)
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: v.cpu })
      await p.setCookie({ ...SESSION, url: BASE }, { name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
      await p.evaluateOnNewDocument((d) => { try { localStorage.setItem("storelib:appearance", d ? "dark" : "light") } catch {} }, dark)
      const clicks = []
      /* A beacon is a "ping" request; its answer is read from the route itself (the stub's log of what it wrote). */
      p.on("request", (r) => { if (/\/links\/[^/]+\/click$/.test(new URL(r.url()).pathname)) clicks.push({ method: r.method(), type: r.resourceType(), path: new URL(r.url()).pathname }) })
      /* The member frame keeps connections open (presence, realtime, the dev server's own), so the page is ready when the frame has hydrated. */
      await p.goto(`${BASE}/community/open`, { waitUntil: "load", timeout: 300000 })
      await p.waitForSelector("[data-community-shell]", { timeout: 120000 })
      await p.waitForFunction(() => document.readyState === "complete" && !!document.querySelector("[data-community-account]"), { timeout: 120000, polling: 500 })
      await new Promise((r) => setTimeout(r, 2500))
      const tag = `${v.name}-${dark ? "dark" : "light"}`
      const isDark = await p.evaluate(() => document.documentElement.hasAttribute("data-sl-dark"))
      expect(isDark === dark, `${tag}: the ${dark ? "dark" : "light"} look`, isDark)
      if (v.where === "column") {
        const box = await p.evaluate(() => {
          const n = document.querySelector('[data-member-links="column"]')
          const card = document.querySelector("[data-wall-card]")
          if (!n || !card) return null
          const a = n.getBoundingClientRect(), c = card.getBoundingClientRect()
          const rows = [...n.querySelectorAll("a")].map((x) => ({ h: Math.round(x.getBoundingClientRect().height), text: x.textContent.trim(), color: getComputedStyle(x).color }))
          return { top: Math.round(a.top - c.bottom), left: Math.round(a.left - c.left), width: Math.round(a.width), cardWidth: Math.round(c.width), rows, bg: getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor }
        })
        expect(!!box && box.rows.length === 3 && box.top >= 0 && box.top <= 16 && box.left === 0 && box.width === box.cardWidth, `${tag}: three links right under the card, its width`, box)
        expect(!!box && box.rows.every((r) => r.h <= 34), `${tag}: compact rows (32px)`, box?.rows.map((r) => r.h))
        const clip = await p.evaluate(() => { const l = document.querySelector("[data-community-left]").getBoundingClientRect(); return { x: Math.max(0, l.left - 12), y: Math.max(0, l.top - 12), width: l.width + 24, height: Math.min(l.height + 24, 900 - l.top) } })
        await p.screenshot({ path: join(shots, `links-${tag}.png`), clip })
        await p.screenshot({ path: join(shots, `page-${tag}.png`) })
        /* A press: the external link opens a new tab and the beacon reaches the route. */
        const opened = new Promise((r) => browser.once("targetcreated", (t) => r(t)))
        await p.click('[data-member-links="column"] a[data-member-link="lk_shop"]')
        const tab = await Promise.race([opened, new Promise((r) => setTimeout(() => r(null), 5000))])
        expect(!!tab && /shop\.example\.com/.test(tab.url()), `${tag}: the shop link opens in a new tab`, tab?.url())
        if (tab) { const tp = await tab.page(); await tp?.close().catch(() => {}) }
        /* The route is compiled on its first call in dev: up to a minute for the write to show in the stub's log. */
        const wrote = () => {
          try {
            return (existsSync("/tmp/storelib-seo26-writes.json") ? JSON.parse(readFileSync("/tmp/storelib-seo26-writes.json", "utf8")) : []).filter((w) => /community_member_link_clicks/.test(w)).length
          } catch {
            return 0
          }
        }
        const before = Number(process.env.__W6_WRITES || 0)
        for (let i = 0; i < 120 && wrote() <= before; i++) await new Promise((r) => setTimeout(r, 500))
        process.env.__W6_WRITES = String(wrote())
        expect(clicks.some((c) => c.method === "POST" && /lk_shop/.test(c.path)) && wrote() > before, `${tag}: the press was sent (a beacon) and the route wrote it`, { clicks, writes: wrote() })
      } else if (v.where === "menu") {
        expect(await p.evaluate(() => getComputedStyle(document.querySelector("[data-community-left]")).display === "none"), `${tag}: no left column at this width`)
        await p.click("[data-header-account] button[data-header-avatar]")
        await new Promise((r) => setTimeout(r, 700))
        const menu = await p.evaluate(() => {
          const n = document.querySelector('[data-account-menu] [data-member-links="menu"]')
          const who = document.querySelector("[data-account-menu] [data-account-who]")
          if (!n || !who) return null
          return { rows: [...n.querySelectorAll('a[role="menuitem"]')].map((a) => a.textContent.trim()), below: Math.round(n.getBoundingClientRect().top - who.getBoundingClientRect().bottom), visible: getComputedStyle(n.parentElement).display !== "none" }
        })
        expect(!!menu && menu.visible && menu.rows.length === 3 && menu.below >= 0 && menu.below < 12, `${tag}: the three links in the account menu, right under the member's name`, menu)
        const clip = await p.evaluate(() => { const m = document.querySelector("[data-account-menu]").getBoundingClientRect(); return { x: Math.max(0, m.left - 12), y: Math.max(0, m.top - 12), width: m.width + 24, height: m.height + 24 } })
        await p.screenshot({ path: join(shots, `links-${tag}.png`), clip })
      } else {
        await p.tap('button[data-account-more][aria-label="Your account"]')
        await new Promise((r) => setTimeout(r, 900))
        const sheet = await p.evaluate(() => {
          const body = [...document.querySelectorAll("[data-account-sheet-body]")].find((b) => b.getBoundingClientRect().height > 0)
          const n = body?.querySelector('[data-member-links="sheet"]')
          const who = body?.querySelector("[data-account-who]")
          if (!n || !who) return null
          return { rows: [...n.querySelectorAll("a")].map((a) => ({ text: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height) })), below: Math.round(n.getBoundingClientRect().top - who.getBoundingClientRect().bottom), overflow: document.documentElement.scrollWidth > window.innerWidth }
        })
        expect(!!sheet && sheet.rows.length === 3 && sheet.below >= 0 && sheet.below < 12 && sheet.rows.every((r) => r.h >= 40 && r.h <= 44) && !sheet.overflow, `${tag}: the three links in the account sheet, under the member's name, 40px rows, no sideways scroll`, sheet)
        await p.screenshot({ path: join(shots, `links-${tag}.png`) })
        /* The internal link: the sheet closes and the page moves; the press is counted. */
        await p.tap('[data-member-links="sheet"] a[data-member-link="lk_course"]')
        await new Promise((r) => setTimeout(r, 2500))
        const sheetGone = await p.evaluate(() => ![...document.querySelectorAll("[data-account-sheet-body]")].some((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().top < window.innerHeight))
        expect(clicks.some((c) => c.method === "POST" && /lk_course/.test(c.path)) && sheetGone, `${tag}: a press on the course link is sent and the sheet closes`, { clicks, sheetGone })
      }
      await ctx.close()
    }
  }
  await browser.close()
  console.log(`  (pictures in ${shots})`)
}

console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
