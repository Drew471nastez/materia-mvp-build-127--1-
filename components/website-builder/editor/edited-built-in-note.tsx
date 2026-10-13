"use client"

/**
 * ===========================================================================
 *  A BUILT-IN SECTION THIS SITE HAS ITS OWN COPY OF
 * ===========================================================================
 * A built-in section edited in the linked GitHub repository (or in the code
 * editor) is kept as this site's own copy, drawn here and on the live site,
 * never changing the built-in for anyone else (lib/agent-access/protected.ts,
 * repoMayWrite). The section's panel says so in one line, and offers the way
 * back: Reset to Storelib's version, which deletes the copy and puts
 * Storelib's text back in the repository (the GitHub route's reset-override).
 *
 * Shown only for a Storelib theme, only when this site has a saved file at a
 * built-in's path. Where the copy came from is asked once, from the same
 * GitHub answer Connections reads; without a linked repository it is the
 * code editor's, and the code editor's Revert is the way back.
 */
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { tt } from "@/lib/i18n/text"

/** Whether a section type is a built-in this site has its own copy of. Pure, tested as words. */
export function isEditedBuiltIn(
  type: string,
  sources: Record<string, string>,
  builtIns: { defaults: Record<string, string>; drawnByStorelib: (type: string) => boolean },
): boolean {
  const path = `sections/${type}.storelib`
  const own = sources[path]
  if (typeof own !== "string" || own.trim() === "") return false
  if (path in builtIns.defaults) return own !== builtIns.defaults[path]
  return builtIns.drawnByStorelib(type)
}

export function EditedBuiltInNote({ installId, type, onReset }: { installId: string; type: string; onReset: () => void }) {
  const path = `sections/${type}.storelib`
  const [from, setFrom] = useState<"github" | "builder" | null>(null)
  const [canReset, setCanReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/github`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { overrides?: { path: string; from: "github" | "builder" }[] } | null) => {
        if (!live) return
        const o = d?.overrides?.find((x) => x.path === path)
        setFrom(o?.from ?? "builder")
        setCanReset(!!o)
      })
      .catch(() => live && setFrom("builder"))
    return () => {
      live = false
    }
  }, [installId, path])

  const reset = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-override", path }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(d.error || tt("Could not reset it just now. Try again."))
      onReset()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not reset it just now. Try again."))
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  if (from === null) return null
  return (
    <div className="mx-4 mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12.5px] leading-snug">
      <p>
        <span className="font-medium text-foreground">{from === "github" ? tt("Edited in GitHub") : tt("Edited in the code editor")}</span>
        <span className="text-muted-foreground"> · {tt("This site uses its own copy of this built-in section. Other sites keep Storelib's.")}</span>
      </p>
      {canReset && (
        <div className="mt-1.5 flex items-center gap-3">
          {confirm ? (
            <>
              <span className="text-muted-foreground">{tt("Go back to Storelib's version?")}</span>
              <button type="button" onClick={() => setConfirm(false)} className="min-h-[32px] text-muted-foreground hover:text-foreground">{tt("Keep")}</button>
              <button type="button" disabled={busy} onClick={() => void reset()} className="min-h-[32px] font-medium text-red-600 hover:text-red-700 dark:text-red-400">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tt("Reset")}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="min-h-[32px] font-medium text-foreground underline underline-offset-2">
              {tt("Reset to Storelib's version")}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
