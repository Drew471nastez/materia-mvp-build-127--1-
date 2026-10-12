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
 *   the bar        Back, the name (edit it where it is), Draft or Live, and
 *                  one action: Save while there are changes, Turn on while it
 *                  is off. Everything else is in the menu beside it: turning
 *                  off, deleting. The same frame as an order's bar.
 *   the state      one line under the bar: who is partway through, or what
 *                  is left to finish before it can go on.
 *   the steps      one column, the width of everything else on the page, on
 *                  one axis, joined by a line with a + between every two.
 *   editing        a panel on the right on a desktop, the shared sheet on a
 *                  phone (components/ui/bottom-sheet). With nothing open,
 *                  the panel reads the flow back: what happens and when.
 *                  Opening a step changes the panel, never the column.
 *   the numbers    per email, and the run history under the steps, straight
 *                  from the engine's records. Nothing is estimated.
 *
 * The page arrives with its data (./page.tsx reads it on the server), so its
 * first frame is the flow itself, with nothing to fill in afterwards.
 *
 * Saving is explicit and never changes on or off. The server checks every
 * field again (app/api/automations/flows/[id]).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowLeft, ArrowUp, Ellipsis, Plus, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ScrollEdge } from "@/components/app/scroll-edge"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { backThen } from "@/lib/navigation/go-back"
import { leaveLayer } from "../../layer-nav"
import {
  CONDITIONS,
  MAX_STEPS,
  TRIGGERS,
  TRIGGER_ORDER,
  audienceOf,
  blankStep,
  emailBefore,
  emailNumber,
  entryRule,
  entryText,
  isPurchaseTrigger,
  isTriggerType,
  normalizeSteps,
  problemsOf,
  timeline,
  waitText,
  type Audience,
  type ConditionCheck,
  type EntryRule,
  type FlowStep,
  type Problem,
  type StepType,
  type TriggerConfig,
  type TriggerType,
  type WaitUnit,
} from "@/lib/automations/flow-model"
import { fieldsFor } from "@/lib/automations/merge-fields"
import type { Identity } from "@/lib/automations/engine"
import { previewFlowEmail } from "@/lib/automations/preview"
import { joinedSentence } from "@/lib/contacts/contact-source"
import { StatusBadge, buttonPrimary, buttonSecondary, card, iconButton } from "../../../orders/order-parts"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { RUN_STATUS } from "../../contact-detail"
import { BodyEditor } from "../body-editor"
import { refreshMatching, write } from "@/components/email/emails-cache"
import { PreviewLayer } from "@/components/email/compose/preview-layer"
import type { PreviewMode } from "@/components/email/compose/email-preview"
import { FlowTopBar, StepMark, backButton } from "../flow-parts"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

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
  /** False before RUN_CHECKOUT_CONTACTS.sql: no started checkout is recorded, so a checkout reminder cannot start. */
  startsRecorded?: boolean
  accountEmail: string | null
  /** The creator as the send path reads them now, for the preview (lib/automations/preview). */
  look?: Identity | null
}

interface Draft {
  name: string
  trigger: TriggerType
  config: TriggerConfig
  steps: FlowStep[]
}

type Selection = "trigger" | string | null

/**
 * The header and the body share one width, so the back arrow, the column and
 * the panel line up: the product editor's, 760px below lg and the 1200px
 * page container from lg.
 */
const FLOW_WIDTH = "max-w-[760px] lg:max-w-[1200px]"
const FLOW_GUTTER = "app-gutter"

/** The name, where it is edited: the bar's size on a phone, the page title's from 768px. */
const nameText = "text-[17px] font-semibold text-[#1a1a2e] md:text-[24px] md:font-bold lg:text-[28px]"

/*
  THE BUTTONS THAT DO THE WORK, WITH THE APP'S DEPTH (components/ui/
  depth-button): Save near black with its line of light, Discard and the
  step's Move up and Move down white with a hairline and a soft foot, the
  way the product and coupon editors draw theirs. They were the flat order
  buttons, which beside the product editor read as a different app. Pressed,
  each goes flat, as a key does.

  Remove is the one that throws a step away, so it stays words in red with
  no box round it: a third bordered button in that row gave the panel's foot
  as much weight as the fields above it.
*/
const DEPTH_PRIMARY = cn(primaryDepth, "disabled:cursor-not-allowed disabled:opacity-50")
const PANEL_BUTTON = cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px] max-sm:h-10 max-sm:rounded-[10px]")
const PANEL_REMOVE =
  "ml-auto inline-flex h-8 cursor-pointer select-none items-center rounded-lg px-3 text-[13px] font-medium text-[#b42318] transition-colors duration-100 hover:bg-[#fef3f2] active:bg-[#fde8e6] max-sm:h-10 [-webkit-tap-highlight-color:transparent]"

const EMAILS = "/app/emails?tab=flows"
/** The Emails list's cache key for this tab (app/app/emails/emails-data.ts tabKey). */
const FLOWS_KEY = "emails:flows"

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
  return d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }))
}

function stepTitle(steps: FlowStep[], s: FlowStep): string {
  if (s.type === "email") return s.config.subject.trim() || tt("No subject yet")
  if (s.type === "wait") return waitText(s)
  return tt("Only if {phrase}", { phrase: CONDITIONS[s.config.check].phrase })
}

function stepKindName(steps: FlowStep[], s: FlowStep): string {
  if (s.type === "email") return tt("Email {count}", { count: emailNumber(steps, s.id) })
  if (s.type === "wait") return tt("Wait")
  return tt("Check")
}

const STATE: Record<string, { label: string; tone: "success" | "neutral" }> = {
  active: { get label() { return tt("Live") }, tone: "success" },
  draft: { get label() { return tt("Draft") }, tone: "neutral" },
  paused: { get label() { return tt("Paused") }, tone: "neutral" },
}
const stateOf = (status: string) => STATE[status] ?? STATE.draft

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
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
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

  /* Back is known before it is pressed: the list is warmed, so leaving
     without history behind (a link opened cold) is a quick push too. */
  React.useEffect(() => {
    router.prefetch(EMAILS)
  }, [router])

  const update = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }))
  const updateStep = (id: string, step: FlowStep) => setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? step : s)) }))

  const addStep = (at: number, type: StepType) => {
    if (draft.steps.length >= MAX_STEPS) {
      toast({ title: tt("That is the most steps a flow can have"), description: tt("Up to {maxSteps}.", { maxSteps: MAX_STEPS }) })
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
        toast({ title: tt("Not saved"), description: out.problems?.[0]?.message ?? out.error ?? tt("Try again."), variant: "destructive" })
        return false
      }
      /* What the server kept is what is shown: it may have tidied a body. */
      const next = draftOf({ ...data.flow, ...out.flow })
      setDraft(next)
      setSavedJson(JSON.stringify(next))
      /* The Emails list keeps what it read; its row for this flow is out of date now. */
      refreshMatching(FLOWS_KEY)
      return true
    } catch {
      toast({ title: tt("Not saved"), description: tt("Could not reach Storelib. Check your connection."), variant: "destructive" })
      return false
    } finally {
      setSaving(false)
    }
  }

  /* Cmd or Ctrl and S saves, as it does in the product editor. The latest save is read through a ref, so the listener is added once per change of state. */
  const saveRef = React.useRef(save)
  React.useLayoutEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      if (dirty && !saving) void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dirty, saving])

  const setOn = async (next: boolean) => {
    if (next && problems.length > 0) {
      setFlagged(true)
      setSelected(problems[0].stepId ?? null)
      toast({ title: tt("Not turned on yet"), description: problems[0].message, variant: "destructive" })
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
        toast({ title: next ? tt("Not turned on") : tt("Not turned off"), description: out.problems?.[0]?.message ?? out.error ?? tt("Try again."), variant: "destructive" })
        return
      }
      setStatus(out.status)
      refreshMatching(FLOWS_KEY)
      toast({
        title: next ? tt("Live") : tt("Paused"),
        description: next
          ? tt("From now on, {value}{value2} starts it.", { value: TRIGGERS[draft.trigger].sentence.charAt(0).toLowerCase(), value2: TRIGGERS[draft.trigger].sentence.slice(1) })
          : out.stopped > 0
            ? tt("{stopped, plural, one {# person} other {# people}} partway through will get nothing more.", { stopped: out.stopped })
            : tt("Nobody new starts it."),
      })
      router.refresh()
    } finally {
      setSwitching(false)
      setConfirmOff(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/automations/flows/${data.flow.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setSavedJson(JSON.stringify(draft))
      /* Gone from the list before the list is seen again, not a moment after. */
      write<Array<{ id: string }> | undefined>(FLOWS_KEY, (prev) => prev?.filter((f) => f.id !== data.flow.id))
      refreshMatching(FLOWS_KEY)
      router.replace(EMAILS)
    } catch {
      setDeleting(false)
      toast({ title: tt("Not deleted"), description: tt("Try again."), variant: "destructive" })
    }
  }

  /**
   * BACK RETURNS. When the page behind this one is the Emails list, this is
   * the browser's own back: instant, with the list where it was scrolled.
   * From anywhere else (a link opened cold, a new tab) it goes to the list.
   */
  /* And a back that does nothing (a replaced entry, this flow opened straight
     from a link) is followed by the list itself within BACK_WATCH_MS, instead
     of leaving the layer up over a dimmed arrow (lib/navigation/go-back). */
  const leave = () =>
    leaveLayer(() => {
      if (canReturnTo("/app/emails")) backThen(() => router.replace(EMAILS))
      else router.push(EMAILS)
    })
  const back = () => {
    if (dirty) setConfirmLeave(true)
    else leave()
  }

  const turnOff = () => (data.counts.active > 0 ? setConfirmOff(true) : void setOn(false))

  /*
    DUPLICATE: a copy, off, opened in place of this one. What is copied is
    what is saved, so unsaved changes are saved first and go into both.
  */
  const [copying, setCopying] = React.useState(false)
  const duplicate = async () => {
    if (copying) return
    if (dirty && !(await save())) return
    setCopying(true)
    try {
      const res = await fetch(`/api/automations/flows/${data.flow.id}/duplicate`, { method: "POST" })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.id) throw new Error(out.error)
      refreshMatching(FLOWS_KEY)
      toast({ title: tt("Copy made"), description: tt("It is off until you turn it on.") })
      router.push(`/app/emails/flow/${out.id}`)
    } catch (error) {
      toast({ title: tt("No copy made"), description: (error as Error)?.message || tt("Try again."), variant: "destructive" })
    } finally {
      setCopying(false)
    }
  }
  const menu: ActionMenuItem[] = [
    ...(on ? [{ label: tt("Turn off"), onClick: turnOff }] : dirty ? [{ label: tt("Save and turn on"), onClick: () => void setOn(true) }] : []),
    { label: copying ? tt("Copying") : tt("Duplicate"), onClick: () => void duplicate() },
    { label: tt("Delete automation"), variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirmDelete(true) },
  ]
  const busy = saving || switching || deleting || copying
  /* The bar's one action. Save is the phone's: from 768px it is in the foot bar. */
  const primary = dirty
    ? { label: saving ? tt("Saving") : tt("Save"), run: () => void save(), phoneOnly: true }
    : !on
      ? { label: switching ? tt("Turning on") : tt("Turn on"), run: () => void setOn(true), phoneOnly: false }
      : null
  /* Back to what was last saved, from the foot bar. */
  const discard = () => {
    setDraft(JSON.parse(savedJson) as Draft)
    setSelected(null)
    setFlagged(false)
  }
  const state = stateOf(status)
  const subtitle = `${TRIGGERS[draft.trigger].sentence} · ${entryText(draft.trigger, entryRule(draft.trigger, draft.config))}`

  const selectedStep = selected && selected !== "trigger" ? draft.steps.find((s) => s.id === selected) ?? null : null
  const panel =
    selected === "trigger" ? (
      <TriggerPanel draft={draft} on={on} products={data.products} onChange={update} onClose={() => setSelected(null)} />
    ) : selectedStep ? (
      <StepPanel
        key={selectedStep.id}
        flowId={data.flow.id}
        trigger={draft.trigger}
        steps={draft.steps}
        step={selectedStep}
        stats={data.stats[selectedStep.id]}
        problems={problemAt(selectedStep.id)}
        accountEmail={data.accountEmail}
        look={data.look ?? null}
        sampleProduct={sampleProductOf(draft, data.products)}
        onChange={(s) => updateStep(selectedStep.id, s)}
        onMove={(by) => moveStep(selectedStep.id, by)}
        onRemove={() => removeStep(selectedStep.id)}
        onClose={() => setSelected(null)}
      />
    ) : null

  return (
    <div className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter md:flex md:flex-col">
      {/*
        THE HEADER. On a phone the page's own bar over the whole screen
        (../layout.tsx): Back, the name, the one action and the menu, stuck to
        the top. From 768px the page's header, 24px under the app's black bar
        like the product editor's: Back, the name at the page title's size,
        its state and what starts it under it, and Turn on and the menu at
        the end. Save is at the foot from 768px (below), where it stays in
        reach however far down the flow the edit was.
      */}
      <FlowTopBar width={FLOW_WIDTH} className="flex h-14 items-center gap-1.5 md:h-auto md:items-start md:gap-2 md:pt-6">
        <button type="button" aria-label={tt("Back to automations")} title={tt("Automations")} className={cn(backButton, "-ml-2.5 md:-ml-1.5")} onClick={back}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 min-w-0 items-center gap-2">
            {/* As wide as the name, so the badge sits right after it: an
                invisible copy of the text sizes the cell the field fills.
                `size={1}`, or the field's own default width (twenty
                characters) sizes the cell instead and the badge floats off. */}
            <span className="-ml-1.5 inline-grid min-w-0 grid-cols-[minmax(0,auto)]">
              <span aria-hidden className={cn(nameText, "invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-1.5")}>
                {draft.name || tt("Name")}
              </span>
              <input
                aria-label={tt("Name")}
                size={1}
                value={draft.name}
                maxLength={80}
                placeholder={tt("Name")}
                onChange={(e) => update({ name: e.target.value })}
                className={cn(
                  nameText,
                  "col-start-1 row-start-1 h-9 w-full min-w-[4ch] truncate rounded-lg bg-transparent px-1.5 outline-none transition-colors hover:bg-[#eef0f2] focus:bg-white focus:shadow-[0_0_0_1px_#c9ccd3,0_0_0_4px_rgba(17,17,19,0.06)] md:h-10",
                )}
              />
            </span>
            <StatusBadge tone={state.tone} className="hidden md:inline-flex">
              {state.label}
            </StatusBadge>
          </div>
          <p className="hidden min-w-0 truncate text-[13px] leading-5 text-[#6b7280] md:block">{subtitle}</p>
        </div>
        <div className="flex min-h-9 shrink-0 items-center gap-1.5 md:min-h-10">
          {primary ? (
            <button
              type="button"
              data-primary=""
              className={cn(DEPTH_PRIMARY, "h-10 rounded-[10px] px-4 text-[15px] md:h-9 md:rounded-lg md:px-3.5 md:text-[13px]", primary.phoneOnly && "md:hidden")}
              disabled={busy}
              onClick={primary.run}
            >
              {primary.label}
            </button>
          ) : null}
          <ResponsiveActionMenu
            title={draft.name || tt("Automation")}
            items={menu}
            trigger={
              <button type="button" aria-label={tt("More actions")} className={cn(backButton, "-mr-2 text-[#4b5563] md:mr-0")} disabled={deleting}>
                <Ellipsis className="h-5 w-5" />
              </button>
            }
          />
        </div>
      </FlowTopBar>
      {/* On a phone the state and what starts it are under the bar, and scroll with the page. */}
      <div className={cn("mx-auto flex w-full min-w-0 items-center gap-2 pt-1 text-[13px] leading-5 text-[#6b7280] md:hidden", FLOW_WIDTH, FLOW_GUTTER)}>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <span className="min-w-0 truncate">{subtitle}</span>
      </div>

      <div className={cn("mx-auto w-full pb-[calc(32px+env(safe-area-inset-bottom))] pt-3 md:pb-8 md:pt-5", FLOW_WIDTH, FLOW_GUTTER)}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <StateLine
              on={on}
              problems={problems}
              counts={data.counts}
              tracking={data.tracking}
              hasCheck={draft.steps.some((s) => s.type === "condition")}
              trigger={draft.trigger}
              config={draft.config}
              startsRecorded={data.startsRecorded !== false}
              onShowProblem={(p) => {
                setFlagged(true)
                setSelected(p.stepId ?? "trigger")
              }}
            />
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
            /* Sticky 24px from the top of the pane. Never taller than the
               window less the black bar, the header above it where it rests
               and the foot bar, so its foot is never under the Save bar,
               before the page is scrolled or after. */
            <aside className="sticky top-6 hidden lg:block">
              <div className={cn(card, "max-h-[calc(100dvh-58px-env(safe-area-inset-top,0px)-200px)] overflow-y-auto")}>
                {(wide ? panel : null) ?? <Summary draft={draft} problems={problems} onPick={(id) => setSelected(id ?? "trigger")} bare />}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {/*
        THE FOOT BAR, FROM 768px: Discard and Save, while there is something
        to save. The product editor keeps its Save at the foot of the pane on
        a computer; this one is there only when it has a job, so a flow with
        nothing unsaved has no bar at all. It is always in the layout (its
        64px are at the end of the page either way) and only shows and hides,
        on opacity and translate, so nothing on the page moves when it comes.
        Cmd or Ctrl and S saves from anywhere.
      */}
      <div
        data-flow-foot=""
        data-shown={dirty ? "" : undefined}
        inert={!dirty}
        className={cn(
          "sticky bottom-0 z-20 mt-auto hidden shrink-0 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:block",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div className="border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)]">
          <div className={cn("mx-auto flex h-16 items-center justify-between gap-4", FLOW_WIDTH, FLOW_GUTTER)}>
            <p className="text-[13px] font-medium text-[#1a1a2e]" aria-live="polite">
              {saving ? tt("Saving") : dirty ? tt("Unsaved changes") : ""}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={cn(secondaryDepth, "h-9 rounded-lg px-3.5 text-[13px]")} disabled={busy} onClick={discard}>
                {tt("Discard")}
              </button>
              <button type="button" className={cn(DEPTH_PRIMARY, "h-9 min-w-[64px] rounded-lg px-3.5 text-[13px]")} disabled={busy} onClick={() => void save()}>
                {saving ? tt("Saving") : tt("Save")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {wide === false ? (
        <BottomSheet isOpen={selected !== null && panel !== null} onClose={() => setSelected(null)} label={tt("Edit step")} hideFrom={null} aboveKeyboard maxHeight="min(90dvh, 760px)">
          {panel}
        </BottomSheet>
      ) : null}

      <Confirm
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={tt("Turn off {name}?", { name: draft.name })}
        body={tt("{active, plural, one {# person is} other {# people are}} partway through. Turning it off stops them where they are, and their remaining emails are not sent, now or if you turn it on again.", { active: data.counts.active })}
        cancel={tt("Keep it on")}
        confirm={tt("Turn off")}
        danger
        busy={switching}
        onConfirm={() => void setOn(false)}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tt("Delete {name}?", { name: draft.name })}
        body={on || data.counts.active > 0 ? tt("It stops at once for everyone partway through, and its history goes with it.") : tt("Its steps and history go with it.")}
        cancel={tt("Keep it")}
        confirm={deleting ? tt("Deleting") : tt("Delete")}
        danger
        busy={deleting}
        onConfirm={() => void remove()}
      />
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl p-0 sm:max-w-[420px]">
          <div className="p-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Leave without saving?")}</DialogTitle>
            <DialogDescription className="mt-1.5 text-[14px] text-[#6b7280]">{tt("Your changes to this flow are not saved yet.")}</DialogDescription>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => {
                setConfirmLeave(false)
                setSavedJson(JSON.stringify(draft))
                leave()
              }}
            >
              {tt("Leave")}
            </button>
            <button
              type="button"
              className={buttonPrimary}
              onClick={async () => {
                if (await save()) {
                  setConfirmLeave(false)
                  leave()
                }
              }}
            >
              {tt("Save and leave")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Confirm(props: { open: boolean; onOpenChange: (v: boolean) => void; title: string; body: string; cancel: string; confirm: string; danger?: boolean; busy?: boolean; onConfirm: () => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl p-0 sm:max-w-[420px]">
        <div className="p-5">
          <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{props.title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-[14px] text-[#6b7280]">{props.body}</DialogDescription>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
          <button type="button" className={buttonSecondary} onClick={() => props.onOpenChange(false)}>
            {props.cancel}
          </button>
          <button
            type="button"
            className={cn("inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-white disabled:opacity-50", props.danger ? "bg-[#c4290c] hover:bg-[#a8230a]" : "bg-[#1a1a2e] hover:bg-[#2a2a40]")}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirm}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── What it is doing, in one line ──────────────────────────────────── */

function StateLine(props: {
  on: boolean
  problems: Problem[]
  counts: BuilderData["counts"]
  tracking: boolean
  /** Before the engine's SQL has run, a check cannot be evaluated, so such a flow does not send at all. */
  hasCheck: boolean
  trigger: TriggerType
  config: TriggerConfig
  startsRecorded: boolean
  onShowProblem: (p: Problem) => void
}) {
  const { on, problems, counts } = props
  const toNews = audienceOf(props.trigger, props.config) === "subscribers"
  const notes: string[] = []
  if (!props.tracking && props.hasCheck) notes.push("Checks are not running yet on your account, so a flow with a check sends nothing for now. Remove the check to send without it.")
  if (!props.tracking && (props.trigger === "first_purchase" || props.trigger === "abandoned_checkout")) notes.push("This kind of automation is not running on your account yet, so it sends nothing for now.")
  if (props.trigger === "abandoned_checkout" && !props.startsRecorded) notes.push("Started checkouts are not recorded on your account yet, so this sends nothing for now.")
  const line = on
    ? props.tracking && counts.active > 0
      ? tt("{active, plural, one {# person is} other {# people are}} partway through. Edits reach them from their next step.", { active: counts.active })
      : tt("Sending. People who trigger it from now on go through it.")
    : problems.length > 0
      ? tt("{length, plural, one {# thing} other {# things}} to finish before it can go on.", { length: problems.length })
      : tt("Not sending. Turn it on and it starts for people who trigger it from then on.")
  return (
    <section
      aria-label={tt("Whether this automation is sending")}
      className={cn(
        "flex gap-3 rounded-xl border px-3.5 py-3",
        on ? "border-[#cde9d6] bg-[#f3fbf6]" : problems.length > 0 ? "border-[#f3e2a8] bg-[#fffbeb]" : "border-[#e5e7eb]/70 bg-white",
      )}
    >
      <span aria-hidden className={cn("mt-[5px] h-2 w-2 shrink-0 rounded-full", on ? "bg-[#1f9d55]" : problems.length > 0 ? "bg-[#e0a800]" : "bg-[#b5b5bd]")} />
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        <p className="text-[#1a1a2e]">{line}</p>
        {toNews ? <p className="text-[#4b5563]">{tt("Only people who asked for your news get it.")}</p> : null}
        {notes.map((n) => (
          <p key={n} className="mt-1 text-[#5c4300]">{n}</p>
        ))}
        {!on && problems.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
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
    </section>
  )
}

/* ─── The column of steps ────────────────────────────────────────────── */

const node =
  "group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition-[box-shadow,border-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]"
const nodeRest = "border-[#e5e7eb]/80 shadow-[0_1px_0_rgba(17,24,39,0.03),0_1px_3px_rgba(17,24,39,0.06)] hover:border-[#d5d7dd] hover:shadow-[0_1px_0_rgba(17,24,39,0.03),0_6px_16px_-8px_rgba(17,24,39,0.18)]"
/*
  THE STEP THAT IS OPEN, SAID QUIETLY. It used to take a near black border
  and a second near black ring outside it, 2px of ink round a white card:
  "too much visual weight", the loudest thing on the page for what is only
  "this is the one in the panel". Now it is the app's calm edge, the one a
  focused field and every /app search box wear (app/app/coupons/
  coupon-editor.tsx FIELD): a 1px border a step darker than the resting
  one, a 3px halo of near black at 6%, and the soft lift a card gets on
  hover, held. It reads as picked out, not outlined.

  No hover class on it on purpose: under `@media (hover: none)` a class
  naming hover:shadow loses its shadow while the finger's :hover sticks
  (app/globals.css), and this is the state a tap leaves behind.
*/
const nodeOn = "border-[#b9bdc5] shadow-[0_0_0_3px_rgba(17,17,19,0.06),0_6px_16px_-10px_rgba(17,24,39,0.2)]"

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
  const products = isPurchaseTrigger(draft.trigger) ? draft.config.product_ids?.length ?? 0 : 0
  return (
    <ol aria-label={tt("Steps")} className="mt-4 w-full">
      <li>
        <button type="button" className={cn(node, props.selected === "trigger" ? nodeOn : nodeRest)} onClick={() => props.onSelect("trigger")}>
          <StepMark kind="trigger" trigger={draft.trigger} />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-[#6b7280]">{tt("Starts when")}</span>
            <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{TRIGGERS[draft.trigger].sentence}</span>
            <span className="block truncate text-[12px] text-[#6b7280]">
              {entryText(draft.trigger, rule)}
              {isPurchaseTrigger(draft.trigger) ? ` · ${products > 0 ? `${products} ${products === 1 ? "product" : "products"}` : tt("Any product")}` : ""}
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
                  {s.type === "condition" ? <span className="block text-[12px] text-[#6b7280]">{tt("Everyone else leaves here.")}</span> : null}
                  {stats && stats.sent + stats.failed > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[12px] tabular-nums text-[#4b5563]">
                      <span>{tt("{value} sent", { value: stats.sent.toLocaleString(appLocale()) })}</span>
                      <span>{pct(stats.opened, stats.sent)} {tt("opened")}</span>
                      <span>{pct(stats.clicked, stats.sent)} {tt("clicked")}</span>
                      {stats.failed > 0 ? <span className="text-[#8a1c0f]">{tt("{failed} failed", { failed: stats.failed })}</span> : null}
                    </span>
                  ) : null}
                  {props.flagged && problems.length > 0 ? <span className="mt-1 block text-[12px] text-[#8a1c0f]">{problems[0].message}</span> : null}
                </span>
                {problems.length > 0 ? <span aria-label={tt("Needs attention")} className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e0a800] shadow-[0_0_0_3px_rgba(224,168,0,0.18)]" /> : null}
              </button>
            </li>
          </React.Fragment>
        )
      })}
      <Connector onAdd={(type) => props.onAdd(draft.steps.length, type)} label={draft.steps.length === 0 ? tt("Add the first step") : undefined} />
      <li className="flex justify-center">
        <span className="inline-flex h-7 items-center rounded-full border border-[#e3e4e8] bg-white px-3 text-[12px] font-medium text-[#6b7280]">{tt("End")}</span>
      </li>
    </ol>
  )
}

const AddButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }>(function AddButton({ label, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label ?? tt("Add a step here")}
      {...props}
      className={cn(
        "relative z-[1] inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#d5d7dd] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-[background-color,color,border-color] duration-100 hover:border-[#1a1a2e] hover:bg-[#1a1a2e] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
        label ? "px-3 text-[12px] font-medium" : "w-8",
      )}
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
      {label ? <span>{label}</span> : null}
    </button>
  )
})

function Connector({ onAdd, label }: { onAdd: (type: StepType) => void; label?: string }) {
  return (
    <li className="relative flex h-12 items-center justify-center">
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[#dfe1e6]" />
      <ResponsiveActionMenu
        title={tt("Add a step")}
        align="center"
        trigger={<AddButton label={label} />}
        items={[
          { label: tt("Email"), onClick: () => onAdd("email") },
          { label: tt("Wait"), onClick: () => onAdd("wait") },
          { label: tt("Check"), onClick: () => onAdd("condition") },
        ]}
      />
    </li>
  )
}

/* ─── The panel ──────────────────────────────────────────────────────── */

/*
  A field in the panel, focused with the app's calm edge (a lighter hairline
  and a soft 3px halo, as the coupon editor's fields and every /app search
  box), not the black ring it had: the panel is full of fields, and a black
  ring on whichever one has the caret was the heaviest line on the screen.
*/
const CALM_FOCUS = "transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]"
const field = cn("h-9 w-full rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px]", CALM_FOCUS)
const labelText = "mb-1.5 block text-[13px] font-medium text-[#1a1a2e]"
const hint = "mt-1.5 text-[12px] leading-[1.45] text-[#6b7280]"

function PanelHead({ kind, trigger, title, onClose }: { kind: Parameters<typeof StepMark>[0]["kind"]; trigger?: TriggerType; title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#eef0f2] px-4 py-3">
      <StepMark kind={kind} trigger={trigger} />
      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <button type="button" aria-label={tt("Close")} className={cn(iconButton, "h-9 w-9")} onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Done, in the phone's sheet only: the panel beside the steps on a computer has nothing to close into. */
function PanelDone({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" data-panel-done="" className={cn(DEPTH_PRIMARY, "h-10 shrink-0 rounded-[10px] px-4 text-[15px] sm:h-8 sm:rounded-lg sm:px-3.5 sm:text-[13px] lg:hidden")} onClick={onClose}>
      {tt("Done")}
    </button>
  )
}

function Choice({ checked, onChange, label, detail, disabled, children }: { checked: boolean; onChange: () => void; label: string; detail?: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
        /* The radio already says which; the card only lifts a little with it, as an open step does (nodeOn). */
        checked ? "border-[#b9bdc5] bg-white shadow-[0_0_0_3px_rgba(17,17,19,0.05)]" : "border-[#e3e4e8] bg-white hover:border-[#c9ccd3]",
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
  const purchase = isPurchaseTrigger(draft.trigger)
  const audience = audienceOf(draft.trigger, draft.config)
  const setAudience = (a: Audience) => onChange({ config: { ...draft.config, audience: a } })
  return (
    <div>
      <PanelHead kind="trigger" trigger={draft.trigger} title={tt("Starts when")} onClose={onClose} />
      <div className="space-y-6 px-4 py-4">
        <fieldset>
          <legend className={labelText}>{tt("What starts it")}</legend>
          <div className="space-y-2">
            {TRIGGER_ORDER.map((t) => (
              <Choice
                key={t}
                checked={draft.trigger === t}
                disabled={on && draft.trigger !== t}
                label={TRIGGERS[t].sentence}
                onChange={() =>
                  onChange({
                    trigger: t,
                    config: { ...draft.config, entry: entryRule(t, draft.config), product_ids: isPurchaseTrigger(t) ? draft.config.product_ids : undefined, audience: isPurchaseTrigger(t) ? draft.config.audience : undefined },
                  })
                }
              />
            ))}
          </div>
          {on ? <p className={hint}>{tt("Turn it off to change this. People already in it joined for the current reason.")}</p> : null}
          {draft.trigger === "abandoned_checkout" ? <p className={hint}>{tt("An hour after someone presses Pay and no order comes of it. Only people who ticked “Email me news and offers” at checkout, or are on your list, get it, and it stops the moment they buy.")}</p> : null}
        </fieldset>

        {purchase ? (
          <fieldset>
            <legend className={labelText}>{tt("Which purchases")}</legend>
            <div className="space-y-2">
              <Choice checked={!only} label={tt("Any product")} onChange={() => { setOnly(false); onChange({ config: { ...draft.config, product_ids: undefined } }) }} />
              <Choice checked={only} label={tt("Only these products")} detail={products.length === 0 ? tt("You have no products yet.") : undefined} disabled={products.length === 0} onChange={() => setOnly(true)} />
            </div>
            {only && products.length > 0 && picked.size === 0 ? <p className={hint} data-no-products-picked="">{tt("Tick at least one. With none ticked it starts for any product.")}</p> : null}
            {only && products.length > 0 ? (
              <div className="mt-2 max-h-[220px] overflow-y-auto rounded-xl border border-[#e3e4e8]">
                {products.map((p) => (
                  <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-[#f1f2f4] px-3 py-2 text-[13px] last:border-b-0 hover:bg-[#fafbfb] sm:min-h-0">
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

        {purchase ? (
          <fieldset>
            <legend className={labelText}>{tt("Who gets it")}</legend>
            <div className="space-y-2">
              <Choice checked={audience === "buyers"} label={tt("Every buyer")} detail={tt("For notes about their order: thanks, how to use it, a review.")} onChange={() => setAudience("buyers")} />
              <Choice checked={audience === "subscribers"} label={tt("Only buyers who asked for your news")} detail={tt("For offers and new work. They ticked the box at checkout or joined your list.")} onChange={() => setAudience("subscribers")} />
            </div>
          </fieldset>
        ) : null}

        {draft.trigger !== "first_purchase" ? (
          <fieldset>
            <legend className={labelText}>{tt("Who can go through it again")}</legend>
            <div className="space-y-2">
              {draft.trigger === "purchase" ? <Choice checked={rule.mode === "each"} label={tt("Every order")} detail={tt("Each order starts it once. The same order never starts it twice.")} onChange={() => setRule({ mode: "each" })} /> : null}
              <Choice checked={rule.mode === "once"} label={tt("Once per person")} detail={tt("Never twice for the same address.")} onChange={() => setRule({ mode: "once" })} />
              <Choice checked={rule.mode === "after"} label={tt("Again, after a while")} onChange={() => setRule({ mode: "after", days: rule.mode === "after" ? rule.days : draft.trigger === "abandoned_checkout" ? 7 : 30 })}>
                {rule.mode === "after" ? (
                  <span className="mt-2 flex items-center gap-2 text-[13px] text-[#4b5563]">
                    {tt("Not within")}
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={rule.days}
                      onChange={(e) => setRule({ mode: "after", days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                      className={cn("h-8 w-16 rounded-lg border border-[#d5d7dd] px-2 text-center text-[16px] outline-none sm:text-[13px]", CALM_FOCUS)}
                    />
                    {tt("days of their last time")}
                  </span>
                ) : null}
              </Choice>
            </div>
          </fieldset>
        ) : (
          <p className={hint}>{tt("A first order happens once, so each person goes through this once: when they first buy from you.")}</p>
        )}
        <p className={hint}>{tt("Only people who trigger it after you turn it on are sent anything. Someone who unsubscribes is never sent another email, wherever they are in the flow.")}</p>
      </div>
      <div data-panel-foot="" className="sticky bottom-0 z-[2] flex justify-end border-t border-[#eef0f2] bg-white px-4 py-3 lg:hidden">
        <PanelDone onClose={onClose} />
      </div>
    </div>
  )
}

/** The product a preview names: the first one this flow is for, else their newest, else a stand in. */
function sampleProductOf(draft: Draft, products: BuilderData["products"]): string | null {
  const only = isPurchaseTrigger(draft.trigger) ? draft.config.product_ids ?? [] : []
  return products.find((p) => only.includes(p.id))?.title ?? products[0]?.title ?? null
}

function StepPanel(props: {
  flowId: string
  trigger: TriggerType
  steps: FlowStep[]
  step: FlowStep
  stats?: StepStats
  problems: Problem[]
  accountEmail: string | null
  look: Identity | null
  sampleProduct: string | null
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
      {/*
        THE STEP'S ACTIONS, ALWAYS IN REACH. In the phone's sheet the foot is
        stuck to the bottom of the sheet (which sits on the keyboard), so
        Move, Remove and Done are there however long the email is, with no
        scroll to the end of it first. Move up and down are arrows on a
        phone, so the row fits 360px with Done at its end.
      */}
      <div data-panel-foot="" className="sticky bottom-0 z-[2] flex items-center gap-2 border-t border-[#eef0f2] bg-white px-4 py-3 lg:static">
        <button type="button" className={cn(PANEL_BUTTON, "max-sm:w-10 max-sm:px-0")} disabled={i <= 0} onClick={() => props.onMove(-1)} aria-label={tt("Move up")}>
          <ArrowUp aria-hidden className="h-4 w-4 sm:hidden" />
          <span className="max-sm:hidden">{tt("Move up")}</span>
        </button>
        <button type="button" className={cn(PANEL_BUTTON, "max-sm:w-10 max-sm:px-0")} disabled={i >= steps.length - 1} onClick={() => props.onMove(1)} aria-label={tt("Move down")}>
          <ArrowDown aria-hidden className="h-4 w-4 sm:hidden" />
          <span className="max-sm:hidden">{tt("Move down")}</span>
        </button>
        <button type="button" className={PANEL_REMOVE} onClick={props.onRemove}>
          {tt("Remove")}
        </button>
        <PanelDone onClose={props.onClose} />
      </div>
    </div>
  )
}

function EmailFields(props: { flowId: string; trigger: TriggerType; step: Extract<FlowStep, { type: "email" }>; stats?: StepStats; accountEmail: string | null; look: Identity | null; sampleProduct: string | null; onChange: (s: FlowStep) => void }) {
  const { step } = props
  const { toast } = useToast()
  const [testing, setTesting] = React.useState(false)
  const set = (config: Partial<typeof step.config>) => props.onChange({ ...step, config: { ...step.config, ...config } })
  const fields = fieldsFor(props.trigger)
  const test = async () => {
    setTesting(true)
    try {
      const res = await fetch(`/api/automations/flows/${props.flowId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) })
      const out = await res.json().catch(() => ({}))
      toast(res.ok ? { title: tt("Test sent"), description: tt("To {to}. Names and products are filled with examples.", { to: out.to }) } : { title: tt("Test not sent"), description: out.error ?? tt("Try again."), variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }
  /*
    PREVIEW: the email as a buyer gets it, filled and framed exactly as a
    send is, with a sample reader (lib/automations/preview, from the
    creator as the send path reads them, which the page brings). Shown in
    the composer's own preview (components/email/compose/preview-layer), a
    screen of its own on every size with Phone and Desktop, over the sheet
    the step is edited in on a phone. Drawn in the browser and only while
    open; if the page could not bring the creator's look, the server draws
    it instead (app/api/automations/flows/[id]/preview).
  */
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [fetched, setFetched] = React.useState<{ html: string; subject: string; previewText: string; fromName: string } | null>(null)
  const [previewing, setPreviewing] = React.useState(false)
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("mobile")
  const local = React.useMemo(
    () => (previewOpen && props.look ? { ...previewFlowEmail(step, props.trigger, props.look, props.sampleProduct), fromName: props.look.fromName } : null),
    [previewOpen, props.look, props.trigger, props.sampleProduct, step],
  )
  const preview = local ?? fetched
  const openPreview = async () => {
    if (props.look) return setPreviewOpen(true)
    if (previewing) return
    setPreviewing(true)
    try {
      const res = await fetch(`/api/automations/flows/${props.flowId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, product: props.sampleProduct }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || typeof out.html !== "string") throw new Error(out.error)
      setFetched({ html: out.html, subject: String(out.subject ?? ""), previewText: String(out.previewText ?? ""), fromName: String(out.fromName ?? "") })
      setPreviewOpen(true)
    } catch (error) {
      toast({ title: tt("No preview"), description: (error as Error)?.message || tt("Check your connection and try again."), variant: "destructive" })
    } finally {
      setPreviewing(false)
    }
  }
  const s = props.stats
  return (
    <>
      {preview ? (
        <PreviewLayer
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          html={preview.html}
          senderName={preview.fromName || tt("You")}
          subject={preview.subject}
          previewText={preview.previewText}
          mode={previewMode}
          onMode={setPreviewMode}
        />
      ) : null}
      {s && s.sent + s.failed > 0 ? (
        <dl className="grid grid-cols-4 overflow-hidden rounded-xl border border-[#eef0f2] text-center">
          {[
            [tt("Sent"), s.sent.toLocaleString(appLocale())],
            [tt("Opened"), pct(s.opened, s.sent)],
            [tt("Clicked"), pct(s.clicked, s.sent)],
            ["Failed", s.failed.toLocaleString(appLocale())],
          ].map(([k, v], n) => (
            <div key={k} className={cn("px-2 py-2", n > 0 && "border-l border-[#eef0f2]")}>
              <dt className="text-[11px] font-medium text-[#6b7280]">{k}</dt>
              <dd className={cn("text-[14px] font-semibold tabular-nums", k === "Failed" && s.failed > 0 ? "text-[#8a1c0f]" : "text-[#1a1a2e]")}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div>
        <label className={labelText} htmlFor={`subject-${step.id}`}>{tt("Subject")}</label>
        <input id={`subject-${step.id}`} className={field} value={step.config.subject} maxLength={200} onChange={(e) => set({ subject: e.target.value })} placeholder={tt("Welcome, {{first_name}}")} />
      </div>
      <div>
        <label className={labelText} htmlFor={`preview-${step.id}`}>
          {tt("Preview text")} <span className="font-normal text-[#6b7280]">{tt("(optional)")}</span>
        </label>
        <input id={`preview-${step.id}`} className={field} value={step.config.preview_text ?? ""} maxLength={200} onChange={(e) => set({ preview_text: e.target.value || undefined })} placeholder={tt("Shown after the subject in most inboxes")} />
      </div>
      <div>
        <div className="mb-1.5 flex min-h-8 items-center justify-between gap-3">
          <span className={cn(labelText, "mb-0")}>{tt("Email")}</span>
          <button type="button" data-flow-preview="" className={cn(PANEL_BUTTON, "-my-1")} disabled={previewing} onClick={() => void openPreview()}>
            {previewing ? tt("Opening") : tt("Preview")}
          </button>
        </div>
        <BodyEditor key={step.id} label={tt("Email body")} value={step.config.body} onChange={(body) => set({ body })} links={fields.filter((f) => f.link).map((f) => ({ label: f.label, href: `{{${f.key}}}` }))} />
        <p className={hint}>
          {tt("Fields: {value}. “Hi", { value: fields.filter((f) => !f.link).map((f) => `{{${f.key}}}`).join(", ") })} {"{{first_name}}"}{tt(",” reads “Hi there,” when a name is not known, and")} {"{{creator_name}}"} {tt("is the name on your profile when the email is sent. Every email ends with your name and an unsubscribe link.")}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f7f8] px-3 py-2.5">
        <p className="min-w-0 text-[12px] text-[#4b5563]">
          {props.accountEmail ? <>{tt("Send this one to")} <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{props.accountEmail}</span>{tt(", as it is now.")}</> : tt("Your account has no email address for a test.")}
        </p>
        <button type="button" className={PANEL_BUTTON} disabled={testing || !props.accountEmail} onClick={() => void test()}>
          {testing ? tt("Sending") : tt("Send test")}
        </button>
      </div>
    </>
  )
}

function WaitFields({ step, onChange }: { step: Extract<FlowStep, { type: "wait" }>; onChange: (s: FlowStep) => void }) {
  return (
    <div>
      <span className={labelText}>{tt("Wait for")}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          aria-label={tt("How long")}
          className={cn(field, "w-24 text-center")}
          value={step.config.amount || ""}
          onChange={(e) => onChange({ ...step, config: { ...step.config, amount: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
        />
        <select
          aria-label={tt("Unit")}
          className={cn(field, "w-auto pr-8")}
          value={step.config.unit}
          onChange={(e) => onChange({ ...step, config: { ...step.config, unit: e.target.value as WaitUnit } })}
        >
          <option value="minutes">{tt("minutes")}</option>
          <option value="hours">{tt("hours")}</option>
          <option value="days">{tt("days")}</option>
        </select>
      </div>
      <p className={hint}>{tt("Counted from the step before. The next step goes out within the hour after the wait ends, in any time zone the same moment.")}</p>
    </div>
  )
}

function CheckFields({ steps, step, onChange }: { steps: FlowStep[]; step: Extract<FlowStep, { type: "condition" }>; onChange: (s: FlowStep) => void }) {
  const hasEmailBefore = Boolean(emailBefore(steps, step.id))
  return (
    <fieldset>
      <legend className={labelText}>{tt("Continue only if they")}</legend>
      <div className="space-y-2">
        {(Object.keys(CONDITIONS) as ConditionCheck[]).map((c) => {
          const needs = CONDITIONS[c].needsEmailBefore && !hasEmailBefore
          return (
            <Choice
              key={c}
              checked={step.config.check === c}
              disabled={needs && step.config.check !== c}
              label={CONDITIONS[c].phrase.replace(/^they /, "")}
              detail={needs ? tt("Needs an email before this step.") : undefined}
              onChange={() => onChange({ ...step, config: { check: c } })}
            />
          )
        })}
      </div>
      <p className={hint}>{tt("Everyone else leaves the flow here and is sent nothing more from it. Opens are a hint: some mail apps hide them.")}</p>
    </fieldset>
  )
}

/* ─── What happens, read back ────────────────────────────────────────── */

function Summary({ draft, problems, onPick, bare, className }: { draft: Draft; problems: Problem[]; onPick: (stepId: string | null) => void; bare?: boolean; className?: string }) {
  const lines = timeline(draft.steps)
  return (
    <section aria-label={tt("What happens")} className={cn(bare ? "" : card, className)}>
      <div className="px-4 pb-4 pt-3.5">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{tt("What happens")}</h2>
        <ol className="mt-3 space-y-2.5">
          <li className="flex gap-3 text-[13px]">
            <span className="w-[92px] shrink-0 text-[#6b7280]">{tt("When")}</span>
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
            <span className="w-[92px] shrink-0 text-[#6b7280]">{tt("Then")}</span>
            <span className="text-[#4b5563]">{tt("The flow ends for them.")}</span>
          </li>
        </ol>
      </div>
      {problems.length > 0 ? (
        <div className="border-t border-[#eef0f2] px-4 py-3.5">
          <h3 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Before it can go on")}</h3>
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
        <p>{tt("Each email goes to each person once, however often they trigger it. Someone who unsubscribes gets nothing more.")}</p>
        <p>{tt("Edits reach people already in it from their next step. Turning it off stops everyone where they are.")}</p>
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
      toast(res.ok ? { title: out.retried > 0 ? tt("Trying again") : tt("Nothing to try again"), description: out.retried > 0 ? tt("{retried, plural, one {# step is} other {# steps are}} back in the queue.", { retried: out.retried }) : tt("Interrupted sends are never sent twice.") } : { title: tt("Not retried"), description: out.error ?? tt("Try again."), variant: "destructive" })
      if (res.ok) router.refresh()
    } finally {
      setRetrying(false)
    }
  }

  const where = (r: RunView) => {
    if (r.status === "active") {
      const s = steps.find((x) => x.id === r.current_step_id)
      if (!s) return tt("In progress")
      return s.type === "email" ? `Next: ${stepKindName(steps, s)}` : s.type === "wait" ? tt("Waiting {s}", { s: waitText(s) }) : tt("At the check")
    }
    if (r.status === "completed") return tt("Went through every step")
    return r.exit_reason ?? RUN_STATUS[r.status]?.label ?? r.status
  }

  return (
    <section aria-label={tt("Activity")} className={cn(card, "mt-10 overflow-hidden")}>
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#eef0f2] px-4 py-2.5">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Activity")}</h2>
        {data.tracking && total > 0 ? (
          <p className="flex flex-wrap gap-x-3 text-[12px] tabular-nums text-[#4b5563]">
            <span>{tt("{active} in progress", { active: counts.active })}</span>
            <span>{tt("{finished} finished", { finished: counts.finished })}</span>
            <span>{tt("{left} left or stopped", { left: counts.left })}</span>
            {counts.failed > 0 ? <span className="text-[#8a1c0f]">{tt("{failed} failed", { failed: counts.failed })}</span> : null}
          </p>
        ) : null}
        {data.failedJobs > 0 && on ? (
          <button type="button" className={cn(PANEL_BUTTON, "ml-auto")} disabled={retrying} onClick={() => void retry()}>
            {retrying ? tt("Retrying") : tt("Try failed again")}
          </button>
        ) : null}
      </div>
      {data.runs.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">
          {on ? tt("Nobody has gone through it yet. The first person shows up here with where they joined.") : tt("Nobody has gone through it yet.")}
        </p>
      ) : (
        <ScrollEdge>
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
              <tr>
                <th data-scroll-edge="" className="sticky left-0 z-[1] h-9 bg-[#fafbfb] px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Contact")}</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("From")}</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Started")}</th>
                <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Where they are")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {data.runs.map((r) => {
                const st = RUN_STATUS[r.status] ?? RUN_STATUS.cancelled
                return (
                  <tr key={r.id} className="group hover:bg-[#fafbfb]">
                    <td data-scroll-edge="" className="sticky left-0 z-[1] h-12 bg-white px-3 text-[13px] font-medium text-[#1a1a2e] group-hover:bg-[#fafbfb]">
                      <span className="block max-w-[170px] truncate sm:max-w-[220px]">{r.email}</span>
                    </td>
                    <td className="h-12 px-3 text-[13px] text-[#4b5563]">
                      <span className="block max-w-[200px] truncate">{joinedSentence(r.source_detail, r.trigger_type) ?? tt("Not recorded")}</span>
                    </td>
                    <td className="h-12 whitespace-nowrap px-3 text-[13px] tabular-nums text-[#4b5563]">{day(r.started_at)}</td>
                    <td className="h-12 px-3 text-[13px]">
                      <span className="flex max-w-[280px] items-center gap-2">
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
        </ScrollEdge>
      )}
    </section>
  )
}
