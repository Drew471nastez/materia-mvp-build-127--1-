"use client"

/**
 * Every version this site has had, and a way back to any of them.
 *
 * Snapshots have been taken before every agent run since the agent existed,
 * and until now the only way to reach one was the Undo button on the exchange
 * that made it — which disappears the moment the page reloads. A recovery
 * mechanism you can only use in the same browser session is not one.
 *
 * The bodies are not fetched with the list. A version is a whole project and a
 * busy site has fifty, so a sidebar that carried them would be megabytes to
 * render a list of dates.
 */

import * as React from "react"
import { History, Loader2, RotateCcw, X } from "lucide-react"

interface Version {
  id: string
  label: string | null
  created_at: string
}

function when(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function HistoryPanel({
  siteId,
  open,
  onClose,
  onRestored,
}: {
  siteId: string
  open: boolean
  onClose: () => void
  onRestored: (paths: string[]) => void
}) {
  const [versions, setVersions] = React.useState<Version[] | null>(null)
  const [restoring, setRestoring] = React.useState<string | null>(null)

  // Fetched when it opens, not on mount: most sessions never open this, and
  // the list is stale the moment another run finishes anyway.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const response = await fetch(`/api/sites/${siteId}/versions`)
      if (!response.ok || cancelled) return
      const body = (await response.json()) as { versions?: Version[] }
      if (!cancelled) setVersions(body.versions ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, siteId])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const restore = async (versionId: string) => {
    setRestoring(versionId)
    try {
      const response = await fetch(`/api/sites/${siteId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      })
      if (!response.ok) return
      const body = (await response.json()) as { paths?: string[] }
      onRestored(body.paths ?? [])
      onClose()
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Version history">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />

      <div className="absolute inset-y-0 right-0 flex w-full max-w-[340px] flex-col border-l border-border bg-background">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-muted-foreground" />
            History
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {versions === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </p>
          ) : versions.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No versions yet. One is saved automatically before every AI edit, so you can always get
              back to what you had.
            </p>
          ) : (
            <ul className="space-y-1">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="group flex items-start gap-2 rounded-[9px] border border-transparent p-2.5 hover:border-border"
                >
                  <div className="min-w-0 flex-1">
                    {/* The label is the prompt that triggered the snapshot —
                        far more useful for finding a version than a timestamp. */}
                    <p className="truncate text-xs text-foreground">{version.label || "Before an edit"}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{when(version.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={restoring !== null}
                    onClick={() => void restore(version.id)}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {restoring === version.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
