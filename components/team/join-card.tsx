import Link from "next/link"
import { AuthHeading, AuthSplit, AuthStore } from "@/components/auth/auth-split"
import { AcceptDecline, JOIN_BTN_PRIMARY, JOIN_BTN_QUIET, UseAnotherAccount } from "@/components/team/join-actions"
import { OWNER_KEEPS_EN, accessSummaryEn, permissionLinesEn, type TeamPermission } from "@/lib/team/permissions"
import type { InviteState, InviteStore } from "@/lib/team/invite-state"

/**
 * The invite page's states (app/team/join), one per state of the invite
 * (lib/team/invite-state). In the log in page's layout (components/auth/
 * auth-split): white, the logo, the store's photo and name, a 32px heading,
 * the near black round button. Kept apart from the page so a harness can
 * draw every state without a database.
 */
export function StateCard({ state, token, note, signedIn }: { state: InviteState; token: string; note: string; signedIn: boolean }) {
  const home = signedIn ? "/app" : "/"
  const homeLabel = signedIn ? "Go to my dashboard" : "Go to Storelib"
  switch (state.kind) {
    case "invalid":
      return (
        <Plain title="This link is not complete" body="Part of it is missing. Open the invite from the email again, or copy the whole link.">
          <Link href={home} className={JOIN_BTN_QUIET}>{homeLabel}</Link>
        </Plain>
      )
    case "gone":
      return (
        <Plain title="This invite doesn't work any more" body="It may have been cancelled, or replaced by a newer invite. Check your email for a newer one, or ask the store's owner to send it again.">
          <Link href={home} className={JOIN_BTN_QUIET}>{homeLabel}</Link>
        </Plain>
      )
    case "store_gone":
      return (
        <Plain title="This store isn't on Storelib any more" body="There is nothing to join. You can close this page.">
          <Link href={home} className={JOIN_BTN_QUIET}>{homeLabel}</Link>
        </Plain>
      )
    case "accepted":
      return (
        <StoreCard store={state.store} eyebrow={state.mine ? "You're on the team" : "Invite already used"} title={state.mine ? `You're in ${state.store.name}` : "This invite has been used"}>
          <p className="text-[15px] leading-[22px] text-neutral-500">
            {state.mine ? `You work in it with ${accessSummaryEn(state.permissions).toLowerCase()}. Open it from your account menu any time.` : "Someone already joined with it. If that wasn't you, ask the store's owner for a new invite."}
          </p>
          <div className="mt-5">
            <Link href={signedIn ? "/app" : "/login"} className={JOIN_BTN_PRIMARY}>{signedIn ? "Go to my dashboard" : "Log in"}</Link>
          </div>
        </StoreCard>
      )
    case "expired":
      return (
        <StoreCard store={state.store} eyebrow="Invite expired" title="This invite has expired">
          <p className="text-[15px] leading-[22px] text-neutral-500">
            Invites work for 7 days. Ask the owner of {state.store.name} to send a new one to {state.email}.
          </p>
          <div className="mt-5">
            <Link href={home} className={JOIN_BTN_QUIET}>{homeLabel}</Link>
          </div>
        </StoreCard>
      )
    case "own_store":
      return (
        <StoreCard store={state.store} eyebrow="Your store" title="This is your own store">
          <p className="text-[15px] leading-[22px] text-neutral-500">You already own it, so there is nothing to join. Invites are for other people.</p>
          <div className="mt-5">
            <Link href="/app/settings?tab=team" className={JOIN_BTN_PRIMARY}>Open Team settings</Link>
          </div>
        </StoreCard>
      )
    case "seats_full":
      return (
        <StoreCard store={state.store} eyebrow="Team is full" title={`${state.store.name}'s team is full`}>
          <p className="text-[15px] leading-[22px] text-neutral-500">
            Its plan has room for {state.limit} people. Ask the owner to free a seat or upgrade, then open this link again.
          </p>
          <div className="mt-5">
            <Link href={`/team/join?token=${encodeURIComponent(token)}`} className={JOIN_BTN_QUIET}>Check again</Link>
          </div>
        </StoreCard>
      )
    case "signed_out":
      return (
        <StoreCard store={state.store} eyebrow="Team invite" title={`Join ${state.store.name}`}>
          <Invited />
          <RoleBox permissions={state.permissions} email={state.email} />
          <div className="mt-5 space-y-2">
            {/* Through the route that keeps the invite for after sign in, whichever way that is (app/api/team/join/sign-in). */}
            <a href={signInHref(token, state.hasAccount)} className={JOIN_BTN_PRIMARY} data-join="sign-in">
              {state.hasAccount ? "Log in to accept" : "Create account to accept"}
            </a>
            <a href={signInHref(token, !state.hasAccount)} className={JOIN_BTN_QUIET}>
              {state.hasAccount ? "New to Storelib? Create an account" : "Already on Storelib? Log in"}
            </a>
          </div>
        </StoreCard>
      )
    case "wrong_account":
      return (
        <StoreCard store={state.store} eyebrow="Team invite" title={`Join ${state.store.name}`}>
          <Invited />
          <RoleBox permissions={state.permissions} email={state.email} />
          <p className="mt-4 text-[14px] leading-5 text-neutral-500" data-join="other-email">
            {state.signedInAs ? (
              <>
                You're signed in as <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{state.signedInAs}</span>. Joining adds this account to the team.
              </>
            ) : (
              <>Joining adds the account you're signed in with to the team.</>
            )}
          </p>
          {note ? <Note kind={note} /> : null}
          <div className="mt-5 space-y-2">
            <AcceptDecline token={token} storeName={state.store.name} label="Join with this account" decline={false} />
            <UseAnotherAccount token={token} label="Switch account" quiet />
          </div>
        </StoreCard>
      )
    case "ready":
      return (
        <StoreCard store={state.store} eyebrow="Team invite" title={`Join ${state.store.name}`}>
          <Invited />
          <RoleBox permissions={state.permissions} email={state.email} />
          {note ? <Note kind={note} /> : null}
          <div className="mt-5">
            <AcceptDecline token={token} storeName={state.store.name} />
          </div>
        </StoreCard>
      )
  }
}

/** Who the invite comes from, as the handover says it: the Storelib Team, not a personal note. */
function Invited() {
  return <p className="mb-6 text-[15px] leading-[22px] text-neutral-500">Storelib Team invited you to help run this store.</p>
}

export function signInHref(token: string, hasAccount: boolean): string {
  return `/api/team/join/sign-in?token=${encodeURIComponent(token)}&to=${hasAccount ? "login" : "signup"}`
}

export function Note({ kind }: { kind: string }) {
  const text =
    kind === "slow"
      ? "Too many tries. Wait a few minutes, then press Join again."
      : kind === "again"
        ? "That press didn't reach us from this page. Press Join again."
        : "That didn't go through. Try again."
  return <p role="alert" className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#991b1b]">{text}</p>
}

export function RoleBox({ permissions, email }: { permissions: readonly TeamPermission[]; email: string }) {
  const lines = permissionLinesEn(permissions)
  return (
    <div className="rounded-xl border border-[#eef0f2] bg-[#f8f9fa] px-4 py-3.5" data-join-role={accessSummaryEn(permissions)}>
      <p className="text-[13px] font-medium text-[#1a1a2e]">
        {lines.length ? "You'll be able to" : "The owner hasn't given this invite any access yet."}
      </p>
      {lines.length ? (
        <ul className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13.5px] leading-5 text-[#374151]">
              <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="mt-[2px] shrink-0 text-[#16a34a]">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 border-t border-[#eef0f2] pt-2.5 text-[12.5px] leading-[18px] text-[#6b7280]">{OWNER_KEEPS_EN}</p>
      <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">
        For <span className="font-medium text-[#374151] [overflow-wrap:anywhere]">{email}</span>. You keep your own account and can leave any time.
      </p>
    </div>
  )
}

export function StoreCard({ store, eyebrow, title, children }: { store: InviteStore; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section data-join-card="">
      <div className="mb-6">
        <AuthStore name={store.name} avatarUrl={store.avatarUrl} line={eyebrow} />
      </div>
      <h1 className="mb-3 text-[28px] font-bold leading-[34px] tracking-tight text-neutral-900 [overflow-wrap:anywhere] sm:text-[32px] sm:leading-[38px]">{title}</h1>
      {children}
    </section>
  )
}

export function Plain({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section data-join-card="">
      <AuthHeading title={title} sub={body} />
      {children}
    </section>
  )
}

/** The log in page's layout (components/auth/auth-split). */
export function Frame({ children }: { children: React.ReactNode }) {
  return <AuthSplit page="team-join">{children}</AuthSplit>
}
