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
 * Round 10 (C7):
 *   LIVE       the community's live channel (a stubbed Realtime broadcast)
 *              says a new post's id: read through the gated route, it slides
 *              in at the top (the posts under it start where they were and
 *              slide down, no jump); scrolled down, a quiet "N new posts"
 *              pill waits instead and nothing on screen moves; the pill
 *              scrolls up and puts them in; the member's own is skipped
 *   PULL       the pull to refresh event: detail.done is a promise, set by
 *              the feed, that settles after the first page is read again
 *   TYPING     "<name> is writing..." from the post's channel, names from
 *              the comments on screen or the person card, gone after a few
 *              seconds or when they stop; it takes no room; the member's
 *              own typing is said at most once every two seconds
 *   ARRIVAL    a comment from somebody else lands at the end with a rise
 *              and a fade, the count moves; the member's own lands too
 *   HEART      like taps at 4x CPU: one tap, one change, within a frame;
 *              the heart fills over several frames and beats, the button
 *              box never scales, the count shows only its two values
 *   KBDOCK     the phone editor's toolbar sampled every frame while a
 *              keyboard (modelled as iOS moves it) opens and closes four
 *              times: how far it is from the keyboard's top each frame
 *   FINISH     Post: spinner, then a check at one width; the editor closes;
 *              the post arrives at the top with its highlight, the page
 *              scrolling smoothly to it
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
import { deflateSync } from "node:zlib"
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
/* Round 10: Realtime broadcast. window.__broadcast(name, event, payload) reaches every listener on a channel of that exact name; what a page sends is kept in window.__sent. */
window.__broadcast = (name, event, payload) => {
  let n = 0
  for (const h of handlers) {
    if (h.gone || h.type !== "broadcast" || h.name !== name || h.filter.event !== event) continue
    n++
    h.cb({ type: "broadcast", event, payload })
  }
  return n
}
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
        send(msg) { (window.__sent ||= []).push({ name, at: performance.now(), ...msg }); return Promise.resolve("ok") },
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

/** Round 10: a post somebody else just wrote, as the gated route answers it. */
const livePost = (id) => ({ id, communityId: CID, space: { id: "s-general", slug: "general", name: "General" }, kind: "post", title: `Anyone else redoing their pricing page this week? (${id})`, body: "", bodyText: "Mine goes live on Friday. Happy to swap notes before then.", media: [], pinned: false, featured: false, locked: false, status: "published", author: { id: "u-leo", name: "Leo Martins", username: "leom", avatarUrl: null, role: "member", level: 2 }, reactionCount: 0, commentCount: 0, reacted: false, bookmarked: false, poll: null, createdAt: new Date().toISOString(), editedAt: null, lastActivityAt: new Date().toISOString(), canEdit: false, canModerate: true, recentCommenters: [], lastCommentAt: null, showLevel: true })

async function open(name, path, vp, opts = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  const navs = []
  const live = { now: {}, max: {}, sent: [], comments: 0 }
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  /* Round 12: a script run before the page's own (the AudioContext stand in, say). */
  if (opts.before) await p.evaluateOnNewDocument(opts.before)
  if (opts.reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
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
      /* Round 13: a slow network for the full pictures (the 32px placeholder copy, &w=32, comes at once). */
      const slow = opts.imageWait && !/[?&]w=32\b/.test(url) ? opts.imageWait : 0
      return void setTimeout(() => r.respond({ status: 200, contentType: "image/svg+xml", body: decodeURIComponent(svg("#dfe5ec", "#8796ab", 1200, 800).split(",")[1]) }), slow)
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
      /* Round 12: the safety checks hold it for a moderator (202, held, the server's own words). */
      if (opts.held && method === "POST" && (short.endsWith("/posts") || /\/posts\/[^/]+\/comments$/.test(short))) {
        live.held = [...(live.held || []), short]
        const post = short.endsWith("/posts")
        return reply(post ? { post: { id: "p-held", title: sent.title }, held: true, message: "Your post is waiting for a moderator. You will hear when it is up." } : { comment: { id: "c-held", body: sent.body }, held: true, message: "Your comment is waiting for a moderator." }, 202, 200)
      }
      if (/\/posts\/[^/]+\/comments$/.test(short) && method === "POST") {
        const refuse = /refuse/.test(sent.body || "")
        const n = ++live.comments
        /* Round 11: what a comment carries comes back as sent; "not mine" is the server refusing a picture that is not the member's own upload. */
        const notMine = /not mine/.test(sent.body || "")
        live.commentBodies = [...(live.commentBodies || []), sent]
        return setTimeout(() => r.respond({ status: refuse ? 403 : notMine ? 400 : 201, contentType: "application/json", body: JSON.stringify(refuse ? { error: "muted" } : notMine ? { error: "That picture could not be added. Upload it again." } : { comment: { id: `c-new-${n}`, postId: "x", parentId: sent.parentId ?? null, body: sent.body, status: "published", deleted: false, author: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator", level: 3 }, reactionCount: 0, reacted: false, createdAt: new Date().toISOString(), editedAt: null, replies: [], canEdit: true, canModerate: true, ...(sent.media ? { media: sent.media } : {}) } }) }), opts.commentWait ?? 400)
      }
      /* Round 12: a report lands; a poll's vote is counted from the fixture's own numbers (3, 2, 1) plus the member's answer. */
      if (short.endsWith("/reports") && method === "POST") {
        live.reports = [...(live.reports || []), sent]
        return reply({ ok: true, already: false }, 200, 250)
      }
      const vote = /\/polls\/([^/]+)\/vote$/.exec(short)
      if (vote && method === "POST") {
        const id = vote[1]
        const multiple = id.endsWith("b2")
        const base = [3, 2, 1]
        const labels = multiple ? ["Figma", "Framer", "Paper"] : ["Tuesday evening", "Thursday evening", "Saturday morning"]
        const options = ["a", "b", "c"].map((k, i) => ({ id: `${id}-${k}`, label: labels[i], voteCount: base[i] + (sent.optionIds.includes(`${id}-${k}`) ? 1 : 0), voted: sent.optionIds.includes(`${id}-${k}`) }))
        live.votes = [...(live.votes || []), sent.optionIds]
        return reply({ poll: { id, question: multiple ? "Which tools do you use?" : "When should critique night be?", multiple, closesAt: null, closed: false, totalVotes: options.reduce((n, o) => n + o.voteCount, 0), options } }, 200, opts.voteWait ?? 250)
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
      /* Round 10: the live channel's name, a post or a comment read by the id a broadcast carried, a person card, a feed page read again. */
      if (short.endsWith("/live")) return reply({ topic: "community-live:probe" })
      if (/\/posts\/p-live-\d+$/.test(short) && method === "GET") return reply({ post: livePost(short.split("/").pop()) }, 200, 60)
      if (/\/comments\/c-live-\d+$/.test(short) && method === "GET") return reply({ comment: { id: short.split("/").pop(), postId: "p-video", parentId: null, body: "Just watched it, the pricing part is so good.", status: "published", deleted: false, author: { id: "u-leo", name: "Leo Martins", username: "leom", avatarUrl: null, role: "member", level: 2 }, reactionCount: 0, reacted: false, createdAt: new Date().toISOString(), editedAt: null, replies: [], canEdit: false, canModerate: true } }, 200, 60)
      if (/\/people\/u-zoe\/card$/.test(short)) return reply({ person: { id: "u-zoe", name: "Zoe Park" } }, 200, 40)
      if (/\/posts\?/.test(short) && method === "GET" && live.feedPage) {
        live.feedReadAt = Date.now()
        return reply(live.feedPage, 200, opts.feedWait ?? 300)
      }
      /* Round 13: a post read by id (an edit heard live), an edit saved, a delete, a comment deleted. */
      const byId = /\/posts\/(p-[a-z0-9-]+)$/.exec(short)?.[1]
      if (byId && method === "GET" && live.posts?.[byId]) return reply({ post: live.posts[byId] }, 200, 60)
      if (byId && method === "PATCH") {
        live.patches = [...(live.patches || []), { id: byId, sent }]
        const base = live.editBase ?? {}
        const saved = { ...base, title: sent.title, bodyText: sent.body, media: sent.media ?? base.media, poll: sent.poll === null ? null : sent.poll ? { ...(base.poll ?? {}), question: sent.poll.question, options: sent.poll.options.map((label, i) => ({ id: `o${i}`, label, voteCount: 0, voted: false })), multiple: sent.poll.multiple } : base.poll, editedAt: new Date().toISOString() }
        return reply({ post: saved }, 200, opts.saveWait ?? 350)
      }
      if (byId && method === "DELETE") {
        live.deletes = [...(live.deletes || []), byId]
        return reply({ ok: true }, 200, 200)
      }
      if (/\/comments\/[^/]+$/.test(short) && method === "DELETE") {
        live.commentDeletes = [...(live.commentDeletes || []), short.split("/").pop()]
        return reply({ ok: true }, 200, 150)
      }
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

/** A real PNG of one colour, for an upload (round 11). */
function solidPng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
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
      if (phone) expect(card["p-intro"].thumb === null || (card["p-intro"].thumb.w === 0 && card["p-intro"].thumb.h === 0), "a phone draws no thumbnail on the right (the pictures go under the words)", card["p-intro"].thumb)
      else {
        /* Round 12 changed this on purpose (the owner asked): two or more pictures go under the words on a computer too (R12 CARD below). */
        expect(card["p-intro"].thumb === null, "a computer draws no right thumbnail for a post with several pictures", card["p-intro"].thumb)
        expect(card["p-gif"].thumb?.w === 96 && card["p-gif"].thumb?.h === 96 && card["p-gif"].thumb.rightOfTitle && card["p-gif"].thumb.right <= 24, "one picture keeps its 96px thumbnail on the right, beside the title and the words", card["p-gif"].thumb)
      }
      expect(card["p-video"].thumb?.kind === "video" && card["p-gif"].thumb?.kind === "gif" && card["p-link"].thumb?.kind === "link" && card["p-text"].thumb === null, "a video by address shows its picture, a GIF its still, a link its picture, text nothing", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.thumb?.kind ?? null])))
      expect(card["p-intro"].level === "2" && card["p-video"].level === "6", "the author's level sits on their picture", [card["p-intro"].level, card["p-video"].level])
      const faces = await p.evaluate(() => [...document.querySelectorAll('[data-post="p-intro"] [data-commenters] > *')].filter((e) => e.getBoundingClientRect().width > 0).length)
      expect(faces === (phone ? 2 : 3) && card["p-video"].faces === 2, phone ? "up to three commenters' faces, two on a 390px phone" : "up to three commenters' faces", [faces, card["p-video"].faces])
      expect(/^New comment \d+h ago$/.test(card["p-video"].fresh ?? "") && card["p-gif"].fresh === null, "\"New comment 3h ago\" only for one in the last week", [card["p-video"].fresh, card["p-gif"].fresh])
      const cut = await p.evaluate(() => [...document.querySelectorAll("[data-new-comment]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length)
      expect(cut === 0, "and it is never cut short", cut)
      /* Round 13 took the unread dot off cards entirely (the owner asked): none, on any card. */
      expect(Object.values(card).every((v) => !v.unread), "no unread dot on any card (round 13)", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.unread])))
      expect(card["p-intro"].excerptLines <= 2 && card["p-intro"].excerptLines >= 1, "two lines of the words at most", card["p-intro"].excerptLines)
      /* Round 8: the role is RoleBadge (no grey pill), on the name's line, beside Pinned, never wrapped under the name. */
      const role = await p.evaluate(() => {
        const card = document.querySelector('[data-post="p-video"]')
        const line = card.querySelector("[data-post-name-line]")
        const badge = line?.querySelector("[data-role-badge]")
        const name = line?.querySelector("[data-person-link]")
        const pin = card.querySelector("[data-pin-mark]")
        const r = (e) => e?.getBoundingClientRect()
        return badge && name && pin ? { role: badge.getAttribute("data-role-badge"), text: badge.textContent, lineH: Math.round(r(line).height), sameLine: Math.abs(r(badge).top + r(badge).height / 2 - (r(name).top + r(name).height / 2)) <= 2, pinAbove: Math.round(r(name).top - r(pin).bottom), bg: getComputedStyle(badge).backgroundColor } : null
      })
      expect(!!role && role.role === "owner" && role.text === "Owner" && role.sameLine && role.lineH <= 20 && role.pinAbove >= 0 && role.bg === "rgba(0, 0, 0, 0)", "the Owner badge sits on the name's line, not a filled pill; Pinned is its own line above (round 13)", role)
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
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => /^\S{0,3}General$/.test(b.textContent.trim()) && b.closest('[role="menu"], [role="dialog"]')))
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
      await p.type('[data-link-field="link"] input', "example.com/talk")
      await p.keyboard.press("Enter")
      await p.waitForSelector("[data-link-card]", { timeout: 4000 }).catch(() => {})
      expect(!!(await p.$("[data-link-card]")), "a link brings its card")

      /* A video by address. */
      await p.click('[data-composer-tool="video"]')
      await sleep(200)
      await p.type('[data-link-field="video"] input', "https://youtu.be/dQw4w9WgXcQ")
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
      /* Round 10: the check shows for a moment and the editor closes before the post goes in. */
      await sleep(1200)
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
      /* PROF_OPEN=1: where the main thread goes during the first open (round 10), self time per function and the long trace events. */
      if (process.env.PROF_OPEN) {
        await cdp.send("Profiler.enable")
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
        await cdp.send("Profiler.start")
        await p.tracing.start({ path: join(shots, "open-trace.json"), categories: ["devtools.timeline"] })
      }
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
      if (process.env.PROF_OPEN) {
        await p.tracing.stop()
        const ev = JSON.parse(readFileSync(join(shots, "open-trace.json"), "utf8")).traceEvents
        const sum = new Map()
        for (const e of ev) if (e.ph === "X" && e.dur) sum.set(e.name, (sum.get(e.name) || [0, 0, 0]).map((v, k) => (k === 0 ? v + e.dur : k === 1 ? v + 1 : Math.max(v, e.dur))))
        console.log("OPEN-TRACE", JSON.stringify([...sum].sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, [t, n, m]]) => [k, Math.round(t / 1000), n, Math.round(m / 1000)])))
        const { profile } = await cdp.send("Profiler.stop")
        const self = new Map()
        const byId = new Map(profile.nodes.map((n) => [n.id, n]))
        profile.samples.forEach((id, k) => {
          const n = byId.get(id)
          const key = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
          self.set(key, (self.get(key) || 0) + (profile.timeDeltas[k] || 0))
        })
        console.log("OPEN-SELF", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => [k, Math.round(v / 1000)])))
      }
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
          return { w: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top), page: document.documentElement.clientWidth }
        })
        /* The middle of the page's own width: round 13 keeps the page's scrollbar (its gutter) while a post is open. */
        expect(panel.w === 760 && Math.abs(panel.left - (panel.page - 760) / 2) <= 1, "a 760px panel in the middle", panel)
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
      /* Round 9: the close goes back into its thumbnail (240ms); it leaves the page when that has finished. */
      const t0 = Date.now()
      await p.waitForFunction(() => !document.querySelector("[data-lightbox]"), { timeout: 1500 }).catch(() => {})
      expect(!(await p.$("[data-lightbox]")), "Escape closes it", `${Date.now() - t0}ms`)
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

    /* ── MOUNT: what drawing a page of 20 posts costs at 4x CPU (going back to the feed, switching a space) ── */
    if (want("mount")) {
      const { p, errors } = await open("mount", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const runs = []
      for (let k = 1; k <= 5; k++) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        const prof = process.env.PROF && k === 3
        if (prof) {
          await cdp.send("Profiler.enable")
          await cdp.send("Profiler.setSamplingInterval", { interval: 100 })
          await cdp.send("Profiler.start")
          await p.tracing.start({ path: join(shots, "mount-trace.json"), categories: ["devtools.timeline"] })
        }
        runs.push(
          await p.evaluate(
            (k) =>
              new Promise((done) => {
                const long = []
                const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(Math.round(e.duration))))
                po.observe({ type: "longtask" })
                const t0 = performance.now()
                const seen = () => document.querySelectorAll(`[data-feed-list] > [data-post*="-m${k}-"]`).length > 0
                const wait = () => {
                  if (!seen()) return requestAnimationFrame(wait)
                  /* The frame that shows the posts. */
                  requestAnimationFrame(() => {
                    const shown = Math.round(performance.now() - t0)
                    setTimeout(() => {
                      po.disconnect()
                      done({ shown, longest: Math.max(0, ...long), longTotal: long.reduce((a, b) => a + b, 0), cards: document.querySelectorAll(`[data-feed-list] > [data-post*="-m${k}-"]`).length })
                    }, 900)
                  })
                }
                window.__mount(k)
                requestAnimationFrame(wait)
              }),
            k,
          ),
        )
        if (prof) {
          await p.tracing.stop()
          const ev = JSON.parse(readFileSync(join(shots, "mount-trace.json"), "utf8")).traceEvents
          const sum = new Map()
          for (const e of ev) if (e.ph === "X" && e.dur) sum.set(e.name, (sum.get(e.name) || 0) + e.dur)
          console.log("TRACE", JSON.stringify([...sum].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, t]) => [k, Math.round(t / 1000)])))
          const { profile } = await cdp.send("Profiler.stop")
          const self = new Map()
          const byId = new Map(profile.nodes.map((n) => [n.id, n]))
          profile.samples.forEach((id, i) => {
            const n = byId.get(id)
            const key = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
            self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0))
          })
          console.log("SELF", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1000)])))
          /* Inclusive time per component (React function names in the stack). */
          const parent = new Map()
          for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
          const incl = new Map()
          profile.samples.forEach((id, i) => {
            const names = new Set()
            for (let x = id; x != null; x = parent.get(x)) {
              const fn = byId.get(x).callFrame.functionName
              if (/^[A-Z]/.test(fn)) names.add(fn)
            }
            for (const nm of names) incl.set(nm, (incl.get(nm) || 0) + (profile.timeDeltas[i] || 0))
          })
          console.log("INCL", JSON.stringify([...incl].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1000)])))
        }
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        await sleep(300)
      }
      const mid = (key) => [...runs].map((r) => r[key]).sort((a, b) => a - b)[2]
      console.log(`  info  MOUNT at 4x CPU, 20 posts, median of 5: on screen ${mid("shown")}ms, longest task ${mid("longest")}ms, long tasks ${mid("longTotal")}ms in all`, JSON.stringify(runs))
      expect(runs.every((r) => r.cards === 20), "MOUNT: all twenty posts are drawn in the end", runs.map((r) => r.cards))
      /*
        Before round 9's change (the same fixture): on screen in 554ms (desktop) and 565ms (phone), longest
        task 520ms and 497ms with the composer's every-render height read, 291ms and 340ms without it.
      */
      expect(mid("shown") <= 320 && mid("longest") <= 160, "and a screenful is on screen within 320ms at 4x CPU, no task over 160ms (median of 5)", { shown: mid("shown"), longest: mid("longest") })
      const holes = await p.evaluate(() => document.querySelectorAll("[data-post-placeholder]").length)
      expect(holes === 0, "no stand in is left once the frame after it has passed", holes)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

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
        expect((rows.intro.thumb === null || rows.intro.thumb === "none") && rows.video.thumb === "none", "and no thumbnail on the right on a phone", [rows.intro.thumb, rows.video.thumb])
        const small = await smallTargets(p, "[data-feed-list]")
        expect(small.length === 0, "every control in a row is at least 40px tall", small.slice(0, 6))
      } else {
        expect(rows.posts.every((c) => c.radius === "16px" && c.sides === "1px 1px 1px 1px" && c.x > 300 && c.w < 760), "ROWS on a computer: the cards are as they were (1px edge, 16px rounding, in the column)", rows.posts.map((c) => [c.x, c.w, c.radius, c.sides]))
        expect(rows.posts.slice(1).every((c, i) => c.top - rows.posts[i].bottom === 12), "with the 12px gap between them", rows.posts.map((c) => c.top))
        /* Round 12 (the owner asked): several pictures go under the words on a computer too; one keeps the thumbnail on the right. */
        expect(rows.intro.shown && rows.intro.kind === "pair" && rows.intro.belowWords && rows.intro.thumb === null, "several pictures: under the words, no thumbnail on the right", rows.intro)
        expect(!rows.video.shown && rows.video.thumb === "block", "one picture: the thumbnail on the right, nothing under the words", rows.video)
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
            /* Round 11: the card itself never fades; what fades in is the editor's content inside it. */
            const content = document.querySelector("[data-composer-editor]")
            window.__cf.push({ t: performance.now(), sheetY: sheet ? Math.round(sheet.getBoundingClientRect().top) : null, op: content ? Number(getComputedStyle(content).opacity) : null, nextTop: next ? Math.round(ty(next)) : null, edH: ed ? 1 : null })
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
        expect(ops[0] < 0.5 && ops.every((v, i) => i === 0 || v >= ops[i - 1]) && ops.at(-1) === 1, "MOTION: in place, the editor's content fades in from its first frame (inside the card, which never fades)", ops)
        expect(tops.every((t, i) => i === 0 || t >= tops[i - 1]) && tops[0] < -100 && tops.at(-1) === 0, "while the posts under it slide down to make room (their offset from where they rest, rising to 0), never back up", tops)
        const ctops = c.closed.filter((f) => f.ed).map((f) => f.nextTop)
        expect(ctops.at(-1) < -100 && ctops.every((t, i) => i === 0 || t <= ctops[i - 1] + 0.5), "closing, they slide back up over it, never down again", ctops)
      }
      expect(runs.map((r) => r.mount).sort((a, b) => a - b)[1] < 300, "the editor is on screen within 300ms of the press at 4x CPU (middle of three)", runs.map((r) => r.mount))
      expect(Math.max(0, ...o.openGaps) <= 34 && Math.max(0, ...c.closeGaps) <= 34, "every frame of the open and the close is drawn at 4x CPU (no gap over two frames, middle of three)", runs.map((r) => ({ open: Math.round(Math.max(0, ...r.openGaps)), close: Math.round(Math.max(0, ...r.closeGaps)), firstFrame: r.firstFrame, openFrames: r.openGaps.length, closeFrames: r.closeGaps.length })))
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── FLASH (round 11): open and Cancel are one continuous move ── */
    if (want("flash")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      /* The closed card and its row, tagged: every frame after must show these same nodes. */
      await p.evaluate(() => {
        window.__card = document.querySelector("[data-composer]")
        window.__row = document.querySelector("[data-composer-row]")
      })
      const sample = () =>
        p.evaluate(() => {
          window.__ff = []
          const ty = (e) => {
            if (!e) return null
            const t = getComputedStyle(e).translate
            return t === "none" ? 0 : parseFloat(t.split(" ")[1] ?? "0") || 0
          }
          const loop = () => {
            const card = document.querySelector("[data-composer]")
            const row = document.querySelector("[data-composer-row]")
            const ed = document.querySelector("[data-composer-editor]")
            const sheet = document.querySelector("[data-composer=sheet]")
            const cs = card ? getComputedStyle(card) : null
            const rowOp = row ? Number(getComputedStyle(row).opacity) : 0
            const edOp = ed ? Number(getComputedStyle(ed).opacity) : 0
            window.__ff.push({
              t: performance.now(),
              same: card === window.__card && row === window.__row,
              state: card?.getAttribute("data-composer") ?? null,
              cardOp: cs ? Number(cs.opacity) : 0,
              cardH: card ? card.offsetHeight : 0,
              rowOp,
              edOp,
              shown: Math.round((1 - (1 - rowOp) * (1 - edOp)) * 100) / 100,
              next: card ? Math.round(ty(card.nextElementSibling) ?? 0) : null,
              sheet: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
              sheetNode: sheet ? (sheet.__id ||= Math.random()) : null,
              /* Round 12: every picture of the member inside the card, its size and its place in the card. */
              avs: card ? [...card.querySelectorAll("[data-composer-avatar], [data-composer-editor] img, [data-composer-editor] [data-avatar]")].map((a) => {
                const r = a.getBoundingClientRect()
                const c = card.getBoundingClientRect()
                return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left - c.left)},${Math.round(r.top - c.top)}`
              }) : [],
            })
            window.__ffr = requestAnimationFrame(loop)
          }
          window.__ffr = requestAnimationFrame(loop)
        })
      const stop = () => p.evaluate(() => (cancelAnimationFrame(window.__ffr), window.__ff))
      /* A filmstrip: every frame the compositor draws, as the page shows it, at 4x CPU. */
      const film = []
      cdp.on("Page.screencastFrame", (f) => {
        film.push({ t: f.metadata.timestamp, data: f.data })
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
      })
      const runs = {}
      for (const leg of ["open", "close"]) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        const at = film.length
        await cdp.send("Page.startScreencast", { format: "jpeg", quality: 75, maxWidth: phone ? 390 : 1440, maxHeight: phone ? 844 : 900, everyNthFrame: 1 })
        await sample()
        /* A press as a hand makes one: down, about a tenth of a second, up (a click is both in the same millisecond). */
        const sel = leg === "open" ? "[data-composer-open]" : "[data-composer-cancel]"
        if (phone) await p.tap(sel)
        else {
          const box = await (await p.$(sel)).boundingBox()
          await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await p.mouse.down()
          await sleep(90)
          await p.mouse.up()
        }
        await sleep(phone ? 900 : 700)
        runs[leg] = await stop()
        await cdp.send("Page.stopScreencast")
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        runs[leg + "Film"] = film.slice(at)
        await sleep(300)
      }
      /* The filmstrip as one picture to look at: the frames of each leg in a grid, in order (a computer's cropped to the feed column). */
      const strip = await browser.newPage()
      await strip.setViewport({ width: phone ? 1300 : 1460, height: 900, deviceScaleFactor: 1 })
      for (const leg of ["open", "close"]) {
        const frames = runs[leg + "Film"].slice(0, phone ? 18 : 12)
        const cell = (f) => (phone ? `<img style="width:100%;display:block" src="data:image/jpeg;base64,${f.data}">` : `<div style="width:600px;height:330px;overflow:hidden;position:relative"><img style="position:absolute;left:-400px;top:-40px;width:1440px" src="data:image/jpeg;base64,${f.data}"></div>`)
        await strip.setContent(`<body style="margin:0;background:#222;font:12px system-ui;color:#fff"><div style="display:grid;grid-template-columns:repeat(${phone ? 6 : 2},max-content);gap:6px;padding:4px">${frames.map((f, i) => `<div><div>${leg} ${i} +${Math.round((f.t - frames[0].t) * 1000)}ms</div>${cell(f)}</div>`).join("")}</div></body>`)
        await strip.screenshot({ path: join(shots, `${label}-flash-${leg}-film.png`), fullPage: true })
      }
      await strip.close()
      const o = runs.open
      const c = runs.close
      expect(o.every((f) => f.same) && c.every((f) => f.same), "FLASH: the composer's card and its row are the same nodes on every frame of the open and the Cancel (nothing taken out and put back)", { open: o.filter((f) => !f.same).length, close: c.filter((f) => !f.same).length })
      expect(o.every((f) => f.cardOp === 1) && c.every((f) => f.cardOp === 1), "the card's own opacity never moves (no fade from nothing)", [...new Set([...o, ...c].map((f) => f.cardOp))])
      const avs = [...new Set([...o, ...c].map((f) => f.avs.join(" ")))]
      expect(avs.length === 1 && /^40x40@/.test(avs[0]) && !avs[0].includes(" "), "NO MORPH (round 12): one picture in the card, 40px, in the same place on every frame of the open and the Cancel", avs)
      if (phone) {
        const os = o.filter((f) => f.sheet !== null)
        const first = o.findIndex((f) => f.sheet !== null)
        expect(first >= 0 && o.slice(first).every((f) => f.sheet !== null) && new Set(os.map((f) => f.sheetNode)).size === 1, "the phone's screen, once there, stays the same one until it has arrived", { frames: os.length, nodes: new Set(os.map((f) => f.sheetNode)).size })
        const cs = c.filter((f) => f.sheet !== null)
        const gone = c.findIndex((f, i) => i > 0 && f.sheet === null && c[i - 1].sheet !== null)
        expect(gone > 0 && c.slice(gone).every((f) => f.sheet === null) && new Set(cs.map((f) => f.sheetNode)).size === 1, "closing, the same screen slides away once and is gone (never back)", { frames: cs.length, gone })
        expect([...o, ...c].every((f) => f.state === "closed" && f.rowOp === 1), "the closed field under it stays as it is the whole time", [...new Set([...o, ...c].map((f) => `${f.state}:${f.rowOp}`))])
      } else {
        const moving = o.filter((f) => f.state === "open")
        expect(Math.min(...[...o, ...c].map((f) => f.shown)) >= 0.6, "its content never empties: the closed row and the editor crossfade without a dip (combined, every frame)", { open: Math.min(...o.map((f) => f.shown)), close: Math.min(...c.map((f) => f.shown)) })
        const tops = moving.map((f) => f.next)
        expect(tops[0] < -100 && tops.every((v, i) => i === 0 || v >= tops[i - 1]) && tops.at(-1) === 0, "opening, the posts under it start where they were and only ever slide down", tops)
        const ct = c.filter((f) => f.state === "open").map((f) => f.next)
        expect(ct.every((v, i) => i === 0 || v <= ct[i - 1] + 0.5) && ct.at(-1) < -100, "folding, they only ever slide back up over it", ct)
        const after = c.at(-1)
        expect(after.state === "closed" && after.rowOp === 1 && after.cardH < 90, "then it is the closed field again, in the same card", { state: after.state, rowOp: after.rowOp, h: after.cardH })
        console.log(`  info  FLASH frames (ms, posts' offset, row, editor): open ${JSON.stringify(moving.slice(0, 12).map((f) => [Math.round(f.t - o[0].t), f.next, f.rowOp.toFixed(2), f.edOp.toFixed(2)]))}`)
      }
      expect(runs.openFilm.length >= 6 && runs.closeFilm.length >= 6, "a filmstrip of each leg was recorded", { open: runs.openFilm.length, close: runs.closeFilm.length })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── COMMENT BOX AND COMMENT MEDIA (round 11) ─────────────────── */
    if (want("cmedia")) {
      const { p, errors, live, calls } = await open("cmedia", "/community/studio-notes/post/p-intro", vp, { commentWait: 500 })
      /* The box: a Storelib field (about a 10px corner, a hairline, a 1px shadow). */
      const field = await p.evaluate(() => {
        const f = document.querySelector('[data-comment-box="comment"] [data-comment-field]')
        const cs = getComputedStyle(f)
        const send = getComputedStyle(document.querySelector('[data-comment-box="comment"] [data-comment-send] > span'))
        return { radius: cs.borderTopLeftRadius, border: cs.borderTopColor, width: cs.borderTopWidth, shadow: cs.boxShadow, sendRadius: send.borderTopLeftRadius, h: Math.round(f.getBoundingClientRect().height) }
      })
      expect(parseFloat(field.radius) >= 9 && parseFloat(field.radius) <= 12, "COMMENT BOX: a Storelib field's corner, about 10px (was 20px)", field.radius)
      expect(field.width === "1px" && /rgba?\(/.test(field.shadow) && field.shadow !== "none", "a hairline and a 1px soft shadow", { border: field.border, shadow: field.shadow })
      expect(parseFloat(field.sendRadius) <= 8, "the send button inside it follows the corner", field.sendRadius)
      const scope = '[data-comment-box="comment"]'
      await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), scope)
      await sleep(200)
      await p.screenshot({ path: join(shots, `${label}-r11-comment-box.png`), captureBeyondViewport: false })
      /* The comment already there: its pictures and GIF as small tiles, its file as a row. */
      const shown = await p.evaluate(() => {
        const m = document.querySelector('[data-comment="c-media-1"] [data-comment-media]')
        const tiles = [...(m?.querySelectorAll("[data-comment-tile]") ?? [])].map((t) => ({ kind: t.getAttribute("data-comment-tile"), h: Math.round(t.getBoundingClientRect().height), w: Math.round(t.getBoundingClientRect().width), radius: getComputedStyle(t).borderTopLeftRadius }))
        const file = m?.querySelector("[data-comment-file]")
        return { tiles, file: file ? { text: file.textContent, href: file.getAttribute("href") } : null, gifOnly: !!document.querySelector('[data-comment="c-media-2"] [data-comment-tile="gif"]') }
      })
      expect(shown.tiles.length === 3 && shown.tiles.every((t) => t.h === 96 && t.w >= 72 && t.w <= 176), "COMMENT MEDIA: pictures and a GIF under the words as small tiles (96px tall, each in its shape)", shown.tiles)
      expect(!!shown.file && /Friday notes\.pdf/.test(shown.file.text) && /\/comments\/c-media-1\/files\/33333333-0000-4000-8000-000000000009$/.test(shown.file.href || ""), "a file as a row that downloads through the comment's own member route", shown.file)
      expect(shown.gifOnly, "a comment can be a GIF alone", shown.gifOnly)
      await p.evaluate(() => document.querySelector('[data-comment="c-media-1"]').scrollIntoView({ block: "center" }))
      await sleep(250)
      await p.screenshot({ path: join(shots, `${label}-r11-comment-media.png`), captureBeyondViewport: false })
      await press(p, '[data-comment="c-media-1"] [data-comment-tile="image"]')
      await p.waitForSelector("[data-lightbox]", { timeout: 3000 }).catch(() => null)
      await sleep(450)
      const viewer = await p.evaluate(() => ({ open: !!document.querySelector("[data-lightbox]"), slides: document.querySelectorAll("[data-lightbox-slide]").length }))
      expect(viewer.open && viewer.slides === 3, "a tile opens the viewer, with the comment's other pictures and GIF a swipe away", viewer)
      await shot(p, `${label}-r11-comment-viewer`)
      await p.keyboard.press("Escape")
      await sleep(500)
      expect(!(await p.$("[data-lightbox]")), "Escape closes it", null)

      /* Round 12: sending one with a picture, a video by link and a GIF; a file is turned away in the box (comments take no files). */
      const dir = join(stubs, "files")
      mkdirSync(dir, { recursive: true })
      const png = join(dir, "board.png")
      writeFileSync(png, solidPng(160, 120, [196, 178, 140]))
      const pdf = join(dir, "notes.pdf")
      writeFileSync(pdf, "%PDF-1.4\n%probe\n")
      await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), scope)
      const input = await p.$(`${scope} [data-comment-file-input]`)
      expect(!(await p.$(`${scope} [data-comment-tool="file"]`)) && !!(await p.$(`${scope} [data-comment-tool="image"]`)) && (await p.$eval(`${scope} [data-comment-file-input]`, (i) => i.accept)) === "image/*", "NO FILES: the paperclip is gone; the picture button takes pictures only")
      await input.uploadFile(png, pdf)
      await p.waitForFunction((s) => document.querySelectorAll(`${s} [data-comment-pick][data-comment-pick-ready]`).length === 1, { timeout: 6000 }, scope).catch(() => {})
      const fileSaid = await p.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((t) => t.textContent).join(" | "))
      expect(/Share files in a post/.test(fileSaid), "a file picked anyway is turned away with a sentence, the picture kept", fileSaid)
      await press(p, `${scope} [data-comment-tool="video"]`)
      await p.waitForSelector(`${scope} [data-link-field="video"] input`, { timeout: 3000 }).catch(() => null)
      await p.type(`${scope} [data-link-field="video"] input`, "https://youtu.be/dQw4w9WgXcQ")
      await sleep(500)
      await p.keyboard.press("Enter")
      await sleep(300)
      await press(p, `${scope} [data-comment-tool="gif"] button`)
      await p.waitForSelector("[data-gif]", { visible: true, timeout: 4000 }).catch(() => null)
      await sleep(300)
      await press(p, "[data-gif]")
      await sleep(phone ? 500 : 250)
      const picks = await p.evaluate((s) => [...document.querySelectorAll(`${s} [data-comment-pick]`)].map((x) => x.getAttribute("data-comment-pick")), scope)
      expect(picks.join(",") === "image,embed,gif", "a picture, a video link and a GIF wait at the top of the box", picks)
      const filesRoute = calls.filter((c) => /\/files$/.test(c.url) && c.method === "POST").length
      expect(filesRoute === 0, "nothing went to the file route", filesRoute)
      await p.type(`${scope} textarea`, "Boards attached")
      await sleep(150)
      await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), scope)
      await sleep(150)
      await p.screenshot({ path: join(shots, `${label}-r11-comment-picks.png`), captureBeyondViewport: false })
      /* The landing, frame by frame at 4x CPU: the new row rises into place as it fades in, nothing jumps. */
      const cdp = await p.target().createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.evaluate(() => {
        window.__lf = []
        const known = new Set([...document.querySelectorAll("[data-comment]")].map((e) => e.getAttribute("data-comment")))
        const loop = () => {
          const row = [...document.querySelectorAll("[data-comment]")].find((e) => !known.has(e.getAttribute("data-comment")) || e.hasAttribute("data-comment-sending"))
          if (row) {
            const cs = getComputedStyle(row)
            const ty = cs.translate === "none" ? 0 : parseFloat(cs.translate.split(" ")[1] ?? "0") || 0
            window.__lf.push({ t: performance.now(), op: Number(cs.opacity), ty: Math.round(ty * 10) / 10, sc: cs.scale === "none" ? 1 : Number(cs.scale), media: !!row.querySelector("[data-comment-media]") })
          }
          window.__lfr = requestAnimationFrame(loop)
        }
        window.__lfr = requestAnimationFrame(loop)
      })
      await press(p, `${scope} [data-comment-send]`)
      await sleep(1400)
      const land = await p.evaluate(() => (cancelAnimationFrame(window.__lfr), window.__lf))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const tys = land.map((f) => f.ty)
      expect(land.length > 4 && tys[0] > 6 && tys.every((v, i) => i === 0 || v <= tys[i - 1] + 0.05) && tys.at(-1) === 0, "LANDING: the sent comment rises into its place, never back down", tys.slice(0, 16))
      expect(land[0].op < 0.5 && land.at(-1).op === 1 && land[0].media, "it fades in from its first frame with what it carries, and ends whole once confirmed", { first: land[0].op, last: land.at(-1).op })
      const sentBody = live.commentBodies?.at(-1)
      expect(JSON.stringify((sentBody?.media || []).map((m) => m.type)) === JSON.stringify(["image", "embed", "gif"]) && sentBody.media[1].provider === "youtube", "the POST carries the picture, the YouTube video and the GIF", (sentBody?.media || []).map((m) => m.type))
      const mine = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-comment]")]
        const last = rows.at(-1)
        return { id: last.getAttribute("data-comment"), tiles: last.querySelectorAll("[data-comment-tile]").length, embeds: last.querySelectorAll('[data-comment-embed="youtube"] [data-embed-player]').length, files: last.querySelectorAll("[data-comment-file]").length, boxEmpty: !document.querySelector('[data-comment-box="comment"] [data-comment-pick]') }
      })
      expect(/^c-new-/.test(mine.id) && mine.tiles === 2 && mine.embeds === 1 && mine.files === 0 && mine.boxEmpty, "posted: confirmed with its picture and GIF as tiles and the video as a player under it, the box empty for the next", mine)
      await press(p, '[data-comment-embed="youtube"] [data-embed-play]')
      await sleep(300)
      expect(!!(await p.$('[data-comment-embed="youtube"] [data-embed-state="playing"] iframe[src*="youtube-nocookie.com"]')), "the video plays inline in the comment (YouTube's privacy player)")
      await p.evaluate(() => [...document.querySelectorAll("[data-comment]")].at(-1).scrollIntoView({ block: "center" }))
      await sleep(250)
      await p.screenshot({ path: join(shots, `${label}-r11-comment-sent.png`), captureBeyondViewport: false })
      await p.evaluate(() => [...document.querySelectorAll("[data-comment]")].at(-1).querySelector('[data-comment-tile="image"]').click())
      await p.waitForSelector("[data-lightbox]", { timeout: 3000 }).catch(() => null)
      expect(!!(await p.$("[data-lightbox]")), "its picture opens the viewer", null)
      await p.keyboard.press("Escape")
      await sleep(500)

      /* Refused by the server (a picture that is not the member's own upload): taken out, what was in the box comes back, the reason said. */
      await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), scope)
      await (await p.$(`${scope} [data-comment-file-input]`)).uploadFile(png)
      await p.waitForFunction((s) => document.querySelectorAll(`${s} [data-comment-pick][data-comment-pick-ready]`).length === 1, { timeout: 6000 }, scope).catch(() => {})
      await p.type(`${scope} textarea`, "not mine")
      const before = await p.evaluate(() => document.querySelectorAll("[data-comment]").length)
      await press(p, `${scope} [data-comment-send]`)
      await sleep(1000)
      const refused = await p.evaluate((s) => ({ rows: document.querySelectorAll("[data-comment]").length, picks: document.querySelectorAll(`${s} [data-comment-pick]`).length, words: document.querySelector(`${s} textarea`).value, toast: [...document.querySelectorAll('[role="status"]')].map((t) => t.textContent).join(" | ") }), scope)
      expect(refused.rows === before && refused.picks === 1 && refused.words === "not mine" && /could not be added/.test(refused.toast), "REFUSED: a picture that is not the member's own is taken back out, the box gets it back, and the reason is said", refused)
      const small = await smallTargets(p, scope)
      if (phone) expect(small.length === 0, "the box's controls are at least 40px tall on a phone", small)
      expect((await sideScroll(p)).scroll <= (phone ? 390 : 1440), "nothing scrolls sideways", await sideScroll(p))
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
        const pad = Number.parseFloat(getComputedStyle(panel).paddingBottom)
        const f = document.activeElement.closest("[data-comment-box]").getBoundingClientRect()
        const sc = panel.querySelector("[data-sheet-scroll]").getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), column: Math.round(b.bottom - pad), box: Math.round(f.bottom), visibleTo: Math.round(sc.bottom) }
      })
      /*
        IMAGE 66. The panel is never lifted off the foot of the screen: its
        content ends on the keyboard and its own white carries on underneath,
        so an inset that is bigger than the keys (Safari counts its floating
        accessory bar as part of the obscured area) costs a strip of the
        sheet rather than a window onto the page. scripts/check-sheet-
        keyboard-gap.mjs measures the strip itself.
      */
      expect(sheet.bottom === 844 && sheet.column === 504 - 12 && sheet.top >= 0 && sheet.box <= sheet.visibleTo, "the post's sheet paints to the foot of the screen with its content on the keyboard and the whole comment box in sight", sheet)
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

    /* ── LIVE (round 10): a post somebody else writes arrives without a refresh ── */
    if (want("live")) {
      const { p, errors, calls, live } = await open("long", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const FEED = "community-live:probe"
      await p.waitForFunction((n) => window.__channels.some((h) => h.type === "broadcast" && h.name === n && !h.gone), { timeout: 4000 }, FEED).catch(() => {})
      const joined = await p.evaluate((n) => window.__channels.filter((h) => h.type === "broadcast" && h.name === n).map((h) => ({ event: h.filter.event, authed: h.authed })), FEED)
      expect(joined.length === 1 && joined[0].event === "post" && joined[0].authed, "LIVE: the feed listens for new posts on the community's own channel, joined as the member", joined)
      const ids = () => p.evaluate(() => [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")))
      const firstBefore = (await ids())[0]
      /* At the top: every frame, where the post that was first is drawn, and how visible the new one is. */
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(200)
      const top0 = await p.evaluate((id) => document.querySelector(`[data-post="${id}"]`).getBoundingClientRect().top, firstBefore)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.evaluate((id) => {
        window.__lf = []
        const loop = (t) => {
          const old = document.querySelector(`[data-post="${id}"]`)
          const neu = document.querySelector('[data-post="p-live-1"]')
          window.__lf.push({ t, top: Math.round(old.getBoundingClientRect().top * 10) / 10, op: neu ? Math.round(Number(getComputedStyle(neu).opacity) * 100) / 100 : null })
          window.__lfr = requestAnimationFrame(loop)
        }
        window.__lfr = requestAnimationFrame(loop)
      }, firstBefore)
      const heard = await p.evaluate((n) => window.__broadcast(n, "post", { postId: "p-live-1", spaceId: "s-general", authorId: "u-leo" }), FEED)
      await sleep(250)
      await shot(p, `${label}-r10-live-arriving`)
      await sleep(1100)
      const lf = await p.evaluate(() => (cancelAnimationFrame(window.__lfr), window.__lf))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const order = await ids()
      const tops = lf.map((f) => f.top)
      const steps = tops.slice(1).map((t, i) => t - tops[i])
      const pushed = tops.at(-1) - top0
      const ops = lf.filter((f) => f.op !== null).map((f) => f.op)
      const gaps = lf.slice(1).map((f, i) => f.t - lf[i].t)
      expect(heard === 1 && calls.some((c) => c.url.endsWith("/posts/p-live-1") && c.method === "GET") && order[0] === "p-live-1" && order[1] === firstBefore, "the broadcast's id is read through the gated route and the post goes to the top", { heard, order: order.slice(0, 3) })
      expect(Math.abs(tops[0] - top0) < 1 && pushed > 100 && steps.every((d) => d >= -0.5) && Math.max(...steps) < pushed * 0.45, "the post that was first never jumps: it starts where it was and slides down to make room, frame by frame (px moved per frame)", { from: top0, to: tops.at(-1), maxStep: Math.round(Math.max(...steps)), frames: steps.filter((d) => d > 0.5).length })
      expect(ops[0] < 0.5 && ops.at(-1) === 1 && ops.every((o, i) => i === 0 || o >= ops[i - 1]), "while the new one fades in", ops.slice(0, 12))
      console.log(`  info  LIVE slide at 4x CPU: longest frame ${Math.round(Math.max(...gaps))}ms, ${gaps.filter((g) => g > 34).length} over 34ms`)
      await shot(p, `${label}-r10-live-arrived`)

      /* Scrolled down: nothing on screen moves, a pill says how many are waiting. */
      await p.evaluate(() => window.scrollTo(0, 1400))
      await sleep(300)
      const anchor = await p.evaluate(() => {
        const el = [...document.querySelectorAll("[data-feed-list] > [data-post]")].find((e) => e.getBoundingClientRect().top > 100)
        return { id: el.getAttribute("data-post"), top: Math.round(el.getBoundingClientRect().top) }
      })
      await p.evaluate((n) => window.__broadcast(n, "post", { postId: "p-live-2", spaceId: "s-general", authorId: "u-leo" }), FEED)
      await sleep(400)
      await p.evaluate((n) => window.__broadcast(n, "post", { postId: "p-live-3", spaceId: "s-general", authorId: "u-leo" }), FEED)
      await sleep(500)
      const away = await p.evaluate((id) => {
        const pill = document.querySelector("[data-feed-new-pill]")
        const r = pill?.getBoundingClientRect()
        return { pill: pill?.textContent.trim() ?? null, pillTop: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null, anchorTop: Math.round(document.querySelector(`[data-post="${id}"]`).getBoundingClientRect().top), first: document.querySelector("[data-feed-list] > [data-post]").getAttribute("data-post"), y: Math.round(scrollY) }
      }, anchor.id)
      await shot(p, `${label}-r10-live-pill`)
      expect(away.pill === "2 new posts" && away.anchorTop === anchor.top && away.first === "p-live-1" && away.y === 1400, "scrolled down, the posts wait under a quiet \"2 new posts\" pill and nothing on screen moves", { ...away, before: anchor.top })
      expect(away.pillTop >= 60 && away.pillTop < 140 && away.h >= 36, "the pill sits just under the community's bar", { top: away.pillTop, h: away.h })
      /* The pill: up smoothly, then they go in. */
      await p.evaluate(() => {
        window.__ys = []
        const loop = () => {
          window.__ys.push(Math.round(scrollY))
          window.__ysr = requestAnimationFrame(loop)
        }
        window.__ysr = requestAnimationFrame(loop)
      })
      await press(p, "[data-feed-new-pill]")
      await sleep(1600)
      const ys = await p.evaluate(() => (cancelAnimationFrame(window.__ysr), window.__ys))
      const back = await p.evaluate(() => ({ order: [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")).slice(0, 4), pill: !!document.querySelector("[data-feed-new-pill]"), y: Math.round(scrollY) }))
      const ysteps = ys.slice(1).map((y, i) => y - ys[i])
      expect(back.order.slice(0, 3).join() === "p-live-3,p-live-2,p-live-1" && !back.pill && back.y < 400, "pressed, the page goes back up and the two posts go in on top, newest first; the pill is gone", back)
      expect(ysteps.filter((d) => d < 0).length >= 4 && Math.min(...ysteps) > -700, "the way up is a smooth scroll over several frames, not a jump", { frames: ysteps.filter((d) => d < 0).length, biggest: Math.min(...ysteps) })
      /* The member's own post on another device is the composer's, never read here. */
      const before = calls.length
      await p.evaluate((n) => window.__broadcast(n, "post", { postId: "p-live-9", spaceId: "s-general", authorId: "u-me" }), FEED)
      await sleep(300)
      expect(!calls.slice(before).some((c) => c.url.endsWith("/posts/p-live-9")), "the member's own post coming back on the channel is skipped")

      /* PULL TO REFRESH: the event's promise is the feed's, settled after the first page is read again. */
      const fixtures = await p.evaluate(() => window.__FEED_POSTS)
      live.feedPage = { pinned: [], posts: [{ ...livePost("p-live-7"), title: "Fresh from the pull" }, ...fixtures], nextCursor: null }
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(200)
      const pull = await p.evaluate(async () => {
        const other = { scope: "somewhere-else" }
        window.dispatchEvent(new CustomEvent("storelib:pull-refresh", { detail: other }))
        const detail = { scope: "community-feed" }
        const t0 = performance.now()
        window.dispatchEvent(new CustomEvent("storelib:pull-refresh", { detail }))
        const isPromise = !!detail.done && typeof detail.done.then === "function"
        let first = null
        await detail.done
        const ms = Math.round(performance.now() - t0)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        first = document.querySelector("[data-feed-list] > [data-post]")?.getAttribute("data-post")
        return { isPromise, otherIgnored: !("done" in other), ms, first }
      })
      expect(pull.isPromise && pull.otherIgnored && live.feedReads === 1 && pull.ms >= 290 && pull.first === "p-live-7", "PULL: storelib:pull-refresh (scope community-feed) gets detail.done, a promise that settles after the first page is read again (the reply takes 300ms), and the list is swapped in place", { ...pull, reads: live.feedReads })
      await shot(p, `${label}-r10-pulled`)
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── TYPING and comments that arrive in an open post ── */
    if (want("typing")) {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const POST = "community-live:probe:p-video"
      await (phone ? p.tap('[data-post="p-video"] [data-post-excerpt]') : p.click('[data-post="p-video"] [data-post-excerpt]'))
      await p.waitForSelector("[data-post-overlay] [data-comments-rows] [data-comment]", { timeout: 5000 }).catch(() => {})
      await p.waitForFunction((n) => window.__channels.filter((h) => h.type === "broadcast" && h.name === n && !h.gone).length >= 2, { timeout: 4000 }, POST).catch(() => {})
      const events = await p.evaluate((n) => window.__channels.filter((h) => h.type === "broadcast" && h.name === n && !h.gone).map((h) => h.filter.event).sort(), POST)
      expect(events.join() === "comment,typing", "TYPING: the open post listens on its own channel for comments and typing", events)
      const rowTop = () => p.evaluate(() => Math.round(document.querySelector("[data-post-overlay] [data-comments-rows] [data-comment]").getBoundingClientRect().top))
      const line = () => p.evaluate(() => {
        const el = document.querySelector("[data-post-overlay] [data-typing]")
        return el ? el.textContent.trim() : null
      })
      const r0 = await rowTop()
      await p.evaluate((n) => window.__broadcast(n, "typing", { userId: "u-leo", on: true }), POST)
      await sleep(300)
      const one = await line()
      const r1 = await rowTop()
      await shot(p, `${label}-r10-typing`)
      expect(one === "Leo Martins is writing..." && r1 === r0, "\"Leo Martins is writing...\" from the commenters already on screen, and nothing under it moves", { line: one, rowTop: [r0, r1] })
      await p.evaluate((n) => window.__broadcast(n, "typing", { userId: "u-zoe", on: true }), POST)
      await sleep(400)
      const two = await line()
      expect(two === "Leo Martins and Zoe Park are writing..." && calls.some((c) => c.url.endsWith("/people/u-zoe/card")) && !calls.some((c) => c.url.endsWith("/people/u-leo/card")), "somebody not on screen is named from the person card, once", two)
      await p.evaluate((n) => window.__broadcast(n, "typing", { userId: "u-leo", on: false }), POST)
      await sleep(300)
      const left = await line()
      expect(left === "Zoe Park is writing...", "stopping takes them off at once", left)
      await sleep(5200)
      const gone = await line()
      expect(gone === null && (await rowTop()) === r0, "and a writer who goes quiet is gone after a few seconds", gone)

      /* The member's own typing: said once for a burst of keys, then stopped when sent. */
      const box = "[data-post-overlay] [data-comment-box=comment] textarea"
      await (phone ? p.tap(box) : p.click(box))
      await p.evaluate(() => (window.__sent = []))
      await p.keyboard.type("Thanks for posting this", { delay: 35 })
      const said = await p.evaluate(() => window.__sent.filter((m) => m.event === "typing").map((m) => ({ name: m.name, on: m.payload.on, user: m.payload.userId })))
      expect(said.length === 1 && said[0].on === true && said[0].user === "u-me" && said[0].name === "community-live:probe:p-video", "the member's own typing is said once for a burst of keys (at most every 2s), as an id only", said)

      /* Their comment lands: a rise and a fade at the end, frame by frame. */
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.evaluate(() => {
        window.__cl = []
        const loop = () => {
          const el = document.querySelector("[data-post-overlay] [data-comment-sending]") ?? document.querySelector('[data-post-overlay] [data-comment="c-new-1"]')
          if (el) {
            const st = getComputedStyle(el)
            window.__cl.push({ op: Math.round(Number(st.opacity) * 100) / 100, y: st.translate === "none" ? 0 : Math.round(parseFloat(st.translate.split(" ")[1] || "0") * 10) / 10 })
          }
          window.__clr = requestAnimationFrame(loop)
        }
        window.__clr = requestAnimationFrame(loop)
      })
      await (phone ? p.tap("[data-post-overlay] [data-comment-send]") : p.click("[data-post-overlay] [data-comment-send]"))
      await sleep(1000)
      const mine = await p.evaluate(() => (cancelAnimationFrame(window.__clr), window.__cl))
      const stop = await p.evaluate(() => window.__sent.filter((m) => m.event === "typing").map((m) => m.payload.on))
      expect(mine.length > 4 && mine[0].op < 0.3 && mine[0].y > 4 && mine.at(-1).op === 1 && mine.at(-1).y === 0, "ARRIVAL: the member's comment lands, rising into place as it fades in, then confirmed at full strength (first frames)", mine.slice(0, 8))
      expect(stop.at(-1) === false, "sending says the typing stopped", stop)

      /* Somebody else's comment by id, read through the gate, landing the same way; the count moves. */
      const count0 = await p.evaluate(() => document.querySelector('[data-post="p-video"] [data-comment-button] span')?.textContent)
      await p.evaluate(() => {
        window.__cl = []
        const loop = () => {
          const el = document.querySelector('[data-post-overlay] [data-comment="c-live-1"]')
          if (el) {
            const st = getComputedStyle(el)
            window.__cl.push({ op: Math.round(Number(st.opacity) * 100) / 100, y: st.translate === "none" ? 0 : Math.round(parseFloat(st.translate.split(" ")[1] || "0") * 10) / 10 })
          }
          window.__clr = requestAnimationFrame(loop)
        }
        window.__clr = requestAnimationFrame(loop)
      })
      await p.evaluate((n) => window.__broadcast(n, "typing", { userId: "u-leo", on: true }), POST)
      await sleep(150)
      await p.evaluate((n) => window.__broadcast(n, "comment", { commentId: "c-live-1", postId: "p-video", parentId: null, authorId: "u-leo" }), POST)
      await sleep(900)
      const theirs = await p.evaluate(() => (cancelAnimationFrame(window.__clr), window.__cl))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const after = await p.evaluate(() => ({ last: [...document.querySelectorAll("[data-post-overlay] [data-comments-rows] > li > [data-comment]")].map((e) => e.getAttribute("data-comment")).at(-1), typing: !!document.querySelector("[data-post-overlay] [data-typing]"), count: document.querySelector('[data-post="p-video"] [data-comment-button] span')?.textContent }))
      expect(calls.some((c) => c.url.endsWith("/comments/c-live-1") && c.method === "GET") && after.last === "c-live-1" && Number(after.count) === Number(count0) + 1, "a comment somebody else sent arrives by id, read through the gate, at the end, and the post's count moves", { ...after, before: count0 })
      expect(theirs[0]?.op < 0.3 && theirs.at(-1)?.op === 1 && theirs.at(-1)?.y === 0, "it lands with the same rise and fade", theirs.slice(0, 8))
      expect(!after.typing, "and their \"is writing...\" ends with it", after.typing)
      await shot(p, `${label}-r10-comment-landed`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── HEART: like taps at 4x CPU ── */
    if (want("heart")) {
      const { p, errors, live } = await open("feed", "/community/studio-notes", vp, { likeBase: 24, wait: 200 })
      const cdp = await p.target().createCDPSession()
      const LIKE = '[data-post="p-text"] [data-like]'
      await p.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), LIKE)
      await sleep(300)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.evaluate((sel) => {
        const b = document.querySelector(sel)
        window.__hf = []
        window.__changes = 0
        new MutationObserver((ms) => ms.forEach((m) => m.attributeName === "aria-pressed" && window.__changes++)).observe(b, { attributes: true })
        /* Round 11: every burst, when it came and went, what the button said then, and what its tiny hearts animate. */
        window.__bursts = []
        new MutationObserver((ms) => {
          for (const m of ms) {
            for (const n of m.addedNodes) {
              if (!(n instanceof Element) || !n.hasAttribute("data-heart-burst")) continue
              const parts = [...n.querySelectorAll("[data-heart-particle]")]
              const props = new Set()
              let longest = 0
              for (const el of parts)
                for (const a of el.getAnimations()) {
                  for (const k of a.effect.getKeyframes()) Object.keys(k).forEach((key) => !["offset", "easing", "composite", "computedOffset"].includes(key) && props.add(key))
                  const t = a.effect.getComputedTiming()
                  longest = Math.max(longest, t.endTime)
                }
              window.__bursts.push({ at: performance.now(), on: b.getAttribute("aria-pressed"), particles: parts.length, props: [...props], longest, node: n })
            }
            for (const n of m.removedNodes) {
              const rec = window.__bursts.find((x) => x.node === n)
              if (rec) rec.gone = performance.now()
            }
          }
        }).observe(document.body, { childList: true })
        const loop = (t) => {
          const r = b.getBoundingClientRect()
          const heart = b.querySelector("[data-heart]")
          const fill = b.querySelector("[data-heart-fill]")
          const hs = getComputedStyle(heart)
          const fs = getComputedStyle(fill)
          window.__hf.push({ t, box: `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`, boxScale: getComputedStyle(b).scale, heart: hs.scale === "none" ? 1 : Number(hs.scale), fill: fs.scale === "none" ? 1 : Number(fs.scale), fillOp: Number(fs.opacity), on: b.getAttribute("aria-pressed"), count: b.querySelector("[data-like-count]").textContent, size: Math.round(heart.getBoundingClientRect().width) })
          window.__hfr = requestAnimationFrame(loop)
        }
        window.__hfr = requestAnimationFrame(loop)
      }, LIKE)
      const taps = 5
      for (let i = 0; i < taps; i++) {
        if (phone) await p.tap(LIKE)
        else await p.click(LIKE)
        await sleep(450)
      }
      await sleep(500)
      const hf = await p.evaluate(() => (cancelAnimationFrame(window.__hfr), { frames: window.__hf, changes: window.__changes, bursts: window.__bursts.map(({ node, ...b }) => ({ ...b, life: b.gone ? Math.round(b.gone - b.at) : null })) }))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const fr = hf.frames
      const boxes = new Set(fr.map((f) => f.box))
      const boxScales = new Set(fr.map((f) => f.boxScale))
      const counts = new Set(fr.map((f) => f.count))
      const beat = Math.max(...fr.map((f) => f.heart))
      /* The fill growing in: the frames between the press and full, with a value in between. */
      const firstOn = fr.findIndex((f) => f.on === "true")
      const fillRun = fr.slice(firstOn, firstOn + 20).map((f) => Math.round(f.fill * 100) / 100)
      const between = fillRun.filter((v) => v > 0.45 && v < 0.98).length
      const gaps = fr.slice(1).map((f, i) => f.t - fr[i].t)
      expect(hf.changes === taps, "HEART: at 4x CPU, five taps are five changes of the like, no more, no less", hf.changes)
      expect(boxes.size === 1 && [...boxScales].every((v) => v === "none" || v === "1"), "the button box never moves or scales: only the icon does", { boxes: [...boxes], scales: [...boxScales] })
      expect(beat > 1.1 && between >= 2, "the heart fills over several frames (the fill's scale on the frames after the tap) and gives a beat", { beat, fillRun: fillRun.slice(0, 12) })
      expect([...counts].every((c) => c === "24" || c === "25"), "the count only ever shows 24 or 25", [...counts])
      expect(fr[0].size === 20, "the heart is 20px (a little bigger than the 18px icons beside it)", fr[0].size)
      console.log(`  info  HEART at 4x CPU: longest frame ${Math.round(Math.max(...gaps))}ms, ${gaps.filter((g) => g > 34).length} over 34ms, requests ${live.sent.length}`)
      /* Round 11: five taps are three likes and two unlikes. */
      const bursts = hf.bursts
      expect(bursts.length === 3 && bursts.every((b) => b.on === "true"), "BURST: one burst per like (three likes in five taps), none on an unlike", bursts.map((b) => b.on))
      expect(bursts.every((b) => b.particles >= 6 && b.particles <= 10), "each burst is 6 to 10 tiny hearts", bursts.map((b) => b.particles))
      expect(bursts.every((b) => b.props.length && b.props.every((k) => ["translate", "scale", "rotate", "opacity"].includes(k))), "the tiny hearts animate translate, scale, rotate and opacity only (the compositor's)", [...new Set(bursts.flatMap((b) => b.props))])
      expect(bursts.every((b) => b.longest > 0 && b.longest < 500), "every burst is done within 500ms", bursts.map((b) => Math.round(b.longest)))
      /* Taken out of the page once done: within 500ms and a few 4x frames (or when the unlike tap came first). */
      expect(bursts.every((b) => b.life !== null && b.life < 700), "and taken out of the page after (at 4x CPU, its life in ms)", bursts.map((b) => b.life))
      await shot(p, `${label}-r10-heart`)
      /* The burst in the middle of its flight, close up: unlike, then like, and a picture 130ms in. */
      await p.evaluate((sel) => document.querySelector(sel).click(), LIKE)
      await sleep(400)
      const hb = await p.evaluate((sel) => {
        const r = document.querySelector(sel).querySelector("[data-heart]").getBoundingClientRect()
        return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY }
      }, LIKE)
      await p.evaluate((sel) => document.querySelector(sel).click(), LIKE)
      await sleep(60)
      /* Held 150ms into its flight (a screenshot takes longer than the burst lasts), then let go. */
      const held = await p.evaluate((sel) => {
        const all = [...document.querySelector(sel).querySelector("[data-heart]").getAnimations({ subtree: true }), ...[...document.querySelectorAll("[data-heart-burst]")].flatMap((l) => l.getAnimations({ subtree: true }))]
        for (const a of all) {
          a.pause()
          a.currentTime = 150
        }
        return all.length
      }, LIKE)
      expect(held >= 8, "the burst can be held mid flight for its picture", held)
      await p.screenshot({ path: join(shots, `${label}-r11-heart-burst.png`), captureBeyondViewport: false, clip: { x: Math.max(0, hb.x - 60), y: Math.max(0, hb.y - 45), width: 160, height: 90 } })
      await p.evaluate(() => document.getAnimations().forEach((a) => a.playState === "paused" && a.play()))
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── KBDOCK: the phone editor's toolbar on a keyboard opening and closing, every frame ── */
    if (want("kbdock") && phone) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      await p.tap("[data-composer-open]")
      await sleep(700)
      await p.tap("[data-composer-title]")
      await p.keyboard.type("Keyboard test")
      await p.evaluate(() => document.activeElement.blur())
      await sleep(200)
      /*
        A keyboard as iOS moves one: 340px tall, sliding over 250ms on an
        ease out. Opening, Safari reports the new visual viewport as it
        starts; closing, only once it has gone (viewport-vars.tsx). Each
        frame: where the toolbar's bottom edge is drawn, and where the
        keyboard's top is: a positive gap is an empty strip between them,
        a negative one is the toolbar under the keys.
      */
      await p.evaluate(() => {
        const vv = window.visualViewport
        const H = innerHeight
        const K = 340
        window.__kb = { top: H, from: H, to: H, t0: 0 }
        const ease = (x) => 1 - Math.pow(1 - x, 3)
        const report = (h) => {
          Object.defineProperty(vv, "height", { configurable: true, get: () => h })
          Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => 0 })
          vv.dispatchEvent(new Event("resize"))
          vv.dispatchEvent(new Event("scroll"))
        }
        window.__kbMove = (open) => {
          window.__kb = { from: window.__kb.top, to: open ? H - K : H, t0: performance.now(), top: window.__kb.top }
          if (open) setTimeout(() => report(H - K), 16)
          else setTimeout(() => report(H), 260)
        }
        /* The keyboard comes up as a field that types takes focus, and goes down as focus leaves to something that does not, as the OS does. */
        const types = (el) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|url)$/.test(el.type || "text")))
        window.__kbOpen = false
        document.addEventListener("focusin", (e) => {
          if (!types(e.target) || window.__kbOpen) return
          window.__kbOpen = true
          window.__kbMove(true)
        })
        document.addEventListener("focusout", () =>
          requestAnimationFrame(() => {
            if (types(document.activeElement) || !window.__kbOpen) return
            window.__kbOpen = false
            window.__kbMove(false)
          }),
        )
        window.__dock = []
        const loop = (t) => {
          const k = window.__kb
          const x = Math.min(1, Math.max(0, (t - k.t0) / 250))
          k.top = k.from + (k.to - k.from) * ease(x)
          const bar = document.querySelector("[data-composer-toolbar]")
          if (bar) window.__dock.push({ t, kb: Math.round(k.top), bottom: Math.round(bar.getBoundingClientRect().bottom), top: Math.round(bar.getBoundingClientRect().top), moving: x > 0 && x < 1 })
          window.__dockr = requestAnimationFrame(loop)
        }
        window.__dockr = requestAnimationFrame(loop)
      })
      const cycles = []
      for (let i = 0; i < 4; i++) {
        await p.evaluate(() => (window.__dock = []))
        await p.tap(i % 2 ? '[aria-label="Post"]' : "[data-composer-title]")
        await sleep(600)
        const up = await p.evaluate(() => window.__dock.splice(0))
        if (i === 1) await shot(p, `${label}-r10-kbdock-up`)
        /* A press on the screen's own title, which takes no keys: the field lets go and the keyboard goes down. */
        await p.tap('[data-composer="sheet"] span.truncate')
        await sleep(160)
        if (i === 1) await shot(p, `${label}-r10-kbdock-closing`)
        await sleep(500)
        const down = await p.evaluate(() => window.__dock.splice(0))
        const judge = (fr) => {
          /* From the keyboard's first move until 400ms after it stopped. */
          const start = fr.findIndex((f) => f.moving)
          const run = fr.slice(start, start + 40)
          const gap = run.map((f) => f.kb - f.bottom)
          const tops = run.map((f) => f.top)
          const dir = tops.slice(1).map((t, j) => Math.sign(t - tops[j])).filter(Boolean)
          const flips = dir.slice(1).filter((d, j) => d !== dir[j]).length
          const jump = Math.max(0, ...tops.slice(1).map((t, j) => Math.abs(t - tops[j])))
          return { strip: Math.max(0, ...gap), under: Math.max(0, ...gap.map((g) => -g)), flips, jump, end: run.at(-1)?.kb - run.at(-1)?.bottom }
        }
        cycles.push({ open: judge(up), close: judge(down) })
      }
      const worst = (k, w) => Math.max(...cycles.map((c) => c[k][w]))
      console.log(`  info  KBDOCK per cycle: ${JSON.stringify(cycles)}`)
      expect(cycles.every((c) => c.open.end === 0 && c.close.end === 0), "KBDOCK: after every open and close the toolbar sits exactly on the keyboard (or the screen's bottom)", cycles.map((c) => [c.open.end, c.close.end]))
      expect(worst("open", "flips") === 0 && worst("close", "flips") === 0, "the toolbar only ever moves one way while the keyboard moves (no flicker back)", cycles.map((c) => [c.open.flips, c.close.flips]))
      expect(worst("close", "strip") <= 40 && worst("open", "strip") <= 40, "no empty strip between the toolbar and the keyboard as it opens and closes (largest gap, px)", { open: worst("open", "strip"), close: worst("close", "strip") })
      /*
        Hidden under the rising keys: the very first keyboard is only known once it reports (a frame or two after it starts); from then on its
        height is remembered and the toolbar rises with it from the same frame.
      */
      const later = cycles.slice(1)
      expect(Math.max(...later.map((c) => c.open.under)) <= 60 && worst("close", "under") <= 60 && cycles[0].open.under <= 160, "the toolbar is never hidden under the keys by more than a sliver once the keyboard's height is known (the first one a frame or two behind its report)", { first: cycles[0].open.under, later: later.map((c) => c.open.under), close: worst("close", "under") })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── FINISH: Post, its sent state, the editor closing, the post arriving ── */
    if (want("finish")) {
      /* A computer writes in the long feed, so the page is tall enough to have been scrolled down while writing. */
      const { p, errors } = await open(phone ? "feed" : "long", "/community/studio-notes", vp)
      await (phone ? p.tap("[data-composer-open]") : p.click("[data-composer-open]"))
      await sleep(600)
      await p.type("[data-composer-title]", "Notes from Thursday")
      await p.type('[aria-label="Post"]', Array.from({ length: phone ? 2 : 8 }, (_, i) => `Line ${i + 1}: what we covered and what is next.`).join("\n"))
      await p.click("[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      /* On a computer, scrolled down while writing: the editor's top (where the post will land) is above the bar. */
      if (!phone) {
        await p.evaluate(() => {
          const b = document.querySelector("[data-composer-post]").getBoundingClientRect()
          window.scrollBy(0, b.top - 120)
        })
        await sleep(300)
      }
      const y0 = await p.evaluate(() => Math.round(scrollY))
      const w0 = await p.$eval("[data-composer-post]", (b) => Math.round(b.getBoundingClientRect().width))
      await p.evaluate(() => {
        window.__ff = []
        const loop = (t) => {
          const b = document.querySelector("[data-composer-post]")
          const neu = document.querySelector('[data-feed-list] > [data-post="p-new"]')
          const next = neu?.nextElementSibling
          const st = next ? getComputedStyle(next).translate : "none"
          window.__ff.push({ t, state: b?.getAttribute("data-post-state") ?? null, w: b ? Math.round(b.getBoundingClientRect().width) : null, y: Math.round(scrollY), neu: !!neu, op: neu ? Math.round(Number(getComputedStyle(neu).opacity) * 100) / 100 : null, hl: !!neu?.querySelector("[data-post-highlight]"), nextY: st === "none" ? 0 : Math.round(parseFloat(st.split(" ")[1] || "0")) })
          window.__ffr = requestAnimationFrame(loop)
        }
        window.__ffr = requestAnimationFrame(loop)
      })
      await (phone ? p.tap("[data-composer-post]") : p.click("[data-composer-post]"))
      await sleep(120)
      await shot(p, `${label}-r10-finish-sent`)
      await sleep(700)
      await shot(p, `${label}-r10-finish-arrived`)
      await sleep(1400)
      const ff = await p.evaluate(() => (cancelAnimationFrame(window.__ffr), window.__ff))
      const states = ff.map((f) => f.state).filter((s, i, a) => s && s !== a[i - 1])
      const widths = new Set(ff.filter((f) => f.w).map((f) => f.w))
      const arrived = ff.findIndex((f) => f.neu)
      const nextYs = ff.slice(arrived).map((f) => f.nextY)
      const ys = ff.map((f) => f.y)
      const ysteps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]))
      const end = await p.evaluate(() => {
        const el = document.querySelector('[data-feed-list] > [data-post="p-new"]')
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), order: [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")).slice(0, 2), editor: !!document.querySelector("[data-composer=open], [data-composer=sheet]"), highlight: !!el.querySelector("[data-post-highlight]") }
      })
      expect(states.join() === "idle,busy,sent", "FINISH: Post shows a spinner while asked, then a check", states)
      expect(widths.size === 1 && [...widths][0] === w0, "at one width throughout (the faces crossfade)", [...widths])
      expect(!end.editor && end.order[phone ? 1 : 0] === "p-new", phone ? "the editor closes, then the post is first under the pinned one" : "the editor closes, then the post is first", end)
      expect(ff.slice(arrived, arrived + 30).some((f) => f.hl) && !end.highlight, "it arrives with a warm highlight that fades away", { highlighted: ff.filter((f) => f.hl).length })
      expect(nextYs[0] < -60 && nextYs.every((v, i) => i === 0 || v >= nextYs[i - 1]) && nextYs.at(-1) === 0, "the posts under it slide down to make room (their offset rising to 0)", nextYs.slice(0, 10))
      expect(end.top >= 60 && end.top < 844 * 0.6, "and it ends in sight, under the bar", end.top)
      if (!phone) expect(ys.at(-1) < y0 && ysteps.filter((d) => d > 0).length >= 4 && Math.max(...ysteps) < 300, "scrolled away, the page scrolls smoothly up to it (several frames, none a jump)", { from: y0, to: ys.at(-1), frames: ysteps.filter((d) => d > 0).length, biggest: Math.max(...ysteps) })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ══ ROUND 12 (P) ═══════════════════════════════════════════════ */

    /* ── R12 CARD: two or more pictures under the words on a computer too ── */
    if (want("r12card")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const c = await p.evaluate(() => {
        const card = document.querySelector('[data-post="p-intro"]')
        const m = card.querySelector('[data-card-media="pair"]')
        const ex = card.querySelector("[data-post-excerpt]")
        const r = (e) => e.getBoundingClientRect()
        if (!m) return null
        const tiles = [...m.querySelectorAll("[data-card-media-tile]")].map((t) => ({ w: Math.round(r(t).width), h: Math.round(r(t).height) }))
        return { w: Math.round(r(m).width), cardW: Math.round(r(card).width), inside: r(m).left >= r(card).left && r(m).right <= r(card).right, below: r(m).top >= r(ex).bottom - 1, tiles, more: m.querySelector("[data-card-media-more]")?.textContent ?? null, thumb: !!card.querySelector("[data-post-thumb]") }
      })
      expect(!!c && c.inside && c.below && !c.thumb, "R12 CARD: a post with several pictures shows them inside the card, under its words, no right thumbnail", c)
      if (!phone) expect(!!c && c.tiles.length === 2 && c.tiles.every((t) => Math.abs(t.w / t.h - 4 / 3) < 0.03) && c.w > 500, "on a computer: two side by side at 4:3 across the card", c?.tiles)
      expect(c?.more === "+2", "the second says how many more", c?.more)
      const one = await p.evaluate(() => ({ thumb: !!document.querySelector('[data-post="p-gif"] [data-post-thumb]'), under: getComputedStyle(document.querySelector('[data-post="p-gif"] [data-card-media]')).display }))
      if (!phone) expect(one.thumb && one.under === "none", "a post with one picture keeps its thumbnail on the right", one)
      await (await p.$('[data-post="p-intro"]')).screenshot({ path: join(shots, `${label}-r12-card-pair.png`) })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R12 GIF: GIFs play in the feed and the opened post, rest when off screen ── */
    if (want("r12gif")) {
      const { p, errors } = await open("long", "/community/studio-notes", vp)
      /* Each card draws its GIF twice (the right thumbnail for a computer, the pictures under the words for a phone), one of them hidden: only the one drawn counts. Where it is comes from its card (a card off screen is not laid out). */
      const read = () => p.evaluate(() => [...document.querySelectorAll("[data-gif-state]")].filter((g) => getComputedStyle(g.closest("[data-post-thumb], [data-card-media]") ?? g).display !== "none").map((g) => {
        const r = (g.closest("[data-post]") ?? g).getBoundingClientRect()
        return { state: g.getAttribute("data-gif-state"), on: r.bottom > -120 && r.top < innerHeight + 120, post: g.closest("[data-post]")?.getAttribute("data-post") }
      }))
      await sleep(400)
      const top = await read()
      const shownTop = top.filter((g) => g.on)
      expect(shownTop.length >= 1 && shownTop.every((g) => g.state === "playing"), "R12 GIF: a GIF in sight in the feed plays (its moving picture in the box)", shownTop)
      expect(top.filter((g) => !g.on).every((g) => g.state === "paused"), "one far below rests on its still", top.filter((g) => !g.on).length)
      const gifPost = await p.evaluate(() => document.querySelector('[data-post="p-gif"] [data-gif-state]')?.getAttribute("src")?.slice(0, 60))
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(500)
      const bottom = await read()
      const firstNow = bottom.find((g) => g.post === "p-gif")
      expect(firstNow && !firstNow.on && firstNow.state === "paused", "scrolled away, the first one is paused (its still)", firstNow)
      expect(bottom.filter((g) => g.on).every((g) => g.state === "playing"), "and the ones now in sight play", bottom.filter((g) => g.on).length)
      expect(!!gifPost, "the moving picture is a real address", gifPost)
      await p.close()
      const m = await open("media", "/community/studio-notes/post/m-many?post=m-many", vp)
      await sleep(400)
      const tile = await m.p.evaluate(() => document.querySelector('[data-media-tile="gif"] [data-gif-state]')?.getAttribute("data-gif-state"))
      await m.p.evaluate(() => document.querySelector('[data-media-tile="gif"]')?.scrollIntoView({ block: "center" }))
      await sleep(300)
      const tile2 = await m.p.evaluate(() => document.querySelector('[data-media-tile="gif"] [data-gif-state]')?.getAttribute("data-gif-state"))
      expect(tile2 === "playing", "in the opened post the GIF plays too", [tile, tile2])
      await m.p.close()
      const rm = await open("long", "/community/studio-notes", vp, { reduced: true })
      await sleep(400)
      const still = await rm.p.evaluate(() => [...document.querySelectorAll("[data-gif-state]")].map((g) => g.getAttribute("data-gif-state")))
      expect(still.length > 0 && still.every((x) => x === "paused"), "with reduced motion every GIF stays on its still", still.length)
      await rm.p.close()
      expect(errors.length === 0, "no page error", errors)
    }

    /* ── R12 SOUND: like and unlike, a tiny Web Audio sound ── */
    if (want("r12sound")) {
      const fakeAudio = () => {
        window.__tones = []
        window.__ctx = 0
        class Param {
          constructor(host, key) { this.host = host; this.key = key }
          setValueAtTime(v) { this.host[this.key] = Math.max(this.host[this.key] || 0, v) }
          exponentialRampToValueAtTime(v) { this.host[this.key] = Math.max(this.host[this.key] || 0, v) }
        }
        class Ctx {
          constructor() { window.__ctx++; this.state = "running"; this.currentTime = 0; this.destination = {} }
          createOscillator() {
            const o = { type: "sine", connect(g) { o.gain = g }, disconnect() {}, stop() {}, start() { window.__tones.push({ at: performance.now(), peak: o.gain?.peak ?? 0, hz: o.hz }) } }
            o.frequency = new Param(o, "hz")
            return o
          }
          createGain() { const g = { connect() {}, disconnect() {} }; g.gain = new Param(g, "peak"); return g }
          resume() { return Promise.resolve() }
        }
        window.AudioContext = Ctx
      }
      const sounds = async (p) => p.evaluate(() => {
        const t = window.__tones.slice()
        window.__tones = []
        const groups = []
        for (const x of t) if (!groups.length || x.at - groups.at(-1).at > 30) groups.push({ at: x.at, peak: x.peak, n: 1 })
        else { groups.at(-1).n++; groups.at(-1).peak = Math.max(groups.at(-1).peak, x.peak) }
        return groups.map((g) => ({ n: g.n, peak: Math.round(g.peak * 1000) / 1000 }))
      })
      const { p, errors } = await open("feed", "/community/studio-notes", vp, { before: fakeAudio })
      const like = '[data-post="p-text"] [data-like]'
      await press(p, like)
      await sleep(250)
      const a = await sounds(p)
      await press(p, like)
      await sleep(250)
      const b = await sounds(p)
      expect(a.length === 1 && a[0].peak > 0 && a[0].peak <= 0.06, "R12 SOUND: a like plays one tiny sound (quiet)", a)
      expect(b.length === 1 && b[0].peak > 0 && b[0].peak < a[0]?.peak, "an unlike plays one, softer", b)
      await p.evaluate(() => localStorage.setItem("storelib:sounds", "off"))
      await press(p, like)
      await sleep(250)
      const c = await sounds(p)
      expect(c.length === 0, "with Sounds off nothing plays", c)
      await p.evaluate(() => localStorage.removeItem("storelib:sounds"))
      expect(errors.length === 0, "no page error", errors)
      await p.close()
      const r = await open("feed", "/community/studio-notes", vp, { before: fakeAudio, reduced: true })
      await press(r.p, like)
      await sleep(250)
      const d = await sounds(r.p)
      expect(d.length === 0, "with reduced motion nothing plays", d)
      await r.p.close()
    }

    /* ── R12 REPORT: the report sheet / dialog, the toast, the POST ── */
    if (want("r12report")) {
      const { p, errors, live } = await open("feed", "/community/studio-notes", vp)
      await press(p, '[data-post="p-text"] [aria-label="More"]')
      await sleep(450)
      const item = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "Report post"))
      await item.asElement()?.click()
      const box = phone ? "[data-report-sheet]" : "[data-report-dialog]"
      /* The way in, frame by frame: its opacity and place, so it is seen to arrive rather than appear. */
      await p.evaluate((sel) => {
        window.__rp = []
        const loop = () => {
          const el = document.querySelector(sel)
          const panel = el?.closest("[data-sheet-panel], [role=dialog]") ?? el
          if (panel) {
            const r = panel.getBoundingClientRect()
            window.__rp.push({ op: Number(getComputedStyle(panel).opacity), top: Math.round(r.top), bottom: Math.round(r.bottom) })
          }
          window.__rpr = requestAnimationFrame(loop)
        }
        window.__rpr = requestAnimationFrame(loop)
      }, box)
      await sleep(700)
      const arrive = await p.evaluate(() => (cancelAnimationFrame(window.__rpr), window.__rp))
      const shown = await p.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const panel = el.closest("[data-sheet-panel], [role=dialog]") ?? el
        const r = panel.getBoundingClientRect()
        return { reasons: el.querySelectorAll("[data-report-reason]").length, send: document.querySelector("[data-report-send]")?.disabled, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), title: panel.textContent.slice(0, 20) }
      }, box)
      expect(!!shown && shown.reasons === 6 && shown.send === true, phone ? "R12 REPORT: a Storelib sheet with the reasons, Send waits for one" : "R12 REPORT: a small dialog with the reasons, Send waits for one", shown)
      expect(!!shown && shown.top >= 0 && shown.bottom <= vp.height + 1 && shown.left >= 0 && shown.right <= vp.width, "whole on screen", shown)
      const tops = arrive.map((f) => f.top)
      const ops = arrive.map((f) => f.op)
      expect(phone ? tops.length > 3 && tops[0] > tops.at(-1) + 40 : ops.length > 3 && ops[0] < 0.9 && ops.at(-1) === 1, phone ? "it slides up (not a jump)" : "it fades and settles in (not a jump)", phone ? tops.slice(0, 8) : ops.slice(0, 8))
      await sleep(600)
      /* Nothing of the page shows through it: what is drawn at points across it is the sheet or the dialog, each layer up to the top fully opaque. */
      const solid = await p.evaluate((sel) => {
        const el = document.querySelector(sel)
        const panel = el.closest("[data-sheet-panel], [role=dialog]") ?? el
        const r = panel.getBoundingClientRect()
        const pts = [0.2, 0.5, 0.8].flatMap((fx) => [0.3, 0.6, 0.9].map((fy) => [r.left + r.width * fx, r.top + r.height * fy]))
        const hits = pts.map(([x, y]) => panel.contains(document.elementFromPoint(x, y)))
        let op = 1
        for (let n = panel; n && n !== document.documentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
        return { inside: hits.every(Boolean), opacity: Math.round(op * 1000) / 1000 }
      }, box)
      expect(solid.inside && solid.opacity >= 0.99, "it is solid: nothing of the page is drawn over it or shows through", solid)
      await sleep(1200)
      await shot(p, `${label}-r12-report`)
      await press(p, '[data-report-reason="spam"]')
      await p.type("[data-report-note]", "Same link posted in five spaces")
      await press(p, "[data-report-send]")
      await sleep(900)
      const after = await p.evaluate((sel) => ({ open: !!document.querySelector(sel), toast: document.querySelector("[data-community-toast]")?.textContent ?? null }), box)
      const sent = live.reports?.at(-1)
      expect(sent?.targetType === "post" && sent?.targetId === "p-text" && sent?.reason === "spam" && /five spaces/.test(sent?.note ?? ""), "the report is sent to the community's report route (into the moderators' queue)", sent)
      expect(!after.open && after.toast === "Thanks. The moderators will take a look.", "it closes and a toast thanks the member", after)
      await shot(p, `${label}-r12-report-sent`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R12 POPOVERS: always whole inside the window ── */
    if (want("r12pop")) {
      const zooms = phone ? [["100", vp]] : [["100", vp], ["125", { width: 1152, height: 720, deviceScaleFactor: 1.25 }], ["80", { width: 1800, height: 1125, deviceScaleFactor: 0.8 }]]
      for (const [zoom, zvp] of zooms) {
        const { p, errors } = await open("long", "/community/studio-notes", zvp)
        /* Room above the feed, so the composer can be put at the bottom of the window as well as the top. */
        await p.evaluate(() => (document.getElementById("app").style.paddingTop = "1400px"))
        await press(p, "[data-composer-open]")
        await sleep(700)
        const results = []
        const place = async (where) => {
          await p.evaluate((where) => {
            const tb = document.querySelector('[data-composer-tools], [data-composer-toolbar]').getBoundingClientRect()
            const want = where === "top" ? 70 : innerHeight - 60
            window.scrollBy(0, tb.top - want)
          }, where)
          await sleep(200)
        }
        const measure = (sel) => p.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const panel = el.closest("[data-sheet-panel]") ?? el
          const r = panel.getBoundingClientRect()
          return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, scrolls: el.querySelector("[data-gif-results], [data-emoji-panel] .overflow-y-auto") ? true : null }
        }, sel)
        const inside = (m) => !!m && m.top >= -0.5 && m.left >= -0.5 && m.bottom <= m.vh + 0.5 && m.right <= m.vw + 0.5
        for (const where of phone ? ["top"] : ["top", "bottom"]) {
          if (!phone) await place(where)
          if (!phone) {
            await press(p, '[data-composer-tool="emoji"] [data-emoji-trigger]')
            await sleep(400)
            const e = await measure(phone ? "[data-emoji-panel]" : "[data-emoji-popover]")
            results.push(["emoji", where, e])
            await p.keyboard.press("Escape")
            await sleep(300)
            await press(p, "[data-composer-gif]")
            await sleep(500)
            const g = await measure("[data-gif-popover]")
            results.push(["gif", where, g])
            await p.keyboard.press("Escape")
            await sleep(300)
            await press(p, "[data-composer-space]")
            await sleep(400)
            const sp = await measure('[role="menu"]')
            results.push(["space", where, sp])
            await p.keyboard.press("Escape")
            await sleep(300)
            if (where === "top" && zoom === "100") await (async () => {
              await press(p, "[data-composer-gif]")
              await sleep(500)
              await shot(p, `${label}-r12-pop-gif-top`)
              await p.keyboard.press("Escape")
              await sleep(300)
              await press(p, '[data-composer-tool="emoji"] [data-emoji-trigger]')
              await sleep(400)
              await shot(p, `${label}-r12-pop-emoji-top`)
              await p.keyboard.press("Escape")
              await sleep(300)
            })()
            if (where === "bottom" && zoom === "125") await (async () => {
              await press(p, "[data-composer-gif]")
              await sleep(500)
              await shot(p, `${label}-r12-pop-gif-bottom-125`)
              await p.keyboard.press("Escape")
              await sleep(300)
            })()
          } else {
            await press(p, '[data-composer-tool="emoji"] [data-emoji-trigger]')
            await sleep(700)
            results.push(["emoji sheet", where, await measure("[data-emoji-panel]")])
            await shot(p, `${label}-r12-pop-emoji-sheet`)
            await p.keyboard.press("Escape")
            await sleep(500)
            await press(p, "[data-composer-gif]")
            await sleep(700)
            results.push(["gif sheet", where, await measure("[data-gif-results]")])
            await shot(p, `${label}-r12-pop-gif-sheet`)
            await p.keyboard.press("Escape")
            await sleep(500)
          }
        }
        for (const [what, where, m] of results) {
          const max = what === "gif" ? { w: 340, h: 380 } : what === "emoji" ? { w: 320, h: 340 } : null
          expect(inside(m) && (!max || (m.w <= max.w + 1 && m.h <= max.h + 1)), `R12 POPOVERS ${zoom}%: the ${what} ${phone ? "" : "popover "}with the composer at the ${where} of the window is whole inside it${max ? `, at most ${max.w}x${max.h}` : ""}`, m)
        }
        expect(errors.length === 0, "no page error", errors)
        await p.close()
      }
      /* The comment box's emoji and GIF, the box near the top and near the bottom of the window. */
      const { p, errors } = await open("post", "/community/studio-notes/post/p-intro", vp)
      await p.evaluate(() => (document.getElementById("app").style.paddingBottom = "1400px", document.getElementById("app").style.paddingTop = "1400px"))
      const box = '[data-comment-box="comment"]'
      for (const where of phone ? ["top"] : ["top", "bottom"]) {
        await p.evaluate((box, where) => {
          const r = document.querySelector(box).getBoundingClientRect()
          window.scrollBy(0, r.top - (where === "top" ? 80 : innerHeight - 70))
        }, box, where)
        await sleep(250)
        await press(p, `${box} [data-emoji-trigger]`)
        await sleep(600)
        const e = await p.evaluate((phone) => {
          const el = document.querySelector(phone ? "[data-emoji-panel]" : "[data-emoji-popover]")
          const r = (el.closest("[data-sheet-panel]") ?? el).getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }
        }, phone)
        expect(e.top >= 0 && e.left >= 0 && e.bottom <= e.vh && e.right <= e.vw && (phone || (e.w <= 321 && e.h <= 341)), `the comment box's emoji, the box at the ${where} of the window: whole inside it`, e)
        await p.keyboard.press("Escape")
        await sleep(400)
        await press(p, `${box} [data-comment-tool="gif"] button`)
        await sleep(600)
        const g = await p.evaluate((phone) => {
          const el = document.querySelector(phone ? "[data-gif-results]" : "[data-gif-popover]")
          const r = (el.closest("[data-sheet-panel]") ?? el).getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }
        }, phone)
        expect(g.top >= 0 && g.left >= 0 && g.bottom <= g.vh && g.right <= g.vw && (phone || (g.w <= 341 && g.h <= 381)), `the comment box's GIFs, the box at the ${where} of the window: whole inside it`, g)
        if (where === "bottom") await shot(p, `${label}-r12-pop-comment-gif-bottom`)
        await p.keyboard.press("Escape")
        await sleep(400)
      }
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R12 LINK: the link and video fields, YouTube / Vimeo / Loom, Paste, the preview ── */
    if (want("r12link")) {
      const ctx = browser.defaultBrowserContext()
      await ctx.overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      await press(p, "[data-composer-open]")
      await sleep(700)
      await p.type("[data-composer-title]", "Two videos and a link")
      await p.type('[aria-label="Post"]', "Worth a look. ")
      await press(p, '[data-composer-tool="link"]')
      await sleep(250)
      const field = await p.evaluate(() => {
        const f = document.querySelector('[data-link-field="link"] label')
        const cs = getComputedStyle(f)
        return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, shadow: cs.boxShadow !== "none", paste: !!document.querySelector("[data-link-paste]"), focused: document.activeElement?.hasAttribute("data-link-input") }
      })
      expect(parseFloat(field.radius) === 10 && field.border === "1px" && field.shadow && field.paste && field.focused, "R12 LINK: a Storelib field (10px, hairline, 1px shadow) with Paste, the caret in it", field)
      await p.evaluate(() => navigator.clipboard.writeText("example.com/notes/naming").catch(() => {}))
      await press(p, "[data-link-paste]")
      await sleep(250)
      const pasted = await p.$eval("[data-link-input]", (i) => i.value)
      expect(pasted === "example.com/notes/naming", "Paste puts the clipboard's link in", pasted)
      await p.waitForFunction(() => /naming things/.test(document.querySelector('[data-link-preview="link"]')?.textContent ?? ""), { timeout: 3000 }).catch(() => {})
      const prev = await p.evaluate(() => document.querySelector('[data-link-preview="link"]')?.textContent ?? null)
      expect(/example\.com/.test(prev ?? "") && /naming things/.test(prev ?? ""), "a live preview card: the site and the page's title", prev)
      await shot(p, `${label}-r12-link-field`)
      await press(p, "[data-link-add]")
      await sleep(300)
      expect(!!(await p.$("[data-link-card]")) && !(await p.$("[data-link-field]")), "Add puts the card in the post and closes the field")
      await press(p, '[data-composer-tool="video"]')
      await sleep(250)
      await p.type('[data-link-field="video"] input', "https://example.com/watch")
      await sleep(200)
      const wrong = await p.evaluate(() => ({ hint: document.querySelector("[data-link-hint]")?.textContent ?? null, add: document.querySelector("[data-link-add]")?.disabled }))
      expect(/YouTube, Vimeo or Loom/.test(wrong.hint ?? "") && wrong.add === true, "a link that is not a video says what it takes, Add waits", wrong)
      for (const [url, site] of [["https://vimeo.com/76979871", "vimeo"], ["https://youtu.be/aqz-KE-bpKQ", "youtube"], ["https://www.loom.com/share/0123456789abcdef0123456789abcdef", "loom"]]) {
        await press(p, '[data-link-field="video"] [aria-label="Clear"]')
        await p.type('[data-link-field="video"] input', url)
        await sleep(450)
        const got = await p.evaluate(() => ({ icon: document.querySelector("[data-link-field-icon]")?.getAttribute("data-link-field-icon"), mark: !!document.querySelector("[data-link-field-icon] [data-provider-mark]"), card: document.querySelector("[data-link-preview]")?.getAttribute("data-link-preview") }))
        expect(got.icon === site && got.mark && got.card === site, `${site} is recognised: its mark in the field and on the preview card`, got)
        if (site === "loom") await shot(p, `${label}-r12-video-field-loom`)
      }
      await press(p, "[data-link-add]")
      await sleep(300)
      await press(p, '[data-composer-tool="video"]')
      await sleep(250)
      await p.type('[data-link-field="video"] input', "https://youtu.be/aqz-KE-bpKQ")
      await sleep(400)
      expect(!!(await p.$("[data-composer-video-upload]")), "Upload from the device sits next to it")
      await p.keyboard.press("Enter")
      await sleep(400)
      const sites = await p.$$eval("[data-attachment-site]", (els) => els.map((e) => e.getAttribute("data-attachment-site")))
      expect(sites.join() === "loom,youtube", "the videos wait in the post with their site's mark", sites)
      await shot(p, `${label}-r12-composer-videos`, !phone)
      await press(p, "[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      await press(p, "[data-composer-post]")
      await sleep(1300)
      const sent = calls.filter((c) => c.url.endsWith("/posts") && c.method === "POST").map((c) => JSON.parse(c.body))[0]
      const kinds = (sent?.media ?? []).map((m) => (m.type === "embed" ? `embed:${m.provider}` : m.type))
      expect(kinds.join() === "embed:loom,embed:youtube,link", "the POST carries the Loom and YouTube videos and the link", kinds)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
      const lm = await open("media", "/community/studio-notes/post/m-loom?post=m-loom", vp)
      const lo = await lm.p.evaluate(() => ({ player: !!document.querySelector('[data-embed-player="loom"]'), site: document.querySelector('[data-embed-player="loom"] [data-embed-site]')?.textContent ?? null }))
      await press(lm.p, '[data-embed-player="loom"] [data-embed-play]')
      await sleep(300)
      const src = await lm.p.evaluate(() => document.querySelector('[data-embed-player="loom"] iframe')?.getAttribute("src") ?? null)
      expect(lo.player && lo.site === "Loom" && /^https:\/\/www\.loom\.com\/embed\/0123456789abcdef0123456789abcdef\?/.test(src ?? ""), "a Loom link in a post's words plays under them, in Loom's player", { ...lo, src })
      await lm.p.close()
    }

    /* ── R12 POLL: written (choices added, moved, how long), then voted, changed, its results ── */
    if (want("r12poll")) {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      await press(p, "[data-composer-open]")
      await sleep(700)
      await p.type("[data-composer-title]", "Which night?")
      await p.type('[aria-label="Post"]', "Vote below.")
      await press(p, '[data-composer-tool="poll"]')
      await sleep(250)
      await p.type("[data-poll-question]", "When should critique night be?")
      await p.type('[aria-label="Choice 1"]', "Tuesday")
      await p.type('[aria-label="Choice 2"]', "Thursday")
      await press(p, "[data-poll-add]")
      await p.type('[aria-label="Choice 3"]', "Saturday")
      await press(p, "[data-poll-add]")
      await p.type('[aria-label="Choice 4"]', "Sunday")
      await press(p, '[data-poll-choice-remove="3"]')
      const order = () => p.$$eval("[data-poll-choice]", (els) => els.map((e) => e.value))
      expect((await order()).join() === "Tuesday,Thursday,Saturday", "choices are added and taken off", await order())
      /* Moved by the keyboard on the handle, then by dragging it. */
      await p.focus('[data-choice]:nth-child(3) [data-choice-handle]')
      await p.keyboard.press("ArrowUp")
      await sleep(100)
      expect((await order()).join() === "Tuesday,Saturday,Thursday", "the arrow keys on a choice's handle move it", await order())
      /* A phone's keyboard (estimated while a field has the caret) is let down first, and the choices brought into sight. */
      await p.evaluate(() => document.activeElement?.blur())
      await sleep(900)
      await p.evaluate(() => document.querySelector("[data-composer-poll-editor] ol").scrollIntoView({ block: "center" }))
      await sleep(250)
      const h = await (await p.$("[data-choice]:nth-child(1) [data-choice-handle]")).boundingBox()
      const step = await p.$eval("[data-choice]:nth-child(2)", (e) => e.getBoundingClientRect().top - e.previousElementSibling.getBoundingClientRect().top)
      await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
      await p.mouse.down()
      for (let k = 1; k <= 12; k++) {
        await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + (step * 2.1 * k) / 12)
        await sleep(16)
      }
      await shot(p, `${label}-r12-poll-drag`)
      await p.mouse.up()
      await sleep(250)
      expect((await order()).join() === "Saturday,Thursday,Tuesday", "and dragging the handle moves it down past the others", await order())
      await press(p, '[data-poll-ends="3"]')
      await press(p, "[data-poll-multiple]")
      await sleep(250)
      await p.evaluate(() => document.querySelector("[data-composer-poll-editor]").scrollIntoView({ block: "center" }))
      await sleep(200)
      await (await p.$("[data-composer-poll-editor]")).screenshot({ path: join(shots, `${label}-r12-poll-editor.png`) })
      await press(p, "[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      await press(p, "[data-composer-post]")
      await sleep(1300)
      const sent = calls.filter((c) => c.url.endsWith("/posts") && c.method === "POST").map((c) => JSON.parse(c.body))[0]
      const days = sent?.poll?.closesAt ? (Date.parse(sent.poll.closesAt) - Date.now()) / 86400000 : null
      expect(sent?.poll?.question === "When should critique night be?" && sent.poll.options.join() === "Saturday,Thursday,Tuesday" && sent.poll.multiple === true && days > 2.9 && days < 3.01, "R12 POLL: the POST carries the question, the choices in their order, several answers, ending in 3 days", sent?.poll)
      expect(errors.length === 0, "no page error", errors)
      await p.close()

      /* One answer: vote, change, take back. */
      const one = await open("poll", "/community/studio-notes/post/p-poll", vp)
      const pid = "33333333-0000-4000-8000-0000000000b1"
      const state = () => one.p.evaluate(() => ({ state: document.querySelector("[data-poll]")?.getAttribute("data-poll-state"), voted: [...document.querySelectorAll("[data-poll-voted]")].map((e) => e.getAttribute("data-poll-option").slice(-1)), shares: [...document.querySelectorAll("[data-poll-share]")].map((e) => e.textContent), total: document.querySelector("[data-poll-total]")?.textContent }))
      expect((await state()).state === "choosing", "a poll not answered shows its choices", await state())
      await press(one.p, `[data-poll-option="${pid}-b"]`)
      await one.p.evaluate(() => new Promise(requestAnimationFrame))
      const instant = await state()
      expect(instant.state === "results" && instant.voted.join() === "b" && /^7 votes/.test(instant.total), "a press answers at once: the results with the counts moved, before the server", instant)
      await sleep(500)
      const confirmed = await state()
      expect(confirmed.voted.join() === "b" && confirmed.shares.join() === "43%,43%,14%", "confirmed by the server: 3, 3 and 1 of 7", confirmed)
      await shot(one.p, `${label}-r12-poll-results`)
      await press(one.p, `[data-poll-option="${pid}-c"]`)
      await sleep(500)
      const changed = await state()
      expect(changed.voted.join() === "c" && changed.shares.join() === "43%,29%,29%", "pressing another choice changes the vote", changed)
      await press(one.p, `[data-poll-option="${pid}-c"]`)
      await sleep(500)
      const back = await state()
      expect(back.voted.length === 0 && back.state === "choosing", "the same choice again takes the vote back", back)
      expect(JSON.stringify(one.live.votes) === JSON.stringify([[`${pid}-b`], [`${pid}-c`], []]), "each answer went to the vote route", one.live.votes)
      await one.p.close()

      /* Several answers: tick, vote, change. */
      const many = await open("poll", "/community/studio-notes/post/p-poll-multi?multiple=1", vp)
      const mid = "33333333-0000-4000-8000-0000000000b2"
      await press(many.p, `[data-poll-option="${mid}-a"]`)
      await press(many.p, `[data-poll-option="${mid}-c"]`)
      const ticked = await many.p.$$eval('[data-poll-option][aria-pressed="true"]', (els) => els.length)
      await press(many.p, "[data-poll-vote]")
      await sleep(500)
      const res = await many.p.evaluate(() => ({ state: document.querySelector("[data-poll]").getAttribute("data-poll-state"), voted: [...document.querySelectorAll("[data-poll-voted]")].map((e) => e.getAttribute("data-poll-option").slice(-1)) }))
      expect(ticked === 2 && res.state === "results" && res.voted.join() === "a,c", "several answers: ticked, then Vote shows the results with both marked", { ticked, ...res })
      await press(many.p, "[data-poll-change]")
      await sleep(150)
      const back2 = await many.p.$$eval('[data-poll-option][aria-pressed="true"]', (els) => els.map((e) => e.getAttribute("data-poll-option").slice(-1)))
      expect(back2.join() === "a,c", "Change vote brings the ticks back with the answers in them", back2)
      await press(many.p, `[data-poll-option="${mid}-a"]`)
      await press(many.p, `[data-poll-option="${mid}-b"]`)
      await press(many.p, "[data-poll-vote]")
      await sleep(500)
      expect(JSON.stringify(many.live.votes?.at(-1)) === JSON.stringify([`${mid}-c`, `${mid}-b`]), "and Vote replaces the answer", many.live.votes)
      await shot(many.p, `${label}-r12-poll-multi`)
      await many.p.close()
    }

    /* ── R12 COMMENT BOX: emoji, video link, pictures; no files ── */
    if (want("r12cbox")) {
      const { p, errors, live } = await open("post", "/community/studio-notes/post/p-intro", vp)
      const box = '[data-comment-box="comment"]'
      await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), box)
      const tools = await p.$$eval(`${box} [data-comment-tool]`, (els) => els.map((e) => e.getAttribute("data-comment-tool")))
      expect(tools.join() === "image,video,emoji,gif", "R12 COMMENT BOX: pictures, a video link, emoji and GIF; no paperclip", tools)
      const width = await p.$eval(`${box} textarea`, (t) => Math.round(t.getBoundingClientRect().width))
      expect(width >= (phone ? 250 : 340), "the words keep their width (on a phone the tools sit under them)", width)
      await p.click(`${box} textarea`)
      await p.type(`${box} textarea`, "Love this ")
      await press(p, `${box} [data-emoji-trigger]`)
      await sleep(600)
      await p.evaluate(() => document.querySelector("[data-emoji]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
      await sleep(300)
      await p.keyboard.press("Escape").catch(() => {})
      await sleep(400)
      const words = await p.$eval(`${box} textarea`, (t) => t.value)
      expect(/^Love this \p{Extended_Pictographic}/u.test(words), "an emoji goes in where the caret was", words)
      await press(p, `${box} [data-comment-tool="video"]`)
      await sleep(250)
      await p.type(`${box} [data-link-field="video"] input`, "https://vimeo.com/76979871")
      await sleep(500)
      await shot(p, `${label}-r12-comment-video-field`)
      await p.keyboard.press("Enter")
      await sleep(300)
      const picks = await p.$$eval(`${box} [data-comment-pick]`, (els) => els.map((e) => e.getAttribute("data-comment-pick")))
      expect(picks.join() === "embed" && !!(await p.$(`${box} [data-comment-pick-site="vimeo"]`)), "a Vimeo link waits in the box with its mark", picks)
      await press(p, `${box} [data-comment-send]`)
      await sleep(900)
      const sent = live.commentBodies?.at(-1)
      expect(sent?.media?.[0]?.type === "embed" && sent.media[0].provider === "vimeo" && /Love this/.test(sent.body), "sent: the words, the emoji and the video", sent)
      const row = await p.evaluate(() => {
        const last = [...document.querySelectorAll("[data-comment]")].at(-1)
        return { embed: !!last.querySelector('[data-comment-embed="vimeo"] [data-embed-play]') }
      })
      expect(row.embed, "the comment shows the video as a player under its words", row)
      await p.evaluate(() => [...document.querySelectorAll("[data-comment]")].at(-1).scrollIntoView({ block: "center" }))
      await sleep(250)
      await shot(p, `${label}-r12-comment-with-video`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R12 HIGHLIGHT: the new post's warm tint, frame by frame ── */
    if (want("r12highlight")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      await (phone ? p.tap("[data-composer-open]") : p.click("[data-composer-open]"))
      await sleep(700)
      await p.type("[data-composer-title]", "Notes from Thursday")
      await p.type('[aria-label="Post"]', "What we covered and what is next.")
      await press(p, "[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      const cdp = await p.target().createCDPSession()
      const film = []
      cdp.on("Page.screencastFrame", (f) => {
        film.push({ t: f.metadata.timestamp, data: f.data })
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
      })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.evaluate(() => {
        window.__hl = []
        const loop = () => {
          const neu = document.querySelector('[data-feed-list] > [data-post="p-new"]')
          const tint = neu?.querySelector("[data-post-highlight]")
          const ed = document.querySelector("[data-composer=open], [data-composer=sheet]")
          window.__hl.push({ t: performance.now(), post: neu ? Number(getComputedStyle(neu).opacity) : null, tint: tint ? Number(getComputedStyle(tint).opacity) : null, color: tint ? getComputedStyle(tint).backgroundColor : null, editor: !!ed })
          window.__hlr = requestAnimationFrame(loop)
        }
        window.__hlr = requestAnimationFrame(loop)
      })
      await press(p, "[data-composer-post]")
      await sleep(3200)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const hl = await p.evaluate(() => (cancelAnimationFrame(window.__hlr), window.__hl))
      const first = hl.findIndex((f) => f.post !== null)
      const seen = hl.slice(first).map((f) => ({ t: f.t, eff: Math.round((f.post ?? 0) * (f.tint ?? 0) * 100) / 100, tint: f.tint, editor: f.editor }))
      /* How much the tint changes in one 60Hz frame's time, so a slow frame at 4x CPU is not counted as a jump. */
      const jumps = seen.slice(1).map((f, i) => (Math.abs(f.eff - seen[i].eff) * 16.7) / Math.max(16.7, f.t - seen[i].t))
      const tinted = hl.filter((f) => f.tint !== null)
      const lastTint = tinted.at(-1)
      const fadeStart = tinted.findIndex((f) => f.tint < 0.99 && tinted.indexOf(f) > 0)
      const fadeMs = tinted.length ? Math.round(lastTint.t - tinted[Math.max(0, fadeStart)].t) : 0
      expect(first > 0 && hl[first].tint === 1 && !hl[first].editor, "R12 HIGHLIGHT: the post arrives after the editor has closed, tinted from its first frame (no tint popping on later)", hl[first])
      /* The post's own 260ms fade in moves it by about 0.11 a frame at its steepest; a flash would be a whole step (1.0) at once. */
      expect(Math.max(0, ...jumps) <= 0.25, "the tint never jumps: it comes in with the post and only fades (largest change in a frame's time at 4x CPU)", { max: Math.round(Math.max(0, ...jumps) * 1000) / 1000, frames: seen.length })
      expect(tinted.every((f, i) => i === 0 || f.tint <= tinted[i - 1].tint + 0.001), "once there, the tint only ever fades", tinted.slice(0, 6).map((f) => f.tint))
      expect(tinted[0]?.color === "rgb(253, 248, 236)", "a soft warm paper tint, not a yellow", tinted[0]?.color)
      expect(fadeMs >= 1000 && fadeMs <= 1500, "it eases out over about 1.2s", fadeMs)
      expect(!(await p.$("[data-post-highlight]")), "and is gone after", null)
      /* The filmstrip of the arrival, cropped to the new post, to look at: a second post, filmed (the screencast is not counted above). */
      const top = await p.evaluate(() => Math.round(document.querySelector('[data-feed-list] > [data-post="p-new"]').getBoundingClientRect().top))
      await (phone ? p.tap("[data-composer-open]") : p.click("[data-composer-open]"))
      await sleep(700)
      await p.type("[data-composer-title]", "And one more")
      await p.type('[aria-label="Post"]', "Filmed this time.")
      await press(p, "[data-composer-space]")
      await sleep(350)
      const item2 = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await item2.asElement()?.click()
      await sleep(400)
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: phone ? 390 : 1440, maxHeight: phone ? 844 : 900, everyNthFrame: 1 })
      await press(p, "[data-composer-post]")
      await sleep(2600)
      await cdp.send("Page.stopScreencast")
      const strip = await browser.newPage()
      await strip.setViewport({ width: 1460, height: 900, deviceScaleFactor: 1 })
      const picked = film.filter((_, i) => i % 3 === 0).slice(0, 18)
      const cell = (f) => phone ? `<div style="width:230px;height:300px;overflow:hidden;position:relative"><img style="position:absolute;left:0;top:${-Math.max(0, top - 60) * (230 / 390)}px;width:230px" src="data:image/jpeg;base64,${f.data}"></div>` : `<div style="width:470px;height:250px;overflow:hidden;position:relative"><img style="position:absolute;left:-${Math.round(360 * 0.75)}px;top:${-Math.max(0, top - 60) * 0.75}px;width:1080px" src="data:image/jpeg;base64,${f.data}"></div>`
      await strip.setContent(`<body style="margin:0;background:#222;font:12px system-ui;color:#fff"><div style="display:grid;grid-template-columns:repeat(${phone ? 6 : 3},max-content);gap:6px;padding:4px">${picked.map((f, i) => `<div><div>+${Math.round((f.t - picked[0].t) * 1000)}ms</div>${cell(f)}</div>`).join("")}</div></body>`)
      await strip.screenshot({ path: join(shots, `${label}-r12-highlight-film.png`), fullPage: true })
      await strip.close()
      console.log(`  info  HIGHLIGHT frames (ms from first, post x tint): ${JSON.stringify(seen.filter((_, i) => i % 4 === 0).slice(0, 30).map((f) => [Math.round(f.t - seen[0].t), f.eff]))}`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R12 HELD: a post or a comment held for a moderator (202) ── */
    if (want("r12held")) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp, { held: true })
      await press(p, "[data-composer-open]")
      await sleep(700)
      await p.type("[data-composer-title]", "My first link")
      await p.type('[aria-label="Post"]', "Have a look at https://example.com/offer")
      await press(p, "[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      await press(p, "[data-composer-post]")
      await sleep(1400)
      const after = await p.evaluate(() => ({ inFeed: !!document.querySelector('[data-post="p-held"]'), closed: !!document.querySelector('[data-composer="closed"]'), field: document.querySelector("[data-composer-open]")?.textContent?.trim() ?? null, toast: document.querySelector("[data-community-toast]")?.textContent ?? null, highlight: !!document.querySelector("[data-post-highlight]") }))
      expect(!after.inFeed && !after.highlight && after.closed, "R12 HELD: a post held for a moderator closes the editor and is not put in the feed as if published", after)
      expect(after.toast === "Your post is waiting for a moderator. You will hear when it is up.", "a calm toast says the server's own words", after.toast)
      expect(after.field === "Continue: My first link", "what was written is kept as a draft to change", after.field)
      await shot(p, `${label}-r12-held-post`)
      await press(p, "[data-composer-open]")
      await sleep(700)
      const back = await p.evaluate(() => ({ title: document.querySelector("[data-composer-title]")?.value, note: document.querySelector('[data-composer-restored="held"]')?.textContent ?? null }))
      expect(back.title === "My first link" && /waiting for a moderator/.test(back.note ?? ""), "opened again, the words are there with a note that this is a copy", back)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
      const c = await open("post", "/community/studio-notes/post/p-intro", vp, { held: true })
      const box = '[data-comment-box="comment"]'
      await c.p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), box)
      await c.p.type(`${box} textarea`, "Join my group at https://example.com/x")
      const before = await c.p.evaluate(() => document.querySelectorAll("[data-comment]").length)
      await press(c.p, `${box} [data-comment-send]`)
      await sleep(900)
      const cafter = await c.p.evaluate((s) => ({ rows: document.querySelectorAll("[data-comment]").length, words: document.querySelector(`${s} textarea`).value, toast: document.querySelector("[data-community-toast]")?.textContent ?? null }), box)
      expect(cafter.rows === before && cafter.words === "Join my group at https://example.com/x" && cafter.toast === "Your comment is waiting for a moderator.", "a held comment is not left in the thread, its words come back into the box, and the toast says why", cafter)
      expect(c.errors.length === 0, "no page error", c.errors)
      await c.p.close()
    }

    /* ── R12 COMPRESS: pictures made lighter in the browser ── */
    if (want("r12compress") && !phone) {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      const r = await p.evaluate(async () => {
        /* A 4000x3000 photo-like JPEG with an EXIF block that says where it was taken. */
        const c = document.createElement("canvas")
        c.width = 4000
        c.height = 3000
        const x = c.getContext("2d")
        const g = x.createLinearGradient(0, 0, 4000, 3000)
        g.addColorStop(0, "#c9a27a")
        g.addColorStop(1, "#3d5a73")
        x.fillStyle = g
        x.fillRect(0, 0, 4000, 3000)
        for (let i = 0; i < 1400; i++) {
          x.fillStyle = `hsl(${(i * 37) % 360} 40% ${30 + (i % 50)}%)`
          x.fillRect((i * 997) % 4000, (i * 613) % 3000, 30 + (i % 90), 20 + (i % 70))
        }
        x.fillStyle = "#fff"
        x.font = "48px sans-serif"
        for (let i = 0; i < 40; i++) x.fillText("Fine print that must stay readable 0123456789", 40, 80 + i * 70)
        const jpeg = new Uint8Array(await (await new Promise((res) => c.toBlob(res, "image/jpeg", 0.95))).arrayBuffer())
        const exifText = new TextEncoder().encode("Exif\0\0MM\0*\0\0\0\bGPSLatitude 52.3676 GPSLongitude 4.9041 CameraOwner Probe")
        const len = exifText.length + 2
        const app1 = new Uint8Array([0xff, 0xe1, len >> 8, len & 255, ...exifText])
        const withExif = new Uint8Array(jpeg.length + app1.length)
        withExif.set(jpeg.subarray(0, 2), 0)
        withExif.set(app1, 2)
        withExif.set(jpeg.subarray(2), 2 + app1.length)
        const photo = new File([withExif], "IMG_0042.jpg", { type: "image/jpeg" })
        const has = (bytes, s) => new TextDecoder("latin1").decode(bytes).includes(s)
        const out = await window.__compress(photo)
        const ob = new Uint8Array(await out.arrayBuffer())
        const bmp = await createImageBitmap(out)
        /*
          What the encoding lost: the original drawn at the same 2560px without any encoding, against what
          will be uploaded, both read at full size: the mean difference per channel, out of 255.
        */
        const diff = async (a, b) => {
          const w = 2560, h = 1920
          const pix = async (blob) => {
            const cc = document.createElement("canvas")
            cc.width = w
            cc.height = h
            const cx = cc.getContext("2d")
            cx.imageSmoothingQuality = "high"
            cx.drawImage(await createImageBitmap(blob), 0, 0, w, h)
            return cx.getImageData(0, 0, w, h).data
          }
          const [pa, pb] = await Promise.all([pix(a), pix(b)])
          let sum = 0
          for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])
          return Math.round((sum / (pa.length / 4) / 3) * 100) / 100
        }
        const res = { inType: photo.type, inSize: photo.size, inExif: has(withExif, "GPSLatitude"), type: out.type, name: out.name, size: out.size, w: bmp.width, h: bmp.height, exif: has(ob, "Exif") || has(ob, "GPSLatitude"), diff: await diff(photo, out) }
        /* A GIF goes as it is (every frame kept). */
        const gifBytes = Uint8Array.from(atob("R0lGODlhAgACAIAAAP///wAAACH5BAAAAAAALAAAAAACAAIAAAICRAEAOw=="), (ch) => ch.charCodeAt(0))
        const gif = new File([gifBytes], "wave.gif", { type: "image/gif" })
        const gout = await window.__compress(gif)
        res.gif = { same: gout === gif, type: gout.type, size: gout.size }
        /* A browser whose canvas writes no WebP (Safari): JPEG at the same quality instead. */
        const real = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
          return real.call(this, cb, type === "image/webp" ? "image/png" : type, q)
        }
        const sout = await window.__compress(photo)
        HTMLCanvasElement.prototype.toBlob = real
        const sbmp = await createImageBitmap(sout)
        res.safari = { type: sout.type, w: sbmp.width, h: sbmp.height, size: sout.size, exif: has(new Uint8Array(await sout.arrayBuffer()), "GPSLatitude") }
        return res
      })
      expect(r.inExif && r.type === "image/webp" && /\.webp$/.test(r.name), "R12 COMPRESS: a 4000x3000 JPEG goes up as WebP", { type: r.type, name: r.name })
      expect(r.w === 2560 && r.h === 1920, "its longest side 2560px, its shape kept", [r.w, r.h])
      expect(r.size < r.inSize / 2, "much lighter", { from: r.inSize, to: r.size })
      expect(!r.exif, "the EXIF (where it was taken) is gone", r.exif)
      expect(r.diff < 2.5, "and it looks the same (mean difference per channel under 2.5 of 255 against the unencoded picture at 2560px)", r.diff)
      expect(r.gif.same && r.gif.type === "image/gif", "a GIF goes as it is, frames and all", r.gif)
      expect(r.safari.type === "image/jpeg" && r.safari.w === 2560 && !r.safari.exif && r.safari.size < r.inSize / 2, "where the canvas cannot write WebP (Safari), JPEG at the same size, EXIF gone", r.safari)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ══ ROUND 13 (P2) ══════════════════════════════════════════════════ */
    const fakeAudio13 = () => {
      window.__sounds = { osc: 0, noise: 0 }
      class Param { setValueAtTime() {} exponentialRampToValueAtTime() {} }
      class Ctx {
        constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; this.sampleRate = 8000 }
        createOscillator() { window.__sounds.osc++; return { type: "sine", frequency: new Param(), connect() {}, disconnect() {}, start() {}, stop() {} } }
        createGain() { return { gain: new Param(), connect() {}, disconnect() {} } }
        createBiquadFilter() { return { type: "", Q: new Param(), frequency: new Param(), connect() {}, disconnect() {} } }
        createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) } }
        createBufferSource() { window.__sounds.noise++; return { connect() {}, disconnect() {}, start() {}, stop() {} } }
        resume() { return Promise.resolve() }
      }
      window.AudioContext = Ctx
    }
    const menuItem = async (p, words) => {
      await sleep(450)
      /* A row's words, its glyph (an emoji, a space's) before them or not. */
      const item = await p.evaluateHandle((w) => {
        const fits = (b) => (b.textContent.trim() === w || b.textContent.trim().endsWith(w)) && b.textContent.trim().length <= w.length + 3 && b.getBoundingClientRect().width > 0
        /* A menu's own rows first (a chip in the page can carry the same words). */
        return [...document.querySelectorAll('[role="menuitem"]')].find(fits) ?? [...document.querySelectorAll('[role="dialog"] button, [data-sheet] button')].find(fits) ?? [...document.querySelectorAll("button")].find(fits) ?? null
      }, words)
      const el = item.asElement()
      if (!el) return false
      await el.click().catch(() => el.evaluate((e) => e.click()))
      return true
    }
    /* What is drawn on top at the middle of an element: whether it is that element (or inside it). */
    const onTop = (p, sel) => p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40))
      return { top: !!hit && (el.contains(hit) || hit.contains(el)), z: getComputedStyle(el.closest("[style*=z-index], [class*=z-]") ?? el).zIndex }
    }, sel)

    /* ── R13 SWITCH (1): All and a space holding the same posts: the same card nodes, no fade ── */
    if (want("r13switch")) {
      const { p, errors } = await open("switch", "/community/studio-notes", vp)
      await sleep(300)
      const mark = () => p.evaluate(() => {
        let n = 0
        for (const el of document.querySelectorAll("[data-feed-list] > [data-post]")) el.__mark = ++n
        window.__placeholders = 0
        window.__fades = []
        window.__mo13 = new MutationObserver((ms) => { for (const m of ms) for (const x of m.addedNodes) if (x.nodeType === 1 && (x.matches?.("[data-post-placeholder]") || x.querySelector?.("[data-post-placeholder]"))) window.__placeholders++ })
        window.__mo13.observe(document.querySelector("[data-feed-list]") ?? document.body, { childList: true, subtree: true })
        const real = Element.prototype.animate
        window.__realAnimate ??= real
        Element.prototype.animate = function (k, o) {
          if (this.closest?.("[data-feed-list]") || this.matches?.("[data-feed-list]")) window.__fades.push({ el: this.getAttribute("data-post") ?? this.getAttribute("data-feed-list") ?? this.tagName, opacity: JSON.stringify(k).includes("opacity") })
          return window.__realAnimate.call(this, k, o)
        }
        return n
      })
      const check = () => p.evaluate(() => {
        window.__mo13.disconnect()
        Element.prototype.animate = window.__realAnimate
        const els = [...document.querySelectorAll("[data-feed-list] > [data-post]")]
        return { cards: els.length, kept: els.filter((e) => e.__mark).length, placeholders: window.__placeholders, fades: window.__fades.filter((f) => f.opacity), key: document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key") }
      })
      const before = await mark()
      await press(p, '[data-space-chip="general"], a[href$="/space/general"]')
      await p.waitForFunction(() => /space:s-general/.test(document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key") ?? ""), { timeout: 3000 }).catch(() => {})
      await sleep(500)
      const a = await check()
      expect(a.key?.includes("space:s-general") && a.cards === before && a.kept === before, "R13 SWITCH: All to a space with the same posts keeps every card node (no remount)", { before, ...a })
      expect(a.placeholders === 0 && a.fades.length === 0, "no stand in, no fade: nothing moves when the list did not change", a)
      await mark()
      await press(p, '[data-space-chip="all"], a[href="/community/studio-notes"]')
      await sleep(500)
      const b = await check()
      expect(b.cards === before && b.kept === before && b.fades.length === 0, "and back to All the same", b)
      await shot(p, `${label}-r13-switch`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 EDITURL: ?edit=1 opens Edit post on the post page for its author, and leaves the address ── */
    if (want("r13editurl")) {
      const a = await open("mine", "/community/studio-notes/post/p-mine?edit=1", vp)
      await sleep(phone ? 900 : 400)
      const r = await a.p.evaluate(() => ({ editor: document.querySelector('[data-composer="edit"], [data-composer="sheet"][data-composer-edit]')?.getAttribute("data-composer") ?? null, search: location.search, title: document.querySelector("[data-composer-title]")?.value ?? null }))
      expect(r.editor === (phone ? "sheet" : "edit") && r.title === "Best thing I read on empty states", "R13 EDIT LINK: ?edit=1 opens Edit post at once on the author's own post", r)
      expect(!/edit=/.test(r.search), "and ?edit=1 leaves the address", r.search)
      await shot(a.p, `${label}-r13-edit-url`)
      expect(a.errors.length === 0, "no page error", a.errors)
      await a.p.close()
      const b = await open("post", "/community/studio-notes/post/p-intro?edit=1", vp)
      await sleep(600)
      const n = await b.p.evaluate(() => ({ editor: !!document.querySelector('[data-composer="edit"], [data-composer="sheet"]'), search: location.search }))
      expect(!n.editor && !/edit=/.test(n.search), "somebody else's post ignores it (and drops it from the address)", n)
      await b.p.close()
    }

    /* ── R13 MORE (2): the list asks for more by itself up to 60 posts, then "Load more posts" ── */
    if (want("r13more")) {
      const { p, errors } = await open("switch", "/community/studio-notes?more=1", vp)
      for (let i = 0; i < 12; i++) {
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await sleep(450)
      }
      const r = await p.evaluate(() => ({ cards: document.querySelectorAll("[data-feed-list] > [data-post], [data-feed-list] > [data-post-placeholder]").length, pages: window.__pages ?? 0, button: document.querySelector("[data-feed-more]")?.textContent?.trim() ?? null }))
      expect(r.cards >= 60 && r.cards < 80 && r.button === "Load more posts", "R13 MORE: scrolling loads pages by itself until about 60 posts, then stops", r)
      await press(p, "[data-feed-more]")
      await sleep(700)
      const r2 = await p.evaluate(() => document.querySelectorAll("[data-feed-list] > [data-post], [data-feed-list] > [data-post-placeholder]").length)
      expect(r2 === r.cards + 20, "\"Load more posts\" brings the next page when asked", { before: r.cards, after: r2 })
      await shot(p, `${label}-r13-more`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 CARDS (5, 9, 10, 16): dates, no dot, pinned, the grid, soft pictures, SDR ── */
    if (want("r13cards")) {
      /* What the first picture of the member's post looks like on the first frames it is drawn, from the page's start. */
      const watchSoft = () => {
        window.__soft = []
        const look = () => {
          const t = document.querySelector('[data-post="p-mine"] [data-card-media-tile] [data-soft-img]')
          if (t && window.__soft.length < 120) {
            const blur = t.parentElement.querySelector("[data-soft-blur]")
            window.__soft.push({ img: t.getAttribute("data-soft-img"), opacity: getComputedStyle(t).opacity, blur: blur ? getComputedStyle(blur).backgroundImage.slice(0, 40) : null })
          }
          requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      }
      const { p, errors } = await open("edit", "/community/studio-notes", vp, { imageWait: 900, before: watchSoft })
      await sleep(1000)
      const softFrames = await p.evaluate(() => window.__soft)
      const early = softFrames[0] ?? {}
      await sleep(1200)
      const c = await p.evaluate(() => {
        const card = (id) => document.querySelector(`[data-post="${id}"]`)
        const when = (id) => card(id)?.querySelector("time")?.textContent
        const grid = card("p-intro")?.querySelector("[data-card-media]")
        const r = (e) => e.getBoundingClientRect()
        const img = card("p-mine")?.querySelector("[data-card-media-tile] img")
        const pinned = card("p-video")
        return {
          dates: { mine: when("p-mine"), intro: when("p-intro"), text: when("p-text") },
          dots: document.querySelectorAll("[data-unread-dot]").length,
          pin: pinned ? { line: !!pinned.querySelector("[data-pin-mark]"), lineAbove: r(pinned.querySelector("[data-pin-mark]")).bottom <= r(pinned.querySelector("header")).top + 1, border: getComputedStyle(pinned).borderTopColor } : null,
          grid: grid ? { kind: grid.getAttribute("data-card-media"), tiles: grid.querySelectorAll("[data-card-media-tile]").length, ratio: Math.round((r(grid).width / r(grid).height) * 100) / 100, more: grid.querySelector("[data-card-media-more]")?.textContent, edge: !!grid.querySelector(".ring-inset"), thumb: !!card("p-intro").querySelector("[data-post-thumb]:not(.max-sm\\:hidden)") || [...card("p-intro").querySelectorAll("[data-post-thumb]")].some((x) => getComputedStyle(x).display !== "none") } : null,
          late: img ? { state: img.getAttribute("data-soft-img"), opacity: getComputedStyle(img).opacity, sdr: img.className.includes("dynamic-range-limit:standard") } : null,
          role: card("p-video")?.querySelector("[data-role-badge]")?.textContent,
        }
      })
      expect(/^\d+m$/.test(c.dates.mine ?? "") && /^\d+d$/.test(c.dates.text ?? "") && /^[A-Z][a-z]{2} \d{1,2}$/.test(c.dates.intro ?? ""), "R13 DATES: \"57m\", \"2d\", then the date (\"Sep 12\") past a week", c.dates)
      expect(c.dots === 0, "R13 NO DOT: no unread dot on any card", c.dots)
      expect(!!c.pin?.line && c.pin.lineAbove, "R13 PINNED: a \"Pinned\" line above the post", c.pin)
      expect(c.grid?.kind === "grid" && c.grid.tiles === 3 && c.grid.more === "+1" && c.grid.edge && !c.grid.thumb, "R13 GRID: four pictures are a grid in the card (first large, two stacked, +1), a hairline edge, no right thumbnail", c.grid)
      expect(Math.abs((c.grid?.ratio ?? 0) - (phone ? 2 : 8 / 3)) < 0.05, `the grid is one box of a fixed shape (${phone ? "2:1" : "8:3"})`, c.grid?.ratio)
      expect(early.img === "wait" && early.opacity === "0" && /url\(/.test(early.blur ?? ""), "R13 SOFT: before a picture arrives its box shows a blurred 32px copy, the picture still transparent", early)
      const ops = softFrames.map((f) => Number(f.opacity)).filter((o, i, a) => i === 0 || o !== a[i - 1])
      expect(ops.length >= 3 && ops[0] === 0 && ops.at(-1) === 1, "and it fades in over several frames when it arrives (no pop)", ops.slice(0, 8))
      expect(c.late?.state === "in" && c.late.opacity === "1" && c.late.sdr, "then it fades in (opacity), drawn in standard dynamic range", c.late)
      expect(c.role === "Owner", "R13 ADMIN MARKER: the owner's post carries its quiet role line", c.role)
      await shot(p, `${label}-r13-cards`)
      await (await p.$('[data-post="p-intro"]')).screenshot({ path: join(shots, `${label}-r13-card-grid.png`) })
      await (await p.$('[data-post="p-video"]')).screenshot({ path: join(shots, `${label}-r13-card-pinned.png`) })
      /* Drawn again (another list): a cached picture is drawn at once, no fade. */
      await p.evaluate(() => window.scrollTo(0, 0))
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 LIVE (3): an edit and a delete arrive live ── */
    if (want("r13live")) {
      const { p, errors, live } = await open("feed", "/community/studio-notes", vp)
      await sleep(300)
      const base = await p.evaluate(() => [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")))
      live.posts = { "p-link": { ...(await p.evaluate(() => null)) } }
      const link = await p.evaluate(() => ({ title: document.querySelector('[data-post="p-link"] h2')?.textContent }))
      live.posts["p-link"] = { id: "p-link", communityId: CID, space: { id: "s-general", slug: "general", name: "General" }, kind: "post", title: "Best thing I read on empty states (edited)", body: "", bodyText: "Updated with a second link.", media: [], pinned: false, featured: false, locked: false, status: "published", author: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator", level: 3 }, reactionCount: 3, commentCount: 0, reacted: false, bookmarked: false, poll: null, createdAt: new Date(Date.now() - 26 * 3600e3).toISOString(), editedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), canEdit: true, canModerate: true, recentCommenters: [], lastCommentAt: null, showLevel: true }
      await p.evaluate(() => window.__broadcast("community-live:probe", "post-change", { postId: "p-link", spaceId: "s-general", change: "edit" }))
      await sleep(500)
      const edited = await p.evaluate(() => ({ title: document.querySelector('[data-post="p-link"] h2')?.textContent, edited: /edited/.test(document.querySelector('[data-post="p-link"]')?.textContent ?? "") }))
      expect(edited.title === "Best thing I read on empty states (edited)" && edited.edited && edited.title !== link.title, "R13 LIVE: an edit by the author shows in place for everyone viewing", edited)
      /* The delete: the card fades away and the cards under it slide up (sampled each frame). */
      await p.evaluate(() => {
        window.__lv = []
        const next = document.querySelector('[data-post="p-text"]')?.previousElementSibling
        const loop = () => {
          const gone = !document.querySelector('[data-feed-list] > [data-post="p-text"]')
          const ghost = document.querySelector("[data-fold-ghost]")
          window.__lv.push({ gone, ghost: ghost ? Number(getComputedStyle(ghost).opacity).toFixed(2) : null })
          if (window.__lv.length < 40) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      })
      await p.evaluate(() => document.querySelector('[data-post="p-text"]')?.scrollIntoView({ block: "center" }))
      await sleep(300)
      await p.evaluate(() => window.__broadcast("community-live:probe", "post-change", { postId: "p-text", spaceId: "s-general", change: "delete" }))
      await sleep(900)
      const after = await p.evaluate(() => ({ ids: [...document.querySelectorAll("[data-feed-list] > [data-post]")].map((e) => e.getAttribute("data-post")), frames: window.__lv }))
      expect(base.includes("p-text") && !after.ids.includes("p-text") && after.ids.length === base.length - 1, "R13 LIVE: a deleted post leaves every viewer's feed", after.ids)
      const fading = after.frames.filter((f) => f.ghost !== null).map((f) => f.ghost)
      expect(fading.length >= 3 && Number(fading[0]) > Number(fading.at(-1)), "it fades out over several frames (no cut)", fading.slice(0, 8))
      await shot(p, `${label}-r13-live`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 SHARE (7): the system share sheet with the post's address, and Copy link ── */
    if (want("r13share")) {
      const shareStub = () => {
        window.__shared = []
        navigator.share = (d) => (window.__shared.push(d), Promise.resolve())
      }
      const { p, errors } = await open("feed", "/community/studio-notes", vp, { before: shareStub })
      await press(p, '[data-post="p-text"] [data-post-more]')
      const items = await p.evaluate(() => new Promise((r) => setTimeout(() => r([...document.querySelectorAll('[role="menuitem"], button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim()).filter(Boolean)), 450)))
      const ok = await menuItem(p, "Share post")
      await sleep(900)
      const shared = await p.evaluate(() => window.__shared)
      expect(items.includes("Share post") && items.includes("Copy link"), "R13 SHARE: the post's menu has Share post and Copy link", items)
      expect(ok && shared.length === 1 && /\/community\/studio-notes\/post\/p-text$/.test(shared[0].url) && shared[0].title === "Paid discovery week instead of a free pitch" && /paid discovery/.test(shared[0].text), "Share post opens the system share sheet with the post's address, title and words", shared)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 EDIT (4): Edit post is the composer, prefilled; Save animates; Delete asks in a Storelib sheet ── */
    if (want("r13edit")) {
      const { p, errors, live } = await open("edit", "/community/studio-notes", vp)
      const fixture = await p.evaluate(() => window.__FEED_POSTS.find((x) => x.id === "p-mine"))
      live.editBase = fixture
      await press(p, '[data-post="p-mine"] [data-post-more]')
      expect(await menuItem(p, "Edit post"), "R13 EDIT: Edit post is in the author's menu")
      await sleep(phone ? 700 : 300)
      const ed = await p.evaluate(() => {
        const box = document.querySelector('[data-composer="edit"], [data-composer="sheet"][data-composer-edit]')
        if (!box) return null
        const r = box.getBoundingClientRect()
        return {
          where: box.getAttribute("data-composer"),
          inCard: !!box.closest('[data-post="p-mine"]'),
          title: box.querySelector("[data-composer-title]")?.value,
          body: box.querySelector("textarea")?.value,
          uploads: box.querySelectorAll("[data-attachment]").length,
          poll: box.querySelector("[data-poll-question]")?.value,
          space: box.querySelector("[data-composer-space]")?.textContent?.trim(),
          save: box.querySelector("[data-composer-post]")?.textContent?.trim(),
          z: getComputedStyle(box).zIndex,
          whole: r.top >= -1 && r.bottom <= innerHeight + 1,
        }
      })
      expect(!!ed && ed.title === fixture.title && ed.body === fixture.bodyText && ed.uploads === 2 && ed.poll === "Which corner?", "the same composer opens with the title, the words, both pictures and the poll", ed)
      expect(!!ed && (phone ? ed.where === "sheet" && Number(ed.z) >= 135 : ed.where === "edit" && ed.inCard), phone ? "on a phone it is the composer's screen (\"Edit post\")" : "on a computer it opens in place, inside the post", ed)
      expect(!!ed && ed.save === "Save" && /General/.test(ed.space ?? ""), "its button says Save, and the space can be changed", ed)
      await shot(p, `${label}-r13-edit-open`)
      /* Take a picture off, change the title, save. */
      /* Worker V's tray (attachment-tray.tsx) has its own remove control; the older tile's "Remove" too. */
      await p.evaluate(() => document.querySelector('[data-composer="edit"] [data-tray-remove], [data-composer="sheet"] [data-tray-remove], [data-composer="edit"] [data-attachment] [aria-label="Remove"], [data-composer="sheet"] [data-attachment] [aria-label="Remove"]')?.click())
      const t = await p.$('[data-composer="edit"] [data-composer-title], [data-composer="sheet"] [data-composer-title]')
      await t.evaluate((el) => (el.focus(), el.select()))
      await t.type("Studio wall, after")
      await p.evaluate(() => {
        window.__btn = []
        const loop = () => {
          const b = document.querySelector("[data-composer-post]")
          window.__btn.push(b ? b.getAttribute("data-post-state") : "gone")
          if (window.__btn.length < 90) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      })
      await press(p, '[data-composer="edit"] [data-composer-post], [data-composer="sheet"] [data-composer-post]')
      await sleep(1500)
      const sentEdit = live.patches?.at(-1)
      const after = await p.evaluate(() => ({ title: document.querySelector('[data-post="p-mine"] h2')?.textContent, editor: !!document.querySelector('[data-composer="edit"], [data-composer="sheet"]'), btn: [...new Set(window.__btn)], toast: document.querySelector("[data-community-toast]")?.textContent ?? null }))
      expect(sentEdit?.id === "p-mine" && sentEdit.sent.title === "Studio wall, after" && sentEdit.sent.media?.length === 1 && sentEdit.sent.poll?.question === "Which corner?", "Save sends the title, one picture fewer, and the poll", sentEdit?.sent && { title: sentEdit.sent.title, media: sentEdit.sent.media?.length, poll: sentEdit.sent.poll })
      expect(after.btn.includes("busy") && after.btn.includes("sent") && !after.editor && after.title === "Studio wall, after", "Save: a spinner, a check, the editor folds away, the post shows the change", after)
      await shot(p, `${label}-r13-edit-saved`)
      /* Delete: Storelib's own sheet / dialog, on top. */
      await press(p, '[data-post="p-mine"] [data-post-more]')
      await menuItem(p, "Delete post")
      await sleep(500)
      const sheet = phone ? "[data-confirm-sheet]" : "[data-confirm-dialog]"
      const top = await onTop(p, sheet)
      expect(!!top?.top, "R13 DELETE: the confirm is Storelib's sheet / dialog, drawn on top", top)
      await shot(p, `${label}-r13-delete-confirm`)
      await press(p, `${sheet} [data-confirm]`)
      await sleep(800)
      const gone = await p.evaluate(() => !document.querySelector('[data-feed-list] > [data-post="p-mine"]'))
      expect(gone && live.deletes?.includes("p-mine"), "Delete removes it (the server is asked, the card goes)", live.deletes)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 OVERLAY (11, 12): no page shift, slim scrollbar, comments always come, report and confirm on top ── */
    if (want("r13overlay")) {
      const { p, errors, live } = await open("feed", "/community/studio-notes", vp, { before: fakeAudio13 })
      const x0 = await p.evaluate(() => Math.round(document.querySelector('[data-post="p-video"]').getBoundingClientRect().left))
      /* The open's own animations are cancelled as it starts (a finger catching the sheet): the comments must still come. */
      await p.evaluate(() => {
        const mo = new MutationObserver(() => {
          const el = document.querySelector('[data-post-overlay="panel"], [data-post-overlay="phone"]')
          if (!el) return
          mo.disconnect()
          requestAnimationFrame(() => document.getAnimations().forEach((a) => a.cancel()))
        })
        mo.observe(document.body, { childList: true, subtree: true })
      })
      await press(p, '[data-post="p-video"] h2 a')
      await sleep(1200)
      const o = await p.evaluate(() => {
        const sc = document.querySelector("[data-post-overlay-scroll]")
        return {
          rows: document.querySelectorAll("[data-comments-rows] [data-comment]").length,
          x: Math.round(document.querySelector('[data-post="p-video"]').getBoundingClientRect().left),
          overflow: getComputedStyle(document.documentElement).overflow,
          pad: document.documentElement.style.paddingRight,
          bar: sc ? getComputedStyle(sc).scrollbarWidth : null,
        }
      })
      expect(o.rows === 4, "R13 COMMENTS: they load even when the open's animation never finishes", o.rows)
      if (!phone) {
        expect(o.x === x0 && !o.pad && o.overflow !== "hidden", "R13 NO SHIFT: opening a post leaves the page's scrollbar and every element where they were", { x0, ...o })
        expect(o.bar === "thin", "the panel's own scrollbar is slim", o.bar)
      }
      /* The bubble. */
      const bub = await p.evaluate(() => {
        const b = document.querySelector("[data-comment-bubble]")
        const st = getComputedStyle(b)
        return { bg: st.backgroundColor, radius: st.borderTopLeftRadius, border: st.borderTopColor, shadow: st.boxShadow !== "none" }
      })
      expect(bub.bg === "rgb(246, 247, 248)" && bub.radius === "14px" && bub.shadow, "R13 BUBBLE: lighter grey, a hairline and a 1px shadow, 14px corners", bub)
      /* Reply: the caret after "@name ". */
      await press(p, '[data-comment="c-v1"] [data-comment-reply]')
      await sleep(300)
      const caret = await p.evaluate(() => {
        const t = document.querySelector('[data-comment-box="reply"] textarea')
        return { value: t?.value, start: t?.selectionStart, focused: document.activeElement === t }
      })
      expect(caret.value === "@leom " && caret.start === caret.value.length && caret.focused, "R13 REPLY: the box starts \"@name \" with the caret after it", caret)
      /* @ alone opens the member picker (the people on screen first), chosen with the keyboard. */
      await p.keyboard.type("@")
      await sleep(250)
      const list = await p.evaluate(() => [...document.querySelectorAll("[data-mention-option]")].map((x) => x.getAttribute("data-mention-option")))
      await p.keyboard.press("ArrowDown")
      await p.keyboard.press("Enter")
      await sleep(100)
      const picked = await p.evaluate(() => {
        const t = document.querySelector('[data-comment-box="reply"] textarea')
        return { value: t.value, start: t.selectionStart }
      })
      expect(list.length >= 2 && list.includes("jonasb") && list.includes("leom"), "R13 MENTION: \"@\" alone opens the picker with the people on screen", list)
      expect(/^@leom @\w+ $/.test(picked.value) && picked.start === picked.value.length, "a choice puts @username and a space in, the caret after it", picked)
      await shot(p, `${label}-r13-reply`)
      /* Send: a soft sound, then the comment lands. */
      await p.keyboard.type("thanks")
      const s0 = await p.evaluate(() => window.__sounds.osc)
      await press(p, '[data-comment-box="reply"] [data-comment-send]')
      await sleep(700)
      const s1 = await p.evaluate(() => window.__sounds.osc)
      expect(s1 - s0 === 2, "R13 SEND: sending plays the soft two note sound once", s1 - s0)
      /* A comment deleted elsewhere goes live. */
      await p.evaluate(() => window.__broadcast("community-live:probe:p-video", "comment-change", { commentId: "c-v2", postId: "p-video", change: "delete" }))
      await sleep(300)
      const liveDel = await p.evaluate(() => !document.querySelector('[data-comment="c-v2"]'))
      expect(liveDel, "R13 LIVE: a comment deleted elsewhere leaves the open post", liveDel)
      /* Report a comment: above the post. */
      await press(p, '[data-comment="c-v3"] [data-comment-more]')
      await menuItem(p, "Report")
      await sleep(600)
      const rep = await onTop(p, phone ? "[data-report-sheet]" : "[data-report-dialog]")
      expect(!!rep?.top, "R13 REPORT: opens ABOVE the post", rep)
      await shot(p, `${label}-r13-report-over-post`)
      /* Closed by its own way out: Escape on a computer, a press on its scrim (over the post) on a phone. */
      if (phone) await p.mouse.click(vp.width / 2, 12)
      else await p.keyboard.press("Escape")
      await sleep(600)
      /* Delete my own comment: the confirm above the post. */
      const own = await p.evaluate(() => [...document.querySelectorAll("[data-comment]")].map((e) => e.getAttribute("data-comment")).find((id) => /^c-new|^sending/.test(id)))
      await press(p, `[data-comment="${own}"] [data-comment-more]`)
      await menuItem(p, "Delete")
      await sleep(600)
      const conf = await onTop(p, phone ? "[data-confirm-sheet]" : "[data-confirm-dialog]")
      expect(!!conf?.top, "R13 CONFIRM: delete comment asks above the post", conf)
      await press(p, `${phone ? "[data-confirm-sheet]" : "[data-confirm-dialog]"} [data-confirm]`)
      await sleep(600)
      expect(live.commentDeletes?.length === 1 && !(await p.evaluate((id) => !!document.querySelector(`[data-comment="${id}"]`), own)), "and the comment goes", live.commentDeletes)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 VISITOR (8): a public post read by somebody who is not a member ── */
    if (want("r13visitor")) {
      const { p, errors } = await open("visitor", "/community/studio-notes/post/p-text", vp)
      const v = await p.evaluate(() => {
        const bar = document.querySelector("[data-visitor-join]")
        const r = bar?.getBoundingClientRect()
        const btn = document.querySelector("[data-visitor-join-button]")?.getBoundingClientRect()
        const last = [...document.querySelectorAll("[data-comment]")].at(-1)?.getBoundingClientRect()
        return { box: !!document.querySelector("[data-comment-box]"), closed: document.querySelector("[data-comments-closed]")?.textContent, bar: r ? { bottom: Math.round(r.bottom), h: Math.round(r.height) } : null, btn: btn ? Math.round(btn.height) : null, href: document.querySelector("[data-visitor-join-button]")?.getAttribute("href"), save: !!document.querySelector("[data-save]"), comments: document.querySelectorAll("[data-comment]").length }
      })
      expect(!v.box && v.closed === "Join the community to comment." && v.comments === 1 && !v.save, "R13 VISITOR: the post and its comments, read only (no box, no Save)", v)
      expect(!!v.bar && Math.abs(v.bar.bottom - vp.height) <= 1 && v.btn >= 40 && v.href === "/community/studio-notes/about", "a calm Join bar at the bottom, Join goes to the community's page", v)
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(200)
      const covered = await p.evaluate(() => {
        const last = [...document.querySelectorAll("[data-comment]")].at(-1).getBoundingClientRect()
        return Math.round(last.bottom) > Math.round(document.querySelector("[data-visitor-join]").getBoundingClientRect().top)
      })
      expect(!covered, "scrolled to the end, the bar never covers the last comment", covered)
      await shot(p, `${label}-r13-visitor`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 LIGHTBOX (6): quick swipes slide (never a zoom), neighbours mounted, frames at 4x CPU ── */
    if (want("r13lightbox") && phone) {
      const { p, errors } = await open("media", "/community/studio-notes/post/m-many?post=m-many", vp)
      await press(p, '[data-media-index="0"]')
      await sleep(700)
      const mounted = await p.evaluate(() => document.querySelectorAll("[data-lightbox-slide] [data-lightbox-media]").length)
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const swipe = async () => {
        await p.touchscreen.touchStart(320, 420)
        for (let i = 1; i <= 6; i++) await p.touchscreen.touchMove(320 - i * 40, 422)
        await p.touchscreen.touchEnd()
      }
      await p.evaluate(() => {
        window.__lb = []
        const loop = (t) => {
          window.__lb.push(t)
          if (window.__lb.length < 200) requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      })
      await swipe()
      await sleep(60)
      await swipe()
      await sleep(1200)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const after = await p.evaluate(() => {
        const st = window.__lb
        const gaps = st.slice(1).map((t, i) => t - st[i])
        const img = document.querySelector("[data-lightbox-slide] [data-lightbox-image]")
        return { count: document.querySelector("[data-lightbox-count]")?.textContent, zoomed: [...document.querySelectorAll("[data-lightbox-image]")].some((i) => i.style.scale && i.style.scale !== "1"), max: Math.round(Math.max(...gaps)), over34: gaps.filter((g) => g > 34).length, n: gaps.length }
      })
      expect(mounted >= 3, "R13 LIGHTBOX: the shown picture and its neighbours are mounted ahead", mounted)
      expect(after.count === "3 / 5" && !after.zoomed, "two quick swipes in a row slide twice, never read as a double tap zoom", after)
      expect(after.over34 <= 4, "frames at 4x CPU while swiping: few gaps over two frames", after)
      await shot(p, `${label}-r13-lightbox`)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── R13 WHOOSH (15): Post plays a soft whoosh once the server has it; the composer's space picker shows the glyph ── */
    if (want("r13whoosh")) {
      const { p, errors } = await open("switch", "/community/studio-notes", vp, { before: fakeAudio13 })
      await press(p, "[data-composer-open]")
      await sleep(phone ? 900 : 500)
      const glyph = await p.evaluate(() => document.querySelector("[data-composer-space] [data-space-glyph]")?.textContent ?? null)
      await p.type("[data-composer-title]", "Open studio hours")
      await p.type('[data-composer] textarea, [data-composer="sheet"] textarea', "Thursday from six.")
      const space = await p.$("[data-composer-space]")
      if (await p.evaluate(() => document.querySelector("[data-composer-space]")?.getAttribute("data-composer-space") === "")) {
        await space.click()
        await menuItem(p, "General")
        /* A phone's menu is a sheet: the choice lands once it has slid away. */
        await sleep(phone ? 900 : 300)
      }
      const glyph2 = await p.evaluate(() => document.querySelector('[data-composer="sheet"] [data-composer-space] [data-space-glyph], [data-composer="open"] [data-composer-space] [data-space-glyph]')?.textContent ?? null)
      const n0 = await p.evaluate(() => window.__sounds.noise)
      await press(p, "[data-composer-post]")
      await sleep(1500)
      const n1 = await p.evaluate(() => window.__sounds.noise)
      expect(n1 - n0 === 1, "R13 WHOOSH: Post plays one soft whoosh once the post is up", n1 - n0)
      expect(!!(glyph || glyph2), "R13 GLYPH: the composer's space shows the space's glyph", glyph || glyph2)
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
