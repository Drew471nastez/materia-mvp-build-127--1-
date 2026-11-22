/**
 * ===========================================================================
 *  THEME RELEASES: VERSIONS, WHICH ONES A WEBSITE HAS, WHICH ONES IT LACKS
 * ===========================================================================
 * /admin/themes publishes a theme's improvements as releases, each with a
 * version and notes (theme_releases, supabase/sql/RUN_THEME_RELEASES.sql).
 * A release updates one of two things:
 *
 *   'base'           the shared theme every Storelib template is made from
 *                    (theme-packages/<CODE_THEME_PACKAGE>/base): every
 *                    website made from any template can take it.
 *   a listing slug   one template, or one theme uploaded to the marketplace.
 *
 * ONE NUMBERING PER THEME. The base and the templates made from it share a
 * version line (their family is CODE_THEME_PACKAGE), the way a Shopify theme
 * has one number whatever preset a store started from: 2.1.0 of the base,
 * then 2.1.1 of Clothing alone. An uploaded theme is a family of its own.
 * A website's version is the newest release it has taken, kept in its
 * settings (compat.release) when it was added or updated.
 *
 * Pure and client safe: the library's version line, the update dialog, the
 * admin form and the routes all decide with these functions.
 */
import { CODE_TEMPLATES, CODE_THEME_PACKAGE, LISTING_SLUG_RE, listingSlugOfSettings } from "./marketplace-shared"

export const BASE_TARGET = "base"
export const VERSION_RE = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/
export const RELEASE_NOTES_MAX = 4000

export type ReleaseSource = "zip" | "code"
/** A whole theme, or only what one template lays over the base (its pages, settings and pictures). */
export type ReleaseLayer = "theme" | "overlay"

/** A release as a creator's page may see it: no storage path, no manifest. */
export interface ThemeRelease {
  id: string
  target: string
  family: string
  version: string
  notes: string
  source: ReleaseSource
  published: boolean
  publishedAt: string | null
  createdAt: string
}

export function isCodeTemplateSlug(slug: string | null | undefined): boolean {
  return !!slug && CODE_TEMPLATES.some((t) => t.slug === slug)
}

/** The version line a target belongs to. */
export function releaseFamily(target: string): string {
  return target === BASE_TARGET || isCodeTemplateSlug(target) ? CODE_THEME_PACKAGE : target
}

export function isReleaseTarget(v: unknown): v is string {
  return typeof v === "string" && (v === BASE_TARGET || LISTING_SLUG_RE.test(v))
}

export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null
  const m = VERSION_RE.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Negative when a is older, positive when newer, 0 when equal. An unreadable version is the oldest. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0)
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

export const newestFirst = <T extends Pick<ThemeRelease, "version" | "createdAt">>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => compareVersions(b.version, a.version) || Date.parse(b.createdAt) - Date.parse(a.createdAt))

/** Whether a release updates websites made from this listing: its own, or the base for a template. */
export function appliesTo(r: Pick<ThemeRelease, "target">, slug: string): boolean {
  return r.target === slug || (r.target === BASE_TARGET && isCodeTemplateSlug(slug))
}

/** The published releases a listing's websites can take, newest first. */
export function releasesFor<T extends Pick<ThemeRelease, "target" | "version" | "createdAt" | "published">>(slug: string, releases: readonly T[]): T[] {
  return newestFirst(releases.filter((r) => r.published && appliesTo(r, slug)))
}

/** The newest published release of each layer a listing is made of: the base and its own. */
export function currentLayers<T extends Pick<ThemeRelease, "target" | "version" | "createdAt" | "published">>(slug: string, releases: readonly T[]): { base: T | null; own: T | null } {
  const mine = releasesFor(slug, releases)
  return { base: mine.find((r) => r.target === BASE_TARGET) ?? null, own: mine.find((r) => r.target === slug) ?? null }
}

/**
 * A new release's version, checked against the line it joins: higher than
 * every release a website it reaches could already have. For the base that
 * is the whole family (every template's too); for a template, the base's
 * and its own; for an uploaded theme, its own. Null when it is fine.
 */
export function versionProblem(target: string, version: string, existing: readonly Pick<ThemeRelease, "target" | "version" | "family">[]): string | null {
  if (!parseVersion(version)) return "Write the version as three numbers, like 2.1.0."
  const family = releaseFamily(target)
  const reach = existing.filter((r) =>
    target === BASE_TARGET ? r.family === family : r.target === target || (r.target === BASE_TARGET && isCodeTemplateSlug(target)),
  )
  if (reach.some((r) => r.target === target && compareVersions(r.version, version) === 0)) return `Version ${version} is already released.`
  const top = reach.reduce<string | null>((best, r) => (best === null || compareVersions(r.version, best) > 0 ? r.version : best), null)
  if (top && compareVersions(version, top) <= 0) return `The newest release here is ${top}. The new one needs a higher number.`
  return null
}

/** The version a website has taken, from its settings, or null for one added before releases were kept. */
export function installedReleaseOf(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null
  const s = settings as Record<string, unknown>
  const compat = s.compat && typeof s.compat === "object" ? (s.compat as Record<string, unknown>) : null
  const v = compat ? compat.release : s[RELEASE_SETTINGS_KEY]
  return typeof v === "string" && parseVersion(v) ? v : null
}

/** Where a website that is not in the compatible profile keeps its version. */
export const RELEASE_SETTINGS_KEY = "marketplace_release"

/** Settings with the version written in, where installedReleaseOf reads it. */
export function withInstalledRelease(settings: unknown, version: string): Record<string, unknown> {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {}
  return s.compat && typeof s.compat === "object" ? { ...s, compat: { ...(s.compat as Record<string, unknown>), release: version } } : { ...s, [RELEASE_SETTINGS_KEY]: version }
}

export interface VersionState {
  /** The listing the website was added from. */
  slug: string
  /** Its version, or null when it was added before releases were kept. */
  installed: string | null
  /** The newest release it could have. */
  latest: ThemeRelease | null
  /** Releases it has not taken, newest first. Every one of them when `installed` is null. */
  pending: ThemeRelease[]
  /** The notes of the version it has, for View release notes when it is up to date. */
  current: ThemeRelease | null
}

/**
 * Where one website stands: null when it was not added from the marketplace,
 * or its theme has no releases yet (there is nothing to say about a version).
 */
export function versionState(settings: unknown, releases: readonly ThemeRelease[]): VersionState | null {
  const slug = listingSlugOfSettings(settings)
  if (!slug) return null
  const mine = releasesFor(slug, releases)
  if (!mine.length) return null
  const installed = installedReleaseOf(settings)
  const pending = installed ? mine.filter((r) => compareVersions(r.version, installed) > 0) : mine
  const current = installed ? (mine.find((r) => r.version === installed) ?? null) : null
  return { slug, installed, latest: mine[0], pending, current }
}

export const hasUpdate = (s: VersionState | null | undefined): boolean => !!s && s.pending.length > 0

/** The name the updated copy is given: the website's own, and the version it now has. */
export function updatedCopyName(name: string, version: string): string {
  const base = name.replace(/\s+\(\d{1,4}\.\d{1,4}\.\d{1,4}\)$/, "").trim() || "Website"
  const tail = ` (${version})`
  return `${base.slice(0, 80 - tail.length)}${tail}`
}

/** What /admin/themes may write as a release, read from a request body. */
export interface ReleaseInput {
  target: string
  version: string
  notes: string
  source: ReleaseSource
  path: string | null
  publish: boolean
}

export const RELEASE_UPLOAD_RE = /^theme-releases\/(?:base|[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/[0-9a-f-]{36}\.zip$/i

export function parseReleaseInput(body: Record<string, unknown> | null): { ok: true; value: ReleaseInput } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Nothing was sent." }
  if (!isReleaseTarget(body.target)) return { ok: false, error: "Choose the theme this release updates." }
  const target = body.target as string
  const version = typeof body.version === "string" ? body.version.trim() : ""
  if (!parseVersion(version)) return { ok: false, error: "Write the version as three numbers, like 2.1.0." }
  const notes = typeof body.notes === "string" ? body.notes.replace(/\r\n?/g, "\n").trim().slice(0, RELEASE_NOTES_MAX) : ""
  if (!notes) return { ok: false, error: "Write the release notes: what changed, in a line or a few." }
  const source: ReleaseSource = body.source === "code" ? "code" : "zip"
  const path = typeof body.path === "string" ? body.path : null
  if (source === "zip" && (!path || !RELEASE_UPLOAD_RE.test(path) || !path.startsWith(`theme-releases/${target}/`))) return { ok: false, error: "Upload the release's zip first." }
  if (source === "code" && target !== BASE_TARGET && !isCodeTemplateSlug(target)) return { ok: false, error: "Only Storelib's own templates are in the code. Upload a zip for this theme." }
  return { ok: true, value: { target, version, notes, source, path: source === "zip" ? path : null, publish: body.publish === true } }
}
