import Link from "next/link"
import { AUTH_BTN_PRIMARY, AUTH_BTN_SECONDARY, AUTH_LINK, AuthFoot, AuthHeading, AuthStore } from "@/components/auth/auth-split"
import { AcceptOwnership, OpenBusiness, SwitchAccount } from "@/components/handoff/claim-actions"
import { BLOCKER_TEXT_FOR_RECIPIENT, claimPath, claimSignInHref, type ClaimState, type FounderAccess } from "@/lib/handoff/rules"

/**
 * ===========================================================================
 *  THE CLAIM PAGE, ONE ANSWER PER STATE OF THE LINK
 * ===========================================================================
 * Drawn inside the log in page's layout (components/auth/auth-split), so the
 * person taking a business over meets Storelib's own sign in screen, not a
 * page of its own. It speaks as the Storelib Team ("Storelib Team invited you
 * to take it over"), never as the founder's personal note: the founder's
 * name is not on it. What it shows is what they need to decide: which
 * business (its photo, name and address), what comes with it, what they set
 * up themselves (payouts and a plan), and one button. Every state of the link
 * (lib/handoff/rules claimStateOf) has its heading and its next step. Kept
 * apart from the page so the suite and scripts/check-business-handoff.mjs
 * can draw every state without a database.
 */

export interface ClaimPreview {
  storeAddress: string | null
  onePageAddress: string | null
  products: number
  websites: number
  domains: string[]
}

const NOTES: Record<string, string> = {
  slow: "Too many tries. Wait a few minutes, then press Accept again.",
  again: "That press didn't reach us from this page. Press it again.",
  failed: "The handover could not finish. Nothing changed and the link still works. Try again.",
}

export function ClaimNote({ kind }: { kind: string }) {
  const text = NOTES[kind]
  if (!text) return null
  return (
    <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[14px] leading-5 text-red-800" data-claim-note={kind}>
      {text}
    </p>
  )
}

const FOUNDER_WORDS: Record<FounderAccess, string> = { full: "full access", content: "content access", support: "support access" }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function includes(preview: ClaimPreview): string {
  const parts = [plural(preview.products, "product", "products")]
  if (preview.websites) parts.push(plural(preview.websites, "website", "websites"))
  return `${parts.join(", ")}, orders, customers and settings`
}

/**
 * Which business, and what comes with it: one box, read only. The business's
 * own row first (photo, name, address), then the rows that move with it, then
 * the two things the new owner sets up themselves.
 */
export function ClaimPreviewBox({ business, preview, keepFounder, founderAccess }: { business: { name: string; avatarUrl: string | null }; preview: ClaimPreview | null; keepFounder?: boolean; founderAccess?: FounderAccess }) {
  const rows: [string, string, boolean?][] = []
  if (preview?.onePageAddress && preview.onePageAddress !== preview.storeAddress) rows.push(["OnePage", preview.onePageAddress])
  if (preview?.domains.length) rows.push([preview.domains.length === 1 ? "Domain" : "Domains", preview.domains.join(", ")])
  if (preview) rows.push(["Includes", includes(preview)])
  rows.push(["Payouts", "Connect your own after you accept", true])
  rows.push(["Plan", "You choose your own", true])
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200" data-claim-preview="">
      <div className="bg-neutral-50 px-4 py-3">
        <AuthStore name={business.name} avatarUrl={business.avatarUrl} line={preview?.storeAddress ?? preview?.onePageAddress ?? null} />
      </div>
      <dl className="divide-y divide-neutral-100 border-t border-neutral-200">
        {rows.map(([k, v, quiet]) => (
          <div key={k} className="flex gap-3 px-4 py-2.5 text-[14px] leading-5">
            <dt className="w-[76px] shrink-0 text-neutral-500">{k}</dt>
            <dd className={`min-w-0 [overflow-wrap:anywhere] ${quiet ? "text-neutral-500" : "text-neutral-900"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {keepFounder ? (
        <p className="border-t border-neutral-200 px-4 py-2.5 text-[13px] leading-5 text-neutral-500" data-claim-founder="">
          The person who set it up stays on your team with {FOUNDER_WORDS[founderAccess ?? "full"]}, never payouts or billing. You can remove them in Settings, Team.
        </p>
      ) : null}
    </div>
  )
}

function shortDate(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(t) : null
}

function foot(email: string | null, expiresAt: string | null | undefined) {
  const until = shortDate(expiresAt)
  if (!email && !until) return null
  return (
    <AuthFoot>
      {email ? <>For {email}. </> : null}
      {until ? <>Works once, until {until}.</> : <>Works once.</>}
    </AuthFoot>
  )
}

export function ClaimCard({
  state,
  token,
  note,
  signedIn,
  preview,
  expiresAt = null,
  founderAccess = "full",
}: {
  state: ClaimState
  token: string
  note: string
  signedIn: boolean
  preview: ClaimPreview | null
  expiresAt?: string | null
  founderAccess?: FounderAccess
}) {
  const home = signedIn ? "/app" : "/"
  const homeLabel = signedIn ? "Go to my dashboard" : "Go to Storelib"
  const quietHome = <Link href={home} className={AUTH_BTN_SECONDARY}>{homeLabel}</Link>
  const done = (title: string, sub: string, action: React.ReactNode = quietHome) => (
    <div data-claim-state={state.kind}>
      <AuthHeading title={title} sub={sub} />
      {"business" in state ? <div className="mb-6"><AuthStore name={state.business.name} avatarUrl={state.business.avatarUrl} line={preview?.storeAddress ?? null} /></div> : null}
      {action}
    </div>
  )
  const invited = "Storelib Team invited you to take over this business as its owner."
  switch (state.kind) {
    case "invalid":
      return done("This link is not complete", "Part of it is missing. Open it from the email again, or copy the whole link.")
    case "gone":
      return done("This link doesn't work", "It may have been replaced by a newer link. Ask whoever sent it for the latest one.")
    case "revoked":
      return done("This link was cancelled", "Ask whoever sent it for a new one if you still need it.")
    case "expired":
      return done("This link has expired", `Ask whoever sent it for a new link to ${state.business.name}.`)
    case "stale":
      return done("This business can't be handed over", "It is no longer with the person who sent the link. Ask them what happened.")
    case "accepted":
      return state.mine
        ? done(`${state.business.name} is yours`, "Connect your payout account in Settings, Payments to get paid. You can open it any time from your account menu.", <OpenBusiness userId={state.businessUserId} name={state.business.name} auto={note === "accepted"} />)
        : done("This link has been used", "Someone already accepted it. If that wasn't you, ask whoever sent it.")
    case "own":
      return done("This is your handover link", "Send it to the person taking the business over. You can resend or cancel it in Settings, Team.", <Link href="/app/settings?tab=team" className={AUTH_BTN_PRIMARY}>Open Team settings</Link>)
    case "signed_out":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading title={`Manage ${state.business.name}`} sub={invited} />
          <ClaimPreviewBox business={state.business} preview={preview} />
          <div className="mt-6">
            <a href={claimSignInHref(token, { signup: true })} className={AUTH_BTN_PRIMARY} data-claim="signup">Create account to accept</a>
          </div>
          <p className="mt-6 text-center text-[14px] text-neutral-500">
            Already on Storelib?{" "}
            <a href={claimSignInHref(token, { signup: false })} className={AUTH_LINK} data-claim="login">Log in</a>
          </p>
          {foot(state.email, expiresAt)}
        </div>
      )
    case "wrong_email":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading
            title={`Manage ${state.business.name}`}
            sub={
              <span data-claim="wrong-email">
                This invite is for <span className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{state.email}</span>
                {state.signedInAs ? <>, and you're signed in as <span className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{state.signedInAs}</span></> : null}. Log in with that email to accept.
              </span>
            }
          />
          {note ? <ClaimNote kind={note} /> : null}
          <SwitchAccount token={token} email={state.email} label="Switch account" />
        </div>
      )
    case "verify_email":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading title="Confirm your email first" sub={`${state.signedInAs ? `We need to know ${state.signedInAs} is yours` : "We need to know your email is yours"} before a business can be handed to it.`} />
          <div className="space-y-3">
            <a href={`/signup/verify?userId=${encodeURIComponent(state.userId)}&next=${encodeURIComponent(claimPath(token))}`} className={AUTH_BTN_PRIMARY} data-claim="verify">Confirm my email</a>
            <SwitchAccount token={token} email={null} label="Use another account" quiet />
          </div>
        </div>
      )
    case "limit":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading title="You have three businesses already" sub={`One login can have three. Remove one of yours, or accept ${state.business.name} with another account.`} />
          {note ? <ClaimNote kind={note} /> : null}
          <div className="space-y-3">
            <SwitchAccount token={token} email={null} label="Use another account" />
            {quietHome}
          </div>
        </div>
      )
    case "not_ready":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading title="Almost ready" sub={`${state.business.name} can be taken over once this is done. The link keeps working.`} />
          <ul className="mb-6 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5" data-claim-blockers="">
            {state.blockers.map((b) => (
              <li key={b} className="text-[14px] leading-5 text-amber-900">{BLOCKER_TEXT_FOR_RECIPIENT[b]}</li>
            ))}
          </ul>
          <a href={claimPath(token)} className={AUTH_BTN_SECONDARY}>Check again</a>
        </div>
      )
    case "ready":
      return (
        <div data-claim-state={state.kind}>
          <AuthHeading title={`Manage ${state.business.name}`} sub={invited} />
          {note ? <ClaimNote kind={note} /> : null}
          <ClaimPreviewBox business={state.business} preview={preview} keepFounder={state.keepFounder} founderAccess={founderAccess} />
          <div className="mt-6">
            <AcceptOwnership token={token} />
          </div>
          {foot(state.email, expiresAt)}
        </div>
      )
  }
}
