import "server-only"

/**
 * ===========================================================================
 *  CONNECTED DOMAINS, READ AND KEPT IN STEP
 * ===========================================================================
 * `custom_domains` holds one row per domain a creator has connected. Since
 * supabase/migrations/20261001_custom_domain_purposes.sql a row also says
 * what it is FOR and whether it is the PRIMARY one:
 *
 *   purpose      'website'       serves the website built in the builder
 *                                (the creator page when none is published,
 *                                which is what every domain did before)
 *                'creator_page'  serves storelib.com/<handle>, its products
 *                                under it and the OnePage at /links
 *   is_primary   one per creator and purpose. The address canonicals and
 *                share links name; every other domain of that purpose
 *                answers with a redirect to it.
 *   dns_records  the records last shown for it (read through brandRecord,
 *                so a row saved before domains.storelib.com shows it too)
 *
 * Since run-now part 185 (round 31) a row can also serve ONE COMMUNITY:
 * purpose 'community', target_type 'community', target_id its id. One
 * domain per community; is_primary stays false on those rows, because the
 * community is what the domain names, not the creator
 * (lib/custom-domains/community.ts says what it serves).
 *
 * THE MIGRATION MAY NOT HAVE RUN. Every read here asks for the new columns
 * and, when the database says one does not exist, asks again without them
 * and reports `schema: "legacy"`: one website domain per creator, served
 * the way it always was. Nothing crashes on an old database, and creator
 * page domains simply are not offered until the columns are there.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { onePageChangedFor } from "@/lib/onepage/public-cache"
import {
  isApexHost,
  isDomainPurpose,
  recordsFor,
  servingHost,
  storedRecords,
  type DnsRecord,
  type DomainPurpose,
} from "./hostname"
import { brandRecord } from "./targets"
import { communityIdOf } from "./community"

type Admin = ReturnType<typeof createAdminClient>

export interface DomainRow {
  id: string
  creator_id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
  verification_token?: string | null
  created_at?: string | null
  updated_at?: string | null
  purpose?: string | null
  is_primary?: boolean | null
  dns_records?: unknown
  last_checked_at?: string | null
  target_type?: string | null
  target_id?: string | null
}

export interface DomainView {
  id: string
  domain: string
  status: string
  ssl_status: string | null
  verified_at: string | null
  created_at: string | null
  last_checked_at: string | null
  purpose: DomainPurpose
  is_primary: boolean
  /** Where it is served: www.<apex> for an apex, itself for a subdomain. */
  host: string
  apex: boolean
  records: DnsRecord[]
  /** The community a 'community' domain serves, by id; null for every other purpose. */
  community_id: string | null
}

export type Schema = "current" | "legacy"

/** Every status in which the DNS has been seen pointing at us. */
export const LIVE_STATUSES = ["active", "ssl_provisioning"]
/** Every status a domain is served in by proxy.ts. */
export const SERVED_STATUSES = ["active", "ssl_provisioning", "pending", "verifying"]

/** Postgres "undefined column", or PostgREST not finding it in its schema cache. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  const m = (error.message || "").toLowerCase()
  return (m.includes("column") && (m.includes("does not exist") || m.includes("could not find")))
}

/** Postgres "undefined table", or PostgREST not finding it. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const m = (error.message || "").toLowerCase()
  return m.includes("relation") && m.includes("does not exist")
}

export const CURRENT_COLUMNS =
  "id, creator_id, domain, status, ssl_status, verified_at, verification_token, created_at, updated_at, purpose, is_primary, dns_records, last_checked_at"
export const LEGACY_COLUMNS = "id, creator_id, domain, status, ssl_status, verified_at, verification_token, created_at, updated_at"
/** CURRENT_COLUMNS and what a domain serves when it is a community's (run-now part 185). */
export const TARGET_COLUMNS =
  "id, creator_id, domain, status, ssl_status, verified_at, verification_token, created_at, updated_at, purpose, is_primary, dns_records, last_checked_at, target_type, target_id"

export function purposeOf(row: DomainRow): DomainPurpose {
  return isDomainPurpose(row.purpose) ? row.purpose : "website"
}

export function toView(row: DomainRow, schema: Schema): DomainView {
  const purpose = purposeOf(row)
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    ssl_status: row.ssl_status ?? null,
    verified_at: row.verified_at ?? null,
    created_at: row.created_at ?? null,
    last_checked_at: row.last_checked_at ?? null,
    purpose,
    /* On an old database there is one domain per creator, and it is the primary one. */
    is_primary: schema === "legacy" ? true : row.is_primary === true,
    host: servingHost(row.domain),
    apex: isApexHost(row.domain),
    records: storedRecords(row.dns_records)?.map(brandRecord) ?? recordsFor(row.domain),
    community_id: communityIdOf(row),
  }
}

/**
 * A creator's domains, newest first, and which schema answered. `targets`
 * says whether the community columns are there (part 185): until they are,
 * the rows are read as before and no domain can be a community's.
 */
export async function listCreatorDomains(admin: Admin, creatorId: string): Promise<{ rows: DomainRow[]; schema: Schema; error?: string; targets?: boolean }> {
  const withTargets = await admin.from("custom_domains").select(TARGET_COLUMNS).eq("creator_id", creatorId).order("created_at", { ascending: false })
  if (!withTargets.error) return { rows: (withTargets.data ?? []) as DomainRow[], schema: "current", targets: true }
  if (isMissingTable(withTargets.error)) return { rows: [], schema: "legacy", error: "missing_table" }
  if (!isMissingColumn(withTargets.error)) return { rows: [], schema: "current", error: withTargets.error.message }
  const current = await admin.from("custom_domains").select(CURRENT_COLUMNS).eq("creator_id", creatorId).order("created_at", { ascending: false })
  if (!current.error) return { rows: (current.data ?? []) as DomainRow[], schema: "current" }
  if (isMissingTable(current.error)) return { rows: [], schema: "legacy", error: "missing_table" }
  if (!isMissingColumn(current.error)) return { rows: [], schema: "current", error: current.error.message }
  const legacy = await admin.from("custom_domains").select(LEGACY_COLUMNS).eq("creator_id", creatorId).order("created_at", { ascending: false })
  if (legacy.error) return { rows: [], schema: "legacy", error: legacy.error.message }
  return { rows: (legacy.data ?? []) as DomainRow[], schema: "legacy" }
}

/** The host a purpose is served at for good: its primary domain, once it is active. */
export function primaryHostOf(rows: DomainRow[], purpose: DomainPurpose, schema: Schema): string | null {
  const live = rows.filter((r) => r.status === "active")
  if (schema === "legacy") {
    /* One domain per creator, serving the website (the creator page only when no
       website is published). Named as the website's; a creator page address is
       only ever claimed by a domain connected for it. */
    if (purpose !== "website") return null
    const oldest = [...live].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    return oldest ? servingHost(oldest.domain) : null
  }
  const primary = live.find((r) => purposeOf(r) === purpose && r.is_primary === true)
  return primary ? servingHost(primary.domain) : null
}

/** The cache tag every read of a creator's domains is filed under. */
export function creatorDomainsTag(creatorId: string): string {
  return `custom-domains:${creatorId}`
}

/**
 * The host a creator's page or website is served at, for canonicals and
 * share links. Cached for five minutes and dropped the moment the Domains
 * tab changes anything (revalidateTag on creatorDomainsTag). Any failure
 * reads as "no domain", which is the storelib.com address: a link that works.
 */
export async function primaryHostFor(creatorId: string | null | undefined, purpose: DomainPurpose): Promise<string | null> {
  if (!creatorId) return null
  return unstable_cache(
    async () => {
      try {
        const { rows, schema } = await listCreatorDomains(createAdminClient(), creatorId)
        return primaryHostOf(rows, purpose, schema)
      } catch {
        return null
      }
    },
    ["custom-domain-primary", creatorId, purpose],
    { tags: [creatorDomainsTag(creatorId)], revalidate: 300 },
  )()
}

/** `https://<host>` for a creator page on its own domain, or null. */
export async function creatorPageOrigin(creatorId: string | null | undefined): Promise<string | null> {
  const host = await primaryHostFor(creatorId, "creator_page")
  return host ? `https://${host}` : null
}

/**
 * ===========================================================================
 *  THE CREATOR PAGE'S DOMAIN IS THE ONEPAGE'S TOO
 * ===========================================================================
 * The OnePage is served at <creator page domain>/links, so its settings name
 * that domain (`settings.custom_domain`, which existed and was always null):
 * the editor's copy link, the public page's share sheet and its QR code all
 * read it. Written whenever the creator page's primary domain changes, is
 * connected, or goes; null when there is none. Best effort: the public page
 * also looks the domain up itself, so a failed write is a stale label in the
 * editor, never a broken link.
 */
export async function syncOnepageDomain(admin: Admin, creatorId: string, userId: string | null): Promise<void> {
  try {
    const { rows, schema } = await listCreatorDomains(admin, creatorId)
    if (schema === "legacy") return
    const host = primaryHostOf(rows, "creator_page", schema)
    const filters = [`creator_id.eq.${creatorId}`, `seller_id.eq.${creatorId}`]
    if (userId) filters.push(`owner_id.eq.${userId}`)
    const { data: pages } = await admin.from("onepages").select("id, settings").or(filters.join(","))
    let moved = false
    for (const page of (pages ?? []) as { id: string; settings: Record<string, unknown> | null }[]) {
      const settings = page.settings && typeof page.settings === "object" ? page.settings : {}
      if ((settings.custom_domain ?? null) === host) continue
      await admin.from("onepages").update({ settings: { ...settings, custom_domain: host } }).eq("id", page.id)
      moved = true
    }
    /* The live OnePage's held copy carries these settings (lib/onepage/public-cache): read afresh. */
    if (moved && userId) await onePageChangedFor(userId)
  } catch (err) {
    console.error("[custom-domains] onepage sync failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * After a primary goes (removed, or no longer primary), the next one of the
 * same purpose takes its place: a connected one before a waiting one, then
 * the oldest. A purpose with domains always has a primary.
 */
export async function ensurePrimary(admin: Admin, creatorId: string, purpose: DomainPurpose): Promise<void> {
  /* A community's domain is that community's alone: there is no primary among them to hand on. */
  if (purpose === "community") return
  const { rows, schema } = await listCreatorDomains(admin, creatorId)
  if (schema === "legacy") return
  const mine = rows.filter((r) => purposeOf(r) === purpose)
  if (mine.length === 0 || mine.some((r) => r.is_primary === true)) return
  const rank = (r: DomainRow) => (r.status === "active" ? 0 : r.status === "ssl_provisioning" ? 1 : 2)
  const next = [...mine].sort((a, b) => rank(a) - rank(b) || String(a.created_at).localeCompare(String(b.created_at)))[0]
  await admin.from("custom_domains").update({ is_primary: true }).eq("id", next.id).eq("creator_id", creatorId)
}

/** Make one domain the primary of its purpose. The other one steps down first (one primary per purpose, by index). */
export async function makePrimary(admin: Admin, creatorId: string, row: DomainRow): Promise<{ ok: boolean; error?: string }> {
  const purpose = purposeOf(row)
  const off = await admin.from("custom_domains").update({ is_primary: false }).eq("creator_id", creatorId).eq("purpose", purpose).neq("id", row.id)
  if (off.error) return { ok: false, error: off.error.message }
  const on = await admin.from("custom_domains").update({ is_primary: true }).eq("id", row.id).eq("creator_id", creatorId)
  if (on.error) return { ok: false, error: on.error.message }
  return { ok: true }
}

/** The records Vercel recommended, kept on the row so the list needs no Vercel call. Ignored on an old database. */
export async function saveRecords(admin: Admin, id: string, records: DnsRecord[]): Promise<void> {
  const { error } = await admin
    .from("custom_domains")
    .update({ dns_records: records, last_checked_at: new Date().toISOString() })
    .eq("id", id)
  if (error && !isMissingColumn(error)) console.error("[custom-domains] saving records failed:", error.message)
}
