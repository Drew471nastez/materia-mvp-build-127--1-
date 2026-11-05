import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { creatorForRequest, currentUserForRequest, profileOrThrowForRequest, sellerAccessOrThrowForRequest } from "@/lib/auth/request-scope"
import { isServiceUnavailable } from "@/lib/net/service-error"
import { ServiceUnavailable } from "@/components/app/service-unavailable"
import { onboardingResume, type OnboardingResume } from "@/lib/account/onboarding-resume"
import { createClient } from "@/lib/supabase/server"
import { BUYER_HOME, safeNext, sellDecision } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { listBusinesses } from "@/lib/businesses/server"
import type { SwitchedTo } from "@/lib/businesses/switch-client"
import { teamStoreForRequest, teamStoresForRequest } from "@/lib/team/server"
import { UUID, sellLeaveHref } from "@/lib/team/landing"
import { SellOnboarding } from "./sell-onboarding"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sell on Storelib",
  robots: { index: false, follow: false },
}

/**
 * ===========================================================================
 *  /sell: THE ONE DOOR INTO SELLING
 * ===========================================================================
 * Sell on Storelib, Become a seller, the /app gate and every older link
 * (/onboarding, /signup/success?action=become-creator) come here, and this
 * decides on the server, before anything is drawn:
 *
 *   signed out            -> /signup?intent=sell  (Log in there carries it
 *                            too; after either, /auth/continue brings them
 *                            straight back here)
 *   email not verified    -> /signup/verify, carrying intent=sell
 *   seller access         -> /app
 *   anybody else          -> seller onboarding, drawn right here. That
 *                            includes a setup begun and not finished
 *                            (lib/account/seller-access.ts "started"):
 *                            it opens again rather than counting as done.
 *
 * `next`, or the page the link was pressed on, is where "Not now" goes, so
 * leaving the setup puts a buyer back where they were.
 */
export default async function SellPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null)
  const mainDomain = getMainDomain()
  const next = safeNext(one("next"), mainDomain)

  const current = await currentUserForRequest()
  const user = current.user
  /*
    READ TO THE END, OR SAID SO (round 51). A profile or creator row that could not be read came back as none:
    a seller whose reads timed out was told to verify their email (/signup/verify) or shown seller onboarding
    from the start. Now that is "Storelib is not answering", with Try again, and nobody is sent anywhere.
  */
  let rows: [Awaited<ReturnType<typeof profileOrThrowForRequest>>, Awaited<ReturnType<typeof sellerAccessOrThrowForRequest>>] | [null, { state: "none" }]
  try {
    rows = user ? await Promise.all([profileOrThrowForRequest(user.id), sellerAccessOrThrowForRequest(user.id)]) : [null, { state: "none" as const }]
  } catch (e) {
    if (!isServiceUnavailable(e)) throw e
    return <ServiceUnavailable />
  }
  const [profile, access] = rows

  /* The whole table is lib/auth/continue.ts sellDecision, unit tested in tests/sell-intent.test.ts. */
  const decision = sellDecision({ user, emailVerified: !!profile?.email_verified, access, next })
  if (decision.kind === "redirect") redirect(decision.to)
  /* Onboarding is only ever the answer for somebody signed in (sellDecision), so there is a user here. */
  const userId = user?.id ?? ""

  /*
    WHERE "NOT NOW" GOES. The page the link was pressed on when it was one of
    ours (the Referer, checked like any other return target), else Discover.
    Never /app, which would only send a buyer straight back here.
  */
  const referer = (await headers()).get("referer")
  let fromReferer: string | null = null
  try {
    if (referer) {
      const r = new URL(referer)
      if (r.hostname.toLowerCase() === mainDomain.toLowerCase() || r.hostname === "localhost") {
        fromReferer = safeNext(`${r.pathname}${r.search}`, mainDomain)
      }
    }
  } catch {
    /* an unreadable Referer is no Referer */
  }
  const isApp = (p: string | null) => !!p && (p === "/app" || p.startsWith("/app/") || p.startsWith("/app?"))
  /*
    A TEAM MEMBER'S NOT NOW GOES BACK TO THE STORE (round Y2, the owner:
    "when I click Not now, take me back to the team I was in"). The store
    /sell was opened from (?team=, from Back to my account), else the one
    they work in now, else the one joined last; /api/team/home checks the
    membership again before it opens any of them (lib/team/landing).
  */
  const [memberOf, acting] = userId ? await Promise.all([teamStoresForRequest(userId), teamStoreForRequest(userId).catch(() => null)]) : [[], null]
  const teamParam = one("team")
  const leaveHref = sellLeaveHref({
    memberships: memberOf.length,
    team: (teamParam && UUID.test(teamParam) ? teamParam : null) ?? acting?.acting.creatorId ?? null,
    fallback: [next, fromReferer].find((p) => p && !isApp(p)) ?? BUYER_HOME,
  })

  /* A second business (lib/businesses) goes back to the first one instead of out. */
  let firstBusiness: SwitchedTo | null = null
  try {
    const list = await listBusinesses(userId)
    if (list.find((b) => b.current)?.role === "member") {
      const owner = list.find((b) => b.role === "owner")
      if (owner) firstBusiness = { userId: owner.userId, name: owner.name, handle: owner.handle ?? null, avatarUrl: owner.avatarUrl ?? null, ready: owner.ready !== false }
    }
  } catch {
    /* a business list that cannot be read is one business: the way out is Not now */
  }

  const tier = one("tier")
  const resumePlan = one("stripe_success") === "1" && (tier === "growth" || tier === "pro") ? tier : null

  /*
    A SETUP BEGUN AND NOT FINISHED (lib/account/onboarding-resume). The
    creator row the plan step wrote is read back, so the store name, bio and
    category are there again and the setup opens on the plan step it was
    left on, not on an empty step one. The row is the one the access check
    above already read (cached for this request); only its category is
    asked for on top, and only when there is a row.
  */
  let resume: OnboardingResume | null = null
  if (access.state === "started") {
    try {
      const creator = await creatorForRequest(userId)
      let niche: unknown = null
      if (creator) {
        const { data } = await (await createClient()).from("creators").select("niche_tags").eq("user_id", userId).maybeSingle()
        niche = (data as { niche_tags?: unknown } | null)?.niche_tags ?? null
      }
      resume = onboardingResume({ creator: creator ? { ...creator, niche_tags: niche } : null, profile })
    } catch {
      /* Nothing read back is the fresh setup it was before. */
    }
  }

  return (
    <SellOnboarding
      leaveHref={leaveHref}
      resumePlan={resumePlan}
      firstBusiness={firstBusiness}
      resume={resume}
      seed={{
        name: (profile?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "").trim(),
        username: profile?.username?.trim() || null,
      }}
    />
  )
}
