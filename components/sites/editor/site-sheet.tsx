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
 * It is the app's shared sheet (components/ui/bottom-sheet.tsx), so it rises,
 * follows the thumb, flicks closed and slides out exactly like the sheets in
 * /app. It used to be its own panel that animated up with a class, had a
 * grabber that could not be grabbed, and vanished on the frame it closed.
 * The shared sheet renders on the body, above the editor's bottom nav, which
 * is deliberate: while the sheet is open the nav is not the thing being used.
 * It closes on Escape and keeps the page behind from scrolling under a drag
 * on its own.
 */

import * as React from "react"
import { Check, Copy, Download, ExternalLink, Globe, History, Loader2, RotateCcw, Rocket, X } from "lucide-react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
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

  const live = state.kind === "live"
  const busy = state.kind === "publishing"

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      label={siteName}
      hideFrom="md"
      className="border-t border-border bg-background"
      /* The name and the X drag the sheet like the grabber does. */
      header={
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <p className="truncate text-sm font-medium">{siteName}</p>
          <button
            type="button"
            /* The sheet closes itself, then the editor hears (A BUTTON INSIDE CAN CLOSE IT). */
            data-sheet-close=""
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-2 px-4 pb-1">
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
    </BottomSheet>
  )
}
