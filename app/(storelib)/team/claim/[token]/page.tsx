import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { JOIN_BTN_PRIMARY } from "@/components/team/join-actions"
import { Frame, Plain } from "@/components/team/join-card"
import { ClaimCard } from "@/components/handoff/claim-card"
import { handoffDeps } from "@/lib/handoff/deps"
import { finishHandoff, logEvent, readClaim, viewerOf } from "@/lib/handoff/server"
import { claimPath, tokenShapeOk } from "@/lib/handoff/rules"

/**
 * ===========================================================================
 *  A CLAIM LINK, OPENED
 * ===========================================================================
 * Where a founder's handover link lands (lib/handoff). Under /team, a word
 * no creator can hold, so it never covers a creator's page. Every way the
 * link can be has its own card with the next step (lib/handoff/rules
 * claimStateOf, components/handoff/claim-card):
 *
 *   ready         the business, its addresses, what comes with it and what
 *                 stays with the sender; Accept ownership
 *   signed_out    Create account or Log in, back here after (the email the
 *                 link was sent to is filled in)
 *   wrong_email   signed in with another email: Switch account
 *   verify_email  the account's email is not confirmed yet
 *   limit         the login has three businesses already
 *   not_ready     the sender has something to finish first
 *   own           the founder opened their own link
 *   accepted      "It's yours" with Open, or "already used"
 *   expired, revoked, gone, stale, invalid: what happened
 *
 * Opening it changes nothing but the record ("viewed"); Accept is a press
 * on this page (app/api/handoff/claim). If the transfer committed but its
 * finishing steps did not all succeed, opening it as the new owner runs
 * them again (lib/handoff/server finishHandoff).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Business handover",
  robots: { index: false, follow: false },
  /* same-origin, as the team invite: the token never leaves in a Referer, and Accept keeps its Origin (lib/team/own-page.ts). */
  referrer: "same-origin",
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ note?: string | string[] }> }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

export default async function ClaimPage({ params, searchParams }: Props) {
  const [{ token: raw }, sp] = await Promise.all([params, searchParams])
  const token = decodeURIComponent(raw ?? "")
  const note = one(sp.note)
  const deps = handoffDeps()
  const h = await headers()
  const meta = { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null, userAgent: h.get("user-agent")?.slice(0, 300) || null }

  /* A guessed link learns nothing: past thirty looks in ten minutes from one address, the page says so and reads nothing. */
  const limited = meta.ip
    ? await deps.rateLimit({ bucket: "handoff-view", subjects: [`ip:${meta.ip}`], windows: [{ limit: 30, seconds: 600 }], message: "Too many tries." }).catch(() => null)
    : null
  if (limited) {
    return (
      <Frame>
        <Plain title="Too many tries" body="Wait a few minutes, then open the link again." />
      </Frame>
    )
  }

  let sessionUser: { id: string; email: string | null } | null = null
  try {
    const { data } = await (await createClient()).auth.getUser()
    sessionUser = data.user ? { id: data.user.id, email: data.user.email ?? null } : null
  } catch {
    sessionUser = null
  }
  const viewer = await viewerOf(deps, sessionUser).catch(() => null)
  const read = await readClaim(deps, token, viewer).catch(() => null)
  if (!read || read.ok === false) {
    return (
      <Frame>
        <Plain title="This link can't be opened right now" body={read && read.ok === false ? read.error : "Something went wrong on our side. Try again in a moment."}>
          <Link href={tokenShapeOk(token) ? claimPath(token) : "/"} className={JOIN_BTN_PRIMARY}>Try again</Link>
        </Plain>
      </Frame>
    )
  }

  if (read.handoff?.status === "pending") {
    await logEvent(deps, { handoffId: read.handoff.id, businessUserId: read.handoff.business_user_id, event: "viewed", actorId: sessionUser?.id ?? null, meta, detail: { state: read.state.kind } })
  }
  /* Accepted, but the address, sessions or caches did not all finish: the new owner opening it finishes them. */
  if (read.state.kind === "accepted" && read.state.mine && read.handoff && !read.handoff.finished_at && viewer) {
    await finishHandoff(deps, read.handoff.id, viewer, meta).catch(() => false)
  }

  return (
    <Frame>
      <ClaimCard state={read.state} token={token} note={note} signedIn={!!sessionUser} preview={read.preview} />
    </Frame>
  )
}
