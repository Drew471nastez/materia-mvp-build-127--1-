/**
 * ===========================================================================
 *  WHAT /admin CHANGES ABOUT THE INTEGRATIONS DIRECTORY
 * ===========================================================================
 * The catalog is code (./catalog.ts): what an integration does is what
 * Storelib's code does with it, so nothing typed in /admin can make one work.
 * What /admin can change is how the directory shows it, from one row each in
 * `integration_catalog` (SQL part 115):
 *
 *   availability  default: as the code says; coming_soon: shown, but not
 *                 installable (a service that broke, paused for everyone);
 *                 hidden: not in the directory at all.
 *   name, summary, logo_url, category, docs_url, sort
 *                 the card's words and mark, and where it sits.
 *   custom        a service the code has never heard of, added from /admin
 *                 so stores can find it and ask for it. Always Coming soon:
 *                 there is nothing behind it to install.
 *
 * Pure, so the directory (in the browser) and /admin read the same answer.
 */
import { CATEGORY_ORDER, type Integration, type IntegrationCategory } from "./catalog"

export type Availability = "default" | "coming_soon" | "hidden"

export interface CatalogOverride {
  id: string
  name: string | null
  summary: string | null
  category: IntegrationCategory | null
  logoUrl: string | null
  docsUrl: string | null
  availability: Availability
  custom: boolean
  physical: boolean
  sort: number | null
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/

/** A slug an admin can give a new integration: lower case letters, digits and dashes. */
export function isIntegrationSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG.test(v)
}

/** Only an https image address, or a file under /integrations, is drawn as a mark. */
export function safeLogoUrl(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (/^\/integrations\/[a-z0-9._-]+\.(svg|png|webp|jpg|jpeg)$/i.test(s)) return s
  try {
    const u = new URL(s)
    return u.protocol === "https:" && s.length <= 500 ? u.toString() : null
  } catch {
    return null
  }
}

/** A row as the database keeps it, read defensively. */
export function readOverride(row: Record<string, unknown>): CatalogOverride | null {
  if (!isIntegrationSlug(row.id)) return null
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const category = typeof row.category === "string" && (CATEGORY_ORDER as string[]).includes(row.category) ? (row.category as IntegrationCategory) : null
  const availability: Availability = row.availability === "coming_soon" || row.availability === "hidden" ? row.availability : "default"
  return {
    id: row.id,
    name: text(row.name, 60),
    summary: text(row.summary, 160),
    category,
    logoUrl: safeLogoUrl(row.logo_url),
    docsUrl: typeof row.docs_url === "string" && /^https:\/\//.test(row.docs_url) ? row.docs_url.slice(0, 500) : null,
    availability,
    custom: row.custom === true,
    physical: row.physical === true,
    sort: typeof row.sort === "number" && Number.isFinite(row.sort) ? row.sort : null,
  }
}

/** One integration a store sees, with what /admin set over it. */
function apply(i: Integration, o: CatalogOverride): Integration {
  const paused = o.availability === "coming_soon" && !i.builtIn
  return {
    ...i,
    name: o.name ?? i.name,
    summary: o.summary ?? i.summary,
    category: o.category ?? i.category,
    logo: o.logoUrl ?? i.logo,
    docsUrl: o.docsUrl ?? i.docsUrl,
    comingSoon: i.comingSoon || paused,
    paused: paused || undefined,
  }
}

function custom(o: CatalogOverride): Integration {
  const name = o.name ?? o.id
  return {
    id: o.id,
    name,
    category: o.category ?? "automation",
    logo: o.logoUrl,
    builtIn: false,
    physical: o.physical,
    kind: "listed",
    summary: o.summary ?? `${name}, coming to Storelib.`,
    about: [o.summary ?? `${name} is on the way.`, `Storelib doesn't connect to ${name} yet. Press Tell me when it's ready and you'll be counted: the integrations asked for most are built first.`],
    glance: [
      { label: "Status", value: "Coming soon" },
      { label: "Works with", value: o.physical ? "Physical products" : "Every store" },
    ],
    data: [`Nothing is sent to ${name}. When it is connected, its page will say exactly what goes there before you turn it on.`],
    comingSoon: true,
    docsUrl: o.docsUrl ?? undefined,
  }
}

/**
 * The directory after /admin: hidden ones gone, paused ones not installable,
 * custom ones added as Coming soon, then the admin's order where one is set
 * (the code's order otherwise). `physical` drops the physical ones exactly
 * as visibleIntegrations does.
 */
export function applyCatalogOverrides(list: Integration[], overrides: CatalogOverride[], physical: boolean): Integration[] {
  const byId = new Map(overrides.map((o) => [o.id, o]))
  const known = new Set(list.map((i) => i.id))
  const out: Integration[] = []
  for (const i of list) {
    const o = byId.get(i.id)
    if (!o) {
      out.push(i)
      continue
    }
    if (o.availability === "hidden") continue
    out.push(apply(i, o))
  }
  for (const o of overrides) {
    if (!o.custom || known.has(o.id) || o.availability === "hidden") continue
    if (o.physical && !physical) continue
    out.push(custom(o))
  }
  const rank = (i: Integration, at: number) => byId.get(i.id)?.sort ?? 1000 + at
  return out.map((i, at) => ({ i, r: rank(i, at) })).sort((a, b) => a.r - b.r).map((x) => x.i)
}
