import "server-only"

import { cookies, headers } from "next/headers"
import { creatorByName } from "@/lib/website-builder/published-site"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerById, type CustomerRow } from "@/lib/site-accounts/customers"
import { pendingCookieName, pendingFrom, sessionCookieName, visitorFrom, type SiteVisitor } from "@/lib/site-accounts/session"
import type { PendingClaims } from "@/lib/site-accounts/token"

/**
 * Who is signed in to THIS website, from its own session cookie and the host
 * the page was asked for on. A session is only ever good on the host it was
 * made for and for the creator whose website this is, and only while its
 * customer is still there, so a cookie carried to another address, a website
 * whose name moved to somebody else, or a customer the creator's data no
 * longer has, is nobody. Reading cookies makes the page per visitor, which
 * is what these pages are: they are never cached.
 */
export async function siteVisitor(
  username: string,
): Promise<{ visitor: SiteVisitor | null; customer: CustomerRow | null; creatorId: string | null }> {
  const creator = await creatorByName(username)
  if (!creator) return { visitor: null, customer: null, creatorId: null }
  const [jar, h] = await Promise.all([cookies(), headers()])
  const host = (h.get("host") || "").toLowerCase()
  const visitor = visitorFrom(jar.get(sessionCookieName(host))?.value, host, { creatorId: creator.creatorId })
  if (!visitor) return { visitor: null, customer: null, creatorId: creator.creatorId }
  const customer = await customerById(createAdminClient(), visitor)
  if (!customer) return { visitor: null, customer: null, creatorId: creator.creatorId }
  return { visitor, customer, creatorId: creator.creatorId }
}

/** The sign in this browser is part way through on this website: the code step, with the email it went to. */
export async function pendingSignIn(creatorId: string): Promise<PendingClaims | null> {
  const [jar, h] = await Promise.all([cookies(), headers()])
  const host = (h.get("host") || "").toLowerCase()
  return pendingFrom(jar.get(pendingCookieName(host))?.value, host, { creatorId })
}
