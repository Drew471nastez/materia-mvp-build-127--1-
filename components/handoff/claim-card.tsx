import Link from "next/link"
import { JOIN_BTN_PRIMARY, JOIN_BTN_QUIET } from "@/components/team/join-actions"
import { Plain, StoreCard } from "@/components/team/join-card"
import { AcceptOwnership, OpenBusiness, SwitchAccount } from "@/components/handoff/claim-actions"
import { BLOCKER_TEXT_FOR_RECIPIENT, GOES_WITH_IT, STAYS_BEHIND, claimSignInPath, type ClaimState } from "@/lib/handoff/rules"

/**
 * The claim page's cards (app/(storelib)/team/claim/[token]), one per state
 * of the link (lib/handoff/rules claimStateOf). The team invite's frame and
 * card (components/team/join-card): the page grey, one white card with the
 * hairline border, the business's photo and name at the top, the near black
 * primary button the auth pages use. Kept apart from the page so the suite
 * can draw every state without a database.
 */

export interface ClaimPreview {
  storeAddress: string | null
  onePageAddress: string | null
  products: number
  websites: number
  domains: string[]
  sender: string | null
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
    <p role="alert" className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#991b1b]" data-claim-note={kind}>
      {text}
    </p>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the business is and what comes with it: read only. */
export function ClaimPreviewBox({ preview, keepFounder }: { preview: ClaimPreview; keepFounder?: boolean }) {
  const addresses: [string, string][] = []
  if (preview.onePageAddress) addresses.push(["OnePage", preview.onePageAddress])
  if (preview.storeAddress) addresses.push(["Store", preview.storeAddress])
  if (preview.domains.length) addresses.push([preview.domains.length === 1 ? "Domain" : "Domains", preview.domains.join(", ")])
  const sender = preview.sender || "The sender"
  return (
    <div className="rounded-xl border border-[#eef0f2] bg-[#f8f9fa] px-4 py-3.5" data-claim-preview="">
      {addresses.length ? (
        <dl className="space-y-1.5">
          {addresses.map(([k, v]) => (
            <div key={k} className="flex gap-3 text-[13.5px] leading-5">
              <dt className="w-[72px] shrink-0 text-[#6b7280]">{k}</dt>
              <dd className="min-w-0 font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className={`${addresses.length ? "mt-2.5 border-t border-[#eef0f2] pt-2.5" : ""} text-[13.5px] leading-5 text-[#374151]`} data-claim-counts="">
        {plural(preview.products, "product", "products")}
        {preview.websites ? `, ${plural(preview.websites, "website", "websites")}` : ""}
      </p>
      <p className="mt-3 text-[13px] font-medium text-[#1a1a2e]">Comes with it</p>
      <ul className="mt-1.5 space-y-1">
        {GOES_WITH_IT.map((line) => (
          <li key={line} className="text-[13px] leading-5 text-[#374151]">{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] font-medium text-[#1a1a2e]">Stays with {sender}</p>
      <ul className="mt-1.5 space-y-1">
        {STAYS_BEHIND.map((line) => (
          <li key={line} className="text-[13px] leading-5 text-[#6b7280]">{line.replace("The sender's", `${sender}'s`)}</li>
        ))}
      </ul>
      {keepFounder ? <p className="mt-3 border-t border-[#eef0f2] pt-2.5 text-[12.5px] leading-[18px] text-[#6b7280]">{sender} stays on your team. You can remove them in Settings, Team.</p> : null}
    </div>
  )
}

export function ClaimCard({ state, token, note, signedIn, preview }: { state: ClaimState; token: string; note: string; signedIn: boolean; preview: ClaimPreview | null }) {
  const home = signedIn ? "/app" : "/"
  const homeLabel = signedIn ? "Go to my dashboard" : "Go to Storelib"
  const quietHome = <Link href={home} className={JOIN_BTN_QUIET}>{homeLabel}</Link>
  const card = (business: { name: string; avatarUrl: string | null }, eyebrow: string, title: string, children: React.ReactNode) => (
    <StoreCard store={{ id: "", name: business.name, avatarUrl: business.avatarUrl }} eyebrow={eyebrow} title={title}>
      {children}
    </StoreCard>
  )
  const line = (text: string) => <p className="text-center text-[14px] leading-[21px] text-[#6b7280]">{text}</p>
  switch (state.kind) {
    case "invalid":
      return <Plain title="This link is not complete" body="Part of it is missing. Open it from the email again, or copy the whole link.">{quietHome}</Plain>
    case "gone":
      return <Plain title="This link doesn't work" body="It may have been replaced by a newer link. Ask the person who sent it for the latest one.">{quietHome}</Plain>
    case "revoked":
      return card(state.business, "Link cancelled", "This link was cancelled", <>{line("The person who sent it cancelled it. Ask them for a new one if you still need it.")}<div className="mt-5">{quietHome}</div></>)
    case "expired":
      return card(state.business, "Link expired", "This link has expired", <>{line(`Ask the person who sent it for a new link to ${state.business.name}.`)}<div className="mt-5">{quietHome}</div></>)
    case "stale":
      return card(state.business, "Not available", "This business can't be handed over", <>{line("It is no longer with the person who sent the link. Ask them what happened.")}<div className="mt-5">{quietHome}</div></>)
    case "accepted":
      return state.mine
        ? card(state.business, "It's yours", `${state.business.name} is yours`, (
            <>
              {line("Connect your payout account in Settings, Payments to get paid. You can open it any time from your account menu.")}
              <div className="mt-5">
                <OpenBusiness userId={state.businessUserId} name={state.business.name} />
              </div>
            </>
          ))
        : card(state.business, "Link used", "This link has been used", <>{line("Someone already accepted it. If that wasn't you, ask the person who sent it.")}<div className="mt-5">{quietHome}</div></>)
    case "own":
      return card(state.business, "Your business", "You're the one handing this over", <>{line("This link is for someone else. Send it to them, or manage it in Settings, Team.")}<div className="mt-5"><Link href="/app/settings?tab=team" className={JOIN_BTN_PRIMARY}>Open Team settings</Link></div></>)
    case "signed_out":
      return card(state.business, "Business handover", `Take over ${state.business.name}`, (
        <>
          {preview ? <ClaimPreviewBox preview={preview} /> : null}
          <div className="mt-5 space-y-2">
            <a href={claimSignInPath(token, { signup: true, email: state.email })} className={JOIN_BTN_PRIMARY} data-claim="signup">Create account to accept</a>
            <a href={claimSignInPath(token, { signup: false, email: state.email })} className={JOIN_BTN_QUIET} data-claim="login">Already on Storelib? Log in</a>
          </div>
        </>
      ))
    case "wrong_email":
      return card(state.business, "Business handover", `Take over ${state.business.name}`, (
        <>
          <p className="text-center text-[14px] leading-[21px] text-[#6b7280]" data-claim="wrong-email">
            This link was sent to <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{state.email}</span>
            {state.signedInAs ? <>, and you're signed in as <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{state.signedInAs}</span></> : null}. Sign in with that email to accept.
          </p>
          {note ? <ClaimNote kind={note} /> : null}
          <div className="mt-5"><SwitchAccount token={token} email={state.email} /></div>
        </>
      ))
    case "verify_email":
      return card(state.business, "Business handover", "Confirm your email first", (
        <>
          {line(`${state.signedInAs ? `We need to know ${state.signedInAs} is yours` : "We need to know your email is yours"} before a business can be handed to it.`)}
          <div className="mt-5 space-y-2">
            <a href={`/signup/verify?userId=${encodeURIComponent(state.userId)}&next=${encodeURIComponent(`/team/claim/${token}`)}`} className={JOIN_BTN_PRIMARY} data-claim="verify">Confirm my email</a>
            <SwitchAccount token={token} email={null} label="Use another account" quiet />
          </div>
        </>
      ))
    case "limit":
      return card(state.business, "Business handover", "You have three businesses already", (
        <>
          {line(`One login can have three businesses. Remove one of yours, or accept ${state.business.name} with another account.`)}
          {note ? <ClaimNote kind={note} /> : null}
          <div className="mt-5 space-y-2">
            <SwitchAccount token={token} email={null} label="Use another account" />
            {quietHome}
          </div>
        </>
      ))
    case "not_ready":
      return card(state.business, "Business handover", "Almost ready", (
        <>
          {line(`${preview?.sender || "The sender"} has something left to do before you can take it over. The link keeps working.`)}
          <ul className="mt-3 space-y-1.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5" data-claim-blockers="">
            {state.blockers.map((b) => (
              <li key={b} className="text-[13px] leading-5 text-[#92400e]">{BLOCKER_TEXT_FOR_RECIPIENT[b]}</li>
            ))}
          </ul>
          <div className="mt-5"><a href={`/team/claim/${encodeURIComponent(token)}`} className={JOIN_BTN_QUIET}>Check again</a></div>
        </>
      ))
    case "ready":
      return card(state.business, "Business handover", `Take over ${state.business.name}`, (
        <>
          {preview ? <ClaimPreviewBox preview={preview} keepFounder={state.keepFounder} /> : null}
          {note ? <ClaimNote kind={note} /> : null}
          <div className="mt-5">
            <AcceptOwnership token={token} />
          </div>
        </>
      ))
  }
}
