"use client"

/**
 * ===========================================================================
 *  ONE AUTOMATION, TOP TO BOTTOM
 * ===========================================================================
 * The way the serious ones are built (Shopify Flow, Klaviyo): the trigger at
 * the top, the steps under it in the order they happen, each one a node you
 * open to edit, and the rules that govern the whole thing said in words next
 * to it rather than discovered later.
 *
 *   the state      a banner under the bar says whether it is sending, to
 *                  whom, and what turning it on or off does. Turning on is
 *                  refused with the problems listed until the flow is
 *                  complete; turning off says how many people it stops.
 *   the steps      a column of nodes on the page itself (no card around a
 *                  card), joined by a line with a + between every two.
 *   editing        a panel on the right on a desktop, the shared sheet on a
 *                  phone (components/ui/bottom-sheet). With nothing open,
 *                  the panel reads the flow back: what happens and when.
 *   the numbers    per email, and the run history under the steps, straight
 *                  from the engine's records. Nothing is estimated.
 *
 * Saving is explicit and never changes on or off. The server checks every
 * field again (app/api/automations/flows/[id]).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  CONDITIONS,
  MAX_STEPS,
  TRIGGERS,
  blankStep,
  emailBefore,
  emailNumber,
  entryRule,
  entryText,
  isTriggerType,
  normalizeSteps,
  problemsOf,
  timeline,
  waitText,
  type ConditionCheck,
  type EntryRule,
  type FlowStep,
  type Problem,
  type StepType,
  type TriggerConfig,
  type TriggerType,
  type WaitUnit,
} from "@/lib/automations/flow-model"
import { joinedSentence } from "@/lib/contacts/contact-source"
import { GUTTER, LIST_WIDTH, PaneBar, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../../../orders/order-parts"
import { RUN_STATUS } from "../../contact-detail"
import { BodyEditor } from "../body-editor"
import { StepMark } from "../flow-parts"

export interface StepStats {
  sent: number
  opened: number
  clicked: number
  failed: number
}

export interface RunView {
  id: string
  email: string
  name: string | null
  status: string
  exit_reason: string | null
  started_at: string
  finished_at: string | null
  current_step_id: string | null
  source_detail: unknown
  trigger_type: string
}

export interface BuilderData {
  flow: { id: string; name: string; trigger_type: string; trigger_config: TriggerConfig | null; status: string; steps: unknown; updated_at: string }
  products: Array<{ id: string; title: string }>
  stats: Record<string, StepStats>
  runs: RunView[]
  counts: { active: number; finished: number; left: number; failed: number }
  failedJobs: number
  /** False before the engine's SQL has run: no run history exists to show. */
  tracking: boolean
  accountEmail: string | null
}

interface Draft {
  name: string
  trigger: TriggerType
  config: TriggerConfig
  steps: FlowStep[]
}

type Selection = "trigger" | string | null

function draftOf(flow: BuilderData["flow"]): Draft {
  const trigger: TriggerType = isTriggerType(flow.trigger_type) ? flow.trigger_type : "new_subscriber"
  const config: TriggerConfig = { ...(flow.trigger_config ?? {}), entry: entryRule(trigger, flow.trigger_config) }
  return { name: flow.name, trigger, config, steps: normalizeSteps(flow.steps) }
}

function useWide(query: string) {
  const [wide, setWide] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    const mq = window.matchMedia(query)
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [query])
  return wide
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–")

function day(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function stepTitle(steps: FlowStep[], s: FlowStep): string {
  if (s.type === "email") return s.config.subject.trim() || "No subject yet"
  if (s.type === "wait") return waitText(s)
  return `Only if ${CONDITIONS[s.config.check].phrase}`
}

function stepKindName(steps: FlowStep[], s: FlowStep): string {
  if (s.type === "email") return `Email ${emailNumber(steps, s.id)}`
  if (s.type === "wait") return "Wait"
  return "Check"
}

/* ─── The page ───────────────────────────────────────────────────────── */

export function FlowBuilder({ data }: { data: BuilderData }) {
  const router = useRouter()
  const { toast } = useToast()
  const [initial] = React.useState(() => draftOf(data.flow))
  const [draft, setDraft] = React.useState<Draft>(initial)
  const [savedJson, setSavedJson] = React.useState(() => JSON.stringify(initial))
  const [status, setStatus] = React.useState(data.flow.status)
  const [selected, setSelected] = React.useState<Selection>(null)
  const [saving, setSaving] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const [confirmOff, setConfirmOff] = React.useState(false)
  const [confirmLeave, setConfirmLeave] = React.useState(false)
  const [flagged, setFlagged] = React.useState(false)
  const wide = useWide("(min-width: 1024px)")

  const on = status === "active"
  const dirty = JSON.stringify(draft) !== savedJson
  const problems = React.useMemo(() => problemsOf(draft.trigger, draft.steps), [draft.trigger, draft.steps])
  const problemAt = (id: string | null) => problems.filter((p) => p.stepId === id)

  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const update = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }))
  const updateStep = (id: string, step: FlowStep) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? step : s)) }))

  const addStep = (at: number, type: StepType) => {
    if (draft.steps.length >= MAX_STEPS) {
      toast({ title: "That is the most steps a flow can have", description: `Up to ${MAX_STEPS}.` })
      return
    }
    const step = blankStep(type)
    setDraft((d) => ({ ...d, steps: [...d.steps.slice(0, at), step, ...d.steps.slice(at)] }))
    setSelected(step.id)
  }
  const moveStep = (id: string, by: -1 | 1) =>
    setDraft((d) => {
      const i = d.steps.findIndex((s) => s.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= d.steps.length) return d
      const steps = [...d.steps]
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...d, steps }
    })
  const removeStep = (id: string) => {
    setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) }))
    setSelected(null)
  }

  const save = async (): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/automations/flows/${data.flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, trigger_type: draft.trigger, trigger_config: draft.config, steps: draft.steps }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (Array.isArray(out.problems)) setFlagged(true)
        toast({ title: "Not saved", description: out.problems?.[0]?.message ?? out.error ?? "Try again.", variant: "destructive" })
        return false
      }
      /* What the server kept is what is shown: it may have tidied a body. */
      const next = draftOf({ ...data.flow, ...out.flow })
      setDraft(next)
      setSavedJson(JSON.stringify(next))
      return true
    } catch {
      toast({ title: "Not saved", description: "Could not reach Storelib. Check your connection.", variant: "destructive" })
      return false
    } finally {
      setSaving(false)
    }
  }

  const setOn = async (next: boolean) => {
    if (next && problems.length > 0) {
      setFlagged(true)
      setSelected(problems[0].stepId ?? null)
      toast({ title: "Not turned on yet", description: problems[0].message, variant: "destructive" })
      return
    }
    setSwitching(true)
    try {
      if (dirty && !(await save())) return
      const res = await fetch(`/api/automations/flows/${data.flow.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: next ? "Not turned on" : "Not turned off", description: out.problems?.[0]?.message ?? out.error ?? "Try again.", variant: "destructive" })
        return
      }
      setStatus(out.status)
      toast({
        title: next ? "On" : "Off",
        description: next
          ? `From now on, ${TRIGGERS[draft.trigger].sentence.charAt(0).toLowerCase()}${TRIGGERS[draft.trigger].sentence.slice(1)} starts it.`
          : out.stopped > 0
            ? `${out.stopped} ${out.stopped === 1 ? "person" : "people"} partway through will get nothing more.`
            : "Nobody new starts it.",
      })
      router.refresh()
    } finally {
      setSwitching(false)
      setConfirmOff(false)
    }
  }

  const back = () => {
    if (dirty) setConfirmLeave(true)
    else router.push("/app/emails?tab=flows")
  }

  const selectedStep = selected && selected !== "trigger" ? draft.steps.find((s) => s.id === selected) ?? null : null
  const panel =
    selected === "trigger" ? (
      <TriggerPanel draft={draft} on={on} products={data.products} onChange={update} onClose={() => setSelected(null)} />
    ) : selectedStep ? (
      <StepPanel
        key={selectedStep.id}
        flowId={data.flow.id}
        purchase={draft.trigger === "purchase"}
        steps={draft.steps}
        step={selectedStep}
        stats={data.stats[selectedStep.id]}
        problems={problemAt(selectedStep.id)}
        accountEmail={data.accountEmail}
        onChange={(s) => updateStep(selectedStep.id, s)}
        onMove={(by) => moveStep(selectedStep.id, by)}
        onRemove={() => removeStep(selectedStep.id)}
        onClose={() => setSelected(null)}
      />
    ) : null

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
      <PaneBar width={LIST_WIDTH} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 pb-2.5 pt-2">
        <div className="-ml-1.5 flex h-9 w-9 items-center justify-center">
          <button type="button" aria-label="Back to Emails" className={iconButton} onClick={back}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-9 min-w-0 items-center gap-2">
          {/* As wide as the name, so the badge sits right after it: an
              invisible copy of the text sizes the cell the field fills. */}
          <span className="-ml-1.5 inline-grid min-w-0 grid-cols-[minmax(0,auto)]">
            <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-1.5 text-[18px] font-semibold sm:text-[20px]">
              {draft.name || "Name"}
            </span>
            <input
              aria-label="Name"
              value={draft.name}
              maxLength={80}
              placeholder="Name"
              onChange={(e) => update({ name: e.target.value })}
              className="col-start-1 row-start-1 h-9 w-full min-w-[4ch] truncate rounded-lg bg-transparent px-1.5 text-[18px] font-semibold text-[#1a1a2e] outline-none transition-colors hover:bg-[#eef0f2] focus:bg-white focus:shadow-[0_0_0_1px_#1a1a2e] sm:text-[20px]"
            />
          </span>
          <StatusBadge tone={on ? "success" : "neutral"} className="hidden sm:inline-flex">
            {on ? "On" : "Off"}
          </StatusBadge>
        </div>
        <div className="flex min-h-9 shrink-0 items-center gap-2">
          <span className="hidden text-[12px] text-[#6b7280] md:inline" aria-live="polite">
            {saving ? "Saving" : dirty ? "Unsaved changes" : "Saved"}
          </span>
          <button type="button" className={buttonAccent} disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
        <div className="col-span-2 col-start-2 -mt-0.5 min-w-0 truncate text-[13px] leading-5 text-[#6b7280]">
          {TRIGGERS[draft.trigger].sentence} · {entryText(draft.trigger, entryRule(draft.trigger, draft.config))}
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-28 md:pb-10", LIST_WIDTH, GUTTER)}>
        <StateBanner
          on={on}
          busy={switching}
          problems={problems}
          counts={data.counts}
          tracking={data.tracking}
          onTurnOn={() => void setOn(true)}
          onTurnOff={() => (data.counts.active > 0 ? setConfirmOff(true) : void setOn(false))}
          onShowProblem={(p) => {
            setFlagged(true)
            setSelected(p.stepId ?? "trigger")
          }}
        />

        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <Canvas
              draft={draft}
              selected={selected}
              stats={data.stats}
              flagged={flagged}
              problemAt={problemAt}
              onSelect={setSelected}
              onAdd={addStep}
            />
            {wide !== true ? <Summary className="mt-8 lg:hidden" draft={draft} problems={problems} onPick={(id) => setSelected(id ?? "trigger")} /> : null}
            <Activity data={data} on={on} steps={draft.steps} />
          </div>
          {wide !== false ? (
            <aside className="sticky top-[88px] hidden lg:block">
              <div className={cn(card, "max-h-[calc(100dvh-112px)] overflow-y-auto")}>
                {(wide ? panel : null) ?? <Summary draft={draft} problems={problems} onPick={(id) => setSelected(id ?? "trigger")} bare />}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {wide === false ? (
        <BottomSheet isOpen={selected !== null && panel !== null} onClose={() => setSelected(null)} label="Edit step" hideFrom={null} aboveKeyboard maxHeight="min(90dvh, 760px)">
          {panel}
        </BottomSheet>
      ) : null}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl p-0 sm:max-w-[420px]">
          <div className="p-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">Turn off {draft.name}?</DialogTitle>
            <DialogDescription className="mt-1.5 text-[14px] text-[#6b7280]">
              {data.counts.active} {data.counts.active === 1 ? "person is" : "people are"} partway through. Turning it off stops them where they are, and their remaining emails are not sent, now or if you turn it on again.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            <button type="button" className={buttonSecondary} onClick={() => setConfirmOff(false)}>
              Keep it on
            </button>
            <button type="button" className="inline-flex h-8 items-center rounded-lg bg-[#c4290c] px-3 text-[13px] font-medium text-white hover:bg-[#a8230a] disabled:opacity-50" disabled={switching} onClick={() => void setOn(false)}>
              Turn off
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl p-0 sm:max-w-[420px]">
          <div className="p-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">Leave without saving?</DialogTitle>
            <DialogDescription className="mt-1.5 text-[14px] text-[#6b7280]">Your changes to this flow are not saved yet.</DialogDescription>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            <button type="button" className={buttonSecondary} onClick={() => router.push("/app/emails?tab=flows")}>
              Leave
            </button>
            <button
              type="button"
              className={buttonAccent}
              onClick={async () => {
                if (await save()) router.push("/app/emails?tab=flows")
              }}
            >
              Save and leave
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── On or off, said plainly ────────────────────────────────────────── */

function StateBanner(props: {
  on: boolean
  busy: boolean
  problems: Problem[]
  counts: BuilderData["counts"]
  tracking: boolean
  onTurnOn: () => void
  onTurnOff: () => void
  onShowProblem: (p: Problem) => void
}) {
  const { on, problems, counts } = props
  return (
    <section
      aria-label="Whether this automation is sending"
      className={cn(
        "mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center",
        on
          ? "border-[#bfe5cc] bg-[#f2fbf5] shadow-[0_1px_3px_rgba(20,83,45,0.06)]"
          : "border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
      )}
    >
      <span aria-hidden className={cn("hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block", on ? "bg-[#1f9d55] shadow-[0_0_0_4px_rgba(31,157,85,0.15)]" : "bg-[#b5b5bd]")} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{on ? "On and sending" : "Off"}</p>
        <p className="text-[13px] text-[#4b5563]">
          {on
            ? props.tracking && counts.active > 0
              ? `${counts.active} ${counts.active === 1 ? "person is" : "people are"} partway through. Edits reach them from their next step.`
              : "People who trigger it from now on go through it. Nobody from before is sent anything."
            : problems.length > 0
              ? `${problems.length} ${problems.length === 1 ? "thing" : "things"} to finish before it can go on.`
              : "Nothing is sent. Turn it on and it starts for people who trigger it from then on."}
        </p>
        {!on && problems.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {problems.slice(0, 4).map((p, i) => (
              <li key={i}>
                <button type="button" className="text-left text-[13px] text-[#8a1c0f] underline decoration-[#8a1c0f]/30 underline-offset-2 hover:decoration-[#8a1c0f]" onClick={() => props.onShowProblem(p)}>
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {on ? (
          <button type="button" className={buttonSecondary} disabled={props.busy} onClick={props.onTurnOff}>
            Turn off
          </button>
        ) : (
          <button type="button" className={buttonAccent} disabled={props.busy} onClick={props.onTurnOn}>
            Turn on
          </button>
        )}
      </div>
    </section>
  )
}

/* ─── The column of steps ────────────────────────────────────────────── */

const node =
  "group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition-[box-shadow,border-color,transform] duration-150 ease-out"
const nodeRest = "border-[#e5e7eb]/80 shadow-[0_1px_0_rgba(17,24,39,0.03),0_1px_3px_rgba(17,24,39,0.06)] hover:-translate-y-px hover:border-[#d5d7dd] hover:shadow-[0_1px_0_rgba(17,24,39,0.03),0_6px_16px_-6px_rgba(17,24,39,0.16)]"
const nodeOn = "border-[#8b5cf6] shadow-[0_0_0_3px_rgba(139,92,246,0.16),0_6px_16px_-6px_rgba(76,29,149,0.22)]"

function Canvas(props: {
  draft: Draft
  selected: Selection
  stats: Record<string, StepStats>
  flagged: boolean
  problemAt: (id: string | null) => Problem[]
  onSelect: (s: Selection) => void
  onAdd: (at: number, type: StepType) => void
}) {
  const { draft } = props
  const when = new Map(timeline(draft.steps).map((t) => [t.stepId, t.when]))
  const rule = entryRule(draft.trigger, draft.config)
  const products = draft.trigger === "purchase" ? draft.config.product_ids?.length ?? 0 : 0
  return (
    <ol aria-label="Steps" className="mx-auto w-full max-w-[560px]">
      <li>
        <button type="button" className={cn(node, props.selected === "trigger" ? nodeOn : nodeRest)} onClick={() => props.onSelect("trigger")}>
          <StepMark kind="trigger" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-[#6d28d9]">Starts when</span>
            <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{TRIGGERS[draft.trigger].sentence}</span>
            <span className="block truncate text-[12px] text-[#6b7280]">
              {entryText(draft.trigger, rule)}
              {draft.trigger === "purchase" ? ` · ${products > 0 ? `${products} ${products === 1 ? "product" : "products"}` : "Any product"}` : ""}
            </span>
          </span>
        </button>
      </li>
      {draft.steps.map((s, i) => {
        const stats = s.type === "email" ? props.stats[s.id] : undefined
        const problems = props.problemAt(s.id)
        return (
          <React.Fragment key={s.id}>
            <Connector onAdd={(type) => props.onAdd(i, type)} />
            <li>
              <button type="button" className={cn(node, props.selected === s.id ? nodeOn : nodeRest)} onClick={() => props.onSelect(s.id)} aria-label={`${stepKindName(draft.steps, s)}: ${stepTitle(draft.steps, s)}`}>
                <StepMark kind={s.type} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[12px] font-medium text-[#6b7280]">
                    <span>{stepKindName(draft.steps, s)}</span>
                    {s.type !== "wait" && when.get(s.id) ? <span className="text-[#9ca3af]">· {when.get(s.id)}</span> : null}
                  </span>
                  <span className={cn("line-clamp-2 block break-words text-[14px] font-semibold", s.type === "email" && !s.config.subject.trim() ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>
                    {stepTitle(draft.steps, s)}
                  </span>
                  {s.type === "condition" ? <span className="block text-[12px] text-[#6b7280]">Everyone else leaves here.</span> : null}
                  {stats && stats.sent + stats.failed > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[12px] tabular-nums text-[#4b5563]">
                      <span>{stats.sent.toLocaleString("en-US")} sent</span>
                      <span>{pct(stats.opened, stats.sent)} opened</span>
                      <span>{pct(stats.clicked, stats.sent)} clicked</span>
                      {stats.failed > 0 ? <span className="text-[#8a1c0f]">{stats.failed} failed</span> : null}
                    </span>
                  ) : null}
                  {props.flagged && problems.length > 0 ? <span className="mt-1 block text-[12px] text-[#8a1c0f]">{problems[0].message}</span> : null}
                </span>
                {problems.length > 0 ? <span aria-label="Needs attention" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e0a800] shadow-[0_0_0_3px_rgba(224,168,0,0.18)]" /> : null}
              </button>
            </li>
          </React.Fragment>
        )
      })}
      <Connector onAdd={(type) => props.onAdd(draft.steps.length, type)} />
      <li className="flex justify-center">
        <span className="inline-flex h-7 items-center rounded-full border border-[#e3e4e8] bg-white px-3 text-[12px] font-medium text-[#6b7280]">End</span>
      </li>
    </ol>
  )
}

const AddButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function AddButton(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Add a step here"
      {...props}
      className="relative z-[1] inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#d5d7dd] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-[transform,background-color,color] duration-100 hover:scale-105 hover:bg-[#1a1a2e] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  )
})

function Connector({ onAdd }: { onAdd: (type: StepType) => void }) {
  return (
    <li className="relative flex h-12 items-center justify-center">
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[#dfe1e6]" />
      <ResponsiveActionMenu
        title="Add a step"
        align="center"
        trigger={<AddButton />}
        items={[
          { label: "Email", onClick: () => onAdd("email") },
          { label: "Wait", onClick: () => onAdd("wait") },
          { label: "Check", onClick: () => onAdd("condition") },
        ]}
      />
    </li>
  )
}

/* ─── The panel ──────────────────────────────────────────────────────── */

const field = "h-9 w-full rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_1px_#1a1a2e] sm:text-[13px]"
const labelText = "mb-1.5 block text-[13px] font-medium text-[#1a1a2e]"
const hint = "mt-1.5 text-[12px] leading-[1.45] text-[#6b7280]"

function PanelHead({ kind, title, onClose }: { kind: Parameters<typeof StepMark>[0]["kind"]; title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#eef0f2] px-4 py-3">
      <StepMark kind={kind} />
      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <button type="button" aria-label="Close" className={iconButton} onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function Choice({ checked, onChange, label, detail, disabled, children }: { checked: boolean; onChange: () => void; label: string; detail?: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
        checked ? "border-[#1a1a2e] bg-white shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e3e4e8] bg-white hover:border-[#c9ccd3]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" className="mt-0.5 h-4 w-4 accent-[#1a1a2e]" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[#1a1a2e]">{label}</span>
        {detail ? <span className="block text-[12px] text-[#6b7280]">{detail}</span> : null}
        {children}
      </span>
    </label>
  )
}

function TriggerPanel({ draft, on, products, onChange, onClose }: { draft: Draft; on: boolean; products: BuilderData["products"]; onChange: (d: Partial<Draft>) => void; onClose: () => void }) {
  const rule = entryRule(draft.trigger, draft.config)
  const picked = new Set(draft.config.product_ids ?? [])
  const setRule = (entry: EntryRule) => onChange({ config: { ...draft.config, entry } })
  const [only, setOnly] = React.useState(picked.size > 0)
  return (
    <div>
      <PanelHead kind="trigger" title="Starts when" onClose={onClose} />
      <div className="space-y-6 px-4 py-4">
        <fieldset>
          <legend className={labelText}>What starts it</legend>
          <div className="space-y-2">
            {(Object.keys(TRIGGERS) as TriggerType[]).map((t) => (
              <Choice
                key={t}
                checked={draft.trigger === t}
                disabled={on && draft.trigger !== t}
                label={TRIGGERS[t].sentence}
                onChange={() => onChange({ trigger: t, config: { ...draft.config, entry: entryRule(t, draft.config), product_ids: t === "purchase" ? draft.config.product_ids : undefined } })}
              />
            ))}
          </div>
          {on ? <p className={hint}>Turn it off to change this. People already in it joined for the current reason.</p> : null}
        </fieldset>

        {draft.trigger === "purchase" ? (
          <fieldset>
            <legend className={labelText}>Which purchases</legend>
            <div className="space-y-2">
              <Choice checked={!only} label="Any product" onChange={() => { setOnly(false); onChange({ config: { ...draft.config, product_ids: undefined } }) }} />
              <Choice checked={only} label="Only these products" detail={products.length === 0 ? "You have no products yet." : undefined} disabled={products.length === 0} onChange={() => setOnly(true)} />
            </div>
            {only && products.length > 0 ? (
              <div className="mt-2 max-h-[220px] overflow-y-auto rounded-xl border border-[#e3e4e8]">
                {products.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2.5 border-b border-[#f1f2f4] px-3 py-2 text-[13px] last:border-b-0 hover:bg-[#fafbfb]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1a1a2e]"
                      checked={picked.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(picked)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        onChange({ config: { ...draft.config, product_ids: next.size ? [...next] : undefined } })
                      }}
                    />
                    <span className="min-w-0 truncate text-[#1a1a2e]">{p.title}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <fieldset>
          <legend className={labelText}>Who can go through it again</legend>
          <div className="space-y-2">
            {draft.trigger === "purchase" ? <Choice checked={rule.mode === "each"} label="Every order" detail="Each order starts it once. The same order never starts it twice." onChange={() => setRule({ mode: "each" })} /> : null}
            <Choice checked={rule.mode === "once"} label="Once per person" detail="Never twice for the same address." onChange={() => setRule({ mode: "once" })} />
            <Choice
              checked={rule.mode === "after"}
              label="Again, after a while"
              onChange={() => setRule({ mode: "after", days: rule.mode === "after" ? rule.days : 30 })}
            >
              {rule.mode === "after" ? (
                <span className="mt-2 flex items-center gap-2 text-[13px] text-[#4b5563]">
                  Not within
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={rule.days}
                    onChange={(e) => setRule({ mode: "after", days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                    className="h-8 w-16 rounded-lg border border-[#d5d7dd] px-2 text-center text-[16px] outline-none focus:border-[#1a1a2e] sm:text-[13px]"
                  />
                  days of their last time
                </span>
              ) : null}
            </Choice>
          </div>
        </fieldset>
        <p className={hint}>Only people who trigger it after you turn it on are sent anything. Someone who unsubscribes is never sent another email, wherever they are in the flow.</p>
      </div>
    </div>
  )
}

function StepPanel(props: {
  flowId: string
  purchase: boolean
  steps: FlowStep[]
  step: FlowStep
  stats?: StepStats
  problems: Problem[]
  accountEmail: string | null
  onChange: (s: FlowStep) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { step, steps } = props
  const i = steps.findIndex((s) => s.id === step.id)
  return (
    <div>
      <PanelHead kind={step.type} title={stepKindName(steps, step)} onClose={props.onClose} />
      <div className="space-y-5 px-4 py-4">
        {props.problems.length > 0 ? (
          <div className="rounded-xl border border-[#f3d98a] bg-[#fffaeb] px-3 py-2 text-[13px] text-[#5c4300]">
            {props.problems.map((p, n) => (
              <p key={n}>{p.message}</p>
            ))}
          </div>
        ) : null}
        {step.type === "email" ? <EmailFields {...props} step={step} /> : null}
        {step.type === "wait" ? <WaitFields step={step} onChange={props.onChange} /> : null}
        {step.type === "condition" ? <CheckFields steps={steps} step={step} onChange={props.onChange} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#eef0f2] px-4 py-3">
        <button type="button" className={buttonSecondary} disabled={i <= 0} onClick={() => props.onMove(-1)}>
          Move up
        </button>
        <button type="button" className={buttonSecondary} disabled={i >= steps.length - 1} onClick={() => props.onMove(1)}>
          Move down
        </button>
        <button type="button" className="ml-auto inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-[#c4290c] hover:bg-[#fef1ee]" onClick={props.onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}

function EmailFields(props: { flowId: string; purchase: boolean; step: Extract<FlowStep, { type: "email" }>; stats?: StepStats; accountEmail: string | null; onChange: (s: FlowStep) => void }) {
  const { step } = props
  const { toast } = useToast()
  const [testing, setTesting] = React.useState(false)
  const set = (config: Partial<typeof step.config>) => props.onChange({ ...step, config: { ...step.config, ...config } })
  const test = async () => {
    setTesting(true)
    try {
      const res = await fetch(`/api/automations/flows/${props.flowId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) })
      const out = await res.json().catch(() => ({}))
      toast(res.ok ? { title: "Test sent", description: `To ${out.to}. Names and products are filled with examples.` } : { title: "Test not sent", description: out.error ?? "Try again.", variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }
  const s = props.stats
  return (
    <>
      {s && s.sent + s.failed > 0 ? (
        <dl className="grid grid-cols-4 overflow-hidden rounded-xl border border-[#eef0f2] text-center">
          {[
            ["Sent", s.sent.toLocaleString("en-US")],
            ["Opened", pct(s.opened, s.sent)],
            ["Clicked", pct(s.clicked, s.sent)],
            ["Failed", s.failed.toLocaleString("en-US")],
          ].map(([k, v], n) => (
            <div key={k} className={cn("px-2 py-2", n > 0 && "border-l border-[#eef0f2]")}>
              <dt className="text-[11px] font-medium text-[#6b7280]">{k}</dt>
              <dd className={cn("text-[14px] font-semibold tabular-nums", k === "Failed" && s.failed > 0 ? "text-[#8a1c0f]" : "text-[#1a1a2e]")}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div>
        <label className={labelText} htmlFor={`subject-${step.id}`}>Subject</label>
        <input id={`subject-${step.id}`} className={field} value={step.config.subject} maxLength={200} onChange={(e) => set({ subject: e.target.value })} placeholder="Welcome, {{first_name}}" />
      </div>
      <div>
        <label className={labelText} htmlFor={`preview-${step.id}`}>
          Preview text <span className="font-normal text-[#6b7280]">(optional)</span>
        </label>
        <input id={`preview-${step.id}`} className={field} value={step.config.preview_text ?? ""} maxLength={200} onChange={(e) => set({ preview_text: e.target.value || undefined })} placeholder="Shown after the subject in most inboxes" />
      </div>
      <div>
        <span className={labelText}>Email</span>
        <BodyEditor key={step.id} label="Email body" value={step.config.body} onChange={(body) => set({ body })} />
        <p className={hint}>
          {"{{first_name}}"} becomes their first name, or &ldquo;there&rdquo;.{props.purchase ? ` ${"{{product_name}}"} is what they bought.` : ""} Every email ends with your name and an unsubscribe link.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f7f8] px-3 py-2.5">
        <p className="min-w-0 text-[12px] text-[#4b5563]">
          {props.accountEmail ? <>Send this one to <span className="font-medium text-[#1a1a2e]">{props.accountEmail}</span>, as it is now.</> : "Your account has no email address for a test."}
        </p>
        <button type="button" className={buttonSecondary} disabled={testing || !props.accountEmail} onClick={() => void test()}>
          {testing ? "Sending" : "Send test"}
        </button>
      </div>
    </>
  )
}

function WaitFields({ step, onChange }: { step: Extract<FlowStep, { type: "wait" }>; onChange: (s: FlowStep) => void }) {
  return (
    <div>
      <span className={labelText}>Wait for</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          aria-label="How long"
          className={cn(field, "w-24 text-center")}
          value={step.config.amount || ""}
          onChange={(e) => onChange({ ...step, config: { ...step.config, amount: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
        />
        <select
          aria-label="Unit"
          className={cn(field, "w-auto pr-8")}
          value={step.config.unit}
          onChange={(e) => onChange({ ...step, config: { ...step.config, unit: e.target.value as WaitUnit } })}
        >
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
      <p className={hint}>Counted from the step before. The next step goes out within the hour after the wait ends, in any time zone the same moment.</p>
    </div>
  )
}

function CheckFields({ steps, step, onChange }: { steps: FlowStep[]; step: Extract<FlowStep, { type: "condition" }>; onChange: (s: FlowStep) => void }) {
  const hasEmailBefore = Boolean(emailBefore(steps, step.id))
  return (
    <fieldset>
      <legend className={labelText}>Continue only if they</legend>
      <div className="space-y-2">
        {(Object.keys(CONDITIONS) as ConditionCheck[]).map((c) => {
          const needs = CONDITIONS[c].needsEmailBefore && !hasEmailBefore
          return (
            <Choice
              key={c}
              checked={step.config.check === c}
              disabled={needs && step.config.check !== c}
              label={CONDITIONS[c].phrase.replace(/^they /, "")}
              detail={needs ? "Needs an email before this step." : undefined}
              onChange={() => onChange({ ...step, config: { check: c } })}
            />
          )
        })}
      </div>
      <p className={hint}>Everyone else leaves the flow here and is sent nothing more from it. Opens are a hint: some mail apps hide them.</p>
    </fieldset>
  )
}

/* ─── What happens, read back ────────────────────────────────────────── */

function Summary({ draft, problems, onPick, bare, className }: { draft: Draft; problems: Problem[]; onPick: (stepId: string | null) => void; bare?: boolean; className?: string }) {
  const lines = timeline(draft.steps)
  return (
    <section aria-label="What happens" className={cn(bare ? "" : card, className)}>
      <div className="px-4 pb-4 pt-3.5">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">What happens</h2>
        <ol className="mt-3 space-y-2.5">
          <li className="flex gap-3 text-[13px]">
            <span className="w-[92px] shrink-0 text-[#6b7280]">When</span>
            <span className="min-w-0 text-[#1a1a2e]">{TRIGGERS[draft.trigger].sentence}</span>
          </li>
          {lines.map((l) => (
            <li key={l.stepId} className="flex gap-3 text-[13px]">
              <span className="w-[92px] shrink-0 tabular-nums text-[#6b7280]">{l.when}</span>
              <button type="button" className="min-w-0 truncate text-left text-[#1a1a2e] hover:underline" onClick={() => onPick(l.stepId)}>
                {l.what}
              </button>
            </li>
          ))}
          <li className="flex gap-3 text-[13px]">
            <span className="w-[92px] shrink-0 text-[#6b7280]">Then</span>
            <span className="text-[#4b5563]">The flow ends for them.</span>
          </li>
        </ol>
      </div>
      {problems.length > 0 ? (
        <div className="border-t border-[#eef0f2] px-4 py-3.5">
          <h3 className="text-[13px] font-semibold text-[#1a1a2e]">Before it can go on</h3>
          <ul className="mt-1.5 space-y-1">
            {problems.map((p, i) => (
              <li key={i}>
                <button type="button" className="text-left text-[13px] text-[#8a1c0f] hover:underline" onClick={() => onPick(p.stepId)}>
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1.5 border-t border-[#eef0f2] px-4 py-3.5 text-[12px] leading-[1.5] text-[#6b7280]">
        <p>Each email goes to each person once, however often they trigger it. Someone who unsubscribes gets nothing more.</p>
        <p>Edits reach people already in it from their next step. Turning it off stops everyone where they are.</p>
      </div>
    </section>
  )
}

/* ─── Who has gone through it ────────────────────────────────────────── */

function Activity({ data, on, steps }: { data: BuilderData; on: boolean; steps: FlowStep[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [retrying, setRetrying] = React.useState(false)
  const { counts } = data
  const total = counts.active + counts.finished + counts.left + counts.failed

  const retry = async () => {
    setRetrying(true)
    try {
      const res = await fetch(`/api/automations/flows/${data.flow.id}/retry`, { method: "POST" })
      const out = await res.json().catch(() => ({}))
      toast(res.ok ? { title: out.retried > 0 ? "Trying again" : "Nothing to try again", description: out.retried > 0 ? `${out.retried} ${out.retried === 1 ? "step is" : "steps are"} back in the queue.` : "Interrupted sends are never sent twice." } : { title: "Not retried", description: out.error ?? "Try again.", variant: "destructive" })
      if (res.ok) router.refresh()
    } finally {
      setRetrying(false)
    }
  }

  const where = (r: RunView) => {
    if (r.status === "active") {
      const s = steps.find((x) => x.id === r.current_step_id)
      if (!s) return "In progress"
      return s.type === "email" ? `Next: ${stepKindName(steps, s)}` : s.type === "wait" ? `Waiting ${waitText(s)}` : "At the check"
    }
    if (r.status === "completed") return "Went through every step"
    return r.exit_reason ?? RUN_STATUS[r.status]?.label ?? r.status
  }

  return (
    <section aria-label="Activity" className={cn(card, "mx-auto mt-10 max-w-[560px] overflow-hidden lg:max-w-none")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#eef0f2] px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Activity</h2>
        {data.tracking && total > 0 ? (
          <p className="flex flex-wrap gap-x-3 text-[12px] tabular-nums text-[#4b5563]">
            <span>{counts.active} in progress</span>
            <span>{counts.finished} finished</span>
            <span>{counts.left} left or stopped</span>
            {counts.failed > 0 ? <span className="text-[#8a1c0f]">{counts.failed} failed</span> : null}
          </p>
        ) : null}
        {data.failedJobs > 0 && on ? (
          <button type="button" className={cn(buttonSecondary, "ml-auto")} disabled={retrying} onClick={() => void retry()}>
            {retrying ? "Retrying" : "Try failed again"}
          </button>
        ) : null}
      </div>
      {data.runs.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">
          {on ? "Nobody has gone through it yet. The first person shows up here with where they joined." : "Nobody has gone through it yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
              <tr>
                <th className="sticky left-0 z-[1] h-9 bg-[#fafbfb] px-3 text-left text-[12px] font-medium text-[#4b5563]">Contact</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">From</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">Started</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">Where they are</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {data.runs.map((r) => {
                const st = RUN_STATUS[r.status] ?? RUN_STATUS.cancelled
                return (
                  <tr key={r.id} className="group hover:bg-[#fafbfb]">
                    <td className="sticky left-0 z-[1] h-12 bg-white px-3 text-[13px] font-medium text-[#1a1a2e] group-hover:bg-[#fafbfb]">
                      <span className="block max-w-[170px] truncate sm:max-w-[240px]">{r.email}</span>
                    </td>
                    <td className="h-12 px-3 text-[13px] text-[#4b5563]">
                      <span className="block max-w-[220px] truncate">{joinedSentence(r.source_detail, r.trigger_type) ?? "Not recorded"}</span>
                    </td>
                    <td className="h-12 whitespace-nowrap px-3 text-[13px] tabular-nums text-[#4b5563]">{day(r.started_at)}</td>
                    <td className="h-12 px-3 text-[13px]">
                      <span className="flex max-w-[300px] items-center gap-2">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        <span className={cn("truncate", r.status === "failed" ? "text-[#8a1c0f]" : "text-[#4b5563]")} title={where(r)}>
                          {where(r)}
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
