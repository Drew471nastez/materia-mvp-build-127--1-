import Link from "next/link"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { AppAvatar } from "@/components/app/app-avatar"
import { AcceptDecline, JOIN_BTN_PRIMARY, JOIN_BTN_QUIET, UseAnotherAccount } from "@/components/team/join-actions"
import { OWNER_KEEPS, ROLE_CAN, ROLE_LABEL, type MemberRole } from "@/lib/team/roles"
import { inviteSignInPath } from "@/lib/team/invite-links"
import type { InviteState, InviteStore } from "@/lib/team/invite-state"

/**
 * The invite page's cards (app/team/join), one per state of the invite
 * (lib/team/invite-state). In Storelib's own look: the page grey, one white
 * card with the hairline border, the store's photo and name at the top, the
 * near black primary button the auth pages use. Kept apart from the page so
 * a harness can draw every state without a database.
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
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">
            {state.mine ? `You work in it as ${ROLE_LABEL[state.role]}. Open it from your account menu any time.` : "Someone already joined with it. If that wasn't you, ask the store's owner for a new invite."}
          </p>
          <div className="mt-5">
            <Link href={signedIn ? "/app" : "/login"} className={JOIN_BTN_PRIMARY}>{signedIn ? "Go to my dashboard" : "Log in"}</Link>
          </div>
        </StoreCard>
      )
    case "expired":
      return (
        <StoreCard store={state.store} eyebrow="Invite expired" title="This invite has expired">
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">
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
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">You already own it, so there is nothing to join. Invites are for other people.</p>
          <div className="mt-5">
            <Link href="/app/settings?tab=team" className={JOIN_BTN_PRIMARY}>Open Team settings</Link>
          </div>
        </StoreCard>
      )
    case "seats_full":
      return (
        <StoreCard store={state.store} eyebrow="Team is full" title={`${state.store.name}'s team is full`}>
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">
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
          <RoleBox role={state.role} email={state.email} />
          <div className="mt-5 space-y-2">
            <Link href={inviteSignInPath({ token, email: state.email, hasAccount: state.hasAccount })} className={JOIN_BTN_PRIMARY} data-join="sign-in">
              {state.hasAccount ? "Log in to accept" : "Create account to accept"}
            </Link>
            <Link href={inviteSignInPath({ token, email: state.email, hasAccount: !state.hasAccount })} className={JOIN_BTN_QUIET}>
              {state.hasAccount ? "New to Storelib? Create an account" : "Already on Storelib? Log in"}
            </Link>
          </div>
        </StoreCard>
      )
    case "wrong_account":
      return (
        <StoreCard store={state.store} eyebrow="Team invite" title="This invite is for another account">
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">
            The invite to {state.store.name} was sent to <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{state.email}</span>.
            {state.signedInAs ? <> You're signed in as <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{state.signedInAs}</span>.</> : null}
          </p>
          <div className="mt-5 space-y-2">
            <UseAnotherAccount token={token} label="Switch account" />
            <Link href="/" className={JOIN_BTN_QUIET}>Not now</Link>
          </div>
          <p className="mt-3 text-center text-[12.5px] leading-[18px] text-[#9ca3af]">We sign you out here, then you sign in as the invited email and come straight back.</p>
        </StoreCard>
      )
    case "ready":
      return (
        <StoreCard store={state.store} eyebrow="Team invite" title={`Join ${state.store.name}`}>
          <RoleBox role={state.role} email={state.email} />
          {note ? <Note kind={note} /> : null}
          <div className="mt-5">
            <AcceptDecline token={token} storeName={state.store.name} />
          </div>
        </StoreCard>
      )
  }
}

export function Note({ kind }: { kind: string }) {
  const text = kind === "slow" ? "Too many tries. Wait a few minutes, then press Join again." : "That didn't go through. Try again."
  return <p role="alert" className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#991b1b]">{text}</p>
}

export function RoleBox({ role, email }: { role: MemberRole; email: string }) {
  return (
    <div className="rounded-xl border border-[#eef0f2] bg-[#f8f9fa] px-4 py-3.5" data-join-role={role}>
      <p className="text-[13px] font-medium text-[#1a1a2e]">
        As {ROLE_LABEL[role]}, you can
      </p>
      <ul className="mt-2 space-y-1.5">
        {ROLE_CAN[role].map((line) => (
          <li key={line} className="flex items-start gap-2 text-[13.5px] leading-5 text-[#374151]">
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="mt-[2px] shrink-0 text-[#16a34a]">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-[#eef0f2] pt-2.5 text-[12.5px] leading-[18px] text-[#6b7280]">{OWNER_KEEPS}</p>
      <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">
        For <span className="font-medium text-[#374151] [overflow-wrap:anywhere]">{email}</span>. You keep your own account and can leave any time.
      </p>
    </div>
  )
}

export function StoreCard({ store, eyebrow, title, children }: { store: InviteStore; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 pb-5 pt-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-7 sm:pb-7 sm:pt-8" data-join-card="">
      <div className="flex flex-col items-center text-center">
        {store.avatarUrl ? (
          <AppAvatar src={store.avatarUrl} name={store.name} size={56} className="ring-1 ring-[#e5e7eb]" />
        ) : (
          /* No photo: the store's first letter, never a stranger's silhouette. */
          <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-[#1a1a2e] text-[22px] font-semibold text-white">
            {store.name.trim().charAt(0).toUpperCase() || "S"}
          </span>
        )}
        <p className="mt-3 text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#6b7280]">{eyebrow}</p>
        <h1 className="mt-1 text-[22px] font-bold leading-[28px] tracking-tight text-[#1a1a2e] [overflow-wrap:anywhere]">{title}</h1>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function Plain({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-7 sm:py-8" data-join-card="">
      <h1 className="text-[20px] font-bold leading-[26px] tracking-tight text-[#1a1a2e]">{title}</h1>
      <p className="mt-2 text-[14px] leading-[21px] text-[#6b7280]">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-svh w-full flex-col items-center bg-[#f8f9fa] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+28px)] font-sans text-[#1a1a2e] sm:justify-center sm:pt-10"
      data-page="team-join"
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2" aria-label="Storelib">
          <StorelibLogo size={28} />
          <span className="text-[18px] font-bold tracking-tight text-[#1a1a2e]">Storelib</span>
        </div>
        {children}
      </div>
    </main>
  )
}
