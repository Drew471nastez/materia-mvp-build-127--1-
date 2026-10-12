"use client"

import { useCallback, useEffect, useState } from "react"
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

export function BackupSettings({ ctx }: { ctx: SettingsContext }) {
  const [backups, setBackups] = useState<BackupRow[] | null>(() => lastBackups.get(ctx.installId) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [confirming, setConfirming] = useState<BackupRow | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (backups && !error) lastBackups.set(ctx.installId, backups)
  }, [backups, error, ctx.installId])

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
        <div
          className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] md:items-center md:p-4"
          onClick={() => !restoring && setConfirming(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={tt("Restore this backup")}
            onClick={(e) => e.stopPropagation()}
            className="wb-settings-in w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)] md:p-6"
          >
            <h2 className="text-[20px] font-semibold">{tt("Restore this backup?")}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/70">
              {tt("Your draft will be replaced with the website as it was on")} <span className="text-white">{backupWhen(confirming.created_at)}</span>.
            </p>
            <ul className="mt-4 space-y-2 text-[14px] text-white/70">
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                {tt("A backup of the draft you have now is saved first, so this can be undone.")}
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                {tt("Nothing changes on your live site until you publish.")}
              </li>
            </ul>
            <div className="mt-6 grid grid-cols-2 gap-2.5 md:flex md:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={restoring}
                className="h-11 rounded-xl px-4 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white active:bg-white/[0.06] md:h-10 md:text-[14px]"
              >
                {tt("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void restore(confirming)}
                disabled={restoring}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-60 md:h-10 md:text-[14px]"
              >
                {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
                {restoring ? tt("Restoring") : tt("Restore")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
