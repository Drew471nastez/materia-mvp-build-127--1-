"use client"

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { settleRestore } from "@/lib/website-builder/restore-request"
import type { BackupPreview } from "@/lib/website-builder/backup-preview"
import { cn } from "@/lib/utils"

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
  const date = d.toLocaleDateString(appLocale(), zoned({ day: "numeric", month: "long", year: "numeric" }))
  const time = d.toLocaleTimeString(appLocale(), zoned({ hour: "2-digit", minute: "2-digit" }))
  return tt("{date} at {time}", { date, time })
}

/**
 * A published version's moment in two parts, the way a restore point reads:
 * the day as the row's name, the time in the line under it. A whole
 * "22 September 2026 at 09:30" beside Restore wraps on a phone.
 */
function releaseDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(appLocale(), zoned({ day: "numeric", month: "long", year: "numeric" }))
}
function releaseTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(appLocale(), zoned({ hour: "2-digit", minute: "2-digit" }))
}

/** A published version (lib/website-builder/site-releases.ts ReleaseListItem). */
interface ReleaseRow {
  id: string
  createdAt: string
  restored: boolean
  live: boolean
}

type PreviewState = { id: string; state: "loading" } | { id: string; state: "ready"; preview: BackupPreview } | { id: string; state: "error"; error: string }

const SOURCE_WORD: Record<BackupRow["source"], string> = {
  get ai() { return tt("After a Storelib AI task") },
  get publish() { return tt("When you published") },
  get manual() { return tt("Saved by you") },
  get restore() { return tt("Before a restore") },
}

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
/**
 * The list last read for each website, so coming back to this subject draws
 * it at once and reads it again quietly, rather than a spinner that the list
 * then pushes the rest of the page down from.
 */
const lastBackups = new Map<string, BackupRow[]>()
/** Published versions, the same way. Null: not loaded yet, or not set up (SQL part 188), and the card is not drawn. */
const lastReleases = new Map<string, ReleaseRow[]>()

export function BackupSettings({ ctx }: { ctx: SettingsContext }) {
  const [backups, setBackups] = useState<BackupRow[] | null>(() => lastBackups.get(ctx.installId) ?? null)
  const [releases, setReleases] = useState<ReleaseRow[] | null>(() => lastReleases.get(ctx.installId) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [confirming, setConfirming] = useState<BackupRow | null>(null)
  const [confirmingRelease, setConfirmingRelease] = useState<ReleaseRow | null>(null)
  const [restoring, setRestoring] = useState(false)
  /* The same, read at once: two presses in one frame both see the state
     from before either, and each would post a restore. */
  const restoringNow = useRef(false)
  /* Why the last restore failed, said inside the question that asked it. */
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  /* What Back up now did: a new restore point, or nothing because nothing changed since the last. */
  const [backedUp, setBackedUp] = useState<null | { id: string; skipped: boolean }>(null)
  /* The open backup's preview: what restoring it would change (lib/website-builder/backup-preview.ts). */
  const [preview, setPreview] = useState<PreviewState | null>(null)
  useEffect(() => {
    if (backups && !error) lastBackups.set(ctx.installId, backups)
  }, [backups, error, ctx.installId])
  useEffect(() => {
    if (releases) lastReleases.set(ctx.installId, releases)
    else lastReleases.delete(ctx.installId)
  }, [releases, ctx.installId])

  /* Hidden, not an error, when the database is not ready for it: the route answers `available: false`. */
  const loadReleases = useCallback(async () => {
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/releases`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not load published versions"))
      setReleases(json.available ? ((json.releases ?? []) as ReleaseRow[]) : null)
    } catch (e) {
      setReleases(null)
      setError(e instanceof Error ? e.message : tt("Could not load published versions"))
    }
  }, [ctx.installId])

  useEffect(() => {
    void loadReleases()
  }, [loadReleases])

  /**
   * One restore at a time, either kind: true when it is done. A refusal
   * leaves the question open with the reason, so it can be tried again or
   * cancelled where it was asked.
   */
  const runRestore = (url: string, fallback: string) =>
    settleRestore({
      url,
      fallback,
      busy: restoringNow,
      setBusy: setRestoring,
      setError: setRestoreError,
      hold: ctx.onHoldDraft,
      words: {
        timeout: tt("This is taking too long, so Storelib stopped waiting. Your draft was backed up first. Reload the builder to see where it stands."),
        offline: tt("Storelib could not be reached. Nothing was restored. Check your connection and try again."),
        unsaved: tt("Your latest edits could not be saved yet, so nothing was restored. Try again in a moment."),
      },
    })

  const restoreRelease = async (row: ReleaseRow) => {
    if (!(await runRestore(`/api/website-builder/themes/${ctx.installId}/releases/${row.id}/restore`, tt("Could not restore this version")))) return
    setConfirmingRelease(null)
    ctx.onRestored?.()
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/backups`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not load backups"))
      setBackups(json.backups ?? [])
    } catch (e) {
      setBackups([])
      setError(e instanceof Error ? e.message : tt("Could not load backups"))
    }
  }, [ctx.installId])

  useEffect(() => {
    void load()
  }, [load])

  /*
    BACK UP NOW, OF WHAT IS ON SCREEN (round 51). The backup is read from the
    database, so an edit still waiting for autosave was not in it: the
    editor's draft is saved and held first (onHoldDraft, as a restore does),
    then let go. And the answer is said: a backup identical to the last one
    is not saved twice (lib/website-builder/backups.ts), which used to look
    like a button that did nothing.
  */
  const backUpNow = async () => {
    if (backingUp) return
    setBackingUp(true)
    setError(null)
    setBackedUp(null)
    let held = false
    try {
      if (ctx.onHoldDraft) {
        held = true
        if (!(await ctx.onHoldDraft(true))) throw new Error(tt("Your latest edits could not be saved yet. Try again in a moment."))
      }
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", label: tt("Manual backup") }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not save a backup"))
      await load()
      if (json?.backup?.id) setBackedUp({ id: String(json.backup.id), skipped: json.skipped === true })
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not save a backup"))
    } finally {
      if (held) await Promise.resolve(ctx.onHoldDraft?.(false)).catch(() => {})
      setBackingUp(false)
    }
  }

  /* Opening a backup reads what restoring it would change; nothing is written. */
  const openBackup = (row: BackupRow) => {
    setConfirming(row)
    setRestoreError(null)
    setPreview({ id: row.id, state: "loading" })
    void fetch(`/api/website-builder/themes/${ctx.installId}/backups/${row.id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.preview) throw new Error(json?.error || tt("Could not load this backup"))
        setPreview((p) => (p && p.id === row.id ? { id: row.id, state: "ready", preview: json.preview as BackupPreview } : p))
      })
      .catch((e: unknown) => setPreview((p) => (p && p.id === row.id ? { id: row.id, state: "error", error: e instanceof Error ? e.message : tt("Could not load this backup") } : p)))
  }

  const restore = async (row: BackupRow) => {
    if (!(await runRestore(`/api/website-builder/themes/${ctx.installId}/backups/${row.id}/restore`, tt("Could not restore this backup")))) return
    setConfirming(null)
    /* The editor reloads to pick up the restored draft; anywhere else, the list shows the new safety copy. */
    if (ctx.onRestored) ctx.onRestored()
    else void load()
  }

  /* A copy is a new draft in the library, and the library's limit applies:
     the route answers with the reason when it is full. */
  const duplicate = async () => {
    if (copying) return
    setCopying(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not duplicate this website"))
      setCopied(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not duplicate this website"))
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <PageTitle
        aside={
          <button type="button" onClick={() => void backUpNow()} disabled={backingUp} className={buttonClass}>
            {backingUp && <Loader2 className="h-4 w-4 animate-spin" />}
            {tt("Back up now")}
          </button>
        }
      >
        {tt("Backups & Versions")}
      </PageTitle>
      <Lead>{tt("Saved each time you publish and after each Storelib AI task.")}</Lead>

      {error && <ErrorNote>{error}</ErrorNote>}
      {backedUp && !error && (
        <p role="status" className="mb-3 text-[13.5px] text-white/60" data-backup-result={backedUp.skipped ? "same" : "new"}>
          {backedUp.skipped ? tt("Nothing changed since the last backup.") : tt("Backed up.")}
        </p>
      )}

      <Card title={tt("Restore points")} footer={tt("The newest 30 are kept. A backup identical to the one before it is not saved twice.")}>
        {backups === null ? (
          <div className="flex items-center justify-center py-12 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14.5px] text-white/50 md:px-6">{tt("No backups yet.")}</p>
        ) : (
          backups.map((b) => (
            <div key={b.id} data-backup-row={b.id} className={cn("transition-colors duration-700", backedUp?.id === b.id && "bg-white/[0.04]")}>
              <Row label={b.label} hint={`${backupWhen(b.created_at)} · ${SOURCE_WORD[b.source]}`} inline>
                <button type="button" onClick={() => openBackup(b)} className={buttonClass} data-backup-open="">
                  {tt("Preview")}
                </button>
              </Row>
            </div>
          ))
        )}
      </Card>

      {/* Every publish, kept whole (SQL parts 180 and 188). Not drawn until
          the database has them, so nothing is offered that cannot happen. */}
      {releases && (
        <Card title={tt("Published versions")} footer={tt("The newest 20 are kept.")}>
          {releases.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14.5px] text-white/50 md:px-6">{tt("No published versions yet.")}</p>
          ) : (
            /* The live one is marked where the others have Restore, the way
               Publishing marks a live website, and the button says Restore
               as the one above does: "Restore this version" pushed the
               date onto two lines on a phone. */
            releases.map((r) => (
              <Row
                key={r.id}
                label={releaseDay(r.createdAt)}
                hint={`${releaseTime(r.createdAt)} · ${r.restored ? tt("Restored from an earlier version") : tt("Published")}`}
                inline
              >
                {r.live && <Badge tone="live">{tt("Live now")}</Badge>}
                {!r.live && (
                  <button type="button" onClick={() => setConfirmingRelease(r)} className={buttonClass}>
                    {tt("Restore")}
                  </button>
                )}
              </Row>
            ))
          )}
        </Card>
      )}

      <Card title={tt("Duplicate")}>
        <Row label={tt("Copy this website")} hint={copied ? tt("Copied. The copy is a draft in your library.") : tt("Makes a draft copy with the same pages, sections and settings.")} inline>
          <button type="button" onClick={() => void duplicate()} disabled={copying || copied} className={buttonClass}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : null}
            {copied ? tt("Copied") : tt("Duplicate")}
          </button>
        </Row>
      </Card>

      {/* The question before a restore. It says what will happen and what
          will not, which is the whole reason it is asked. */}
      {confirming && (
        <ConfirmRestore
          title={tt("Restore this backup?")}
          label={tt("Restore this backup")}
          busy={restoring}
          error={restoreError}
          onCancel={() => {
            setConfirming(null)
            setRestoreError(null)
            setPreview(null)
          }}
          onConfirm={() => void restore(confirming)}
          preview={<BackupChanges preview={preview && preview.id === confirming.id ? preview : null} pages={ctx.pages} />}
          lead={
            <>
              {tt("Your draft will be replaced with the website as it was on")} <span className="text-white">{backupWhen(confirming.created_at)}</span>.
            </>
          }
          points={[tt("A backup of the draft you have now is saved first, so this can be undone."), tt("Nothing changes on your live site until you publish.")]}
        />
      )}
      {/* A published version goes live at once, so the question says so, and
          that the draft is replaced (and backed up first, by the route). */}
      {confirmingRelease && (
        <ConfirmRestore
          title={tt("Restore this version?")}
          label={tt("Restore this version")}
          busy={restoring}
          error={restoreError}
          onCancel={() => {
            setConfirmingRelease(null)
            setRestoreError(null)
          }}
          onConfirm={() => void restoreRelease(confirmingRelease)}
          lead={
            <>
              {tt("Your website goes back to the version published on")} <span className="text-white">{backupWhen(confirmingRelease.createdAt)}</span>.
            </>
          }
          points={[tt("Your current draft will be replaced. A backup of it is saved first."), tt("This version goes live right away.")]}
        />
      )}
    </>
  )
}

/**
 * The sheet both restores ask in: a bottom sheet on a phone, a dialog above
 * it. It takes focus on Cancel (the answer that changes nothing), keeps Tab
 * between its buttons, and gives focus back to the Restore that opened it.
 * Its Escape is caught before Website Settings' own, which would otherwise
 * close the whole page behind the question. While a restore is under way
 * nothing closes it. A refusal is said inside it, where the eye already is.
 */
function ConfirmRestore({
  title,
  label,
  lead,
  preview,
  points,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  label: string
  lead: ReactNode
  /** What restoring would change, under the lead (a backup's preview). */
  preview?: ReactNode
  points: string[]
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const latest = useRef({ busy, onCancel })
  useEffect(() => {
    latest.current = { busy, onCancel }
  })
  /* A large website takes a while: said once it has, so a long wait does not look like a stuck one. */
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!busy) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(t)
  }, [busy])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        if (!latest.current.busy) latest.current.onCancel()
        return
      }
      const box = panel.current
      if (e.key !== "Tab" || !box) return
      const stops = [...box.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
      const at = document.activeElement
      if (stops.length === 0) {
        e.preventDefault()
      } else if (!box.contains(at) || (e.shiftKey && at === stops[0])) {
        e.preventDefault()
        stops[e.shiftKey ? stops.length - 1 : 0].focus()
      } else if (!e.shiftKey && at === stops[stops.length - 1]) {
        e.preventDefault()
        stops[0].focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] md:items-center md:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={`${id}-lead`}
        onClick={(e) => e.stopPropagation()}
        className="wb-settings-in w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)] md:p-6"
      >
        <h2 className="text-[20px] font-semibold">{title}</h2>
        <p id={`${id}-lead`} className="mt-2 text-[15px] leading-relaxed text-white/70">{lead}</p>
        {preview}
        <ul className="mt-4 space-y-2 text-[14px] text-white/70">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
              {point}
            </li>
          ))}
        </ul>
        {busy && slow && !error && (
          <p role="status" className="mt-4 text-[14px] text-white/60">{tt("Still restoring. A large website can take a minute.")}</p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[14px] leading-snug text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2.5 md:flex md:justify-end">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 rounded-xl px-4 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white active:bg-white/[0.06] md:h-10 md:text-[14px]"
          >
            {tt("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-60 md:h-10 md:text-[14px]"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? tt("Restoring") : tt("Restore")}
          </button>
        </div>
      </div>
    </div>
  )
}

const CHANGE_WORD: Record<"changed" | "comes back" | "same" | "stays", () => string> = {
  changed: () => tt("Put back"),
  "comes back": () => tt("Comes back"),
  same: () => tt("No change"),
  stays: () => tt("Kept as it is"),
}

/**
 * THE PREVIEW (round 51): page by page, what Restore would do to the draft,
 * read from the server (lib/website-builder/backup-preview.ts). Its box
 * keeps a minimum height while it loads, so the sheet does not jump when
 * the answer comes in.
 */
function BackupChanges({ preview, pages }: { preview: PreviewState | null; pages: SettingsContext["pages"] }) {
  const nameOf = (key: string) => pages.find((p) => p.key === key)?.name ?? (key === "home" ? tt("Home") : key.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()))
  return (
    <div className="mt-4 min-h-[88px] rounded-xl border border-white/10 bg-white/[0.03]" data-backup-preview={preview?.state ?? "none"}>
      {!preview || preview.state === "loading" ? (
        <div className="flex h-[88px] items-center justify-center text-white/50" role="status" aria-label={tt("Loading")}>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : preview.state === "error" ? (
        <p className="px-3.5 py-3 text-[13.5px] text-red-300">{preview.error}</p>
      ) : preview.preview.same ? (
        <p className="px-3.5 py-3 text-[14px] text-white/70">{tt("This is the same as your draft. Restoring changes nothing.")}</p>
      ) : (
        <ul className="max-h-[220px] divide-y divide-white/[0.06] overflow-y-auto overscroll-contain">
          {preview.preview.pages.map((p) => (
            <li key={p.key} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]" data-backup-page={p.key} data-change={p.change}>
              <span className="min-w-0 flex-1 truncate text-white">{nameOf(p.key)}</span>
              <span className="shrink-0 text-[12.5px] text-white/50">{tt("{count, plural, one {# section} other {# sections}}", { count: p.sections })}</span>
              <span className={cn("w-[96px] shrink-0 text-right text-[12.5px]", p.change === "changed" || p.change === "comes back" ? "text-amber-200" : "text-white/40")}>{CHANGE_WORD[p.change]()}</span>
            </li>
          ))}
          {preview.preview.settingsChanged > 0 && (
            <li className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]" data-backup-settings={preview.preview.settingsChanged}>
              <span className="min-w-0 flex-1 truncate text-white">{tt("Theme settings")}</span>
              <span className="shrink-0 text-[12.5px] text-amber-200">{tt("{count, plural, one {# setting put back} other {# settings put back}}", { count: preview.preview.settingsChanged })}</span>
            </li>
          )}
          {preview.preview.filesChanged > 0 && (
            <li className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]" data-backup-files={preview.preview.filesChanged}>
              <span className="min-w-0 flex-1 truncate text-white">{tt("Code")}</span>
              <span className="shrink-0 text-[12.5px] text-amber-200">{tt("{count, plural, one {# file put back} other {# files put back}}", { count: preview.preview.filesChanged })}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
