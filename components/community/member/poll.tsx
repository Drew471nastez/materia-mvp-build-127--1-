"use client"

/**
 * A poll in a post. Before answering a member sees the choices; after, each
 * choice's share of the real votes as a quiet grey bar behind its label, and
 * theirs marked. A single choice poll answers on the press (and the same
 * press again takes the answer back); a multiple choice one is ticked and
 * then sent. A closed poll only shows the results.
 */
import { useState } from "react"
import { Check } from "lucide-react"
import type { PollView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { toast } from "./toast"
import { BTN_SECONDARY } from "./ui"

export function PollBlock({ poll, communityId, canVote, onChange }: { poll: PollView; communityId: string; canVote: boolean; onChange: (p: PollView) => void }) {
  const voted = poll.options.some((o) => o.voted)
  const [picked, setPicked] = useState<string[]>(() => poll.options.filter((o) => o.voted).map((o) => o.id))
  const [busy, setBusy] = useState(false)
  const showResults = voted || poll.closed || !canVote

  const send = async (ids: string[]) => {
    setBusy(true)
    const r = await api<{ poll: PollView }>(`${apiBase(communityId)}/polls/${poll.id}/vote`, { body: { optionIds: ids } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    setPicked(r.data.poll.options.filter((o) => o.voted).map((o) => o.id))
    onChange(r.data.poll)
  }

  const press = (id: string) => {
    if (busy || poll.closed || !canVote) return
    if (poll.multiple) {
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
      return
    }
    const mine = poll.options.find((o) => o.voted)?.id
    void send(mine === id ? [] : [id])
  }

  return (
    <div className="mt-3 rounded-xl border border-[#e8e9ec] p-3.5" data-poll="">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{poll.question}</p>
      <div className="mt-3 space-y-2">
        {poll.options.map((o) => {
          const share = poll.totalVotes > 0 ? Math.round((o.voteCount / poll.totalVotes) * 100) : 0
          const ticked = poll.multiple && !showResults ? picked.includes(o.id) : o.voted
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => press(o.id)}
              disabled={busy || poll.closed || !canVote}
              aria-pressed={ticked}
              className={`relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-[10px] border px-3 text-left text-[14px] transition-colors disabled:cursor-default ${
                ticked ? "border-[#1a1a2e]/60" : "border-[#e3e4e8] hover:border-[#c9ccd3]"
              }`}
            >
              {showResults ? <span aria-hidden className="absolute inset-y-0 left-0 bg-[#eef0f3]" style={{ width: `${share}%` }} /> : null}
              <span className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center ${poll.multiple ? "rounded-[5px]" : "rounded-full"} border ${ticked ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#c9ccd3] bg-white"}`}>
                {ticked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className="relative min-w-0 flex-1 py-2 font-medium text-[#1a1a2e]">{o.label}</span>
              {showResults ? <span className="relative tabular-nums text-[13px] text-[#6b7280]">{share}%</span> : null}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-[#6b7280]">
        <span>
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
          {poll.closed ? " · Closed" : poll.closesAt ? ` · Closes ${new Date(poll.closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
          {poll.multiple && !poll.closed ? " · Choose any" : ""}
        </span>
        {poll.multiple && canVote && !poll.closed && !showResults ? (
          <button type="button" className={BTN_SECONDARY} disabled={busy || picked.length === 0} onClick={() => send(picked)}>
            Vote
          </button>
        ) : null}
        {poll.multiple && canVote && !poll.closed && voted ? (
          <button type="button" className="h-10 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]" disabled={busy} onClick={() => send([])}>
            Change answer
          </button>
        ) : null}
      </div>
    </div>
  )
}
