"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { Card, ErrorNote, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

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

/** A published version (lib/website-builder/site-releases.ts ReleaseListItem). */
interface ReleaseRow {
  id: string
  createdAt: string
  restored: boolean
  live: boolean
}

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
/** Published versions, the same way. Null: not loaded yet, or not set up (SQL part 186), and the card is not drawn. */
const lastReleases = new Map<string, ReleaseRow[]>()

export function BackupSettings({ ctx }: { ctx: SettingsContext }) {
  const [backups, setBackups] = useState<BackupRow[] | null>(() => lastBackups.get(ctx.installId) ?? null)
  const [releases, setReleases] = useState<ReleaseRow[] | null>(() => lastReleases.get(ctx.installId) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [confirming, setConfirming] = useState<BackupRow | null>(null)
  const [confirmingRelease, setConfirmingRelease] = useState<ReleaseRow | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
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

  const restoreRelease = async (row: ReleaseRow) => {
    if (restoring) return
    setRestoring(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/releases/${row.id}/restore`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not restore this version"))
      setConfirmingRelease(null)
      ctx.onRestored?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not restore this version"))
      setConfirmingRelease(null)
    } finally {
      setRestoring(false)
    }
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

  const backUpNow = async () => {
    if (backingUp) return
    setBackingUp(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", label: tt("Manual backup") }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not save a backup"))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not save a backup"))
    } finally {
      setBackingUp(false)
    }
  }

  const restore = async (row: BackupRow) => {
    if (restoring) return
    setRestoring(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/backups/${row.id}/restore`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not restore this backup"))
      setConfirming(null)
      ctx.onRestored?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not restore this backup"))
      setConfirming(null)
    } finally {
      setRestoring(false)
    }
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
      <Lead>
        {tt("A backup is saved automatically each time Storelib AI finishes a task and each time you publish. Restore one to put your draft back to that moment.")}
      </Lead>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card title={tt("Restore points")} footer={tt("The newest 30 are kept. A backup identical to the one before it is not saved twice.")}>
        {backups === null ? (
          <div className="flex items-center justify-center py-12 text-white/45">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14.5px] text-white/50 md:px-6">{tt("No backups yet.")}</p>
        ) : (
          backups.map((b) => (
            <Row key={b.id} label={b.label} hint={`${backupWhen(b.created_at)} · ${SOURCE_WORD[b.source]}`} inline>
              <button type="button" onClick={() => setConfirming(b)} className={buttonClass}>
                {tt("Restore")}
              </button>
            </Row>
          ))
        )}
      </Card>

      {/* Every publish, kept whole (SQL parts 180 and 186). Not drawn until
          the database has them, so nothing is offered that cannot happen. */}
      {releases && (
        <Card title={tt("Published versions")} footer={tt("The newest 20 are kept.")}>
          {releases.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14.5px] text-white/50 md:px-6">{tt("No published versions yet.")}</p>
          ) : (
            releases.map((r) => (
              <Row
                key={r.id}
                label={backupWhen(r.createdAt)}
                hint={r.live ? tt("Live now") : r.restored ? tt("Restored from an earlier version") : tt("Published")}
                inline
              >
                {!r.live && (
                  <button type="button" onClick={() => setConfirmingRelease(r)} className={buttonClass}>
                    {tt("Restore this version")}
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
          onCancel={() => setConfirming(null)}
          onConfirm={() => void restore(confirming)}
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
          onCancel={() => setConfirmingRelease(null)}
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

/** The sheet both restores ask in: a bottom sheet on a phone, a dialog above it. */
function ConfirmRestore({
  title,
  label,
  lead,
  points,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string
  label: string
  lead: ReactNode
  points: string[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] md:items-center md:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="wb-settings-in w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)] md:p-6"
      >
        <h2 className="text-[20px] font-semibold">{title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-white/70">{lead}</p>
        <ul className="mt-4 space-y-2 text-[14px] text-white/70">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-2.5 md:flex md:justify-end">
          <button
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
