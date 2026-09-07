"use client"

/**
 * The mobile sheet: everything about the site that is not the pane you are
 * looking at.
 *
 * A sheet rather than a dropdown because a dropdown anchored to a 32px button
 * at the top of a phone opens downward over the content and is dismissed by a
 * tap the user has to aim. A sheet comes from the edge the thumb is already
 * near, and the backdrop is the dismiss target.
 *
 * It renders at the ROOT of the editor, not inside the header, so it is not
 * clipped by the header's own bounds — and it sits above the bottom nav
 * deliberately: while the sheet is open the nav is not the thing being used.
 */

import * as React from "react"
import { Check, Copy, Download, ExternalLink, Globe, History, Loader2, RotateCcw, Rocket, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PublishState } from "./publish-button"

export function SiteSheet({
  open,
  onClose,
  siteName,
  siteId,
  state,
  onPublish,
  onHistory,
}: {
  open: boolean
  onClose: () => void
  siteName: string
  siteId: string
  state: PublishState
  onPublish: () => void
  onHistory: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  /**
   * Escape closes it, and the page behind it does not scroll while it is open
   * — on iOS a scrollable body under a sheet is how you end up dragging the
   * page instead of the sheet.
   */
  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const live = state.kind === "live"
  const busy = state.kind === "publishing"

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={siteName}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 motion-safe:animate-in motion-safe:fade-in"
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-[16px] border-t border-border bg-background",
          "pb-[max(16px,env(safe-area-inset-bottom))] motion-safe:animate-in motion-safe:slide-in-from-bottom",
        )}
      >
        {/* The grabber says "this drags from here" before anyone reads a word. */}
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <p className="truncate text-sm font-medium">{siteName}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4">
          {live && (
            <div className="rounded-[10px] border border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Globe className="h-3 w-3" />
                {state.stale ? "Live, with newer edits" : "Live at"}
              </p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-[7px] bg-muted px-2.5 py-2 font-mono text-[11px]">
                  {state.url.replace(/^https:\/\//, "")}
                </code>
                <button
                  type="button"
                  aria-label="Copy address"
                  onClick={() => void navigator.clipboard.writeText(state.url).then(() => setCopied(true))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-border text-muted-foreground"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={state.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open site"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-border text-muted-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {state.kind === "failed" && (
            <div className="rounded-[10px] border border-destructive/40 p-3">
              <p className="text-xs text-destructive">{state.message}</p>
              {state.details && state.details.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {state.details.slice(0, 3).map((line, i) => (
                    <li key={i} className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/*
            48px tall, which is the tap target this needs — the desktop
            button is 32px and that is a miss on a phone, not a style choice.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onPublish()
              if (live && !state.stale) onClose()
            }}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-sm font-medium",
              "disabled:cursor-not-allowed disabled:opacity-70",
              live && !state.stale
                ? "border border-border text-foreground"
                : "bg-[#7c3fed] text-white",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : live ? (
              <>
                <RotateCcw className="h-4 w-4" />
                {state.stale ? "Update the live site" : "Publish again"}
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Publish
              </>
            )}
          </button>

          {/* The two actions that have no room in a phone header. Same 48px
              target as publish — a 32px icon button is a miss on a phone. */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onHistory}
              className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
            >
              <History className="h-4 w-4" />
              History
            </button>
            <a
              href={`/api/sites/${siteId}/export`}
              className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
