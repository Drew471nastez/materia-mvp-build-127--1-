"use client"

/**
 * Publish, and everything a creator needs to know about it in one control.
 *
 * The states are not decoration — each one answers a different question the
 * person is actually asking:
 *
 *   Publish            "is this online?"        no
 *   Publishing…        "is it working?"         yes, right now
 *   Live · view        "where is it?"           here, and you can open it
 *   Update             "is what I see online?"  no, you have newer edits
 *
 * The last one is the reason this is not a boolean. A creator who has edited
 * since publishing is looking at something the world cannot see, and a button
 * that just says "Live" would be lying to them.
 */

import * as React from "react"
import { Check, Copy, ExternalLink, Globe, Loader2, Rocket, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

export type PublishState =
  | { kind: "unpublished" }
  /** `startedAt` drives the running count — publishing a real site takes long
   *  enough that a spinner with no number reads as "stuck". */
  | { kind: "publishing"; startedAt: number }
  | { kind: "live"; url: string; stale: boolean; tookMs?: number }
  | { kind: "failed"; message: string; details?: string[] }

export function PublishButton({
  state,
  onPublish,
  compact,
}: {
  state: PublishState
  onPublish: () => void
  /** Mobile: icon-first, so it fits beside the site name. */
  compact?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  // The panel is only ever opened by the person clicking; closing on an
  // outside click is what stops it sitting over the editor forever.
  React.useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  const live = state.kind === "live"
  const busy = state.kind === "publishing"

  /**
   * Seconds since the button was pressed.
   *
   * A spinner alone gives no way to tell "working" from "hung", and publishing
   * is the one action here that reaches a build, a storage upload and a
   * database write — the slowest thing in the editor and the one somebody is
   * most anxious about. A number that moves is the difference between waiting
   * and wondering.
   */
  /**
   * How long the last publish took, shown for a few seconds afterwards.
   *
   * The confirmation is the point: "Live" alone looks identical whether the
   * button was pressed a second ago or a week ago, so somebody who has just
   * published and is not sure it worked has nothing to read. A duration is
   * proof that something actually happened, and it gets out of the way.
   */
  const tookMs = state.kind === "live" ? state.tookMs : undefined
  const [showTook, setShowTook] = React.useState(false)

  React.useEffect(() => {
    if (tookMs === undefined) return
    setShowTook(true)
    const timer = setTimeout(() => setShowTook(false), 6000)
    return () => clearTimeout(timer)
  }, [tookMs])

  const startedAt = state.kind === "publishing" ? state.startedAt : null
  const [elapsed, setElapsed] = React.useState(0)

  React.useEffect(() => {
    if (startedAt === null) {
      setElapsed(0)
      return
    }
    // Tenths, because a publish that finishes in under a second should not
    // read as "0s" — it should read as fast.
    const tick = () => setElapsed((Date.now() - startedAt) / 1000)
    tick()
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [startedAt])

  return (
    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (live && !state.stale) setOpen((v) => !v)
          else onPublish()
        }}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-70",
          live && !state.stale
            ? "border border-border text-foreground hover:bg-muted"
            : "bg-[#7c3fed] text-white hover:bg-[#6d33d8]",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className={cn(compact && "sr-only")}>
              Publishing… {elapsed.toFixed(1)}s
            </span>
          </>
        ) : live && !state.stale ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className={cn(compact && "sr-only")}>
              {showTook && tookMs !== undefined
                ? `Live · ${(tookMs / 1000).toFixed(1)}s`
                : "Live"}
            </span>
          </>
        ) : live && state.stale ? (
          <>
            <Rocket className="h-3.5 w-3.5" />
            <span className={cn(compact && "sr-only")}>Update</span>
          </>
        ) : (
          <>
            <Rocket className="h-3.5 w-3.5" />
            <span className={cn(compact && "sr-only")}>Publish</span>
          </>
        )}
      </button>

      {state.kind === "failed" && (
        <div className="absolute right-0 top-10 z-50 w-[300px] rounded-[10px] border border-destructive/40 bg-background p-3 shadow-lg">
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {state.message}
          </p>
          {state.details && state.details.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-border pt-2">
              {state.details.slice(0, 4).map((line, i) => (
                <li key={i} className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && live && (
        <div className="absolute right-0 top-10 z-50 w-[300px] rounded-[10px] border border-border bg-background p-3 shadow-lg">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Globe className="h-3 w-3" />
            Your site is live at
          </p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-[6px] bg-muted px-2 py-1.5 font-mono text-[11px]">
              {state.url.replace(/^https:\/\//, "")}
            </code>
            <button
              type="button"
              aria-label="Copy address"
              onClick={() => {
                void navigator.clipboard.writeText(state.url).then(() => setCopied(true))
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open site"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); onPublish() }}
            className="mt-2.5 w-full rounded-[7px] border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Publish again
          </button>
        </div>
      )}
    </div>
  )
}
