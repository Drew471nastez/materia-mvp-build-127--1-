"use client"

/**
 * ===========================================================================
 *  ONE PERSON
 * ===========================================================================
 * Wave 5 (the owner: simpler, Storelib's look): the bar is an order's bar
 * (Back, the name, Email and one ⋯), then one Details card with what a
 * creator looks for first (address, where they came from, when, marketing
 * emails) and their tags and notes; beside it, only the sections that have
 * something in them: purchases, activity, communities, courses, form
 * answers, emails. On a phone Details comes first. Marketing consent is
 * never inferred:
 * being a member of a community, buying, or answering a form does not put
 * anybody on the list, and Email is offered only to people who are on it.
 *
 * Everything shown was read on the server for this store (./page.tsx); the
 * buttons write through /api/contacts/<id>, which checks the store again.
 */
import { displayEmail, displayEmails } from "@/lib/businesses/email-alias"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Mail, MoreHorizontal } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { formatMinor } from "@/lib/markets/money"
import type { Profile } from "@/lib/contacts/profile-server"
import { BACK_ARROW, ContactsPane, backToPeople, peopleHref } from "../contacts-header"
import { confirmForm } from "@/components/forms/form-confirm"
import { draftPhone, draftTags } from "../add-contact-logic"
import { GUTTER, ORDER_WIDTH, PaneBar, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../../orders/order-parts"
import { contactsRequest, dayOf, journeyInTime, labelsOf, leadStatusLabel, memberStatusLabel, membershipStatusLabel, originLabel, subscriptionLabel, whoOf } from "../contact-words"

const field = "w-full rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10"
const money = (cents: number, currency: string) => formatMinor(cents, currency, appLocale())

/** Why Email is not offered, or null when it is. */
function emailBlock(p: Profile): string | null {
  if (!displayEmail(p.person.email)) return tt("There is no email address for this person.")
  if (p.consent.state === "unsubscribed") return tt("They unsubscribed from your emails.")
  if (p.consent.state === "blocked") return tt("An email to them bounced or they marked one as spam, so nothing more is sent.")
  if (p.consent.state === "none") return tt("They are not on your email list. Marketing emails only go to people who subscribed.")
  if (p.consent.suppressed) return tt("This address asked not to get emails.")
  return null
}

export function ProfileClient({ profile: served, marketing }: { profile: Profile; marketing: boolean }) {
  const router = useRouter()
  const phone = usePhoneWidth()
  /* Wave 9: what Edit just saved is shown at once, not after the server's next draw; the server's own draw replaces it. */
  const [saved, setSaved] = React.useState<EditValues | null>(null)
  React.useEffect(() => setSaved(null), [served])
  const profile = React.useMemo(() => withEdits(served, saved), [served, saved])
  const p = profile.person
  const [editing, setEditing] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; failed?: boolean } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const blocked = emailBlock(profile)
  const labels = labelsOf(p)

  const back = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    /* Wave 7: up to the People list as it was (view, search, page), by history when it is behind, else pushed at its last query. */
    backToPeople(router)
  }

  const unsubscribe = async () => {
    /* Storelib's own confirm (components/forms/form-confirm), never the browser's. */
    const yes = await confirmForm({ title: tt("Unsubscribe from emails"), body: tt("Take {name} off your email list? They stop getting marketing emails. Their orders and community access do not change.", { name: whoOf(p) }), confirm: tt("Unsubscribe from emails"), cancel: tt("Cancel") })
    if (yes !== true) return
    setBusy(true)
    const r = await contactsRequest(`/api/contacts/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe" }), fallback: tt("Not changed. Try again.") })
    setBusy(false)
    if (!r.ok) return setMessage({ text: r.error, failed: true })
    setMessage({ text: tt("Taken off your email list.") })
    router.refresh()
  }

  const remove = async () => {
    const yes = await confirmForm({ title: tt("Delete contact"), body: tt("Delete what you added for this person (notes, tags, or the contact you added)? Their orders, memberships, community access, form answers and list sign up are not deleted."), confirm: tt("Delete"), cancel: tt("Cancel") })
    if (yes !== true) return
    setBusy(true)
    const r = await contactsRequest<{ kept?: boolean }>(`/api/contacts/${p.id}`, { method: "DELETE", fallback: tt("Not deleted. Try again.") })
    setBusy(false)
    if (!r.ok) return setMessage({ text: r.error, failed: true })
    if (r.data.kept) {
      setMessage({ text: tt("Deleted what you added. They stay in your contacts because of their other records.") })
      router.refresh()
    } else router.push(peopleHref())
  }

  const menu: ActionMenuItem[] = [
    { label: tt("Edit name, tags and notes"), onClick: () => setEditing(true), id: "contact-edit" },
    ...(marketing && profile.consent.state === "subscribed" ? [{ label: tt("Unsubscribe from emails"), onClick: () => void unsubscribe(), separatorBefore: true }] : []),
    ...(p.hasContact ? [{ label: tt("Delete contact"), variant: "destructive" as const, onClick: () => void remove(), separatorBefore: true, disabled: busy }] : []),
  ]

  return (
    <ContactsPane>
      <PaneBar width={ORDER_WIDTH} sticky className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 pb-2.5 pt-2 lg:pb-3 lg:pt-5">
        <div className="flex items-center">
          {/* Wave 9: the same back arrow as every bar in Contacts (contacts-header BACK_ARROW): a 44px press on a phone. */}
          <a href={peopleHref()} onClick={back} className={BACK_ARROW} aria-label={tt("Back to contacts")} data-contacts-back="">
            <ArrowLeft className="h-5 w-5" />
          </a>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="truncate text-[20px] font-bold text-[#1a1a2e] sm:text-[22px]" data-contact-name="">
            {whoOf(p)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {blocked ? (
            <span title={blocked}>
              <button type="button" className={buttonSecondary} disabled aria-describedby="email-blocked" data-contact-email="off">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">{tt("Email")}</span>
              </button>
              <span id="email-blocked" className="sr-only">
                {blocked}
              </span>
            </span>
          ) : (
            <Link href={`/app/emails/new?to=${encodeURIComponent(p.id)}`} className={buttonAccent} data-contact-email="on">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">{tt("Email")}</span>
            </Link>
          )}
          {/* Round 52: one Edit, in ⋯ and on Tags and notes; no third one in the bar. */}
          <ResponsiveActionMenu title={whoOf(p)} align="end" trigger={<button type="button" className={cn(iconButton, "max-sm:h-10 max-sm:w-10")} aria-label={tt("More actions")} data-contact-more=""><MoreHorizontal className="h-4 w-4" /></button>} items={menu} />
        </div>
        <div className="col-span-2 col-start-2 mt-1 min-w-0 truncate text-[14px] text-[#6b7280] sm:-mt-0.5 sm:text-[13px]">{[p.name ? displayEmail(p.email) : null, ...labels].filter(Boolean).join(" · ") || originLabel(p.origin)}</div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-10", ORDER_WIDTH, GUTTER)} data-contact-profile={p.id}>
        {message ? (
          <p className={cn("mt-3 text-[13px]", message.failed ? "text-[#b42318]" : "text-[#14532d]")} role="status">
            {message.text}
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-3 lg:order-2">
            <Details profile={profile} blocked={blocked} />
            <TagsNotes profile={profile} onEdit={() => setEditing(true)} />
          </div>
          <div className="min-w-0 space-y-3 lg:order-1">
            <Journey profile={profile} />
            <Purchases profile={profile} />
            <Activity profile={profile} />
            <Communities profile={profile} />
            <Courses profile={profile} />
            <Forms profile={profile} />
            <Emails profile={profile} />
          </div>
        </div>
      </div>

      <EditPerson
        open={editing}
        phone={phone}
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={(t, values) => {
          setMessage({ text: t })
          setSaved(values)
          setEditing(false)
          router.refresh()
        }}
      />
    </ContactsPane>
  )
}

function Section({ title, id, children, aside }: { title: string; id?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className={cn(card, "px-4 py-3.5")} aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{title}</h2>
        {aside}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 text-[13px]">
      <dt className="text-[#6b7280]">{label}</dt>
      <dd className="min-w-0 break-words text-[#1a1a2e]">{children}</dd>
    </div>
  )
}

function Details({ profile, blocked }: { profile: Profile; blocked: string | null }) {
  const p = profile.person
  const c = profile.consent
  /* As shown: a second business's tag off, an address with no inbox not at all, and each address once. */
  const shown = displayEmail(p.email)
  const others = displayEmails(profile.emails).filter((e) => e.toLowerCase() !== shown?.toLowerCase())
  return (
    <Section title={tt("Details")}>
      <dl className="grid gap-2" data-contact-details="">
        <Row label={tt("Email")}>{shown || <span className="text-[#9ca3af]">{tt("No email")}</span>}</Row>
        {others.length ? <Row label={tt("Other emails")}>{others.join(", ")}</Row> : null}
        {profile.contact?.phone ? (
          <Row label={tt("Phone")}>
            <a href={`tel:${profile.contact.phone.replace(/[^+0-9]/g, "")}`} className="hover:underline" data-contact-phone="">
              {profile.contact.phone}
            </a>
          </Row>
        ) : null}
        <Row label={tt("Marketing emails")}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Quiet text, not a coloured pill (round 52); only a bounce or complaint is red. */}
            <span className={c.state === "blocked" ? "text-[#b42318]" : "text-[#1a1a2e]"}>{c.suppressed && c.state === "subscribed" ? tt("Asked for no emails") : subscriptionLabel(c.state)}</span>
            {c.state === "subscribed" && c.consentAt ? <span className="text-[#6b7280]">{dayOf(c.consentAt)}</span> : c.unsubscribedAt && c.state !== "subscribed" ? <span className="text-[#6b7280]">{dayOf(c.unsubscribedAt)}</span> : null}
          </span>
        </Row>
        {c.consentText ? <Row label={tt("How they agreed")}>{c.consentText}</Row> : null}
        <Row label={tt("Came from")}>{originLabel(p.origin)}</Row>
        {p.firstSeen ? <Row label={tt("First seen")}>{dayOf(p.firstSeen)}</Row> : null}
        {p.lastSeen ? <Row label={tt("Last activity")}>{dayOf(p.lastSeen)}</Row> : null}
        {profile.account ? <Row label={tt("Storelib account")}>{profile.account.verified ? tt("Yes, email confirmed") : tt("Yes, email not confirmed")}</Row> : null}
      </dl>
      {blocked && shown ? <p className="mt-2.5 text-[12px] leading-[18px] text-[#6b7280]">{p.member && c.state !== "subscribed" ? tt("Community members get community notices, not your marketing emails, unless they subscribe.") : blocked}</p> : null}
    </Section>
  )
}

function TagsNotes({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const tags = profile.person.tags
  const notes = profile.contact?.notes
  return (
    <Section
      title={tt("Tags and notes")}
      aside={
        <button type="button" onClick={onEdit} className="-mr-1 rounded-md px-1 text-[12px] font-medium text-[#6d4ae0] hover:underline" data-contact-edit="">
          {tt("Edit")}
        </button>
      }
    >
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Link key={t} href={`/app/contacts?tag=${encodeURIComponent(t)}`} className="rounded-md bg-[#f1f2f4] px-2 py-0.5 text-[12px] text-[#1a1a2e] hover:bg-[#e8e9ec]">
              {t}
            </Link>
          ))}
        </div>
      ) : null}
      {notes ? <p className="mt-2 whitespace-pre-wrap text-[13px] text-[#1a1a2e]">{notes}</p> : null}
      {!tags.length && !notes ? <p className="text-[13px] text-[#9ca3af]">{tt("No tags or notes yet.")}</p> : null}
    </Section>
  )
}

function activityText(a: Profile["activity"][number]): string {
  switch (a.kind) {
    case "subscribed":
      return tt("Joined your email list")
    case "order":
      return a.text ? tt("Bought {product}", { product: a.text }) : tt("Placed an order")
    case "community":
      return tt("Joined {community}", { community: a.text || tt("your community") })
    case "form":
      return a.text ? tt("Answered {form}", { form: a.text }) : tt("Answered a form")
    case "lead":
      return tt("Signed up on your OnePage")
    case "message":
      return a.text ? tt("Sent you a message: {subject}", { subject: a.text }) : tt("Sent you a message")
    case "course":
      return a.text ? tt("Started {course}", { course: a.text }) : tt("Started a course")
    case "campaign":
      return a.text ? tt("Was sent {subject}", { subject: a.text }) : tt("Was sent an email")
    case "automation":
      return a.text ? tt("Got the automated email {subject}", { subject: a.text }) : tt("Got an automated email")
    case "unsubscribed":
      return tt("Unsubscribed")
    case "complained":
      return tt("Marked an email as spam")
    case "bounced":
      return tt("An email to them bounced")
    default:
      return a.kind
  }
}

function Activity({ profile }: { profile: Profile }) {
  const [all, setAll] = React.useState(false)
  if (!profile.activity.length) return null
  const shown = all ? profile.activity : profile.activity.slice(0, 5)
  return (
    <Section title={tt("Activity")}>
      <ol className="space-y-2">
        {shown.map((a, i) => (
          <li key={`${a.kind}:${a.at}:${i}`} className="flex items-baseline justify-between gap-3 text-[13px]">
            {a.href ? (
              <Link href={a.href} className="min-w-0 truncate text-[#1a1a2e] hover:underline">
                {activityText(a)}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-[#1a1a2e]">{activityText(a)}</span>
            )}
            <span className="shrink-0 text-[12px] text-[#9ca3af]">{dayOf(a.at)}</span>
          </li>
        ))}
      </ol>
      {profile.activity.length > 5 ? (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 text-[12px] font-medium text-[#6d4ae0] hover:underline">
          {all ? tt("Show less") : tt("Show all {count}", { count: profile.activity.length })}
        </button>
      ) : null}
    </Section>
  )
}

/** The earliest of some dates, or null. */
function earliest(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null
  for (const d of dates) {
    if (!d || Number.isNaN(Date.parse(d))) continue
    if (!best || Date.parse(d) < Date.parse(best)) best = d
  }
  return best
}

export interface JourneyStep {
  id: "seen" | "lead" | "subscriber" | "customer" | "member"
  label: string
  reached: boolean
  at: string | null
  detail: string | null
}

/**
 * WAVE 7, THE WAY THEY CAME (the owner: "lead → customer journey visible").
 * From what the profile already read, nothing new: first seen, then the
 * steps a person takes with a store, each reached or not yet, with the day
 * it first happened. A lead is someone who answered a form, sent a message
 * or signed up on a OnePage; a subscriber is on the email list now (or was:
 * an unsubscribe says so); a customer bought; a member joined a community.
 */
export function journeyOf(profile: Profile): JourneyStep[] {
  const p = profile.person
  const leadAt = earliest([...profile.forms.map((f) => f.at), ...profile.messages.map((m) => m.at), ...profile.leads.map((l) => l.at)])
  const buyAt = earliest([...profile.purchases.map((o) => o.at), ...profile.memberships.map((m) => m.at)])
  const joinAt = earliest(profile.communities.map((c) => c.joinedAt))
  const c = profile.consent
  const orders = profile.purchases.length
  const answered = profile.forms.length + profile.messages.length + profile.leads.length
  const steps: JourneyStep[] = [
    { id: "seen", label: tt("First seen"), reached: true, at: p.firstSeen, detail: originLabel(p.origin) },
    { id: "lead", label: tt("Lead"), reached: p.lead || answered > 0, at: leadAt, detail: answered ? tt("{n, plural, one {# answer} other {# answers}}", { n: answered }) : null },
    {
      id: "subscriber",
      label: tt("Subscriber"),
      reached: c.state === "subscribed" || c.state === "unsubscribed" || p.subscriber,
      at: c.consentAt,
      detail: c.state === "unsubscribed" ? tt("Unsubscribed") : c.state === "subscribed" ? tt("On your list") : null,
    },
    { id: "customer", label: tt("Customer"), reached: p.customer || orders > 0 || profile.memberships.length > 0, at: buyAt, detail: orders ? tt("{n, plural, one {# order} other {# orders}}", { n: orders }) : null },
    { id: "member", label: tt("Member"), reached: p.member || profile.communities.length > 0, at: joinAt, detail: profile.communities[0]?.name || null },
  ]
  return journeyInTime(steps)
}

function Journey({ profile }: { profile: Profile }) {
  const steps = journeyOf(profile)
  return (
    <section className={cn(card, "px-4 py-3.5")} aria-label={tt("Journey")} data-contact-journey="">
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Journey")}</h2>
      <ol className="mt-3 grid gap-x-2 gap-y-2 max-sm:grid-cols-1 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex min-w-0 items-center gap-2.5 sm:flex-col sm:items-stretch sm:gap-2" data-journey-step={s.id} data-reached={s.reached ? "yes" : "no"}>
            <span className="flex items-center sm:w-full" aria-hidden>
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full border-2", s.reached ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white")} />
              {i < steps.length - 1 ? <span className={cn("ml-2 hidden h-px flex-1 sm:block", steps[i + 1].reached ? "bg-[#1a1a2e]/40" : "bg-[#e5e7eb]")} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 sm:block">
              <span className={cn("block shrink-0 truncate text-[13px] font-medium", s.reached ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{s.label}</span>
              <span className="block min-w-0 truncate text-[12px] text-[#6b7280]">{s.reached ? [s.at ? dayOf(s.at) : null, s.detail].filter(Boolean).join(" · ") || tt("Yes") : tt("Not yet")}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Purchases({ profile }: { profile: Profile }) {
  if (!profile.purchases.length && !profile.memberships.length) return null
  return (
    <Section
      title={tt("Purchases")}
      id="purchases"
      aside={profile.spent.length ? <span className="text-[12px] text-[#6b7280]">{tt("Total spent {amount}", { amount: profile.spent.map((s) => money(s.cents, s.currency)).join(" + ") })}</span> : null}
    >
      <ul className="divide-y divide-[#f1f2f4]">
        {profile.purchases.map((o) => (
          <li key={o.id}>
            <Link href={`/app/orders?order=${o.id}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px] hover:underline">
              <span className="min-w-0 truncate text-[#1a1a2e]">{o.product || tt("Removed product")}</span>
              <span className="shrink-0 tabular-nums text-[#1a1a2e]">
                {money(o.amountCents, o.currency)}
                {o.status === "refunded" ? <span className="ml-1.5 text-[#6b7280]">{tt("Refunded")}</span> : o.status === "partially_refunded" ? <span className="ml-1.5 text-[#6b7280]">{tt("Partly refunded")}</span> : null}
                <span className="ml-2 text-[12px] text-[#9ca3af]">{dayOf(o.at)}</span>
              </span>
            </Link>
          </li>
        ))}
        {profile.memberships.map((m) => (
          <li key={m.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-[#1a1a2e]">{m.title || tt("Membership")}</span>
            <span className="shrink-0 tabular-nums text-[#6b7280]">
              {money(m.amountCents, m.currency)} {m.interval === "year" ? tt("a year") : tt("a month")} · {membershipStatusLabel(m.status)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function rsvpLabel(status: string, attended: boolean): string {
  if (attended) return tt("Attended")
  if (status === "waitlist") return tt("On the waitlist")
  if (status === "cancelled") return tt("Cancelled")
  return tt("Going")
}

function Communities({ profile }: { profile: Profile }) {
  if (!profile.communities.length && !profile.communityEvents.length) return null
  return (
    <Section title={tt("Communities")}>
      <ul className="divide-y divide-[#f1f2f4]">
        {profile.communities.map((m) => (
          <li key={m.memberId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-[13px]">
            <span className="min-w-0">
              <span className="font-medium text-[#1a1a2e]">{m.name || tt("Untitled community")}</span>
              <span className="ml-2 text-[#6b7280]">{[m.tier, memberStatusLabel(m.status), m.joinedAt ? tt("joined {day}", { day: dayOf(m.joinedAt) }) : null].filter(Boolean).join(" · ")}</span>
            </span>
            <Link href={`/app/community/${m.communityId}/members?member=${m.memberId}`} className="shrink-0 text-[12px] font-medium text-[#6d4ae0] hover:underline">
              {tt("View in community")}
            </Link>
            {m.cancellation ? (
              <p className="w-full text-[12px] text-[#6b7280]">
                {m.cancellation.endsAt ? tt("Cancelled, access ends {day}", { day: dayOf(m.cancellation.endsAt) }) : tt("Cancelled")}
                {m.cancellation.reason ? ` · ${m.cancellation.reason}` : ""}
              </p>
            ) : null}
            {m.joinAnswers.length ? (
              <dl className="mt-1 grid w-full gap-1 border-l-2 border-[#eef0f2] pl-3">
                {m.joinAnswers.map((a, i) => (
                  <div key={i} className="grid gap-0.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-2">
                    <dt className="text-[#6b7280]">{a.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-[#1a1a2e]">{a.value || "–"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
        {profile.communityEvents.map((e) => (
          <li key={`ev:${e.eventId}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-[#1a1a2e]">{e.title || tt("Event")}</span>
            <span className="shrink-0 text-[12px] text-[#6b7280]">{[rsvpLabel(e.status, e.attended), dayOf(e.startsAt)].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Courses({ profile }: { profile: Profile }) {
  if (!profile.courses.length) return null
  return (
    <Section title={tt("Courses")}>
      <ul className="divide-y divide-[#f1f2f4]">
        {profile.courses.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-[#1a1a2e]">{c.title || tt("Course")}</span>
            <span className="shrink-0 text-[#6b7280]">{c.completedAt ? tt("Finished {day}", { day: dayOf(c.completedAt) }) : tt("{percent}% done", { percent: c.percent })}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Forms({ profile }: { profile: Profile }) {
  if (!profile.forms.length && !profile.messages.length && !profile.leads.length) return null
  return (
    <Section title={tt("Forms")}>
      <ul className="space-y-3">
        {profile.forms.map((f) => (
          <li key={f.id} className="text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium text-[#1a1a2e]">{f.title || tt("Form")}</span>
              <span className="text-[12px] text-[#6b7280]">
                {leadStatusLabel(f.status)} · {dayOf(f.at)} ·{" "}
                <Link href={`/app/contacts/forms?form=${encodeURIComponent(f.formId)}&view=responses&response=${encodeURIComponent(f.id)}`} className="font-medium text-[#6d4ae0] hover:underline" data-contact-response={f.id}>
                  {tt("Open response")}
                </Link>
              </span>
            </div>
            {f.answers.length ? (
              <dl className="mt-1.5 grid gap-1 border-l-2 border-[#eef0f2] pl-3">
                {f.answers.map((a, i) => (
                  <div key={i} className="grid gap-0.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-2">
                    <dt className="text-[#6b7280]">{a.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-[#1a1a2e]">{a.value || "–"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
        {profile.messages.map((m) => (
          <li key={m.id} className="text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link href={`/app/contacts/forms?message=${m.id}`} className="font-medium text-[#1a1a2e] hover:underline">
                {m.subject || tt("Message from your website")}
              </Link>
              <span className="text-[12px] text-[#6b7280]">{dayOf(m.at)}</span>
            </div>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[#4b5563]">{m.message}</p>
          </li>
        ))}
        {profile.leads.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-[#1a1a2e]">{tt("Signed up on your OnePage")}</span>
            <span className="text-[12px] text-[#6b7280]">{dayOf(l.at)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Emails({ profile }: { profile: Profile }) {
  if (!profile.sends.length && !profile.events.length) return null
  return (
    <Section title={tt("Emails")}>
      <ul className="divide-y divide-[#f1f2f4]">
        {profile.sends.map((s) => (
          <li key={`${s.kind}:${s.id}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-[#1a1a2e]">{s.subject || tt("No subject")}</span>
            <span className="shrink-0 text-[12px] text-[#6b7280]">
              {[s.kind === "campaign" ? tt("Campaign") : tt("Automation"), s.clicked ? tt("Clicked") : s.opened ? tt("Opened") : null, dayOf(s.at)].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
        {profile.events.map((e, i) => (
          <li key={`${e.type}:${i}`} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="text-[#1a1a2e]">{activityText({ at: e.at, kind: e.type, text: "" })}</span>
            <span className="shrink-0 text-[12px] text-[#6b7280]">{dayOf(e.at)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

type EditValues = { name: string; tags: string[]; notes: string; phone: string }

/** The profile with what Edit saved laid over it, until the server draws it again. */
function withEdits(profile: Profile, v: EditValues | null): Profile {
  if (!v) return profile
  const contact = { id: profile.contact?.id ?? "", ...profile.contact, name: v.name || null, tags: v.tags, notes: v.notes || null, phone: v.phone || null }
  return { ...profile, contact, person: { ...profile.person, name: v.name || profile.person.name, tags: v.tags, hasContact: true } }
}

const EDIT_FIELD = cn(field, "h-9 max-sm:h-11 max-sm:rounded-xl max-sm:px-3 max-sm:text-[16px]")
const EDIT_LABEL = "mb-1 block text-[12px] font-medium text-[#4b5563] max-sm:text-[13px]"

function EditPerson({ open, phone, profile, onClose, onSaved }: { open: boolean; phone: boolean; profile: Profile; onClose: () => void; onSaved: (text: string, values: EditValues) => void }) {
  const p = profile.person
  const [name, setName] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [tel, setTel] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setName(profile.contact?.name ?? p.name ?? "")
    setTags((profile.contact?.tags ?? []).join(", "))
    setNotes(profile.contact?.notes ?? "")
    setTel(profile.contact?.phone ?? "")
    setError(null)
  }, [open, profile, p.name])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const phoneValue = tel.trim() ? draftPhone(tel) : ""
    if (phoneValue === null) return setError(tt("Enter a phone number with digits, spaces, + ( ) or -."))
    setBusy(true)
    setError(null)
    const values: EditValues = { name: name.replace(/\s+/g, " ").trim(), tags: draftTags(tags), notes, phone: phoneValue }
    const r = await contactsRequest(`/api/contacts/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
      fallback: tt("Not saved. Try again."),
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(tt("Saved."), values)
  }
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Edit contact")} className="p-0 sm:max-w-[480px]" dialog={{ "aria-describedby": undefined }}>
      <form onSubmit={save} noValidate className="space-y-3 p-5 max-sm:px-4 max-sm:pt-1" data-edit-contact="">
        <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Edit contact")}</SheetDialogTitle>
        <label className="block">
          <span className={EDIT_LABEL}>{tt("Name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={EDIT_FIELD} />
        </label>
        <label className="block">
          <span className={EDIT_LABEL}>{tt("Phone")}</span>
          <input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} maxLength={40} className={EDIT_FIELD} data-edit-phone="" />
        </label>
        <label className="block">
          <span className={EDIT_LABEL}>{tt("Tags, separated by commas")}</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={EDIT_FIELD} />
        </label>
        <label className="block">
          <span className={EDIT_LABEL}>{tt("Notes")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={5} className={cn(field, "resize-none py-2 max-sm:rounded-xl max-sm:px-3 max-sm:text-[16px]")} />
        </label>
        <p className="text-[12px] text-[#6b7280] max-sm:text-[13px]">{tt("Only you and your team see these. The name here does not change their orders or account.")}</p>
        {error ? <p className="text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1 max-sm:[&>button]:h-11 max-sm:[&>button]:flex-1 max-sm:[&>button]:rounded-xl max-sm:[&>button]:text-[15px]">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={buttonAccent} disabled={busy}>
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </div>
      </form>
    </SheetDialog>
  )
}
