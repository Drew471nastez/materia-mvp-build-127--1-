"use client"

/**
 * ONE MEMBER'S PAGE in this community: face, name, role, level and points
 * (when the community counts points), the bio they wrote here, their badges,
 * and their latest posts the viewer may see. Their own page lets them edit
 * the bio and choose what they hear about. Nobody's email or payments, ever.
 */
import Link from "next/link"
import { useState } from "react"
import { ArrowUpRight, Flag } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { relativeTime } from "@/lib/communities/format"
import type { ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { ReportDialog, type ReportTargetRef } from "./dialogs"
import { openMessages } from "./messages"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, CARD, FIELD } from "./ui"
import { roleTag, type MemberProfileView } from "./view-types"

export function MemberProfile({ communityId, slug, member, viewer, gamification, canMessage = false }: { communityId: string; slug: string; member: MemberProfileView; viewer: ViewerView; gamification: boolean; canMessage?: boolean }) {
  const [bio, setBio] = useState(member.bio ?? "")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(bio)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const tag = roleTag(member.role)

  const save = async () => {
    setBusy(true)
    const r = await api(`${apiBase(communityId)}/me`, { method: "PATCH", body: { bio: draft } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    setBio(draft.trim())
    setEditing(false)
    toast("Saved")
  }

  return (
    <div className="max-w-[680px] space-y-3 pb-16 pt-2 lg:pt-6" data-member-profile="">
      <section className={`${CARD} p-5 sm:p-6`}>
        <div className="flex items-start gap-4">
          <AppAvatar src={member.avatarUrl} name={member.name} alt="" size={72} markWhileLoading />
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[21px] font-bold text-[#1a1a2e]">{member.name}</h1>
              {tag ? <span className="rounded-md bg-[#f1f2f4] px-1.5 text-[12px] font-medium leading-5 text-[#4b5563]">{tag}</span> : null}
            </div>
            <p className="mt-0.5 text-[13.5px] text-[#6b7280]">
              {member.username ? `@${member.username} · ` : ""}
              {member.joinedAt ? <span suppressHydrationWarning>Joined {new Date(member.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span> : "Member"}
            </p>
          </div>
        </div>

        {editing ? (
          <div className="mt-4">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={280} rows={3} placeholder="A line about you, for this community" className={`${FIELD} resize-none`} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[12.5px] tabular-nums text-[#9ca3af]">{draft.length}/280</span>
              <span className="flex gap-1.5">
                <button type="button" className={BTN_GHOST} onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy}>
                  {busy ? "Saving..." : "Save"}
                </button>
              </span>
            </div>
          </div>
        ) : bio ? (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#262633]">{bio}</p>
        ) : member.isSelf ? (
          <p className="mt-4 text-[14px] text-[#8a8f98]">Add a line so people know who you are.</p>
        ) : null}

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-[#f0f1f3] pt-4 text-center">
          <div>
            <dt className="text-[12px] text-[#8a8f98]">Posts</dt>
            <dd className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{member.posts}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-[#8a8f98]">Level</dt>
            <dd className="truncate text-[17px] font-semibold text-[#1a1a2e]">
              {member.level}
              {member.levelName ? <span className="ml-1 text-[13px] font-medium text-[#6b7280]">{member.levelName}</span> : null}
            </dd>
          </div>
          {gamification ? (
            <div>
              <dt className="text-[12px] text-[#8a8f98]">Points</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{member.points}</dd>
            </div>
          ) : (
            <div>
              <dt className="text-[12px] text-[#8a8f98]">Badges</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{member.badges.length}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Messages, when this community has chat on and it is somebody else. */}
          {!member.isSelf && canMessage ? (
            <button type="button" className={BTN_PRIMARY} onClick={() => openMessages({ userId: member.userId })} data-member-message="">
              Message
            </button>
          ) : null}
          {member.isSelf && !editing ? (
            <button type="button" className={BTN_SECONDARY} onClick={() => (setDraft(bio), setEditing(true))}>
              {bio ? "Edit bio" : "Add a bio"}
            </button>
          ) : null}
          {member.creatorUrl ? (
            <a href={member.creatorUrl} className={BTN_SECONDARY}>
              Storelib page
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
          {!member.isSelf && viewer.can.report ? (
            <button type="button" className={BTN_GHOST} onClick={() => setReport({ type: "member", id: member.userId, what: member.name })}>
              <Flag className="h-4 w-4" aria-hidden />
              Report
            </button>
          ) : null}
        </div>
      </section>

      {member.badges.length ? (
        <section className={`${CARD} p-5`}>
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Badges</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {member.badges.map((b) => (
              <li key={b.id} title={b.description ?? undefined} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e8e9ec] px-3 text-[13.5px] font-medium text-[#1a1a2e]">
                {b.icon && !/^[a-z0-9-]+$/i.test(b.icon) ? <span aria-hidden>{b.icon}</span> : null}
                {b.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={`${CARD} p-5`}>
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Recent posts</h2>
        {member.recent.length ? (
          <ul className="mt-2 divide-y divide-[#f0f1f3]">
            {member.recent.map((p) => (
              <li key={p.id}>
                <Link href={p.url} className="flex min-h-12 items-center justify-between gap-3 py-2.5 hover:underline">
                  <span className="min-w-0 truncate text-[14.5px] text-[#1a1a2e]">{p.title}</span>
                  <span className="shrink-0 text-[12.5px] text-[#8a8f98]" suppressHydrationWarning>
                    {relativeTime(p.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-[#8a8f98]">No posts yet.</p>
        )}
      </section>
      <p className="px-1 text-[13px]">
        <Link href={`/community/${slug}/members`} className="text-[#6b7280] hover:text-[#1a1a2e]">
          All members
        </Link>
      </p>
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
