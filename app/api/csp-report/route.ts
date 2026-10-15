/**
 * ===========================================================================
 *  WHAT THE POLICY WOULD HAVE REFUSED
 * ===========================================================================
 * lib/security/csp.ts ships as report-only, so browsers evaluate the policy
 * and block nothing, posting here what they WOULD have blocked. Reading these
 * for a while across real traffic is what makes it safe to enforce.
 *
 * ---------------------------------------------------------------------------
 *  A REPORT IS NOT A LOG LINE YOU CAN TRUST
 * ---------------------------------------------------------------------------
 * Anybody can post here; it is an unauthenticated endpoint by necessity,
 * because the whole point is that a browser sends it without a session. So
 * nothing here is stored, nothing is trusted, and everything is cut to a
 * length before it reaches the log.
 *
 * MOST OF ALL, THE URL IS STRIPPED OF ITS QUERY. A receipt link, a download
 * link and a password reset link all carry a token in the URL that IS the
 * credential. A violation report includes the address of the page it happened
 * on, and writing that to a log verbatim would put those tokens in the log.
 *
 * EXTENSIONS ARE DROPPED. A browser with an ad blocker or a password manager
 * injects script into every page and reports every one of them. That is the
 * large majority of what arrives here and none of it is about this site.
 *
 * ONLY A SAMPLE ARRIVES. The proxy answers nineteen reports in twenty itself
 * (CSP_REPORT_SAMPLE_RATE, lib/security/csp.ts), so this function is not
 * called for them. What does arrive is logged, up to LINES_PER_MINUTE lines a
 * minute on one instance, so a page that trips the policy on every load
 * cannot fill the log on its own.
 */
import { NextResponse } from "next/server"
import { allowedBeacon, type HitStore } from "@/lib/perf/limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Longer than this and it is not a report, it is somebody being funny. */
const MAX_BODY = 8 * 1024
/** Nothing useful in a report is longer than this. */
const MAX_FIELD = 300

/** Log lines one instance writes a minute; past it, reports are read and not logged. */
const LINES_PER_MINUTE = 30
const lines: HitStore = new Map()

/** Script a browser extension injected into the page. Not our violation. */
const EXTENSION = /^(chrome|moz|safari|ms-browser|webkit-masked-url)[-a-z]*:/i

/** Everything after `?` or `#` may be a credential. It never reaches a log. */
function pathOnly(value: unknown): string {
  const raw = typeof value === "string" ? value : ""
  if (!raw) return ""
  const cut = raw.split(/[?#]/)[0]
  return cut.slice(0, MAX_FIELD)
}

export async function POST(request: Request) {
  try {
    const text = (await request.text()).slice(0, MAX_BODY)
    if (!text) return new NextResponse(null, { status: 204 })

    const parsed: unknown = JSON.parse(text)
    /*
      Two shapes are in the wild: the old `{"csp-report": {...}}` that
      `report-uri` produces, and the newer Reporting API array. Only the
      first is expected here, and the second is read if it turns up.
    */
    const bodies = Array.isArray(parsed)
      ? parsed.map((entry) => (entry as { body?: unknown })?.body).filter(Boolean)
      : [(parsed as { "csp-report"?: unknown })?.["csp-report"] ?? parsed]

    for (const body of bodies) {
      const report = (body ?? {}) as Record<string, unknown>
      const blocked = pathOnly(report["blocked-uri"] ?? report.blockedURL)
      if (!blocked || EXTENSION.test(blocked)) continue

      const directive = pathOnly(report["effective-directive"] ?? report["violated-directive"] ?? report.effectiveDirective)
      const document = pathOnly(report["document-uri"] ?? report.documentURL)

      if (!allowedBeacon("csp", Date.now(), LINES_PER_MINUTE, lines)) break
      console.warn(`[csp] would have blocked ${blocked} (${directive}) on ${document}`)
    }
  } catch {
    /* Malformed body. Nothing to report about a report. */
  }

  /* Always 204: a browser has nowhere to put an error from this, and a
     failing report endpoint must never look like a failing page. */
  return new NextResponse(null, { status: 204 })
}
