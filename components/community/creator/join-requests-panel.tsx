"use client"

/**
 * ===========================================================================
 *  REQUESTS, WITH WHAT PEOPLE ANSWERED (round 32), Members
 * ===========================================================================
 * The approval queue: everybody waiting, newest first, each with their
 * picture and name (and email, for the owner and admins), when they asked,
 * their note, and their answers to the questions before joining, question
 * over answer. Approve lets them in (or lets them pay, for a paid tier);
 * Decline asks first. Approve all, when more than one is waiting, asks
 * once and goes through them one by one, saying how far it got. Download
 * answers is every answer kept, as CSV (the owner and admins).
 *
 * Approving and declining are Members' own actions (PATCH members/<userId>
 * { action: approve | reject }), so the audit log, the notice and the email
 * to the person are the same as from the Members list.
 *
 * Mounted by Members above the list while there are requests, or as the
 * Requests view: <JoinRequestsPanel head={head} />. It loads its own rows
 * (GET join-requests) and draws nothing when nobody is waiting and the
 * community does not ask for approval.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { answerText, type JoinAnswer, type JoinQuestion } from "@/lib/communities/join-questions"
import { relativeTime } from "@/lib/communities/format"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import type { CommunityHead } from "./view-types"
import { APPROVE_MANY } from "./logic"
import { Confirm, Empty, ListLoading, Notice, Section, buttonPrimary, buttonSecondary, errorText, send, useToast } from "./parts"

interface RequestRow {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  requestedAt: string | null
  note: string | null
  approved: boolean
  answers: JoinAnswer[]
}

interface Loaded {
  rows: RequestRow[]
  total: number
  questions: JoinQuestion[]
  ready: boolean
  approvalRequired: boolean
  canExport: boolean
}

export function JoinRequestsPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const router = useRouter()
  const [data, setData] = React.useState<Loaded | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [working, setWorking] = React.useState<string | null>(null)
  const [declining, setDeclining] = React.useState<RequestRow | null>(null)
  const [asking, setAll] = React.useState(false)
  const [progress, setProgress] = React.useState<{ done: number; of: number } | null>(null)

  const load = React.useCallback(async () => {
    const res = await send<Loaded>(`/api/app/community/${head.id}/join-requests`, "GET")
    if (!res.ok) return setLoadError(errorText(res.data.error, tt("The requests did not load. Refresh the page.")))
    setLoadError(null)
    setData(res.data)
  }, [head.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const act = async (row: RequestRow, action: "approve" | "reject"): Promise<boolean> => {
    const res = await send(`/api/app/community/${head.id}/members/${row.userId}`, "PATCH", { action })
    if (!res.ok) {
      toast(errorText(res.data.error))
      return false
    }
    setData((d) => (d ? { ...d, rows: d.rows.filter((r) => r.userId !== row.userId), total: Math.max(0, d.total - 1) } : d))
    return true
  }

  const one = async (row: RequestRow, action: "approve" | "reject") => {
    setWorking(row.userId)
    const ok = await act(row, action)
    setWorking(null)
    setDeclining(null)
    if (ok) {
      toast(action === "approve" ? tt("Approved") : tt("Declined"))
      router.refresh()
    }
  }

  /*
    APPROVE ALL, IN ONE REQUEST (up to APPROVE_MANY at a time; a longer queue in parts). It was one PATCH per person, in
    turn: a queue of 200 was 200 round trips. The server approves each one exactly as the PATCH does (its permission,
    the rank check, the audit line), and says which it could not.
  */
  const approveAll = async () => {
    const list = (data?.rows ?? []).filter((r) => !r.approved)
    setAll(false)
    setProgress({ done: 0, of: list.length })
    let done = 0
    let problem: string | null = null
    for (let i = 0; i < list.length && !problem; i += APPROVE_MANY) {
      const part = list.slice(i, i + APPROVE_MANY).map((r) => r.userId)
      const res = await send<{ approved?: string[]; failed?: { userId: string; error: string }[] }>(`/api/app/community/${head.id}/join-requests`, "POST", { action: "approve", userIds: part })
      if (!res.ok) {
        problem = errorText(res.data.error)
        break
      }
      const approved = new Set(res.data.approved ?? [])
      done += approved.size
      setData((d) => (d ? { ...d, rows: d.rows.filter((r) => !approved.has(r.userId)), total: Math.max(0, d.total - approved.size) } : d))
      setProgress({ done, of: list.length })
      if (res.data.failed?.length) problem = errorText(res.data.failed[0].error)
    }
    setProgress(null)
    const said = tt("{n, plural, one {# request approved} other {# requests approved}}", { n: done })
    toast(problem ? `${said}. ${problem}` : said)
    router.refresh()
    void load()
  }

  if (loadError) return <Notice>{loadError}</Notice>
  if (!data) return <ListLoading />
  if (!data.rows.length && !data.approvalRequired) return null

  const waiting = data.rows.filter((r) => !r.approved).length
  const exportable = data.canExport && data.ready
  const all = waiting > 1 && head.can.approve_member
  const actions =
    exportable || all ? (
      <>
        {exportable ? (
          <a href={`/api/app/community/${head.id}/join-requests?format=csv`} className={buttonSecondary} data-join-answers-export="">
            {tt("Download answers")}
          </a>
        ) : null}
        {all ? (
          <button type="button" onClick={() => setAll(true)} disabled={!!progress} className={buttonPrimary} data-join-approve-all="">
            {progress ? tt("Approving {done} of {of}", progress) : tt("Approve all")}
          </button>
        ) : null}
      </>
    ) : null
  return (
    <Section
      title={tt("Requests")}
      hint={data.total ? tt("{n, plural, one {# person is waiting} other {# people are waiting}} for you to approve them.", { n: data.total }) : tt("Nobody is waiting. New requests show here.")}
      action={actions ? <div className="hidden items-center gap-2 sm:flex">{actions}</div> : null}
    >
      {/* On a phone the actions sit under the heading, where they have the width; beside it they squeezed it to a word a line. */}
      {actions ? <div className="-mt-1 mb-3 flex flex-wrap gap-2 sm:hidden [&>*]:flex-1">{actions}</div> : null}
      {data.rows.length === 0 ? (
        <Empty title={tt("No requests")} detail={tt("When somebody asks to join, they show here with their answers.")} />
      ) : (
        <ul className="-my-1 divide-y divide-[#f1f2f4]" data-join-requests="">
          {data.rows.map((r) => (
            <li key={r.userId} className="py-3.5" data-join-request={r.userId}>
              <div className="flex items-start gap-3">
                <MemberAvatar src={r.avatarUrl ?? undefined} name={r.name} size={36} className="h-9 w-9 shrink-0 rounded-full" lazy />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{r.name}</span>
                    {r.username ? <span className="truncate text-[13px] text-[#8a8f98]">@{r.username}</span> : null}
                    {r.requestedAt ? <span className="text-[12.5px] text-[#8a8f98]">{relativeTime(r.requestedAt)}</span> : null}
                  </div>
                  {r.email ? <p className="truncate text-[13px] text-[#6b7280]">{r.email}</p> : null}
                  {r.approved ? <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Approved, waiting for payment")}</p> : null}
                  {r.note ? <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-snug text-[#374151] [overflow-wrap:anywhere]">{r.note}</p> : null}
                  {r.answers.length ? (
                    <dl className="mt-2.5 space-y-2 border-l-2 border-[#eceef1] pl-3" data-join-request-answers="">
                      {r.answers.map((a) => (
                        <div key={a.id}>
                          <dt className="text-[12.5px] leading-snug text-[#6b7280]">{a.label}</dt>
                          <dd className="whitespace-pre-wrap text-[14px] leading-snug text-[#1a1a2e] [overflow-wrap:anywhere]">{answerText(a)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : data.questions.length && !r.approved ? (
                    <p className="mt-1.5 text-[13px] text-[#8a8f98]">{tt("Asked before the questions were added.")}</p>
                  ) : null}
                  {!r.approved ? (
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={working === r.userId || !!progress} onClick={() => void one(r, "approve")} className={cn(buttonPrimary, "max-sm:flex-1")} data-join-request-approve="">
                        {working === r.userId ? tt("Working") : tt("Approve")}
                      </button>
                      <button type="button" disabled={working === r.userId || !!progress} onClick={() => setDeclining(r)} className={cn(buttonSecondary, "max-sm:flex-1")} data-join-request-decline="">
                        {tt("Decline")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.total > data.rows.length ? <p className="mt-3 text-[12.5px] text-[#6b7280]">{tt("Showing the newest {shown} of {total}.", { shown: data.rows.length, total: data.total })}</p> : null}

      <Confirm
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={tt("Decline {name}?", { name: declining?.name ?? "" })}
        detail={tt("Their request is closed. They can ask again later.")}
        action={tt("Decline")}
        danger
        busy={!!declining && working === declining.userId}
        onConfirm={() => declining && void one(declining, "reject")}
      />
      <Confirm
        open={asking}
        onClose={() => setAll(false)}
        title={tt("Approve {n, plural, one {# request} other {# requests}}?", { n: waiting })}
        detail={tt("Everyone waiting is let in, or let through to pay for a paid tier. Each one is told.")}
        action={tt("Approve all")}
        onConfirm={() => void approveAll()}
      />
    </Section>
  )
}
