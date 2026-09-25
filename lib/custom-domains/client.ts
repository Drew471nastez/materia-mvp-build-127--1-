import { servingHost } from "./hostname"

/**
 * What the editors need from GET /api/domains, read one way.
 *
 * The response carries `primary: { website, creator_page }`, each the host a
 * purpose is served at once its primary domain is live. On a database from
 * before purposes (`schema: "legacy"`) there is one domain per creator and it
 * served the creator page and its /links as well, so it stands in for the
 * creator page there, as it did before.
 */
export type DomainsResponse = {
  primary?: { website?: string | null; creator_page?: string | null } | null
  schema?: "current" | "legacy"
}

/** The creator page's own host (and so the OnePage's, at /links), or null. */
export function creatorPageHostFrom(data: DomainsResponse | null | undefined): string | null {
  if (!data?.primary) return null
  if (data.primary.creator_page) return data.primary.creator_page
  return data.schema === "legacy" ? data.primary.website ?? null : null
}

/** The website's own host, or null. */
export function websiteHostFrom(data: DomainsResponse | null | undefined): string | null {
  return data?.primary?.website ?? null
}

/**
 * The creator page's host from raw `custom_domains` rows (any columns, any
 * order), for a server page that reads the table itself. A connected domain
 * for the creator page, its primary one first; on a database from before
 * purposes, the one domain there is.
 */
export function creatorPageHostFromRows(rows: { domain?: string | null; status?: string | null; purpose?: string | null; is_primary?: boolean | null }[] | null | undefined): string | null {
  const live = (rows ?? []).filter((r) => r.status === "active" && r.domain)
  if (live.length === 0) return null
  const legacy = live.every((r) => r.purpose === undefined)
  const pick = legacy
    ? live[0]
    : live.find((r) => r.purpose === "creator_page" && r.is_primary) ?? live.find((r) => r.purpose === "creator_page")
  if (!pick?.domain) return null
  return servingHost(pick.domain)
}
