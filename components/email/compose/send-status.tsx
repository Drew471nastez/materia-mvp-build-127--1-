"use client"

/**
 * Where a send is, read from the server: how many have gone, how many are
 * waiting, and why any did not go, in words. While it runs the page asks
 * again every few seconds (components/email/compose/composer.tsx), so the
 * numbers here are never the page's own guess.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { outstanding, wentOut, type CampaignStatus, type RecipientCounts } from "@/lib/email-campaigns/state"
import { buttonPrimary, buttonSecondary, card } from "./ui"

const n = (v: number) => v.toLocaleString("en-US")

export function SendStatus({
  status,
  counts,
  lastError,
  audienceLabel,
  onStop,
  onRetry,
  onBack,
}: {
  status: CampaignStatus
  counts: RecipientCounts | null
  lastError: string | null
  audienceLabel: string
  onStop: () => Promise<void>
  onRetry: () => Promise<void>
  onBack: () => void
}) {
  const [busy, setBusy] = React.useState<null | "stop" | "retry">(null)
  const c = counts
  const out = c ? wentOut(c) : 0
  const waiting = c ? outstanding(c) : 0
  const total = c?.total ?? 0
  const running = status === "queued" || status === "sending"
  const done = total ? Math.round(((total - waiting) / total) * 100) : 0

  const headline =
    status === "queued"
      ? "Getting ready to send"
      : status === "sending"
        ? `Sending to ${n(total)} ${total === 1 ? "person" : "people"}`
        : status === "sent"
          ? `Sent to ${n(out)} ${out === 1 ? "person" : "people"}`
          : status === "partially_failed"
            ? `Sent to ${n(out)} of ${n(total)}`
            : status === "cancelled"
              ? `Stopped after ${n(out)}`
              : "Not sent"

  const rows: { label: string; value: number; tone?: "critical" }[] = c
    ? [
        { label: "Sent", value: out },
        ...(c.delivered ? [{ label: "Delivered", value: c.delivered }] : []),
        ...(c.bounced ? [{ label: "Bounced", value: c.bounced, tone: "critical" as const }] : []),
        ...(c.failed ? [{ label: "Not sent", value: c.failed, tone: "critical" as const }] : []),
        ...(c.skipped ? [{ label: "Left the list before their turn", value: c.skipped }] : []),
        ...(waiting ? [{ label: "Waiting", value: waiting }] : []),
      ]
    : []

  return (
    <section aria-label="Send" className={cn(card, "overflow-hidden")} data-send-status={status}>
      <div className="px-5 pb-4 pt-5">
        <p className="text-[18px] font-semibold text-[#1a1a2e]" aria-live="polite">
          {headline}
        </p>
        <p className="mt-0.5 text-[13px] text-[#6b7280]">{audienceLabel}</p>
        {running ? (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#eef0f2]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={done} aria-label="Sent so far">
            <div className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-500" style={{ width: `${Math.max(3, done)}%` }} />
          </div>
        ) : null}
      </div>
      {rows.length ? (
        <dl className="divide-y divide-[#f1f2f4] border-t border-[#eef0f2]">
          {rows.map((r) => (
            <div key={r.label} className="flex h-11 items-center justify-between px-5 text-[14px]">
              <dt className="text-[#4b5563]">{r.label}</dt>
              <dd className={cn("font-medium tabular-nums", r.tone === "critical" ? "text-[#b42318]" : "text-[#1a1a2e]")}>{n(r.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {lastError ? (
        <div className="border-t border-[#eef0f2] bg-[#fdf1ef] px-5 py-3 text-[13px] text-[#8a1c0f]" role="status">
          {lastError}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
        {running ? (
          <button
            type="button"
            className={cn(buttonSecondary, "text-[#b42318]")}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("stop")
              await onStop()
              setBusy(null)
            }}
          >
            {busy === "stop" ? "Stopping…" : "Stop sending"}
          </button>
        ) : null}
        {!running && c && c.failed > 0 && (status === "partially_failed" || status === "failed") ? (
          <button
            type="button"
            className={buttonSecondary}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("retry")
              await onRetry()
              setBusy(null)
            }}
          >
            {busy === "retry" ? "Sending…" : `Send again to the ${n(c.failed)} not sent`}
          </button>
        ) : null}
        <button type="button" className={buttonPrimary} onClick={onBack}>
          Back to emails
        </button>
      </div>
    </section>
  )
}
