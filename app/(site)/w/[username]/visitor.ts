import "server-only"

import { cookies, headers } from "next/headers"
import { creatorByName } from "@/lib/website-builder/published-site"
import { SESSION_COOKIE, visitorFrom, type SiteVisitor } from "@/lib/site-accounts/session"

/**
 * Who is signed in to THIS website, from its own session cookie and the host
 * the page was asked for on. A session is only ever good on the host it was
 * made for and for the creator whose website this is, so a cookie carried to
 * another address, or a website whose name moved to somebody else, is
 * nobody. Reading cookies makes the page per visitor, which is what these
 * pages are: they are never cached.
 */
export async function siteVisitor(username: string): Promise<{ visitor: SiteVisitor | null; creatorId: string | null }> {
  const creator = await creatorByName(username)
  if (!creator) return { visitor: null, creatorId: null }
  const [jar, h] = await Promise.all([cookies(), headers()])
  const host = (h.get("host") || "").toLowerCase()
  const visitor = visitorFrom(jar.get(SESSION_COOKIE)?.value, host, { creatorId: creator.creatorId })
  return { visitor, creatorId: creator.creatorId }
}
