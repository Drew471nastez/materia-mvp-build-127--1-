/**
 * ===========================================================================
 *  THE COMMUNITY MEMBER AREA, MEASURED
 * ===========================================================================
 * The real member components (scripts/render-community-member.tsx) with
 * fixtures, at 1440x900 and on a 390x844 phone, each photographed:
 *
 *   FEED       the column on the left from 1024px (name, counts, places,
 *              spaces), the feed no wider than 680px, the side column from
 *              1280px; on a phone no column: the community row with the bell,
 *              then the pills, which stay under the header while the page
 *              scrolls; pinned first; Latest and Popular
 *   ONLINE     the count beside the members comes from presence (the stub
 *              reports five), and is there only because presence said so
 *   COMPOSER   closed it is one line; pressed it opens into title, text and
 *              extras; a poll adds its editor; typing @ lists members; a
 *              link brings its card from the server's preview route
 *   LIKE       a like answers at once and the request goes to /reactions;
 *              a refused like is put back (the probe answers 403 once)
 *   POST       the post whole, comments with replies one level deep
 *   CHAT       the list scrolls inside its card, the box sits at the bottom
 *   MEMBERS, LEADERBOARD, NOTIFICATIONS
 *
 * and everywhere: nothing scrolls sideways, no page error, every control on
 * a phone is at least 40px tall, nothing overlaps.
 *
 *   PROBE_CSS=source node scripts/check-community-member.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".community-member-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-member-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  /* Realtime and storage as a stub: five people present, every channel subscribed. */
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel(name) {
      const handlers = []
      const ch = {
        name,
        on(type, filter, cb) { handlers.push({ type, filter, cb }); (window.__channels ||= []).push({ name, type, filter }); return ch },
        subscribe(cb) { setTimeout(() => { cb && cb("SUBSCRIBED"); handlers.filter((h) => h.type === "presence").forEach((h) => h.cb()) }, 30); return ch },
        track: async () => "ok",
        presenceState: () => ({ a: [{}], b: [{}], c: [{}], d: [{}], e: [{}] }),
      }
      return ch
    },
    removeChannel() {},
    storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://placeholder.supabase.co/storage/v1/object/public/product-images/x.jpg" } }) } } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-member.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-member-probe/navigation.js", "next/link": "./.community-member-probe/link.jsx" },
    plugins: [
      {
        name: "supabase-stub",
        setup(b) {
          b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") }))
        },
      },
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]

  const MEMBERS_ANSWER = {
    members: [
      { userId: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin", status: "active", level: 5, points: 0 },
      { userId: "u-maya", name: "Maya Okafor", username: "mayao", avatarUrl: null, role: "owner", status: "active", level: 6, points: 0 },
    ],
    nextCursor: null,
  }

  async function open(name, path, vp, opts = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const calls = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    let refuseLike = opts.refuseLike ?? 0
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        calls.push({ url: short, method: r.method(), body: r.postData() || null })
        let status = 200
        let body = {}
        if (short.includes("/reactions")) {
          const sent = JSON.parse(r.postData() || "{}")
          if (refuseLike > 0) {
            refuseLike--
            status = 403
            body = { error: "muted" }
          } else body = { on: sent.on, count: sent.on ? 18 : 16 }
        } else if (short.includes("/members?")) body = MEMBERS_ANSWER
        else if (short.includes("/link-preview")) body = { preview: { url: "https://example.com/talk", title: "A talk about naming things", image: null, site: "example.com" } }
        else if (short.includes("/posts?")) body = { pinned: [], posts: [], nextCursor: null }
        else if (short.includes("/messages")) body = { messages: [], hasMore: false }
        /* A like's answer takes a moment, as on a real connection, so the instant state can be seen. */
        const wait = short.includes("/reactions") ? 250 : 0
        return void setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }), wait)
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}case=${name}`, { waitUntil: "load" })
    await sleep(400)
    return { p, errors, calls }
  }

  const shot = (p, name, fullPage = true) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
  const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  /** Every control a thumb presses, on a phone, and the ones under 40px tall. */
  const smallTargets = (p) =>
    p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("button, [role=tab], [role=radio], a[data-community-nav], a[data-on], [data-community-bell], [data-like], [data-save], [data-comment-button], input:not([type=hidden]):not([type=checkbox]):not([type=file]), textarea, select")) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const style = getComputedStyle(el)
        if (style.visibility === "hidden" || style.display === "none") continue
        if (r.height < 40 && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
      }
      return out
    })
  /** Pairs of cards that overlap each other. */
  const overlaps = (p, selector) =>
    p.evaluate((sel) => {
      const rects = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      const bad = []
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]
          const b = rects[j]
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push([i, j])
        }
      return bad
    }, selector)

  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── FEED ─────────────────────────────────────────────────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      await shot(p, `${label}-feed`, false)
      await shot(p, `${label}-feed-full`)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      const geo = await p.evaluate(() => {
        const rect = (sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return r && r.width ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null
        }
        const cards = [...document.querySelectorAll("[data-post]")]
        return {
          rail: rect("[data-community-rail]"),
          aside: rect("[data-community-aside]"),
          feed: rect("[data-feed]"),
          pills: rect("[data-community-pills]"),
          bar: rect("[data-community-phone-bar]"),
          firstPinned: cards[0]?.getAttribute("data-pinned") === "true",
          posts: cards.length,
          online: document.querySelector("[data-community-online]")?.textContent || document.querySelector("[data-community-phone-bar]")?.textContent?.match(/\d+ online/)?.[0] || null,
          bg: getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor,
          composer: document.querySelector("[data-composer]")?.getAttribute("data-composer"),
          violet: [...document.querySelectorAll("[data-community-shell] *")].filter((e) => /139, 92, 246|124, 58, 237/.test(getComputedStyle(e).backgroundColor)).length,
        }
      })
      expect(geo.bg === "rgb(248, 249, 250)", "the page is #f8f9fa", geo.bg)
      expect(geo.violet === 0, "no violet fill anywhere a member looks", geo.violet)
      expect(geo.firstPinned && geo.posts === 5, "pinned first, then the rest", { firstPinned: geo.firstPinned, posts: geo.posts })
      expect(geo.composer === "closed", "the composer arrives closed: one line", geo.composer)
      expect(geo.online === "5 online" || (geo.online || "").includes("5 online"), "ONLINE: the count comes from presence", geo.online)
      expect(geo.feed && geo.feed.w <= 680, "the feed is at most 680px wide", geo.feed)
      if (!phone) {
        expect(geo.rail && geo.rail.w === 232, "the slim column on the left", geo.rail)
        expect(geo.aside && geo.aside.x >= geo.feed.x + geo.feed.w, "the side column beside the feed, not over it", { aside: geo.aside, feed: geo.feed })
        expect(!geo.pills, "no pills on a computer", geo.pills)
        /* The column stays put while the page scrolls. */
        const before = await p.evaluate(() => Math.round(document.querySelector("[data-community-rail] > div").getBoundingClientRect().top))
        await p.evaluate(() => window.scrollTo(0, 900))
        await sleep(100)
        const after = await p.evaluate(() => Math.round(document.querySelector("[data-community-rail] > div").getBoundingClientRect().top))
        expect(before === after && after === 20, "the column sticks while the feed scrolls", { before, after })
        await p.evaluate(() => window.scrollTo(0, 0))
      } else {
        expect(!geo.rail, "no column on a phone", geo.rail)
        expect(geo.bar && geo.pills && geo.pills.y >= geo.bar.y + geo.bar.h - 1, "the community row, then the pills", { bar: geo.bar, pills: geo.pills })
        const sticky = []
        for (const y of [400, 1200, 2000]) {
          await p.evaluate((v) => window.scrollTo(0, v), y)
          await sleep(60)
          sticky.push(await p.evaluate(() => Math.round(document.querySelector("[data-community-pills]").getBoundingClientRect().top)))
        }
        expect(sticky.every((t) => t === 0), "the pills stay under the header while the page scrolls", sticky)
        await shot(p, `${label}-feed-scrolled`, false)
        await p.evaluate(() => window.scrollTo(0, 0))
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
        /* Spaces in a sheet. */
        await p.click("[data-community-spaces-pill]")
        await sleep(600)
        const sheet = await p.evaluate(() => [...document.querySelectorAll("[data-community-spaces-sheet] [data-community-space]")].map((a) => ({ name: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height) })))
        expect(sheet.length === 5 && sheet.every((s) => s.h >= 44), "Spaces opens a sheet with every space, rows a thumb can hit", sheet)
        await shot(p, `${label}-spaces-sheet`, false)
        await p.keyboard.press("Escape")
        await sleep(600)
      }
      expect((await overlaps(p, "[data-post]")).length === 0, "no post overlaps another")

      /* LIKE: at once, then the server's count; refused, it is put back. */
      const likeOf = (id) => p.evaluate((i) => {
        const b = document.querySelector(`[data-post="${i}"] [data-like]`)
        return { pressed: b.getAttribute("aria-pressed"), count: b.querySelector("[data-like-count]").textContent }
      }, id)
      const start = await likeOf("p-text")
      await p.click('[data-post="p-text"] [data-like]')
      const instant = await likeOf("p-text")
      await sleep(500)
      const settled = await likeOf("p-text")
      expect(start.pressed === "false" && instant.pressed === "true" && instant.count === "25", "LIKE: answers the press at once", { start, instant })
      expect(settled.count === "18" && calls.some((c) => c.url.endsWith("/reactions") && c.body.includes('"on":true')), "and takes the server's count", settled)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* A like the server refuses is put back. */
    {
      const { p } = await open("feed", "/community/studio-notes", vp, { refuseLike: 1 })
      await p.click('[data-post="p-text"] [data-like]')
      await sleep(600)
      const back = await p.evaluate(() => {
        const b = document.querySelector('[data-post="p-text"] [data-like]')
        return { pressed: b.getAttribute("aria-pressed"), count: b.querySelector("[data-like-count]").textContent, toast: document.querySelector("[data-community-toast]")?.textContent || null }
      })
      expect(back.pressed === "false" && back.count === "24" && /muted/i.test(back.toast || ""), "a refused like is rolled back with the reason", back)
      await p.close()
    }

    /* ── COMPOSER ─────────────────────────────────────────────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      await p.click("[data-composer-open]")
      await sleep(150)
      const opened = await p.evaluate(() => ({ state: document.querySelector("[data-composer]")?.getAttribute("data-composer"), focused: document.activeElement?.getAttribute("aria-label"), post: document.querySelector("[data-composer-post]")?.disabled }))
      expect(opened.state === "open" && opened.focused === "Post" && opened.post === true, "pressed, it opens with the text box focused and Post off until something is written", opened)
      await p.type('[aria-label="Title"]', "Naming things")
      await p.type('textarea[aria-label="Post"]', "Worth a watch https://example.com/talk thoughts @pri")
      await sleep(900)
      const live = await p.evaluate(() => ({
        mentions: [...document.querySelectorAll("[data-mention-list] [role=option]")].map((o) => o.textContent.trim()),
        card: document.querySelector("[data-composer] [data-link-card]")?.textContent || null,
        post: document.querySelector("[data-composer-post]")?.disabled,
      }))
      expect(live.mentions.length === 2 && live.mentions[0].includes("@priya"), "typing @ lists members with a username", live.mentions)
      expect(/naming things/i.test(live.card || "") && calls.some((c) => c.url.endsWith("/posts/link-preview")), "a link brings its card from the server", live.card)
      expect(live.post === false, "Post is on once there is text", live.post)
      await p.keyboard.press("Enter")
      await sleep(100)
      const text = await p.$eval('textarea[aria-label="Post"]', (t) => t.value)
      expect(text.endsWith("@priya "), "Enter puts the @username in the text", text.slice(-24))
      await p.click("[data-composer-poll]")
      await sleep(150)
      const poll = await p.evaluate(() => document.querySelectorAll("[data-composer-poll-editor] input[aria-label^='Choice']").length)
      expect(poll === 2, "a poll adds its question and two choices", poll)
      await sleep(500)
      const kept = await p.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("storelib:community-draft:")) || null)
      expect(!!kept, "the draft is kept in this browser while typing", kept)
      await shot(p, `${label}-composer-open`, false)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "the open composer does not scroll sideways", s)
      if (phone) {
        const small = (await smallTargets(p)).filter((t) => !/^Choice|Ask/.test(t.text))
        expect(small.length === 0, "the composer's controls are 40px or more", small.slice(0, 8))
      }
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── POST WITH COMMENTS ───────────────────────────────────────── */
    {
      const { p, errors } = await open("post", "/community/studio-notes/post/p-photo", vp)
      await shot(p, `${label}-post`)
      const t = await p.evaluate(() => {
        const top = [...document.querySelectorAll("[data-comments] > ul > li > [data-comment]")].map((c) => c.getAttribute("data-comment"))
        const replies = [...document.querySelectorAll("[data-comment='c1'] ul [data-comment]")].map((c) => c.getAttribute("data-comment"))
        const deleted = document.querySelector("[data-comment='c3']")?.textContent || ""
        return { top, replies, deleted: deleted.includes("Deleted"), box: !!document.querySelector("[data-comment-box=comment]") }
      })
      expect(t.top.join() === "c1,c2,c3" && t.replies.join() === "c1r1,c1r2", "comments in order, replies one level under their comment", t)
      expect(t.deleted, "a deleted comment with replies stays as Deleted so the replies keep their place", t.deleted)
      expect(t.box, "the comment box is under the post", t.box)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      if (phone) {
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
      }
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── CHAT ─────────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("chat", "/community/studio-notes/space/lounge", vp)
      await sleep(200)
      await shot(p, `${label}-chat`, false)
      const c = await p.evaluate(() => {
        const list = document.querySelector("[data-chat-list]")
        const form = document.querySelector("[data-chat-form]")?.getBoundingClientRect()
        return {
          scrolls: list.scrollHeight > list.clientHeight,
          atBottom: Math.abs(list.scrollHeight - list.scrollTop - list.clientHeight) < 4,
          formBottom: form ? Math.round(form.bottom) : null,
          vh: innerHeight,
          days: document.querySelectorAll("[data-chat-day]").length,
          grouped: document.querySelectorAll("[data-chat-message]").length,
          stream: (window.__channels || []).some((ch) => ch.type === "postgres_changes" && ch.filter?.table === "community_messages" && ch.filter?.filter === "space_id=eq.s-chat"),
        }
      })
      expect(c.atBottom, "the newest message is in view", c)
      expect(c.formBottom !== null && c.formBottom <= c.vh, "the message box is on screen", { formBottom: c.formBottom, vh: c.vh })
      expect(c.stream, "the space listens to its own rows of community_messages", c.stream)
      expect(c.days >= 2, "a line between days", c.days)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── MEMBERS, LEADERBOARD, NOTIFICATIONS ──────────────────────── */
    for (const [name, path, sel] of [
      ["members", "/community/studio-notes/members", "[data-member-list] > li"],
      ["leaderboard", "/community/studio-notes/leaderboard", "[data-leaderboard-list] > li"],
      ["notifications", "/community/studio-notes/notifications", "[data-notification-list] > li"],
    ]) {
      const { p, errors } = await open(name, path, vp)
      await shot(p, `${label}-${name}`)
      const n = await p.evaluate((q) => [...document.querySelectorAll(q)].map((li) => Math.round(li.getBoundingClientRect().height)), sel)
      expect(n.length > 0 && n.every((h) => h >= 56), `${name}: rows a thumb can hit`, n)
      const active = await p.evaluate(() => document.querySelector("[aria-current=page]")?.textContent?.trim() || null)
      expect(active && active.toLowerCase().includes(name.slice(0, 6)), `${name}: the shell marks where you are`, active)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, `${name}: nothing scrolls sideways`, s)
      if (phone) {
        const small = await smallTargets(p)
        expect(small.length === 0, `${name}: every control is at least 40px tall`, small.slice(0, 8))
      }
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
