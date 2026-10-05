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
import { hapticTap } from "@/lib/native-bridge"
import { api, apiBase } from "./api"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY } from "./ui"

const SINGLE_BAR_MS = 720
const MULTI_BAR_MS = 380
const BAR_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/** Whether a poll is small enough to sit inline in a feed card (not only a line of meta). */
export function pollFitsInline(poll: PollView): boolean {
  if (poll.options.length > 4) return false
  if (poll.question.length > 80) return false
  if (poll.options.some((o) => o.label.length > 48)) return false
  return poll.options.length * 48 + poll.question.length < 220
}

function hapticPollVote(multiple: boolean): void {
  if (multiple) {
    hapticTap("light")
    return
  }
  hapticTap("medium")
  window.setTimeout(() => hapticTap("soft"), 130)
}

/** The poll as it will be once these choices are the member's answer, before the server says so. */
export function withAnswer(poll: PollView, ids: string[]): PollView {
  const want = new Set(ids)
  const options = poll.options.map((o) => {
    const on = want.has(o.id)
    return { ...o, voted: on, voteCount: Math.max(0, o.voteCount - (o.voted ? 1 : 0) + (on ? 1 : 0)) }
  })
  return { ...poll, options, totalVotes: options.reduce((n, o) => n + o.voteCount, 0) }
}

export function PollBlock({
  poll,
  communityId,
  canVote,
  onChange,
  embed = false,
}: {
  poll: PollView
  communityId: string
  canVote: boolean
  onChange: (p: PollView) => void
  /** Inline in a feed card: a little tighter, no extra shrink in the opened post. */
  embed?: boolean
}) {
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
  const barMs = view.multiple ? MULTI_BAR_MS : SINGLE_BAR_MS

  const send = async (ids: string[], fromPress = false) => {
    const n = ++ask.current
    if (fromPress) hapticPollVote(view.multiple)
    setView(withAnswer(sure.current, ids))
    setBusy(true)
    const r = await api<{ poll: PollView }>(`${apiBase(communityId)}/polls/${poll.id}/vote`, { body: { optionIds: ids } })
    if (n !== ask.current) return
    setBusy(false)
    if (r.ok === false) {
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
      hapticTap("soft")
      return
    }
    const mine = view.options.find((o) => o.voted)?.id
    void send(mine === id ? [] : [id], true)
  }

  const ending = view.closed ? "Closed" : view.closesAt ? `Ends ${new Date(view.closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : null
  return (
    <div
      className={`${embed ? "mt-2.5 rounded-[10px] border border-[#eceef1] bg-[#fafbfc] p-3 shadow-none" : "mt-3 rounded-xl border border-[#e6e8eb] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"} ${embed ? "" : ""}`}
      data-poll=""
      data-poll-embed={embed ? "" : undefined}
      data-poll-state={showResults ? "results" : "choosing"}
      onClick={embed ? (e) => e.stopPropagation() : undefined}
      onPointerDown={embed ? (e) => e.stopPropagation() : undefined}
    >
      <p className={`font-semibold leading-snug text-[#1a1a2e] ${embed ? "text-[14px]" : "text-[15px]"}`}>{view.question}</p>
      <div className={`space-y-2 ${embed ? "mt-2" : "mt-3"}`} role={view.multiple && !showResults ? "group" : undefined}>
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
              className={`relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-[10px] border px-3 text-left outline-none transition-[border-color,background-color,scale] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:scale-[0.99] active:bg-[#f6f7f8] active:duration-75 disabled:cursor-default disabled:active:scale-100 disabled:active:bg-transparent motion-reduce:transition-none motion-reduce:active:scale-100 ${
                ticked ? "border-[#1a1a2e]/55 bg-white/80" : "border-[#e3e5e9] bg-white enabled:hover:border-[#c9ccd3]"
              }`}
              data-poll-option={o.id}
              data-poll-voted={o.voted ? "" : undefined}
            >
              {/* The share: a bar grown by scale from the left (the compositor's), there only with the results. */}
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-full origin-left motion-reduce:transition-none ${o.voted ? "bg-[#e9ebef]" : "bg-[#f1f2f4]"} ${showResults ? "opacity-100" : "opacity-0"}`}
                style={{
                  scale: `${showResults ? share : 0} 1`,
                  transition: showResults ? `scale ${barMs}ms ${BAR_EASE}` : undefined,
                }}
                data-poll-bar=""
              />
              <span
                className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-[border-color,background-color,scale] duration-200 motion-reduce:transition-none ${view.multiple ? "rounded-[5px]" : "rounded-full"} ${ticked ? "scale-100 border-[#1a1a2e] bg-[#1a1a2e] text-white" : "scale-100 border-[#c9ccd3] bg-white"}`}
              >
                {ticked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className={`relative min-w-0 flex-1 py-2 font-medium text-[#1a1a2e] ${embed ? "text-[13.5px]" : "text-[14px]"}`}>{o.label}</span>
              {showResults ? (
                <span className="relative shrink-0 tabular-nums text-[13px] text-[#6b7280]" data-poll-share="">
                  {Math.round(share * 100)}%
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className={`flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-[#6b7280] ${embed ? "mt-2" : "mt-3"}`}>
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
                  void send(picked, true)
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
