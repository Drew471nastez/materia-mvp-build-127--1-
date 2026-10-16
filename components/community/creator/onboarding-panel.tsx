"use client"

/**
 * ===========================================================================
 *  FIRST STEPS AND THE WELCOME MESSAGE (round 32), Settings › Features
 * ===========================================================================
 * Two things a new member gets, under the Welcome card Settings already has:
 *
 *   FIRST STEPS   a short list above the feed for a member's first 30 days
 *                 (components/community/member/get-started.tsx). The steps
 *                 chosen, in order, each with its words (empty: the step's
 *                 own); Add step offers the ones not on the list yet and a
 *                 step of your own with a link. A step a member does anyway
 *                 ticks itself.
 *   WELCOME       a direct message from the owner to each new member, once,
 *   MESSAGE       {name} becoming their first name. It needs Chat on (and
 *                 member messages, part 83); the panel says so when it is
 *                 not.
 *
 * One /app save bar for both (PUT onboarding). Mounted by Settings ›
 * Features after the Welcome section: <OnboardingPanel head={head} />. It
 * reads and writes its own data (app/api/app/community/[id]/onboarding).
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { DM_BODY_MAX, STEPS_MAX, STEP_KINDS, STEP_LABEL_MAX, STEP_URL_MAX, type ChecklistStep, type OnboardingConfig, type StepKind } from "@/lib/communities/onboarding-checklist"
import type { CommunityHead } from "./view-types"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { EditorFoot, ListLoading, Notice, RemoveButton, Section, Toggle, buttonSecondary, errorText, field, send, useToast } from "./parts"

/** The step's own words in the creator's language, shown as the placeholder and in Add step. */
function kindLabel(kind: StepKind): string {
  switch (kind) {
    case "intro":
      return tt("Introduce yourself")
    case "profile":
      return tt("Add a line about yourself")
    case "rules":
      return tt("Read the rules")
    case "comment":
      return tt("Comment on a post")
    case "learn":
      return tt("Start a program")
    case "event":
      return tt("RSVP to an event")
    default:
      return tt("A step of your own")
  }
}

/** How the step is ticked, under it. */
function kindHint(kind: StepKind): string {
  switch (kind) {
    case "intro":
      return tt("Done when they post. Opens Introductions when you have that space.")
    case "profile":
      return tt("Done when they add a line about themselves to their profile.")
    case "rules":
      return tt("Done when they open the rules.")
    case "comment":
      return tt("Done when they comment.")
    case "learn":
      return tt("Done when they finish a lesson.")
    case "event":
      return tt("Done when they RSVP.")
    default:
      return tt("Done when they open the link, or tick it.")
  }
}

interface Draft extends ChecklistStep {
  key: string
}

let keys = 0
const keyOf = () => `s${++keys}`
const toSend = (steps: Draft[], dmEnabled: boolean, dmBody: string) => ({ steps: steps.map(({ id, kind, label, url }) => ({ id, kind, label, url })), dmEnabled, dmBody })

export function OnboardingPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const [ready, setReady] = React.useState<boolean | null>(null)
  const [messages, setMessages] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [steps, setSteps] = React.useState<Draft[]>([])
  const [dmEnabled, setDmEnabled] = React.useState(false)
  const [dmBody, setDmBody] = React.useState("")
  const [saved, setSaved] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [badIndex, setBadIndex] = React.useState<number | null>(null)

  const take = React.useCallback((c: OnboardingConfig) => {
    const ds = c.steps.map((s) => ({ ...s, key: keyOf() }))
    setSteps(ds)
    setDmEnabled(c.dmEnabled)
    setDmBody(c.dmBody)
    setSaved(JSON.stringify(toSend(ds, c.dmEnabled, c.dmBody)))
  }, [])

  React.useEffect(() => {
    let live = true
    void send<{ ready: boolean; config: OnboardingConfig; messages: boolean }>(`/api/app/community/${head.id}/onboarding`, "GET").then((res) => {
      if (!live) return
      if (!res.ok) return setLoadError(errorText(res.data.error, tt("This did not load. Refresh the page.")))
      setReady(res.data.ready !== false)
      setMessages(res.data.messages !== false)
      take(res.data.config ?? { steps: [], dmEnabled: false, dmBody: "" })
    })
    return () => {
      live = false
    }
  }, [head.id, take])

  const now = JSON.stringify(toSend(steps, dmEnabled, dmBody))
  const dirty = ready === true && now !== saved
  const set = (i: number, patch: Partial<Draft>) => setSteps((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, by: -1 | 1) =>
    setSteps((l) => {
      const j = i + by
      if (j < 0 || j >= l.length) return l
      const next = [...l]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const add = (kind: StepKind) => setSteps((l) => (l.length >= STEPS_MAX ? l : [...l, { id: kind === "custom" ? "" : kind, kind, label: "", url: "", key: keyOf() }]))
  const missing = STEP_KINDS.filter((k) => k === "custom" || !steps.some((s) => s.kind === k))

  const save = async () => {
    setBusy(true)
    setError(null)
    setBadIndex(null)
    const res = await send<{ config: OnboardingConfig; index?: number }>(`/api/app/community/${head.id}/onboarding`, "PUT", toSend(steps, dmEnabled, dmBody))
    setBusy(false)
    if (!res.ok) {
      setBadIndex(typeof res.data.index === "number" ? res.data.index : null)
      return setError(res.data.error === "not_ready" ? tt("First steps need the database update (run-now part 193).") : errorText(res.data.error))
    }
    take(res.data.config)
    toast(tt("Saved"))
  }

  if (loadError) return <Notice>{loadError}</Notice>
  if (ready === null) return <ListLoading />
  if (!ready) return <Notice tone="warn">{tt("First steps and the welcome message need the database update (run-now part 193).")}</Notice>

  return (
    <div className="space-y-4" data-onboarding-panel="">
      <Section title={tt("First steps")} hint={tt("A short list new members see above the feed for their first 30 days, until they finish it or hide it.")}>
        {steps.length === 0 ? <p className="text-[13.5px] text-[#6b7280]">{tt("No steps. New members see the feed straight away.")}</p> : null}
        <ol className="-my-1 divide-y divide-[#f1f2f4]">
          {steps.map((s, i) => (
            <li key={s.key} className={cn("py-3 first:pt-1", badIndex === i && "-mx-2 rounded-lg bg-[#fef7f6] px-2")} data-onboarding-step={s.kind}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-medium text-[#6b7280]"><span className="tabular-nums">{i + 1}.</span> {kindLabel(s.kind)}</span>
                <div className="-mr-2 flex shrink-0 items-center">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tt("Move step {value} up", { value: i + 1 })} className="grid h-10 w-10 place-items-center rounded-lg text-[#9ca3af] outline-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] disabled:opacity-35 disabled:hover:bg-transparent sm:h-8 sm:w-8">
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={tt("Move step {value} down", { value: i + 1 })} className="grid h-10 w-10 place-items-center rounded-lg text-[#9ca3af] outline-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] disabled:opacity-35 disabled:hover:bg-transparent sm:h-8 sm:w-8">
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </button>
                  <RemoveButton label={tt("Remove step {value}", { value: i + 1 })} onClick={() => setSteps((l) => l.filter((_, j) => j !== i))} />
                </div>
              </div>
              <div className="mt-1 space-y-2">
                <input
                  value={s.label}
                  onChange={(e) => set(i, { label: e.target.value.slice(0, STEP_LABEL_MAX) })}
                  placeholder={s.kind === "custom" ? tt("What should they do?") : kindLabel(s.kind)}
                  aria-label={tt("Step {value}", { value: i + 1 })}
                  className={cn(field, "h-11 sm:h-10")}
                />
                {s.kind === "custom" ? (
                  <input
                    value={s.url}
                    onChange={(e) => set(i, { url: e.target.value.slice(0, STEP_URL_MAX) })}
                    placeholder={tt("Link (optional), https://")}
                    aria-label={tt("Link for step {value}", { value: i + 1 })}
                    inputMode="url"
                    className={cn(field, "h-11 sm:h-9")}
                  />
                ) : null}
                <p className="text-[12.5px] leading-snug text-[#6b7280]">{kindHint(s.kind)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={cn("flex flex-wrap items-center gap-3", steps.length ? "mt-3 border-t border-[#f1f2f4] pt-3" : "mt-3")}>
          {steps.length < STEPS_MAX ? (
            <ResponsiveActionMenu
              align="start"
              title={tt("Add step")}
              items={missing.map((k) => ({ label: kindLabel(k), onClick: () => add(k), separatorBefore: k === "custom" && missing.length > 1 }))}
              trigger={
                <button type="button" className={buttonSecondary} data-onboarding-add="">
                  <Plus aria-hidden className="mr-1 h-4 w-4" />
                  {tt("Add step")}
                </button>
              }
            />
          ) : (
            <span className="text-[12.5px] text-[#6b7280]">{tt("Up to {value} steps.", { value: STEPS_MAX })}</span>
          )}
        </div>
      </Section>

      <Section title={tt("Welcome message")} hint={tt("Sent to each new member once, as a direct message from you.")}>
        {!messages ? <div className="mb-3"><Notice tone="warn">{tt("Turn on Chat under Sections to send it. Until then nobody gets it.")}</Notice></div> : null}
        <Toggle checked={dmEnabled} onChange={setDmEnabled} title={tt("Send a welcome message")} />
        {dmEnabled ? (
          <div className="mt-2">
            <textarea
              value={dmBody}
              onChange={(e) => setDmBody(e.target.value.slice(0, DM_BODY_MAX))}
              rows={4}
              placeholder={tt("Hi {token}, glad you joined. Tell us what you are working on.", { token: "{name}" })}
              aria-label={tt("Welcome message")}
              className={cn(field, "resize-y py-2.5 leading-relaxed")}
              data-onboarding-dm=""
            />
            <p className="mt-1 text-[12.5px] text-[#6b7280]">{tt("{token} becomes their first name.", { token: "{name}" })}</p>
          </div>
        ) : null}
      </Section>

      <EditorFoot dirty={dirty} busy={busy} error={error} onSave={() => void save()} onCancel={() => { const c = JSON.parse(saved) as OnboardingConfig; take(c); setError(null); setBadIndex(null) }} />
    </div>
  )
}
