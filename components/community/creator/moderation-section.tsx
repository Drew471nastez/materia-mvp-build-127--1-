"use client"

/**
 * ===========================================================================
 *  MODERATION
 * ===========================================================================
 * Reports: what members flagged, newest first, each with what it is about
 * beside it (a post's opening, a comment, a message, a member) and who
 * wrote it, and the decisions on it: remove the content (which closes every
 * report about it), ban or mute the author, mark it reviewing, resolve or
 * dismiss. The audit log under its own tab: every action anybody took,
 * kept for good.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { canActOn } from "@/lib/communities/permissions"
import { relativeTime } from "@/lib/communities/format"
import type { ReportReason } from "@/lib/communities/types"
import type { AuditView, CommunityHead, ReportView } from "./view-types"
import { Confirm, Empty, Notice, Segmented, buttonPrimary, buttonSecondary, card, errorText, send, useToast } from "./parts"

const REASON: Record<ReportReason, string> = { spam: "Spam", abuse: "Abuse", harassment: "Harassment", off_topic: "Off topic", illegal: "Illegal", other: "Other" }
const TARGET: Record<ReportView["targetType"], string> = { post: "Post", comment: "Comment", message: "Chat message", member: "Member" }

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
    unlocked: "Unlocked",
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
  }
  const v = verbs[verb] ?? verb?.replace(/_/g, " ") ?? action
  return `${v} ${thing === "invite" && verb === "link_created" ? "an invite link" : (nouns[thing] ?? thing)}`
}

export function ModerationSection({ head, initialReports, initialAudit }: { head: CommunityHead; initialReports: { rows: ReportView[]; next: string | null }; initialAudit: { rows: AuditView[]; next: string | null } | null }) {
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const [tab, setTab] = React.useState<"open" | "closed" | "audit">("open")
  const [reports, setReports] = React.useState(initialReports)
  const [audit, setAudit] = React.useState(initialAudit)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<{ report: ReportView; kind: "remove" | "ban" } | null>(null)

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

  const choose = (t: typeof tab) => {
    setTab(t)
    if (t === "audit") void loadAudit()
    else void loadReports(t)
  }

  const setStatus = async (r: ReportView, status: "reviewing" | "resolved" | "dismissed") => {
    setBusy(r.id)
    const res = await send(`${base}/moderation`, "PATCH", { id: r.id, status })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    toast(status === "dismissed" ? "Report dismissed" : status === "resolved" ? "Report resolved" : "Marked as reviewing")
    if (status === "reviewing") setReports((x) => ({ ...x, rows: x.rows.map((y) => (y.id === r.id ? { ...y, status } : y)) }))
    else setReports((x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))
  }

  const removeContent = async (r: ReportView, reason: string) => {
    setBusy(r.id)
    const res = await send(`${base}/moderation`, "POST", { action: "remove", targetType: r.targetType, targetId: r.targetId, reason: reason || `Reported: ${REASON[r.reason]}` })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    setConfirm(null)
    toast("Removed, and the reports about it closed")
    await loadReports("open")
  }

  const ban = async (r: ReportView, reason: string) => {
    if (!r.subject) return
    setBusy(r.id)
    const res = await send(`${base}/members/${r.subject.userId}`, "PATCH", { action: "ban", reason: reason || `Reported: ${REASON[r.reason]}` })
    setBusy(null)
    if (!res.ok) return toast(errorText(res.data.error))
    setConfirm(null)
    toast(`${r.subject.name} is banned`)
    await setStatus(r, "resolved")
  }

  const tabs = [
    { value: "open" as const, label: "Open" },
    { value: "closed" as const, label: "Closed" },
    ...(head.can.view_audit ? [{ value: "audit" as const, label: "Audit log" }] : []),
  ]

  return (
    <div className="space-y-4" data-moderation="">
      <Segmented value={tab} onChange={choose} label="Moderation" options={tabs} />

      {tab !== "audit" ? (
        <section className={cn(card, "overflow-hidden")} aria-busy={loading || undefined}>
          {reports.rows.length === 0 ? (
            loading ? <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">Loading</p> : <Empty title={tab === "open" ? "All clear." : "Nothing closed yet."} detail={tab === "open" ? "When members report a post, a comment or somebody, it lands here." : undefined} />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
              {reports.rows.map((r) => {
                const authorAbove = r.subject && r.subject.role ? !canActOn(head.role, r.subject.role) : false
                const canRemove = tab === "open" && r.targetType !== "member" && r.targetState === "published" && head.can.moderate_content && !authorAbove
                const canBan = tab === "open" && r.subject && head.can.ban && !authorAbove
                return (
                  <li key={r.id} className="px-4 py-4 sm:px-5" data-report="">
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#6b7280]">
                      <StatusBadge tone={r.reason === "illegal" || r.reason === "harassment" || r.reason === "abuse" ? "critical" : "attention"}>{REASON[r.reason]}</StatusBadge>
                      <span className="font-medium text-[#1a1a2e]">{TARGET[r.targetType]}</span>
                      {r.subject ? <span>by {r.subject.name}</span> : null}
                      <span>· {relativeTime(r.createdAt)}</span>
                      {r.status === "reviewing" ? <StatusBadge tone="neutral">Reviewing</StatusBadge> : null}
                      {r.targetState === "removed" ? <StatusBadge tone="neutral">Already removed</StatusBadge> : r.targetState === "deleted" || r.targetState === "missing" ? <StatusBadge tone="neutral">Deleted</StatusBadge> : null}
                    </div>
                    <blockquote className="mt-2 line-clamp-3 border-l-2 border-[#e5e7eb] pl-3 text-[14px] leading-relaxed text-[#1a1a2e]">{r.preview || "(no text)"}</blockquote>
                    {r.note ? <p className="mt-2 text-[13px] text-[#4b5563]">&ldquo;{r.note}&rdquo;{r.reporterName ? <span className="text-[#9ca3af]"> said {r.reporterName}</span> : null}</p> : r.reporterName ? <p className="mt-2 text-[12.5px] text-[#9ca3af]">Reported by {r.reporterName}</p> : null}
                    {tab === "closed" && r.resolution ? <p className="mt-2 text-[12.5px] text-[#6b7280]">{r.status === "dismissed" ? "Dismissed" : "Resolved"}: {r.resolution}</p> : null}
                    {tab === "open" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {canRemove ? (
                          <button type="button" disabled={busy === r.id} onClick={() => setConfirm({ report: r, kind: "remove" })} className={cn(buttonPrimary, "h-9 sm:h-8")}>
                            Remove {TARGET[r.targetType].toLowerCase()}
                          </button>
                        ) : null}
                        {canBan ? (
                          <button type="button" disabled={busy === r.id} onClick={() => setConfirm({ report: r, kind: "ban" })} className={cn(buttonSecondary, "h-9 sm:h-8")}>
                            Ban {r.subject?.name}
                          </button>
                        ) : null}
                        {r.status === "open" ? (
                          <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "reviewing")} className={cn(buttonSecondary, "h-9 sm:h-8")}>
                            Reviewing
                          </button>
                        ) : null}
                        {!canRemove ? (
                          <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "resolved")} className={cn(buttonSecondary, "h-9 sm:h-8")}>
                            Resolve
                          </button>
                        ) : null}
                        <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "dismissed")} className={cn(buttonSecondary, "h-9 border-transparent shadow-none sm:h-8")}>
                          Dismiss
                        </button>
                      </div>
                    ) : null}
                    {authorAbove && tab === "open" ? <p className="mt-2 text-[12px] text-[#9ca3af]">Written by somebody ranked at or above you: an owner or admin decides.</p> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className={cn(card, "overflow-hidden")} aria-busy={loading || undefined} data-audit="">
          {!audit || audit.rows.length === 0 ? (
            loading ? <p className="px-6 py-10 text-center text-[13.5px] text-[#6b7280]">Loading</p> : <Empty title="Nothing logged yet." />
          ) : (
            <ul className="divide-y divide-[#f1f2f4]">
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
          )}
        </section>
      )}

      {(tab === "audit" ? audit?.next : reports.next) ? (
        <div className="flex justify-center">
          <button type="button" disabled={loading} onClick={() => (tab === "audit" ? void loadAudit(audit?.next) : void loadReports(tab, reports.next))} className={cn(buttonSecondary, "h-10 px-5")}>
            {loading ? "Loading" : "Show more"}
          </button>
        </div>
      ) : null}
      {!head.can.moderate_content ? <Notice tone="info">Your role can review reports but not remove content.</Notice> : null}

      <Confirm
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "ban" ? `Ban ${confirm.report.subject?.name ?? "them"}?` : `Remove this ${confirm ? TARGET[confirm.report.targetType].toLowerCase() : "content"}?`}
        detail={confirm?.kind === "ban" ? "They lose access and cannot join again unless you unban them." : "Members stop seeing it, and every open report about it is closed."}
        action={confirm?.kind === "ban" ? "Ban" : "Remove"}
        danger
        reason
        busy={busy !== null}
        onConfirm={(reason) => confirm && (confirm.kind === "ban" ? void ban(confirm.report, reason) : void removeContent(confirm.report, reason))}
      />
    </div>
  )
}
