"use client"

/**
 * ===========================================================================
 *  DELETE, IN SETTINGS › ADVANCED (round 33)
 * ===========================================================================
 * The card and its dialog, out of settings-section.tsx. Wire it in place of
 * the Delete card and its Dialog there:
 *
 *     {head.can.delete ? <DeleteCommunity head={head} /> : null}
 *
 * What the owner sees (lib/communities/community-deletion.ts has the rules):
 *
 *   NOBODY PAYS     "Type <name> to delete it." and Delete, as before.
 *   SOMEBODY PAYS   how many pay, and two ways, the first chosen:
 *                     at the end of what they paid for: renewals stop now,
 *                     members keep access until <date>, then it is deleted;
 *                     undo until then
 *                     now, with refunds: memberships end today, each member
 *                     gets back the unused part, about <amount> in all; not
 *                     undoable
 *                   then the typed name, and the button says what it does.
 *   SCHEDULED       the card says when it goes and how many memberships are
 *                   stopped, with Keep the community (Undo) while it can.
 *
 * The plan is asked from the server when the card shows and again when the
 * dialog opens (GET .../delete), so the numbers are today's. A dialog on a
 * computer, a sheet on a phone (./parts Dialog).
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { money } from "@/lib/memberships/state"
import type { DeletionMode, DeletionPlanView } from "@/lib/communities/community-deletion"
import type { CommunityHead } from "./view-types"
import { ChoiceCards, Dialog, EditorCard, buttonPrimary, buttonSecondary, errorText, field, send, useToast } from "./parts"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale } from "@/lib/i18n/format"

const dangerButton = "inline-flex h-10 items-center justify-center rounded-lg bg-[#b42318] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#9a1d14] disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
const dangerOutline = "inline-flex h-10 items-center rounded-lg border border-[#fecaca] bg-white px-3.5 text-[13px] font-medium text-[#b42318] transition-colors hover:bg-[#fef2f2] sm:h-8 sm:px-3"

function longDate(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ""
  return new Intl.DateTimeFormat(appLocale(), { month: "long", day: "numeric", year: "numeric" }).format(t)
}

export function DeleteCommunity({ head }: { head: CommunityHead }) {
  const router = useRouter()
  const toast = useToast()
  const [plan, setPlan] = React.useState<DeletionPlanView | null>(null)
  const [open, setOpen] = React.useState(false)
  const [keeping, setKeeping] = React.useState(false)
  const [mode, setMode] = React.useState<DeletionMode>("period_end")
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const read = React.useCallback(async () => {
    const res = await send<DeletionPlanView>(`/api/app/community/${head.id}/delete`, "GET")
    if (res.ok) setPlan(res.data)
    return res.ok ? res.data : null
  }, [head.id])

  React.useEffect(() => {
    void read()
  }, [read])

  const start = () => {
    setTyped("")
    setMode("period_end")
    setError(null)
    setOpen(true)
    void read()
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await send<{ deleted?: boolean; scheduled?: DeletionPlanView["scheduled"] }>(`/api/app/community/${head.id}/delete`, "POST", { confirm: typed, mode: plan && plan.paying > 0 ? mode : undefined })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, tt("That did not go through. Nothing changed. Try again.")))
    if (res.data.deleted) {
      router.push("/app/community")
      return
    }
    setOpen(false)
    toast(res.data.scheduled ? tt("Deleting on {date}", { date: longDate(res.data.scheduled.deleteAt) }) : tt("Deleting"))
    await read()
    router.refresh()
  }

  const keep = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}/delete`, "POST", { undo: true })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, tt("That did not go through. Try again.")))
    setKeeping(false)
    toast(tt("The community stays"))
    await read()
    router.refresh()
  }

  const scheduled = plan?.scheduled ?? null
  const paying = plan?.paying ?? 0
  const until = longDate(plan?.lastPaidUntil)
  const estimate = plan ? money(plan.refundEstimateCents, plan.currency) : ""
  const matches = typed.trim() === head.name.trim() || typed.trim() === head.slug

  if (scheduled) {
    const date = longDate(scheduled.deleteAt)
    return (
      <>
        <EditorCard
          title={tt("Deleting on {date}", { date })}
          hint={
            scheduled.mode === "now"
              ? tt("Memberships ended with refunds. It is deleted once every refund has gone through.")
              : tt("Memberships stopped renewing and nobody new can join. Members can read it until then. {stopped} of {total} memberships stopped.", { stopped: scheduled.stopped, total: scheduled.total })
          }
          action={
            scheduled.canUndo ? (
              <button type="button" onClick={() => { setError(null); setKeeping(true) }} className={buttonSecondary} data-delete-keep="">
                {tt("Keep the community")}
              </button>
            ) : null
          }
        >
          {scheduled.failing > 0 ? (
            <p className="rounded-lg border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b4e00]" data-delete-failing="">
              {tt("{n, plural, one {# membership has} other {# memberships have}} not gone through with Stripe yet. Storelib tries again every few minutes.", { n: scheduled.failing })}
            </p>
          ) : null}
        </EditorCard>
        <Dialog
          open={keeping}
          onClose={() => setKeeping(false)}
          title={tt("Keep this community?")}
          footer={
            <>
              <button type="button" onClick={() => setKeeping(false)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
                {tt("Cancel")}
              </button>
              <button type="button" disabled={busy} onClick={() => void keep()} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-delete-keep-confirm="">
                {busy ? tt("Working") : tt("Keep the community")}
              </button>
            </>
          }
        >
          <p className="text-[14px] leading-relaxed text-[#4b5563]">{tt("Memberships renew again as before and the community comes back the way it was. Members are told by email.")}</p>
          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
              {error}
            </p>
          ) : null}
        </Dialog>
      </>
    )
  }

  return (
    <>
      <EditorCard
        title={tt("Delete")}
        hint={paying > 0 ? tt("{n, plural, one {# member pays} other {# members pay}} for it. Their memberships are cancelled first, then it is deleted.", { n: paying }) : tt("It disappears for everyone. Orders and payments are kept.")}
        action={
          <button type="button" onClick={start} className={dangerOutline} data-delete-open="">
            {tt("Delete community")}
          </button>
        }
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tt("Delete this community?")}
        wide={paying > 0}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              {tt("Cancel")}
            </button>
            <button type="button" disabled={!matches || busy || !plan} onClick={() => void remove()} className={dangerButton} data-delete-confirm="">
              {busy ? tt("Working") : paying === 0 ? tt("Delete") : mode === "now" ? tt("End memberships and delete") : tt("Cancel memberships and delete")}
            </button>
          </>
        }
      >
        {paying > 0 ? (
          <div className="space-y-4" data-delete-paid="">
            <p className="text-[14px] leading-relaxed text-[#4b5563]">
              {tt("{n, plural, one {# member pays} other {# members pay}} for this community. Nobody new can join from the moment you confirm, and every member gets an email.", { n: paying })}
            </p>
            <ChoiceCards
              value={mode}
              onChange={setMode}
              label={tt("When memberships end")}
              rows
              options={[
                {
                  value: "period_end",
                  title: tt("When their paid time runs out"),
                  detail: tt("Renewals stop now and nobody is charged again. Members keep access until {date}, then the community is deleted. You can undo this until then.", { date: until }),
                },
                {
                  value: "now",
                  title: tt("Now, with refunds"),
                  detail: tt("Memberships end today. Each member gets back what they paid for the time left, about {amount} in all. This cannot be undone.", { amount: estimate }),
                },
              ]}
            />
            {plan && !plan.ready ? <p className="text-[13px] text-[#b42318]">{tt("Deleting a community members pay for is not switched on yet. Archive it for now; nobody can join an archived community.")}</p> : null}
          </div>
        ) : null}
        <p className={cn("text-[14px] leading-relaxed text-[#4b5563]", paying > 0 && "mt-4")}>
          <Rich text={tt("Type {name} to delete it.")} parts={{ name: <span className="font-semibold text-[#1a1a2e]">{head.name}</span> }} />
        </p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={tt("Community name")} autoComplete="off" className={cn(field, "mt-3 h-11 sm:h-10")} data-delete-name="" />
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  )
}
