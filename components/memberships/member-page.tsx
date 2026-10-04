"use client"

/**
 * ===========================================================================
 *  ONE MEMBERSHIP, FROM THE MEMBER'S SIDE
 * ===========================================================================
 * /library/memberships/<id>. What a member comes back for is the creator's
 * posts, so the feed is the page: newest first, a violet dot on each post
 * they have not opened, and the dot goes out once the post has been on
 * screen for a moment (IntersectionObserver, sent in batches to
 * /api/memberships/<id>/read).
 *
 * Around it, only what a member needs:
 *   the top      the membership, the creator, where it stands and what
 *                happens next, and Manage (cancel or resume, the card,
 *                post emails on or off, a message to the creator)
 *   a banner     only when something needs doing or has just happened: a
 *                failed payment (update the card, pay now), a cancellation
 *                (resume), the end (join again), a welcome after joining
 *   the side     what members get, the products included (open in the
 *                library), the creator, and the payments with their receipts
 *
 * On a phone the side follows the feed, in the same order. Manage is the
 * app's action menu: a dropdown on a computer, a bottom sheet on a phone.
 *
 * Everything the server did not send is not here: a member without access
 * gets the posts' titles and dates only, and a banner to join again.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Check, ChevronDown, MoreHorizontal } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { describeStatus, money, pricePer, shortDate } from "@/lib/memberships/state"
import type { FeedPost, MembershipPage } from "@/lib/memberships/view-types"
import { PostText, PostView } from "./post-view"
import { StatusLabel, TONE_TEXT } from "./status-line"

type Membership = MembershipPage["membership"]

/** The Storelib button shape: 8px corners, the same height everywhere on this page. */
const BUTTON = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[14px] font-medium outline-none transition-[background-color,border-color,scale] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none"
const PRIMARY = `${BUTTON} bg-[#8b5cf6] text-white hover:bg-[#7c3aed]`
const SECONDARY = `${BUTTON} border border-[#e1e3e7] bg-white text-[#1a1a2e] hover:bg-[#f7f7f8]`

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: "The connection dropped. Nothing changed. Try again." } as T & { error?: string } }
  }
}

/** A row from the manage route, as the page shows it. */
function fromRow(prev: Membership, row: Record<string, unknown>, view: Membership["view"] | null): Membership {
  return {
    ...prev,
    status: String(row.status ?? prev.status),
    currentPeriodEnd: (row.current_period_end as string | null) ?? prev.currentPeriodEnd,
    trialEnd: (row.trial_end as string | null) ?? prev.trialEnd,
    emailUpdates: typeof row.email_updates === "boolean" ? row.email_updates : prev.emailUpdates,
    view: view ?? prev.view,
  }
}

/* ── Read tracking ──────────────────────────────────────────────────────── */

/**
 * A post counts as read after it has been on screen for 1.2 seconds: half of
 * it, or, for a post taller than the screen, enough of it to fill 40% of
 * the screen (half of a long post can never be on screen at once). Sent in
 * one batch, once per post.
 */
function useReadTracking(membershipId: string, posts: FeedPost[], onRead: (ids: string[]) => void) {
  const pending = React.useRef(new Set<string>())
  const timers = React.useRef(new Map<string, number>())
  const flushTimer = React.useRef(0)
  const onReadRef = React.useRef(onRead)
  onReadRef.current = onRead

  /* Read in this visit, so a post is never sent twice and reading one does not restart the others' wait. */
  const done = React.useRef(new Set<string>())
  const flush = React.useCallback(() => {
    const ids = [...pending.current].filter((id) => !done.current.has(id))
    pending.current.clear()
    for (const id of ids) done.current.add(id)
    if (ids.length === 0) return
    onReadRef.current(ids)
    void fetch(`/api/memberships/${membershipId}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postIds: ids }), keepalive: true }).catch(() => {})
  }, [membershipId])

  /* The observer follows which posts are on the page, not whether each is read, so a read never restarts it. */
  const postKey = posts.map((p) => p.id).join(",")
  React.useEffect(() => {
    const unread = posts.filter((p) => p.unread && !done.current.has(p.id)).map((p) => p.id)
    if (unread.length === 0 || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.post
          if (!id) continue
          const seen = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.4)
          if (seen) {
            if (timers.current.has(id)) continue
            timers.current.set(
              id,
              window.setTimeout(() => {
                timers.current.delete(id)
                pending.current.add(id)
                io.unobserve(e.target)
                window.clearTimeout(flushTimer.current)
                flushTimer.current = window.setTimeout(flush, 400)
              }, 1200),
            )
          } else {
            window.clearTimeout(timers.current.get(id))
            timers.current.delete(id)
          }
        }
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1] },
    )
    for (const id of unread) {
      const el = document.querySelector(`[data-post="${id}"]`)
      if (el) io.observe(el)
    }
    const all = timers.current
    return () => {
      io.disconnect()
      for (const t of all.values()) window.clearTimeout(t)
      all.clear()
    }
    // The posts are read when the list changes (postKey), not when one of them is marked read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postKey, flush])

  React.useEffect(() => {
    const leave = () => flush()
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      flush()
    }
  }, [flush])
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Banner({ tone, title, children, actions }: { tone: "bad" | "warn" | "good" | "quiet"; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  const look = {
    bad: "border-[#fecaca] bg-[#fef2f2]",
    warn: "border-[#fde68a] bg-[#fffbeb]",
    good: "border-[#ddd6fe] bg-[#f7f5ff]",
    quiet: "border-[#e5e7eb] bg-white",
  }[tone]
  return (
    <div role={tone === "bad" ? "alert" : "status"} data-banner={tone} className={cn("flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:px-5", look)}>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14.5px] font-semibold", tone === "bad" ? "text-[#991b1b]" : tone === "warn" ? "text-[#92400e]" : "text-[#1a1a2e]")}>{title}</p>
        {children ? <div className="mt-0.5 text-[13.5px] leading-relaxed text-[#4b5563]">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

function SideCard({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[#e5e7eb]/70 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5">
      <h2 id={id} className="text-[13px] font-semibold text-[#6b7280]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ContactForm({ membershipId, creatorName }: { membershipId: string; creatorName: string }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const send = async () => {
    if (text.trim().length < 2) return setError("Write a message first.")
    setState("sending")
    setError(null)
    const res = await post<{ success?: boolean }>(`/api/memberships/${membershipId}/contact`, { message: text })
    if (!res.ok) {
      setState("idle")
      setError(res.data.error || "The message could not be sent. Try again.")
      return
    }
    setState("sent")
    setText("")
  }
  if (state === "sent") {
    return (
      <p role="status" className="flex items-center gap-2 text-[13.5px] text-[#15803d]">
        <Check aria-hidden className="h-4 w-4" />
        Sent. {creatorName} replies to your email.
      </p>
    )
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(SECONDARY, "h-9 w-full")}>
        Message {creatorName.split(" ")[0]}
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <label htmlFor="member-message" className="sr-only">
        Your message to {creatorName}
      </label>
      <textarea
        id="member-message"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={4}
        autoFocus
        placeholder={`Write to ${creatorName}`}
        className="w-full resize-y rounded-lg border border-[#e1e3e7] bg-white px-3 py-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#a2a7b0] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-[14px]"
      />
      {error ? <p className="text-[13px] text-[#b91c1c]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => void send()} disabled={state === "sending"} className={cn(PRIMARY, "h-9 flex-1")}>
          {state === "sending" ? "Sending" : "Send"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={cn(SECONDARY, "h-9")}>
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-[#9ca3af]">Your email address goes with it so they can reply.</p>
    </div>
  )
}

/* ── The page ───────────────────────────────────────────────────────────── */

export function MemberPage({ page, welcome = false, cardUpdated = false, now: fixedNow }: { page: MembershipPage; welcome?: boolean; cardUpdated?: boolean; now?: number }) {
  const [m, setM] = React.useState<Membership>(page.membership)
  const [posts, setPosts] = React.useState<FeedPost[]>(page.posts)
  const [hasOlder, setHasOlder] = React.useState(page.hasOlder)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(welcome ? "welcome" : null)
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const now = fixedNow ?? Date.now()
  const unreadCount = posts.filter((p) => p.unread).length

  useReadTracking(m.id, posts, (ids) => setPosts((list) => list.map((p) => (ids.includes(p.id) ? { ...p, unread: false } : p))))

  const manage = async (action: "cancel" | "resume" | "retry" | "emails_off" | "emails_on") => {
    setBusy(action)
    setError(null)
    const res = await post<{ membership?: Record<string, unknown> }>(`/api/memberships/${m.id}/manage`, { action })
    setBusy(null)
    if (!res.ok || !res.data.membership) {
      setError(res.data.error || "That did not go through. Nothing changed.")
      return
    }
    const row = res.data.membership
    const view = describeStatus({
      status: String(row.status),
      current_period_end: (row.current_period_end as string | null) ?? null,
      past_due_since: (row.past_due_since as string | null) ?? null,
      billing_interval: String(row.billing_interval ?? m.billingInterval),
      amount_cents: Number(row.amount_cents ?? m.amountCents),
      currency: String(row.currency ?? m.currency),
      trial_end: (row.trial_end as string | null) ?? null,
    })
    setM((prev) => fromRow(prev, row, view))
    setNote(action === "cancel" ? "cancelled" : action === "resume" ? "resumed" : action === "retry" ? "paid" : action === "emails_off" ? "emails_off" : "emails_on")
  }

  const openPortal = async () => {
    setBusy("card")
    setError(null)
    const res = await post<{ url?: string }>(`/api/memberships/${m.id}/portal`, {})
    if (!res.ok || !res.data.url) {
      setBusy(null)
      setError(res.data.error || "Changing the card is not available right now.")
      return
    }
    window.location.assign(res.data.url)
  }

  const loadOlder = async () => {
    const last = posts[posts.length - 1]
    if (!last) return
    setBusy("older")
    try {
      const res = await fetch(`/api/memberships/${m.id}/posts?before=${encodeURIComponent(last.publishedAt)}`)
      const data = (await res.json()) as { posts?: FeedPost[]; hasOlder?: boolean }
      if (res.ok && data.posts) {
        setPosts((list) => [...list, ...data.posts!.filter((p) => !list.some((q) => q.id === p.id))])
        setHasOlder(!!data.hasOlder)
      }
    } catch {
      setError("Older posts did not load. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const running = m.status === "active" || m.status === "trialing" || m.status === "past_due"
  const items: ActionMenuItem[] = [
    ...(m.status === "canceled" && m.access ? [{ label: "Resume membership", onClick: () => void manage("resume") }] : []),
    ...(m.access || m.status === "past_due" ? [{ label: m.status === "past_due" ? "Update card" : "Change card", onClick: () => void openPortal() }] : []),
    { label: m.emailUpdates ? "Stop emails for new posts" : "Email me new posts", onClick: () => void manage(m.emailUpdates ? "emails_off" : "emails_on") },
    ...(page.product.slug && page.creator.handle ? [{ label: "View membership page", href: `/${page.creator.handle}/${page.product.slug}`, separatorBefore: true }] : []),
    ...(running ? [{ label: m.status === "trialing" ? "Cancel free trial" : "Cancel membership", onClick: () => setConfirmCancel(true), variant: "destructive" as const, separatorBefore: true }] : []),
  ]

  const creatorHref = page.creator.handle ? `/${page.creator.handle}` : null
  const joinAgainHref = page.product.slug && page.creator.handle ? `/${page.creator.handle}/${page.product.slug}` : creatorHref ?? "/explore"
  const price = m.amountCents > 0 ? pricePer(m.amountCents, m.billingInterval === "year" ? "year" : "month", m.currency) : ""

  /* ── Banners: one at a time, the one that matters most ─────────────── */
  let banner: React.ReactNode = null
  if (m.status === "past_due") {
    banner = (
      <Banner
        tone="bad"
        title="Your last payment did not go through"
        actions={
          <>
            <button type="button" onClick={() => void openPortal()} disabled={busy !== null} className={PRIMARY}>
              {busy === "card" ? "Opening" : "Update card"}
            </button>
            <button type="button" onClick={() => void manage("retry")} disabled={busy !== null} className={SECONDARY}>
              {busy === "retry" ? "Paying" : "Pay now"}
            </button>
          </>
        }
      >
        {m.access && m.graceEndsAt ? `Update your card by ${shortDate(m.graceEndsAt)} to keep access. We will also try again by ourselves.` : "Update your card to get access back."}
        {cardUpdated ? " Card updated: press Pay now to pay the invoice." : ""}
      </Banner>
    )
  } else if (confirmCancel) {
    banner = (
      <Banner
        tone="warn"
        title={m.status === "trialing" ? "Cancel your free trial?" : "Cancel your membership?"}
        actions={
          <>
            <button
              type="button"
              onClick={async () => {
                await manage("cancel")
                setConfirmCancel(false)
              }}
              disabled={busy !== null}
              className={cn(BUTTON, "bg-[#1a1a2e] text-white hover:bg-[#2a2a40]")}
            >
              {busy === "cancel" ? "Cancelling" : "Cancel it"}
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className={SECONDARY}>
              Keep it
            </button>
          </>
        }
      >
        {m.status === "trialing"
          ? `You will not be charged. Access ends with the trial on ${shortDate(m.trialEnd || m.currentPeriodEnd)}.`
          : `You will not be charged again. You keep access until ${shortDate(m.currentPeriodEnd)}, and can resume before then.`}
      </Banner>
    )
  } else if (m.status === "canceled" && m.access) {
    banner = (
      <Banner
        tone="warn"
        title={`Your membership ends on ${shortDate(m.currentPeriodEnd)}`}
        actions={
          <button type="button" onClick={() => void manage("resume")} disabled={busy !== null} className={PRIMARY}>
            {busy === "resume" ? "Resuming" : "Resume"}
          </button>
        }
      >
        {note === "cancelled" ? "Cancelled. You will not be charged again." : "Until then everything stays open. Resume and it renews as before."}
      </Banner>
    )
  } else if (!m.access) {
    banner = (
      <Banner tone="quiet" title="This membership has ended" actions={<Link href={joinAgainHref} className={PRIMARY}>Join again</Link>}>
        Join again to read the posts and get what members get.
      </Banner>
    )
  } else if (note === "welcome") {
    banner = (
      <Banner tone="good" title={m.status === "trialing" ? "Your free trial has started" : "Welcome, you are a member"} actions={<button type="button" onClick={() => setNote(null)} className={SECONDARY}>Got it</button>}>
        {m.status === "trialing" ? `Nothing is charged until ${shortDate(m.trialEnd || m.currentPeriodEnd)}. ` : ""}
        New posts from {page.creator.name} show up here{m.emailUpdates ? " and in your inbox" : ""}.
      </Banner>
    )
  } else if (note === "resumed" || note === "paid") {
    banner = <Banner tone="good" title={note === "paid" ? "Paid. Thank you" : "Your membership renews again"}>{m.view.line}.</Banner>
  } else if (note === "emails_off" || note === "emails_on") {
    banner = <Banner tone="quiet" title={note === "emails_off" ? "No more emails for new posts" : "New posts will be emailed to you"}>{note === "emails_off" ? "They still show up here." : ""}</Banner>
  }

  /* ── The side: what members get, included, the creator, payments ───── */
  const side = (
    <div className="space-y-3">
      {page.benefits.length > 0 || page.product.description ? (
        <SideCard title="What members get" id="member-benefits">
          {page.benefits.length > 0 ? (
            <ul className="space-y-2">
              {page.benefits.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-[#374151]">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {page.product.description ? (
            <div className={cn(page.benefits.length > 0 && "mt-3 border-t border-[#f0f1f3] pt-3")}>
              <div className={cn("relative overflow-hidden", !aboutOpen && "max-h-[120px]")}>
                <PostText body={page.product.description} className="text-[13.5px] text-[#4b5563]" />
                {!aboutOpen ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" /> : null}
              </div>
              <button type="button" onClick={() => setAboutOpen((o) => !o)} className="-mb-2 -mt-1 inline-flex items-center gap-1 py-2 text-[13px] font-medium text-[#6d28d9]">
                {/* 36px to press on a phone; the margins take the padding back, so it sits where it did. */}
                {aboutOpen ? "Less" : "More"}
                <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-[rotate] duration-200", aboutOpen && "rotate-180")} />
              </button>
            </div>
          ) : null}
        </SideCard>
      ) : null}

      {page.included.length > 0 ? (
        <SideCard title="Included with your membership" id="member-included">
          <ul className="space-y-1">
            {page.included.map((p) => (
              <li key={p.id}>
                {m.access ? (
                  <Link href={p.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#f7f7f8]">
                    {p.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.cover} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded-lg bg-[#eceef2]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{p.title}</span>
                      <span className="block text-[12.5px] text-[#6b7280]">{p.type === "course" ? "Course" : "Product"}, open in your library</span>
                    </span>
                  </Link>
                ) : (
                  <span className="flex items-center gap-3 py-1.5 opacity-60">
                    <span className="h-10 w-10 shrink-0 rounded-lg bg-[#eceef2]" />
                    <span className="truncate text-[14px] text-[#4b5563]">{p.title}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </SideCard>
      ) : null}

      <SideCard title="Creator" id="member-creator">
        <div className="flex items-center gap-3">
          <AppAvatar src={page.creator.avatarUrl} name={page.creator.name} alt="" size={40} markWhileLoading />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{page.creator.name}</p>
            {creatorHref ? (
              <Link href={creatorHref} className="-my-[11px] inline-block py-[11px] text-[13px] font-medium text-[#6d28d9] hover:underline">
                Visit their page
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-3">
          <ContactForm membershipId={m.id} creatorName={page.creator.name} />
        </div>
      </SideCard>

      <SideCard title="Billing" id="member-billing">
        <dl className="space-y-1.5 text-[13.5px]">
          {price ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">Price</dt>
              <dd className="font-medium text-[#1a1a2e]">{price}</dd>
            </div>
          ) : null}
          {m.status === "active" || m.status === "past_due" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">Next payment</dt>
              <dd className="font-medium text-[#1a1a2e]">{shortDate(m.currentPeriodEnd)}</dd>
            </div>
          ) : null}
          {m.status === "trialing" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">First payment</dt>
              <dd className="font-medium text-[#1a1a2e]">{shortDate(m.trialEnd || m.currentPeriodEnd)}</dd>
            </div>
          ) : null}
          {m.cardLast4 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6b7280]">Card</dt>
              <dd className="font-medium text-[#1a1a2e]">
                {m.cardBrand ? `${m.cardBrand.charAt(0).toUpperCase()}${m.cardBrand.slice(1)} ` : ""}ending {m.cardLast4}
              </dd>
            </div>
          ) : null}
        </dl>
        {page.invoices.length > 0 ? (
          <ul className="mt-3 divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]">
            {page.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="text-[#4b5563]">{shortDate(inv.paidAt || inv.createdAt)}</span>
                <span className={cn("font-medium", inv.status === "failed" ? TONE_TEXT.bad : "text-[#1a1a2e]")}>
                  {inv.status === "failed" ? "Failed" : money(inv.amountCents, inv.currency)}
                </span>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noopener noreferrer" className="-my-[9px] inline-block py-[9px] text-[12.5px] font-medium text-[#6d28d9] hover:underline">
                    Receipt
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </SideCard>
    </div>
  )

  return (
    <div data-member-page="" data-status={m.status} className="mx-auto max-w-[1080px] pb-12">
      {/* Back to the library, where this membership is a row of Products now (there is no Memberships pill). */}
      <Link href="/account/library" className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-[13.5px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Library
      </Link>

      {/* ── The top ─────────────────────────────────────────────────── */}
      <header className="flex items-start gap-3.5 sm:gap-4">
        {page.product.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.product.cover} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover sm:h-16 sm:w-16" />
        ) : (
          <AppAvatar src={page.creator.avatarUrl} name={page.creator.name} alt="" size={64} className="h-14 w-14 sm:h-16 sm:w-16" sizedByClass markWhileLoading />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]">{m.title}</h1>
          <p className="mt-0.5 truncate text-[14px] text-[#6b7280]">
            by{" "}
            {creatorHref ? (
              <Link href={creatorHref} className="font-medium text-[#374151] hover:underline">
                {page.creator.name}
              </Link>
            ) : (
              page.creator.name
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <StatusLabel view={m.view} />
            <span className={cn("text-[13px]", m.view.tone === "bad" ? TONE_TEXT.bad : "text-[#6b7280]")}>{m.view.line}</span>
          </div>
        </div>
        <ResponsiveActionMenu
          title="Manage membership"
          items={items}
          trigger={
            <button type="button" data-manage="" className={cn(SECONDARY, "shrink-0 px-3 sm:px-4")} aria-label="Manage membership">
              <span className="hidden sm:inline">Manage</span>
              <MoreHorizontal aria-hidden className="h-4 w-4 sm:hidden" />
              <ChevronDown aria-hidden className="hidden h-3.5 w-3.5 text-[#6b7280] sm:block" />
            </button>
          }
        />
      </header>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-[13.5px] text-[#991b1b]">
          {error}
        </p>
      ) : null}
      {banner ? <div className="mt-4">{banner}</div> : null}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* ── The feed ──────────────────────────────────────────────── */}
        <section aria-labelledby="member-feed" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 id="member-feed" className="text-[15px] font-semibold text-[#1a1a2e]">
              Posts
            </h2>
            {unreadCount > 0 ? <span className="text-[13px] font-medium text-[#6d28d9]">{unreadCount} new</span> : null}
          </div>
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#d9dce1] bg-white px-6 py-10 text-center">
              <p className="text-[15px] font-medium text-[#1a1a2e]">No posts yet</p>
              <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-[#6b7280]">
                When {page.creator.name} posts for members, it shows up here{m.emailUpdates ? " and in your inbox" : ""}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <PostView key={p.id} post={p} now={now} locked={!m.access} fileHref={(assetId) => `/api/memberships/files/${p.id}/${assetId}`} />
              ))}
              {hasOlder ? (
                <div className="pt-1 text-center">
                  <button type="button" onClick={() => void loadOlder()} disabled={busy === "older"} className={SECONDARY}>
                    {busy === "older" ? "Loading" : "Show older posts"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside aria-label="About this membership" className="lg:sticky lg:top-24">
          {side}
        </aside>
      </div>
    </div>
  )
}
