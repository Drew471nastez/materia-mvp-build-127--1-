"use client"

/**
 * ===========================================================================
 *  MEMBERS
 * ===========================================================================
 * Everyone in the community, 50 at a time (keyset paged on the server, so
 * the hundredth page costs what the first does), in one card the way
 * Products and a membership's Members draw a list: the views in its first
 * row (active, requests to join, muted, suspended, banned, removed,
 * expired, left, each with its count) with Export and Invite beside them;
 * the search (by name, and by email for the owner and admins, the only
 * ones who see emails) and the role and tier filters in the second; then a
 * light table on a computer and a list on a phone.
 *
 * Each row's menu holds what this person may do to that one, from
 * ./member-actions (the same rules the server applies: can() and never to
 * somebody ranked the same or above): a role, complimentary access, points
 * and badges, mute for a while, suspend, remove, ban; and on the other
 * views, bring back and unban. A request to join has Approve and Decline
 * on the row itself.
 *
 * Invite opens one sheet for the three ways in: an email invite, a link to
 * share (with uses and an end date), or adding an existing Storelib
 * account directly. Export streams a CSV a page at a time.
 */
import * as React from "react"
import { Download, Link2, Mail, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import type { BadgeView, CommunityHead, InviteView, MemberPage, MemberRowView } from "./view-types"
import { MEMBER_STATUS_FILTERS, ROLE_LABEL, takenAwayLine, type MemberStatusFilter } from "./logic"
import { joinCosts, needsInvite } from "@/lib/communities/access-model"
import { useMemberActions, type ActOnPerson } from "./member-actions"
import { PaymentsSection } from "@/components/community/membership/refund-dialog"
import { Dialog, Empty, FilterTabs, ListCard, ListNote, Notice, PickButton, RowMenu, SearchField, Segmented, ToolbarDivider, buttonPrimary, buttonSecondary, errorText, field, label, selectField, send, shortDate, useToast, ListLoading } from "./parts"
import { tt, ttx } from "@/lib/i18n/text"

const STATUS_LABEL: Record<MemberStatusFilter, string> = {
  get active() { return tt("Active") },
  get pending() { return tt("Requests") },
  get restricted() { return tt("Not active") },
  get muted() { return tt("Muted") },
  get paused() { return tt("Suspended") },
  get banned() { return tt("Banned") },
  get removed() { return tt("Removed") },
  get expired() { return tt("Expired") },
  get cancelled() { return ttx("person", "Left") },
}

/** The views that hold people a moderator took out, where each row carries its undo. */
const UNDO_VIEWS: MemberStatusFilter[] = ["restricted", "muted", "paused", "banned", "removed"]

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

const person = (m: MemberRowView): ActOnPerson => ({ userId: m.userId, name: m.name, role: m.role, status: m.status, source: m.source, mutedUntil: m.mutedUntil, approved: m.approved, points: m.points, acted: m.acted ?? null })

export function MembersSection(p: Props) {
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
      if (!res.ok) return setError(errorText(res.data.error, tt("The members could not be loaded.")))
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
    if (!res.ok) return setError(errorText(res.data.error, tt("More members could not be loaded.")))
    setPage((x) => ({ rows: [...x.rows, ...(res.data.rows ?? [])], next: res.data.next ?? null, capped: x.capped }))
  }

  const actions = useMemberActions({ head: p.head, meId: p.meId, tiers: p.tiers, badges: p.badges, onDone: () => void load(true) })

  /* The per status views stay reachable by address; the tabs show Active, Requests and the one view that holds everybody who is not. */
  const statuses = MEMBER_STATUS_FILTERS.filter((s) => s === "active" || s === "pending" || s === status || ((s === "restricted" || s === "expired" || s === "cancelled") && (counts[s] ?? 0) > 0))
  const showLevel = p.head.gamificationEnabled
  const rows = page.rows
  const pending = status === "pending"
  const restricted = UNDO_VIEWS.includes(status)
  const roleOptions = [{ value: "", label: tt("All roles") }, ...(["owner", "admin", "moderator", "member"] as const).map((r) => ({ value: r, label: `${ROLE_LABEL[r]}s` }))]
  const tierOptions = [{ value: "", label: tt("All tiers") }, ...p.tiers.map((t) => ({ value: t.id, label: t.name }))]

  /* Approve and Decline sit on a request's row, and the undo sits on a row that is not active; the rest are in the menu. */
  const rowActions = (m: MemberRowView, phone: boolean) => {
    const choices = actions.choicesFor(person(m))
    const approve = choices.find((c) => c.action === "approve")
    const reject = choices.find((c) => c.action === "reject")
    const undo = restricted ? choices.find((c) => c.action === "unsuspend" || c.action === "unban" || c.action === "reinstate" || c.action === "unmute") : undefined
    return (
      <span className="inline-flex items-center justify-end gap-1.5">
        {reject && !phone ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(reject, person(m))} className={buttonSecondary}>
            {tt("Decline")}
          </button>
        ) : null}
        {approve ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(approve, person(m))} className={cn(buttonPrimary, phone && "h-10 px-3.5")} data-approve="">
            {tt("Approve")}
          </button>
        ) : null}
        {undo ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(undo, person(m))} className={cn(buttonSecondary, phone && "h-10 whitespace-nowrap px-3")} data-undo="">
            {phone ? (undo.shortLabel ?? undo.label) : undo.label}
          </button>
        ) : null}
        <RowMenu keepSpace={restricted && !phone} items={actions.menuItems(person(m), [...(phone ? ["approve"] : ["approve", "reject"]), ...(undo ? [undo.key] : [])])} label={tt("Actions for {name}", { name: m.name })} />
      </span>
    )
  }

  const line = (m: MemberRowView) =>
    pending
      ? [m.requestNote || (m.approved ? tt("Approved, waiting for payment") : null), shortDate(m.requestedAt)].filter(Boolean).join(" · ")
      : restricted
        ? takenAwayLine(m)
        : [m.role !== "member" ? ROLE_LABEL[m.role] : null, m.tierName, showLevel ? tt("Level {level}", { level: m.level }) : null, m.email, tt("Joined {date}", { date: shortDate(m.joinedAt) })].filter(Boolean).join(" · ")

  return (
    <div className="space-y-4" data-members="">
      {error ? <Notice>{error}</Notice> : null}

      <ListCard
        data-members-table=""
        busy={loading}
        head={<FilterTabs label={tt("Member status")} value={status} onChange={setStatus} tabs={statuses.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] ?? 0, attention: s === "pending" }))} />}
        actions={
          <>
            {p.canEmail ? (
              <a href={`${base}/members/export?${queryString()}`} className={cn(buttonSecondary, "max-sm:w-10 max-sm:px-0")} download aria-label={tt("Export members as CSV")}>
                <Download aria-hidden className="h-4 w-4" />
                <span className="max-sm:hidden">{tt("Export")}</span>
              </a>
            ) : null}
            {p.head.can.invite ? (
              <button type="button" onClick={() => setInviteOpen(true)} className={buttonPrimary} data-invite-open="">
                <UserPlus aria-hidden className="h-4 w-4" />
                {tt("Invite")}
              </button>
            ) : null}
          </>
        }
        toolbar={
          <>
            <SearchField value={q} onChange={setQ} placeholder={tt("Search members")} label={p.canEmail ? tt("Search members by name or email") : tt("Search members by name")} />
            <ToolbarDivider />
            <PickButton name="role" title={tt("Role")} options={roleOptions} value={role} onPick={setRole} align="end" />
            {p.tiers.length > 1 ? <PickButton name="tier" title={tt("Tier")} options={tierOptions} value={tier} onPick={setTier} align="end" /> : null}
          </>
        }
      >
        {rows.length === 0 ? (
          loading ? (
            <ListLoading />
          ) : q ? (
            <Empty title={tt("Nobody by that name")} detail={tt("Check the spelling, or search by part of the name.")} />
          ) : status === "active" ? (
            <Empty icon={UserPlus} title={tt("Invite your first members.")} detail={tt("Send an invite by email or share a link.")}>
              {p.head.can.invite ? (
                <button type="button" onClick={() => setInviteOpen(true)} className={cn(buttonPrimary, "h-10 px-4")}>
                  {tt("Invite")}
                </button>
              ) : null}
            </Empty>
          ) : pending ? (
            <Empty title={tt("No requests to join.")} />
          ) : status === "restricted" ? (
            <Empty title={tt("Nobody is shut out.")} detail={tt("Anyone you remove, ban, suspend or mute shows up here, with a way back.")} />
          ) : (
            <Empty title={tt("Nobody {value}.", { value: STATUS_LABEL[status].toLowerCase() })} />
          )
        ) : (
          <>
            <table className="hidden w-full table-fixed border-separate border-spacing-0 md:table">
              <thead>
                <tr className="h-9 text-left text-[12px] text-[#6b7280]">
                  <th className={cn("border-b border-[#eef0f2] pl-4 pr-3 font-medium", restricted ? "w-[30%]" : "w-[38%]")}>{tt("Member")}</th>
                  <th className="border-b border-[#eef0f2] px-3 font-medium">{pending ? tt("Note") : restricted ? tt("What happened") : tt("Role")}</th>
                  {!pending && !restricted ? <th className="border-b border-[#eef0f2] px-3 font-medium">{tt("Tier")}</th> : null}
                  {showLevel && !pending && !restricted ? <th className="w-[96px] border-b border-[#eef0f2] px-3 font-medium">{tt("Level")}</th> : null}
                  {!restricted ? <th className="w-[104px] border-b border-[#eef0f2] px-3 font-medium">{pending ? tt("Asked") : tt("Joined")}</th> : null}
                  {!pending && !restricted ? <th className="w-[104px] border-b border-[#eef0f2] px-3 font-medium">{tt("Last active")}</th> : null}
                  <th className={cn("border-b border-[#eef0f2] pr-3", pending ? "w-[208px]" : restricted ? "w-[216px]" : "w-[56px]")} aria-label={tt("Actions")} />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.userId} className="group/row hover:bg-[#fafbfb]" data-member-row="">
                    <td className="h-[58px] border-b border-[#f1f2f4] pl-4 pr-3 group-last/row:border-b-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar src={m.avatarUrl ?? undefined} name={m.name} size={32} className="h-8 w-8 shrink-0 rounded-full" lazy />
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e]">
                            <span className="truncate">{m.name}</span>
                            {m.mutedUntil ? <StatusBadge tone="attention">{tt("Muted")}</StatusBadge> : null}
                            {m.source === "manual" ? <StatusBadge tone="neutral">{tt("Complimentary")}</StatusBadge> : null}
                          </p>
                          <p className="truncate text-[12.5px] text-[#6b7280]">{m.email ?? (m.username ? `@${m.username}` : "")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="truncate border-b border-[#f1f2f4] px-3 text-[13px] text-[#1a1a2e] group-last/row:border-b-0">
                      {pending ? (
                        <span className="text-[#4b5563]">{m.requestNote || (m.approved ? tt("Approved, waiting for payment") : "")}</span>
                      ) : restricted ? (
                        <span className="text-[#4b5563]" title={takenAwayLine(m)}>
                          {takenAwayLine(m)}
                        </span>
                      ) : (
                        ROLE_LABEL[m.role]
                      )}
                    </td>
                    {!pending && !restricted ? <td className="truncate border-b border-[#f1f2f4] px-3 text-[13px] text-[#4b5563] group-last/row:border-b-0">{m.tierName ?? ""}</td> : null}
                    {showLevel && !pending && !restricted ? (
                      <td className="border-b border-[#f1f2f4] px-3 text-[13px] tabular-nums text-[#4b5563] group-last/row:border-b-0">
                        {m.level} <span className="text-[#9ca3af]">· {m.points}</span>
                      </td>
                    ) : null}
                    {!restricted ? <td className="whitespace-nowrap border-b border-[#f1f2f4] px-3 text-[13px] text-[#4b5563] group-last/row:border-b-0">{shortDate(pending ? m.requestedAt : m.joinedAt)}</td> : null}
                    {!pending && !restricted ? <td className="whitespace-nowrap border-b border-[#f1f2f4] px-3 text-[13px] text-[#4b5563] group-last/row:border-b-0">{m.lastActiveAt ? relativeTime(m.lastActiveAt) : ""}</td> : null}
                    <td className="border-b border-[#f1f2f4] pr-3 text-right group-last/row:border-b-0">{rowActions(m, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-[#f1f2f4] md:hidden">
              {rows.map((m) => (
                <li key={m.userId} className="flex min-h-[64px] items-center gap-3 py-2.5 pl-4 pr-2" data-member-row="">
                  <MemberAvatar src={m.avatarUrl ?? undefined} name={m.name} size={36} className="h-9 w-9 shrink-0 rounded-full" lazy />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-medium text-[#1a1a2e]">
                      <span className="truncate">{m.name}</span>
                      {m.mutedUntil ? <StatusBadge tone="attention">{tt("Muted")}</StatusBadge> : null}
                    </p>
                    <p className="truncate text-[12.5px] text-[#6b7280]">{line(m)}</p>
                  </div>
                  {rowActions(m, true)}
                </li>
              ))}
            </ul>
          </>
        )}
      </ListCard>

      {page.capped ? <p className="px-1 text-[13px] text-[#6b7280]">{tt("Showing the first matches. Type more of the name to narrow it down.")}</p> : null}
      {page.next ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "h-10 px-5")} data-load-more="">
            {more ? tt("Loading") : tt("Show more")}
          </button>
        </div>
      ) : null}

      {p.head.can.invite && invites.rows.length > 0 ? <InvitesList base={base} invites={invites} setInvites={setInvites} /> : null}

      {/* Round 13 (ask 41): the community's payments, each with Refund, for the owner only (money stays with the owner). */}
      {p.head.can.manage_pricing ? <PaymentsSection communityId={p.head.id} /> : null}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        base={base}
        head={p.head}
        tiers={p.tiers}
        canAdd={p.head.can.manage_members === true}
        onMade={(inv) => setInvites((x) => ({ ...x, rows: [inv, ...x.rows] }))}
        onAdded={() => void load(true)}
      />
      {actions.dialogs}
    </div>
  )
}

/* ── Invites ────────────────────────────────────────────────────────────── */

function inviteLine(i: InviteView): string {
  const parts: string[] = []
  if (i.revokedAt) parts.push(tt("Revoked"))
  else if (i.expiresAt && Date.parse(i.expiresAt) < Date.now()) parts.push(tt("Expired"))
  else if (i.maxUses && i.uses >= i.maxUses) parts.push(tt("Used"))
  if (!i.email) parts.push(i.maxUses ? tt("{uses} of {maxUses} used", { uses: i.uses, maxUses: i.maxUses }) : tt("{uses} used", { uses: i.uses }))
  if (i.expiresAt && !i.revokedAt) parts.push(tt("ends {date}", { date: shortDate(i.expiresAt) }))
  if (i.tierName) parts.push(i.tierName)
  parts.push(tt("made {date}", { date: shortDate(i.createdAt) }))
  return parts.join(" · ")
}

function InvitesList({ base, invites, setInvites }: { base: string; invites: { rows: InviteView[]; next: string | null }; setInvites: React.Dispatch<React.SetStateAction<{ rows: InviteView[]; next: string | null }>> }) {
  const toast = useToast()
  const [more, setMore] = React.useState(false)
  const revoke = async (i: InviteView) => {
    const res = await send(`${base}/invites/${i.id}`, "DELETE")
    if (!res.ok) return toast(errorText(res.data.error))
    setInvites((x) => ({ ...x, rows: x.rows.map((r) => (r.id === i.id ? { ...r, revokedAt: new Date().toISOString() } : r)) }))
    toast(tt("Invite revoked"))
  }
  const loadMore = async () => {
    if (!invites.next) return
    setMore(true)
    const res = await send<{ rows: InviteView[]; next: string | null }>(`${base}/invites?cursor=${encodeURIComponent(invites.next)}`, "GET")
    setMore(false)
    if (res.ok) setInvites((x) => ({ rows: [...x.rows, ...(res.data.rows ?? [])], next: res.data.next ?? null }))
  }
  return (
    <ListCard head={<p className="px-2 text-[14px] font-semibold text-[#1a1a2e]">{tt("Invites")}</p>} actions={<ListNote>{tt("A revoked invite stops working at once.")}</ListNote>} data-invites="">
      <ul className="divide-y divide-[#f1f2f4]">
        {invites.rows.map((i) => {
          const live = !i.revokedAt && !(i.expiresAt && Date.parse(i.expiresAt) < Date.now()) && !(i.maxUses && i.uses >= i.maxUses)
          return (
            <li key={i.id} className="flex min-h-14 items-center gap-3 py-2 pl-4 pr-3">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f1f2f4] text-[#4b5563]">
                {i.email ? <Mail className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[13.5px] font-medium", live ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{i.email ?? tt("Invite link")}</p>
                <p className="truncate text-[12px] text-[#6b7280]">{inviteLine(i)}</p>
              </div>
              {live ? (
                <button type="button" onClick={() => void revoke(i)} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                  {tt("Revoke")}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {invites.next ? (
        <div className="border-t border-[#f1f2f4] px-4 py-2.5">
          <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "h-10 sm:h-8")}>
            {more ? tt("Loading") : tt("Show more")}
          </button>
        </div>
      ) : null}
    </ListCard>
  )
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.target.select()} aria-label={tt("Invite link")} className={cn(field, "h-11 font-mono text-[13px] sm:h-10 sm:text-[12.5px]")} />
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
        {copied ? tt("Copied") : tt("Copy")}
      </button>
    </div>
  )
}

function InviteDialog({ open, onClose, base, head, tiers, canAdd, onMade, onAdded }: { open: boolean; onClose: () => void; base: string; head: CommunityHead; tiers: { id: string; name: string; kind: string }[]; canAdd: boolean; onMade: (i: InviteView) => void; onAdded: () => void }) {
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
      setMade({ text: tt("{email} is now a member.", { email }) })
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
    if (!res.ok || !res.data.invite) return setError(errorText(res.data.error, tt("The invite could not be made. Try again.")))
    onMade(res.data.invite)
    setMade({
      url: res.data.invite.url,
      text: mode === "email" ? (res.data.sent ? tt("Sent to {email}. You can also share the link yourself.", { email }) : tt("The email could not be sent just now. Share this link with {email} yourself.", { email })) : tt("Anyone with this link can join. Copy it now: it is shown once."),
    })
    if (mode === "email") setEmail("")
  }

  const tierPicker = tiers.length > 1 ? (
    <div>
      <label htmlFor="inv-tier" className={label}>
        {tt("Tier")}
      </label>
      <select id="inv-tier" value={tier} onChange={(e) => setTier(e.target.value)} className={selectField}>
        {mode !== "add" ? <option value="">{tt("The default tier")}</option> : null}
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.kind === "paid" ? tt(" (free for them)") : ""}
          </option>
        ))}
      </select>
    </div>
  ) : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tt("Invite members")}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            {tt("Done")}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || ((mode === "email" || mode === "add") && !email.includes("@"))} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-invite-submit="">
            {busy ? tt("Working") : mode === "email" ? tt("Send invite") : mode === "link" ? tt("Create link") : tt("Add member")}
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
          label={tt("How to invite")}
          className="w-full"
          options={[
            { value: "email", label: tt("By email") },
            { value: "link", label: tt("Link") },
            ...(canAdd ? [{ value: "add" as Mode, label: tt("Add directly") }] : []),
          ]}
        />
        {mode === "add" ? <p className="text-[13px] leading-snug text-[#6b7280]">{tt("Somebody with a Storelib account joins right away, without paying.")}</p> : null}
        {/* A private community that charges: the link is the way in, and the price is still theirs to pay (lib/communities/access-model.ts). */}
        {mode !== "add" && needsInvite(head) && joinCosts(head) ? (
          <p className="text-[13px] leading-snug text-[#6b7280]" data-invite-price-note="">
            {tt("Whoever follows this sees the price and pays to join. To give somebody access without paying, use Add directly.")}
          </p>
        ) : null}
        {mode !== "link" ? (
          <div>
            <label htmlFor="inv-email" className={label}>
              {tt("Email")}
            </label>
            <input id="inv-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 254))} placeholder="name@example.com" className={cn(field, "h-11 sm:h-10")} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-uses" className={label}>
                {tt("Uses")}
              </label>
              <input id="inv-uses" inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={tt("No limit")} className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div>
              <label htmlFor="inv-days" className={label}>
                {tt("Works for")}
              </label>
              <select id="inv-days" value={days} onChange={(e) => setDays(e.target.value)} className={selectField}>
                <option value="1">{tt("1 day")}</option>
                <option value="7">{tt("7 days")}</option>
                <option value="30">{tt("30 days")}</option>
                <option value="never">{tt("No end date")}</option>
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
