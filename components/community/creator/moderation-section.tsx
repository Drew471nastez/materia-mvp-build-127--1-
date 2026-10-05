"use client"

/**
 * ===========================================================================
 *  MODERATION
 * ===========================================================================
 * Everything about keeping the community in order, in one card with its
 * views in its first row:
 *
 *   REPORTS     what members flagged, newest first (the open ones, and
 *               under Resolved the closed ones with the decision), each with what it is about (a post's
 *               opening, a comment, a message, a member) and who wrote it.
 *               On the row: remove the content (which closes every report
 *               about it) and dismiss. In its menu: open the post, mark it
 *               reviewing, resolve it, and what to do to the author (mute
 *               for a while, suspend, remove, ban), which resolves the
 *               report too.
 *   RESTRICTED  who is muted, suspended or banned right now, each with the
 *               one button that undoes it (Unmute, Bring back, Unban).
 *   RULES       the rules members see before they join and when they post:
 *               a title and a line about it each, in order, saved with the
 *               Save bar. The owner and admins write them; a moderator
 *               reads them here.
 *   AUDIT LOG   every action anybody took, kept for good.
 *
 * People are acted on through ./member-actions, the same rules and routes
 * as the Members list.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import { canActOn } from "@/lib/communities/permissions"
import { MAX_RULES } from "@/lib/communities/limits"
import type { CommunityRule, ReportReason } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { AuditView, BadgeView, CommunityHead, MemberPage, MemberRowView, ReportView } from "./view-types"
import { checkRules, moveItem, systemReportKind, takenAwayLine, type MemberChoice } from "./logic"
import { useMemberActions, type ActOnPerson } from "./member-actions"
import { BlockedWords } from "@/components/community/creator/blocked-words"
import type { WordSettings } from "@/lib/communities/word-filter"
import { Confirm, EditorFoot, Empty, FilterTabs, ListCard, Notice, RowMenu, buttonPrimary, buttonSecondary, card, errorText, field, selectField, send, shortDate, useToast } from "./parts"

const REASON: Record<ReportReason, string> = { spam: "Spam", abuse: "Abuse", harassment: "Harassment", off_topic: "Off topic", illegal: "Illegal", other: "Other" }
const TARGET: Record<ReportView["targetType"], string> = { post: "Post", comment: "Comment", message: "Chat message", member: "Member" }

export type ModerationTab = "reports" | "resolved" | "restricted" | "rules" | "audit"

/** "post.removed" -> "Removed a post", for the log. */
export function auditSentence(action: string): string {
  const [thing, verb] = action.split(".")
  const nouns: Record<string, string> = { post: "a post", comment: "a comment", message: "a message", member: "a member", space: "a space", event: "an event", tier: "a tier", invite: "an invite", report: "a report", course: "a course", badge: "a badge", community: "the community", announcement: "an announcement", levels: "the levels", points: "points", members: "the members" }
  const verbs: Record<string, string> = {
    removed: "Removed",
    restored: "Restored",
    pinned: "Pinned",
    unpinned: "Unpinned",
    locked: "Locked",
    reopened: "Reopened comments on",
    featured: "Featured",
    unfeatured: "Stopped featuring",
    moved: "Moved",
    created: "Made",
    updated: "Changed",
    deleted: "Deleted",
    archived: "Archived",
    banned: "Banned",
    unbanned: "Unbanned",
    muted: "Muted",
    unmuted: "Unmuted",
    paused: "Suspended",
    unsuspended: "Brought back",
    joined: "Added",
    approved: "Approved",
    cancelled: "Took out",
    expired: "Ended the access of",
    role_changed: "Changed the role of",
    complimentary: "Gave complimentary access to",
    published: "Published",
    unpublished: "Unpublished",
    unarchived: "Brought back",
    settings_changed: "Changed the settings of",
    emailed: "Emailed",
    link_created: "Made",
    revoked: "Revoked",
    resolved: "Resolved",
    dismissed: "Dismissed",
    reviewing: "Started reviewing",
    open: "Reopened",
    attached: "Added",
    detached: "Took out",
    reordered: "Reordered",
    awarded: "Gave",
    taken_back: "Took back",
    given: "Gave",
    saved: "Saved",
    exported: "Exported",
    posted: "Posted",
    default: "Set the default",
    product_added: "Added a product to",
    product_removed: "Took a product off",
    tier_changed: "Moved the tier of",
    downgraded: "Moved to the free tier:",
    held: "Held back for review",
    hidden: "Hid after reports",
    join_alarm: "Switched on join approval for",
    roles_changed: "Changed what admins and moderators may do in",
    policies_changed: "Changed the refund policy or contact of",
    duplicated: "Copied the settings into",
    refused: "Refused",
    words_updated: "Changed the blocked words of",
  }
  const v = verbs[verb] ?? verb?.replace(/_/g, " ") ?? action
  return `${v} ${thing === "invite" && verb === "link_created" ? "an invite link" : (nouns[thing] ?? thing)}`
}

export interface RestrictedLists {
  muted: MemberPage
  paused: MemberPage
  banned: MemberPage
  /** Removed members, which had no way back before (round 14). */
  removed: MemberPage
}

export function ModerationSection({
  head,
  meId,
  initialTab = "reports",
  initialReports,
  initialAudit,
  rules,
  restricted: initialRestricted,
  tiers = [],
  badges = [],
  slowMode = 0,
  blockedWords,
}: {
  head: CommunityHead
  meId: string
  initialTab?: ModerationTab
  initialReports: { rows: ReportView[]; next: string | null }
  initialAudit: { rows: AuditView[]; next: string | null } | null
  rules: CommunityRule[]
  restricted: RestrictedLists | null
  tiers?: { id: string; name: string; kind: string }[]
  badges?: BadgeView[]
  /** Seconds between a member's posts, comments and chat messages (lib/communities/server/safety.ts); 0 is off. */
  slowMode?: number
  /** The community's blocked words (worker T2, lib/communities/word-filter.ts wordSettingsOf). */
  blockedWords?: WordSettings
}) {
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const [tab, setTab] = React.useState<ModerationTab>(initialTab)
  const view: "open" | "closed" = tab === "resolved" ? "closed" : "open"
  const [reports, setReports] = React.useState(initialReports)
  const [openCount, setOpenCount] = React.useState(head.openReports)
  const [audit, setAudit] = React.useState(initialAudit)
  const [restricted, setRestricted] = React.useState(initialRestricted)
  const [ruleCount, setRuleCount] = React.useState(rules.length)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<ReportView | null>(null)
  /* The report an author action came from, so it is resolved once the action is done. */
  const fromReport = React.useRef<ReportView | null>(null)

  const loadReports = async (status: "open" | "closed", cursor?: string | null) => {
    setLoading(true)
    const res = await send<{ rows: ReportView[]; next: string | null }>(`${base}/moderation?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, "GET")
    setLoading(false)
    if (!res.ok) return toast(errorText(res.data.error, "The reports could not be loaded."))
    setReports((x) => ({ rows: cursor ? [...x.rows, ...(res.data.rows ?? [])] : (res.data.rows ?? []), next: res.data.next ?? null }))
  }
  const loadAudit = async (cursor?: string | null) => {
    setLoading(true)
    const res = await send<{ rows: AuditView[]; next: string | null }>(`${base}/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, "GET")
    setLoading(false)
    if (!res.ok) return toast(errorText(res.data.error, "The log could not be loaded."))
    setAudit((x) => ({ rows: cursor && x ? [...x.rows, ...(res.data.rows ?? [])] : (res.data.rows ?? []), next: res.data.next ?? null }))
  }
  const loadRestricted = async () => {
    setLoading(true)
    const [muted, paused, banned, removed] = await Promise.all((["muted", "paused", "banned", "removed"] as const).map((s) => send<MemberPage>(`${base}/members?status=${s}`, "GET")))
    setLoading(false)
    if (!muted.ok || !paused.ok || !banned.ok) return toast(errorText((muted.ok ? paused.ok ? banned : paused : muted).data.error, "The list could not be loaded."))
    const page = (r: typeof muted): MemberPage => ({ rows: r.ok ? (r.data.rows ?? []) : [], next: r.ok ? (r.data.next ?? null) : null, capped: r.ok ? Boolean(r.data.capped) : false })
    setRestricted({ muted: page(muted), paused: page(paused), banned: page(banned), removed: page(removed) })
  }

  const choose = (t: ModerationTab) => {
    setTab(t)
    const url = new URL(window.location.href)
    if (t === "reports") url.searchParams.delete("tab")
    else url.searchParams.set("tab", t)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    if (t === "audit") void loadAudit()
    if (t === "reports") void loadReports("open")
    if (t === "resolved") void loadReports("closed")
    if (t === "restricted") void loadRestricted()
  }

  const setStatus = async (r: ReportView, status: "reviewing" | "resolved" | "dismissed", resolution?: string) => {
    setBusy(r.id)
    const res = await send(`${base}/moderation`, "PATCH", { id: r.id, status, resolution })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    if (!resolution) toast(status === "dismissed" ? "Report dismissed" : status === "resolved" ? "Report resolved" : "Marked as reviewing")
    if (status === "reviewing") setReports((x) => ({ ...x, rows: x.rows.map((y) => (y.id === r.id ? { ...y, status } : y)) }))
    else {
      setReports((x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))
      setOpenCount((n) => Math.max(0, n - 1))
    }
  }

  const removeContent = async (r: ReportView, reason: string) => {
    setBusy(r.id)
    const res = await send(`${base}/moderation`, "POST", { action: "remove", targetType: r.targetType, targetId: r.targetId, reason: reason || `Reported: ${REASON[r.reason]}` })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    setRemoving(null)
    toast("Removed, and the reports about it closed")
    const gone = reports.rows.filter((y) => y.targetType === r.targetType && y.targetId === r.targetId).length
    setOpenCount((n) => Math.max(0, n - gone))
    await loadReports("open")
  }

  /*
    HELD BY THE RULES (lib/communities/server/safety.ts): a post or comment
    the community's safety rules kept back, or hid after reports, waits here
    as removed with its report open. Approve puts it up and closes every open
    report about it; Keep hidden closes them and leaves it down.
  */
  const settleHeld = async (r: ReportView, approve: boolean) => {
    setBusy(r.id)
    if (approve) {
      const res = await send(`${base}/moderation`, "POST", { action: "restore", targetType: r.targetType, targetId: r.targetId })
      if (!res.ok) {
        setBusy(null)
        return toast(errorText(res.data.error))
      }
    }
    const same = reports.rows.filter((y) => y.targetType === r.targetType && y.targetId === r.targetId)
    const done = await Promise.all(same.map((y) => send(`${base}/moderation`, "PATCH", { id: y.id, status: "resolved", resolution: approve ? "Approved" : "Kept hidden" })))
    setBusy(null)
    const closed = same.filter((_, i) => done[i].ok).map((y) => y.id)
    setReports((x) => ({ ...x, rows: x.rows.filter((y) => !closed.includes(y.id)) }))
    setOpenCount((n) => Math.max(0, n - closed.length))
    toast(approve ? "Approved. Members can see it now." : "Kept hidden")
  }

  /*
    A JOIN ALARM (lib/communities/server/safety.ts watchJoin): more people
    joined at once than the community plausibly gets, so approval was
    switched on and a report was opened here. Turn approval off puts the
    door back as it was; Keep it on leaves it. Either closes the report.
  */
  const settleAlarm = async (r: ReportView, approvalOff: boolean) => {
    setBusy(r.id)
    if (approvalOff) {
      const res = await send(base, "PATCH", { approvalRequired: false })
      if (!res.ok) {
        setBusy(null)
        return toast(errorText(res.data.error))
      }
    }
    await setStatus(r, "resolved", approvalOff ? "Approval turned off" : "Approval kept on")
    setBusy(null)
    toast(approvalOff ? "Approval is off. People can join again." : "Approval stays on")
  }

  const people = useMemberActions({
    head,
    meId,
    tiers,
    badges,
    onDone: (choice: MemberChoice, who: ActOnPerson) => {
      const r = fromReport.current
      fromReport.current = null
      if (r && ["mute", "suspend", "remove", "ban"].includes(choice.action)) void setStatus(r, "resolved", `${choice.action === "mute" ? "Muted" : choice.action === "suspend" ? "Suspended" : choice.action === "remove" ? "Removed" : "Banned"} ${who.name}`)
      if (tab === "restricted" || restricted) void loadRestricted()
    },
  })

  const reportMenu = (r: ReportView): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    if (r.targetType === "post" && r.targetState !== "missing") items.push({ label: "Open the post", href: `/community/${head.slug}/post/${r.targetId}`, target: "_blank" })
    if (view === "open") {
      if (r.status === "open") items.push({ label: "Mark as reviewing", onClick: () => void setStatus(r, "reviewing") })
      items.push({ label: "Resolve without removing", onClick: () => void setStatus(r, "resolved") })
      const m = r.subject?.member
      if (r.subject && m) {
        const author: ActOnPerson = { userId: r.subject.userId, name: r.subject.name, role: m.role, status: m.status, source: m.source, mutedUntil: m.mutedUntil }
        const keep = ["mute", "unmute", "suspend", "remove", "ban", "unban"]
        const choices = people.choicesFor(author).filter((c) => keep.includes(c.action))
        choices.forEach((c, i) =>
          items.push({
            label: c.label,
            variant: c.danger ? "destructive" : undefined,
            section: i === 0 ? r.subject?.name : undefined,
            onClick: () => {
              fromReport.current = r
              people.run(c, author)
            },
          }),
        )
      }
    }
    return items
  }

  const restrictedCount = restricted ? (restricted.muted.rows.length + restricted.paused.rows.length + restricted.banned.rows.length) : undefined
  const tabs = [
    { value: "reports" as const, label: "Reports", count: openCount, attention: true },
    { value: "resolved" as const, label: "Resolved" },
    ...(head.can.mute || head.can.suspend || head.can.ban ? [{ value: "restricted" as const, label: "Restricted", count: restrictedCount }] : []),
    { value: "rules" as const, label: "Rules", count: ruleCount },
    ...(head.can.view_audit ? [{ value: "audit" as const, label: "Audit log" }] : []),
  ]

  return (
    <div className="space-y-4" data-moderation="" data-tab={tab}>
      <ListCard
        busy={loading}
        head={<FilterTabs label="Moderation" value={tab} onChange={choose} tabs={tabs} />}
      >
        {tab === "reports" || tab === "resolved" ? (
          reports.rows.length === 0 ? (
            loading ? <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">Loading</p> : <Empty title={view === "open" ? "All clear." : "Nothing closed yet."} detail={view === "open" ? "When members report a post, a comment or somebody, it lands here." : undefined} />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
              {reports.rows.map((r) => {
                const authorAbove = Boolean(r.subject?.member && r.subject.userId !== meId && !canActOn(head.role, r.subject.member.role))
                const canRemove = view === "open" && r.targetType !== "member" && r.targetState === "published" && head.can.moderate_content && !authorAbove
                const held = view === "open" && (r.targetType === "post" || r.targetType === "comment") && r.targetState === "removed"
                const system = !r.reporterName ? systemReportKind(r.note) : null
                return (
                  <li key={r.id} className="py-3.5 pl-4 pr-2 sm:pl-5 sm:pr-3" data-report="">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#6b7280]">
                          {system === "join_alarm" ? <StatusBadge tone="attention">Join alarm</StatusBadge> : system === "invite_paused" ? <StatusBadge tone="attention">Invite link turned off</StatusBadge> : <StatusBadge tone={r.reason === "illegal" || r.reason === "harassment" || r.reason === "abuse" ? "critical" : "attention"}>{REASON[r.reason]}</StatusBadge>}
                          <span className="font-medium text-[#1a1a2e]">{TARGET[r.targetType]}</span>
                          {r.subject && r.targetType !== "member" ? <span>by {r.subject.name}</span> : null}
                          <span>{relativeTime(r.createdAt)}</span>
                          {r.status === "reviewing" ? <StatusBadge tone="neutral">Reviewing</StatusBadge> : null}
                          {held ? <StatusBadge tone="attention">Held for review</StatusBadge> : r.targetState === "removed" ? <StatusBadge tone="neutral">Already removed</StatusBadge> : r.targetState === "deleted" || r.targetState === "missing" ? <StatusBadge tone="neutral">Deleted</StatusBadge> : null}
                        </div>
                        {system ? null : <p className="mt-1.5 line-clamp-3 text-[14px] leading-relaxed text-[#1a1a2e]">{r.preview || "(no text)"}</p>}
                        {r.note && !r.reporterName ? (
                          <p className="mt-1 text-[13px] text-[#4b5563]" data-report-system="">
                            {held ? r.note.replace(/^Held for review: /, "").replace(/^./, (c) => c.toUpperCase()) : system ? r.note.replace(/^(Join alarm|Invite link turned off): /, "").replace(/^./, (c) => c.toUpperCase()) : r.note}
                          </p>
                        ) : r.note ? (
                          <p className="mt-1 text-[13px] text-[#4b5563]">
                            &ldquo;{r.note}&rdquo;{r.reporterName ? <span className="text-[#9ca3af]"> said {r.reporterName}</span> : null}
                          </p>
                        ) : r.reporterName ? (
                          <p className="mt-1 text-[12.5px] text-[#9ca3af]">Reported by {r.reporterName}</p>
                        ) : null}
                        {view === "closed" && r.resolution ? <p className="mt-1 text-[12.5px] text-[#6b7280]">{r.status === "dismissed" ? "Dismissed" : "Resolved"}: {r.resolution}</p> : null}
                        {authorAbove && view === "open" ? <p className="mt-1 text-[12px] text-[#9ca3af]">Written by somebody ranked at or above you: an owner or admin decides.</p> : null}
                        {view === "open" ? (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {system === "join_alarm" && head.can.manage_settings ? (
                              <>
                                <button type="button" disabled={busy === r.id} onClick={() => void settleAlarm(r, true)} className={cn(buttonPrimary, "h-10 sm:h-8")} data-alarm-off="">
                                  Turn approval off
                                </button>
                                <button type="button" disabled={busy === r.id} onClick={() => void settleAlarm(r, false)} className={cn(buttonSecondary, "h-10 sm:h-8")} data-alarm-keep="">
                                  Keep it on
                                </button>
                              </>
                            ) : null}
                            {held && head.can.moderate_content && !authorAbove ? (
                              <>
                                <button type="button" disabled={busy === r.id} onClick={() => void settleHeld(r, true)} className={cn(buttonPrimary, "h-10 sm:h-8")} data-report-approve="">
                                  Approve
                                </button>
                                <button type="button" disabled={busy === r.id} onClick={() => void settleHeld(r, false)} className={cn(buttonSecondary, "h-10 sm:h-8")} data-report-keep="">
                                  Keep hidden
                                </button>
                              </>
                            ) : null}
                            {canRemove ? (
                              <button type="button" disabled={busy === r.id} onClick={() => setRemoving(r)} className={cn(buttonPrimary, "h-10 sm:h-8")} data-report-remove="">
                                Remove {TARGET[r.targetType].toLowerCase()}
                              </button>
                            ) : null}
                            {(held && head.can.moderate_content && !authorAbove) || (system === "join_alarm" && head.can.manage_settings) ? null : (
                              <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "dismissed")} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                                Dismiss
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <RowMenu items={reportMenu(r)} label="Report actions" />
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}

        {tab === "restricted" ? <Restricted lists={restricted} loading={loading} people={people} /> : null}

        {tab === "rules" ? (
          <>
            <SlowMode head={head} initial={slowMode} />
            <BlockedWords communityId={head.id} canEdit={head.can.manage_settings === true} initial={blockedWords} />
            <RulesEditor head={head} initial={rules} onSaved={setRuleCount} />
          </>
        ) : null}

        {tab === "audit" ? (
          !audit || audit.rows.length === 0 ? (
            loading ? <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">Loading</p> : <Empty title="Nothing logged yet." />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]" data-audit="">
              {audit.rows.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-[#1a1a2e]">
                      <span className="font-medium">{a.actorName ?? (a.actorKind === "system" ? "Storelib, automatically" : "Somebody")}</span> <span className="text-[#4b5563]">{auditSentence(a.action).replace(/^./, (c) => c.toLowerCase())}</span>
                      {a.targetLabel ? <span className="text-[#1a1a2e]">: {a.targetLabel}</span> : null}
                    </p>
                    {a.reason ? <p className="mt-0.5 truncate text-[12.5px] text-[#6b7280]">{a.reason}</p> : null}
                  </div>
                  <time dateTime={a.createdAt} className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">
                    {relativeTime(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </ListCard>

      {(tab === "audit" ? audit?.next : tab === "reports" || tab === "resolved" ? reports.next : null) ? (
        <div className="flex justify-center">
          <button type="button" disabled={loading} onClick={() => (tab === "audit" ? void loadAudit(audit?.next) : void loadReports(view, reports.next))} className={cn(buttonSecondary, "h-10 px-5")}>
            {loading ? "Loading" : "Show more"}
          </button>
        </div>
      ) : null}
      {tab === "reports" && !head.can.moderate_content ? <Notice tone="info">Your role can review reports but not remove content.</Notice> : null}

      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove this ${removing ? TARGET[removing.targetType].toLowerCase() : "content"}?`}
        detail="Members stop seeing it, and every open report about it is closed. You can restore it from the Feed."
        action="Remove"
        danger
        reason
        busy={busy !== null}
        onConfirm={(reason) => removing && void removeContent(removing, reason)}
      />
      {people.dialogs}
    </div>
  )
}

/* ── Restricted ─────────────────────────────────────────────────────────── */

function Restricted({ lists, loading, people }: { lists: RestrictedLists | null; loading: boolean; people: ReturnType<typeof useMemberActions> }) {
  if (!lists) return <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">{loading ? "Loading" : "Nobody is restricted."}</p>
  /* Who did it, when and why under each name, from the one helper the Members view uses too (./logic.ts). */
  const groups: { key: "muted" | "paused" | "banned" | "removed"; title: string; undo: MemberChoice["action"]; undoLabel: string; line: (m: MemberRowView) => string }[] = [
    { key: "muted", title: "Muted", undo: "unmute", undoLabel: "Unmute", line: takenAwayLine },
    { key: "paused", title: "Suspended", undo: "unsuspend", undoLabel: "Bring back", line: takenAwayLine },
    { key: "banned", title: "Banned", undo: "unban", undoLabel: "Unban", line: takenAwayLine },
    { key: "removed", title: "Removed", undo: "reinstate", undoLabel: "Let them back in", line: takenAwayLine },
  ]
  const any = groups.some((g) => lists[g.key].rows.length > 0)
  if (!any) return <Empty title="Nobody is restricted." detail="Muted, suspended, banned and removed members show here, with the button that lets them back." />
  return (
    <div data-restricted="">
      {groups.map((g) =>
        lists[g.key].rows.length ? (
          <section key={g.key} aria-label={g.title}>
            <h3 className="border-b border-[#f1f2f4] bg-[#fafbfb] px-4 py-2 text-[12px] font-medium text-[#6b7280] sm:px-5">
              {g.title} <span className="tabular-nums text-[#9ca3af]">{lists[g.key].rows.length}{lists[g.key].next ? "+" : ""}</span>
            </h3>
            <ul className="divide-y divide-[#f1f2f4]">
              {lists[g.key].rows.map((m) => {
                const who: ActOnPerson = { userId: m.userId, name: m.name, role: m.role, status: m.status, source: m.source, mutedUntil: m.mutedUntil, acted: m.acted ?? null }
                const choices = people.choicesFor(who)
                const undo = choices.find((c) => c.action === g.undo)
                return (
                  <li key={m.userId} className="flex min-h-[60px] items-center gap-3 py-2 pl-4 pr-2 sm:pl-5 sm:pr-3" data-restricted-row={g.key}>
                    <AppAvatar src={m.avatarUrl ?? undefined} name={m.name} size={32} className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{m.name}</p>
                      <p className="truncate text-[12.5px] text-[#6b7280]">{g.line(m)}</p>
                    </div>
                    {undo ? (
                      <button type="button" disabled={people.busy} onClick={() => people.run(undo, who)} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                        {g.undoLabel}
                      </button>
                    ) : null}
                    <RowMenu keepSpace items={people.menuItems(who, [undo?.key ?? ""])} label={`Actions for ${m.name}`} />
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  )
}

/* ── Slow mode ──────────────────────────────────────────────────────────── */

/** The choices lib/communities/server/safety.ts accepts (SAFETY.slowModeChoices), in seconds. */
export const SLOW_MODE_OPTIONS: readonly { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 900, label: "15 minutes" },
  { seconds: 3600, label: "1 hour" },
]

/**
 * How often a member may post, comment or send a chat message. Saved the
 * moment it is picked; the team is never slowed. A moderator reads it.
 */
function SlowMode({ head, initial }: { head: CommunityHead; initial: number }) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const canEdit = head.can.manage_settings === true
  const label = SLOW_MODE_OPTIONS.find((o) => o.seconds === value)?.label ?? "Off"
  const pick = async (seconds: number) => {
    const before = value
    setValue(seconds)
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { slowMode: seconds })
    setBusy(false)
    if (!res.ok) {
      setValue(before)
      return toast(errorText(res.data.error))
    }
    toast(seconds ? `Slow mode on: one every ${SLOW_MODE_OPTIONS.find((o) => o.seconds === seconds)?.label.replace(/^1 /, "") ?? ""}` : "Slow mode off")
    router.refresh()
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#f1f2f4] px-4 py-3 sm:px-5" data-slow-mode="">
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="text-[14px] font-medium text-[#1a1a2e]">Slow mode</p>
        <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">How often a member can post, comment or send a chat message. The team is never slowed.</p>
      </div>
      {canEdit ? (
        <select value={value} disabled={busy} onChange={(e) => void pick(Number(e.target.value))} aria-label="Slow mode" className={cn(selectField, "w-full shrink-0 sm:w-[200px]")}>
          {SLOW_MODE_OPTIONS.map((o) => (
            <option key={o.seconds} value={o.seconds}>
              {o.seconds ? `One every ${o.label.replace(/^1 /, "")}` : "Off"}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[13.5px] text-[#4b5563]">{value ? `One every ${label.replace(/^1 /, "")}` : "Off"}</span>
      )}
    </div>
  )
}

/* ── Rules ──────────────────────────────────────────────────────────────── */

export function RulesEditor({ head, initial, onSaved }: { head: CommunityHead; initial: CommunityRule[]; onSaved: (n: number) => void }) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = head.can.manage_settings === true
  const [rules, setRules] = React.useState<CommunityRule[]>(initial)
  const [saved, setSaved] = React.useState(JSON.stringify(initial))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(rules) !== saved
  const set = (i: number, patch: Partial<CommunityRule>) => {
    setRules((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setError(null)
  }
  const save = async () => {
    const checked = checkRules(rules)
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { rules: checked.value })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    setRules(checked.value)
    setSaved(JSON.stringify(checked.value))
    onSaved(checked.value.length)
    setError(null)
    toast("Rules saved")
    router.refresh()
  }

  if (!canEdit)
    return rules.length === 0 ? (
      <Empty title="No rules yet." detail="The owner and admins write the rules." />
    ) : (
      <ol className="divide-y divide-[#f1f2f4]" data-rules="">
        {rules.map((r, i) => (
          <li key={i} className="flex gap-3 px-4 py-3 sm:px-5">
            <span className="w-5 shrink-0 pt-px text-[13px] font-semibold tabular-nums text-[#9ca3af]">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{r.title}</p>
              {r.body ? <p className="mt-0.5 text-[13px] leading-snug text-[#4b5563]">{r.body}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    )

  return (
    <div data-rules="">
      <p className="border-b border-[#f1f2f4] px-4 py-2.5 text-[13px] leading-snug text-[#6b7280] sm:px-5">Shown on the community&rsquo;s page before somebody joins, and to new members when they arrive. A short title each, and a line about what it means here.</p>
      {rules.length === 0 ? (
        <Empty title="No rules yet." detail="Two or three clear ones are enough: be kind, stay on topic, no selling." />
      ) : (
        <ol className="divide-y divide-[#f1f2f4]">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-2 py-3 pl-4 pr-2 sm:gap-3 sm:pl-5 sm:pr-3" data-rule="">
              <span className="w-5 shrink-0 pt-[11px] text-[13px] font-semibold tabular-nums text-[#9ca3af] max-sm:hidden">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input value={r.title} onChange={(e) => set(i, { title: e.target.value.slice(0, 120) })} placeholder={i === 0 ? "Be kind" : "Rule"} aria-label={`Rule ${i + 1} title`} className={cn(field, "h-11 font-medium sm:h-10")} />
                <textarea value={r.body} onChange={(e) => set(i, { body: e.target.value.slice(0, 1000) })} placeholder="What it means here (optional)" rows={2} aria-label={`Rule ${i + 1} detail`} className={cn(field, "resize-y py-2 leading-relaxed")} />
              </div>
              <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
                <button type="button" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => setRules((x) => moveItem(x, i, i - 1))} className="grid h-10 w-10 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30 sm:h-8 sm:w-8">
                  <ArrowUp aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" aria-label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => setRules((x) => moveItem(x, i, i + 1))} className="grid h-10 w-10 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30 sm:h-8 sm:w-8">
                  <ArrowDown aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" aria-label={`Remove rule ${i + 1}`} onClick={() => setRules((x) => x.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] sm:h-8 sm:w-8">
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#f1f2f4] px-4 py-3 sm:px-5">
        {rules.length < MAX_RULES ? (
          <button type="button" onClick={() => setRules((x) => [...x, { title: "", body: "" }])} className={cn(buttonSecondary, "h-10 sm:h-8")} data-rule-add="">
            <Plus aria-hidden className="h-4 w-4" />
            Add a rule
          </button>
        ) : null}
        <span className="text-[12.5px] tabular-nums text-[#9ca3af]">
          {rules.length} of {MAX_RULES}
        </span>
      </div>
      {dirty || error ? (
        <div className="px-3 pb-3" data-save-bar="">
          <EditorFoot dirty={dirty} busy={busy} error={error} onSave={() => void save()} onCancel={() => { setRules(JSON.parse(saved)); setError(null) }} />
        </div>
      ) : null}
    </div>
  )
}
