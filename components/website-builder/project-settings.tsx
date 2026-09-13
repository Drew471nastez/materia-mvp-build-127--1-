"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Check, Copy, ExternalLink, Globe, History, Loader2, Rocket, Settings, Sparkles, Upload } from "lucide-react"

import { relativeTime } from "@/components/website-builder/publish-panel"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PROJECT SETTINGS — A PAGE OVER THE BUILDER, NOT A DIALOG IN IT
 * ===========================================================================
 *
 * The reference is a whole screen: a nav down the left, one subject at a
 * time on the right, and "Back to project" as the only way out. That shape
 * says "you have stepped out of the editor to look at the project itself",
 * which is what settings are. A dialog would say "here is a small thing to
 * adjust before you carry on", which they are not.
 *
 * It is still the same page underneath — no navigation, no reload, the draft
 * in the editor untouched — so the address is left alone. Pushing
 * `?page=project` into history would give the browser's Back button a job
 * the screen's own Back already does, and two Backs that mean different
 * things is how somebody loses an edit.
 *
 * ONLY WHAT IS REAL IS SHOWN. The reference has Analytics, Knowledge,
 * Skills, Backups. A nav entry that opens an empty panel is a promise the
 * product cannot keep, so each section here is backed by something: the
 * name (PATCH exists), the address (it is what it is), publishing (status
 * and time are on the install), and backups (a table, two routes, and a
 * restore that takes a safety copy first).
 */

type Section = "general" | "domains" | "publishing" | "backups"

interface BackupRow {
  id: string
  label: string
  source: "ai" | "publish" | "manual" | "restore"
  created_at: string
}

/** "8 September 2026 at 09:57", in the reader's own locale and zone. */
function backupWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return `${date} at ${time}`
}

const SOURCE_WORD: Record<BackupRow["source"], string> = {
  ai: "Storelib AI",
  publish: "Published",
  manual: "Saved by you",
  restore: "Before a restore",
}

export function ProjectSettings({
  open,
  onClose,
  installId,
  name,
  onRenamed,
  websiteUrl,
  websiteUrlDisplay,
  live,
  publishedAt,
  onRestored,
}: {
  open: boolean
  onClose: () => void
  installId: string
  name: string
  onRenamed: (name: string) => void
  websiteUrl: string
  websiteUrlDisplay: string
  live: boolean
  publishedAt: string | null
  /** A backup has been written into the draft; the editor must reload it. */
  onRestored?: () => void
}) {
  const [section, setSection] = useState<Section>("general")
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(name)
      setError(null)
      setSaved(false)
    }
  }, [open, name])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  /**
   * =========================================================================
   *  BACKUPS
   * =========================================================================
   * Listed newest first, never with their contents: the list is a table of
   * moments, and the snapshot behind each is only read when one is restored.
   * Restoring asks first, because it replaces the draft; and it is never a
   * one-way door, because the route takes a safety copy of the draft it is
   * replacing before it writes. Nothing goes live until published.
   */
  const [backups, setBackups] = useState<BackupRow[] | null>(null)
  const [backupsError, setBackupsError] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [confirming, setConfirming] = useState<BackupRow | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadBackups = useCallback(async () => {
    setBackupsError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/backups`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not load backups")
      setBackups(json.backups ?? [])
    } catch (e: any) {
      setBackups([])
      setBackupsError(e?.message || "Could not load backups")
    }
  }, [installId])

  useEffect(() => {
    if (open && section === "backups" && backups === null) void loadBackups()
  }, [open, section, backups, loadBackups])

  const backUpNow = async () => {
    if (backingUp) return
    setBackingUp(true)
    setBackupsError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", label: "Manual backup" }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not save a backup")
      await loadBackups()
    } catch (e: any) {
      setBackupsError(e?.message || "Could not save a backup")
    } finally {
      setBackingUp(false)
    }
  }

  const restore = async (row: BackupRow) => {
    if (restoring) return
    setRestoring(true)
    setBackupsError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/backups/${row.id}/restore`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not restore this backup")
      setConfirming(null)
      onRestored?.()
    } catch (e: any) {
      setBackupsError(e?.message || "Could not restore this backup")
      setConfirming(null)
    } finally {
      setRestoring(false)
    }
  }

  if (!open) return null
  if (typeof document === "undefined") return null

  const dirty = draft.trim() !== name.trim() && draft.trim().length > 0

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not save the name")
      onRenamed(json?.install?.name ?? draft.trim())
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (e: any) {
      setError(e?.message || "Could not save the name")
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(websiteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* a clipboard that refuses is not worth an error */
    }
  }

  const NAV: { id: Section; label: string; Icon: typeof Settings }[] = [
    { id: "general", label: "General", Icon: Settings },
    { id: "domains", label: "Domains & Hosting", Icon: Globe },
    { id: "publishing", label: "Publishing", Icon: Rocket },
    { id: "backups", label: "Backups", Icon: History },
  ]

  const ago = relativeTime(publishedAt)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project settings"
      className="wb-settings-in fixed inset-0 z-[150] flex flex-col overflow-hidden bg-[#0f0f0f] text-white md:flex-row"
      /**
       * THE PHONE'S OWN FURNITURE IS NOT A SUGGESTION. This is pinned to the
       * viewport, and the viewport on a phone starts underneath the clock and
       * ends under the home indicator, so "Back to project" was printed on top
       * of the time and the last card sat under the bar at the bottom. The
       * insets are real numbers the device gives us; they are read once here
       * and the whole surface stands inside them.
       */
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <aside className="shrink-0 overflow-hidden border-b border-white/10 md:w-[280px] md:border-b-0 md:border-r">
        <div className="px-5 pt-5 md:px-6 md:pt-7">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg text-[15px] font-medium text-white/85 transition-colors hover:text-white active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to project
          </button>
        </div>
        <div className="mx-5 my-4 border-t border-white/10 md:mx-6 md:my-6" />
        <p className="hidden px-6 pb-2 text-[12px] font-medium uppercase tracking-wider text-white/40 md:block">
          Project Settings
        </p>
        {/* Horizontal on a phone, vertical on a desktop. A vertical nav in a
            390px column pushes the content off the screen. */}
        <nav className="wb-slim-scroll flex gap-1 overflow-x-auto px-5 pb-4 md:flex-col md:px-3 md:pb-0">
          {NAV.map(({ id, label, Icon }) => {
            const active = section === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors",
                  active ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <main className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 pb-16 pt-8 md:px-12 md:pb-14 md:pt-14">
          {section === "general" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Project General Settings</h1>

              <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <label htmlFor="wb-project-name" className="text-[17px] font-medium">
                  Project name
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    id="wb-project-name"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save()
                    }}
                    className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#171717] px-4 text-[15px] text-white outline-none transition-colors focus:border-white/30 md:w-[300px]"
                  />
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    className={cn(
                      "flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition-all",
                      dirty
                        ? "border-white/20 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                        : "border-white/10 text-white/40",
                      "disabled:cursor-default",
                    )}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                    {saving ? "Saving" : saved ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
              {error && <p className="mt-3 text-[14px] text-red-400">{error}</p>}

              <h2 className="mt-10 text-[17px] font-medium">Project</h2>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] text-white/70 md:p-6">
                <p>
                  This is one of your websites. Each has its own theme, pages and settings, and publishes to its own address.
                </p>
              </div>
            </>
          )}

          {section === "domains" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Domains & Hosting</h1>
              <h2 className="mt-8 text-[17px] font-medium">Website URL</h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 px-5 py-4">
                  <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{websiteUrlDisplay || "No address yet"}</span>
                  {websiteUrl && (
                    <>
                      <button
                        type="button"
                        onClick={copy}
                        className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Copy address"
                      >
                        {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                      </button>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Open the live site"
                      >
                        <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                      </a>
                    </>
                  )}
                </div>
                <div className="border-t border-white/10 px-5 py-4 text-[14px] text-white/60">
                  Hosted by Storelib. Custom domains are connected from your account's domain settings and apply to this
                  address.
                </div>
              </div>
            </>
          )}

          {section === "publishing" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Publishing</h1>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", live ? "bg-emerald-500" : "bg-white/30")} />
                  <p className="text-[17px] font-medium">{live ? "Live" : "Not published yet"}</p>
                </div>
                <p className="mt-2 text-[15px] text-white/60">
                  {live
                    ? ago
                      ? `Last published ${ago}.`
                      : "Published. The time will show once the next publish goes out."
                    : "Nobody can see this website until it is published from the editor."}
                </p>
              </div>
            </>
          )}

          {section === "backups" && (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Project Backups</h1>
                  <p className="mt-2 max-w-[560px] text-[15px] text-white/60">
                    Storelib saves a backup each time it completes a task and each time you publish. Load a backup to
                    put your project back to that point.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void backUpNow()}
                  disabled={backingUp}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.12] disabled:opacity-60"
                >
                  {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
                  Back up now
                </button>
              </div>

              {backupsError && (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">
                  {backupsError}
                </p>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                {backups === null ? (
                  <div className="flex items-center justify-center py-14 text-white/50">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : backups.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[15px] text-white/50">
                    No backups yet. One is saved the next time Storelib AI finishes a task or you publish, or press
                    Back up now.
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.07]">
                    {backups.map((b) => (
                      <li key={b.id} className="flex items-center gap-4 px-5 py-4">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            b.source === "publish"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : b.source === "ai"
                                ? "bg-[#8B56FA]/20 text-[#c7b0ff]"
                                : "bg-white/[0.08] text-white/70",
                          )}
                          aria-hidden
                        >
                          {b.source === "publish" ? (
                            <Rocket className="h-4 w-4" strokeWidth={1.75} />
                          ) : b.source === "ai" ? (
                            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                          ) : (
                            <History className="h-4 w-4" strokeWidth={1.75} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{b.label}</p>
                          <p className="mt-0.5 text-[13px] text-white/50">
                            {backupWhen(b.created_at)}
                            <span className="text-white/30"> · </span>
                            {SOURCE_WORD[b.source]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirming(b)}
                          className="h-9 shrink-0 rounded-lg border border-white/15 px-4 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.1]"
                        >
                          Load
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-3 text-[13px] text-white/40">
                The newest 30 backups are kept. A backup identical to the one before it is not saved twice.
              </p>
            </>
          )}
        </div>
      </main>

      {/* The question before a restore. It says what will happen and what
          will not, which is the whole reason it is asked. */}
      {confirming && (
        <div
          className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 p-4 backdrop-blur-[2px] md:items-center"
          onClick={() => !restoring && setConfirming(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Restore this backup"
            onClick={(e) => e.stopPropagation()}
            className="wb-settings-in w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)]"
          >
            <h2 className="text-[20px] font-semibold">Restore this backup?</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/70">
              Your draft will be replaced with the project as it was on{" "}
              <span className="text-white">{backupWhen(confirming.created_at)}</span>.
            </p>
            <ul className="mt-4 space-y-2 text-[14px] text-white/70">
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                A backup of the draft you have now is saved first, so this can be undone.
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                Nothing changes on your live site until you publish.
              </li>
            </ul>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={restoring}
                className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void restore(confirming)}
                disabled={restoring}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#8B56FA] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#7b46ec] disabled:opacity-60"
              >
                {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
                {restoring ? "Restoring" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
