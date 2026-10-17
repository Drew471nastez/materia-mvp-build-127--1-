/**
 * ===========================================================================
 *  A LAB TEST OF ONE PAGE, BY GOOGLE PAGESPEED INSIGHTS
 * ===========================================================================
 * Website settings › Performance › Lab test: one load of one page of the
 * creator's own website on a simulated phone or computer, run by Google's
 * PageSpeed Insights API (Lighthouse) from the server. It is not visitor
 * data and the page never presents it as such.
 *
 * Pure: the address asked for, and what is kept of Google's answer (a few
 * kilobytes of a response of a megabyte or more). The route that runs it is
 * app/api/website-builder/themes/[installId]/performance/lab; the test reads
 * a fixture in tests/fixtures/.
 */

import type { LabEvidence, PerfMetric } from "./web-performance"

export const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
export type LabStrategy = "mobile" | "desktop"

/** Google's own speed test takes 10 to 40 seconds; past this it is given up on. */
export const PSI_TIMEOUT_MS = 55_000
/** One test per site and strategy in this long. */
export const LAB_COOLDOWN_MS = 60_000

export function psiRequestUrl(target: string, strategy: LabStrategy, opts: { key?: string | null; locale?: string | null } = {}): string {
  const q = new URLSearchParams({ url: target, strategy, category: "performance" })
  if (opts.locale && /^[a-z]{2}(-[A-Z]{2})?$/.test(opts.locale)) q.set("locale", opts.locale)
  if (opts.key) q.set("key", opts.key)
  return `${PSI_ENDPOINT}?${q.toString()}`
}

export interface LabMetrics {
  lcp: number | null
  fcp: number | null
  cls: number | null
  tbt: number | null
  si: number | null
  ttfb: number | null
}

export interface LabOpportunity {
  id: string
  title: string
  /** Time Lighthouse estimates the fix would save, in ms. */
  savingsMs: number | null
  savingsBytes: number | null
}

export interface LabResult {
  strategy: LabStrategy
  /** The page Google loaded, after redirects. */
  url: string
  /** When Google ran it. */
  fetchedAt: string
  /** Lighthouse's performance score, 0 to 100. */
  score: number | null
  metrics: LabMetrics
  opportunities: LabOpportunity[]
  /** The heaviest files the page downloaded. */
  largestFiles: Array<{ url: string; bytes: number }>
  /** The element Lighthouse named as the largest contentful paint, as it reads in the page. */
  lcpElement: string | null
  lighthouseVersion: string | null
}

export type LabParse = { ok: true; result: LabResult } | { ok: false; error: LabError }
export type LabError = "quota" | "unreachable" | "failed" | "invalid"

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v ? v.slice(0, max) : null)

function lcpElementOf(audit: any): string | null {
  const items = audit?.details?.items
  if (!Array.isArray(items) || items.length === 0) return null
  /* Lighthouse 10 and later: a list whose first table holds the node; before that the node was the first item. */
  const first = items[0]
  const node = first?.node ?? (Array.isArray(first?.items) ? first.items[0]?.node : null)
  return str(node?.nodeLabel, 160) ?? str(node?.snippet, 160)
}

/**
 * Google's answer, kept small. An error answer is named by what the page
 * can say about it: Google's free quota used up (429), the page could not
 * be loaded by Google (a Lighthouse runtime error), or anything else.
 */
export function parsePsi(json: unknown, status = 200): LabParse {
  const j = json as any
  if (status === 429 || j?.error?.code === 429 || j?.error?.status === "RESOURCE_EXHAUSTED") return { ok: false, error: "quota" }
  if (j?.error) {
    const message = String(j.error.message ?? "")
    return { ok: false, error: /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|NO_FCP|DNS_FAILURE|unable to reliably load/i.test(message) ? "unreachable" : "failed" }
  }
  const lh = j?.lighthouseResult
  if (!lh || typeof lh !== "object" || !lh.audits) return { ok: false, error: "invalid" }
  if (lh.runtimeError?.code && lh.runtimeError.code !== "NO_ERROR") return { ok: false, error: "unreachable" }
  const audits = lh.audits as Record<string, any>
  const value = (id: string) => num(audits[id]?.numericValue)
  const strategy: LabStrategy = lh.configSettings?.formFactor === "desktop" || lh.configSettings?.emulatedFormFactor === "desktop" ? "desktop" : "mobile"
  const rawScore = num(lh.categories?.performance?.score)

  const opportunities: LabOpportunity[] = []
  for (const [id, a] of Object.entries(audits)) {
    const d = a?.details
    if (!d || d.type !== "opportunity") continue
    if (typeof a.score === "number" && a.score >= 0.9) continue
    /* Lighthouse 11 and later also say it per metric: the larger of LCP's and FCP's when the overall figure is missing. */
    const perMetric = Math.max(num(a.metricSavings?.LCP) ?? 0, num(a.metricSavings?.FCP) ?? 0)
    const savingsMs = num(d.overallSavingsMs) ?? (perMetric > 0 ? perMetric : null)
    const savingsBytes = num(d.overallSavingsBytes)
    if ((savingsMs ?? 0) < 50 && (savingsBytes ?? 0) < 20_000) continue
    opportunities.push({ id: id.slice(0, 60), title: str(a.title, 120) ?? id, savingsMs: savingsMs === null ? null : Math.round(savingsMs), savingsBytes: savingsBytes === null ? null : Math.round(savingsBytes) })
  }
  opportunities.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0))

  const weight = audits["total-byte-weight"]?.details?.items
  const largestFiles = Array.isArray(weight)
    ? weight
        .map((i: any) => ({ url: str(i?.url, 300) ?? "", bytes: Math.round(num(i?.totalBytes) ?? 0) }))
        .filter((f: { url: string; bytes: number }) => f.url && f.bytes > 0)
        .sort((a: { bytes: number }, b: { bytes: number }) => b.bytes - a.bytes)
        .slice(0, 3)
    : []

  return {
    ok: true,
    result: {
      strategy,
      url: str(lh.finalDisplayedUrl, 600) ?? str(lh.finalUrl, 600) ?? str(j.id, 600) ?? "",
      fetchedAt: str(lh.fetchTime, 40) ?? str(j.analysisUTCTimestamp, 40) ?? new Date().toISOString(),
      score: rawScore === null ? null : Math.round(rawScore * 100),
      metrics: {
        lcp: value("largest-contentful-paint"),
        fcp: value("first-contentful-paint"),
        cls: value("cumulative-layout-shift"),
        tbt: value("total-blocking-time"),
        si: value("speed-index"),
        ttfb: value("server-response-time"),
      },
      opportunities: opportunities.slice(0, 5),
      largestFiles,
      lcpElement: lcpElementOf(audits["largest-contentful-paint-element"]),
      lighthouseVersion: str(lh.lighthouseVersion, 20),
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const IMAGE_AUDITS = new Set(["uses-optimized-images", "modern-image-formats", "uses-responsive-images", "offscreen-images", "efficient-animated-content"])
const IMAGE_FILE = /\.(jpe?g|png|webp|avif|gif)(\?|$)/i

/**
 * What a lab test can honestly say about a slow metric. Only what Google's
 * test reported: bytes it says images could lose, the heaviest image it
 * downloaded, the time blocking files cost, the server's answer time.
 * Nothing for INP, which a lab load has no visitor to measure.
 */
export function labEvidence(lab: LabResult | null | undefined): Partial<Record<PerfMetric, LabEvidence>> {
  if (!lab) return {}
  const out: Partial<Record<PerfMetric, LabEvidence>> = {}
  const imageBytes = lab.opportunities.filter((o) => IMAGE_AUDITS.has(o.id)).reduce((s, o) => s + (o.savingsBytes ?? 0), 0)
  const heaviestImage = lab.largestFiles.find((f) => IMAGE_FILE.test(f.url))
  if (heaviestImage && heaviestImage.bytes >= 500_000) out.lcp = { kind: "largest-file", url: heaviestImage.url, bytes: heaviestImage.bytes }
  else if (imageBytes >= 100_000) out.lcp = { kind: "image-savings", bytes: imageBytes }
  const blocking = lab.opportunities.find((o) => o.id === "render-blocking-resources")
  if (blocking && (blocking.savingsMs ?? 0) >= 300) out.fcp = { kind: "render-blocking", ms: blocking.savingsMs ?? 0 }
  if (lab.metrics.ttfb !== null && lab.metrics.ttfb >= 600) out.ttfb = { kind: "server-response", ms: Math.round(lab.metrics.ttfb) }
  return out
}

/** "hero.jpg" out of a file's address, for a sentence. */
export function fileNameOf(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname
    return decodeURIComponent(last).slice(0, 60)
  } catch {
    return url.slice(0, 60)
  }
}

/** "2.1 MB", "640 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1000))} KB`
}
