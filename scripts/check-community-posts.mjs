/**
 * ===========================================================================
 *  ROUND 7'S POSTS, MEASURED
 * ===========================================================================
 * The real member components (scripts/render-community-posts.tsx) with
 * fixtures, at 1440x900 and on a 390x844 phone, each photographed:
 *
 *   CARDS      one thumbnail on the right (96px on a computer, 72px on a
 *              phone), the level badge, the faces, "New comment", the dot
 *   COMPOSER   closed is one field; opened in place (computer) or as a
 *              screen of its own (phone); Post waits for a title, words and
 *              a space; every kind of attachment: a file, a picture, a link,
 *              a video by address, a video from the device, a poll, an emoji,
 *              a GIF; the POST carries each; GIFs not connected is quiet
 *   LEAVING    Cancel, a link elsewhere, and Back ask "You haven't finished
 *              your post yet. Leave without posting?"; Keep writing keeps it
 *   OPENING    a card opens its post over the feed at the post's address,
 *              frame by frame at 4x CPU; Escape (or a swipe down on a phone)
 *              closes it and the address goes back
 *   LIGHTBOX   a tile opens it; arrows and a swipe move; two fingers zoom;
 *              Escape closes
 *   MESSAGES   two members on two pages: one writes, the other's badge
 *              lights and the message arrives through the realtime stub;
 *              the answer arrives back
 *
 * Round 8:
 *   MEDIA      in an opened post one picture is the post's full width in
 *              its own shape (a tall one no taller than the screen allows),
 *              two sit side by side at half width with equal heights, three
 *              or more are a grid with the first large; a video alone plays
 *              where it is; YouTube addresses (youtu.be, m.youtube.com,
 *              shorts) pasted in the words play under them in a 16:9 box
 *   VIEWER     a picture or a video linked in a post's words or a comment,
 *              and a picture file, open the viewer: no new tab, no page
 *              load, nothing asked of supabase.co as a page
 *   TAPS       at 4x CPU, rapid likes, saves and comments: every press is
 *              drawn by the next frame, the button is never turned off, at
 *              most one request per post at a time, the last press wins,
 *              the count only ever shows the two values a press can mean,
 *              comments appear at once and are confirmed, a refused one is
 *              taken out with its words back in the box; no router refresh
 *
 * and everywhere: nothing scrolls sideways, no page error, phone controls
 * at least 40px tall.
 *
 *   PROBE_CSS=source node scripts/check-community-posts.mjs
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
const stubs = join(root, ".community-posts-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-posts-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* SECTION=media,viewer,taps runs only those parts (and MESSAGES only without SECTION or with "messages"). */
const want = (name) => !process.env.SECTION || process.env.SECTION.split(",").includes(name)
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const svg = (a, b, w = 400, h = 300) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`)}`

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
/* Realtime the probe can drive: every channel's handlers are kept, and window.__emit(table, row, event) sends a row to the matching ones. */
writeFileSync(join(stubs, "supabase-client.js"), `const handlers = []
window.__emit = (table, row, eventType = "INSERT") => {
  let n = 0
  for (const h of handlers) {
    if (h.gone || h.filter.table !== table) continue
    const m = /^(\\w+)=eq\\.(.+)$/.exec(h.filter.filter || "")
    if (m && String(row[m[1]]) !== m[2]) continue
    n++
    h.cb({ eventType, new: row })
  }
  return n
}
window.__channels = handlers
/* The Storelib header's menu (the community bar reuses it) asks this too. */
export const isNativePlatform = () => false
export function createClient() {
  return {
    realtime: { setAuth: async () => { window.__authed = (window.__authed || 0) + 1 } },
    channel(name) {
      const mine = []
      const ch = {
        name,
        on(type, filter, cb) { const h = { name, type, filter, cb, gone: false, authed: !!window.__authed }; mine.push(h); handlers.push(h); return ch },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch },
        _gone() { mine.forEach((h) => (h.gone = true)) },
      }
      return ch
    },
    removeChannel(ch) { ch && ch._gone && ch._gone() },
    storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "${svg("#cfd8e3", "#7d93ad", 1200, 800)}" } }) } } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-posts.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-posts-probe/navigation.js", "next/link": "./.community-posts-probe/link.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] })

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

const GIFS = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, url: svg(["#f4d7c8", "#d6e6d2", "#dfe3f3"][i % 3], "#ffffff"), still: svg("#eeeeee", "#cccccc"), w: 200, h: 150 + (i % 2) * 40, title: `gif ${i}` }))

/*
  ROUND 9: GIPHY'S OWN REPLY. A search answered the way api.giphy.com answers
  (every rendition key, sizes as strings, addresses on media<n>.giphy.com
  with Giphy's query string, a pagination block), run through Storelib's real
  server code (lib/communities/server/gifs.ts searchGifs, with fetch answered
  here), and what that returns is the route's reply. The pictures themselves
  are answered by the probe on media*.giphy.com.
*/
const giphyItem = (id, w, h, title) => {
  const base = `https://media${id.length % 5}.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHJvYmU/${id}`
  const q = (r) => `?cid=790b7611probe&ep=v1_gifs_search&rid=${r}&ct=g`
  const r = (name, rw, rh, file, extra = {}) => ({ height: String(rh), width: String(rw), size: "184322", url: `${base}/${file}${q(file)}`, ...extra })
  const fh = Math.round((200 * h) / w)
  const fw = Math.round((200 * w) / h)
  const mp4 = (file) => ({ mp4_size: "90211", mp4: `${base}/${file}${q(file)}` })
  return {
    type: "gif", id, url: `https://giphy.com/gifs/${id}`, slug: `probe-${id}`, bitly_gif_url: `https://gph.is/g/${id}`, bitly_url: `https://gph.is/g/${id}`, embed_url: `https://giphy.com/embed/${id}`, username: "", source: "", title, rating: "g", content_url: "", source_tld: "", source_post_url: "", is_sticker: 0, import_datetime: "2024-01-01 10:00:00", trending_datetime: "0000-00-00 00:00:00",
    images: {
      original: r("original", w, h, "giphy.gif", { ...mp4("giphy.mp4"), webp_size: "120000", webp: `${base}/giphy.webp${q("giphy.webp")}`, frames: "24", hash: "abc" }),
      downsized: r("downsized", w, h, "giphy-downsized.gif"),
      downsized_large: r("downsized_large", w, h, "giphy.gif"),
      downsized_medium: r("downsized_medium", w, h, "giphy.gif"),
      downsized_small: { height: String(h), width: String(w), ...mp4("giphy-downsized-small.mp4") },
      downsized_still: r("downsized_still", w, h, "giphy-downsized_s.gif"),
      fixed_height: r("fixed_height", fw, 200, "200.gif", { ...mp4("200.mp4"), webp_size: "40000", webp: `${base}/200.webp${q("200.webp")}` }),
      fixed_height_downsampled: r("fixed_height_downsampled", fw, 200, "200_d.gif", { webp_size: "20000", webp: `${base}/200_d.webp${q("200_d.webp")}` }),
      fixed_height_small: r("fixed_height_small", Math.round(fw / 2), 100, "100.gif", { ...mp4("100.mp4"), webp_size: "9000", webp: `${base}/100.webp${q("100.webp")}` }),
      fixed_height_small_still: r("fixed_height_small_still", Math.round(fw / 2), 100, "100_s.gif"),
      fixed_height_still: r("fixed_height_still", fw, 200, "200_s.gif"),
      fixed_width: r("fixed_width", 200, fh, "200w.gif", { ...mp4("200w.mp4"), webp_size: "40000", webp: `${base}/200w.webp${q("200w.webp")}` }),
      fixed_width_downsampled: r("fixed_width_downsampled", 200, fh, "200w_d.gif", { webp_size: "20000", webp: `${base}/200w_d.webp${q("200w_d.webp")}` }),
      fixed_width_small: r("fixed_width_small", 100, Math.round(fh / 2), "100w.gif", { ...mp4("100w.mp4"), webp_size: "9000", webp: `${base}/100w.webp${q("100w.webp")}` }),
      fixed_width_small_still: r("fixed_width_small_still", 100, Math.round(fh / 2), "100w_s.gif"),
      fixed_width_still: r("fixed_width_still", 200, fh, "200w_s.gif"),
      looping: mp4("giphy-loop.mp4"),
      original_still: r("original_still", w, h, "giphy_s.gif"),
      original_mp4: { height: String(h), width: String(w), ...mp4("giphy.mp4") },
      preview: { height: "120", width: "160", ...mp4("giphy-preview.mp4") },
      preview_gif: r("preview_gif", 120, 90, "giphy-preview.gif"),
      preview_webp: { height: "120", width: "160", size: "40000", url: `${base}/giphy-preview.webp${q("giphy-preview.webp")}` },
      "480w_still": r("480w_still", 480, Math.round((480 * h) / w), "480w_s.jpg"),
    },
    analytics_response_payload: "e=probe",
    analytics: { onload: { url: "https://giphy-analytics.giphy.com/v2/pingback_simple?probe" }, onclick: { url: "https://giphy-analytics.giphy.com/v2/pingback_simple?probe" }, onsent: { url: "https://giphy-analytics.giphy.com/v2/pingback_simple?probe" } },
    alt_text: "",
  }
}
const giphyReply = (words, n, offset = 0) => ({
  data: Array.from({ length: n }, (_, i) => giphyItem(`${words || "trend"}${offset + i}AbCdEf`, [480, 360, 498, 400][i % 4], [270, 360, 280, 400][i % 4], `${words || "trending"} ${offset + i}`)),
  pagination: { total_count: words === "nothing" ? 0 : 120, count: n, offset },
  meta: { status: 200, msg: "OK", response_id: "probe" },
})
const serverGifs = await (async () => {
  const { build: b } = await import("esbuild")
  const out = join(stubs, "gifs-server.mjs")
  await b({ entryPoints: [join(root, "lib/communities/server/gifs.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error", plugins: [{ name: "server-only", setup(x) { x.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" })); x.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" })) } }] })
  return import(out)
})()
/** What /api/community/<id>/gifs answers for `words`: Giphy's reply through the real server code. */
async function giphyRoute(words, offset = 0) {
  const real = globalThis.fetch
  let asked = null
  globalThis.fetch = async (url) => {
    asked = String(url)
    const n = words === "nothing" ? 0 : offset ? 12 : 24
    return new Response(JSON.stringify(giphyReply(words, n, offset)), { status: 200, headers: { "content-type": "application/json" } })
  }
  try {
    const found = await serverGifs.searchGifs(serverGifs.cleanGifQuery(words), offset, "probe-key")
    return { asked, reply: found.ok ? { connected: true, gifs: found.gifs, next: found.next } : { error: "GIFs did not load. Try again." } }
  } finally {
    globalThis.fetch = real
  }
}

/* Member messages, shared by every page the probe opens: one conversation store, as the server would keep it. */
const dmStore = { conversations: new Map(), messages: [], pages: new Map() }
const NAMES = { "u-me": { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator" }, "u-jonas": { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member" } }

async function open(name, path, vp, opts = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  const navs = []
  const live = { now: {}, max: {}, sent: [], comments: 0 }
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) p.on("console", (m) => console.log("    [page]", m.text()))
  await p.setRequestInterception(true)
  const as = new URL(`${ORIGIN}${path}`).searchParams.get("as") || "u-me"
  if (opts.dm) dmStore.pages.set(as, p)
  p.on("request", (r) => {
    const url = r.url()
    const method = r.method()
    const reply = (body, status = 200, wait = 0) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }), wait)
    if (url.startsWith(`${ORIGIN}/upload/`)) {
      calls.push({ url: url.replace(ORIGIN, ""), method })
      return reply({}, 200, 60)
    }
    /* A picture the optimizer or storage would serve: a drawn one, so the viewer has something to show. */
    if (url.startsWith(`${ORIGIN}/_next/image`) || /\.supabase\.co\//.test(url) || (/\/api\/community\/[^/]+\/posts\/[^/]+\/files\//.test(url) && method === "GET")) {
      if (r.isNavigationRequest()) navs.push(url)
      calls.push({ url: url.replace(ORIGIN, ""), method, media: true })
      if (/\.(mp4|pdf)(\?|$)/.test(url) || /22222222-0000-4000-8000-000000000003/.test(url)) return r.respond({ status: 404, body: "" })
      return r.respond({ status: 200, contentType: "image/svg+xml", body: decodeURIComponent(svg("#dfe5ec", "#8796ab", 1200, 800).split(",")[1]) })
    }
    if (url.startsWith(`${ORIGIN}/api/`)) {
      const short = url.replace(ORIGIN, "")
      const body = r.postData() || null
      calls.push({ url: short, method, body })
      const sent = body ? JSON.parse(body) : {}
      /* Likes, saves and comments answer after a real connection's wait, one count of how many are on their way at once. */
      const toggle = short.endsWith("/reactions") ? `like:${sent.targetId}` : short.endsWith("/bookmarks") ? `save:${sent.postId}` : null
      if (toggle) {
        live.now[toggle] = (live.now[toggle] || 0) + 1
        live.max[toggle] = Math.max(live.max[toggle] || 0, live.now[toggle])
        live.sent.push([toggle, sent.on])
        return setTimeout(() => {
          live.now[toggle]--
          const refuse = opts.refuse?.includes(toggle)
          r.respond({ status: refuse ? 403 : 200, contentType: "application/json", body: JSON.stringify(refuse ? { error: "muted" } : toggle.startsWith("like:") ? { on: sent.on, count: (opts.likeBase ?? 0) + (sent.on ? 1 : 0) } : { on: sent.on }) })
        }, opts.wait ?? 300)
      }
      if (/\/posts\/[^/]+\/comments$/.test(short) && method === "POST") {
        const refuse = /refuse/.test(sent.body || "")
        const n = ++live.comments
        return setTimeout(() => r.respond({ status: refuse ? 403 : 201, contentType: "application/json", body: JSON.stringify(refuse ? { error: "muted" } : { comment: { id: `c-new-${n}`, postId: "x", parentId: sent.parentId ?? null, body: sent.body, status: "published", deleted: false, author: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator", level: 3 }, reactionCount: 0, reacted: false, createdAt: new Date().toISOString(), editedAt: null, replies: [], canEdit: true, canModerate: true } }) }), opts.commentWait ?? 400)
      }
      if (short.includes("/gifs") && opts.giphy) {
        const u = new URL(url)
        return void giphyRoute(u.searchParams.get("q") || "", Number(u.searchParams.get("offset")) || 0).then(({ asked, reply: body }) => {
          live.giphy = [...(live.giphy || []), asked]
          reply(body, 200, opts.gifWait ?? 120)
        })
      }
      if (short.includes("/gifs")) return reply(opts.gifsOff ? { connected: false, gifs: [], next: null } : { connected: true, gifs: GIFS, next: null })
      if (short.includes("/files")) {
        if (sent.action === "prepare") return reply({ ticket: { fileId: "33333333-0000-4000-8000-000000000001", url: `${ORIGIN}/upload/file`, token: "t", name: sent.fileName, maxBytes: 52428800 } })
        return reply({ file: { type: "file", assetId: "33333333-0000-4000-8000-000000000001", name: sent.name, size: 1234, store: "community" } }, 200, 80)
      }
      if (short.includes("/videos")) {
        if (sent.action === "prepare") return reply({ ticket: { videoId: "44444444-0000-4000-8000-000000000001", provider: "storage", method: "storage", url: `${ORIGIN}/upload/video`, path: "x", token: "t", headers: {} } })
        return reply({ video: { id: "44444444-0000-4000-8000-000000000001", provider: "storage", status: "ready", durationSeconds: 3, width: 640, height: 360, sizeBytes: 1000, thumbnailUrl: null, hasCaptions: false, error: null, createdAt: new Date().toISOString() } })
      }
      if (short.includes("/link-preview")) return reply({ preview: sent.url?.includes("youtube") ? { url: sent.url, title: "Critique night recording", image: null, site: "youtube.com" } : { url: sent.url, title: "A talk about naming things", image: svg("#f1e9da", "#d9c3a0", 600, 400), site: "example.com" } }, 200, 120)
      /* Round 9: the pinned post's first page has four comments, so the room kept for them can be measured against them. */
      if (/\/posts\/p-video\/comments/.test(short)) return reply({ comments: ["Great session, thanks for posting.", "The pricing page part was gold. I rewrote mine the next day and the trial starts went up.", "Saving this one.", "Same here, the empty states bit too."].map((body, i) => ({ id: `c-v${i}`, postId: "p-video", parentId: null, body, status: "published", deleted: false, author: { id: i ? "u-leo" : "u-jonas", name: i ? "Leo Martins" : "Jonas Berg", username: i ? "leom" : "jonasb", avatarUrl: null, role: "member", level: 2 }, reactionCount: i, reacted: false, createdAt: new Date(Date.now() - (3 - i) * 3600e3).toISOString(), editedAt: null, replies: [], canEdit: false, canModerate: true })), nextCursor: null, commentsEnabled: true, me: { name: "Sam Carter", avatarUrl: null } }, 200, opts.commentsWait ?? 150)
      if (/\/posts\/[^/]+\/comments/.test(short)) return reply({ comments: [], nextCursor: null, commentsEnabled: true, me: { name: "Sam Carter", avatarUrl: null } }, 200, 150)
      if (/\/feed\b|\/posts\?/.test(short) && method === "GET") live.feedReads = (live.feedReads || 0) + 1
      if (/\/posts\/p-[a-z0-9-]+$/.test(short) && method === "GET") return reply({ error: "not_found" }, 404)
      if (short.endsWith("/posts") && method === "POST") return reply({ post: { id: "p-new", communityId: CID, space: { id: sent.spaceId, slug: "general", name: "General" }, kind: "post", title: sent.title, body: "", bodyText: sent.body, media: sent.media, pinned: false, featured: false, locked: false, status: "published", author: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator", level: 3 }, reactionCount: 0, commentCount: 0, reacted: false, bookmarked: false, poll: null, createdAt: new Date().toISOString(), editedAt: null, lastActivityAt: new Date().toISOString(), canEdit: true, canModerate: true, recentCommenters: [], lastCommentAt: null, showLevel: true } }, 201)
      if (short.includes("/members?")) return reply({ members: [{ userId: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member", status: "active", level: 3, points: 0 }], nextCursor: null })
      if (short.includes("/dms")) return dmAnswer(as, short, method, sent, reply)
      if (short.includes("/presence")) return reply({ online: 5 })
      return reply({})
    }
    /* The page itself for a navigation; anything else the page asks of the site (a prefetch, an optimizer address) is not a whole page to decode. */
    if (url.startsWith(`${ORIGIN}/`)) {
      if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html })
      calls.push({ url: url.replace(ORIGIN, ""), method, other: true })
      return r.respond({ status: 404, body: "" })
    }
    if (/^https:\/\/(media\d*|i)\.giphy\.com\//.test(url)) {
      live.giphyImages = (live.giphyImages || 0) + 1
      return r.respond({ status: 200, contentType: "image/svg+xml", body: decodeURIComponent(svg("#e7dff3", "#9b87c4", 200, 150).split(",")[1]) })
    }
    if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
    if (r.isNavigationRequest()) navs.push(url)
    return r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}case=${name}`, { waitUntil: "load" })
  await sleep(500)
  return { p, errors, calls, navs, live }
}

function dmAnswer(as, short, method, sent, reply) {
  const other = as === "u-me" ? "u-jonas" : "u-me"
  const view = (c) => {
    const last = dmStore.messages.filter((m) => m.conversationId === c.id).at(-1)
    const read = c.read[as]
    return { id: c.id, other: NAMES[other], lastBody: last?.body ?? "", lastAt: last?.createdAt ?? null, lastFromMe: last?.author === as, unread: !!last && last.author !== as && (!read || read < last.createdAt) }
  }
  const m = /\/dms(?:\/([^/?]+))?(\/read)?(?:\?(.*))?$/.exec(short)
  const id = m?.[1]
  if (!id && method === "GET") {
    const list = [...dmStore.conversations.values()].filter((c) => dmStore.messages.some((x) => x.conversationId === c.id)).map(view)
    return reply({ ready: true, conversations: list, unread: list.filter((c) => c.unread).length })
  }
  if (!id && method === "POST") {
    let c = [...dmStore.conversations.values()][0]
    if (!c) {
      c = { id: "55555555-0000-4000-8000-000000000001", read: {} }
      dmStore.conversations.set(c.id, c)
    }
    return reply({ conversation: { id: c.id, other: NAMES[other] } })
  }
  const c = dmStore.conversations.get(id)
  if (!c) return reply({ error: "not_found" }, 404)
  if (m[2]) {
    c.read[as] = new Date().toISOString()
    return reply({ ok: true })
  }
  if (method === "GET") {
    const after = new URLSearchParams(m[3] || "").get("after")
    const rows = dmStore.messages.filter((x) => x.conversationId === id && (!after || x.createdAt > after))
    return reply({ messages: rows.map((x) => ({ id: x.id, conversationId: id, body: x.body, mine: x.author === as, createdAt: x.createdAt, editedAt: null })), hasMore: false })
  }
  const msg = { id: `66666666-0000-4000-8000-${String(dmStore.messages.length + 1).padStart(12, "0")}`, conversationId: id, author: as, body: sent.body, createdAt: new Date().toISOString() }
  dmStore.messages.push(msg)
  reply({ message: { id: msg.id, conversationId: id, body: msg.body, mine: true, createdAt: msg.createdAt, editedAt: null } }, 201)
  /* The database's realtime: the row to every page whose member is in the conversation, the conversation's row too. */
  setTimeout(async () => {
    for (const [, page] of dmStore.pages) {
      await page.evaluate((row, conv) => {
        window.__emit("community_direct_messages", row, "INSERT")
        window.__emit("community_conversations", conv, "UPDATE")
      }, { id: msg.id, conversation_id: id, community_id: CID, status: "published" }, { id, community_id: CID }).catch(() => {})
    }
  }, 40)
}

/** A press that waits for its target to be visible, falling back to a DOM click when puppeteer finds no point to press. */
async function press(p, sel) {
  const el = await p.waitForSelector(sel, { visible: true, timeout: 5000 })
  try {
    await el.click()
  } catch {
    await el.evaluate((e) => e.click())
  }
}

const shot = (p, name, fullPage = false) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
const smallTargets = (p, scope = "body") =>
  p.evaluate((scope) => {
    const out = []
    for (const el of document.querySelector(scope)?.querySelectorAll("button, a[data-post-open], [data-like], [data-comment-button], input:not([type=hidden]):not([type=checkbox]):not([type=file])") ?? []) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const st = getComputedStyle(el)
      if (st.visibility === "hidden" || st.display === "none") continue
      if (el.closest("[data-post-thumb], [data-commenters]")) continue
      if (r.height < 40 && el.tagName !== "INPUT" && !el.matches("a[data-post-open]")) out.push({ text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
    }
    return out
  }, scope)

/**
 * Frames from a press until the moving thing settles, at 4x CPU. Two
 * numbers: how long until the first frame with the new thing on screen
 * (React drawing it: `mount`), and the gaps between frames WHILE it moves
 * (from that frame for `windowMs`, the length of the move and two frames
 * of start: `max`, and how many went past 34ms, two frames). What happens
 * after the move has ended (the comments arriving) is not the move.
 */
async function frames(p, cdp, act, settled, ms = 700, appears = null, windowMs = 320) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await p.evaluate((appears) => {
    window.__stamps = []
    window.__mountAt = null
    window.__t0 = performance.now()
    if (appears) {
      const seen = () => {
        if (window.__mountAt === null && document.querySelector(appears)) window.__mountAt = performance.now()
      }
      window.__mo = new MutationObserver(seen)
      window.__mo.observe(document.body, { childList: true, subtree: true, attributes: true })
    }
    const loop = (t) => {
      window.__stamps.push(t)
      if (window.__stamps.length < 500) window.__raf = requestAnimationFrame(loop)
    }
    window.__raf = requestAnimationFrame(loop)
  }, appears)
  const t0 = Date.now()
  await act()
  await p.waitForFunction(settled, { timeout: 4000 }).catch(() => {})
  const took = Date.now() - t0
  await sleep(ms)
  const out = await p.evaluate((windowMs) => {
    cancelAnimationFrame(window.__raf)
    window.__mo?.disconnect()
    const start = window.__mountAt ?? window.__t0
    const st = window.__stamps.filter((t) => t <= start + windowMs)
    const from = window.__mountAt === null ? 1 : Math.max(1, st.findIndex((t) => t > window.__mountAt) + 1)
    const gaps = st.slice(from).map((t, i) => t - st[from + i - 1])
    const firstPaint = window.__mountAt === null ? null : st.find((t) => t > window.__mountAt)
    const long = gaps.map((g, i) => [Math.round(st[from + i] - window.__t0), Math.round(g)]).filter(([, g]) => g > 34)
    return { mount: firstPaint ? Math.round(firstPaint - window.__t0) : null, max: Math.round(Math.max(0, ...gaps)), over34: gaps.filter((x) => x > 34).length, count: gaps.length, long }
  }, windowMs)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  return { ...out, settleMs: took }
}

try {
  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.DM_ONLY && (!process.env.ONLY || l.startsWith(process.env.ONLY)))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── CARDS ────────────────────────────────────────────────────── */
    if (want("cards")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      await shot(p, `${label}-feed`)
      const card = await p.evaluate(() => {
        const out = {}
        for (const el of document.querySelectorAll("[data-post]")) {
          const thumb = el.querySelector("[data-post-thumb]")
          const title = el.querySelector("h2")
          const t = thumb?.getBoundingClientRect()
          const c = el.getBoundingClientRect()
          out[el.getAttribute("data-post")] = {
            thumb: thumb ? { w: Math.round(t.width), h: Math.round(t.height), kind: thumb.getAttribute("data-post-thumb"), right: Math.round(c.right - t.right), rightOfTitle: t.left >= title.getBoundingClientRect().right - 1 } : null,
            unread: !!el.querySelector("[data-unread-dot]"),
            level: el.querySelector("[data-level-badge]")?.textContent ?? null,
            faces: el.querySelectorAll("[data-commenters] > *").length,
            fresh: el.querySelector("[data-new-comment]")?.textContent ?? null,
            excerptLines: (() => {
              const e = el.querySelector("[data-post-excerpt]")
              return e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) : 0
            })(),
          }
        }
        return out
      })
      if (!card["p-intro"]) throw new Error(`the feed did not draw: ${JSON.stringify(errors)}`)
      /* Round 9 changed this on purpose (the owner asked): a phone draws the pictures under the words (ROWS below), no thumbnail on the right. */
      if (phone) expect(card["p-intro"].thumb?.w === 0 && card["p-intro"].thumb?.h === 0, "a phone draws no thumbnail on the right (the pictures go under the words)", card["p-intro"].thumb)
      else {
        expect(card["p-intro"].thumb?.w === 96 && card["p-intro"].thumb?.h === 96, "the card's one thumbnail is 96px", card["p-intro"].thumb)
        expect(card["p-intro"].thumb?.rightOfTitle && card["p-intro"].thumb.right <= 24, "it sits on the right, beside the title and the words", card["p-intro"].thumb)
      }
      expect(card["p-video"].thumb?.kind === "video" && card["p-gif"].thumb?.kind === "gif" && card["p-link"].thumb?.kind === "link" && card["p-text"].thumb === null, "a video by address shows its picture, a GIF its still, a link its picture, text nothing", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.thumb?.kind ?? null])))
      expect(card["p-intro"].level === "2" && card["p-video"].level === "6", "the author's level sits on their picture", [card["p-intro"].level, card["p-video"].level])
      const faces = await p.evaluate(() => [...document.querySelectorAll('[data-post="p-intro"] [data-commenters] > *')].filter((e) => e.getBoundingClientRect().width > 0).length)
      expect(faces === (phone ? 2 : 3) && card["p-video"].faces === 2, phone ? "up to three commenters' faces, two on a 390px phone" : "up to three commenters' faces", [faces, card["p-video"].faces])
      expect(/^New comment \d+h ago$/.test(card["p-video"].fresh ?? "") && card["p-gif"].fresh === null, "\"New comment 3h ago\" only for one in the last week", [card["p-video"].fresh, card["p-gif"].fresh])
      const cut = await p.evaluate(() => [...document.querySelectorAll("[data-new-comment]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length)
      expect(cut === 0, "and it is never cut short", cut)
      expect(card["p-intro"].unread && card["p-video"].unread && !card["p-gif"].unread && !card["p-link"].unread, "the dot: new to me, not opened, not mine", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.unread])))
      expect(card["p-intro"].excerptLines <= 2 && card["p-intro"].excerptLines >= 1, "two lines of the words at most", card["p-intro"].excerptLines)
      /* Round 8: the role is RoleBadge (no grey pill), on the name's line, beside Pinned, never wrapped under the name. */
      const role = await p.evaluate(() => {
        const card = document.querySelector('[data-post="p-video"]')
        const line = card.querySelector("[data-post-name-line]")
        const badge = line?.querySelector("[data-role-badge]")
        const name = line?.querySelector("[data-person-link]")
        const pin = card.querySelector("[data-pin-mark]")
        const r = (e) => e?.getBoundingClientRect()
        return badge && name && pin ? { role: badge.getAttribute("data-role-badge"), text: badge.textContent, lineH: Math.round(r(line).height), sameLine: Math.abs(r(badge).top + r(badge).height / 2 - (r(name).top + r(name).height / 2)) <= 2, gapToPin: Math.round(r(pin).left - r(badge).right), bg: getComputedStyle(badge).backgroundColor } : null
      })
      expect(!!role && role.role === "owner" && role.text === "Owner" && role.sameLine && role.lineH <= 20 && role.gapToPin >= 0 && role.bg === "rgba(0, 0, 0, 0)", "the Owner badge sits on the name's line, left of Pinned, not a filled pill", role)
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      if (phone) {
        const small = await smallTargets(p, "[data-feed-list]")
        expect(small.length === 0, "every control on a card is at least 40px tall", small.slice(0, 6))
      }
      const el = await p.$('[data-post="p-intro"]')
      await el.screenshot({ path: join(shots, `${label}-card.png`) })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── COMPOSER: every attachment kind, and the POST ─────────────── */
    if (want("composer")) {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      const closedKids = await p.evaluate(() => [...document.querySelectorAll('[data-composer="closed"] button')].map((b) => b.textContent.trim()))
      expect(closedKids.length === 1 && /Share something/.test(closedKids[0]), "closed, the composer is one field", closedKids)
      await p.click("[data-composer-open]")
      await sleep(450)
      const mode = await p.evaluate(() => document.querySelector("[data-composer=sheet]") ? "sheet" : document.querySelector("[data-composer=open]") ? "open" : "none")
      expect(mode === (phone ? "sheet" : "open"), phone ? "a phone gets a screen of its own" : "a computer edits in place", mode)
      if (phone) {
        const sheetBox = await p.evaluate(() => {
          const r = document.querySelector("[data-composer=sheet]").getBoundingClientRect()
          return { top: Math.round(r.top), h: Math.round(r.height) }
        })
        expect(sheetBox.top === 0 && sheetBox.h === 844, "the screen covers the phone", sheetBox)
      }
      const disabled = () => p.$eval("[data-composer-post]", (b) => b.disabled)
      expect(await disabled(), "Post waits while it is empty")
      await p.type("[data-composer-title]", "Testing every attachment")
      expect(await disabled(), "a title alone is not enough")
      await p.type('[aria-label="Post"]', "Words for the post. ")
      expect(await disabled(), "nor a title and words without a space")
      await p.click("[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      expect(!(await disabled()), "title, words and a space: Post is ready")

      /* A file and a picture through the paperclip. */
      const input = await p.$("[data-composer-file-input]")
      const pdf = join(stubs, "Plan.pdf")
      writeFileSync(pdf, "%PDF-1.4\n%probe\n")
      const png = join(stubs, "photo.png")
      writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJgYGBAQAvRgP9C/2bSAAAAABJRU5ErkJggg==", "base64"))
      await input.uploadFile(pdf, png)
      await p.waitForFunction(() => document.querySelectorAll('[data-attachment][data-ready="true"]').length >= 2, { timeout: 8000 }).catch(() => {})
      const kinds1 = await p.$$eval("[data-attachment]", (els) => els.map((e) => e.getAttribute("data-attachment")))
      expect(kinds1.includes("file") && kinds1.includes("image"), "a file and a picture are attached", kinds1)
      expect(calls.some((c) => c.url.endsWith("/files") && /"prepare"/.test(c.body)) && calls.some((c) => c.url === "/upload/file" && c.method === "PUT") && calls.some((c) => c.url.endsWith("/files") && /"complete"/.test(c.body)), "the file is asked for, sent and checked through the community's route")

      /* A link with its card. */
      await p.click('[data-composer-tool="link"]')
      await p.type("[data-composer-link-field] input", "example.com/talk")
      await p.keyboard.press("Enter")
      await p.waitForSelector("[data-link-card]", { timeout: 4000 }).catch(() => {})
      expect(!!(await p.$("[data-link-card]")), "a link brings its card")

      /* A video by address. */
      await p.click('[data-composer-tool="video"]')
      await sleep(200)
      await p.type('[data-composer-link-field="video"] input', "https://youtu.be/dQw4w9WgXcQ")
      await p.keyboard.press("Enter")
      await sleep(300)
      expect(!!(await p.$('[data-attachment="embed"]')), "a YouTube address becomes the video")

      /* A video from the device. */
      const vid = join(stubs, "clip.mp4")
      writeFileSync(vid, Buffer.alloc(2048, 1))
      await p.click('[data-composer-tool="video"]')
      await sleep(200)
      const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 3000 }), p.click("[data-composer-video-upload]")])
      expect(!!chooser, "Upload opens the device's file picker inside the press")
      await chooser.accept([vid])
      await p.waitForFunction(() => !!document.querySelector('[data-attachment="video"][data-ready="true"]'), { timeout: 20000 }).catch(() => {})
      expect(!!(await p.$('[data-attachment="video"]')) && calls.some((c) => c.url.endsWith("/videos") && /"complete"/.test(c.body)), "a video from the device goes through the community's video route")

      /* A poll. */
      await p.click('[data-composer-tool="poll"]')
      await p.type('[aria-label="Poll question"]', "Which one?")
      await p.type('[aria-label="Choice 1"]', "This")
      await p.type('[aria-label="Choice 2"]', "That")
      expect(!!(await p.$("[data-composer-poll-editor]")), "a poll has its editor")

      /* An emoji, where the caret was. */
      await p.click('[aria-label="Post"]')
      await p.click("[data-emoji-trigger]")
      await sleep(500)
      await p.evaluate(() => document.querySelector("[data-emoji]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
      await sleep(300)
      if (phone) {
        await p.keyboard.press("Escape").catch(() => {})
        await sleep(300)
      } else {
        await p.keyboard.press("Escape").catch(() => {})
      }
      const bodyText = await p.$eval('[aria-label="Post"]', (t) => t.value)
      expect(/\p{Extended_Pictographic}/u.test(bodyText), "an emoji goes into the words", bodyText.slice(-6))

      /* A GIF. */
      await sleep(300)
      await p.click("[data-composer-gif]")
      await p.waitForSelector("[data-gif]", { timeout: 4000 }).catch(() => {})
      await shot(p, `${label}-gif-picker`)
      await p.click("[data-gif]")
      await sleep(400)
      expect(!!(await p.$('[data-attachment="gif"]')), "a GIF is attached")
      await shot(p, `${label}-composer-full`, !phone)

      await p.click("[data-composer-post]")
      await sleep(600)
      const sent = calls.filter((c) => c.url.endsWith("/posts") && c.method === "POST").map((c) => JSON.parse(c.body))[0]
      const types = (sent?.media ?? []).map((m) => m.type).sort()
      expect(sent?.title === "Testing every attachment" && /Words for the post/.test(sent?.body ?? "") && !!sent?.spaceId, "the POST carries the title, the words and the space", sent && { title: sent.title, spaceId: sent.spaceId })
      expect(["embed", "file", "gif", "image", "link", "video"].every((t) => types.includes(t)) && !!sent?.poll, "and every kind of attachment, and the poll", types)
      const after = await p.evaluate(() => ({ closed: !!document.querySelector('[data-composer="closed"]'), order: [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")).slice(0, 3) }))
      expect(after.closed && after.order.join() === "p-video,p-new,p-intro", "posted: the composer closes and the new post is first under the pinned one", after)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── GIFS NOT CONNECTED ───────────────────────────────────────── */
    if (want("gifs")) {
      const { p } = await open("feed", "/community/studio-notes", vp, { gifsOff: true })
      await p.click("[data-composer-open]")
      await sleep(600)
      const off = await p.$eval("[data-composer-gif]", (b) => ({ state: b.getAttribute("data-composer-gif"), opacity: getComputedStyle(b).opacity }))
      expect(off.state === "off" && Number(off.opacity) < 0.8, "without the key the GIF button is quieter", off)
      await p.click("[data-composer-gif]")
      await sleep(400)
      expect(!!(await p.$("[data-gif-off]")), "and opening it says GIFs are not connected")
      await shot(p, `${label}-gif-off`)
      await p.close()
    }

    /* ── LEAVING WITH SOMETHING WRITTEN ───────────────────────────── */
    if (want("leaving")) {
      const { p } = await open("feed", "/community/studio-notes", vp)
      await p.click("[data-composer-open]")
      await sleep(450)
      await p.type("[data-composer-title]", "Half a thought")
      await sleep(450)
      await p.click("[data-composer-cancel]")
      await sleep(350)
      const q = await p.evaluate(() => document.querySelector("[data-leave-dialog]")?.closest('[role="dialog"]')?.textContent ?? "")
      expect(/You haven't finished your post yet\. Leave without posting\?/.test(q) && /Keep writing/.test(q) && /Leave/.test(q), "Cancel asks the question in Storelib's dialog", q.slice(0, 90))
      await shot(p, `${label}-leave`)
      await p.click("[data-leave-stay]")
      await sleep(300)
      expect(await p.$eval("[data-composer-title]", (i) => i.value) === "Half a thought", "Keep writing keeps it")
      if (!phone) {
        /* A link to another page is held too. */
        await p.evaluate(() => {
          const a = document.createElement("a")
          a.href = "/community/studio-notes/members"
          a.textContent = "Members"
          a.id = "away"
          document.body.appendChild(a)
        })
        await p.click("#away")
        await sleep(350)
        expect(!!(await p.$("[data-leave-dialog]")), "a link to another page asks first")
        await p.click("[data-leave-go]")
        await sleep(300)
        const r = await p.evaluate(() => ({ router: window.__router ?? [], closed: !!document.querySelector('[data-composer="closed"]'), draft: Object.keys(localStorage).filter((k) => k.startsWith("storelib:community-draft")).length }))
        expect(r.router.some(([k, h]) => k === "push" && h === "/community/studio-notes/members") && r.closed && r.draft === 0, "Leave goes there, closes the editor and drops the draft", r)
      } else {
        /* Back on a phone. */
        await p.evaluate(() => history.back())
        await sleep(400)
        expect(!!(await p.$("[data-leave-dialog]")), "Back on a phone asks first")
        await p.click("[data-leave-go]")
        await sleep(500)
        expect(!!(await p.$('[data-composer="closed"]')) && !(await p.$('[data-composer="sheet"]')), "Leave closes the screen")
      }
      await p.close()
    }

    /* ── OPENING A POST OVER THE FEED ─────────────────────────────── */
    if (want("opening")) {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const before = await p.evaluate(() => location.pathname)
      const target = `[data-post="${process.env.OPEN_POST || "p-video"}"] [data-post-excerpt]`
      const opening = await frames(
        p,
        cdp,
        async () => {
          if (phone) await p.tap(target)
          else await p.click(target)
        },
        () => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown",
        450,
        "[data-post-overlay]",
        280,
      )
      const opened = await p.evaluate(() => ({ path: location.pathname, overlay: document.querySelector("[data-post-overlay]")?.getAttribute("data-post-overlay"), router: (window.__router ?? []).filter(([k]) => k === "push" || k === "link") }))
      expect(opened.overlay === (phone ? "phone" : "panel"), phone ? "a phone opens the post as a screen" : "a computer opens the post over the feed", opened.overlay)
      expect(opened.path === "/community/studio-notes/post/p-video" && opened.router.length === 0, "the address is the post's own, with no page load", opened)
      const runs = [opening]
      await sleep(300)
      expect(calls.some((c) => /\/posts\/p-video\/comments$/.test(c.url)), "the comments are read for the opened post")
      await shot(p, `${label}-post-open`)
      if (!phone) {
        const panel = await p.evaluate(() => {
          const r = document.querySelector('[data-post-overlay="panel"]').getBoundingClientRect()
          return { w: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top) }
        })
        expect(panel.w === 760 && Math.abs(panel.left - (1440 - 760) / 2) <= 1, "a 760px panel in the middle", panel)
      }
      const closing = await frames(
        p,
        cdp,
        async () => {
          if (phone) {
            /* A swipe down on the screen's bar. */
            const bar = await p.$("[data-post-overlay-bar]")
            const b = await bar.boundingBox()
            const x = b.x + b.width / 2
            const y = b.y + b.height / 2
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
            for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 25 }] })
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
          } else await p.keyboard.press("Escape")
        },
        () => !document.querySelector("[data-post-overlay]"),
        300,
        null,
        /* The close moves for 180ms; the frame that then takes it off the page comes after the move. */
        180,
      )
      const closed = await p.evaluate(() => ({ path: location.pathname, overlay: !!document.querySelector("[data-post-overlay]"), seen: !!document.querySelector('[data-post="p-video"] [data-unread-dot]') }))
      expect(!closed.overlay && closed.path === before, phone ? "a swipe down closes it and the address goes back" : "Escape closes it and the address goes back", closed)
      expect(closing.over34 === 0 && closing.max <= 34, "closing at 4x CPU: no frame over two frames' time", closing)
      expect(!closed.seen, "opened, the post is no longer new: its dot is gone")
      /*
        Two more opens, measured the same way, so one noisy frame on a
        shared machine does not decide it: the middle run must be clean.
      */
      for (let i = 0; i < 2; i++) {
        await sleep(400)
        runs.push(
          await frames(p, cdp, () => (phone ? p.tap(target) : p.click(target)), () => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", 450, "[data-post-overlay]", 280),
        )
        await p.keyboard.press("Escape")
        await sleep(500)
      }
      const middle = [...runs].sort((x, y) => x.max - y.max)[1]
      const mounts = runs.map((r) => r.mount).sort((x, y) => x - y)
      expect(mounts[1] !== null && mounts[1] < 300, "at 4x CPU the post is on screen within 300ms of the press (75ms at full speed) (middle of three)", runs.map((r) => r.mount))
      expect(middle.over34 === 0 && middle.max <= 34, "and it slides in with no frame over two frames' time (middle of three)", runs.map((r) => ({ max: r.max, long: r.long })))
      /* Back closes it too. */
      await p.click('[data-post="p-text"] [data-post-excerpt]')
      await sleep(500)
      await p.evaluate(() => history.back())
      await sleep(450)
      expect(!(await p.$("[data-post-overlay]")), "the browser's Back closes it")
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── THE POST PAGE AND THE LIGHTBOX ───────────────────────────── */
    if (want("lightbox")) {
      const { p, errors } = await open("post", "/community/studio-notes/post/p-intro", vp)
      await shot(p, `${label}-post-page`, true)
      const grid = await p.evaluate(() => {
        const box = document.querySelector("[data-post-media]").getBoundingClientRect()
        const tiles = [...document.querySelectorAll("[data-media-tile]")].map((t) => t.getBoundingClientRect())
        return { boxW: Math.round(box.width), tiles: tiles.length, widths: tiles.map((t) => Math.round(t.width)), layout: document.querySelector("[data-post-media-grid]")?.getAttribute("data-post-media-grid") }
      })
      /* Round 8 changed this on purpose: four things are a grid, the first one large across the post. */
      expect(grid.tiles === 4 && grid.layout === "grid" && grid.widths[0] === grid.boxW && grid.widths.slice(1).every((w) => Math.abs(w - (grid.boxW - 8) / 3) <= 1.5), "four things in a post: the first across its full width, three under it", grid)
      const cdp = await p.target().createCDPSession()
      /* Three opens, the middle one judged, as for the post: the machine these run on is shared. */
      const lbRuns = []
      for (let i = 0; i < 3; i++) {
        if (i) {
          await p.keyboard.press("Escape")
          await sleep(450)
        }
        lbRuns.push(await frames(p, cdp, () => p.click('[data-media-tile="image"]'), () => document.querySelector("[data-lightbox-phase]")?.getAttribute("data-lightbox-phase") === "open", 300, "[data-lightbox]"))
      }
      const openLb = [...lbRuns].sort((x, y) => x.mount - y.mount)[1]
      expect(!!(await p.$("[data-lightbox]")), "a tile opens the lightbox")
      expect(openLb.mount !== null && openLb.mount < 300 && openLb.over34 === 0 && openLb.max <= 34, "the lightbox at 4x CPU: on screen within 300ms (75ms at full speed), then no frame over two frames' time (middle of three)", lbRuns.map((r) => ({ mount: r.mount, max: r.max })))
      await shot(p, `${label}-lightbox`)
      if (!phone) {
        await p.keyboard.press("ArrowRight")
        await sleep(350)
        expect((await p.$eval("[data-lightbox-count]", (e) => e.textContent)) === "2 / 4", "the arrow key moves to the next one")
      } else {
        const box = { x: 195, y: 420 }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] })
        for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x - i * 25, y: box.y }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(400)
        expect((await p.$eval("[data-lightbox-count]", (e) => e.textContent)) === "2 / 4", "a swipe moves to the next one")
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] })
        for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + i * 25, y: box.y }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(400)
        /* Two fingers apart: a zoom. */
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 170, y: 420, id: 1 }, { x: 220, y: 420, id: 2 }] })
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 170 - i * 15, y: 420, id: 1 }, { x: 220 + i * 15, y: 420, id: 2 }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(300)
        const scale = await p.evaluate(() => [...document.querySelectorAll("[data-lightbox-image]")].map((i) => Number(i.style.scale || 1)).sort((a, b) => b - a)[0])
        expect(scale > 1.5, "two fingers zoom the picture", scale)
        await shot(p, `${label}-lightbox-zoom`)
      }
      await p.keyboard.press("Escape")
      await sleep(450)
      expect(!(await p.$("[data-lightbox]")), "Escape closes it")
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── ROUND 8: MEDIA IN AN OPENED POST ─────────────────────────── */
    if (want("media")) {
      const layout = async (id) => {
        const { p, errors } = await open("media", `/community/studio-notes/post/${id}?post=${id}`, vp)
        await p.waitForSelector("[data-post-media]", { timeout: 4000 }).catch(() => {})
        const m = await p.evaluate(() => {
          const r = (e) => {
            const b = e.getBoundingClientRect()
            return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
          }
          const box = document.querySelector("[data-post-media]")
          const title = document.querySelector("[data-post] h1")
          return {
            box: box ? r(box) : null,
            text: title ? r(title.parentElement) : null,
            layout: document.querySelector("[data-post-media-grid]")?.getAttribute("data-post-media-grid") ?? null,
            tiles: [...document.querySelectorAll("[data-media-tile]")].map((t) => ({ ...r(t), kind: t.getAttribute("data-media-tile") })),
            more: document.querySelector("[data-media-more]")?.textContent ?? null,
            embeds: [...document.querySelectorAll("[data-embed-player]")].map(r),
            video: [...document.querySelectorAll("[data-storelib-video]")].map(r),
            vh: innerHeight,
          }
        })
        return { p, errors, m }
      }
      const W = (m) => m.box?.w ?? 0

      {
        const { p, errors, m } = await layout("m-one")
        const t = m.tiles[0]
        expect(m.layout === "single" && t && t.w === W(m) && m.text && W(m) === m.text.w, "one picture: the post's full width", { box: m.box, text: m.text, tile: t })
        expect(t && Math.abs(t.h - t.w / 1.6) <= 1.5, "in its own shape (16:10 here)", t)
        await shot(p, `${label}-media-one`)
        expect(errors.length === 0, "no page error", errors)
        await p.close()
      }
      {
        const { p, m } = await layout("m-tall")
        const t = m.tiles[0]
        const cap = Math.min(560, Math.round(m.vh * 0.72))
        expect(t && t.w === W(m) && Math.abs(t.h - cap) <= 1, "a tall picture: full width, no taller than the screen allows", { tile: t, cap })
        await shot(p, `${label}-media-tall`)
        await p.close()
      }
      {
        const { p, m } = await layout("m-two")
        const [a, b] = m.tiles
        const half = (W(m) - 4) / 2
        expect(m.layout === "pair" && m.tiles.length === 2 && Math.abs(a.w - half) <= 1 && Math.abs(b.w - half) <= 1, "two things side by side, each half the width", m.tiles)
        expect(a.h === b.h && a.y === b.y && a.h >= half - 1, "at the same height, never shrunk to thumbnails", m.tiles)
        expect(a.kind === "image" && b.kind === "video", "a picture and a video together", m.tiles.map((x) => x.kind))
        await shot(p, `${label}-media-two`)
        /* The video's tile plays it in the viewer. */
        await p.click('[data-media-tile="video"]')
        await p.waitForSelector("[data-lightbox] [data-storelib-video]", { timeout: 3000 }).catch(() => {})
        expect(!!(await p.$("[data-lightbox] [data-storelib-video]")), "the video's tile opens the viewer on the video")
        await p.keyboard.press("Escape")
        await sleep(300)
        await p.close()
      }
      {
        const { p, m } = await layout("m-many")
        const [top, ...below] = m.tiles
        const third = (W(m) - 8) / 3
        expect(m.layout === "grid" && top.w === W(m) && Math.abs(top.h - (W(m) * 9) / 16) <= 1.5, "five pictures: the first large across the top", top)
        expect(below.length === 3 && below.every((x) => Math.abs(x.w - third) <= 1.5 && Math.abs(x.h - x.w) <= 1.5 && x.y === below[0].y), "then three squares under it", below)
        expect(m.more === "+1", "the last says how many more", m.more)
        expect(!m.tiles.some((x) => x.kind === "embed"), "no YouTube tile in the grid", m.tiles.map((x) => x.kind))
        await shot(p, `${label}-media-many`)
        /* The YouTube video among them is not a tile but its own player under the grid. */
        const grid = await p.evaluate(() => Math.round(document.querySelector("[data-post-media-grid]").getBoundingClientRect().bottom))
        expect(m.embeds.length === 1 && m.embeds[0].w === W(m) && Math.abs(m.embeds[0].h - (W(m) * 9) / 16) <= 1 && m.embeds[0].y >= grid, "the YouTube video with them is a 16:9 player under the grid, full width", { grid, embed: m.embeds[0] })
        await p.close()
      }
      {
        const { p, m } = await layout("m-video")
        const v = m.video[0]
        expect(m.layout === "single" && v && v.w === W(m) && Math.abs(v.h - (v.w * 9) / 16) <= 1, "a video alone: the post's full width, 16:9, with its poster", v)
        expect(!!(await p.$("[data-post-media] [data-storelib-video] button")), "and plays where it is")
        await shot(p, `${label}-media-video`)
        await p.close()
      }
      {
        const { p, errors, m } = await layout("m-yt")
        expect(m.embeds.length === 2 && m.embeds.every((e) => e.w === W(m) && Math.abs(e.h - (e.w * 9) / 16) <= 1), "two YouTube addresses in the words (youtu.be, m.youtube.com/shorts): each a 16:9 player under the text", m.embeds)
        const textBottom = await p.evaluate(() => Math.round(document.querySelector("[data-post] h1 + div").getBoundingClientRect().bottom))
        expect(m.embeds[0] && m.embeds[0].y >= textBottom, "under the text", { textBottom, embed: m.embeds[0] })
        await shot(p, `${label}-media-youtube`)
        await p.click("[data-embed-play]")
        await p.waitForSelector("[data-post-media] iframe", { timeout: 3000 }).catch(() => {})
        const srcs = await p.evaluate(() => [...document.querySelectorAll("[data-post-media] iframe")].map((f) => f.getAttribute("src")))
        expect(srcs.length === 1 && /youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?.*autoplay=1/.test(srcs[0]), "pressed, it plays inline in the post", srcs)
        await p.click("[data-embed-play]")
        await sleep(200)
        const srcs2 = await p.evaluate(() => [...document.querySelectorAll("[data-post-media] iframe")].map((f) => f.getAttribute("src")))
        expect(srcs2.some((x) => /embed\/ScMzIvxBSi4/.test(x)), "the shorts address plays as well", srcs2)
        const side = await sideScroll(p)
        expect(side.scroll <= side.width, "nothing scrolls sideways", side)
        expect(errors.length === 0, "no page error", errors)
        await p.close()
      }
    }

    /* ── ROUND 8: THE VIEWER, NEVER A RAW FILE IN A TAB ───────────── */
    if (want("viewer")) {
      const { p, errors, navs } = await open("media", "/community/studio-notes/post/m-links?post=m-links", vp)
      let tabs = 0
      const onTarget = () => tabs++
      browser.on("targetcreated", onTarget)
      const before = await p.evaluate(() => location.href)
      const viewer = async (sel, what) => {
        await p.evaluate((q) => document.querySelector(q)?.scrollIntoView({ block: "center" }), sel)
        await sleep(120)
        if (phone) await p.tap(sel)
        else await p.click(sel)
        await p.waitForFunction(() => document.querySelector("[data-lightbox-phase]")?.getAttribute("data-lightbox-phase") === "open", { timeout: 3000 }).catch(() => {})
        const got = await p.evaluate(() => ({
          open: !!document.querySelector("[data-lightbox]"),
          img: document.querySelector("[data-lightbox] [data-lightbox-image]")?.getAttribute("src") ?? null,
          clip: document.querySelector("[data-lightbox] [data-lightbox-clip]")?.getAttribute("src") ?? null,
          href: location.href,
        }))
        return got
      }
      const sketch = await viewer('[data-post] a[href$="sketch.png"]', "picture link")
      expect(sketch.open && /sketch\.png/.test(decodeURIComponent(sketch.img ?? "")), "a supabase picture linked in the words opens the viewer", sketch)
      await sleep(350)
      await shot(p, `${label}-viewer-link`)
      await p.keyboard.press("Escape")
      await sleep(350)
      const clip = await viewer('[data-post] a[href$="walkthrough.mp4"]', "video link")
      expect(clip.open && /walkthrough\.mp4$/.test(clip.clip ?? ""), "a video file linked in the words plays in the viewer", clip)
      await p.keyboard.press("Escape")
      await sleep(350)
      const comment = await viewer('[data-comment] a[href$="mine.jpg"]', "comment link")
      expect(comment.open && /mine\.jpg/.test(decodeURIComponent(comment.img ?? "")), "a picture linked in a comment opens it too", comment)
      await p.keyboard.press("Escape")
      await sleep(350)
      const file = await viewer("[data-post-file-open]", "picture file")
      expect(file.open && /\/posts\/m-links\/files\/22222222-0000-4000-8000-000000000002$/.test(file.img ?? ""), "a picture file opens the viewer, from the member route as it is", file)
      await sleep(350)
      await shot(p, `${label}-viewer-file`)
      await p.keyboard.press("Escape")
      await sleep(350)
      const pdf = await p.evaluate(() => {
        const a = [...document.querySelectorAll("[data-post-file]")].find((x) => /Notes\.pdf/.test(x.textContent))
        return a ? { tag: a.tagName, download: a.getAttribute("download") } : null
      })
      expect(pdf?.tag === "A" && pdf.download === "Notes.pdf", "a PDF is still a download", pdf)
      browser.off("targetcreated", onTarget)
      const after = await p.evaluate(() => location.href)
      expect(tabs === 0 && navs.length === 0 && after === before, "no new tab, no page load, the address is where it was", { tabs, navs, before, after })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── ROUND 8: RAPID LIKES, SAVES AND COMMENTS AT 4x CPU ───────── */
    if (want("taps")) {
      const { p, errors, live } = await open("feed", "/community/studio-notes", vp, { likeBase: 24, wait: 300 })
      const cdp = await p.target().createCDPSession()
      /*
        Watches one button through a burst: every value its count and its
        pressed state take (so a flicker to any third value shows), whether
        it was ever turned off, and for each press the time from the press
        to the frame that shows it.
      */
      const watch = (sel, countSel) =>
        p.evaluate((sel, countSel) => {
          const w = { values: [], disabled: 0, presses: [], drawn: [] }
          window.__watch = w
          const el = () => document.querySelector(sel)
          const read = () => {
            const b = el()
            if (!b) return
            if (b.disabled) w.disabled++
            const v = `${b.getAttribute("aria-pressed")}|${countSel ? b.querySelector(countSel)?.textContent : ""}`
            if (w.values.at(-1) !== v) w.values.push(v)
          }
          read()
          w.mo = new MutationObserver(read)
          w.mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
          /* From the click (the press is complete) to the first frame that shows it. */
          document.addEventListener(
            "click",
            (e) => {
              if (!e.target.closest(sel)) return
              const t = performance.now()
              const was = el()?.getAttribute("aria-pressed")
              w.presses.push(t)
              /* The next frame's callback runs before that frame is painted: the state must be there by then. */
              requestAnimationFrame((at) => w.drawn.push({ ms: at - t, shown: el()?.getAttribute("aria-pressed") !== was }))
            },
            true,
          )
        }, sel, countSel)
      const burst = async (sel, n, gap) => {
        for (let i = 0; i < n; i++) {
          if (phone) await p.tap(sel)
          else await p.click(sel)
          await sleep(gap)
        }
      }
      const report = () =>
        p.evaluate(() => {
          const w = window.__watch
          return { values: w.values, disabled: w.disabled, presses: w.presses.length, span: Math.round(w.presses.at(-1) - w.presses[0]), drawn: w.drawn.filter((d) => d.shown).length, drawnMax: Math.round(Math.max(0, ...w.drawn.map((d) => d.ms))) }
        })
      /* Requests for one toggle: one at a time, each asking for the other state than the one before, the last for the final state. */
      const sane = (reqs, final) => reqs.length >= 1 && reqs.every(([, on], i) => i === 0 || on !== reqs[i - 1][1]) && reqs.at(-1)[1] === final

      /* Seven likes on a card, 40ms apart: ends liked. */
      const LIKE = '[data-post="p-text"] [data-like]'
      await watch(LIKE, "[data-like-count]")
      if (process.env.PROFILE)
        await p.evaluate(() => {
          window.__lt = []
          new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask" })
          window.__clk = []
          let t0 = 0
          window.addEventListener("click", () => (t0 = performance.now()), true)
          window.addEventListener("click", () => window.__clk.push(Math.round(performance.now() - t0)), false)
          for (const ev of ["pointerdown", "pointerup", "mousedown", "mouseup", "pointermove", "mousemove", "pointerover"]) {
            let s0 = 0
            window.addEventListener(ev, () => (s0 = performance.now()), true)
            window.addEventListener(ev, () => (window["__" + ev] ||= []).push(Math.round(performance.now() - s0)), false)
          }
        })
      if (process.env.TRACE) await p.tracing.start({ path: join(shots, "taps-trace.json"), categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
      if (process.env.PROFILE) {
        await cdp.send("Profiler.enable")
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
        await cdp.send("Profiler.start")
      }
      const likes = await frames(
        p,
        cdp,
        () => burst(LIKE, 7, 40),
        () => !document.querySelector("[data-like][disabled]") && true,
        900,
        null,
        900,
      )
      await sleep(900)
      if (process.env.TRACE) {
        await p.tracing.stop()
        const ev = JSON.parse(readFileSync(join(shots, "taps-trace.json"), "utf8")).traceEvents
        const sum = new Map()
        for (const e of ev) if (e.ph === "X" && e.dur) sum.set(e.name, (sum.get(e.name) || [0, 0, 0]).map((v, i) => (i === 0 ? v + e.dur : i === 1 ? v + 1 : Math.max(v, e.dur))))
        console.log("TRACE", JSON.stringify([...sum].sort((a, b) => b[1][0] - a[1][0]).slice(0, 18).map(([k, [t, n, m]]) => [k, Math.round(t / 1000), n, Math.round(m / 1000)])))
      }
      if (process.env.PROFILE) {
        const { profile } = await cdp.send("Profiler.stop")
        const self = new Map()
        const dt = profile.timeDeltas
        const byId = new Map(profile.nodes.map((n) => [n.id, n]))
        profile.samples.forEach((id, i) => {
          const n = byId.get(id)
          const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
          self.set(k, (self.get(k) || 0) + (dt[i] || 0))
        })
        console.log("SELF", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1000)])))
      }
      if (process.env.PROFILE) console.log("PROFILE", JSON.stringify(await p.evaluate(() => ({ lt: window.__lt, clk: window.__clk, pd: window.__pointerdown, pu: window.__pointerup, md: window.__mousedown, mu: window.__mouseup, mm: window.__mousemove, po: window.__pointerover }))))
      const lr = await report()
      const final = await p.$eval(LIKE, (b) => `${b.getAttribute("aria-pressed")}|${b.querySelector("[data-like-count]").textContent}`)
      expect(lr.presses === 7 && lr.drawn === 7, "LIKES at 4x CPU: each of seven presses is on screen in the very next frame", { presses: lr.presses, drawn: lr.drawn, slowestFrameAfterPress: lr.drawnMax })
      expect(lr.disabled === 0, "the like button is never turned off while asking", lr.disabled)
      expect(lr.values.every((v) => v === "false|24" || v === "true|25"), "the count only ever shows 24 or 25 (no flicker to any other)", lr.values)
      expect(final === "true|25", "the last press wins: liked, 25", final)
      const likeReqs = live.sent.filter(([k]) => k === "like:p-text")
      expect(live.max["like:p-text"] === 1 && likeReqs.length < 7 && sane(likeReqs, true), "one request on its way at a time, fewer requests than presses, each a change, the last asking for on", { requests: likeReqs.map(([, on]) => on), maxAtOnce: live.max["like:p-text"], burstMs: lr.span })
      /* Two more bursts for the frames alone, so one noisy frame on a shared machine does not decide it: the middle of three is judged. */
      const likeRuns = [likes]
      for (let i = 0; i < 2; i++) {
        await sleep(400)
        likeRuns.push(await frames(p, cdp, () => burst(LIKE, 7, 40), () => true, 900, null, 900))
      }
      const likeMid = [...likeRuns].sort((x, y) => x.max - y.max)[1]
      expect(likeMid.max <= 50, "and the page keeps drawing frames through it: no frame over 50ms at 4x CPU (middle of three bursts)", likeRuns.map((r) => ({ max: r.max, long: r.long })))
      await sleep(900)

      /* Open the post; six saves there end where they started: not saved, and nothing said. */
      await p.click('[data-post="p-text"] [data-post-excerpt]')
      await p.waitForFunction(() => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", { timeout: 3000 }).catch(() => {})
      await sleep(500)
      const SAVE = "[data-post-overlay] [data-save]"
      await watch(SAVE, null)
      if (process.env.TRACE) await p.tracing.start({ path: join(shots, "saves-trace.json"), categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.invalidationTracking"] })
      const saves = await frames(p, cdp, () => burst(SAVE, 6, 35), () => true, 900, null, 900)
      if (process.env.TRACE) await p.tracing.stop()
      await sleep(900)
      const sr = await report()
      const saved = await p.evaluate(() => ({ overlay: document.querySelector("[data-post-overlay] [data-save]")?.getAttribute("aria-pressed"), toast: document.querySelector("[data-community-toast]")?.textContent ?? null }))
      expect(sr.presses === 6 && sr.drawn === 6 && sr.disabled === 0, "SAVES: each of six presses on screen in the very next frame, never turned off", { presses: sr.presses, drawn: sr.drawn, slowestFrameAfterPress: sr.drawnMax, disabled: sr.disabled })
      const saveReqs = live.sent.filter(([k]) => k === "save:p-text")
      expect(saved.overlay === "false" && live.max["save:p-text"] <= 1 && sane(saveReqs, false), "an even number of saves ends unsaved, one request at a time, the last asking for off", { saved, requests: saveReqs.map(([, on]) => on) })
      expect(!saved.toast, "and no toast: the button says Saved itself", saved.toast)
      const saveRuns = [saves]
      for (let i = 0; i < 2; i++) {
        await sleep(400)
        saveRuns.push(await frames(p, cdp, () => burst(SAVE, 6, 35), () => true, 900, null, 900))
      }
      const saveMid = [...saveRuns].sort((x, y) => x.max - y.max)[1]
      expect(saveMid.max <= 50, "frames through the saves: none over 50ms at 4x CPU (middle of three bursts)", saveRuns.map((r) => ({ max: r.max, long: r.long })))
      await sleep(900)

      /* Like in the opened post, then the card under it agrees. */
      await p.click("[data-post-overlay] [data-like]")
      await sleep(700)
      /* The card comes first in the page; the opened post is drawn at the end of it. */
      const both = await p.evaluate(() => [document.querySelector("[data-post-overlay] [data-like]")?.getAttribute("aria-pressed"), document.querySelector('[data-post="p-text"] [data-like]')?.getAttribute("aria-pressed")])
      expect(both[0] === "false" && both[1] === "false", "an unlike in the opened post shows on the card under it", both)

      /* Three comments sent fast: each drawn at once, the box empty again, then confirmed in order. */
      await p.waitForSelector("[data-post-overlay] [data-comment-box=comment] textarea", { timeout: 4000 })
      const countBefore = await p.evaluate(() => Number(document.querySelector('[data-post="p-text"] [data-comment-button]')?.textContent.trim() || 0))
      const instant = []
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      for (const words of ["First thought", "Second thought", "Third thought"]) {
        await p.click("[data-post-overlay] [data-comment-box=comment] textarea")
        await p.keyboard.type(words)
        const t = await p.evaluate((words) => {
          const box = document.querySelector("[data-post-overlay] [data-comment-box=comment]")
          const btn = box.querySelector("[data-comment-send]")
          return new Promise((done) => {
            const t0 = performance.now()
            btn.click()
            requestAnimationFrame(() =>
              done({
                ms: Math.round(performance.now() - t0),
                shown: [...document.querySelectorAll("[data-post-overlay] [data-comment-sending]")].some((c) => c.textContent.includes(words)),
                box: box.querySelector("textarea").value,
              }),
            )
          })
        }, words)
        instant.push(t)
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      expect(instant.every((x) => x.shown && x.box === ""), "COMMENTS: each is on screen in the very next frame in its sending state, and the box is empty and ready again", instant)
      await shot(p, `${label}-comments-sending`)
      await sleep(900)
      const confirmed = await p.evaluate(() => ({
        sending: document.querySelectorAll("[data-post-overlay] [data-comment-sending]").length,
        ids: [...document.querySelectorAll("[data-post-overlay] [data-comment]")].map((c) => c.getAttribute("data-comment")),
        words: [...document.querySelectorAll("[data-post-overlay] [data-comment]")].map((c) => c.textContent.match(/(First|Second|Third) thought/)?.[1]).filter(Boolean),
        count: Number(document.querySelector('[data-post="p-text"] [data-comment-button]')?.textContent.trim() || 0),
      }))
      expect(confirmed.sending === 0 && confirmed.ids.every((id) => id.startsWith("c-new-")) && confirmed.words.join() === "First,Second,Third", "then each is the server's copy, in the order sent", confirmed)
      expect(confirmed.count === countBefore + 3, "and the card's count moved by three", { before: countBefore, after: confirmed.count })
      /* A refused one comes out, its words back in the box, the reason said. */
      await p.click("[data-post-overlay] [data-comment-box=comment] textarea")
      await p.keyboard.type("please refuse this")
      await p.click("[data-post-overlay] [data-comment-send]")
      const mid = await p.evaluate(() => document.querySelectorAll("[data-post-overlay] [data-comment-sending]").length)
      await sleep(800)
      const refused = await p.evaluate(() => ({
        sending: document.querySelectorAll("[data-post-overlay] [data-comment-sending]").length,
        box: document.querySelector("[data-post-overlay] [data-comment-box=comment] textarea").value,
        toast: document.querySelector("[data-community-toast]")?.textContent ?? null,
        count: Number(document.querySelector('[data-post="p-text"] [data-comment-button]')?.textContent.trim() || 0),
      }))
      expect(mid === 1 && refused.sending === 0 && refused.box === "please refuse this" && /muted/i.test(refused.toast ?? "") && refused.count === countBefore + 3, "a refused comment is taken out, its words back in the box, the reason said, the count put back", { mid, ...refused })
      const router = await p.evaluate(() => (window.__router ?? []).filter(([k]) => k === "refresh").length)
      expect(router === 0, "no router refresh anywhere in it", router)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* A like the server refuses goes back to where it was, with the reason. */
    if (want("taps")) {
      const { p, live } = await open("feed", "/community/studio-notes", vp, { likeBase: 24, wait: 200, refuse: ["like:p-text"] })
      await (phone ? p.tap('[data-post="p-text"] [data-like]') : p.click('[data-post="p-text"] [data-like]'))
      const mid = await p.$eval('[data-post="p-text"] [data-like]', (b) => b.getAttribute("aria-pressed"))
      await sleep(600)
      const back = await p.evaluate(() => {
        const b = document.querySelector('[data-post="p-text"] [data-like]')
        return { pressed: b.getAttribute("aria-pressed"), count: b.querySelector("[data-like-count]").textContent, toast: document.querySelector("[data-community-toast]")?.textContent ?? null }
      })
      expect(mid === "true" && back.pressed === "false" && back.count === "24" && /muted/i.test(back.toast ?? "") && live.sent.length === 1, "a refused like is put back with the reason", { mid, ...back })
      await p.close()
    }

    /* ══ ROUND 9 ═════════════════════════════════════════════════════ */

    /* ── ROWS: a phone's feed is full width rows, a computer's cards are as they were ── */
    if (want("rows")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const rows = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect()
        const posts = [...document.querySelectorAll("[data-feed-list] > [data-post]")]
        const comp = document.querySelector('[data-composer="closed"]')
        const st = (e) => getComputedStyle(e)
        const card = (e) => {
          const b = r(e)
          const s = st(e)
          return { x: Math.round(b.left), w: Math.round(b.width), top: Math.round(b.top), bottom: Math.round(b.bottom), radius: s.borderTopLeftRadius, sides: [s.borderLeftWidth, s.borderRightWidth, s.borderTopWidth, s.borderBottomWidth].join(" "), band: s.borderBottomColor }
        }
        const media = (id) => {
          const el = document.querySelector(`[data-post="${id}"] [data-card-media]`)
          const ex = document.querySelector(`[data-post="${id}"] [data-post-excerpt]`)
          const thumb = document.querySelector(`[data-post="${id}"] [data-post-thumb]`)
          if (!el) return { shown: false, thumb: thumb ? st(thumb).display : null }
          const b = r(el)
          return { shown: st(el).display !== "none", kind: el.getAttribute("data-card-media"), x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), belowWords: ex ? b.top >= r(ex).bottom - 1 : null, radius: st(el).borderTopLeftRadius, lazy: [...el.querySelectorAll("img")].every((i) => i.loading === "lazy"), thumb: thumb ? st(thumb).display : null }
        }
        return { posts: posts.map(card), composer: comp ? card(comp) : null, intro: media("p-intro"), video: media("p-video"), link: media("p-link"), text: media("p-text"), vw: innerWidth }
      })
      if (phone) {
        const all = rows.posts
        expect(all.length >= 4 && all.every((c) => c.x === 0 && c.w === 390), "ROWS: every post is the phone's full width, no side margin", all.map((c) => [c.x, c.w]))
        expect(all.every((c) => c.radius === "0px" && c.sides === "0px 0px 0px 8px"), "no card edge or rounding, only an 8px band under each", all.map((c) => [c.radius, c.sides]))
        expect(all.every((c) => c.band === "rgb(241, 242, 244)"), "the band is #f1f2f4", all.map((c) => c.band))
        expect(all.slice(1).every((c, i) => c.top === all[i].bottom), "the band is all there is between two posts (no gap)", all.map((c) => [c.top, c.bottom]))
        expect(rows.composer && rows.composer.x === 0 && rows.composer.w === 390 && rows.composer.bottom === all[0].top, "the composer above is a row the same way", rows.composer)
        expect(rows.intro.shown && rows.intro.kind === "pair" && rows.intro.x === 16 && rows.intro.w === 358 && rows.intro.belowWords && rows.intro.radius === "12px" && rows.intro.lazy, "MEDIA under the words, the row's width inside its 16px padding, rounded 12px, lazy (two side by side)", rows.intro)
        expect(rows.video.shown && rows.video.kind === "single" && Math.abs(rows.video.h - (rows.video.w * 9) / 16) <= 1.5, "one video by address: a 16:9 box", rows.video)
        expect(rows.link.shown && rows.text.shown === false, "a link's picture shows, a post with only words has nothing", { link: rows.link.shown, text: rows.text.shown })
        expect(rows.intro.thumb === "none" && rows.video.thumb === "none", "and no thumbnail on the right on a phone", [rows.intro.thumb, rows.video.thumb])
        const small = await smallTargets(p, "[data-feed-list]")
        expect(small.length === 0, "every control in a row is at least 40px tall", small.slice(0, 6))
      } else {
        expect(rows.posts.every((c) => c.radius === "16px" && c.sides === "1px 1px 1px 1px" && c.x > 300 && c.w < 760), "ROWS on a computer: the cards are as they were (1px edge, 16px rounding, in the column)", rows.posts.map((c) => [c.x, c.w, c.radius, c.sides]))
        expect(rows.posts.slice(1).every((c, i) => c.top - rows.posts[i].bottom === 12), "with the 12px gap between them", rows.posts.map((c) => c.top))
        expect(!rows.intro.shown && rows.intro.thumb === "block", "and the thumbnail on the right, nothing under the words", rows.intro)
      }
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      await shot(p, `${label}-r9-feed`)
      await shot(p, `${label}-r9-feed-full`, true)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* A finger on a phone, as a phone sends it: a move every 16ms, held still before lifting when asked. */
    const touchDrag = async (p, cdp, from, to, { steps = 8, stepMs = 16, holdMs = 0, onStep = null } = {}) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] })
      const seen = []
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps
        const y = from.y + ((to.y - from.y) * i) / steps
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
        if (onStep) seen.push(await onStep({ x: x - from.x, y: y - from.y }))
        /* A flick lets go right after its last move; a finger that pauses says so with holdMs. */
        else if (i < steps) await sleep(stepMs)
      }
      if (holdMs) await sleep(holdMs)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      return seen
    }
    /* The next two frames have been drawn. */
    const twoFrames = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    /* Frame stamps while something runs: the longest gap, and how many went over two frames. */
    const startFrames = (p) =>
      p.evaluate(() => {
        window.__fs = []
        const loop = (t) => {
          window.__fs.push(t)
          window.__fr = requestAnimationFrame(loop)
        }
        window.__fr = requestAnimationFrame(loop)
      })
    const stopFrames = (p) =>
      p.evaluate(() => {
        cancelAnimationFrame(window.__fr)
        const st = window.__fs.slice(1)
        const gaps = st.slice(1).map((t, i) => t - st[i])
        return { frames: st.length, max: Math.round(Math.max(0, ...gaps)), over34: gaps.filter((g) => g > 34).length }
      })

    /* ── SHEET: a phone's post is the app's draggable sheet ───────── */
    if (want("sheet") && phone) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const panelY = () => p.evaluate(() => {
        const el = document.querySelector("[data-post-overlay=phone]")?.closest("[data-sheet-panel]")
        if (!el) return null
        /* How far below its resting place it is drawn: its bottom edge rests on the window's. */
        return Math.round((el.getBoundingClientRect().bottom - innerHeight) * 10) / 10
      })
      const openIt = async () => {
        await p.tap('[data-post="p-text"] [data-post-excerpt]')
        await p.waitForFunction(() => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", { timeout: 4000 }).catch(() => {})
        await sleep(250)
      }
      await openIt()
      const look = await p.evaluate(() => {
        const panel = document.querySelector("[data-post-overlay=phone]").closest("[data-sheet-panel]")
        const r = panel.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), radius: getComputedStyle(panel).borderTopLeftRadius, title: !!panel.querySelector("[data-post] h1"), handle: !!panel.querySelector("[data-sheet-handle]") }
      })
      expect(look.top >= 12 && look.top <= 24 && look.bottom === 844 && look.title && look.handle, "SHEET: the post opens as the app's sheet, a little short of the top, its grab bar on it", look)
      await shot(p, `${label}-r9-sheet`)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })

      /* It follows the finger, from the post's own top (nothing scrolled), each frame. */
      const head = await p.evaluate(() => {
        const r = document.querySelector("[data-post-overlay=phone] [data-post] h1").getBoundingClientRect()
        return { x: Math.round(r.left + 40), y: Math.round(r.top + 8) }
      })
      await startFrames(p)
      const follow = await touchDrag(p, cdp, head, { x: head.x, y: head.y + 160 }, { steps: 8, holdMs: 140, onStep: async (d) => (await twoFrames(p), { finger: Math.round(d.y), sheet: await panelY() }) })
      await sleep(700)
      const followFrames = await stopFrames(p)
      const back = await panelY()
      const stillOpen = await p.evaluate(() => !!document.querySelector("[data-post-overlay=phone]") && location.pathname.endsWith("/post/p-text"))
      expect(follow.every((f) => f.sheet !== null && Math.abs(f.sheet - f.finger) <= 1), "at 4x CPU the sheet is under the finger at every step (finger and sheet, px)", follow.map((f) => [f.finger, f.sheet]))
      expect(back === 0 && stillOpen, "a 160px pull held still before lifting springs back and stays open", { back, stillOpen })
      expect(followFrames.over34 === 0, "no frame over two frames' time while it follows and springs back", followFrames)

      /* A pull up gives on a rubber band, less than the finger. */
      const up = await touchDrag(p, cdp, head, { x: head.x, y: head.y - 120 }, { steps: 6, holdMs: 140, onStep: async (d) => (await twoFrames(p), { finger: Math.round(d.y), sheet: await panelY() }) })
      await sleep(600)
      const last = up.at(-1)
      expect(last.sheet < 0 && last.sheet > last.finger / 2 && (await panelY()) === 0, "a pull up gives on a rubber band (less than the finger) and comes back", up.map((f) => [f.finger, f.sheet]))

      /* A short flick down closes it: the speed, not only the distance. */
      await startFrames(p)
      await touchDrag(p, cdp, head, { x: head.x, y: head.y + 140 }, { steps: 5, stepMs: 12 })
      await p.waitForFunction(() => !document.querySelector("[data-post-overlay]"), { timeout: 4000 }).catch(() => {})
      await sleep(200)
      const flickFrames = await stopFrames(p)
      const gone = await p.evaluate(() => ({ overlay: !!document.querySelector("[data-post-overlay]"), path: location.pathname }))
      expect(!gone.overlay && gone.path === "/community/studio-notes", "a 140px flick closes it, and the address goes back", gone)
      expect(flickFrames.over34 === 0, "no frame over two frames' time while it leaves", flickFrames)

      /* From the grab bar, a slow pull past half way closes it too. */
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await openIt()
      const bar = await p.evaluate(() => {
        const r = document.querySelector("[data-post-overlay-bar]").getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await touchDrag(p, cdp, bar, { x: bar.x, y: bar.y + 520 }, { steps: 20, holdMs: 140 })
      await p.waitForFunction(() => !document.querySelector("[data-post-overlay]"), { timeout: 4000 }).catch(() => {})
      expect(!(await p.$("[data-post-overlay]")), "a slow pull from the bar past half way closes it")
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      /* And the close button. */
      await openIt()
      await p.tap("[data-post-overlay-close]")
      await p.waitForFunction(() => !document.querySelector("[data-post-overlay]"), { timeout: 4000 }).catch(() => {})
      expect(!(await p.$("[data-post-overlay]")) && (await p.evaluate(() => location.pathname)) === "/community/studio-notes", "the close button closes it and the address goes back")
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── MODAL: a computer's panel, frame by frame; comments fill the room kept for them ── */
    if (want("modal")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp, { commentsWait: 450 })
      const cdp = await p.target().createCDPSession()
      const watchPanel = () =>
        p.evaluate(() => {
          window.__pf = []
          const loop = () => {
            const panel = document.querySelector("[data-post-overlay=panel]")
            const sheet = document.querySelector("[data-post-overlay=phone]")?.closest("[data-sheet-panel]")
            const el = panel || sheet
            const sec = document.querySelector("[data-post-overlay] [data-comments], [data-post-overlay-scroll] [data-comments]") || document.querySelector("[data-comments]")
            const title = document.querySelector("[data-post-overlay-post] h1, [data-post-overlay] [data-post] h1")
            if (el) {
              const s = getComputedStyle(el)
              /* The panel's offset is its own translate; the sheet's is how far its bottom edge is below the window's. */
              const y = panel ? (s.translate === "none" ? 0 : parseFloat(s.translate.split(" ")[1] ?? "0") || 0) : el.getBoundingClientRect().bottom - innerHeight
              window.__pf.push({ t: performance.now(), o: Number(s.opacity), y, h: Math.round(el.getBoundingClientRect().height), secH: sec ? Math.round(sec.getBoundingClientRect().height) : null, titleY: title ? Math.round(title.getBoundingClientRect().top - el.getBoundingClientRect().top) : null, rows: document.querySelectorAll("[data-comments-rows] > li").length })
            }
            window.__pfr = requestAnimationFrame(loop)
          }
          window.__pfr = requestAnimationFrame(loop)
        })
      const readPanel = () => p.evaluate(() => (cancelAnimationFrame(window.__pfr), window.__pf))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await watchPanel()
      if (phone) await p.tap('[data-post="p-video"] [data-post-excerpt]')
      else await p.click('[data-post="p-video"] [data-post-excerpt]')
      await p.waitForFunction(() => document.querySelectorAll("[data-comments-rows] > li").length === 4, { timeout: 6000 }).catch(() => {})
      await sleep(500)
      const opening = await readPanel()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const first = opening[0]
      const moving = opening.filter((f) => (phone ? f.y > 0.5 : f.o < 0.999))
      if (!phone) {
        expect(first && first.o < 0.6 && first.y > 4, "MODAL: the first frame painted is already the start of the move (no waiting frame)", first)
        expect(moving.every((f, i) => i === 0 || (f.o >= moving[i - 1].o - 0.001 && f.y <= moving[i - 1].y + 0.01)), "it only ever moves toward open: opacity up, offset down, frame after frame", moving.map((f) => [Math.round(f.o * 100) / 100, Math.round(f.y * 10) / 10]))
      } else {
        expect(moving.every((f, i) => i === 0 || f.y <= moving[i - 1].y + 0.01), "the sheet only ever moves up while it opens", moving.map((f) => Math.round(f.y)))
      }
      /* The move's own frames: from the first one painted to the one where it arrives. What follows it (the comments drawn) is not the move. */
      const lastMove = opening.indexOf(moving.at(-1))
      const gaps = opening.slice(1, lastMove + 2).map((f, i) => f.t - opening[i].t)
      /* A computer's panel here; a phone's sheet is the app's own, measured over three opens in OPENING and through its drags in SHEET. */
      if (!phone) expect(Math.max(0, ...gaps) <= 34, "and draws every frame of it at 4x CPU (no gap over two frames)", gaps.map(Math.round))
      /* The room for four comments was kept; when they arrive nothing above them moves and the panel hardly grows. */
      const before = opening.find((f) => f.rows === 0 && f.secH !== null && (phone ? f.y < 0.5 : f.o > 0.999))
      const after = opening.at(-1)
      const titleMoves = new Set(opening.filter((f) => (phone ? f.y < 0.5 : f.o > 0.999)).map((f) => f.titleY))
      expect(after.rows === 4 && titleMoves.size === 1, "the comments arrive (4 rows) and the post above them never moves", { rows: after.rows, titleY: [...titleMoves] })
      expect(before && Math.abs(after.secH - before.secH) <= 40, "they fill the room kept for them: the comments area changes by at most 40px", { kept: before?.secH, filled: after.secH })
      const faded = await p.evaluate(() => getComputedStyle(document.querySelector("[data-comments-rows]")).animationName)
      expect(faded !== "none", "and fade in rather than appear", faded)
      await shot(p, `${label}-r9-post-comments`)
      if (!phone) {
        /* Closing, frame by frame. */
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        await watchPanel()
        if (process.env.PROF) {
          await cdp.send("Profiler.enable")
          await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
          await cdp.send("Profiler.start")
        }
        await p.keyboard.press("Escape")
        await p.waitForFunction(() => !document.querySelector("[data-post-overlay]"), { timeout: 3000 }).catch(() => {})
        const closing = await readPanel()
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        if (process.env.PROF) {
          const { profile } = await cdp.send("Profiler.stop")
          const self = new Map()
          const byId = new Map(profile.nodes.map((n) => [n.id, n]))
          profile.samples.forEach((id, i) => {
            const n = byId.get(id)
            const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
            self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0))
          })
          console.log("SELF", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1000)])))
        }
        const out = closing.filter((f) => f.o < 0.999)
        /* Every frame while it can still be seen (the last, at no opacity, is the one that takes it away). */
        const seenTill = closing.findIndex((f) => f.o < 0.02)
        const began = Math.max(0, closing.findIndex((f) => f.o < 0.999) - 1)
        const cg = closing.slice(began + 1, seenTill < 0 ? undefined : seenTill + 1).map((f, i) => f.t - closing[began + i].t)
        expect(out.length >= 3 && out.every((f, i) => i === 0 || f.o <= out[i - 1].o + 0.001), "closing fades out frame after frame, never back up", closing.map((f) => Math.round(f.o * 100) / 100))
        expect(Math.max(0, ...cg) <= 34, "with every frame drawn at 4x CPU while it can be seen", cg.map(Math.round))
      }
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── RESTORE: back from a post, the feed is exactly where it was ── */
    if (want("restore")) {
      const { p, errors, live, calls } = await open("long", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const where = async () => p.evaluate(() => ({ y: Math.round(scrollY), path: location.pathname, waiting: !!document.querySelector("[data-feed-waiting], [data-comments-loading] ~ [data-feed-list]"), posts: document.querySelectorAll("[data-feed-list] > [data-post]").length }))
      const target = await p.evaluate(() => {
        const el = document.querySelector('[data-post="p-gif-1"] [data-post-excerpt]')
        window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 300)
        return true
      })
      await sleep(300)
      const start = await where()
      const reads = () => calls.filter((c) => /\/posts\?/.test(c.url)).length
      const readsBefore = reads()
      const ways = phone ? ["swipe", "back", "button"] : ["escape", "back", "scrim"]
      const results = []
      for (const way of ways) {
        const tgt = '[data-post="p-gif-1"] [data-post-excerpt]'
        if (phone) await p.tap(tgt)
        else await p.click(tgt)
        await p.waitForFunction(() => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", { timeout: 4000 }).catch(() => {})
        await sleep(300)
        const mid = await where()
        if (way === "escape") await p.keyboard.press("Escape")
        else if (way === "back") await p.evaluate(() => history.back())
        else if (way === "scrim") await p.mouse.click(60, 600)
        else if (way === "button") await p.tap("[data-post-overlay-close]")
        else if (way === "swipe") {
          const bar = await p.evaluate(() => {
            const r = document.querySelector("[data-post-overlay-bar]").getBoundingClientRect()
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
          })
          await touchDrag(p, cdp, bar, { x: bar.x, y: bar.y + 160 }, { steps: 5, stepMs: 12 })
        }
        /* Watch every frame of the way back for the feed moving or a waiting state. */
        const frames = await p.evaluate(
          () =>
            new Promise((done) => {
              const out = []
              const t0 = performance.now()
              const loop = () => {
                out.push({ y: Math.round(scrollY), waiting: !!document.querySelector("[data-feed-waiting]"), overlay: !!document.querySelector("[data-post-overlay]") })
                if (performance.now() - t0 < 900) requestAnimationFrame(loop)
                else done(out)
              }
              requestAnimationFrame(loop)
            }),
        )
        const end = await where()
        results.push({ way, mid: mid.y, end: end.y, path: end.path, ys: [...new Set(frames.map((f) => f.y))], waiting: frames.some((f) => f.waiting), closed: !frames.at(-1).overlay })
      }
      expect(results.every((r) => r.closed && r.path === "/community/studio-notes"), `RESTORE: ${ways.join(", ")} each close the post and the address goes back`, results.map((r) => [r.way, r.closed, r.path]))
      expect(results.every((r) => r.mid === start.y && r.end === start.y && r.ys.length === 1 && r.ys[0] === start.y), "the feed is at exactly the same scroll while open, on the way back and after, every frame", { start: start.y, results: results.map((r) => [r.way, r.mid, r.end, r.ys]) })
      expect(results.every((r) => !r.waiting) && reads() === readsBefore, "nothing in the feed is read again or waits (no skeleton, no refetch)", { waiting: results.map((r) => r.waiting), feedReads: reads() - readsBefore })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── MOTION: the composer opens and closes on the compositor ──── */
    if (want("motion")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const runs = []
      for (let i = 0; i < 3; i++) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        await p.evaluate((phone) => {
          window.__cf = []
          const loop = () => {
            const sheet = document.querySelector("[data-composer=sheet]")
            const ed = document.querySelector("[data-composer=open]")
            const next = ed?.nextElementSibling
            const ty = (e) => {
              if (!e) return null
              const t = getComputedStyle(e).translate
              return t === "none" ? 0 : parseFloat(t.split(" ")[1] ?? "0") || 0
            }
            /* Style reads (and the editor screen's own box, which nothing lays out again while it slides), so the measuring does not slow what it measures. */
            window.__cf.push({ t: performance.now(), sheetY: sheet ? Math.round(sheet.getBoundingClientRect().top) : null, op: ed ? Number(getComputedStyle(ed).opacity) : null, nextTop: next ? Math.round(ty(next)) : null, edH: ed ? 1 : null })
            window.__cfr = requestAnimationFrame(loop)
          }
          window.__cfr = requestAnimationFrame(loop)
        }, phone)
        const t0 = await p.evaluate(() => performance.now())
        if (process.env.PROF && i === 1) {
          await cdp.send("Profiler.enable")
          await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
          await cdp.send("Profiler.start")
          await p.tracing.start({ path: join(shots, "motion-trace.json"), categories: ["devtools.timeline"] })
        }
        await (phone ? p.tap("[data-composer-open]") : p.click("[data-composer-open]"))
        await sleep(900)
        if (process.env.PROF && i === 1) {
          await p.tracing.stop()
          const ev = JSON.parse(readFileSync(join(shots, "motion-trace.json"), "utf8")).traceEvents
          const sum = new Map()
          for (const e of ev) if (e.ph === "X" && e.dur) sum.set(e.name, (sum.get(e.name) || [0, 0, 0]).map((v, k) => (k === 0 ? v + e.dur : k === 1 ? v + 1 : Math.max(v, e.dur))))
          console.log("TRACE", JSON.stringify([...sum].sort((a, b) => b[1][0] - a[1][0]).slice(0, 14).map(([k, [t, n, m]]) => [k, Math.round(t / 1000), n, Math.round(m / 1000)])))
          const t0e = ev.find((e) => e.name === "EventDispatch")?.ts ?? 0
          console.log("LONG", JSON.stringify(ev.filter((e) => e.ph === "X" && e.dur > 12000 && /^(FunctionCall|FireAnimationFrame|TimerFire|EventDispatch|UpdateLayoutTree|Layout|Paint|RunTask|v8.callFunction)$/.test(e.name)).map((e) => [e.name, Math.round((e.ts - t0e) / 1000), Math.round(e.dur / 1000), e.args?.data?.functionName || e.args?.data?.type || e.args?.data?.url?.slice(-20) || ""])))
          const { profile } = await cdp.send("Profiler.stop")
          const self = new Map()
          const byId = new Map(profile.nodes.map((n) => [n.id, n]))
          profile.samples.forEach((id, k) => {
            const n = byId.get(id)
            const key = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
            self.set(key, (self.get(key) || 0) + (profile.timeDeltas[k] || 0))
          })
          console.log("SELF", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [k, Math.round(v / 1000)])))
        }
        const opened = await p.evaluate(() => (cancelAnimationFrame(window.__cfr), window.__cf))
        await p.evaluate(() => {
          window.__cf = []
          const loop = () => {
            const sheet = document.querySelector("[data-composer=sheet]")
            const ed = document.querySelector("[data-composer=open]")
            const closed = document.querySelector("[data-composer=closed]")
            const ty = (e) => {
              if (!e) return null
              const t = getComputedStyle(e).translate
              return t === "none" ? 0 : parseFloat(t.split(" ")[1] ?? "0") || 0
            }
            window.__cf.push({ t: performance.now(), sheetY: sheet ? Math.round(sheet.getBoundingClientRect().top) : null, ed: !!ed, nextTop: Math.round(ty((ed || closed)?.nextElementSibling) ?? 0) })
            window.__cfr = requestAnimationFrame(loop)
          }
          window.__cfr = requestAnimationFrame(loop)
        })
        if (process.env.PROF && i === 1) await p.tracing.start({ path: join(shots, "motion-trace2.json"), categories: ["devtools.timeline"] })
        await (phone ? p.tap("[data-composer-cancel]") : p.click("[data-composer-cancel]"))
        await sleep(800)
        if (process.env.PROF && i === 1) {
          await p.tracing.stop()
          const ev = JSON.parse(readFileSync(join(shots, "motion-trace2.json"), "utf8")).traceEvents
          const t0e = ev.find((e) => e.name === "EventDispatch")?.ts ?? 0
          console.log("LONG-CLOSE", JSON.stringify(ev.filter((e) => e.ph === "X" && e.dur > 12000 && /^(FunctionCall|FireAnimationFrame|TimerFire|EventDispatch|UpdateLayoutTree|Layout|Paint|RunTask|v8.callFunction)$/.test(e.name)).map((e) => [e.name, Math.round((e.ts - t0e) / 1000), Math.round(e.dur / 1000), e.args?.data?.functionName || e.args?.data?.type || e.args?.data?.url?.slice(-20) || ""])))
        }
        const closed = await p.evaluate(() => (cancelAnimationFrame(window.__cfr), window.__cf))
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        const firstSeen = opened.find((f) => (phone ? f.sheetY !== null : f.edH !== null))
        const oi = opened.indexOf(firstSeen)
        /*
          The move's own frames. Open: from the frame after the first one painted (that one draws the
          editor's new content for the first time; its cost is `firstFrame`) until it has arrived. Close:
          from the press until it is out of sight (a phone's screen below the bottom edge, the posts back
          where they rest); what follows (taking it out of the page) is not seen.
        */
        const arrivedAt = opened.findIndex((f, k) => k > oi && (phone ? f.sheetY === 0 : f.op === 1 && f.nextTop === 0))
        const openGaps = opened.slice(oi + 2, arrivedAt + 1).map((f, k) => f.t - opened[oi + 1 + k].t)
        /* From the frame of the press (the last one before the move) to the last one with the editor in sight. */
        const pressAt = Math.max(0, closed.findIndex((f) => (phone ? f.sheetY > 0 : f.nextTop < 0)) - 1)
        const goneAt = closed.findIndex((f) => (phone ? f.sheetY === null || f.sheetY >= 844 : !f.ed))
        const closeGaps = closed.slice(pressAt + 1, phone ? goneAt + 1 : goneAt).map((f, k) => f.t - closed[pressAt + k].t)
        runs.push({ mount: firstSeen ? Math.round(firstSeen.t - t0) : null, firstFrame: Math.round((opened[oi + 1]?.t ?? 0) - (firstSeen?.t ?? 0)), first: firstSeen, openGaps, opened, closed, closeGaps })
        await sleep(300)
      }
      const mid = (k) => [...runs].sort((a, b) => Math.max(0, ...a[k]) - Math.max(0, ...b[k]))[1]
      const o = mid("openGaps")
      const c = mid("closeGaps")
      if (phone) {
        const ys = o.opened.filter((f) => f.sheetY !== null).map((f) => f.sheetY)
        expect(ys[0] > 600 && ys.every((y, i) => i === 0 || y <= ys[i - 1]) && ys.at(-1) === 0, "MOTION: the phone's editor is first painted below the screen and only ever rises, to 0", ys)
        const cys = c.closed.filter((f) => f.sheetY !== null).map((f) => f.sheetY)
        expect(cys.length >= 4 && cys.every((y, i) => i === 0 || y >= cys[i - 1]) && !c.closed.at(-1).sheetY, "closing it only ever goes down, then it is gone", cys)
      } else {
        const fr = o.opened.filter((f) => f.edH !== null)
        const ops = fr.map((f) => Math.round(f.op * 100) / 100)
        const tops = fr.map((f) => f.nextTop)
        expect(ops[0] < 0.5 && ops.every((v, i) => i === 0 || v >= ops[i - 1]) && ops.at(-1) === 1, "MOTION: in place, the editor fades in from its first frame", ops)
        expect(tops.every((t, i) => i === 0 || t >= tops[i - 1]) && tops[0] < -100 && tops.at(-1) === 0, "while the posts under it slide down to make room (their offset from where they rest, rising to 0), never back up", tops)
        const ctops = c.closed.filter((f) => f.ed).map((f) => f.nextTop)
        expect(ctops.at(-1) < -100 && ctops.every((t, i) => i === 0 || t <= ctops[i - 1] + 0.5), "closing, they slide back up over it, never down again", ctops)
      }
      expect(runs.map((r) => r.mount).sort((a, b) => a - b)[1] < 300, "the editor is on screen within 300ms of the press at 4x CPU (middle of three)", runs.map((r) => r.mount))
      expect(Math.max(0, ...o.openGaps) <= 34 && Math.max(0, ...c.closeGaps) <= 34, "every frame of the open and the close is drawn at 4x CPU (no gap over two frames, middle of three)", runs.map((r) => ({ open: Math.round(Math.max(0, ...r.openGaps)), close: Math.round(Math.max(0, ...r.closeGaps)), firstFrame: r.firstFrame, openFrames: r.openGaps.length, closeFrames: r.closeGaps.length })))
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── KEYBOARD: the phone's editor fits what the keyboard leaves ── */
    if (want("keyboard") && phone) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      /* A keyboard, as a phone reports one: the visual viewport shrinks (and Safari may pan it), and it says so with resize and scroll. */
      const keyboard = (h, top = 0) =>
        p.evaluate(
          (h, top) => {
            const vv = window.visualViewport
            Object.defineProperty(vv, "height", { configurable: true, get: () => h })
            Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top })
            vv.dispatchEvent(new Event("resize"))
            vv.dispatchEvent(new Event("scroll"))
          },
          h,
          top,
        )
      const measure = () =>
        p.evaluate(() => {
          const r = (e) => {
            const b = e.getBoundingClientRect()
            return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
          }
          const vis = document.querySelector("[data-composer-visible]")
          const bar = document.querySelector("[data-composer-toolbar]")
          const box = document.querySelector("[data-composer-scroll]")
          const el = document.activeElement
          const hit = document.elementFromPoint(195, 800)
          return { vis: r(vis), bar: r(bar), box: r(box), focused: el?.getAttribute("aria-label") ?? el?.tagName, field: el ? r(el) : null, under: !!hit?.closest("[data-composer=sheet]"), vvh: getComputedStyle(document.documentElement).getPropertyValue("--vv-h") }
        })
      await p.tap("[data-composer-open]")
      await sleep(600)
      await p.tap("[data-composer-title]")
      await p.keyboard.type("A long post")
      await p.tap('[aria-label="Post"]')
      await p.keyboard.type(Array.from({ length: 18 }, (_, i) => `Line ${i + 1} of the words, long enough to wrap.`).join("\n"))
      await sleep(200)
      const flat = await measure()
      /* The keyboard opens: 340px. */
      await keyboard(504)
      await sleep(420)
      const up = await measure()
      await shot(p, `${label}-r9-keyboard`)
      expect(up.vis.top === 0 && up.vis.bottom === 504 && up.bar.bottom === 504, "KEYBOARD: up, the editor is exactly the visible part (0 to 504) and the toolbar sits on the keyboard", { vis: up.vis, bar: up.bar, vvh: up.vvh })
      expect(up.field && up.field.bottom <= up.box.bottom && up.field.top >= up.box.top - 400 && up.focused === "Post", "the field being typed in (its end, where the caret is) is in sight above the toolbar", { field: up.field, box: up.box, focused: up.focused })
      expect(up.under, "and under the keyboard is the editor's own white, not the page (no gap as it comes and goes)", up.under)
      /* Safari pans the page under an open keyboard. */
      await keyboard(504, 120)
      await sleep(420)
      const panned = await measure()
      expect(panned.vis.top === 120 && panned.vis.bottom === 624 && panned.bar.bottom === 624, "panned 120px, the editor moves with what is visible (120 to 624)", panned.vis)
      /* It closes. */
      await keyboard(844, 0)
      await sleep(420)
      const down = await measure()
      /* Before the first report the field already had a keyboard's room: ViewportVars stands in an estimate for a webview that reports nothing. */
      expect(down.vis.top === 0 && down.vis.bottom === 844 && down.bar.bottom === 844, "down again, the editor is the whole screen once more, toolbar at the bottom", { beforeAnyReport: flat.vis, down: down.vis })

      /* The post sheet's comment box too. */
      await p.tap("[data-composer-cancel]")
      await sleep(300)
      await p.click("[data-leave-go]").catch(() => {})
      await sleep(500)
      await p.tap('[data-post="p-text"] [data-post-excerpt]')
      await p.waitForFunction(() => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", { timeout: 4000 }).catch(() => {})
      await p.waitForSelector("[data-post-overlay] [data-comment-box=comment] textarea", { timeout: 4000 }).catch(() => {})
      await p.tap("[data-post-overlay] [data-comment-box=comment] textarea")
      await keyboard(504)
      await sleep(500)
      const sheet = await p.evaluate(() => {
        const panel = document.querySelector("[data-post-overlay=phone]").closest("[data-sheet-panel]")
        const b = panel.getBoundingClientRect()
        const f = document.activeElement.closest("[data-comment-box]").getBoundingClientRect()
        const sc = panel.querySelector("[data-sheet-scroll]").getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), box: Math.round(f.bottom), visibleTo: Math.round(sc.bottom) }
      })
      expect(sheet.bottom === 504 && sheet.top >= 0 && sheet.box <= sheet.visibleTo, "the post's sheet sits on the keyboard with the whole comment box in sight", sheet)
      await shot(p, `${label}-r9-sheet-keyboard`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── SLIDER: the viewer follows the finger, snaps with its speed, neighbours ready ── */
    if (want("slider")) {
      const { p, errors } = await open("post", "/community/studio-notes/post/p-intro", vp)
      const cdp = await p.target().createCDPSession()
      await p.evaluate(() => document.querySelector('[data-media-tile="image"]').scrollIntoView({ block: "center" }))
      await sleep(200)
      const tile = await p.evaluate(() => {
        const b = document.querySelector('[data-media-index="0"]').getBoundingClientRect()
        return { x: b.left, y: b.top, w: b.width, h: b.height }
      })
      /* Every frame of the open: where the picture is drawn. Three opens (the machine is shared): the middle one's frames are judged. */
      const openOnce = async () => {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        await p.evaluate(() => {
          window.__lf = []
          const loop = () => {
            const m = document.querySelector('[data-lightbox-slide="0"] [data-lightbox-media]')
            if (m) {
              const b = m.getBoundingClientRect()
              window.__lf.push({ t: performance.now(), x: b.left, y: b.top, w: b.width, h: b.height })
            }
            window.__lfr = requestAnimationFrame(loop)
          }
          window.__lfr = requestAnimationFrame(loop)
        })
        await (phone ? p.tap('[data-media-index="0"]') : p.click('[data-media-index="0"]'))
        await p.waitForFunction(() => document.querySelector("[data-lightbox-phase]")?.getAttribute("data-lightbox-phase") === "open", { timeout: 4000 }).catch(() => {})
        await sleep(200)
        const lf = await p.evaluate(() => (cancelAnimationFrame(window.__lfr), window.__lf))
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        const grows = lf.map((f) => Math.round(f.w))
        const lgaps = lf.slice(1).map((f, i) => f.t - lf[i].t)
        /* The move's frames: from the first that changes (the ones before draw the full size picture for the first time: `firstFrames`). */
        const movedAt = Math.max(1, grows.findIndex((w) => w !== grows[0]))
        const moveGaps = lgaps.slice(movedAt - 1, grows.findIndex((w, i) => i > movedAt && w === grows.at(-1)) + 1)
        return { f0: lf[0], grows, moveMax: Math.round(Math.max(0, ...moveGaps)), firstFrames: lgaps.slice(0, movedAt - 1).map(Math.round) }
      }
      const opens = []
      for (let k = 0; k < 3; k++) {
        if (k) {
          await p.keyboard.press("Escape")
          await p.waitForFunction(() => !document.querySelector("[data-lightbox]"), { timeout: 3000 }).catch(() => {})
          await sleep(300)
        }
        opens.push(await openOnce())
      }
      const { f0 } = opens[0]
      const midOpen = [...opens].sort((a, b) => a.moveMax - b.moveMax)[1]
      /* The picture is scaled to cover the thumbnail and cropped to it (a clip), so its box is centred on the thumbnail, as wide as it here (a wide tile). */
      const cy = (r) => r.y + r.h / 2
      expect(f0 && Math.abs(f0.x - tile.x) <= 6 && Math.abs(cy(f0) - cy(tile)) <= 6 && Math.abs(f0.w - tile.w) <= 8, "SLIDER: the viewer opens out of the pressed thumbnail: its first frame is drawn where the thumbnail is (same left, width and centre)", { first: f0 && { x: Math.round(f0.x), cy: Math.round(cy(f0)), w: Math.round(f0.w) }, tile: { x: Math.round(tile.x), cy: Math.round(cy(tile)), w: Math.round(tile.w) } })
      expect(opens.every((o) => o.grows.every((w, i) => i === 0 || w >= o.grows[i - 1] - 1)) && midOpen.moveMax <= 34, "and only ever grows from there, every frame of the move drawn at 4x CPU (middle of three opens)", opens.map((o) => ({ moveMaxGap: o.moveMax, firstFrames: o.firstFrames, frames: o.grows.length })))
      const ready = await p.evaluate(() => {
        const img = document.querySelector('[data-lightbox-slide="1"] img')
        return img ? { complete: img.complete, w: img.naturalWidth, loading: img.loading } : null
      })
      expect(ready && ready.complete && ready.w > 0 && ready.loading === "eager", "the next picture is already loaded before any swipe", ready)
      await shot(p, `${label}-r9-viewer`)
      /* The row's offset: its left edge (it rests at the window's left for the first picture). */
      const trackX = () => p.evaluate(() => Math.round(document.querySelector("[data-lightbox-track]").getBoundingClientRect().left))
      const count = () => p.$eval("[data-lightbox-count]", (e) => e.textContent)
      const W = vp.width
      const mid = { x: Math.round(W / 2), y: Math.round(vp.height / 2) }
      if (phone) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        await startFrames(p)
        const follow = await touchDrag(p, cdp, mid, { x: mid.x - 160, y: mid.y }, { steps: 8, holdMs: 140, onStep: async (d) => (await twoFrames(p), { finger: Math.round(d.x), track: await trackX() }) })
        await sleep(600)
        const slow = { follow, after: await trackX(), count: await count() }
        expect(follow.slice(1).every((f) => Math.abs(f.track - f.finger) <= 1), "the row is under the finger at every step at 4x CPU (finger, track px)", follow.map((f) => [f.finger, f.track]))
        expect(slow.after === 0 && slow.count === "1 / 4", "a slow 160px drag held before lifting goes back to the same picture", slow)
        await touchDrag(p, cdp, mid, { x: mid.x - 110, y: mid.y }, { steps: 4, stepMs: 12 })
        await sleep(600)
        const flick = { x: await trackX(), count: await count() }
        expect(flick.count === "2 / 4" && flick.x === -W, "a quick 110px flick goes on to the next one, landing exactly on it", flick)
        const edge = await touchDrag(p, cdp, mid, { x: mid.x + 300, y: mid.y }, { steps: 6, holdMs: 140, onStep: async (d) => (await twoFrames(p), { finger: Math.round(d.x), track: await trackX() }) })
        await sleep(600)
        expect((await count()) === "1 / 4", "dragged back, it returns to the first", await count())
        const edge2 = await touchDrag(p, cdp, mid, { x: mid.x + 200, y: mid.y }, { steps: 6, holdMs: 140, onStep: async (d) => (await twoFrames(p), { finger: Math.round(d.x), track: await trackX() }) })
        await sleep(600)
        expect(edge2.at(-1).track > 0 && edge2.at(-1).track < edge2.at(-1).finger * 0.7 && (await trackX()) === 0, "past the first picture the row gives on a rubber band and comes back", edge2.map((f) => [f.finger, f.track]))
        const sf = await stopFrames(p)
        expect(sf.over34 === 0, "no frame over two frames' time through the drags and snaps at 4x CPU", sf)
        /* A pull down closes it, back into the thumbnail. */
        await p.evaluate(() => {
          window.__lc = []
          const loop = () => {
            const m = document.querySelector('[data-lightbox-slide="0"] [data-lightbox-media]')
            if (m) {
              const b = m.getBoundingClientRect()
              window.__lc.push({ x: b.left, y: b.top, w: b.width, h: b.height })
            }
            window.__lcr = requestAnimationFrame(loop)
          }
          window.__lcr = requestAnimationFrame(loop)
        })
        await touchDrag(p, cdp, mid, { x: mid.x, y: mid.y + 200 }, { steps: 6, stepMs: 14 })
        await p.waitForFunction(() => !document.querySelector("[data-lightbox]"), { timeout: 3000 }).catch(() => {})
        const lc = await p.evaluate(() => (cancelAnimationFrame(window.__lcr), window.__lc))
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        const lastF = lc.at(-1)
        expect(!(await p.$("[data-lightbox]")) && lastF && Math.abs(lastF.x - tile.x) <= 10 && Math.abs(lastF.w - tile.w) <= 14 && Math.abs(lastF.y + lastF.h / 2 - cy(tile)) <= 10, "a pull down closes it, and it goes back into its thumbnail", { last: lastF && { x: Math.round(lastF.x), cy: Math.round(lastF.y + lastF.h / 2), w: Math.round(lastF.w) }, tile: { x: Math.round(tile.x), cy: Math.round(cy(tile)), w: Math.round(tile.w) } })
      } else {
        /* A mouse drag on a computer works the same way. */
        await p.mouse.move(mid.x, mid.y)
        await p.mouse.down()
        for (let i = 1; i <= 6; i++) {
          await p.mouse.move(mid.x - i * 40, mid.y)
          await sleep(16)
        }
        await p.mouse.up()
        await sleep(600)
        expect((await count()) === "2 / 4" && (await trackX()) === -W, "SLIDER on a computer: a drag moves to the next one too", await count())
        await p.keyboard.press("ArrowLeft")
        await sleep(450)
        expect((await count()) === "1 / 4" && (await trackX()) === 0, "and the arrow keys slide back", await count())
        await p.keyboard.press("Escape")
        await sleep(450)
        expect(!(await p.$("[data-lightbox]")), "Escape closes it")
      }
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── GIPHY: the picker with Giphy's own reply, through the server's code ── */
    if (want("giphy")) {
      const { p, errors, calls, live } = await open("feed", "/community/studio-notes", vp, { giphy: true, gifWait: 250 })
      await (phone ? p.tap("[data-composer-open]") : p.click("[data-composer-open]"))
      await sleep(700)
      const trending = await giphyRoute("")
      expect(trending.reply.gifs?.length === 24 && /api\.giphy\.com\/v1\/gifs\/trending\?/.test(trending.asked) && trending.reply.gifs.every((g) => /^https:\/\/media\d\.giphy\.com\/.+\/200w\.gif\?/.test(g.url) && /200w_s\.gif\?/.test(g.still) && g.w === 200 && g.h > 0), "GIPHY: Giphy's reply (every rendition) through the server's code: 24 GIFs, the 200px moving one and its still, sizes as numbers", trending.reply.gifs?.slice(0, 2))
      await (phone ? p.tap("[data-composer-gif]") : p.click("[data-composer-gif]"))
      await p.waitForSelector("[data-gif]", { timeout: 3000 }).catch(() => {})
      const shown = await p.evaluate(() => ({
        tiles: document.querySelectorAll("[data-gif]").length,
        spinner: !!document.querySelector("[data-gif-loading]"),
        label: [...document.querySelectorAll("[data-gif-results], [data-gif-results] ~ *, [data-gif-grid]")].length,
        trending: /Trending/.test(document.querySelector("[data-gif-results]")?.parentElement?.textContent ?? ""),
        shapes: ["trending 0", "trending 1", "trending 2", "trending 3"].map((t) => document.querySelector(`[data-gif][aria-label="${t}"]`)?.getBoundingClientRect()).map((b) => (b ? Math.round((b.width / b.height) * 100) / 100 : null)),
        src: document.querySelector("[data-gif] img")?.getAttribute("src"),
      }))
      expect(shown.tiles === 24 && !shown.spinner && shown.trending, "opened, the trending GIFs are there at once (the button's own question brought them), under \"Trending\"", shown)
      expect(Math.abs(shown.shapes[0] - 480 / 270) < 0.03 && Math.abs(shown.shapes[1] - 1) < 0.03, "each tile in its GIF's own shape from the first frame", shown.shapes)
      await sleep(400)
      expect((live.giphyImages || 0) > 0, "the pictures come from Giphy's host", live.giphyImages)
      await shot(p, `${label}-r9-giphy-trending`)
      /* A search: the trending ones stay (lighter) until the new ones are here, never an empty grid. */
      await p.type('[aria-label="Search GIFs"]', "cat")
      const during = []
      for (let i = 0; i < 12; i++) {
        during.push(await p.evaluate(() => ({ tiles: document.querySelectorAll("[data-gif]").length, empty: !!document.querySelector("[data-gif-empty], [data-gif-loading]"), first: document.querySelector("[data-gif]")?.getAttribute("aria-label") })))
        await sleep(60)
      }
      await p.waitForFunction(() => /^cat /.test(document.querySelector("[data-gif]")?.getAttribute("aria-label") ?? ""), { timeout: 4000 }).catch(() => {})
      const cat = await p.evaluate(() => ({ first: document.querySelector("[data-gif]")?.getAttribute("aria-label"), tiles: document.querySelectorAll("[data-gif]").length }))
      expect(during.every((d) => d.tiles > 0 && !d.empty) && cat.first === "cat 0" && cat.tiles === 24, "typing a search keeps GIFs on screen the whole time, then shows the cat ones", { during: during.map((d) => d.tiles), cat })
      /* The next page as the end comes near. */
      await p.evaluate(() => {
        const box = document.querySelector("[data-gif-results]")
        box.scrollTop = box.scrollHeight
      })
      const placed = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-gif]")].map((e) => [e.getAttribute("aria-label"), Math.round(e.getBoundingClientRect().left)])))
      await p.waitForFunction(() => document.querySelectorAll("[data-gif]").length > 24, { timeout: 4000 }).catch(() => {})
      const paged = await p.evaluate(() => document.querySelectorAll("[data-gif]").length)
      const after = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-gif]")].map((e) => [e.getAttribute("aria-label"), Math.round(e.getBoundingClientRect().left)])))
      expect(paged === 36 && calls.some((c) => /\/gifs\?q=cat&offset=24/.test(c.url)), "scrolled to the end, the next page comes (24 + 12)", paged)
      expect(Object.entries(placed).every(([k, x]) => after[k] === x), "and the GIFs already there keep their column (the new ones go under them)", Object.entries(placed).filter(([k, x]) => after[k] !== x).slice(0, 4))
      /* Nothing found. */
      await p.evaluate(() => {
        const i = document.querySelector('[aria-label="Search GIFs"]')
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        set.call(i, "")
        i.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await p.type('[aria-label="Search GIFs"]', "nothing")
      await p.waitForSelector("[data-gif-empty]", { timeout: 4000 }).catch(() => {})
      const none = await p.evaluate(() => document.querySelector("[data-gif-empty]")?.textContent ?? null)
      expect(none === 'No GIFs for "nothing". Try other words.', "nothing found says so, with the words", none)
      await shot(p, `${label}-r9-giphy-empty`)
      /* Back to cat (shown at once from what was read), and a pick. */
      await p.evaluate(() => {
        const i = document.querySelector('[aria-label="Search GIFs"]')
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        set.call(i, "cat")
        i.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await sleep(80)
      const again = await p.evaluate(() => document.querySelector("[data-gif]")?.getAttribute("aria-label"))
      expect(again === "cat 0", "a search typed again shows its GIFs at once", again)
      await sleep(500)
      await (phone ? p.tap("[data-gif]") : p.click("[data-gif]"))
      await sleep(500)
      const att = await p.evaluate(() => {
        const a = document.querySelector('[data-attachment="gif"]')
        return a ? { img: a.querySelector("img")?.getAttribute("src") } : null
      })
      expect(!!att && /200w_s\.gif/.test(att.img ?? ""), "picked, it is attached, shown by its still", att)
      await p.type("[data-composer-title]", "A GIF from Giphy")
      await p.type('[aria-label="Post"]', "Look at this.")
      await p.click("[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      await p.click("[data-composer-post]")
      await sleep(600)
      const sent = calls.filter((c) => c.url.endsWith("/posts") && c.method === "POST").map((c) => JSON.parse(c.body))[0]
      const gif = sent?.media?.find((m) => m.type === "gif")
      expect(!!gif && /^https:\/\/media\d\.giphy\.com\/.+\/200w\.gif\?/.test(gif.url) && /200w_s\.gif/.test(gif.still) && gif.w === 200 && gif.title === "cat 0", "and the post carries Giphy's moving GIF, its still, its size and title", gif)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }
  }

  /* ── MESSAGES: two members, two pages ───────────────────────────── */
  for (const [label, vp] of VIEWPORTS.filter(([l]) => want("messages") && (!process.env.ONLY || l.startsWith(process.env.ONLY)))) {
    console.log(`\n${label}: messages between two members`)
    dmStore.conversations.clear()
    dmStore.messages.length = 0
    dmStore.pages.clear()
    const a = await open("dm", "/community/studio-notes?as=u-me", vp, { dm: true })
    const b = await open("dm", "/community/studio-notes?as=u-jonas", vp, { dm: true })
    const authed = await a.p.evaluate(() => window.__channels.filter((h) => /community-dm/.test(h.name)).every((h) => h.authed))
    expect(authed, "the inbox stream joins after the member's token is set, not as a visitor")
    /* The page being pressed is brought to the front: a tab in the back gets no animation frames, and a press waits for one. */
    await a.p.bringToFront()
    await press(a.p, "[data-community-messages-button]")
    await a.p.waitForSelector("[data-messages-new]", { timeout: 4000 })
    await press(a.p, "[data-messages-new]")
    await a.p.type('input[aria-label="Search members"]', "Jon")
    await a.p.waitForFunction(() => [...document.querySelectorAll('[data-community-messages] button')].some((x) => /Jonas Berg/.test(x.textContent)), { timeout: 4000 }).catch(() => {})
    const jonas = await a.p.evaluateHandle(() => [...document.querySelectorAll('[data-community-messages] button')].find((x) => /Jonas Berg/.test(x.textContent)))
    await jonas.asElement()?.evaluate((e) => e.click())
    await a.p.waitForSelector("[data-thread-form] textarea", { timeout: 4000 })
    await a.p.type("[data-thread-form] textarea", "Hey Jonas, are you coming to critique night?")
    await a.p.keyboard.press("Enter")
    await b.p.waitForFunction(() => /1/.test(document.querySelector("[data-community-messages-button]")?.getAttribute("aria-label") ?? ""), { timeout: 4000 }).catch(() => {})
    const badge = await b.p.$eval("[data-community-messages-button]", (x) => x.getAttribute("aria-label"))
    await b.p.bringToFront()
    expect(badge === "Messages, 1 unread", "the other member's badge lights without a reload", badge)
    await shot(b.p, `${label}-dm-badge`)
    await press(b.p, "[data-community-messages-button]")
    await b.p.waitForSelector("[data-conversation]", { timeout: 4000 }).catch(() => {})
    await press(b.p, "[data-conversation]")
    await b.p.waitForFunction(() => /critique night/.test(document.querySelector("[data-thread-list]")?.textContent ?? ""), { timeout: 4000 }).catch(() => {})
    expect(/critique night/.test(await b.p.$eval("[data-thread-list]", (x) => x.textContent)), "they open it and read it")
    await b.p.type("[data-thread-form] textarea", "Yes, see you there")
    await b.p.keyboard.press("Enter")
    await a.p.bringToFront()
    await a.p.waitForFunction(() => /see you there/.test(document.querySelector("[data-thread-list]")?.textContent ?? ""), { timeout: 4000 }).catch(() => {})
    expect(/see you there/.test(await a.p.$eval("[data-thread-list]", (x) => x.textContent)), "the answer arrives in the first member's open conversation, live")
    await shot(a.p, `${label}-dm-thread`)
    await b.p.bringToFront()
    await shot(b.p, `${label}-dm-thread-b`)
    const side = await sideScroll(a.p)
    expect(side.scroll <= side.width, "nothing scrolls sideways", side)
    expect(a.errors.length === 0 && b.errors.length === 0, "no page error", [...a.errors, ...b.errors])
    await a.p.close()
    await b.p.close()
  }
} finally {
  await browser.close()
  if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
