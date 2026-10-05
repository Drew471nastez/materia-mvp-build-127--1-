"use client"

/**
 * ===========================================================================
 *  A POLL IN A POST (round 12)
 * ===========================================================================
 * Before answering a member sees the choices; after, each choice's share of
 * the real votes as a quiet bar behind its label (it grows from the left on
 * the compositor), its count, and theirs marked with a check.
 *
 *   ONE ANSWER    answers on the press, drawn at once (the counts move with
 *                 it) and then put right by the server's own numbers; a
 *                 press on another choice changes the vote, a press on the
 *                 same one takes it back.
 *   MORE THAN ONE the choices are ticked, then Vote; once voted, "Change
 *                 vote" brings the ticks back with the member's answers in
 *                 them, and Vote again replaces the answer.
 *
 * A refusal puts the poll back as the server last had it and says why. A
 * closed poll only shows the results.
 */
import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import type { PollView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY } from "./ui"

/** The poll as it will be once these choices are the member's answer, before the server says so. */
export function withAnswer(poll: PollView, ids: string[]): PollView {
  const want = new Set(ids)
  const options = poll.options.map((o) => {
    const on = want.has(o.id)
    return { ...o, voted: on, voteCount: Math.max(0, o.voteCount - (o.voted ? 1 : 0) + (on ? 1 : 0)) }
  })
  return { ...poll, options, totalVotes: options.reduce((n, o) => n + o.voteCount, 0) }
}

export function PollBlock({ poll, communityId, canVote, onChange }: { poll: PollView; communityId: string; canVote: boolean; onChange: (p: PollView) => void }) {
  /* What is drawn: the post's poll, or the member's answer while it is on its way. */
  const [view, setView] = useState(poll)
  const sure = useRef(poll)
  useEffect(() => {
    setView(poll)
    sure.current = poll
  }, [poll])
  const voted = view.options.some((o) => o.voted)
  const [choosing, setChoosing] = useState(false)
  const [picked, setPicked] = useState<string[]>(() => poll.options.filter((o) => o.voted).map((o) => o.id))
  const [busy, setBusy] = useState(false)
  const ask = useRef(0)
  const live = !view.closed && canVote
  const showResults = live ? (view.multiple ? voted && !choosing : voted) : true

  const send = async (ids: string[]) => {
    const n = ++ask.current
    setView(withAnswer(sure.current, ids))
    setBusy(true)
    const r = await api<{ poll: PollView }>(`${apiBase(communityId)}/polls/${poll.id}/vote`, { body: { optionIds: ids } })
    if (n !== ask.current) return
    setBusy(false)
    if (!r.ok) {
      setView(sure.current)
      return toast(r.error)
    }
    sure.current = r.data.poll
    setView(r.data.poll)
    setPicked(r.data.poll.options.filter((o) => o.voted).map((o) => o.id))
    onChange(r.data.poll)
  }

  const press = (id: string) => {
    if (!live) return
    if (view.multiple) {
      if (showResults) return
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
      return
    }
    const mine = view.options.find((o) => o.voted)?.id
    void send(mine === id ? [] : [id])
  }

  const ending = view.closed ? "Closed" : view.closesAt ? `Ends ${new Date(view.closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : null
  return (
    <div className="mt-3 rounded-xl border border-[#e6e8eb] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-poll="" data-poll-state={showResults ? "results" : "choosing"}>
      <p className="text-[15px] font-semibold leading-snug text-[#1a1a2e]">{view.question}</p>
      <div className="mt-3 space-y-2" role={view.multiple && !showResults ? "group" : undefined}>
        {view.options.map((o) => {
          const share = view.totalVotes > 0 ? o.voteCount / view.totalVotes : 0
          const ticked = view.multiple && !showResults ? picked.includes(o.id) : o.voted
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => press(o.id)}
              disabled={!live || (view.multiple && showResults)}
              aria-pressed={ticked}
              className={`relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-[10px] border px-3 text-left text-[14px] outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:bg-[#f6f7f8] active:duration-0 disabled:cursor-default disabled:active:bg-transparent motion-reduce:transition-none ${
                ticked ? "border-[#1a1a2e]/55" : "border-[#e3e5e9] enabled:hover:border-[#c9ccd3]"
              }`}
              data-poll-option={o.id}
              data-poll-voted={o.voted ? "" : undefined}
            >
              {/* The share: a bar grown by scale from the left (the compositor's), there only with the results. */}
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-full origin-left transition-[scale,opacity] duration-300 ease-out motion-reduce:transition-none ${o.voted ? "bg-[#e9ebef]" : "bg-[#f1f2f4]"} ${showResults ? "opacity-100" : "opacity-0"}`}
                style={{ scale: `${showResults ? share : 0} 1` }}
                data-poll-bar=""
              />
              <span className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors duration-150 motion-reduce:transition-none ${view.multiple ? "rounded-[5px]" : "rounded-full"} ${ticked ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#c9ccd3] bg-white"}`}>
                {ticked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className="relative min-w-0 flex-1 py-2 font-medium text-[#1a1a2e]">{o.label}</span>
              {showResults ? (
                <span className="relative shrink-0 tabular-nums text-[13px] text-[#6b7280]" data-poll-share="">
                  {Math.round(share * 100)}%
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-[#6b7280]">
        <span data-poll-total="">
          {view.totalVotes} {view.totalVotes === 1 ? "vote" : "votes"}
          {ending ? ` · ${ending}` : ""}
          {view.multiple && !view.closed ? " · Choose any" : ""}
        </span>
        {view.multiple && live ? (
          showResults ? (
            <button type="button" className={`${BTN_GHOST} -mr-2 text-[13.5px]`} disabled={busy} onClick={() => (setPicked(view.options.filter((o) => o.voted).map((o) => o.id)), setChoosing(true))} data-poll-change="">
              Change vote
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              {voted ? (
                <button type="button" className={`${BTN_GHOST} text-[13.5px]`} onClick={() => setChoosing(false)}>
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || picked.length === 0}
                onClick={() => {
                  setChoosing(false)
                  void send(picked)
                }}
                data-poll-vote=""
              >
                Vote
              </button>
            </span>
          )
        ) : null}
        {!view.multiple && live && voted ? <span className="text-[12.5px] text-[#9ca3af]">Tap another choice to change your vote</span> : null}
      </div>
    </div>
  )
}
