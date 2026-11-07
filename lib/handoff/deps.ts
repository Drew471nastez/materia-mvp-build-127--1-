import "server-only"

import { randomBytes } from "node:crypto"
import { revalidateTag } from "next/cache"
import type { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser, sessionFor } from "@/lib/businesses/server"
import { rateLimit, type RateLimitOptions } from "@/lib/api/rate-limit"
import { sendEmail } from "@/lib/mail"
import { stripe } from "@/lib/stripe"
import { accountGoneFromPlatform } from "@/lib/payments/stripe/connect"
import { forgetPaymentsReadiness } from "@/lib/payments/stripe/readiness-cache"
import { onePageChangedFor, onePageProductsChanged } from "@/lib/onepage/public-cache"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { creatorDomainsTag } from "@/lib/custom-domains/store"
import type { AuthUserLike } from "@/lib/auth/verified-email"

/**
 * What lib/handoff/server.ts reaches outside itself, in one place: the
 * service role client, who is signed in, the rate limiter, Supabase Auth's
 * admin calls, the mailer, Stripe and the caches. The routes take the live
 * ones; tests/business-handoff.test.ts runs the same routes on the repo's
 * in-memory PostgREST (tests/_fake-db.ts) by setting STORELIB_TEST_SEAMS=1
 * and handing its own in (setHandoffDepsForTests). Nothing outside this
 * process can set either.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> }

export type PayoutBalance = "none" | "held" | "gone" | "unreachable"

export interface HandoffDeps {
  db: Db
  requestUser(request: Request): Promise<{ id: string; email: string | null } | null>
  rateLimit(options: RateLimitOptions): Promise<NextResponse | null>
  authUser(id: string): Promise<AuthUserLike | null>
  updateAuthUser(id: string, attrs: Record<string, unknown>): Promise<boolean>
  /** Every session of an account, everywhere, ended. */
  signOutEverywhere(userId: string): Promise<boolean>
  sendEmail(message: { to: string; subject: string; text: string; html: string }): Promise<boolean>
  /** Whether a Stripe connected account still holds money. */
  payoutBalance(accountId: string): Promise<PayoutBalance>
  /** The caches that hold the business by its owner: its OnePage, its store, its domains, its payments readiness. */
  forgetCaches(business: { userId: string; creatorId: string | null }): Promise<void>
  randomBytes(n: number): Buffer
  now(): number
}

function live(): HandoffDeps {
  const admin = createAdminClient()
  return {
    db: admin as unknown as Db,
    requestUser,
    rateLimit,
    async authUser(id) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        return error || !data?.user ? null : (data.user as AuthUserLike)
      } catch {
        return null
      }
    },
    async updateAuthUser(id, attrs) {
      try {
        const { error } = await admin.auth.admin.updateUserById(id, attrs)
        return !error
      } catch {
        return false
      }
    },
    async signOutEverywhere(userId) {
      /* Supabase ends every session of an account given any one of its tokens: one is made for it here, as a switch makes one, and spent at once. */
      try {
        const session = await sessionFor(userId)
        if (!session) return false
        const { error } = await admin.auth.admin.signOut(session.access_token, "global")
        return !error
      } catch {
        return false
      }
    },
    async sendEmail(message) {
      const sent = await sendEmail({ ...message, transactional: true, keepBounce: true }).catch(() => ({ success: false }))
      return !!sent.success
    },
    async payoutBalance(accountId) {
      try {
        const balance = await stripe.balance.retrieve({ stripeAccount: accountId })
        const held = [...(balance.available ?? []), ...(balance.pending ?? [])].some((b) => b.amount !== 0)
        return held ? "held" : "none"
      } catch (error) {
        return (await accountGoneFromPlatform(error).catch(() => false)) ? "gone" : "unreachable"
      }
    },
    async forgetCaches({ userId, creatorId }) {
      await Promise.allSettled([
        onePageChangedFor(userId),
        onePageProductsChanged(creatorId),
        creatorPagesChanged({ userId, creatorId }),
        forgetPaymentsReadiness(creatorId),
      ])
      if (creatorId) {
        try {
          revalidateTag(creatorDomainsTag(creatorId), { expire: 0 })
        } catch {
          /* outside a request that can revalidate */
        }
      }
    },
    randomBytes,
    now: () => Date.now(),
  }
}

const KEY = "__storelibHandoffDepsForTests"

/** For tests/business-handoff.test.ts only, and only with STORELIB_TEST_SEAMS=1 in its own process. */
export function setHandoffDepsForTests(deps: HandoffDeps | null): void {
  if (process.env.STORELIB_TEST_SEAMS !== "1") throw new Error("Test seams are off")
  ;(globalThis as Record<string, unknown>)[KEY] = deps
}

export function handoffDeps(): HandoffDeps {
  const forTests = process.env.STORELIB_TEST_SEAMS === "1" ? ((globalThis as Record<string, unknown>)[KEY] as HandoffDeps | undefined) : undefined
  return forTests ?? live()
}
