/**
 * ===========================================================================
 *  ONE PAGE'S SEO SCORE, FROM THE PAGE AS IT IS SERVED
 * ===========================================================================
 * Pure: the caller fetches the page and its host's robots.txt, and this
 * reads them. Every check is kept with what it found, so a low score says
 * why. A check that cannot be known (Google has not been asked yet) is left
 * out of the score rather than counted as a pass or a fail: the score is the
 * share of the points that could be judged.
 */

import { robotsAllowed } from "@/lib/seo/robots-match"

export type CheckState = "pass" | "fail" | "skip"

export interface Check {
  id: string
  label: string
  state: CheckState
  /** What was found, in a few words. */
  found: string
  points: number
}

export interface PageFacts {
  url: string
  /** 0 when the page did not answer at all. */
  status: number
  headers: Record<string, string>
  html: string
  inSitemap: boolean
  /** null when robots.txt could not be read. */
  robotsAllowed: boolean | null
  /** Google's verdict when it is known. */
  google: "indexed" | "not_indexed" | null
  /** Why the page could not be fetched, when it could not. */
  fetchError?: string | null
}

export interface ScoreResult {
  score: number
  checks: Check[]
}

/* Points per check. They add up to 100. */
export const POINTS = {
  http: 15,
  indexable: 15,
  canonical: 10,
  title: 8,
  description: 8,
  h1: 6,
  ogTitle: 4,
  ogImage: 4,
  structuredData: 8,
  imageAlt: 5,
  sitemap: 6,
  robots: 6,
  google: 5,
} as const

export const TITLE_RANGE = [10, 70] as const
export const DESCRIPTION_RANGE = [50, 170] as const

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }
export function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      const k = e.toLowerCase()
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16))
      if (k.startsWith("#") && k !== "#39") return String.fromCodePoint(parseInt(k.slice(1), 10))
      return ENTITIES[k] ?? m
    })
    .replace(/\s+/g, " ")
    .trim()
}

/** Every tag of one name, with its attributes read. */
export function tags(html: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi")
  for (const m of html.matchAll(re)) {
    const attrs: Record<string, string> = {}
    for (const a of m[1].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "")
    }
    out.push(attrs)
  }
  return out
}

/** The page without scripts, styles and comments, for counting what a reader sees. */
function visible(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
}

function metaContent(html: string, key: string): string | null {
  for (const t of tags(html, "meta")) {
    if ((t.name ?? t.property ?? "").toLowerCase() === key) return t.content ?? ""
  }
  return null
}

/** The address as two pages would be compared: host in lower case, no fragment, no trailing slash past the root. */
export function sameAddress(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const p = new URL(u)
      p.hash = ""
      const path = p.pathname.length > 1 ? p.pathname.replace(/\/+$/, "") : "/"
      return `${p.protocol}//${p.host.toLowerCase()}${path}${p.search}`
    } catch {
      return u
    }
  }
  return norm(a) === norm(b)
}

export function noindexIn(value: string | null | undefined): boolean {
  return !!value && /(^|[\s,:])(noindex|none)(\s*,|\s*$|\s)/i.test(value.toLowerCase())
}

const len = (s: string) => [...s].length

export function scorePage(facts: PageFacts): ScoreResult {
  const checks: Check[] = []
  const add = (id: keyof typeof POINTS, label: string, state: CheckState, found: string) => checks.push({ id, label, state, found, points: POINTS[id] })
  const ok = facts.status === 200
  const html = ok ? facts.html : ""
  const shown = visible(html)
  const headerRobots = facts.headers["x-robots-tag"] ?? ""

  add("http", "Answers 200", ok ? "pass" : "fail", facts.status ? `HTTP ${facts.status}` : facts.fetchError || "No answer")

  const metaRobots = [metaContent(html, "robots"), metaContent(html, "googlebot")].filter((v): v is string => v !== null)
  const noindex = noindexIn(headerRobots) || metaRobots.some(noindexIn)
  add(
    "indexable",
    "No noindex",
    ok && !noindex ? "pass" : "fail",
    !ok ? "Page did not load" : noindexIn(headerRobots) ? `X-Robots-Tag: ${headerRobots}` : noindex ? `robots meta: ${metaRobots.join(", ")}` : "Indexable",
  )

  const canonical = tags(html, "link").find((t) => (t.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))?.href ?? ""
  const canonicalAbs = (() => {
    try {
      return canonical ? new URL(canonical, facts.url).toString() : ""
    } catch {
      return ""
    }
  })()
  add(
    "canonical",
    "Canonical is this address",
    canonicalAbs && sameAddress(canonicalAbs, facts.url) ? "pass" : "fail",
    !canonical ? "No canonical link" : sameAddress(canonicalAbs, facts.url) ? "Self canonical" : `Points to ${canonicalAbs}`,
  )

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html.replace(/<svg\b[\s\S]*?<\/svg>/gi, ""))
  const title = titleMatch ? decode(titleMatch[1]) : ""
  const titleOk = len(title) >= TITLE_RANGE[0] && len(title) <= TITLE_RANGE[1]
  add("title", "Title, 10 to 70 characters", titleOk ? "pass" : "fail", title ? `${len(title)} characters: ${title.slice(0, 90)}` : "No title")

  const description = metaContent(html, "description") ?? ""
  const descriptionOk = len(description) >= DESCRIPTION_RANGE[0] && len(description) <= DESCRIPTION_RANGE[1]
  add("description", "Description, 50 to 170 characters", descriptionOk ? "pass" : "fail", description ? `${len(description)} characters` : "No description")

  const h1s = [...shown.matchAll(/<h1\b/gi)].length
  add("h1", "Exactly one h1", h1s === 1 ? "pass" : "fail", `${h1s} h1`)

  const ogTitle = metaContent(html, "og:title")
  add("ogTitle", "Open Graph title", ogTitle ? "pass" : "fail", ogTitle ? ogTitle.slice(0, 90) : "No og:title")
  const ogImage = metaContent(html, "og:image")
  add("ogImage", "Open Graph image", ogImage ? "pass" : "fail", ogImage ? ogImage.slice(0, 120) : "No og:image")

  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  let broken = 0
  const types: string[] = []
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b.trim())
      const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed]
      for (const item of items) if (item?.["@type"]) types.push(String(item["@type"]))
    } catch {
      broken++
    }
  }
  add(
    "structuredData",
    "Structured data that parses",
    blocks.length > 0 && broken === 0 ? "pass" : "fail",
    blocks.length === 0 ? "No JSON-LD" : broken ? `${broken} of ${blocks.length} blocks do not parse` : types.length ? [...new Set(types)].slice(0, 5).join(", ") : `${blocks.length} blocks`,
  )

  const images = tags(shown, "img")
  const missingAlt = images.filter((i) => !("alt" in i)).length
  add("imageAlt", "Images have alt text", ok && missingAlt === 0 ? "pass" : "fail", !ok ? "Page did not load" : images.length === 0 ? "No images" : missingAlt ? `${missingAlt} of ${images.length} without alt` : `${images.length} images`)

  add("sitemap", "In the sitemap", facts.inSitemap ? "pass" : "fail", facts.inSitemap ? "Listed" : "Not listed")

  if (facts.robotsAllowed === null) add("robots", "Allowed by robots.txt", "skip", "robots.txt could not be read")
  else add("robots", "Allowed by robots.txt", facts.robotsAllowed ? "pass" : "fail", facts.robotsAllowed ? "Allowed" : "Disallowed for Googlebot")

  if (facts.google === null) add("google", "Indexed on Google", "skip", "Not checked with Google")
  else add("google", "Indexed on Google", facts.google === "indexed" ? "pass" : "fail", facts.google === "indexed" ? "Indexed" : "Not indexed")

  const judged = checks.filter((c) => c.state !== "skip")
  const possible = judged.reduce((n, c) => n + c.points, 0)
  const earned = judged.filter((c) => c.state === "pass").reduce((n, c) => n + c.points, 0)
  return { score: possible ? Math.round((earned / possible) * 100) : 0, checks }
}

/* ── robots.txt ────────────────────────────────────────────────────────── */

/**
 * Whether Googlebot may fetch a path, by Google's reading of robots.txt:
 * lib/seo/robots-match.ts is the matcher (the agent's own group over `*`,
 * the longest matching rule, Allow winning a tie, `*` and a closing `$`).
 */
export function robotsAllows(txt: string, pathWithQuery: string, agent = "googlebot"): boolean {
  return robotsAllowed(txt, pathWithQuery, agent)
}
