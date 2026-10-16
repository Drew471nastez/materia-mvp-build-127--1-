"use client"

/**
 * ===========================================================================
 *  MEMBERS
 * ===========================================================================
 * Everyone in the community, 50 at a time (keyset paged on the server, so
 * the hundredth page costs what the first does), in one card the way
 * Products and Orders draw a list: the views in its first row (active,
 * requests to join, not active, expired, left, each with its count) with
 * Export and Invite beside them; the search (by name, and by email for the
 * owner and admins, the only ones who see emails) and the filters in the
 * second; then the rows.
 *
 * ROUND 32 (the owner, on a computer: "too shrunk, bad UI"). From 768px the
 * rows are a table as Orders' are (./ui-kit.tsx): a check box, the member,
 * their role, tier, level, when they joined and when they were last here,
 * each in its own column, one row height, the menu last. The filters are
 * role, tier and when they joined, and the list can be put in another order
 * (newest, oldest, recently active, most points), all read on the server
 * (lib/communities/server/creator.ts listMembers). A phone keeps one row per
 * member, its words in two lines, and every pick opens the shared bottom
 * sheet.
 *
 * Pressing a row opens the member (./member-sheet.tsx): who they are, what
 * the columns said, a message, their profile, and everything this person may
 * do to them. Each row's menu holds the same choices, from ./member-actions
 * (the server's own rules: can() and never to somebody ranked the same or
 * above). A request to join has Approve and Decline on the row itself, and
 * a row of somebody taken out has its way back.
 *
 * Picked rows (the check boxes) can be approved or declined together, taken
 * out together, or saved as a CSV of just them; Export saves everybody in
 * the view, streamed by the server a page at a time.
 *
 * Invite opens one sheet for the three ways in: an email invite, a link to
 * share (with uses and an end date), or adding an existing Storelib
 * account directly.
 */
import * as React from "react"
import { Download, Link2, Mail, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import type { BadgeView, CommunityHead, InviteView, MemberPage, MemberRowView } from "./view-types"
import { MEMBER_STATUS_FILTERS, ROLE_LABEL, takenAwayLine, type MemberChoice, type MemberSort, type MemberStatusFilter } from "./logic"
import { joinCosts, needsInvite } from "@/lib/communities/access-model"
import { useMemberActions, type ActOnPerson } from "./member-actions"
import { PaymentsSection } from "@/components/community/membership/refund-dialog"
import { Confirm, Dialog, Empty, FilterTabs, ListCard, ListNote, Notice, PickButton, RowMenu, SearchField, Segmented, ToolbarDivider, buttonPrimary, buttonSecondary, SelectField, errorText, field, label, send, shortDate, useToast, ListLoading, usePhone } from "./parts"
import { ROW_PRESS, RowControls, RowOpen, rowPress } from "./rows"
import { BulkBar, ListFoot, MUTED, PHONE_LIST, PickAll, PickOne, SortPick, TABLE, TD, TH, TR, bulkButton, count, downloadCsv, useSelection } from "./ui-kit"
import { MemberSheet, sourceWords } from "./member-sheet"
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

type Bulk = "approve" | "reject" | "remove"

export function MembersSection(p: Props) {
  const base = `/api/app/community/${p.head.id}`
  const toast = useToast()
  const phone = usePhone()
  const [status, setStatus] = React.useState<MemberStatusFilter>(p.status)
  const [q, setQ] = React.useState("")
  const [role, setRole] = React.useState("")
  const [tier, setTier] = React.useState("")
  const [joined, setJoined] = React.useState("")
  const [sort, setSort] = React.useState<MemberSort>("newest")
  const [page, setPage] = React.useState<MemberPage>(p.initial)
  const [counts, setCounts] = React.useState(p.counts)
  const [loading, setLoading] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = React.useState(p.openInvite)
  const [invites, setInvites] = React.useState(p.invites)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [asking, setAsking] = React.useState<Bulk | null>(null)
  const first = React.useRef(true)
  const request = React.useRef(0)

  const queryString = React.useCallback(
    (cursor?: string | null, withCounts?: boolean) => {
      const u = new URLSearchParams({ status })
      if (q.trim()) u.set("q", q.trim())
      if (role) u.set("role", role)
      if (tier) u.set("tier", tier)
      if (joined) u.set("joined", joined)
      if (sort !== "newest") u.set("sort", sort)
      if (cursor) u.set("cursor", cursor)
      if (withCounts) u.set("counts", "1")
      return u.toString()
    },
    [status, q, role, tier, joined, sort],
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
  }, [status, role, tier, joined, sort, q, load])

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
  const pickable = !restricted
  const ids = React.useMemo(() => rows.map((m) => m.userId), [rows])
  const sel = useSelection(pickable ? ids : [])
  const filtered = Boolean(q.trim() || role || tier || joined)
  const roleOptions = [{ value: "", label: tt("All roles") }, ...(["owner", "admin", "moderator", "member"] as const).map((r) => ({ value: r, label: `${ROLE_LABEL[r]}s` }))]
  const tierOptions = [{ value: "", label: tt("All tiers") }, ...p.tiers.map((t) => ({ value: t.id, label: t.name }))]
  const joinedOptions = [
    { value: "", label: tt("Joined any time") },
    { value: "7", label: tt("Joined in the last 7 days") },
    { value: "30", label: tt("Joined in the last 30 days") },
    { value: "90", label: tt("Joined in the last 90 days") },
    { value: "365", label: tt("Joined in the last year") },
  ]
  const sortOptions = [
    { value: "newest", label: pending ? tt("Newest first") : tt("Newest members") },
    { value: "oldest", label: pending ? tt("Oldest first") : tt("Oldest members") },
    ...(pending ? [] : [{ value: "active", label: tt("Recently active") }]),
    ...(pending || !showLevel ? [] : [{ value: "points", label: tt("Most points") }]),
  ]
  const open = openId ? (rows.find((m) => m.userId === openId) ?? null) : null

  /* A choice from the member's sheet: the sheet goes down, then the choice runs as it would from the menu. */
  const chooseFromSheet = (m: MemberRowView, c: MemberChoice) => {
    setOpenId(null)
    window.setTimeout(() => actions.run(c, person(m)), phone ? 240 : 0)
  }

  /* ── Picked rows ── */
  const pickedRows = rows.filter((m) => sel.picked.has(m.userId))
  const doable = (action: Bulk) => pickedRows.filter((m) => actions.choicesFor(person(m)).some((c) => c.action === action))
  const runBulk = async (action: Bulk, reason?: string) => {
    const targets = doable(action)
    if (!targets.length) return
    setBulkBusy(true)
    let done = 0
    for (const m of targets) {
      const res = await send(`${base}/members/${m.userId}`, "PATCH", { action, reason: reason || undefined })
      if (res.ok) done++
    }
    setBulkBusy(false)
    setAsking(null)
    sel.clear()
    const left = pickedRows.length - done
    const said =
      action === "approve"
        ? tt("{n, plural, one {# request approved} other {# requests approved}}", { n: done })
        : action === "reject"
          ? tt("{n, plural, one {# request declined} other {# requests declined}}", { n: done })
          : tt("{n, plural, one {# member removed} other {# members removed}}", { n: done })
    toast(left > 0 ? `${said} · ${tt("{n, plural, one {# left as it was} other {# left as they were}}", { n: left })}` : said)
    void load(true)
  }
  const exportPicked = () => {
    const headRow = [tt("Name"), tt("Username"), ...(p.canEmail ? [tt("Email")] : []), tt("Role"), tt("Status"), tt("Tier"), tt("Level"), tt("Points"), tt("Joined"), tt("Last active"), tt("How they joined")]
    downloadCsv(
      `${p.head.slug}-members-selected.csv`,
      headRow,
      pickedRows.map((m) => [m.name, m.username ?? "", ...(p.canEmail ? [m.email ?? ""] : []), ROLE_LABEL[m.role], m.status, m.tierName ?? "", m.level, m.points, m.joinedAt ?? "", m.lastActiveAt ?? "", sourceWords(m.source)]),
    )
  }

  /* Approve and Decline sit on a request's row, and the undo sits on a row that is not active; the rest are in the menu. */
  const rowActions = (m: MemberRowView, onPhone: boolean) => {
    const choices = actions.choicesFor(person(m))
    const approve = choices.find((c) => c.action === "approve")
    const reject = choices.find((c) => c.action === "reject")
    const undo = restricted ? choices.find((c) => c.action === "unsuspend" || c.action === "unban" || c.action === "reinstate" || c.action === "unmute") : undefined
    return (
      <RowControls className="justify-end gap-1.5">
        {reject && !onPhone ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(reject, person(m))} className={buttonSecondary}>
            {tt("Decline")}
          </button>
        ) : null}
        {approve ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(approve, person(m))} className={cn(buttonPrimary, onPhone && "h-10 px-3.5")} data-approve="">
            {tt("Approve")}
          </button>
        ) : null}
        {undo ? (
          <button type="button" disabled={actions.busy} onClick={() => actions.run(undo, person(m))} className={cn(buttonSecondary, onPhone && "h-10 whitespace-nowrap px-3")} data-undo="">
            {onPhone ? (undo.shortLabel ?? undo.label) : undo.label}
          </button>
        ) : null}
        <RowMenu keepSpace={restricted && !onPhone} items={actions.menuItems(person(m), [...(onPhone ? ["approve"] : ["approve", "reject"]), ...(undo ? [undo.key] : [])])} label={tt("Actions for {name}", { name: m.name })} />
      </RowControls>
    )
  }

  const line = (m: MemberRowView) =>
    pending
      ? [m.requestNote || (m.approved ? tt("Approved, waiting for payment") : null), shortDate(m.requestedAt)].filter(Boolean).join(" · ")
      : restricted
        ? takenAwayLine(m)
        : [m.role !== "member" ? ROLE_LABEL[m.role] : null, m.tierName, showLevel ? tt("Level {level}", { level: m.level }) : null, tt("Joined {date}", { date: shortDate(m.joinedAt) })].filter(Boolean).join(" · ")

  /* The member's picture, name and badges, the same in the table and the phone's list. */
  const who = (m: MemberRowView, size: 32 | 36) => (
    <RowOpen label={tt("Open {name}", { name: m.name })} className="flex min-w-0 flex-1 items-center gap-3">
      <MemberAvatar src={m.avatarUrl ?? undefined} name={m.name} size={size} className={cn("shrink-0 rounded-full", size === 32 ? "h-8 w-8" : "h-9 w-9")} lazy />
      <span className="min-w-0 flex-1">
        <span className={cn("flex min-w-0 items-center gap-1.5 font-medium text-[#1a1a2e]", size === 32 ? "text-[13.5px]" : "text-[14.5px]")}>
          <span className="truncate">{m.name}</span>
          {m.mutedUntil ? <StatusBadge tone="attention">{tt("Muted")}</StatusBadge> : null}
          {size === 32 && m.source === "manual" ? <StatusBadge tone="neutral">{tt("Complimentary")}</StatusBadge> : null}
        </span>
        <span className="block truncate text-[12.5px] text-[#6b7280]">{size === 32 ? (m.email ?? (m.username ? `@${m.username}` : "")) : line(m)}</span>
      </span>
    </RowOpen>
  )

  const toolbar = (
    <div className="flex w-full min-w-0 flex-col md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center">
        <SearchField value={q} onChange={setQ} placeholder={tt("Search members")} label={p.canEmail ? tt("Search members by name or email") : tt("Search members by name")} />
      </div>
      {/* On a phone the filters are a second row that scrolls sideways, the order pinned at its end; on a computer they follow the search. */}
      <div className="-mx-1 flex min-w-0 items-center border-t border-[#f1f2f4] pl-1 md:mx-0 md:border-t-0 md:pl-0" data-member-filters="">
        <span className="contents max-md:hidden">
          <ToolbarDivider />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)] md:flex-none md:overflow-visible md:[mask-image:none]">
          <PickButton name="role" title={tt("Role")} options={roleOptions} value={role} onPick={setRole} align="end" />
          {p.tiers.length > 1 ? <PickButton name="tier" title={tt("Tier")} options={tierOptions} value={tier} onPick={setTier} align="end" /> : null}
          {!pending ? <PickButton name="joined" title={tt("Joined")} options={joinedOptions} value={joined} onPick={setJoined} align="end" /> : null}
        </div>
        <span aria-hidden className="h-6 w-px shrink-0 bg-[#e5e7eb] md:hidden" />
        <SortPick value={sort} options={sortOptions} onPick={(v) => setSort(v as MemberSort)} />
      </div>
    </div>
  )

  const bulkBar = (
    <BulkBar size={sel.size} onClear={sel.clear}>
      {pending && doable("approve").length ? (
        <button type="button" disabled={bulkBusy} onClick={() => void runBulk("approve")} className={bulkButton} data-bulk="approve">
          {tt("Approve")}
        </button>
      ) : null}
      {pending && doable("reject").length ? (
        <button type="button" disabled={bulkBusy} onClick={() => setAsking("reject")} className={bulkButton} data-bulk="reject">
          {tt("Decline")}
        </button>
      ) : null}
      <button type="button" onClick={exportPicked} className={bulkButton} data-bulk="export">
        {tt("Export selected")}
      </button>
      {!pending && doable("remove").length ? (
        <button type="button" disabled={bulkBusy} onClick={() => setAsking("remove")} className={cn(bulkButton, "text-[#b42318]")} data-bulk="remove">
          {tt("Remove")}
        </button>
      ) : null}
    </BulkBar>
  )

  const total = filtered ? null : (counts[status] ?? null)
  const cols = pending ? "pending" : restricted ? "restricted" : "members"

  return (
    <div className="space-y-4" data-members="">
      {error ? <Notice>{error}</Notice> : null}

      <ListCard
        data-members-table=""
        busy={loading}
        head={<FilterTabs label={tt("Member status")} value={status} onChange={(s) => { sel.clear(); setSort("newest"); setStatus(s) }} tabs={statuses.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] ?? 0, attention: s === "pending" }))} />}
        actions={
          <>
            {p.canEmail ? (
              <a href={`${base}/members/export?${queryString()}`} className={cn(buttonSecondary, "max-sm:w-10 max-sm:px-0")} download aria-label={tt("Export members as CSV")} data-members-export="">
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
        toolbar={toolbar}
      >
        {bulkBar}
        {rows.length === 0 ? (
          loading ? (
            <ListLoading />
          ) : q ? (
            <Empty title={tt("Nobody by that name")} detail={tt("Check the spelling, or search by part of the name.")} />
          ) : filtered ? (
            <Empty title={tt("Nobody matches these filters.")}>
              <button type="button" onClick={() => { setRole(""); setTier(""); setJoined("") }} className={cn(buttonSecondary, "h-10 px-4")}>
                {tt("Clear filters")}
              </button>
            </Empty>
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
            <table className={TABLE} data-cols={cols}>
              <thead>
                <tr>
                  {pickable ? (
                    <th className={cn(TH, "w-11 pr-0")}>
                      <PickAll sel={sel} ids={ids} />
                    </th>
                  ) : null}
                  <th className={cn(TH, pickable && "!pl-1")}>{tt("Member")}</th>
                  {pending ? (
                    <>
                      <th className={cn(TH, "w-[34%]")}>{tt("Note")}</th>
                      <th className={cn(TH, "w-[112px]")}>{tt("Asked")}</th>
                      <th className={cn(TH, "w-[208px]")} aria-label={tt("Actions")} />
                    </>
                  ) : restricted ? (
                    <>
                      <th className={cn(TH, "w-[44%]")}>{tt("What happened")}</th>
                      <th className={cn(TH, "w-[220px]")} aria-label={tt("Actions")} />
                    </>
                  ) : (
                    <>
                      <th className={cn(TH, "w-[112px]")}>{tt("Role")}</th>
                      <th className={cn(TH, "w-[14%]")}>{tt("Tier")}</th>
                      {showLevel ? <th className={cn(TH, "w-[100px]")}>{tt("Level")}</th> : null}
                      <th className={cn(TH, "w-[104px]")}>{tt("Joined")}</th>
                      <th className={cn(TH, "w-[116px]")}>{tt("Last active")}</th>
                      <th className={cn(TH, "w-[60px]")} aria-label={tt("Actions")} />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const on = sel.picked.has(m.userId)
                  return (
                    <tr key={m.userId} onClick={rowPress(() => setOpenId(m.userId))} className={TR} data-picked={on || undefined} data-member-row="">
                      {pickable ? (
                        <td className={cn(TD, "h-14 pr-0")}>
                          <PickOne on={on} label={tt("Select {name}", { name: m.name })} onChange={(v) => sel.set([m.userId], v)} />
                        </td>
                      ) : null}
                      <td className={cn(TD, "h-14", pickable && "!pl-1")}>{who(m, 32)}</td>
                      {pending ? (
                        <>
                          <td className={cn(TD, "truncate text-[#4b5563]")} title={m.requestNote ?? undefined}>{m.requestNote || (m.approved ? tt("Approved, waiting for payment") : "")}</td>
                          <td className={cn(TD, "whitespace-nowrap", MUTED)}>{shortDate(m.requestedAt)}</td>
                          <td className={TD}>{rowActions(m, false)}</td>
                        </>
                      ) : restricted ? (
                        <>
                          <td className={cn(TD, "truncate text-[#4b5563]")} title={takenAwayLine(m)}>{takenAwayLine(m)}</td>
                          <td className={TD}>{rowActions(m, false)}</td>
                        </>
                      ) : (
                        <>
                          <td className={cn(TD, "truncate")}>{ROLE_LABEL[m.role]}</td>
                          <td className={cn(TD, "truncate", m.tierName ? "text-[#4b5563]" : "text-[#c4c7cd]")}>{m.tierName ?? "–"}</td>
                          {showLevel ? (
                            <td className={cn(TD, "whitespace-nowrap tabular-nums text-[#4b5563]")}>
                              {m.level} <span className="text-[#9ca3af]">· {count(m.points)}</span>
                            </td>
                          ) : null}
                          <td className={cn(TD, "whitespace-nowrap", MUTED)}>{shortDate(m.joinedAt)}</td>
                          <td className={cn(TD, "whitespace-nowrap", MUTED)}>{m.lastActiveAt ? relativeTime(m.lastActiveAt) : <span className="text-[#c4c7cd]">–</span>}</td>
                          <td className={TD}>{rowActions(m, false)}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <ul className={PHONE_LIST}>
              {rows.map((m) => (
                <li key={m.userId} onClick={rowPress(() => setOpenId(m.userId))} className={cn("flex min-h-[64px] items-center gap-3 py-2.5 pl-4 pr-2", ROW_PRESS)} data-member-row="">
                  {who(m, 36)}
                  {rowActions(m, true)}
                </li>
              ))}
            </ul>
          </>
        )}
        <ListFoot shown={rows.length} total={total} more={Boolean(page.next)} loading={more} onMore={() => void loadMore()} label={(n) => tt("{n, plural, one {# member} other {# members}}", { n })} />
      </ListCard>

      {page.capped ? <p className="px-1 text-[13px] text-[#6b7280]">{tt("Showing the first matches. Type more of the name to narrow it down.")}</p> : null}

      {p.head.can.invite && invites.rows.length > 0 ? <InvitesList base={base} invites={invites} setInvites={setInvites} /> : null}

      {/* Round 13 (ask 41): the community's payments, each with Refund, for the owner only (money stays with the owner). */}
      {p.head.can.manage_pricing ? <PaymentsSection communityId={p.head.id} /> : null}

      <MemberSheet
        head={p.head}
        member={open}
        choices={open ? actions.choicesFor(person(open)) : []}
        showLevel={showLevel}
        onClose={() => setOpenId(null)}
        onChoose={(c) => open && chooseFromSheet(open, c)}
      />

      <Confirm
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === "reject" ? tt("Decline {n, plural, one {# request} other {# requests}}?", { n: doable("reject").length }) : tt("Remove {n, plural, one {# member} other {# members}}?", { n: doable("remove").length })}
        detail={asking === "reject" ? tt("They can ask again later.") : tt("They lose access at once. You can let them back in from Not active.")}
        action={asking === "reject" ? tt("Decline") : tt("Remove")}
        danger={asking === "remove"}
        reason={asking === "remove"}
        busy={bulkBusy}
        onConfirm={(reason) => asking && void runBulk(asking, reason)}
      />

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
      <SelectField
        id="inv-tier"
        name="invite-tier"
        title={tt("Tier")}
        value={tier}
        onChange={setTier}
        options={[...(mode !== "add" ? [{ value: "", label: tt("The default tier") }] : []), ...tiers.map((t) => ({ value: t.id, label: `${t.name}${t.kind === "paid" ? tt(" (free for them)") : ""}` }))]}
      />
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
              <SelectField
                id="inv-days"
                name="invite-days"
                title={tt("Works for")}
                value={days}
                onChange={setDays}
                options={[
                  { value: "1", label: tt("1 day") },
                  { value: "7", label: tt("7 days") },
                  { value: "30", label: tt("30 days") },
                  { value: "never", label: tt("No end date") },
                ]}
              />
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
