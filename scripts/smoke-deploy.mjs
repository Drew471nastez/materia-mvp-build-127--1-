#!/usr/bin/env node
/**
 * Is a deployment answering the way Storelib should? docs/operations/release-safety.md.
 *
 *   BASE_URL=https://storelib-abc123.vercel.app node scripts/smoke-deploy.mjs
 *   node scripts/smoke-deploy.mjs --base http://localhost:3100
 *
 * Environment:
 *   BASE_URL      the deployment (required, or --base)
 *   SMOKE_SITE    optional: a website to open. A bare username is opened at
 *                 BASE_URL/w/<name> (a preview has no subdomains); a full
 *                 address such as https://demo.storelib.com is opened as is,
 *                 which proves the subdomain rewrite.
 *   VERCEL_AUTOMATION_BYPASS_SECRET   sent as x-vercel-protection-bypass when
 *                 preview deployments are behind Vercel's Deployment Protection.
 *   SMOKE_NO_DATABASE=1  for a local server built on placeholder keys, which
 *                 has no database: /api/health only has to answer JSON, and
 *                 sitemap.xml may answer 503. Never set it for a deployment.
 *
 * Checks, each printed ok or FAIL:
 *   the marketing pages answer 200 and may be held by the CDN (public);
 *     /explore may redirect home instead, which it does while the
 *     marketplace is switched off;
 *   /app is never public, signed out included (its redirect to sign in
 *     carries no Cache-Control, which no shared cache stores);
 *   the website checkout is no-store;
 *   the security headers from vercel.json are present (skipped on localhost,
 *     where `next start` does not apply vercel.json);
 *   /api/health; robots.txt and sitemap.xml.
 *
 * GET only, never a cookie. Exits 1 when anything failed.
 */
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const TIMEOUT_MS = 20_000

export const SECURITY_HEADERS = ["x-frame-options", "x-content-type-options", "referrer-policy"]

/** What a Cache-Control value allows. Exported for the test suite. */
export function cacheKind(value) {
  const v = String(value ?? "").toLowerCase()
  if (!v) return "none"
  if (v.includes("no-store")) return "no-store"
  if (v.includes("private")) return "private"
  if (v.includes("public") || /s-maxage=\d*[1-9]/.test(v)) return "public"
  if (v.includes("no-cache") || v.includes("max-age=0")) return "no-cache"
  return "other"
}

export function isLocal(base) {
  try {
    const h = new URL(base).hostname
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]"
  } catch {
    return false
  }
}

/** The pages and what each must answer. */
export function plan(base, site, noDatabase = false) {
  const checks = [
    { path: "/", status: [200], cache: ["public"], why: "the home page is held by the CDN" },
    { path: "/pricing", status: [200], cache: ["public"], why: "pricing is held by the CDN" },
    { path: "/explore", status: [200, 307, 308], cache: ["public"], why: "explore is held by the CDN" },
    { path: "/features", status: [200], cache: ["public"], why: "features is held by the CDN" },
    { path: "/app", status: [200, 302, 303, 307, 308], cache: ["private", "no-store", "no-cache", "none"], why: "the dashboard is never shared" },
    { path: "/checkout/site", status: [200, 302, 303, 307, 308, 400, 404], cache: ["no-store"], why: "the website checkout is never stored" },
    { path: "/robots.txt", status: [200], body: /user-agent/i, why: "robots.txt" },
    noDatabase
      ? { path: "/sitemap.xml", status: [200, 503], why: "sitemap.xml" }
      : { path: "/sitemap.xml", status: [200], body: /<(urlset|sitemapindex)\b/, why: "sitemap.xml" },
  ]
  if (site) {
    const url = /^https?:\/\//.test(site) ? site : new URL(`/w/${encodeURIComponent(site)}`, base).href
    checks.push({ url, status: [200], why: `the website ${site} resolves` })
  }
  return checks
}

async function get(url, bypass) {
  const headers = { "user-agent": "storelib-smoke/1", accept: "text/html,application/json,*/*" }
  if (bypass) headers["x-vercel-protection-bypass"] = bypass
  const res = await fetch(url, { method: "GET", redirect: "manual", headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = await res.text()
  return { status: res.status, headers: res.headers, body }
}

async function main() {
  const i = process.argv.indexOf("--base")
  const base = (i >= 0 ? process.argv[i + 1] : process.env.BASE_URL) ?? ""
  if (!base) {
    console.error("smoke: set BASE_URL or pass --base")
    process.exit(2)
  }
  const local = isLocal(base)
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ""
  const noDatabase = process.env.SMOKE_NO_DATABASE === "1"

  let failed = 0
  const lines = []
  const report = (ok, label, detail = "") => {
    if (ok === false) failed++
    const line = `${ok === null ? "skip" : ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`
    lines.push(line)
    console.log(`  ${line}`)
  }

  console.log(`smoke: ${base}${local ? " (local: vercel.json headers are not applied, those checks are skipped)" : ""}`)

  for (const c of plan(base, process.env.SMOKE_SITE, noDatabase)) {
    const url = c.url ?? new URL(c.path, base).href
    const label = c.path ?? url
    let res
    try {
      res = await get(url, bypass)
    } catch (e) {
      report(false, `${label} answers`, e instanceof Error ? e.message : String(e))
      continue
    }
    const cc = res.headers.get("cache-control")
    report(c.status.includes(res.status), `${label} answers ${c.status.join(" or ")}`, `got ${res.status}`)
    if (c.cache) report(c.cache.includes(cacheKind(cc)), `${label}: ${c.why}`, `Cache-Control: ${cc ?? "none"}`)
    if (c.body) report(c.body.test(res.body), `${label} has the expected content`)
    if (c.path === "/") {
      for (const h of SECURITY_HEADERS) {
        if (local) report(null, `security header ${h}`, "localhost")
        else report(!!res.headers.get(h), `security header ${h}`, res.headers.get(h) ?? "missing")
      }
      if (!local) report(!!res.headers.get("content-security-policy") || !!res.headers.get("content-security-policy-report-only"), "a content security policy is sent")
      /* storelib.com and www only (vercel.json, SEC-12): creator sites, custom domains and previews do not get it. */
      if (!local && /^(www\.)?storelib\.com$/i.test(new URL(base).hostname)) report(/camera=/.test(res.headers.get("permissions-policy") ?? ""), "a permissions policy is sent", res.headers.get("permissions-policy") ?? "missing")
    }
  }

  try {
    const res = await get(new URL("/api/health", base).href, bypass)
    let json = null
    try {
      json = JSON.parse(res.body)
    } catch {
      /* not JSON */
    }
    const state = json?.status ?? "not JSON"
    if (!noDatabase) report(res.status === 200 && state === "ok", "/api/health says ok", `${res.status} ${state}`)
    else report(json !== null && (res.status === 200 || res.status === 503), "/api/health answers", `${res.status} ${state}`)
    report(cacheKind(res.headers.get("cache-control")) === "no-store", "/api/health is never cached", res.headers.get("cache-control") ?? "none")
    if (json?.jobs) {
      const bad = json.jobs.filter((j) => j.state === "failed" || j.state === "late")
      if (bad.length) console.log(`  note  jobs not ok: ${bad.map((j) => `${j.job} ${j.state}`).join(", ")}`)
    }
  } catch (e) {
    report(false, "/api/health answers", e instanceof Error ? e.message : String(e))
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs")
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Smoke: ${base}`, "", "```", ...lines, "```", "", failed ? `**${failed} failed**` : "All passed", ""].join("\n"))
    } catch {
      /* a nicety */
    }
  }

  if (failed) {
    console.error(`\nsmoke: ${failed} failed`)
    process.exit(1)
  }
  console.log("\nsmoke: all passed")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
