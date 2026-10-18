/**
 * ===========================================================================
 *  STORELIB'S QUICK CHECK OF ONE PAGE, FROM THE SERVER
 * ===========================================================================
 * Website settings › Performance › Lab test, when Google PageSpeed Insights
 * cannot run (no PAGESPEED_API_KEY on the server, or Google's quota is used
 * up): the page is fetched from Storelib's server with no browser, and only
 * what that can measure is reported:
 *
 *   • how long the server takes to answer (the median of QUICK_SAMPLES asks);
 *   • the size of the HTML and whether it is compressed;
 *   • whether the edge served it from its cache;
 *   • the stylesheets and scripts in <head> that hold up the first paint,
 *     how many and how heavy;
 *   • the images: how many, how many have no size, how many below the first
 *     few load without loading="lazy", and the heaviest by a HEAD request;
 *   • font files, and the other hosts the page loads from.
 *
 * There is no score: a score would claim a browser test that did not run.
 * The page labels the result "Quick check from Storelib's server".
 *
 * analyzeHtml and quickFindings are pure (tests/performance-tab-w.test.ts
 * feeds them a fixture); runQuickCheck takes its fetch as an argument.
 */

import type { LabStrategy } from "./pagespeed"

export const QUICK_SAMPLES = 5
/** The whole check gives up after this long. */
export const QUICK_TIMEOUT_MS = 15_000
const SAMPLE_TIMEOUT_MS = 8_000
const HEAD_TIMEOUT_MS = 4_000
/** More HTML than this is not read: the size is still known from the bytes counted. */
const MAX_HTML_BYTES = 3_000_000
/** At most this many files are asked for their size. */
const MAX_HEADS = 16

export interface QuickFile {
  url: string
  bytes: number | null
}

export interface HtmlFacts {
  blockingStyles: string[]
  blockingScripts: string[]
  images: Array<{ url: string | null; sized: boolean; lazy: boolean; eager: boolean }>
  fontFiles: string[]
  /** Font stylesheets from another host (Google Fonts, Adobe Fonts), which also hold up the first paint. */
  fontHosts: string[]
  thirdPartyHosts: string[]
}

export interface QuickCheckResult {
  source: "quick"
  strategy: LabStrategy
  /** The page as fetched, after redirects. */
  url: string
  fetchedAt: string
  status: number
  ttfb: { median: number; samples: number[] }
  html: { bytes: number; transferBytes: number | null; encoding: string | null }
  /** HIT, MISS, STALE, PRERENDER… as the edge said it, or null when it said nothing. */
  edge: { cached: boolean | null; status: string | null; cacheControl: string | null }
  blocking: { styles: number; scripts: number; bytes: number | null; files: QuickFile[] }
  images: { count: number; unsized: number; notLazy: number; largest: QuickFile[] }
  fonts: { files: number; hosts: string[] }
  thirdParty: string[]
  findings: QuickFinding[]
}

export type QuickFinding =
  | { kind: "slow-server"; ms: number; severity: Severity }
  | { kind: "not-cached"; status: string | null; severity: Severity }
  | { kind: "not-compressed"; bytes: number; severity: Severity }
  | { kind: "heavy-html"; bytes: number; severity: Severity }
  | { kind: "blocking"; styles: number; scripts: number; bytes: number | null; severity: Severity }
  | { kind: "heavy-image"; url: string; bytes: number; severity: Severity }
  | { kind: "unsized-images"; count: number; severity: Severity }
  | { kind: "not-lazy"; count: number; severity: Severity }
  | { kind: "font-host"; hosts: string[]; severity: Severity }
  | { kind: "third-party"; hosts: string[]; severity: Severity }

export type Severity = "needs-improvement" | "poor"

/* ── Reading the HTML ──────────────────────────────────────────────────── */

const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "")
  return out
}

function decode(v: string): string {
  return v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
}

function absolute(href: string | undefined, base: string): string | null {
  if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#")) return null
  try {
    const u = new URL(href, base)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Storelib's own hosts: the page's, storelib.com's and the file storage's. Everything else is another company's. */
export function isOwnHost(host: string, pageHost: string): boolean {
  const h = host.toLowerCase()
  if (h === pageHost.toLowerCase()) return true
  return h === "storelib.com" || h.endsWith(".storelib.com") || h.endsWith(".supabase.co")
}

/** The candidate a phone or a computer would most likely take from a srcset. */
function fromSrcset(srcset: string | undefined, want: number): string | null {
  if (!srcset) return null
  const list = srcset
    .split(/,\s+(?=\S)/)
    .map((c) => {
      const [u, d] = c.trim().split(/\s+/)
      const w = d && d.endsWith("w") ? Number.parseInt(d, 10) : d && d.endsWith("x") ? Number.parseFloat(d) * 1000 : 0
      return { u, w: Number.isFinite(w) ? w : 0 }
    })
    .filter((c) => c.u)
  if (list.length === 0) return null
  list.sort((a, b) => a.w - b.w)
  return (list.find((c) => c.w >= want) ?? list[list.length - 1]).u
}

const CSS_MEDIA_NOT_BLOCKING = /^\s*(print|speech|not all|\(min-width:\s*\d{4,}px\))/i

/**
 * What a page's HTML says it will load. The text of scripts, styles,
 * noscript and template is taken out first, so a tag written inside them
 * (a framework's data, an embed's fallback) is not counted.
 */
export function analyzeHtml(html: string, pageUrl: string, strategy: LabStrategy = "mobile"): HtmlFacts {
  const pageHost = hostOf(pageUrl) ?? ""
  const inlineCss: string[] = []
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|template|noscript)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, (_m, t: string, a: string) => (t.toLowerCase() === "script" ? `<script${a}>` : ""))
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => {
      inlineCss.push(css)
      return ""
    })
  const headEnd = (() => {
    const i = clean.search(/<\/head\s*>|<body\b/i)
    return i < 0 ? clean.length : i
  })()

  const facts: HtmlFacts = { blockingStyles: [], blockingScripts: [], images: [], fontFiles: [], fontHosts: [], thirdPartyHosts: [] }
  const third = new Set<string>()
  const fonts = new Set<string>()
  const fontHosts = new Set<string>()
  const note = (url: string | null) => {
    const h = url ? hostOf(url) : null
    if (h && !isOwnHost(h, pageHost)) third.add(h)
  }
  const want = strategy === "mobile" ? 828 : 1920

  for (const m of clean.matchAll(TAG)) {
    const tag = m[1].toLowerCase()
    const a = attrsOf(m[2] ?? "")
    const inHead = (m.index ?? 0) < headEnd
    if (tag === "link") {
      const rel = (a.rel ?? "").toLowerCase().split(/\s+/)
      const href = absolute(a.href, pageUrl)
      if (!href) continue
      if (rel.includes("stylesheet") && !rel.includes("alternate")) {
        note(href)
        const host = hostOf(href) ?? ""
        if (/fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|use\.fontawesome\.com/.test(host)) fontHosts.add(host)
        if (inHead && !("disabled" in a) && !CSS_MEDIA_NOT_BLOCKING.test(a.media ?? "")) facts.blockingStyles.push(href)
      } else if (rel.includes("preload") && (a.as ?? "").toLowerCase() === "font") {
        fonts.add(href)
        note(href)
      } else if (rel.includes("preload") || rel.includes("modulepreload")) {
        note(href)
      }
    } else if (tag === "script") {
      const src = absolute(a.src, pageUrl)
      if (!src) continue
      note(src)
      const type = (a.type ?? "").toLowerCase()
      const runs = type === "" || type === "text/javascript" || type === "application/javascript"
      if (inHead && runs && !("async" in a) && !("defer" in a)) facts.blockingScripts.push(src)
    } else if (tag === "img") {
      const url = absolute(fromSrcset(a.srcset, want) ?? a.src ?? a["data-src"], pageUrl)
      note(url)
      const style = (a.style ?? "").replace(/\s+/g, "").toLowerCase()
      const sized =
        (!!a.width && !!a.height) ||
        style.includes("aspect-ratio") ||
        style.includes("position:absolute") ||
        (/(^|;)width:/.test(style) && /(^|;)height:/.test(style))
      facts.images.push({ url, sized, lazy: (a.loading ?? "").toLowerCase() === "lazy", eager: (a.fetchpriority ?? "").toLowerCase() === "high" })
    } else if (tag === "iframe" || tag === "video" || tag === "source" || tag === "audio") {
      note(absolute(a.src, pageUrl))
    }
  }
  for (const css of inlineCss) {
    for (const block of css.match(/@font-face\s*{[^}]*}/gi) ?? []) {
      for (const u of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        const href = absolute(u[1], pageUrl)
        if (href) {
          fonts.add(href)
          note(href)
        }
      }
    }
    for (const u of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) {
      const href = absolute(u[1], pageUrl)
      const host = href ? hostOf(href) : null
      if (host && /fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net/.test(host)) fontHosts.add(host)
      note(href)
    }
  }
  facts.fontFiles = [...fonts]
  facts.fontHosts = [...fontHosts]
  facts.thirdPartyHosts = [...third].sort()
  return facts
}

/** The images after the first ABOVE_FOLD in the page, without loading="lazy" and not marked as the main image. */
const ABOVE_FOLD = 3
export function notLazyCount(images: HtmlFacts["images"]): number {
  return images.filter((im, i) => i >= ABOVE_FOLD && !im.lazy && !im.eager).length
}

/* ── What it means ─────────────────────────────────────────────────────── */

/** Under these nothing is said. */
export const QUICK_LINES = {
  /** Google's TTFB lines (lib/website-builder/web-performance.ts PERF_THRESHOLDS.ttfb). */
  ttfb: [800, 1800] as const,
  htmlBytes: [250_000, 600_000] as const,
  uncompressedFrom: 20_000,
  imageBytes: [500_000, 1_500_000] as const,
  blockingBytes: 150_000,
  blockingStyles: 3,
  thirdParty: [3, 6] as const,
}

const sev = (v: number, [mid, poor]: readonly [number, number]): Severity | null => (v > poor ? "poor" : v > mid ? "needs-improvement" : null)

/** The findings, worst first. Each is only said when the number behind it is past its line. */
export function quickFindings(r: Omit<QuickCheckResult, "findings">): QuickFinding[] {
  const out: QuickFinding[] = []
  const t = sev(r.ttfb.median, QUICK_LINES.ttfb)
  if (t) out.push({ kind: "slow-server", ms: r.ttfb.median, severity: t })
  if (r.edge.cached === false) out.push({ kind: "not-cached", status: r.edge.status, severity: "needs-improvement" })
  if (!r.html.encoding && r.html.bytes >= QUICK_LINES.uncompressedFrom) out.push({ kind: "not-compressed", bytes: r.html.bytes, severity: r.html.bytes > 100_000 ? "poor" : "needs-improvement" })
  const h = sev(r.html.bytes, QUICK_LINES.htmlBytes)
  if (h) out.push({ kind: "heavy-html", bytes: r.html.bytes, severity: h })
  if (r.blocking.scripts > 0 || r.blocking.styles > QUICK_LINES.blockingStyles || (r.blocking.bytes ?? 0) > QUICK_LINES.blockingBytes) {
    out.push({ kind: "blocking", styles: r.blocking.styles, scripts: r.blocking.scripts, bytes: r.blocking.bytes, severity: r.blocking.scripts > 0 || (r.blocking.bytes ?? 0) > 2 * QUICK_LINES.blockingBytes ? "poor" : "needs-improvement" })
  }
  const big = r.images.largest[0]
  if (big && big.bytes !== null) {
    const s = sev(big.bytes, QUICK_LINES.imageBytes)
    if (s) out.push({ kind: "heavy-image", url: big.url, bytes: big.bytes, severity: s })
  }
  if (r.images.unsized > 0) out.push({ kind: "unsized-images", count: r.images.unsized, severity: r.images.unsized > 3 ? "poor" : "needs-improvement" })
  if (r.images.notLazy > 2) out.push({ kind: "not-lazy", count: r.images.notLazy, severity: "needs-improvement" })
  if (r.fonts.hosts.length > 0) out.push({ kind: "font-host", hosts: r.fonts.hosts, severity: "needs-improvement" })
  const others = r.thirdParty.filter((x) => !r.fonts.hosts.includes(x))
  const tp = sev(others.length, QUICK_LINES.thirdParty)
  if (tp) out.push({ kind: "third-party", hosts: others.slice(0, 8), severity: tp })
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "poor" ? -1 : 1))
}

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return 0
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2)
}

/** HIT, MISS… from whichever edge answered: Vercel, Cloudflare, or a generic cache. */
export function edgeOf(headers: Headers): QuickCheckResult["edge"] {
  const raw = headers.get("x-vercel-cache") ?? headers.get("cf-cache-status") ?? headers.get("x-cache") ?? null
  const status = raw ? raw.split(/[\s,]/)[0].toUpperCase().slice(0, 20) : null
  const age = Number(headers.get("age") ?? "")
  const cached = status ? /^(HIT|STALE|PRERENDER|REVALIDATED|UPDATING)$/.test(status) : Number.isFinite(age) && age > 0 ? true : null
  return { cached, status, cacheControl: (headers.get("cache-control") ?? "").slice(0, 120) || null }
}

/* ── Running it ────────────────────────────────────────────────────────── */

export type QuickFetch = (url: string, init: RequestInit) => Promise<Response>

export type QuickRun = { ok: true; result: QuickCheckResult } | { ok: false; error: "unreachable" | "failed" }

const UA: Record<LabStrategy, string> = {
  mobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 StorelibQuickCheck/1.0",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 StorelibQuickCheck/1.0",
}

/**
 * A file the page links to is only asked for its size when it is an
 * ordinary public address: http(s), no address written as numbers, no
 * localhost, no internal names, the usual ports. The page's HTML is the
 * creator's, so the server never follows it somewhere private.
 */
export function safeToAsk(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    if (u.port && u.port !== "443" && u.port !== "80") return false
    if (u.username || u.password) return false
    const h = u.hostname.toLowerCase()
    if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || h === "localhost") return false
    if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false
    return true
  } catch {
    return false
  }
}

async function readCapped(res: Response): Promise<{ text: string; bytes: number }> {
  const reader = res.body?.getReader()
  if (!reader) return { text: "", bytes: 0 }
  const chunks: Uint8Array[] = []
  let bytes = 0
  let kept = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (kept < MAX_HTML_BYTES) {
      chunks.push(value)
      kept += value.byteLength
    } else {
      void reader.cancel().catch(() => {})
      break
    }
  }
  const all = new Uint8Array(kept)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return { text: new TextDecoder().decode(all), bytes }
}

async function sizeOf(doFetch: QuickFetch, url: string, ua: string): Promise<number | null> {
  if (!safeToAsk(url)) return null
  try {
    const res = await doFetch(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": ua, accept: "*/*", "accept-encoding": "br, gzip" }, signal: AbortSignal.timeout(HEAD_TIMEOUT_MS), cache: "no-store" })
    const n = Number(res.headers.get("content-length") ?? "")
    return res.ok && Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * The quick check of `target` (the creator's own page; the caller decides
 * the address from the database). `doFetch` is the global fetch in the
 * route and a fake in the tests; `now` measures time.
 */
export async function runQuickCheck(
  target: string,
  strategy: LabStrategy,
  opts: { fetch?: QuickFetch; now?: () => number; samples?: number } = {},
): Promise<QuickRun> {
  const doFetch: QuickFetch = opts.fetch ?? ((u, i) => fetch(u, i))
  const now = opts.now ?? (() => performance.now())
  const ua = UA[strategy]
  const headers = { "user-agent": ua, accept: "text/html,application/xhtml+xml", "accept-encoding": "br, gzip", "accept-language": "en" }
  const deadline = now() + QUICK_TIMEOUT_MS
  const samples: number[] = []
  let first: Response
  let body: { text: string; bytes: number }
  try {
    const t0 = now()
    first = await doFetch(target, { method: "GET", redirect: "follow", headers, signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS), cache: "no-store" })
    samples.push(now() - t0)
    if (first.status >= 400) return { ok: false, error: "unreachable" }
    body = await readCapped(first)
  } catch {
    return { ok: false, error: "unreachable" }
  }
  const finalUrl = first.url || target
  let edge = edgeOf(first.headers)
  /* More asks, the body left unread: only the time to the first answer is wanted. */
  for (let i = 1; i < (opts.samples ?? QUICK_SAMPLES) && now() < deadline - SAMPLE_TIMEOUT_MS; i++) {
    try {
      const t0 = now()
      const res = await doFetch(finalUrl, { method: "GET", redirect: "follow", headers, signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS), cache: "no-store" })
      samples.push(now() - t0)
      edge = edgeOf(res.headers)
      void res.body?.cancel().catch(() => {})
    } catch {
      break
    }
  }

  const facts = analyzeHtml(body.text, finalUrl, strategy)
  const encoding = (first.headers.get("content-encoding") ?? "").toLowerCase().trim() || null
  const transfer = Number(first.headers.get("content-length") ?? "")

  /* The files' sizes, a few at a time, inside the time that is left. */
  const blockingUrls = [...facts.blockingStyles, ...facts.blockingScripts].slice(0, 8)
  const imageUrls = [...new Set(facts.images.map((i) => i.url).filter((u): u is string => !!u))].slice(0, MAX_HEADS - blockingUrls.length)
  const asks = [...blockingUrls, ...imageUrls]
  const sizes = new Map<string, number | null>()
  for (let i = 0; i < asks.length && now() < deadline - HEAD_TIMEOUT_MS; i += 6) {
    const batch = asks.slice(i, i + 6)
    const got = await Promise.all(batch.map((u) => sizeOf(doFetch, u, ua)))
    batch.forEach((u, k) => sizes.set(u, got[k]))
  }
  const blockingFiles: QuickFile[] = blockingUrls.map((url) => ({ url, bytes: sizes.get(url) ?? null }))
  const known = blockingFiles.filter((f) => f.bytes !== null)
  const largest: QuickFile[] = imageUrls
    .map((url) => ({ url, bytes: sizes.get(url) ?? null }))
    .filter((f): f is { url: string; bytes: number } => f.bytes !== null)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3)

  const base: Omit<QuickCheckResult, "findings"> = {
    source: "quick",
    strategy,
    url: finalUrl.slice(0, 600),
    fetchedAt: new Date().toISOString(),
    status: first.status,
    ttfb: { median: Math.round(median(samples)), samples: samples.map((s) => Math.round(s)) },
    html: { bytes: body.bytes, transferBytes: Number.isFinite(transfer) && transfer > 0 ? transfer : null, encoding: encoding === "identity" ? null : encoding },
    edge,
    blocking: { styles: facts.blockingStyles.length, scripts: facts.blockingScripts.length, bytes: known.length ? known.reduce((s, f) => s + (f.bytes ?? 0), 0) : null, files: blockingFiles.slice(0, 6).map((f) => ({ url: f.url.slice(0, 300), bytes: f.bytes })) },
    images: { count: facts.images.length, unsized: facts.images.filter((i) => !i.sized).length, notLazy: notLazyCount(facts.images), largest: largest.map((f) => ({ url: f.url.slice(0, 300), bytes: f.bytes })) },
    fonts: { files: facts.fontFiles.length, hosts: facts.fontHosts },
    thirdParty: facts.thirdPartyHosts.slice(0, 12),
  }
  return { ok: true, result: { ...base, findings: quickFindings(base) } }
}
