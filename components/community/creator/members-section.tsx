"use client"

/**
 * ===========================================================================
 *  MEMBERS
 * ===========================================================================
 * Everyone in the community, 50 at a time (keyset paged on the server, so
 * the hundredth page costs what the first does), by status: active,
 * requests to join, suspended, banned, removed, expired, left. Search by
 * name (and by email for the owner and admins, the only ones who see
 * emails), filter by role and tier. Each row's menu holds what this person
 * may do to that one (can() and canActOn: never to somebody ranked the
 * same or above): approve or decline, change a role, mute, suspend,
 * remove, ban, complimentary access, points and badges.
 *
 * Invite opens one sheet for the three ways in: an email invite, a link to
 * share (with uses and an end date), or adding an existing Storelib
 * account directly. Export streams a CSV a page at a time.
 */
import * as React from "react"
import { Download, Link2, Mail, Search, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { assignableRoles, canActOn } from "@/lib/communities/permissions"
import { relativeTime } from "@/lib/communities/format"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { BadgeView, CommunityHead, InviteView, MemberPage, MemberRowView } from "./view-types"
import { MEMBER_STATUS_FILTERS, ROLE_LABEL, type MemberStatusFilter } from "./logic"
import { Confirm, Dialog, Empty, Notice, RowMenu, Section, Segmented, buttonPrimary, buttonSecondary, card, errorText, field, label, selectField, send, shortDate, useToast } from "./parts"

const STATUS_LABEL: Record<MemberStatusFilter, string> = {
  active: "Active",
  pending: "Requests",
  paused: "Suspended",
  banned: "Banned",
  removed: "Removed",
  expired: "Expired",
  cancelled: "Left",
}

interface Props {
  head: CommunityHead
  meId: string
  initial: MemberPage
  counts: Record<string, number>
  status: MemberStatusFilter
  tiers: { id: string; name: string; kind: string }[]
  canEmail: boolean
  invites: { rows: InviteView[]; next: string | null }
  openInvite: boolean
  badges: BadgeView[]
}

type Pending =
  | { kind: "confirm"; member: MemberRowView; action: "remove" | "ban" | "suspend" | "reject"; title: string; detail: string; verb: string }
  | { kind: "comp"; member: MemberRowView | null }
  | { kind: "points"; member: MemberRowView }
  | { kind: "badge"; member: MemberRowView }
  | null

export function MembersSection(p: Props) {
  const toast = useToast()
  const base = `/api/app/community/${p.head.id}`
  const [status, setStatus] = React.useState<MemberStatusFilter>(p.status)
  const [q, setQ] = React.useState("")
  const [role, setRole] = React.useState("")
  const [tier, setTier] = React.useState("")
  const [page, setPage] = React.useState<MemberPage>(p.initial)
  const [counts, setCounts] = React.useState(p.counts)
  const [loading, setLoading] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = React.useState(p.openInvite)
  const [invites, setInvites] = React.useState(p.invites)
  const [pending, setPending] = React.useState<Pending>(null)
  const [busy, setBusy] = React.useState(false)
  const first = React.useRef(true)
  const request = React.useRef(0)

  const queryString = React.useCallback(
    (cursor?: string | null, withCounts?: boolean) => {
      const u = new URLSearchParams({ status })
      if (q.trim()) u.set("q", q.trim())
      if (role) u.set("role", role)
      if (tier) u.set("tier", tier)
      if (cursor) u.set("cursor", cursor)
      if (withCounts) u.set("counts", "1")
      return u.toString()
    },
    [status, q, role, tier],
  )

  const load = React.useCallback(
    async (withCounts = false) => {
      const mine = ++request.current
      setLoading(true)
      setError(null)
      const res = await send<MemberPage & { counts?: Record<string, number> }>(`${base}/members?${queryString(null, withCounts)}`, "GET")
      if (mine !== request.current) return
      setLoading(false)
      if (!res.ok) return setError(errorText(res.data.error, "The members could not be loaded."))
      setPage({ rows: res.data.rows ?? [], next: res.data.next ?? null, capped: Boolean(res.data.capped) })
      if (res.data.counts) setCounts(res.data.counts)
    },
    [base, queryString],
  )

  /* Filters apply at once; typing waits a moment so every key is not a request. */
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => void load(), q ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [status, role, tier, q, load])

  React.useEffect(() => {
    const url = new URL(window.location.href)
    if (status === "active") url.searchParams.delete("status")
    else url.searchParams.set("status", status)
    url.searchParams.delete("invite")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
  }, [status])

  const loadMore = async () => {
    if (!page.next || more) return
    setMore(true)
    const res = await send<MemberPage>(`${base}/members?${queryString(page.next)}`, "GET")
    setMore(false)
    if (!res.ok) return setError(errorText(res.data.error, "More members could not be loaded."))
    setPage((x) => ({ rows: [...x.rows, ...(res.data.rows ?? [])], next: res.data.next ?? null, capped: x.capped }))
  }

  const act = async (m: MemberRowView, action: string, extra: Record<string, unknown> = {}, done?: string) => {
    setBusy(true)
    const res = await send(`${base}/members/${m.userId}`, "PATCH", { action, ...extra })
    setBusy(false)
    if (!res.ok) {
      toast(errorText(res.data.error))
      return false
    }
    setPending(null)
    toast(done ?? "Saved")
    await load(true)
    return true
  }

  const myRole = p.head.role
  const menuFor = (m: MemberRowView): ActionMenuItem[] => {
    if (m.userId === p.meId || m.role === "owner") return []
    if (!canActOn(myRole, m.role)) return []
    const c = p.head.can
    const items: ActionMenuItem[] = []
    if (m.status === "pending" && c.approve_member) {
      items.push({ label: "Approve", onClick: () => void act(m, "approve", {}, `${m.name} approved`) })
      items.push({ label: "Decline", onClick: () => setPending({ kind: "confirm", member: m, action: "reject", title: `Decline ${m.name}?`, detail: "They can ask again later.", verb: "Decline" }) })
      return items
    }
    if (m.status === "active") {
      const roles = assignableRoles(myRole).filter((r) => r !== m.role)
      roles.forEach((r, i) => items.push({ label: r === "member" ? "Make a member" : `Make ${r === "admin" ? "an admin" : "a moderator"}`, onClick: () => void act(m, "role", { role: r }, `${m.name} is now ${r === "admin" ? "an admin" : r === "moderator" ? "a moderator" : "a member"}`), section: i === 0 ? "Role" : undefined }))
      if (c.manage_members) {
        if (m.source === "manual") items.push({ label: "End complimentary access", onClick: () => void endComp(m), separatorBefore: true })
        else if (!["subscription", "purchase", "product"].includes(m.source)) items.push({ label: "Give complimentary access", onClick: () => setPending({ kind: "comp", member: m }), separatorBefore: true })
      }
      if (p.head.gamificationEnabled && c.award_points) {
        items.push({ label: "Give points", onClick: () => setPending({ kind: "points", member: m }), separatorBefore: !c.manage_members })
        if (p.badges.length) items.push({ label: "Give a badge", onClick: () => setPending({ kind: "badge", member: m }) })
      }
      if (c.mute) items.push(m.mutedUntil ? { label: "Unmute", onClick: () => void act(m, "unmute", {}, `${m.name} can post again`), separatorBefore: true } : { label: "Mute for 24 hours", onClick: () => void act(m, "mute", { until: 24 }, `${m.name} is muted for 24 hours`), separatorBefore: true })
      if (c.suspend) items.push({ label: "Suspend", onClick: () => setPending({ kind: "confirm", member: m, action: "suspend", title: `Suspend ${m.name}?`, detail: "They lose access until you bring them back. Their posts stay.", verb: "Suspend" }) })
      if (c.remove_member) items.push({ label: "Remove", variant: "destructive", onClick: () => setPending({ kind: "confirm", member: m, action: "remove", title: `Remove ${m.name}?`, detail: "They lose access now. A paid membership keeps billing until they cancel it.", verb: "Remove" }) })
      if (c.ban) items.push({ label: "Ban", variant: "destructive", onClick: () => setPending({ kind: "confirm", member: m, action: "ban", title: `Ban ${m.name}?`, detail: "They lose access and cannot join again unless you unban them.", verb: "Ban" }) })
    }
    if (m.status === "paused" && c.suspend) items.push({ label: "Bring back", onClick: () => void act(m, "unsuspend", {}, `${m.name} is back`) })
    if (m.status === "banned" && c.ban) items.push({ label: "Unban", onClick: () => void act(m, "unban", {}, `${m.name} is unbanned`) })
    return items
  }

  const endComp = async (m: MemberRowView) => {
    const res = await send(`${base}/members`, "POST", { action: "end_complimentary", userId: m.userId })
    if (!res.ok) return toast(errorText(res.data.error))
    toast("Complimentary access ended")
    await load(true)
  }

  const statuses = MEMBER_STATUS_FILTERS.filter((s) => s === "active" || s === "pending" || (counts[s] ?? 0) > 0 || s === status)
  const showLevel = p.head.gamificationEnabled
  const rows = page.rows

  return (
    <div className="space-y-4" data-members="">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div role="tablist" aria-label="Member status" className="app-gutter-bleed -my-1 flex min-w-0 items-center gap-1 overflow-x-auto py-1 scrollbar-hide md:mx-0 md:px-0">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                data-status={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-medium transition-colors duration-100 md:h-9",
                  status === s ? "border-[#d7dadf] bg-[#e2e4e8] text-[#1a1a2e] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07)]" : "border-[#e4e7ec] bg-white text-[#6b7280] hover:text-[#1a1a2e]",
                )}
              >
                {STATUS_LABEL[s]}
                <span className={cn("tabular-nums", s === "pending" && (counts[s] ?? 0) > 0 ? "text-[#b45309]" : "text-[#9ca3af]")}>{(counts[s] ?? 0).toLocaleString("en-US")}</span>
              </button>
            ))}
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {p.canEmail ? (
              <a href={`${base}/members/export?${queryString()}`} className={buttonSecondary} download>
                <Download aria-hidden className="h-4 w-4" />
                Export
              </a>
            ) : null}
            {p.head.can.invite ? (
              <button type="button" onClick={() => setInviteOpen(true)} className={buttonPrimary} data-invite-open="">
                <UserPlus aria-hidden className="h-4 w-4" />
                Invite
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_220px]">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder={p.canEmail ? "Search by name or email" : "Search by name"} aria-label="Search members" className={cn(field, "h-11 pl-9 sm:h-10")} />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className={cn(selectField, "w-auto min-w-[132px] flex-[1_1_140px] md:flex-[0_1_160px]")}>
            <option value="">Every role</option>
            {(["owner", "admin", "moderator", "member"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}s
              </option>
            ))}
          </select>
          {p.tiers.length > 1 ? (
            <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier" className={cn(selectField, "w-auto min-w-[132px] flex-[1_1_140px] md:flex-[0_1_180px]")}>
              <option value="">Every tier</option>
              {p.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex w-full items-center gap-2 md:hidden">
            {p.head.can.invite ? (
              <button type="button" onClick={() => setInviteOpen(true)} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px]")}>
                <UserPlus aria-hidden className="h-4 w-4" />
                Invite
              </button>
            ) : null}
            {p.canEmail ? (
              <a href={`${base}/members/export?${queryString()}`} className={cn(buttonSecondary, "h-11 rounded-xl px-4 text-[14px]")} download>
                <Download aria-hidden className="h-4 w-4" />
                Export
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <Notice>{error}</Notice> : null}

      <section className={cn(card, "overflow-hidden")} aria-busy={loading || undefined} data-members-table="">
        {rows.length === 0 ? (
          loading ? (
            <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">Loading</p>
          ) : q ? (
            <Empty title="Nobody by that name" detail="Check the spelling, or search by part of the name." />
          ) : status === "active" ? (
            <Empty title="Invite your first members." detail="Send an invite by email or share a link.">
              {p.head.can.invite ? (
                <button type="button" onClick={() => setInviteOpen(true)} className={cn(buttonPrimary, "h-10 px-4")}>
                  Invite
                </button>
              ) : null}
            </Empty>
          ) : status === "pending" ? (
            <Empty title="No requests to join." detail={undefined} />
          ) : (
            <Empty title={`Nobody ${STATUS_LABEL[status].toLowerCase()}.`} />
          )
        ) : (
          <>
            <table className="hidden w-full table-fixed md:table">
              <thead>
                <tr className="border-b border-[#f1f2f4] bg-[#fafbfb]">
                  <th className="h-9 w-[38%] px-4 text-left text-[12px] font-medium text-[#4b5563]">Member</th>
                  <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{status === "pending" ? "Note" : "Role"}</th>
                  {status !== "pending" ? <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">Tier</th> : null}
                  {showLevel && status !== "pending" ? <th className="h-9 w-[96px] px-3 text-left text-[12px] font-medium text-[#4b5563]">Level</th> : null}
                  <th className="h-9 w-[112px] px-3 text-left text-[12px] font-medium text-[#4b5563]">{status === "pending" ? "Asked" : "Joined"}</th>
                  {status !== "pending" ? <th className="h-9 w-[112px] px-3 text-left text-[12px] font-medium text-[#4b5563]">Last active</th> : null}
                  <th className={cn("h-9 px-3", status === "pending" ? "w-[196px]" : "w-[56px]")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {rows.map((m) => (
                  <tr key={m.userId} className="hover:bg-[#fafbfb]" data-member-row="">
                    <td className="h-[60px] px-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <AppAvatar src={m.avatarUrl ?? undefined} name={m.name} size={32} className="h-8 w-8 shrink-0 rounded-full" />
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-[13.5px] font-medium text-[#1a1a2e]">
                            <span className="truncate">{m.name}</span>
                            {m.mutedUntil ? <StatusBadge tone="attention">Muted</StatusBadge> : null}
                            {m.source === "manual" ? <StatusBadge tone="neutral">Complimentary</StatusBadge> : null}
                          </p>
                          <p className="truncate text-[12.5px] text-[#6b7280]">{m.email ?? (m.username ? `@${m.username}` : "")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-3 text-[13px] text-[#1a1a2e]">{status === "pending" ? <span className="text-[#4b5563]">{m.requestNote || (m.approved ? "Approved, waiting for payment" : "")}</span> : ROLE_LABEL[m.role]}</td>
                    {status !== "pending" ? <td className="truncate px-3 text-[13px] text-[#4b5563]">{m.tierName ?? ""}</td> : null}
                    {showLevel && status !== "pending" ? (
                      <td className="px-3 text-[13px] tabular-nums text-[#4b5563]">
                        {m.level} <span className="text-[#9ca3af]">· {m.points}</span>
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 text-[13px] text-[#4b5563]">{shortDate(status === "pending" ? m.requestedAt : m.joinedAt)}</td>
                    {status !== "pending" ? <td className="whitespace-nowrap px-3 text-[13px] text-[#4b5563]">{m.lastActiveAt ? relativeTime(m.lastActiveAt) : ""}</td> : null}
                    <td className="px-3 text-right">
                      {status === "pending" && p.head.can.approve_member && !m.approved ? (
                        <span className="inline-flex gap-1.5">
                          <button type="button" disabled={busy} onClick={() => setPending({ kind: "confirm", member: m, action: "reject", title: `Decline ${m.name}?`, detail: "They can ask again later.", verb: "Decline" })} className={buttonSecondary}>
                            Decline
                          </button>
                          <button type="button" disabled={busy} onClick={() => void act(m, "approve", {}, `${m.name} approved`)} className={buttonPrimary}>
                            Approve
                          </button>
                        </span>
                      ) : (
                        <RowMenu items={menuFor(m)} label={`Actions for ${m.name}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-[#f1f2f4] md:hidden">
              {rows.map((m) => (
                <li key={m.userId} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5" data-member-row="">
                  <AppAvatar src={m.avatarUrl ?? undefined} name={m.name} size={36} className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-medium text-[#1a1a2e]">
                      <span className="truncate">{m.name}</span>
                      {m.mutedUntil ? <StatusBadge tone="attention">Muted</StatusBadge> : null}
                    </p>
                    <p className="truncate text-[12.5px] text-[#6b7280]">
                      {status === "pending"
                        ? [m.requestNote || (m.approved ? "Approved, waiting for payment" : null), shortDate(m.requestedAt)].filter(Boolean).join(" · ")
                        : [m.role !== "member" ? ROLE_LABEL[m.role] : null, m.tierName, showLevel ? `Level ${m.level}` : null, m.email, `Joined ${shortDate(m.joinedAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {status === "pending" && p.head.can.approve_member && !m.approved ? (
                    <button type="button" disabled={busy} onClick={() => void act(m, "approve", {}, `${m.name} approved`)} className={cn(buttonPrimary, "h-10 px-3.5")}>
                      Approve
                    </button>
                  ) : null}
                  <RowMenu items={menuFor(m)} label={`Actions for ${m.name}`} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {page.capped ? <p className="px-1 text-[13px] text-[#6b7280]">Showing the first matches. Type more of the name to narrow it down.</p> : null}
      {page.next ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "h-10 px-5")} data-load-more="">
            {more ? "Loading" : "Show more"}
          </button>
        </div>
      ) : null}

      {p.head.can.invite && invites.rows.length > 0 ? <InvitesList base={base} invites={invites} setInvites={setInvites} /> : null}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        base={base}
        tiers={p.tiers}
        canAdd={p.head.can.manage_members === true}
        onMade={(inv) => setInvites((x) => ({ ...x, rows: [inv, ...x.rows] }))}
        onAdded={() => void load(true)}
      />

      {pending?.kind === "confirm" ? (
        <Confirm
          open
          onClose={() => setPending(null)}
          title={pending.title}
          detail={pending.detail}
          action={pending.verb}
          danger={pending.action === "ban" || pending.action === "remove"}
          busy={busy}
          reason={pending.action !== "reject"}
          onConfirm={(reason) => void act(pending.member, pending.action, { reason: reason || undefined }, pending.action === "reject" ? "Request declined" : pending.action === "ban" ? `${pending.member.name} is banned` : pending.action === "remove" ? `${pending.member.name} was removed` : `${pending.member.name} is suspended`)}
        />
      ) : null}
      {pending?.kind === "comp" ? <CompDialog base={base} tiers={p.tiers} member={pending.member} onClose={() => setPending(null)} onDone={() => { setPending(null); toast("Complimentary access given"); void load(true) }} /> : null}
      {pending?.kind === "points" ? <PointsDialog base={base} member={pending.member} onClose={() => setPending(null)} onDone={(n) => { setPending(null); toast(`${n > 0 ? "+" : ""}${n} points for ${pending.member.name}`); void load() }} /> : null}
      {pending?.kind === "badge" ? <BadgeDialog base={base} badges={p.badges} member={pending.member} onClose={() => setPending(null)} onDone={(b) => { setPending(null); toast(`${b} given to ${pending.member.name}`) }} /> : null}
    </div>
  )
}

/* ── Invites ────────────────────────────────────────────────────────────── */

function inviteLine(i: InviteView): string {
  const parts: string[] = []
  if (i.revokedAt) parts.push("Revoked")
  else if (i.expiresAt && Date.parse(i.expiresAt) < Date.now()) parts.push("Expired")
  else if (i.maxUses && i.uses >= i.maxUses) parts.push("Used")
  if (!i.email) parts.push(`${i.uses}${i.maxUses ? ` of ${i.maxUses}` : ""} used`)
  if (i.expiresAt && !i.revokedAt) parts.push(`ends ${shortDate(i.expiresAt)}`)
  if (i.tierName) parts.push(i.tierName)
  parts.push(`made ${shortDate(i.createdAt)}`)
  return parts.join(" · ")
}

function InvitesList({ base, invites, setInvites }: { base: string; invites: { rows: InviteView[]; next: string | null }; setInvites: React.Dispatch<React.SetStateAction<{ rows: InviteView[]; next: string | null }>> }) {
  const toast = useToast()
  const [more, setMore] = React.useState(false)
  const revoke = async (i: InviteView) => {
    const res = await send(`${base}/invites/${i.id}`, "DELETE")
    if (!res.ok) return toast(errorText(res.data.error))
    setInvites((x) => ({ ...x, rows: x.rows.map((r) => (r.id === i.id ? { ...r, revokedAt: new Date().toISOString() } : r)) }))
    toast("Invite revoked")
  }
  const loadMore = async () => {
    if (!invites.next) return
    setMore(true)
    const res = await send<{ rows: InviteView[]; next: string | null }>(`${base}/invites?cursor=${encodeURIComponent(invites.next)}`, "GET")
    setMore(false)
    if (res.ok) setInvites((x) => ({ rows: [...x.rows, ...(res.data.rows ?? [])], next: res.data.next ?? null }))
  }
  return (
    <Section title="Invites" hint="A revoked invite stops working at once, even if the link was shared.">
      <ul className="-my-1 divide-y divide-[#f1f2f4]" data-invites="">
        {invites.rows.map((i) => {
          const live = !i.revokedAt && !(i.expiresAt && Date.parse(i.expiresAt) < Date.now()) && !(i.maxUses && i.uses >= i.maxUses)
          return (
            <li key={i.id} className="flex min-h-12 items-center gap-3 py-2">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f1f2f4] text-[#4b5563]">
                {i.email ? <Mail className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[13.5px] font-medium", live ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{i.email ?? "Invite link"}</p>
                <p className="truncate text-[12px] text-[#6b7280]">{inviteLine(i)}</p>
              </div>
              {live ? (
                <button type="button" onClick={() => void revoke(i)} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                  Revoke
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {invites.next ? (
        <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "mt-3 h-9")}>
          {more ? "Loading" : "Show more"}
        </button>
      ) : null}
    </Section>
  )
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.target.select()} aria-label="Invite link" className={cn(field, "h-11 font-mono text-[13px] sm:h-10 sm:text-[12.5px]")} />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          })
        }}
        className={cn(buttonPrimary, "h-11 shrink-0 px-4 sm:h-10")}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

function InviteDialog({ open, onClose, base, tiers, canAdd, onMade, onAdded }: { open: boolean; onClose: () => void; base: string; tiers: { id: string; name: string; kind: string }[]; canAdd: boolean; onMade: (i: InviteView) => void; onAdded: () => void }) {
  type Mode = "email" | "link" | "add"
  const [mode, setMode] = React.useState<Mode>("email")
  const [email, setEmail] = React.useState("")
  const [uses, setUses] = React.useState("")
  const [days, setDays] = React.useState("30")
  const [tier, setTier] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [made, setMade] = React.useState<{ url?: string; text: string } | null>(null)
  React.useEffect(() => {
    if (open) {
      setMade(null)
      setError(null)
    }
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    setMade(null)
    if (mode === "add") {
      const res = await send(`${base}/members`, "POST", { action: "complimentary", email, tierId: tier || tiers[0]?.id })
      setBusy(false)
      if (!res.ok) return setError(errorText(res.data.error))
      setMade({ text: `${email} is now a member.` })
      setEmail("")
      onAdded()
      return
    }
    const res = await send<{ invite?: InviteView; sent?: boolean | null }>(`${base}/invites`, "POST", {
      email: mode === "email" ? email : undefined,
      maxUses: mode === "link" ? uses : undefined,
      expiresInDays: days === "never" ? undefined : days,
      tierId: tier || undefined,
    })
    setBusy(false)
    if (!res.ok || !res.data.invite) return setError(errorText(res.data.error, "The invite could not be made. Try again."))
    onMade(res.data.invite)
    setMade({
      url: res.data.invite.url,
      text: mode === "email" ? (res.data.sent ? `Sent to ${email}. You can also share the link yourself.` : `The email could not be sent just now. Share this link with ${email} yourself.`) : "Anyone with this link can join. Copy it now: it is shown once.",
    })
    if (mode === "email") setEmail("")
  }

  const tierPicker = tiers.length > 1 ? (
    <div>
      <label htmlFor="inv-tier" className={label}>
        Tier
      </label>
      <select id="inv-tier" value={tier} onChange={(e) => setTier(e.target.value)} className={selectField}>
        {mode !== "add" ? <option value="">The default tier</option> : null}
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.kind === "paid" ? " (free for them)" : ""}
          </option>
        ))}
      </select>
    </div>
  ) : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite members"
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Done
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || ((mode === "email" || mode === "add") && !email.includes("@"))} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-invite-submit="">
            {busy ? "Working" : mode === "email" ? "Send invite" : mode === "link" ? "Create link" : "Add member"}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-invite-dialog="">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setMade(null)
            setError(null)
          }}
          label="How to invite"
          className="w-full"
          options={[
            { value: "email", label: "By email" },
            { value: "link", label: "Link" },
            ...(canAdd ? [{ value: "add" as Mode, label: "Add directly" }] : []),
          ]}
        />
        {mode === "add" ? <p className="text-[13px] leading-snug text-[#6b7280]">Somebody with a Storelib account joins right away, without paying.</p> : null}
        {mode !== "link" ? (
          <div>
            <label htmlFor="inv-email" className={label}>
              Email
            </label>
            <input id="inv-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 254))} placeholder="name@example.com" className={cn(field, "h-11 sm:h-10")} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-uses" className={label}>
                Uses
              </label>
              <input id="inv-uses" inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="No limit" className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div>
              <label htmlFor="inv-days" className={label}>
                Works for
              </label>
              <select id="inv-days" value={days} onChange={(e) => setDays(e.target.value)} className={selectField}>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="never">No end date</option>
              </select>
            </div>
          </div>
        )}
        {tierPicker}
        {error ? <Notice>{error}</Notice> : null}
        {made ? (
          <div className="space-y-2 rounded-xl border border-[#e5e7eb] bg-[#fafbfb] p-3">
            <p className="text-[13px] text-[#1a1a2e]">{made.text}</p>
            {made.url ? <CopyField value={made.url} /> : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}

/* ── Complimentary access, points, badges ───────────────────────────────── */

function CompDialog({ base, tiers, member, onClose, onDone }: { base: string; tiers: { id: string; name: string; kind: string }[]; member: MemberRowView | null; onClose: () => void; onDone: () => void }) {
  const [tier, setTier] = React.useState(tiers.find((t) => t.kind === "paid")?.id ?? tiers[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const res = await send(`${base}/members`, "POST", { action: "complimentary", userId: member?.userId, tierId: tier })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complimentary access for ${member?.name ?? "a member"}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !tier} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? "Working" : "Give access"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] leading-snug text-[#4b5563]">They get this tier without paying, until you end it.</p>
      <label htmlFor="comp-tier" className={label}>
        Tier
      </label>
      <select id="comp-tier" value={tier} onChange={(e) => setTier(e.target.value)} className={selectField}>
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}

function PointsDialog({ base, member, onClose, onDone }: { base: string; member: MemberRowView; onClose: () => void; onDone: (n: number) => void }) {
  const [points, setPoints] = React.useState("10")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const n = Number(points)
    const res = await send(`${base}/gamification/points`, "POST", { userId: member.userId, points: n, note })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone(n)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Points for ${member.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? "Working" : "Give points"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-[#6b7280]">They have {member.points} now. A negative number takes points away.</p>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <div>
          <label htmlFor="pts-n" className={label}>
            Points
          </label>
          <input id="pts-n" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, "").slice(0, 6))} className={cn(field, "h-11 tabular-nums sm:h-10")} />
        </div>
        <div>
          <label htmlFor="pts-note" className={label}>
            What for
          </label>
          <input id="pts-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Optional" className={cn(field, "h-11 sm:h-10")} />
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}

function BadgeDialog({ base, badges, member, onClose, onDone }: { base: string; badges: BadgeView[]; member: MemberRowView; onClose: () => void; onDone: (name: string) => void }) {
  const [badge, setBadge] = React.useState(badges[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    const res = await send(`${base}/gamification/badges/${badge}`, "POST", { userId: member.userId, on: true })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onDone(badges.find((b) => b.id === badge)?.name ?? "Badge")
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`A badge for ${member.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !badge} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? "Working" : "Give badge"}
          </button>
        </>
      }
    >
      <ul className="space-y-1">
        {badges.map((b) => (
          <li key={b.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-[#f7f7f8]">
              <input type="radio" name="badge" checked={badge === b.id} onChange={() => setBadge(b.id)} className="h-4 w-4 accent-[#1a1a2e]" />
              <span className="text-[18px] leading-none">{b.icon || "🏅"}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{b.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </Dialog>
  )
}
